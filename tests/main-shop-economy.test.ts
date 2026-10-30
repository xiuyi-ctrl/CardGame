import { expect, it } from 'vitest';
import { FOOD_BUNDLES, generateMainShopStock, getMainShopOffer } from '../src/game/data/main-shop';
import { FOODS } from '../src/game/data/foods';
import { ITEMS, mainShopItemPool } from '../src/game/data/items';
import { createRng } from '../src/game/rng';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { battleVictoryGold, DIFFICULTY_CONFIG, nodeInfo, type GameState } from '../src/game/state/game';

function shop(seed = 1, difficulty: GameState['difficulty'] = 'normal') {
  const run = gameReducer(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'kiki', seed, difficulty });
  const node = run.map.layers.flat().find(n => n.type === 'shop')!;
  const row = run.map.layers.findIndex(layer => layer.includes(node));
  const parent = run.map.layers[row - 1].find(n => Math.abs(n.col - node.col) <= 1)!;
  const before: GameState = { ...run, screen: 'map', currentRow: row - 1, currentNodeId: parent.id, gold: 500 };
  return { before, node, state: gameReducer(before, { type: 'MOVE', nodeId: node.id }) };
}

function checkStock(stock: string[]) {
  expect(new Set(stock).size).toBe(4);
  expect(stock.some(id => !!FOODS[id] && !FOODS[id].guaranteed && FOODS[id].baseTame > 0)).toBe(true);
  expect(stock.some(id => ITEMS[id]?.usableInBattle)).toBe(true);
  expect(stock.filter(id => FOOD_BUNDLES[id]).length).toBeLessThanOrEqual(1);
  expect(stock.every(id => getMainShopOffer(id)!.price > 0)).toBe(true);
}

it('种子货架稳定满足食物/药水保底，组合包约40%、每轮至多一个', () => {
  let bundles = 0;
  const seen = new Set<string>();
  for (let seed = 1; seed <= 1000; seed++) {
    const stock = generateMainShopStock(createRng(seed));
    checkStock(stock);
    expect(stock).toEqual(generateMainShopStock(createRng(seed)));
    for (const id of stock.filter(id => FOOD_BUNDLES[id])) { bundles++; seen.add(id); }
  }
  expect(bundles).toBeGreaterThan(350);
  expect(bundles).toBeLessThan(450);
  expect([...seen].sort()).toEqual(Object.keys(FOOD_BUNDLES).sort());
  expect(mainShopItemPool().some(id => FOOD_BUNDLES[id])).toBe(false);
  expect(Object.keys(FOODS).some(id => FOOD_BUNDLES[id])).toBe(false);
});

it.each(['normal', 'hard', 'nightmare'] as const)('组合包按难度整包扣费并拆为普通食物，禁止重复/不足购买 %s', difficulty => {
  for (const offer of Object.values(FOOD_BUNDLES)) {
    const { state } = shop(1, difficulty);
    const start = { ...state, shopStock: [offer.id, 'berry', 'atk_up', 'scout'], shopBoughtItems: [] };
    const price = Math.round(offer.price * DIFFICULTY_CONFIG[difficulty].shopPriceMult);
    const bought = gameReducer(start, { type: 'SHOP_BUY', foodId: offer.id });
    expect(start.gold - bought.gold).toBe(price);
    expect(bought.inventory[offer.inventoryId]).toBe((start.inventory[offer.inventoryId] ?? 0) + offer.amount);
    expect(bought.inventory[offer.id]).toBeUndefined();
    expect(bought.runStats!.goldSpent - start.runStats!.goldSpent).toBe(price);
    expect(gameReducer(bought, { type: 'SHOP_BUY', foodId: offer.id })).toBe(bought);
    const poor = { ...start, gold: price - 1 };
    expect(gameReducer(poor, { type: 'SHOP_BUY', foodId: offer.id })).toBe(poor);
  }
});

it('初始货架与侦查一致，三次刷新始终保底，旧库存购买不重抽', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { before, node, state } = shop(seed, 'hard');
    const preview = nodeInfo(before, node);
    checkStock(state.shopStock!);
    for (const id of state.shopStock!) {
      const offer = getMainShopOffer(id)!;
      expect(preview.shopItems).toContainEqual({ name: offer.name, price: Math.round(offer.price * 1.1) });
    }
    let current = state;
    for (let count = 0; count < 3; count++) {
      const refreshed = gameReducer(current, { type: 'SHOP_REFRESH' });
      checkStock(refreshed.shopStock!);
      expect(refreshed.shopBoughtItems).toEqual([]);
      expect(current.gold - refreshed.gold).toBe(Math.round([10, 15, 25][count] * 1.1));
      current = refreshed;
    }
    const old = { ...state, shopStock: ['berry', 'meat', 'gem', 'scout'] };
    expect(gameReducer(old, { type: 'SHOP_BUY', foodId: 'berry' }).shopStock).toEqual(old.shopStock);
  }
});

it('主模式食物侵蚀金币10，熟练度按第一层段普通战12金币发放', () => {
  const { state } = shop();
  const base: GameState = { ...state, currentRow: 0, currentNodeId: 'fight', map: { ...state.map,
    layers: [[{ id: 'fight', type: 'corrupted', col: 0, label: '侵蚀', corruptReward: 'food' }]],
    encounter: { fight: [{ speciesId: 'momo' }] }, boss: {} } };
  expect(battleVictoryGold(base)).toBe(10);
  expect(battleVictoryGold({ ...base, runMode: 'proficiency' })).toBe(12);
});
