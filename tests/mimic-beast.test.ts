import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerSkill, playerEndTurn, performGauntletSwap } from '../src/game/core/battle';
import { MIMIC_BLOCKED_SKILLS, mimicSkillPool } from '../src/game/data/mimic';
import { MONSTERS, MAIN_BASE_POOL, MAIN_EVO1_POOL, MAIN_EVO2_POOL, SPECIAL_EGG_POOL } from '../src/game/data/monsters';
import { SKILLS } from '../src/game/data/skills';
import { createInitialState, gameReducer, resolveBattle } from '../src/game/state/reducer';
import { buildEventByType, fuseUnit, nextStage, type GameState } from '../src/game/state/game';
import { createRng } from '../src/game/rng';
import { parseDualSave } from '../src/ui/persistence';
import { simulationStep } from '../src/game/simulation/runner';

const beast = () => makeUnit('mimic_beast', true, 0, false);
function source(skills: string[]) {
  return { ...makeUnit('momo', false, 0, false), passive: undefined, skills, hp: 100, maxHp: 100, spd: 1 };
}
function battle(skills: string[], seed = 1) {
  return createBattle([beast()], [], seed, { mirrorUnits: [source(skills)] });
}

describe('百变兽万变抽技', () => {
  it('固定18生命4速度2阶，特殊蛋独立池，不可进化融合驯服或野生投放', () => {
    const unit = beast();
    expect([unit.hp, unit.spd, MONSTERS.mimic_beast.rank]).toEqual([18, 4, 2]);
    expect(unit.skills).toEqual([]); expect(MONSTERS.mimic_beast.tame.difficulty).toBe(0);
    expect(MONSTERS.mimic_beast.eggBorn).toBe(true);
    expect(nextStage(unit.speciesId)).toBeUndefined(); expect(fuseUnit(unit)).toBeNull();
    expect(SPECIAL_EGG_POOL).toEqual(['time_sand_beast', 'mimic_beast', 'mirror_beast', 'crystal_core_beast']);
    expect([...MAIN_BASE_POOL, ...MAIN_EVO1_POOL, ...MAIN_EVO2_POOL]).not.toContain(unit.speciesId);
  });
  it('技能池包含初始双方存活者与首领技能，按技能ID去重，不含被动', () => {
    const ally = { ...makeUnit('lulu', true, 1, false), skills: ['aqua_shot', 'punch'] };
    const foe = source(['punch', 'growth_bind', 'growth_roar', 'soul_echo']);
    const b = createBattle([beast(), ally], [], 1, { mirrorUnits: [foe] });
    const pool = mimicSkillPool([ally, foe]);
    expect(pool).toEqual(['aqua_shot', 'punch', 'growth_bind', 'growth_roar', 'soul_echo']);
    expect(new Set(b.playerUnits[0].skills).size).toBe(4);
    b.playerUnits[0].skills.forEach(id => expect(pool).toContain(id));
  });
  it('足够时无放回；不足先抽齐不同技能，再重复补足四格', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const unique = battle(['punch', 'aqua_shot', 'bite', 'tail', 'growth_bind'], seed);
      expect(unique.playerUnits[0].skills).toHaveLength(4);
      expect(new Set(unique.playerUnits[0].skills).size).toBe(4);
      const short = battle(['punch', 'punch', 'aqua_shot'], seed).playerUnits[0].skills;
      expect(short).toHaveLength(4); expect(new Set(short.slice(0, 2)).size).toBe(2);
      expect(short.every(id => id === 'punch' || id === 'aqua_shot')).toBe(true);
    }
  });
  it('召唤、重组、指定首领及成长值机制不可复制，独立首领技能仍保留', () => {
    const pool = mimicSkillPool([source(Object.keys(SKILLS))]);
    for (const id of MIMIC_BLOCKED_SKILLS) expect(pool).not.toContain(id);
    for (const id of ['growth_bind', 'growth_roar', 'puppet_bind', 'puppet_fist', 'soul_echo', 'chain_bind']) expect(pool).toContain(id);
    expect(mimicSkillPool([{ ...source(['punch']), hp: 0 }])).toEqual([]);
  });
  it('零候选时采用3伤爪击保底，双方百变兽不会复制彼此上一场技能', () => {
    const old = { ...beast(), skills: ['growth_impact'], skillEnhancements: { 0: 3 } };
    const b = createBattle([old], [{ speciesId: 'mimic_beast' }], 1);
    for (const unit of [...b.playerUnits, ...b.enemyUnits]) expect(unit.skills).toEqual(Array(4).fill('claw_attack'));
    expect(b.rngCount).toBe(8); expect(b.playerUnits[0].skillEnhancements).toBeUndefined();
  });
  it('不继承来源强化、冷却、剩余次数、生命速度或层数', () => {
    const foe = { ...source(['nine_tail_wildfire']), skillEnhancements: { 0: 3 }, skillUses: { nine_tail_wildfire: 0 }, skillCooldowns: { nine_tail_wildfire: 10 },
      statuses: [{ kind: 'foxFire' as const, value: 9, turns: 0 }], spd: 99 };
    const b = createBattle([beast()], [], 19, { mirrorUnits: [foe] });
    const unit = b.playerUnits[0];
    expect([unit.maxHp, unit.spd]).toEqual([18, 4]); expect(unit.passive).toBe('myriad_forms');
    expect(unit.skillEnhancements).toBeUndefined(); expect(unit.skillCooldowns).toBeUndefined();
    expect(unit.skillUses?.nine_tail_wildfire).toBe(SKILLS.nine_tail_wildfire.uses); expect(unit.statuses).toEqual([]);
  });
  it('复制的首领技能按百变兽自身释放，造成未强化的基础伤害', () => {
    const foe = { ...source(['growth_bind']), skillEnhancements: { 0: 3 } };
    let b = createBattle([beast()], [], 1, { mirrorUnits: [foe] });
    b.enemyUnits[0].acted = true;
    b = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'growth_bind', b.enemyUnits[0].uid));
    expect(b.enemyUnits[0].hp).toBe(100 - SKILLS.growth_bind.damage!);
  });
  it('重复技能同名冷却与次数共享，不能凭四格获得四倍次数', () => {
    let b = battle(['nine_tail_wildfire']); b.enemyUnits[0].acted = true;
    b = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'nine_tail_wildfire'));
    expect(b.playerUnits[0].skillUses?.nine_tail_wildfire).toBe(SKILLS.nine_tail_wildfire.uses! - 1);
    expect(b.playerUnits[0].skillCooldowns?.nine_tail_wildfire).toBe(1);
    expect(playerSkill(b, b.playerUnits[0].uid, 'nine_tail_wildfire')).toBe(b);
  });
  it('战斗读档保留四技能和随机游标，确认预览不会重抽', () => {
    const b = battle(['punch', 'aqua_shot', 'bite', 'tail', 'growth_bind']);
    const state = { ...createInitialState(), screen: 'battle' as const, roster: [beast()], battle: b };
    const parsed = parseDualSave(JSON.stringify(state))!.main!;
    const next = gameReducer(createInitialState(), { type: 'LOAD_GAME', state: parsed });
    expect(next.battle).toEqual(b);
    const confirmed = gameReducer(next, { type: 'ACK_MIMIC_PREVIEW' });
    expect(confirmed.battle?.mimicPreviewPending).toBeUndefined();
    expect(confirmed.battle?.playerUnits[0].skills).toEqual(b.playerUnits[0].skills);
    expect(confirmed.battle?.rngCount).toBe(b.rngCount);
  });
  it('预览确认前不能下令或结束回合，自动玩家会确认预览', () => {
    const b = battle(['punch']);
    const state = { ...createInitialState(), screen: 'battle' as const, battle: b };
    expect(gameReducer(state, { type: 'END_TURN' })).toBe(state);
    expect(gameReducer(state, { type: 'PLAYER_SKILL', actorUid: b.playerUnits[0].uid, skillId: 'punch', targetUid: b.enemyUnits[0].uid })).toBe(state);
    expect(simulationStep(state, 1).battle?.mimicPreviewPending).toBeUndefined();
  });
  it('每场重抽，旧技能不流入新池，相同种子和输入可复现', () => {
    const first = battle(['punch']);
    const next = createBattle(first.playerUnits, [], 2, { mirrorUnits: [source(['aqua_shot'])] });
    expect(next.playerUnits[0].skills).toEqual(Array(4).fill('aqua_shot'));
    expect(battle(['punch', 'aqua_shot', 'bite', 'tail', 'growth_bind'], 31).playerUnits[0].skills)
      .toEqual(battle(['punch', 'aqua_shot', 'bite', 'tail', 'growth_bind'], 31).playerUnits[0].skills);
  });
  it('战后清除抽到的技能，不带回队伍或下场使用', () => {
    const unit = beast(), b = createBattle([unit], [{ speciesId: 'momo' }], 1);
    const state: GameState = { ...createInitialState(), roster: [unit], battle: { ...b, phase: 'won' } };
    const next = resolveBattle(state, state.battle!);
    expect(next.roster[0].skills).toEqual([]);
  });
  it('车轮战只用初始场上技能池，替补百变兽开战即锁定，上阵不重抽', () => {
    const ally = makeUnit('lulu', true, 0, false), reserve = beast();
    let b = createBattle([ally, reserve], [{ speciesId: 'momo' }, { speciesId: 'fifi' }], 1, { gauntlet: true });
    const pool = mimicSkillPool([...b.playerUnits, ...b.enemyUnits]);
    const skills = b.playerBench![0].skills;
    skills.forEach(id => expect(pool).toContain(id));
    b.playerUnits[0].hp = 0; b.pendingSwap = { player: true, enemy: false };
    b = performGauntletSwap(b);
    expect(b.playerUnits[0].skills).toEqual(skills);
  });
  it('新特殊蛋在四个蛋生物中等概率锁定，普通蛋不受影响', () => {
    const counts = { time_sand_beast: 0, mimic_beast: 0, mirror_beast: 0, crystal_core_beast: 0 };
    for (let seed = 1; seed <= 2000; seed++) {
      const event = buildEventByType(createRng(seed), 'egg', 2);
      const egg = event.choices[1].carriedEgg!;
      if (egg.special) { expect(SPECIAL_EGG_POOL).toContain(egg.monsterId); counts[egg.monsterId as keyof typeof counts]++; }
      else expect(SPECIAL_EGG_POOL).not.toContain(egg.monsterId);
    }
    for (const count of Object.values(counts)) expect(count).toBeGreaterThan(25);
    expect(Math.abs(counts.time_sand_beast - counts.mimic_beast)).toBeLessThan(60);
  });
  it('新锁定百变兽蛋与旧占位特殊蛋分别孵化，不重抽旧结果', () => {
    const state: GameState = { ...createInitialState(), screen: 'map', roster: [],
      carriedEggs: ['mimic_beast', 'momo'].map((monsterId, i) => ({ id: `${i}`, monsterId, remaining: 0, special: true, passedNodeIds: [] })) };
    const next = gameReducer(createInitialState(), { type: 'LOAD_GAME', state });
    expect(next.roster.map(unit => unit.speciesId)).toEqual(['mimic_beast', 'time_sand_beast']);
  });
});
