import { describe, expect, it } from 'vitest';
import { canUnitUseSkill, createBattle, makeUnit, planEnemyLayout, playerEndTurn, playerSkill, skillCooldownLeft } from '../src/game/core/battle';
import { getGrowthArenaEncounter } from '../src/game/data/growth-arena';
import { getGrowthEliteEncounter, TIER2 } from '../src/game/core/growth-map';
import { getNormalSkillPool } from '../src/game/core/growth';
import { fusionNeedCount, generateMap, nextStage } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { MAIN_EVO1_POOL as MAIN_SECOND } from '../src/game/data/monsters';
import { parseEvent } from '../src/ui/battleFx';
import { skillFullDesc } from '../src/ui/components';
import type { BattleState } from '../src/game/types';

function quiet(ids = ['searing_hawk', 'momo'], enemies = ['momo']): BattleState {
  const players = ids.map((id, index) => ({ ...makeUnit(id, true, index as 0 | 1 | 2, false), hp: 100, maxHp: 100, spd: 10 - index * 2 }));
  const b = createBattle(players, enemies.map(speciesId => ({ speciesId })), 17);
  return { ...b, enemyUnits: b.enemyUnits.map(u => ({ ...u, hp: 500, maxHp: 500, skills: [], acted: true })) };
}

function withBrand(b: BattleState, layers: number, side: 'player' | 'enemy' = 'player'): BattleState {
  return { ...b, enemyUnits: b.enemyUnits.map(u => ({ ...u, statuses: [
    ...(layers ? [{ kind: 'burn' as const, value: layers, turns: 2 }] : []),
    { kind: 'burnBrand' as const, value: 1, turns: 2, sourceSide: side, sourceUid: 'old-caster' },
  ] })) };
}

