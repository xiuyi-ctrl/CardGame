import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerEndTurn, playerSkill, stokeFireTargets } from '../src/game/core/battle';
import { generateMap, generateRewards, nextStage } from '../src/game/state/game';
import { createInitialState, gameReducer, migrateGameState } from '../src/game/state/reducer';
import { parseEvent } from '../src/ui/battleFx';
import type { BattleState, Unit } from '../src/game/types';

function passiveBattle(holders = ['candle']): BattleState {
  const attacker = { ...makeUnit('momo', true, 0, false), hp: 5, maxHp: 100, spd: 99, skills: ['punch', 'tail', 'double_hit'] };
  const units = [attacker, ...holders.map((id, i) => ({ ...makeUnit(id, true, (i + 1) as 0 | 1 | 2, false), row: 'back' as const }))];
  const raw = createBattle(units, [{ speciesId: 'momo' }, { speciesId: 'kiki' }], 1);
  return { ...raw, enemyUnits: raw.enemyUnits.map(u => ({ ...u, hp: 500, maxHp: 500,
    row: 'front', skills: [], acted: true, statuses: [{ kind: 'burn', value: 8, turns: 2 }] })) };
}

function fire(b: BattleState, skill = 'punch', index = 0): BattleState {
  return playerEndTurn(playerSkill(b, b.playerUnits[index].uid, skill, b.enemyUnits[0].uid));
}

const warmth = (b: BattleState) => b.log.filter(entry => /的「余温」治愈/.test(entry.text));

