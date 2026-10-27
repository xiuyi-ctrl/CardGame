import { describe, expect, it } from 'vitest';
import { applyFear, createBattle, makeUnit, playerEndTurn, playerSkill, playerTame, selectEnemyAction, useBattleItem } from '../src/game/core/battle';
import { SKILLS } from '../src/game/data/skills';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { generateMap } from '../src/game/state/game';
import { parseDualSave } from '../src/ui/persistence';

function immuneFight(skill = 'punch') {
  const actor = { ...makeUnit('momo', true, 0, false), skills: [skill], passive: undefined, spd: 20 };
  const b = createBattle([actor], [{ speciesId: 'momo' }], 41, { corruptDebuff: 'immune' });
  b.enemyUnits[0] = { ...b.enemyUnits[0], hp: 100, maxHp: 100, skills: ['punch'], passive: undefined, acted: true };
  return b;
}
function attack(skill: string) {
  const b = immuneFight(skill);
  return playerEndTurn(playerSkill(b, b.playerUnits[0].uid, skill, b.enemyUnits[0].uid));
}

describe('第四种侵蚀：敌人免疫负面效果', () => {
  it.each(['burn', 'poison', 'atkDown', 'spdDown', 'stun', 'thorns', 'skillSeal', 'shadowMark', 'fear'] as const)('阻止技能附加%s', kind => {
    const skill = Object.values(SKILLS).find(skill => skill.effects?.some(effect => effect.kind === kind) && (skill.target === 'single' || skill.target === 'all'))!;
    expect(skill).toBeTruthy();
    const after = attack(skill.id);
    expect(after.enemyUnits[0].statuses).toEqual([]);
    expect(after.log.some(entry => entry.text.includes('免疫负面效果'))).toBe(true);
  });
  it.each(['burn_brand', 'time_lag'])('阻止独立机制%s及其后续触发', skill => {
    const after = attack(skill);
    expect(after.enemyUnits[0].statuses).toEqual([]);
    expect(after.enemyUnits[0].hp).toBe(100);
  });
  it('恐惧直接入口不累积，也不触发震慑', () => {
    const b = immuneFight();
    const after = applyFear(b, b.enemyUnits[0], 20);
    expect(after.enemyUnits[0].statuses).toEqual([]);
    expect(after.log.some(entry => entry.text.includes('恐惧震慑'))).toBe(false);
  });
  it('普通伤害与护盾正常，增益不被免疫吞掉', () => {
    const b = immuneFight(); b.enemyUnits[0].shield = 4;
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid));
    expect(after.enemyUnits[0].hp).toBe(99); expect(after.enemyUnits[0].shield).toBe(0);
    const enemy = immuneFight(); enemy.playerUnits[0].skills = []; enemy.enemyUnits[0].acted = false;
    enemy.enemyUnits[0].skills = ['roar'];
    const buffed = playerEndTurn(enemy);
    expect(buffed.enemyUnits[0].statuses.some(s => s.kind === 'atkUp')).toBe(true);
  });
  it('被动上毒也被免疫，火狐不因无效灼烧获得狐火', () => {
    const b = immuneFight(); b.playerUnits[0].passive = 'venom_fang';
    const poisoned = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid));
    expect(poisoned.enemyUnits[0].statuses).toEqual([]);
    const fox = immuneFight('ember'); fox.enemyUnits[0].passive = 'fox_flame_body';
    const after = playerEndTurn(playerSkill(fox, fox.playerUnits[0].uid, 'ember', fox.enemyUnits[0].uid));
    expect(after.enemyUnits[0].statuses.some(s => s.kind === 'foxFire' || s.kind === 'burn')).toBe(false);
  });
  it('我方仍可受到负面效果，普通战与下一场不会继承免疫', () => {
    const b = immuneFight(); b.playerUnits[0].skills = []; b.enemyUnits[0].skills = ['ember']; b.enemyUnits[0].acted = false;
    const after = playerEndTurn(b);
    expect(after.playerUnits[0].statuses.some(s => s.kind === 'burn')).toBe(true);
    const next = createBattle(after.playerUnits, [{ speciesId: 'momo' }], 2);
    expect(next.playerUnits[0].debuffImmune).toBeUndefined(); expect(next.enemyUnits[0].debuffImmune).toBeUndefined();
  });
  it('无效虚弱/缓速药水不扣物品，腐蚀的直接扣血仍生效', () => {
    const b = immuneFight(), uid = b.enemyUnits[0].uid;
    for (const id of ['atk_down', 'spd_down']) {
      const after = useBattleItem(b, id, uid);
      expect(after.rngCount).toBe(b.rngCount); expect(after.enemyUnits[0].battleBuffs).toBeUndefined();
      const state = { ...createInitialState(), screen: 'battle' as const, battle: b, inventory: { [id]: 2 } };
      expect(gameReducer(state, { type: 'USE_BATTLE_ITEM', itemId: id, targetUid: uid }).inventory[id]).toBe(2);
    }
    expect(useBattleItem(b, 'hp_down', uid).enemyUnits[0].hp).toBe(70);
  });
  it('读档保持免疫，捕捉所得生物不携带免疫', () => {
    const b = immuneFight(); b.enemyUnits[0].hp = 1;
    const loaded = parseDualSave(JSON.stringify({ ...createInitialState(), screen: 'battle', battle: b }))!.main!.battle!;
    expect(loaded.corruptDebuff).toBe('immune');
    const caught = playerTame(loaded, 'berry', loaded.enemyUnits[0].uid);
    expect(caught.pendingTame[0].debuffImmune).toBeUndefined();
  });
  it('四种侵蚀都可由地图生成，第四种可经布阵传入战斗', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 120; seed++) for (const row of generateMap(seed, 2).layers) for (const node of row)
      if (node.type === 'corrupted') seen.add(node.corruptDebuff!);
    expect([...seen].sort()).toEqual(['burn', 'dmg', 'immune', 'spd']);
    const run = gameReducer(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'kiki', seed: 4 });
    const map = { ...run.map, layers: [[{ id: 'immune', type: 'corrupted' as const, label: '被侵蚀', col: 0, corruptDebuff: 'immune' as const }]], encounter: { immune: [{ speciesId: 'momo' }] } };
    const formation = gameReducer({ ...run, screen: 'map', map }, { type: 'MOVE', nodeId: 'immune' });
    const battle = gameReducer(formation, { type: 'FORMATION_CONFIRM', units: run.roster.slice(0, 1) });
    expect(battle.battle!.corruptDebuff).toBe('immune'); expect(battle.battle!.enemyUnits[0].debuffImmune).toBe(true);
  });
});

