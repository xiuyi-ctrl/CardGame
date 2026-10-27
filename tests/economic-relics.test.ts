import { expect, it } from 'vitest';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { battleVictoryGold, mainShopRefreshCost, type GameState } from '../src/game/state/game';
import { createBattle } from '../src/game/core/battle';
import { FOODS } from '../src/game/data/foods';
import { mainShopItemPool } from '../src/game/data/items';
import { parseDualSave } from '../src/ui/persistence';

function fresh(relic = 'greedy_eye', seed = 1): GameState {
  return gameReducer(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'kiki', seed, relic });
}
function shopState(relic = 'greedy_eye', seed = 1) {
  const run = fresh(relic, seed), node = run.map.layers.flat().find(node => node.type === 'shop')!;
  const row = run.map.layers.findIndex(layer => layer.includes(node));
  const parent = run.map.layers[row - 1].find(n => Math.abs(n.col - node.col) <= 1)!;
  const before: GameState = { ...run, screen: 'map', currentRow: row - 1, currentNodeId: parent.id, gold: 1000 };
  return { before, node, state: gameReducer(before, { type: 'MOVE', nodeId: node.id }) };
}

it.each([['battle', 15], ['elite', 30], ['guardian', 30], ['boss', 45], ['corrupted', 30]] as const)('贪婪之眼%s结算%d，提示金额与实际入账共用公式', (type, amount) => {
  const run = fresh(), node = { id: 'fight', type, label: '战斗', col: 0, corruptReward: 'gold' as const };
  const encounter = [{ speciesId: 'momo' }];
  const battle = createBattle(run.roster, encounter, 1); battle.phase = 'won';
  const state: GameState = { ...run, screen: 'battle', currentRow: 0, currentNodeId: 'fight', battle,
    map: { ...run.map, layers: [[node]], encounter: { fight: encounter }, boss: type === 'boss' ? { fight: encounter } : {} } };
  expect(battleVictoryGold(state)).toBe(amount);
  const after = gameReducer(state, { type: 'BATTLE_END_CONFIRM' });
  expect(after.gold - state.gold).toBe(amount);
  expect(after.runStats!.goldEarned - state.runStats!.goldEarned).toBe(amount);
  expect(battleVictoryGold({ ...state, runMode: 'proficiency' })).toBe(type === 'boss' ? 30 : 16);
});

it('精灵事件战斗20变30，奇遇和奖励卡金币不加成', () => {
  const run = fresh(), battle = createBattle(run.roster, [{ speciesId: 'momo' }], 1); battle.phase = 'won';
  const state: GameState = { ...run, screen: 'battle', battle, eventBattle: { enemies: [{ speciesId: 'momo' }], reward: { kind: 'recruit', monsterId: 'momo', amount: 20 }, penalty: { percent: 20 } } };
  const after = gameReducer(state, { type: 'BATTLE_END_CONFIRM' });
  expect(battleVictoryGold(state)).toBe(30); expect(after.gold - state.gold).toBe(30);
  expect(after.toast?.msg).toContain('30 金币');
  const reward: GameState = { ...run, screen: 'reward', rewards: [{ id: 'g', label: '金币', desc: '', kind: 'gold', amount: 30 }] };
  expect(gameReducer(reward, { type: 'PICK_REWARD', rewardId: 'g' }).gold - run.gold).toBe(30);
});

it.each(['normal', 'hard', 'nightmare'] as const)('刷新实付价翻倍且统计实际支出 difficulty=%s', difficulty => {
  const { state } = shopState();
  let current: GameState = { ...state, difficulty };
  for (let count = 0; count < 3; count++) {
    const normal = mainShopRefreshCost({ ...current, relics: [] });
    expect(mainShopRefreshCost(current)).toBe(normal * 2);
    const next = gameReducer(current, { type: 'SHOP_REFRESH' });
    expect(current.gold - next.gold).toBe(normal * 2);
    expect((next.runStats?.shopGoldSpent ?? 0) - (current.runStats?.shopGoldSpent ?? 0)).toBe(normal * 2);
    current = next;
  }
});

