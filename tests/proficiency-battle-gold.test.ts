import { expect, it } from 'vitest';
import { battleVictoryGold, proficiencyBattleGold, type GameState } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { createBattle } from '../src/game/core/battle';

function setup(layer: number, type: 'battle' | 'elite' | 'boss'): GameState {
  const state = gameReducer(createInitialState(), { type: 'START_PROFICIENCY_PICKED', seed: 2, starterId: 'momo', companionId: 'lulu' });
  const node = { id: `pf_${layer}`, type, col: 0, label: '测试战斗' }, enemies = [{ speciesId: 'kiki' }];
  const battle = createBattle(state.roster, enemies, 2); battle.phase = 'won'; battle.log = [];
  battle.enemyUnits.forEach(unit => { unit.hp = 0; });
  return { ...state, screen: 'battle', currentLayer: layer, currentRow: layer - 1, currentNodeId: node.id, battle,
    map: { ...state.map, layers: Array.from({ length: layer }, (_, index) => index === layer - 1 ? [node] : [{ id: `pf_${index + 1}`, type: 'battle', col: 0, label: '普通战' }]),
      encounter: {}, boss: type === 'boss' ? { [node.id]: enemies } : {} } };
}
it.each([[1, 12, 20, 50], [15, 12, 20, 50], [16, 16, 30, 80], [30, 16, 30, 80], [31, 20, 40, 100], [50, 20, 40, 100]])('第%d层三类战斗奖励、实际入账与统计一致', (layer, normal, elite, boss) => {
  for (const [type, amount] of [['battle', normal], ['elite', elite], ['boss', boss]] as const) {
    const state = setup(layer, type);
    expect(proficiencyBattleGold(layer, type)).toBe(amount);
    expect(battleVictoryGold(state)).toBe(amount);
    const settled = gameReducer(state, { type: 'BATTLE_END_CONFIRM' });
    expect(settled.gold - state.gold).toBe(amount);
    expect(settled.runStats!.goldEarned - state.runStats!.goldEarned).toBe(amount);
    expect(gameReducer(settled, { type: 'BATTLE_END_CONFIRM' })).toBe(settled);
  }
});
it('节点类型决定奖励：无遭遇缓存的精英有加成，缓存普通敌人不冒充精英', () => {
  const normal = setup(20, 'battle'); normal.map.encounter[normal.currentNodeId] = [{ speciesId: 'kiki' }];
  expect(battleVictoryGold(normal)).toBe(16);
  expect(battleVictoryGold(setup(20, 'elite'))).toBe(30);
});
it.each([15, 16, 30, 31])('跳到第%d层先同步层数，普通及精英跳关与实战金币一致', layer => {
  for (const type of ['battle', 'elite'] as const) {
    const state = setup(layer, type);
    const before: GameState = { ...state, screen: 'map', battle: undefined, currentNodeId: '', currentLayer: layer - 1, inventory: { skip: 1 } };
    const skipped = gameReducer(before, { type: 'USE_SKIP', nodeId: state.currentNodeId });
    expect(skipped.currentLayer).toBe(layer);
    expect(skipped.gold - before.gold).toBe(battleVictoryGold(state));
    expect(skipped.runStats!.goldEarned - before.runStats!.goldEarned).toBe(battleVictoryGold(state));
    expect(skipped.inventory.skip).toBe(0); expect(skipped.screen).toBe('growth-menu');
    expect(gameReducer(skipped, { type: 'USE_SKIP', nodeId: state.currentNodeId })).toBe(skipped);
  }
});
it('首领普通跳关被拒绝，免费测试跳关按首领奖励，主模式和事件专属奖励不变', () => {
  const state = setup(30, 'boss'), before: GameState = { ...state, screen: 'map', currentNodeId: '', battle: undefined, inventory: { skip: 1 } };
  expect(gameReducer(before, { type: 'USE_SKIP', nodeId: state.currentNodeId })).toBe(before);
  expect(gameReducer(before, { type: 'USE_SKIP', nodeId: state.currentNodeId, free: true }).gold - before.gold).toBe(80);
  expect(battleVictoryGold({ ...setup(30, 'elite'), runMode: undefined })).toBe(20);
  expect(battleVictoryGold({ ...setup(30, 'elite'), eventBattle: { enemies: [{ speciesId: 'momo' }], reward: { kind: 'gold', amount: 27 }, penalty: {} } })).toBe(27);
});