function targeting() {
  const players = [0, 1, 2].map(col => ({ ...makeUnit('momo', true, col as 0 | 1 | 2, false), hp: col === 0 ? 2 : 30, maxHp: 30, passive: undefined, skills: [], row: 'front' as const }));
  const b = createBattle(players, [{ speciesId: 'momo' }, { speciesId: 'momo' }, { speciesId: 'momo' }], 1);
  b.enemyUnits = b.enemyUnits.map(u => ({ ...u, skills: ['punch'], passive: undefined }));
  return b;
}
describe('敌人目标分散', () => {
  it.each([1, 2, 3])('第%d幕不锁死可斩杀残血目标，仍保留适度偏好', act => {
    const b = targeting(); b.act = act;
    const counts = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      const c = selectEnemyAction(b, b.enemyUnits[0], (i + .5) / 1000, .5)!;
      counts.set(c.targetUid!, (counts.get(c.targetUid!) ?? 0) + 1);
    }
    expect(counts.size).toBe(3);
    const low = counts.get(b.playerUnits[0].uid)!;
    expect(low).toBeGreaterThan(350); expect(low).toBeLessThan(500);
  });
  it('前一名敌人已选该目标后，后续敌人对它的选取比例下降', () => {
    const b = targeting(), target = b.playerUnits[0].uid;
    const reserved = { ...b, orders: { [b.enemyUnits[0].uid]: { skillId: 'punch', targetUid: target } } };
    const count = (state: typeof b) => Array.from({ length: 500 }, (_, i) => selectEnemyAction(state, state.enemyUnits[1], (i + .5) / 500, .5)).filter(c => c?.targetUid === target).length;
    expect(count(reserved)).toBeLessThan(count(b) * .8);
  });
  it('尊重前后排、嘲讽、最低血量被动和唯一合法目标', () => {
    const b = targeting(); b.playerUnits[0].row = 'back';
    for (let i = 0; i < 50; i++) expect(selectEnemyAction(b, b.enemyUnits[0], (i + .5) / 50, .5)!.targetUid).not.toBe(b.playerUnits[0].uid);
    b.enemyUnits[0].passive = 'blood_scent';
    for (let i = 0; i < 50; i++) expect(selectEnemyAction(b, b.enemyUnits[0], (i + .5) / 50, .5)!.targetUid).toBe(b.playerUnits[0].uid);
    b.enemyUnits[0].passive = undefined; b.enemyUnits[0].statuses = [{ kind: 'taunt', value: 1, turns: 2, sourceUid: b.playerUnits[2].uid }];
    expect(selectEnemyAction(b, b.enemyUnits[0], .5, .5)!.targetUid).toBe(b.playerUnits[2].uid);
    b.playerUnits = [b.playerUnits[0]];
    expect(selectEnemyAction(b, b.enemyUnits[0], .5, .5)!.targetUid).toBe(b.playerUnits[0].uid);
  });
  it('多敌人的随机选择不再同步，战斗读档结果仍确定', () => {
    let split = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const b = targeting(); b.seed = seed; b.playerUnits.forEach(u => { u.hp = 30; u.maxHp = 30; });
      const after = playerEndTurn(b);
      const hits = after.log.filter(l => l.text.includes('使用「爪击」攻击')).map(l => l.targetUid);
      if (new Set(hits).size > 1) split++;
      expect(playerEndTurn(JSON.parse(JSON.stringify(b)))).toEqual(after);
    }
    expect(split).toBeGreaterThan(30);
  });
});