describe('烛烛与灯翅蛾', () => {
  it('属性、固定技能组与两只一阶融合正确，二阶连接传奇形态', () => {
    const first = makeUnit('candle', true, 0, false);
    expect([first.maxHp, first.spd]).toEqual([9, 5]);
    expect(first.skills).toEqual(['candle_flame', 'stoke_fire']);
    const state = { ...createInitialState(), screen: 'roster' as const, roster: [first, makeUnit('candle', true, 1, false)] };
    const after = gameReducer(state, { type: 'FUSE', primaryUid: first.uid });
    expect(after.roster).toHaveLength(1);
    expect(after.roster[0].speciesId).toBe('lantern_moth');
    expect([after.roster[0].maxHp, after.roster[0].spd]).toEqual([15, 6]);
    expect(after.roster[0].skills).toEqual(['candle_flame', 'stoke_fire', 'lamp_guard']);
    expect(nextStage('lantern_moth')).toBe('eternal_moth');
  });

  it.each([['candle', 2], ['lantern_moth', 2]] as const)('%s：治疗最低当前生命伙伴，下一完整回合恢复机会', (id, heal) => {
    const battle = passiveBattle([id]);
    const after = fire(battle);
    expect(after.playerUnits[0].hp).toBe(5 + heal);
    expect(warmth(after)).toHaveLength(1);
    expect(warmth(after)[0].targetUid).toBe(battle.playerUnits[0].uid);
    const second = fire(after);
    expect(second.playerUnits[0].hp).toBe(5 + heal * 2);
    expect(warmth(second)).toHaveLength(2);
  });

  it('多只余温取最高值，多段、群攻及队友追加攻击都不会重复治疗', () => {
    const raw = passiveBattle(['candle', 'lantern_moth']);
    const battle = { ...raw, playerUnits: raw.playerUnits.map(u => ({ ...u, skills: ['double_hit', 'tail'], spd: 99 })) };
    let ordered = battle;
    for (const unit of battle.playerUnits) ordered = playerSkill(ordered, unit.uid, 'double_hit', battle.enemyUnits[0].uid);
    const after = playerEndTurn(ordered);
    expect(warmth(after)).toHaveLength(1);
    expect(after.playerUnits[0].hp).toBe(7);
    expect(warmth(after)[0].actorUid).toBe(battle.playerUnits[2].uid);
    expect(warmth(fire(battle, 'tail'))).toHaveLength(1);
  });

  it('余温治疗两名不同的最低血量存活伙伴，共享上限取两目标版本且不治疗第三名', () => {
    const raw = passiveBattle(['candle', 'lantern_moth']);
    const corpse = { ...makeUnit('momo', true, 2, false), hp: 0 };
    const battle = { ...raw, playerUnits: [...raw.playerUnits.map((unit, i) => ({ ...unit, hp: i === 0 ? 5 : i === 1 ? 1 : 2 })), corpse] };
    const after = fire(battle, 'tail');
    expect(after.playerUnits.map(unit => unit.hp)).toEqual([5, 3, 4, 0]);
    const logs = warmth(after);
    expect(logs).toHaveLength(2);
    expect(logs.every(entry => entry.text.includes('的「余温」') && entry.actorUid === battle.playerUnits[2].uid)).toBe(true);
    expect(new Set(logs.map(entry => entry.targetUid))).toEqual(new Set([battle.playerUnits[1].uid, battle.playerUnits[2].uid]));
    expect(logs.map(entry => parseEvent(after, entry)?.targetUid)).toEqual(logs.map(entry => entry.targetUid));
    const second = fire(after, 'double_hit');
    expect(warmth(second)).toHaveLength(4);
    expect(second.playerUnits.map(unit => unit.hp)).toEqual([5, 5, 6, 0]);
  });

  it('余温独自上场仅治疗自身一次；护灯可以治疗自身且不超过生命上限', () => {
    const raw = passiveBattle(['lantern_moth']);
    const moth = { ...raw.playerUnits[1], hp: 5, skills: ['punch', 'lamp_guard'] };
    const solo = { ...raw, playerUnits: [moth] };
    const after = fire(solo);
    expect(after.playerUnits[0].hp).toBe(7);
    expect(warmth(after)).toHaveLength(1);
    const almostFull = { ...solo, playerUnits: [{ ...moth, hp: 14 }] };
    const healed = playerEndTurn(playerSkill(almostFull, moth.uid, 'lamp_guard', moth.uid));
    expect(healed.playerUnits[0].hp).toBe(15);
    expect(healed.log.some(entry => entry.text.includes('使用「护灯」，治愈') && entry.targetUid === moth.uid)).toBe(true);
  });

  it('敌方护灯按治疗技能保护濒危同伴', () => {
    const player = makeUnit('momo', true, 0, false);
    const raw = createBattle([player], [{ speciesId: 'lantern_moth' }, { speciesId: 'coal' }], 9);
    const battle = { ...raw, enemyUnits: raw.enemyUnits.map((unit, i) => ({ ...unit,
      hp: i === 1 ? 1 : unit.hp, skills: i === 0 ? ['lamp_guard'] : [], acted: i === 1 })) };
    const after = playerEndTurn(battle);
    expect(after.enemyUnits[1].hp).toBe(6);
    expect(after.log.some(entry => entry.actorUid === battle.enemyUnits[0].uid
      && entry.targetUid === battle.enemyUnits[1].uid && entry.text.includes('使用「护灯」，治愈'))).toBe(true);
  });

  it('余温按当前生命绝对值而非比例选目标；最低血量者满血时不改治其他人', () => {
    const raw = passiveBattle();
    const differentRatios = { ...raw, playerUnits: raw.playerUnits.map((unit, i) => ({ ...unit, hp: i === 0 ? 8 : 4 })) };
    const after = fire(differentRatios);
    expect(after.playerUnits[0].hp).toBe(8);
    expect(after.playerUnits[1].hp).toBe(6);
    expect(warmth(after)[0].targetUid).toBe(raw.playerUnits[1].uid);
    const fullLowest = { ...raw, playerUnits: raw.playerUnits.map((unit, i) => ({ ...unit, hp: i === 0 ? 50 : unit.maxHp })) };
    const skipped = fire(fullLowest);
    expect(warmth(skipped)).toHaveLength(0);
    expect(skipped.playerUnits[0].hp).toBe(50);
  });

  it('烛火当次刚点燃不触发余温，下一次攻击才触发', () => {
    const raw = passiveBattle();
    const battle: BattleState = { ...raw, enemyUnits: raw.enemyUnits.map(u => ({ ...u, statuses: [] })) };
    const first = fire(battle, 'candle_flame', 1);
    expect(warmth(first)).toHaveLength(0);
    // 单层灼烧已在回合结算耗尽，再构造同回合两次攻击验证先点火再触发。
    let ordered = playerSkill(battle, battle.playerUnits[1].uid, 'candle_flame', battle.enemyUnits[0].uid);
    ordered = { ...ordered, playerUnits: ordered.playerUnits.map((u, i) => ({ ...u, spd: i === 1 ? 99 : 1 })) };
    ordered = playerSkill(ordered, battle.playerUnits[0].uid, 'punch', battle.enemyUnits[0].uid);
    expect(warmth(playerEndTurn(ordered))).toHaveLength(1);
  });

  it('添薪只增加已有灼烧，不造成直接伤害或触发被动；护灯回复指定伙伴5点生命', () => {
    const battle = passiveBattle(['lantern_moth']);
    const moth = battle.playerUnits[1];
    const after = fire(battle, 'stoke_fire', 1);
    expect(warmth(after)).toHaveLength(0);
    const cast = after.log.find(entry => entry.actorUid === moth.uid && entry.text.includes('使用「添薪」'))!;
    expect(cast.hp?.[battle.enemyUnits[0].uid]).toBe(500);
    expect(cast.statuses?.[battle.enemyUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(11);
    const healed = playerEndTurn(playerSkill(battle, moth.uid, 'lamp_guard', battle.playerUnits[0].uid));
    expect(healed.playerUnits[0].hp).toBe(10);
    expect(healed.playerUnits[0].shield).toBe(0);
    expect(healed.playerUnits[1].shield).toBe(0);
    expect(warmth(healed)).toHaveLength(0);
  });

  it('添薪不能选择未燃烧或死亡目标，跨排可选，但服从嘲讽；结算前熄灭不重新点火', () => {
    const raw = passiveBattle();
    const moth = raw.playerUnits[1];
    const battle: BattleState = { ...raw, enemyUnits: raw.enemyUnits.map((u, i) => ({ ...u, row: i === 0 ? 'back' : 'front', statuses: i === 0 ? u.statuses : [] })) };
    expect(stokeFireTargets(battle, moth).map(u => u.uid)).toEqual([battle.enemyUnits[0].uid]);
    expect(playerSkill(battle, moth.uid, 'stoke_fire', battle.enemyUnits[1].uid)).toBe(battle);
    const taunted: Unit = { ...moth, statuses: [{ kind: 'taunt', sourceUid: battle.enemyUnits[1].uid, value: 1, turns: 2 }] };
    expect(stokeFireTargets(battle, taunted)).toEqual([]);
    const ordered = playerSkill(battle, moth.uid, 'stoke_fire', battle.enemyUnits[0].uid);
    const extinguished = { ...ordered, enemyUnits: ordered.enemyUnits.map(u => ({ ...u, statuses: [] })) };
    const after = playerEndTurn(extinguished);
    expect(after.enemyUnits.every(u => u.statuses.every(s => s.kind !== 'burn'))).toBe(true);
    expect(after.log.some(entry => entry.text.includes('添薪没有目标'))).toBe(true);
    const dead = { ...battle, enemyUnits: battle.enemyUnits.map(u => ({ ...u, hp: 0 })) };
    expect(stokeFireTargets(dead, moth)).toEqual([]);
  });

  it('持有者阵亡不触发，不复活伙伴；满血时首次机会仍消耗，读档不刷新机会', () => {
    const raw = passiveBattle();
    const dead = { ...raw, playerUnits: raw.playerUnits.map((u, i) => i === 1 ? { ...u, hp: 0 } : u) };
    expect(warmth(fire(dead))).toHaveLength(0);
    const used = { ...raw, afterglowUsed: { player: true } };
    expect(warmth(fire(used))).toHaveLength(0);
    const loaded = migrateGameState(JSON.parse(JSON.stringify({ ...createInitialState(), screen: 'battle', battle: used })))!.battle!;
    expect(warmth(fire(loaded))).toHaveLength(0);
    const full: BattleState = { ...raw,
      playerUnits: raw.playerUnits.map((unit, i) => ({ ...unit, hp: unit.maxHp, spd: i === 0 ? 99 : 1, skills: ['punch'] })),
      enemyUnits: [{ ...raw.enemyUnits[0], spd: 10, skills: ['punch'], acted: false }],
    };
    let ordered = full;
    for (const unit of full.playerUnits) ordered = playerSkill(ordered, unit.uid, 'punch', full.enemyUnits[0].uid);
    const spent = playerEndTurn(ordered);
    expect(warmth(spent)).toHaveLength(0);
    expect(spent.playerUnits[0].hp).toBeLessThan(full.playerUnits[0].maxHp);
    // 攻击日志之后的生命快照证明没有治疗尸体。
    const corpse = { ...makeUnit('momo', true, 2, false), hp: 0 };
    const after = fire({ ...raw, playerUnits: [...raw.playerUnits, corpse] });
    expect(after.playerUnits.find(u => u.uid === corpse.uid)?.hp).toBe(0);
  });

  it('治疗动画同时保留施法者与真正受治疗对象', () => {
    const after = fire(passiveBattle());
    const event = parseEvent(after, warmth(after)[0])!;
    expect(event.kind).toBe('heal');
    expect(event.actorUid).toBe(after.playerUnits[1].uid);
    expect(event.targetUid).toBe(after.playerUnits[0].uid);
    expect(event.value).toBe(2);
  });

  it('敌方有自己的余温共享机会，AI无燃烧目标时不会使用添薪点火', () => {
    const raw = passiveBattle(['lantern_moth']);
    const b: BattleState = { ...raw, enemyUnits: [{ ...makeUnit('lantern_moth', false, 0, true), hp: 5,
      skills: ['candle_flame'], row: 'front', statuses: [{ kind: 'burn', value: 8, turns: 2 }] }], playerUnits: raw.playerUnits.map(u => ({ ...u, statuses: [{ kind: 'burn', value: 8, turns: 2 }] })) };
    const after = fire(b, 'tail');
    const logs = warmth(after);
    expect(logs.some(entry => entry.side === 'player')).toBe(true);
    expect(logs.some(entry => entry.side === 'enemy')).toBe(true);
    const noBurn: BattleState = { ...b, playerUnits: b.playerUnits.map(u => ({ ...u, statuses: [] })),
      enemyUnits: b.enemyUnits.map(u => ({ ...u, hp: 15, skills: ['stoke_fire'], acted: false })) };
    const idle = playerEndTurn(noBurn);
    expect(idle.playerUnits.every(u => u.statuses.every(s => s.kind !== 'burn'))).toBe(true);
  });

  it('主模式招募、遭遇能出现新伙伴，开局不变', () => {
    const found = new Set<string>();
    for (let seed = 0; seed < 150; seed++) {
      for (const act of [1, 2]) {
        const map = generateMap(seed, act);
        for (const group of Object.values(map.encounter)) for (const enemy of group) found.add(enemy.speciesId);
      }
      const rewards = generateRewards({ ...createInitialState(), seed, act: 2 });
      for (const reward of rewards) for (const id of reward.recruitCandidates ?? []) found.add(`recruit:${id}`);
    }
    for (const id of ['candle', 'lantern_moth', 'recruit:candle', 'recruit:lantern_moth']) expect(found.has(id)).toBe(true);
  });
});