describe('熔甲虫与焚风鹰', () => {
  it.each([
    ['molten_larva', 'molten_beetle', 19, 3, ['heated_shell_bump', 'molten_self_burn', 'shell_charge']],
    ['ember_hawk', 'searing_hawk', 15, 6, ['flame_tracing_feather', 'fire_feather', 'burn_brand']],
  ] as const)('%s两只融合为%s，保留主宠强化与诅咒', (base, evolved, hp, spd, skills) => {
    const main = { ...makeUnit(base, true, 0, false), bonusStats: { hp: 5, spd: 2 }, curse: 'atkDown' as const };
    const material = { ...makeUnit(base, true, 1, false), bonusStats: { hp: 50, spd: 50 }, skills: ['heal_light'] };
    const next = gameReducer({ ...createInitialState(), screen: 'roster', roster: [main, material] }, { type: 'FUSE', primaryUid: main.uid });
    expect(fusionNeedCount(base)).toBe(2);
    expect(nextStage(base)).toBe(evolved);
    expect(nextStage(evolved)).toBe(evolved === 'molten_beetle' ? 'molten_beast' : 'solar_eagle');
    expect(next.roster).toHaveLength(1);
    expect(next.roster[0]).toMatchObject({ speciesId: evolved, maxHp: hp + 5, spd: spd + 2, curse: 'atkDown', skills: [...skills] });
    expect(next.roster[0].hp).toBe(hp + 5);
    expect(MAIN_SECOND).toContain(evolved);
    expect(TIER2).toContain(evolved);
  });

  it('熔蜕消耗两层剩余火换4盾，二阶前后排布局正确', () => {
    const b = quiet(['molten_beetle']);
    const actor = b.playerUnits[0];
    const after = playerEndTurn(playerSkill(b, actor.uid, 'molten_self_burn'));
    expect(after.playerUnits[0].hp).toBe(97);
    expect(after.playerUnits[0].shield).toBe(6);
    expect(after.playerUnits[0].statuses.some(s => s.kind === 'burn')).toBe(false);
    const log = after.log.find(e => e.text.includes('的「熔蜕」获得 4 点护盾'))!;
    expect(parseEvent(after, log)).toMatchObject({ kind: 'buff', targetUid: actor.uid, skillName: '熔蜕' });
    expect(planEnemyLayout([{ speciesId: 'molten_beetle' }, { speciesId: 'searing_hawk' }]).map(u => u.row)).toEqual(['front', 'back']);
  });

  it.each([1, 2, 4, 10])('裂壳冲撞按执行时盾量%s扣费，最多消耗4，无冷却', (shield) => {
    const b = quiet(['molten_beetle']);
    b.playerUnits[0].shield = shield;
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'shell_charge', b.enemyUnits[0].uid));
    expect(after.playerUnits[0].shield).toBe(shield - Math.min(shield, 4));
    expect(after.enemyUnits[0].hp).toBe(500 - 3 - Math.min(shield, 4));
    expect(skillCooldownLeft(after.playerUnits[0], 'shell_charge')).toBe(0);
  });

  it('无盾不能选冲撞，执行前失盾不改招；强化只加基础伤害', () => {
    const b = quiet(['molten_beetle']);
    expect(canUnitUseSkill(b.playerUnits[0], 'shell_charge')).toBe(false);
    expect(playerSkill(b, b.playerUnits[0].uid, 'shell_charge', b.enemyUnits[0].uid)).toBe(b);
    b.playerUnits[0].shield = 9;
    b.playerUnits[0].skillEnhancements = { 2: 2 };
    const ordered = playerSkill(b, b.playerUnits[0].uid, 'shell_charge', b.enemyUnits[0].uid);
    const stopped = playerEndTurn({ ...ordered, playerUnits: ordered.playerUnits.map(u => ({ ...u, shield: 0 })) });
    expect(stopped.log.some(e => e.text.includes('使用「裂壳冲撞」攻击'))).toBe(false);
    const boosted = playerEndTurn(ordered);
    expect(boosted.enemyUnits[0].hp).toBe(489);
    expect(boosted.playerUnits[0].shield).toBe(5);
  });

  it('焚风蚀甲剥3盾，火羽和一阶先手规则保持', () => {
    const b = quiet(['searing_hawk']);
    b.enemyUnits[0].shield = 4;
    b.enemyUnits[0].statuses = [{ kind: 'burn', value: 4, turns: 2 }];
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'fire_feather', b.enemyUnits[0].uid));
    expect(after.log.find(e => e.text.includes('火羽」攻击'))?.hp?.[b.enemyUnits[0].uid]).toBe(496);
    const strip = after.log.find(e => e.text.includes('焚风蚀甲」剥除'))!;
    expect(parseEvent(after, strip)).toMatchObject({ kind: 'buff', value: 0, skillName: '焚风蚀甲' });
  });

  it('烙印可直接跨排，施加2层火与单份标记，冷却1完整回合', () => {
    const b = quiet(['searing_hawk'], ['momo', 'momo']);
    b.enemyUnits[0].row = 'front';
    b.enemyUnits[1].row = 'back';
    const uid = b.enemyUnits[1].uid;
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'burn_brand', uid));
    const cast = after.log.find(e => e.text.includes('使用「灼烧烙印」'))!;
    expect(cast.targetUid).toBe(uid);
    expect(cast.statuses?.[uid].find(s => s.kind === 'burn')?.value).toBe(2);
    expect(cast.addsStatus).toEqual(['burn', 'burnBrand']);
    expect(after.enemyUnits[1].statuses.find(s => s.kind === 'burnBrand')).toMatchObject({ value: 1, turns: 1, sourceSide: 'player' });
    expect(skillCooldownLeft(after.playerUnits[0], 'burn_brand')).toBe(1);
    expect(after.log.some(e => e.text.includes('引爆'))).toBe(false);
  });

  it('烙印在后手攻击后引爆当时全部层数，绕过普通盾并清火', () => {
    const b = quiet();
    b.enemyUnits[0].shield = 99;
    b.enemyUnits[0].statuses = [{ kind: 'burn', value: 5, turns: 2 }];
    const target = b.enemyUnits[0].uid;
    const ordered = playerSkill(playerSkill(b, b.playerUnits[0].uid, 'burn_brand', target), b.playerUnits[1].uid, 'punch', target);
    const after = playerEndTurn(ordered);
    expect(after.enemyUnits[0].hp).toBe(493);
    expect(after.enemyUnits[0].shield).toBe(94);
    expect(after.enemyUnits[0].statuses.some(s => s.kind === 'burn' || s.kind === 'burnBrand')).toBe(false);
    const boom = after.log.find(e => e.text.includes('引爆 7 层'))!;
    expect(parseEvent(after, boom)).toMatchObject({ kind: 'dot', targetUid: target, value: 7, statusKind: 'burn' });
  });

  it('本次攻击新附加的火计入引爆，不追加攻击被动治疗', () => {
    const b = quiet();
    b.enemyUnits[0].statuses = [{ kind: 'burn', value: 5, turns: 2 }];
    b.playerUnits[1].skills = ['ember'];
    b.playerUnits[1].passive = 'tide_drain';
    b.playerUnits[1].hp = 50;
    const uid = b.enemyUnits[0].uid;
    const after = playerEndTurn(playerSkill(playerSkill(b, b.playerUnits[0].uid, 'burn_brand', uid), b.playerUnits[1].uid, 'ember', uid));
    expect(after.log.some(e => e.text.includes('引爆 9 层，受到 9'))).toBe(true);
    expect(after.enemyUnits[0].hp).toBe(486);
    expect(after.playerUnits[1].hp).toBe(52);
  });

  it('多段和群攻对同一目标只引爆一次，标记归属另一阵营不会误触发', () => {
    const raw = quiet(['momo']);
    raw.playerUnits[0].skills = ['double_hit', 'tail'];
    const b = withBrand(raw, 5);
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'double_hit', b.enemyUnits[0].uid));
    expect(after.log.filter(e => e.text.includes('引爆'))).toHaveLength(1);
    expect(after.enemyUnits[0].hp).toBe(491);
    const group = withBrand(quiet(['momo'], ['momo', 'momo']), 5);
    group.playerUnits[0].skills = ['tail'];
    const groupResult = playerEndTurn(playerSkill(group, group.playerUnits[0].uid, 'tail'));
    expect(groupResult.log.filter(e => e.text.includes('引爆'))).toHaveLength(2);
    expect(groupResult.enemyUnits.map(u => u.hp)).toEqual([493, 493]);
    const wrong = withBrand(raw, 5, 'enemy');
    const untouched = playerEndTurn(playerSkill(wrong, wrong.playerUnits[0].uid, 'double_hit', wrong.enemyUnits[0].uid));
    expect(untouched.log.some(e => e.text.includes('引爆'))).toBe(false);
    expect(untouched.enemyUnits[0].statuses.some(s => s.kind === 'burnBrand')).toBe(true);
  });

  it('状态和持续伤害不触发，到期移除；零火攻击仍消耗烙印', () => {
    const raw = quiet(['searing_hawk']);
    const cast = playerEndTurn(playerSkill(raw, raw.playerUnits[0].uid, 'burn_brand', raw.enemyUnits[0].uid));
    const expired = playerEndTurn(cast);
    expect(expired.log.some(e => e.text.includes('引爆'))).toBe(false);
    expect(expired.enemyUnits[0].statuses.some(s => s.kind === 'burnBrand')).toBe(false);
    const status = withBrand(quiet(['momo']), 5);
    status.playerUnits[0].skills = ['stoke_fire'];
    const applied = playerEndTurn(playerSkill(status, status.playerUnits[0].uid, 'stoke_fire', status.enemyUnits[0].uid));
    expect(applied.log.some(e => e.text.includes('引爆'))).toBe(false);
    const empty = withBrand(quiet(['momo']), 0);
    const spent = playerEndTurn(playerSkill(empty, empty.playerUnits[0].uid, 'punch', empty.enemyUnits[0].uid));
    expect(spent.log.some(e => e.text.includes('引爆 0 层，受到 0'))).toBe(true);
    expect(spent.enemyUnits[0].statuses.some(s => s.kind === 'burnBrand')).toBe(false);
  });

  it('重复烙印叠火但只刷新一份标记，强化只增加施加层数', () => {
    const b = quiet(['searing_hawk', 'searing_hawk']);
    b.playerUnits[1].skillEnhancements = { 2: 2 };
    const target = b.enemyUnits[0].uid;
    const after = playerEndTurn(playerSkill(playerSkill(b, b.playerUnits[0].uid, 'burn_brand', target), b.playerUnits[1].uid, 'burn_brand', target));
    const casts = after.log.filter(e => e.text.includes('使用「灼烧烙印」'));
    expect(casts[1].statuses?.[target].find(s => s.kind === 'burn')?.value).toBe(6);
    expect(after.enemyUnits[0].statuses.filter(s => s.kind === 'burnBrand')).toHaveLength(1);
    expect(skillFullDesc({ id: 'burn_brand', name: '', desc: '施加2层灼烧', target: 'single', kind: 'status', hideEffects: true, effects: [{ kind: 'burn', value: 2, turns: 2 }] }, 2)).toContain('4层');
    for (const id of ['shell_charge', 'burn_brand']) expect(getNormalSkillPool()).toContain(id);
  });

  it('引爆遵守伤害上限但清空全部层数，攻击本体击倒目标不重复引爆', () => {
    const b = withBrand(quiet(['momo']), 30);
    b.enemyUnits[0].passive = 'iron_cap';
    b.enemyUnits[0].shield = 50;
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid));
    expect(after.log.some(e => e.text.includes('引爆 30 层，受到 5'))).toBe(true);
    expect(after.enemyUnits[0].hp).toBe(495);
    expect(after.enemyUnits[0].statuses.some(s => s.kind === 'burn')).toBe(false);
    const dead = withBrand(quiet(['momo']), 30);
    dead.enemyUnits[0].hp = 1;
    const killed = playerEndTurn(playerSkill(dead, dead.playerUnits[0].uid, 'punch', dead.enemyUnits[0].uid));
    expect(killed.log.some(e => e.text.includes('引爆'))).toBe(false);
    expect(killed.enemyUnits[0].statuses.some(s => s.kind === 'burnBrand')).toBe(false);
  });

  it('引爆击杀小怪沿用死亡自爆且只触发一次', () => {
    const b = withBrand(quiet(['momo'], ['boss_minion_rock', 'momo']), 10);
    b.enemyUnits[0].hp = 7;
    b.enemyUnits[0].shield = 20;
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid));
    expect(after.enemyUnits[0].hp).toBe(0);
    expect(after.log.filter(e => e.text.includes('的「岩壳碎片」爆裂'))).toHaveLength(1);
    expect(after.playerUnits[0].hp).toBe(97);
  });

  it('敌方也能施加与引爆归属敌方的烙印', () => {
    const b = createBattle([{ ...makeUnit('momo', true, 0, false), hp: 100, maxHp: 100 }], [{ speciesId: 'searing_hawk' }], 4);
    b.enemyUnits[0].skills = ['burn_brand'];
    const cast = playerEndTurn(b);
    expect(cast.playerUnits[0].statuses.find(s => s.kind === 'burnBrand')?.sourceSide).toBe('enemy');
    const next = { ...cast, enemyUnits: cast.enemyUnits.map(u => ({ ...u, skills: ['punch'] })) };
    const after = playerEndTurn(next);
    expect(after.log.some(e => e.text.includes('引爆'))).toBe(true);
  });

  it('各幕二阶遭遇及熟练度二阶池可出现，阶级权重与竞技场去重保持', () => {
    const found = new Set<string>();
    for (let seed = 0; seed < 150; seed++) {
      for (const act of [1, 2, 3]) Object.values(generateMap(seed, act).encounter).flat().forEach(e => found.add(e.speciesId));
      const early = getGrowthArenaEncounter(5, () => 0.1);
      expect(new Set(early.map(e => e.speciesId)).size).toBe(early.length);
    }
    for (const id of ['molten_beetle', 'searing_hawk']) expect(found.has(id)).toBe(true);
    expect(getGrowthEliteEncounter(20, () => 0.799).every(e => TIER2.includes(e.speciesId))).toBe(true);
    expect(getGrowthEliteEncounter(20, () => 0.8).every(e => !TIER2.includes(e.speciesId))).toBe(true);
    expect(getGrowthEliteEncounter(35, () => 0.199).every(e => TIER2.includes(e.speciesId))).toBe(true);
    expect(getGrowthEliteEncounter(35, () => 0.2).every(e => !TIER2.includes(e.speciesId))).toBe(true);
  });
});
