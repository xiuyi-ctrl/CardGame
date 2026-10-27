import { describe, expect, it } from 'vitest';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { EVENT_TYPE_LABELS, SPECIAL_REWARDS, type NodeType, type TestScenario } from '../src/game/state/game';
import { GROWTH_EVENT_NAMES, GROWTH_EVENT_TYPES } from '../src/game/data/growth-events';
import { GROWTH_SPECIAL_REWARDS } from '../src/game/data/growth-special';
import { makeUnit } from '../src/game/core/battle';

export function testScenario(patch: Partial<TestScenario> = {}): TestScenario {
  return { mode: 'main', region: 'mixed', difficulty: 'normal', act: 2, layer: 5, seed: 42,
    gold: 500, itemCount: 2, hpPercent: 50, deadCount: 1, customParty: false, nodeType: 'event', ...patch };
}
function start(patch: Partial<TestScenario> = {}) {
  const scenario = testScenario(patch);
  return gameReducer(createInitialState(), { type: 'TEST_TYPE_PICK', nodeType: scenario.nodeType, scenario });
}

describe('自主测试场景', () => {
  it.each(Object.entries(EVENT_TYPE_LABELS))('主模式可指定%s，不被入口随机覆盖', (eventType, title) => {
    const state = start({ eventType });
    expect(state.screen).toBe('event');
    expect(state.map.events.custom_test.title).toBe(title);
    expect(state.testRun).toBe(true);
    expect(state.saveSlot).toBeUndefined();
    for (const choice of state.map.events.custom_test.choices) {
      expect(gameReducer(state, { type: 'EVENT_CHOICE', choiceId: choice.id, ...(choice.kind === 'coin' ? { coinSide: 'heads' as const } : {}) })).not.toBe(state);
    }
  });
  it.each(GROWTH_EVENT_TYPES)('熟练度可指定事件%s，墓地和成长点满足测试前提', eventType => {
    const state = start({ mode: 'proficiency', eventType });
    expect(state.screen).toBe('event');
    expect(state.map.events.custom_test.title).toBe(GROWTH_EVENT_NAMES[eventType]);
    expect(state.deadPets).toHaveLength(1);
    expect(state.roster.every(unit => unit.growthPoints === 100)).toBe(true);
    for (const choice of state.map.events.custom_test.choices) {
      expect(gameReducer(state, { type: 'EVENT_CHOICE', choiceId: choice.id })).not.toBe(state);
    }
  });
  it.each(SPECIAL_REWARDS.map(reward => reward.id))('主模式奇遇%s可以定向测试', specialId => {
    const state = start({ nodeType: 'special', specialId });
    expect(state.screen).toBe('special');
    expect(state.map.specials.custom_test.rewards.map(reward => reward.id)).toEqual([specialId]);
    expect(gameReducer(state, { type: 'SPECIAL_CHOICE', rewardId: specialId })).not.toBe(state);
  });
  it.each(Object.keys(GROWTH_SPECIAL_REWARDS))('熟练度奇遇%s可以定向测试', specialId => {
    const state = start({ mode: 'proficiency', nodeType: 'special', specialId });
    expect(state.map.specials.custom_test.rewards.map(reward => reward.id)).toEqual([specialId]);
    expect(gameReducer(state, { type: 'SPECIAL_CHOICE', rewardId: specialId })).not.toBe(state);
  });
  it.each([['shop', 'shop'], ['rest', 'rest'], ['watchtower', 'watchtower'], ['sync', 'chest'], ['keydoor', 'chest']] as const)(
    '主模式%s有独立可操作内容', (nodeType, screen) => {
      const state = start({ nodeType });
      expect(state.screen).toBe(screen);
      if (nodeType === 'watchtower') expect(state.map.layers[state.currentRow + 1].length).toBeGreaterThan(0);
      if (nodeType === 'sync') expect(state.chestResult).toHaveLength(2);
      if (nodeType === 'shop') expect(state.shopStock).toHaveLength(4);
    });
  it.each(['blacksmith', 'arena3', 'rest', 'shop'] as const)('熟练度%s直接可测', nodeType => {
    expect(start({ mode: 'proficiency', nodeType }).screen).toBe(nodeType);
  });
  it.each(['battle', 'elite', 'boss', 'corrupted', 'guardian', 'arena', 'gauntlet'] as NodeType[])(
    '%s自动阵容按实际节点流程进入，战斗确认后可检查真实奖励', nodeType => {
      let state = start({ nodeType, act: 3 });
      if (state.screen === 'roster') state = gameReducer(state, { type: 'SPECIAL_TARGET', uid: state.roster[0].uid });
      if (state.screen === 'gauntlet-order') state = gameReducer(state, { type: 'GAUNTLET_ORDER_CONFIRM', units: state.roster.slice(0, 3) });
      if (state.screen === 'formation') state = gameReducer(state, { type: 'FORMATION_CONFIRM', units: state.formation!.initialField });
      expect(state.screen).toBe('battle');
      expect(state.battle!.enemyUnits.length).toBeGreaterThan(0);
      const won = { ...state, battle: { ...state.battle!, phase: 'won' as const } };
      const after = gameReducer(won, { type: 'BATTLE_END_CONFIRM' });
      expect(after.screen).not.toBe('title');
      expect(after.testRun).toBe(true);
    });
  it('自选非战斗伙伴后直接进事件，自选战斗双方分阶段切换', () => {
    const unit = makeUnit('fire_fox', true, 0, false);
    let state = start({ customParty: true });
    expect(state.screen).toBe('test-pick');
    state = gameReducer(state, { type: 'TEST_PICK_PLAYER_CONFIRM', units: [unit] });
    expect(state.screen).toBe('event');
    expect(state.roster.map(u => u.speciesId)).toEqual(['fire_fox']);
    state = start({ customParty: true, nodeType: 'battle' });
    state = gameReducer(state, { type: 'TEST_PICK_PLAYER_CONFIRM', units: [unit] });
    expect(state.testPick?.side).toBe('enemy');
    state = gameReducer(state, { type: 'TEST_PICK_ENEMY_CONFIRM', units: [makeUnit('coal', false, 0, false)] });
    expect(state.screen).toBe('test-config');
    state = gameReducer(state, { type: 'TEST_ITEMS_CONFIRM', inventory: {}, gold: 7, seed: 53 });
    expect(state.battle?.seed).toBe(53);
    expect(state.battle?.playerUnits.map(u => u.speciesId)).toEqual(['fire_fox']);
    expect(state.battle?.enemyUnits.map(u => u.speciesId)).toEqual(['coal']);
  });
  it('重置恢复原始随机结果、伙伴和物资，原始正常存档对象不变', () => {
    const normal = { ...createInitialState(), saveSlot: 2, gold: 777 };
    const previous = JSON.stringify(normal);
    const hub = gameReducer(normal, { type: 'DEBUG_CUSTOM_TEST' });
    expect(hub.saveSlot).toBeUndefined();
    expect(hub.testRun).toBe(true);
    const scenario = testScenario({ nodeType: 'event', eventType: 'merchant', partySize: 8 });
    const state = gameReducer(hub, { type: 'TEST_TYPE_PICK', nodeType: 'event', scenario });
    expect(state.roster).toHaveLength(8);
    expect(state.roster[0].hp).toBe(Math.round(state.roster[0].maxHp / 2));
    const changed = gameReducer(state, { type: 'EVENT_CHOICE', choiceId: state.map.events.custom_test.choices[1].id });
    const reset = gameReducer(changed, { type: 'TEST_REPLAY' });
    expect(reset.gold).toBe(state.gold);
    expect(reset.roster).toEqual(state.roster);
    expect(reset.inventory).toEqual(state.inventory);
    expect(reset.map.events).toEqual(state.map.events);
    expect(JSON.stringify(normal)).toBe(previous);
  });
});
