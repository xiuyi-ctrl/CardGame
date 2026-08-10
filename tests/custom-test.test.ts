import { describe, it, expect } from 'vitest';
import { createInitialState, gameReducer, type GameAction } from '../src/game/state/reducer';
import type { GameState } from '../src/game/state/game';
import type { NodeType } from '../src/game/state/game';
import { nextStage, SPECIAL_REWARDS } from '../src/game/state/game';
import { createBattle, makeUnit } from '../src/game/core/battle';
import type { Unit } from '../src/game/types';

function dispatch(state: GameState, action: GameAction): GameState {
  return gameReducer(state, action);
}

/** 生成我方/敌方候选 Unit（重复调用同物种会生成不同 uid，支持同种多只） */
function mk(speciesIds: string[]): Unit[] {
  return speciesIds.map((id) => makeUnit(id, true, 0, false));
}

/** 从首页点「自定义测试」→ 选关卡类型（战斗类进入 test-pick，非战斗类直接进入对应内容） */
function startTest(
  nodeType: NodeType,
  extra: Partial<Extract<GameAction, { type: 'TEST_TYPE_PICK' }>> = {},
): GameState {
  let s = dispatch(createInitialState(), { type: 'DEBUG_CUSTOM_TEST' });
  expect(s.screen).toBe('test-type');
  return dispatch(s, { type: 'TEST_TYPE_PICK', nodeType, ...extra });
}

/** 走完「选我方 → 选敌方 → 配置确认」全流程，返回战斗状态 */
function runToBattle(
  nodeType: NodeType,
  playerSpecies: string[],
  enemySpecies: string[],
  items: { inventory?: Record<string, number>; gold?: number; seed?: number } = {},
): GameState {
  let s = startTest(nodeType);
  s = dispatch(s, { type: 'TEST_PICK_PLAYER_CONFIRM', units: mk(playerSpecies) });
  s = dispatch(s, { type: 'TEST_PICK_ENEMY_CONFIRM', units: mk(enemySpecies) });
  expect(s.screen).toBe('test-config');
  s = dispatch(s, {
    type: 'TEST_ITEMS_CONFIRM',
    inventory: items.inventory ?? { berry: 3, meat: 2 },
    gold: items.gold ?? 500,
    seed: items.seed ?? 1,
  });
  expect(s.screen).toBe('battle');
  return s;
}

describe('自定义测试：battle enemyExact', () => {
  it('enemyExact 时敌方按指定数量原样创建（1 我方 vs 4 敌方）', () => {
    const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'fifi' }, { speciesId: 'lulu' }, { speciesId: 'kiki' }, { speciesId: 'fifi' }], 1, { enemyExact: true });
    expect(b.enemyUnits).toHaveLength(4);
    expect(b.playerUnits).toHaveLength(1);
  });

  it('未开 enemyExact 时 1 我方对多敌方压缩为 1 只', () => {
    const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'fifi' }, { speciesId: 'lulu' }], 1);
    expect(b.enemyUnits).toHaveLength(1);
  });
});