it('金属坩埚每个商人只赠一次，读档重入/刷新不重复给，货架与未携带相同', () => {
  const { before, node, state } = shopState('metal_cauldron');
  expect(state.inventory).not.toEqual(before.inventory);
  expect(Object.values(state.inventory).reduce((a, b) => a + b, 0) - Object.values(before.inventory).reduce((a, b) => a + b, 0)).toBe(1);
  const noRelic = gameReducer({ ...before, relics: [] }, { type: 'MOVE', nodeId: node.id });
  expect(state.shopStock).toEqual(noRelic.shopStock);
  const loaded = parseDualSave(JSON.stringify(state))!.main!;
  const again = gameReducer({ ...loaded, screen: 'map', currentRow: before.currentRow, currentNodeId: before.currentNodeId }, { type: 'MOVE', nodeId: node.id });
  expect(again.inventory).toEqual(state.inventory);
  expect(gameReducer(state, { type: 'SHOP_REFRESH' }).inventory).toEqual(state.inventory);
  const other = { ...before, inventory: state.inventory, cauldronClaimedShops: state.cauldronClaimedShops,
    map: { ...before.map, layers: before.map.layers.map(layer => layer.map(n => n.id === node.id ? { ...n, id: `${n.id}-other` } : n)) } };
  const nextShop = gameReducer(other, { type: 'MOVE', nodeId: `${node.id}-other` });
  expect(nextShop.cauldronClaimedShops).toHaveLength(2);
});

it('金属坩埚赠礼食物/道具各半，排除圣果、组合包和远征专属品', () => {
  let foods = 0;
  const itemPool = mainShopItemPool();
  for (let seed = 1; seed <= 400; seed++) {
    const { before, state } = shopState('metal_cauldron', seed);
    const id = Object.keys(state.inventory).find(id => state.inventory[id] > (before.inventory[id] ?? 0))!;
    if (FOODS[id]) { foods++; expect(['berry', 'meat', 'gem']).toContain(id); }
    else expect(itemPool).toContain(id);
    expect(state.toast?.msg).toContain('金属坩埚赠礼');
  }
  expect(foods).toBeGreaterThan(160); expect(foods).toBeLessThan(240);
});

it('金属坩埚按商店实际购买/刷新消费解锁，不用总消费冒充，旧档保留新计数', () => {
  const { state } = shopState('');
  const start = { ...state, shopStock: ['berry'], runStats: { ...state.runStats!, goldSpent: 900, shopGoldSpent: 290 } };
  const invalid = gameReducer({ ...start, gold: 0 }, { type: 'SHOP_BUY', foodId: 'berry' });
  expect(invalid.unlocks!.relics).not.toContain('metal_cauldron');
  const bought = gameReducer(start, { type: 'SHOP_BUY', foodId: 'berry' });
  expect(bought.runStats!.shopGoldSpent).toBe(300);
  expect(bought.unlocks!.relics).toContain('metal_cauldron');
  expect(bought.unlocks!.relics).not.toContain('greedy_eye');
  expect(parseDualSave(JSON.stringify(bought))!.main!.runStats!.shopGoldSpent).toBe(300);
});

it.each([199, 200])('贪婪之眼只在本局结束检查余额%d，胜败均可解锁', gold => {
  const run = { ...fresh(''), gold };
  const live = gameReducer({ ...run, screen: 'map' }, { type: 'OPEN_BACKPACK' });
  expect(live.unlocks!.relics).not.toContain('greedy_eye');
  const battle = createBattle(run.roster, [{ speciesId: 'momo' }], 1); battle.phase = 'lost';
  battle.playerUnits.forEach(unit => { unit.hp = 0; });
  const lost = gameReducer({ ...run, screen: 'battle', battle }, { type: 'BATTLE_END_CONFIRM' });
  expect(lost.screen).toBe('gameover'); expect(lost.unlocks!.relics.includes('greedy_eye')).toBe(gold >= 200);
  const end: GameState = { ...run, screen: 'roster', act: 3, currentNodeId: 'boss', map: { ...run.map, boss: { boss: [{ speciesId: 'boss_vine' }] } } };
  const won = gameReducer(end, { type: 'NEXT_NODE' });
  expect(won.screen).toBe('victory'); expect(won.unlocks!.relics.includes('greedy_eye')).toBe(gold >= 200);
  expect(gameReducer({ ...end, testRun: true }, { type: 'NEXT_NODE' }).unlocks!.relics).not.toContain('greedy_eye');
});