describe('自定义测试：完整流程', () => {
  it('普通战斗：选我方 → 选敌方 → 配置（金币/道具/种子）→ 开战', () => {
    let s = startTest('battle');
    // 选我方：3 只，含同种两只 fifi（允许重复）
    s = dispatch(s, { type: 'TEST_PICK_PLAYER_CONFIRM', units: mk(['momo', 'fifi', 'fifi']) });
    expect(s.screen).toBe('test-pick');
    expect(s.testPick!.side).toBe('enemy');
    expect(s.testPick!.playerUnits).toHaveLength(3);
    expect(s.testPick!.playerUnits![1].uid).not.toBe(s.testPick!.playerUnits![2].uid);
    // 选敌方：3 只
    s = dispatch(s, { type: 'TEST_PICK_ENEMY_CONFIRM', units: mk(['fifi', 'kiki', 'mimi']) });
    expect(s.screen).toBe('test-config');
    expect(s.testRun).toBe(true);
    expect(s.pendingBattle!.encounter).toEqual([{ speciesId: 'fifi' }, { speciesId: 'kiki' }, { speciesId: 'mimi' }]);
    expect(s.pendingBattle!.options).toEqual({ enemyExact: true });
    // 配置确认：金币/道具/种子写回并开战
    s = dispatch(s, { type: 'TEST_ITEMS_CONFIRM', inventory: { berry: 1, meat: 4 }, gold: 888, seed: 7 });
    expect(s.battle!.playerUnits.map((u) => u.speciesId)).toEqual(['momo', 'fifi', 'fifi']);
    expect(s.battle!.enemyUnits.map((u) => u.speciesId)).toEqual(['fifi', 'kiki', 'mimi']);
    expect(s.inventory).toEqual({ berry: 1, meat: 4 });
    expect(s.gold).toBe(888);
    expect(s.battle!.seed).toBe(7);
    expect(s.pendingBattle).toBeUndefined();
    expect(s.testPick).toBeUndefined();
  });

  it('空布阵确认被拒绝（留在当前界面）', () => {
    let s = startTest('battle');
    s = dispatch(s, { type: 'TEST_PICK_PLAYER_CONFIRM', units: [] });
    expect(s.screen).toBe('test-pick');
    expect(s.testPick!.side).toBe('player');
    s = dispatch(s, { type: 'TEST_PICK_PLAYER_CONFIRM', units: mk(['momo']) });
    s = dispatch(s, { type: 'TEST_PICK_ENEMY_CONFIRM', units: [] });
    expect(s.screen).toBe('test-pick');
    expect(s.testPick!.side).toBe('enemy');
  });

  it('非法配置校验：seed 为 0/负数回退 1，金币为负归 0，非正道具过滤', () => {
    const s = runToBattle('battle', ['momo'], ['fifi'], { inventory: { berry: 5, meat: 0, gold: -3 }, gold: -100, seed: 0 });
    expect(s.inventory).toEqual({ berry: 5 });
    expect(s.gold).toBe(0);
    expect(s.battle!.seed).toBe(1);
  });

  it('斗兽场：只取我方第 1 只上阵，敌方 1v1 且不可驯服', () => {
    const s = runToBattle('arena', ['momo', 'lulu', 'fifi'], ['fifi', 'kiki']);
    expect(s.battle!.playerUnits).toHaveLength(1);
    expect(s.battle!.playerUnits[0].speciesId).toBe('momo');
    expect(s.battle!.enemyUnits).toHaveLength(1);
    expect(s.battle!.enemyUnits[0].speciesId).toBe('fifi');
    expect(s.battle!.enemyUnits[0].tameable).toBe(false);
  });

  it('车轮战：我方入替补席按序轮换，敌方不可驯服', () => {
    const s = runToBattle('gauntlet', ['momo', 'lulu', 'fifi'], ['fifi', 'kiki', 'mimi', 'boss_vine']);
    expect(s.battle!.gauntlet).toEqual({ total: 4, current: 1 });
    expect(s.battle!.playerUnits.map((u) => u.speciesId)).toEqual(['momo']);
    expect(s.battle!.playerBench!.map((u) => u.speciesId)).toEqual(['lulu', 'fifi']);
    expect(s.battle!.enemyUnits[0].speciesId).toBe('fifi');
    expect(s.battle!.enemyBench!.map((u) => u.speciesId)).toEqual(['kiki', 'mimi', 'boss_vine']);
    expect(s.battle!.enemyUnits[0].tameable).toBe(false);
  });

  it('被侵蚀：corruptDebuff 传入战斗（多段伤害加深）', () => {
    let s = startTest('corrupted', { corruptDebuff: 'dmg', corruptReward: 'food' });
    expect(s.testPick!.corruptDebuff).toBe('dmg');
    expect(s.testPick!.corruptReward).toBe('food');
    expect(s.map.layers[0][0].corruptDebuff).toBe('dmg');
    s = dispatch(s, { type: 'TEST_PICK_PLAYER_CONFIRM', units: mk(['momo']) });
    s = dispatch(s, { type: 'TEST_PICK_ENEMY_CONFIRM', units: mk(['fifi']) });
    s = dispatch(s, { type: 'TEST_ITEMS_CONFIRM', inventory: {}, gold: 0, seed: 1 });
    expect(s.battle!.corruptDebuff).toBe('dmg');
  });

  it('精英：与普通战斗一致（enemyExact）', () => {
    const s = runToBattle('elite', ['momo'], ['fifi', 'lulu']);
    expect(s.battle!.enemyUnits).toHaveLength(2);
  });

  it('首领：敌方写入 map.boss 且不可驯服', () => {
    let s = startTest('boss');
    s = dispatch(s, { type: 'TEST_PICK_PLAYER_CONFIRM', units: mk(['momo']) });
    s = dispatch(s, { type: 'TEST_PICK_ENEMY_CONFIRM', units: mk(['boss_vine']) });
    expect(s.map.boss.custom_test).toEqual([{ speciesId: 'boss_vine' }]);
    s = dispatch(s, { type: 'TEST_ITEMS_CONFIRM', inventory: {}, gold: 0, seed: 1 });
    expect(s.battle!.enemyUnits[0].speciesId).toBe('boss_vine');
    expect(s.battle!.enemyUnits[0].tameable).toBe(false);
  });

  it('守卫：敌方不可驯服', () => {
    const s = runToBattle('guardian', ['momo'], ['boss_vine']);
    expect(s.battle!.enemyUnits[0].tameable).toBe(false);
  });
});

describe('自定义测试：战斗结束直接回首页', () => {
  it('胜负确认后回到 title，不进入正常结算', () => {
    let s = runToBattle('battle', ['momo'], ['fifi']);
    s = { ...s, battle: { ...s.battle!, phase: 'won' } };
    s = dispatch(s, { type: 'BATTLE_END_CONFIRM' });
    expect(s.screen).toBe('title');
    expect(s.testRun).toBeUndefined();
  });

  it('失败同样直接回首页', () => {
    let s = runToBattle('battle', ['momo'], ['fifi']);
    s = { ...s, battle: { ...s.battle!, phase: 'lost' } };
    s = dispatch(s, { type: 'BATTLE_END_CONFIRM' });
    expect(s.screen).toBe('title');
  });
});

describe('自定义测试：非战斗类节点（不需要宠物，跳过选宠直接进入）', () => {
  it('默认携带 3 只初始宠物（御三家），且都能进化供进化之光选择', () => {
    const s = startTest('event');
    expect(s.screen).toBe('event');
    expect(s.roster.map((u) => u.speciesId)).toEqual(['momo', 'lulu', 'fifi']);
    expect(s.roster.every((u) => nextStage(u.speciesId) !== undefined)).toBe(true);
    expect(s.field).toEqual(s.roster.map((u) => u.uid));
  });

  it('事件：直接进入 event 界面且生成 3 个选项', () => {
    const s = startTest('event');
    expect(s.screen).toBe('event');
    expect(s.map.events.custom_test.choices).toHaveLength(3);
  });

  it('奇遇：直接进入 special 界面且生成 3 个奖励', () => {
    const s = startTest('special');
    expect(s.screen).toBe('special');
    expect(s.map.specials.custom_test.rewards).toHaveLength(3);
  });

  it('进化之光：默认御三家可直接进化到下一形态', () => {
    let s = startTest('special');
    // 覆盖奇遇奖励为「进化之光」，验证默认 3 只初始宠物可直接进化
    s = {
      ...s,
      map: { ...s.map, specials: { ...s.map.specials, custom_test: { title: '奇遇', desc: 'x', rewards: [SPECIAL_REWARDS.find((r) => r.kind === 'evolve')!] } } },
    };
    s = dispatch(s, { type: 'SPECIAL_CHOICE', rewardId: 'sr-evolve' });
    expect(s.screen).toBe('roster');
    expect(s.specialPending).toEqual({ kind: 'evolve', super: false });
    const momo = s.roster.find((u) => u.speciesId === 'momo')!;
    s = dispatch(s, { type: 'EVOLVE_ONE', uid: momo.uid });
    expect(s.roster.find((u) => u.uid === momo.uid)!.speciesId).toBe('momo_queen');
    expect(s.specialPending).toBeUndefined();
  });

  it('商店：直接进入 shop 界面并生成货架', () => {
    const s = startTest('shop');
    expect(s.screen).toBe('shop');
    expect((s.shopStock ?? []).length).toBeGreaterThan(0);
  });

  it('休息：直接进入 rest', () => {
    const s = startTest('rest');
    expect(s.screen).toBe('rest');
  });

  it('双生宝箱：直接进入 chest 开箱', () => {
    const s = startTest('sync');
    expect(s.screen).toBe('chest');
    expect(s.chestResult).toBeDefined();
  });

  it('瞭望塔：直接标记已参观并返回地图', () => {
    const s = startTest('watchtower');
    expect(s.screen).toBe('map');
    expect(s.visitedWatchtowers).toContain('custom_test');
  });

  it('钥匙门：自动配发钥匙并直接开启高级宝箱', () => {
    const s = startTest('keydoor');
    expect(s.screen).toBe('chest');
    expect(s.chestResult).toBeDefined();
    expect(s.map.layers[0][0].guardianId).toBe('custom_test');
    expect(s.inventory[`key_custom_test`]).toBe(0);
  });
});
