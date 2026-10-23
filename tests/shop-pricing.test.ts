import { describe, expect, it } from 'vitest';
import { FOODS } from '../src/game/data/foods';
import { ITEMS, mainShopItemPool } from '../src/game/data/items';
import { DIFFICULTY_CONFIG, MAIN_SHOP_REFRESH_COSTS, type GameState } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';

const prices: Record<string, number> = {
  berry: 10, meat: 20, gem: 30, scout: 20, twin: 25,
  atk_up: 30, spd_up: 30, hp_up: 30, atk_down: 30, spd_down: 30, hp_down: 30,
};

function shop(difficulty: GameState['difficulty'] = 'normal'): GameState {
  return { ...createInitialState(), screen: 'shop', difficulty, gold: 1000,
    currentRow: 0, currentNodeId: 'shop-pricing',
    map: { layers: [[{ id: 'shop-pricing', type: 'shop', label: '商店', col: 0 }]],
      encounter: {}, boss: {}, events: {}, specials: {} },
    shopStock: Object.keys(prices), shopBoughtItems: [], shopRefreshCount: 0 };
}

describe('主模式商店价格', () => {
  it('基础售价与在售商品范围正确', () => {
    for (const [id, price] of Object.entries(prices)) expect((FOODS[id] ?? ITEMS[id]).price).toBe(price);
    expect(MAIN_SHOP_REFRESH_COSTS).toEqual([10, 15, 25]);
    expect(mainShopItemPool()).not.toContain('purify');
    expect(mainShopItemPool()).not.toContain('skip');
  });

  for (const difficulty of ['normal', 'hard', 'nightmare'] as const) {
    it.each(Object.entries(prices))(`${difficulty}：%s 按基础价格与难度倍率扣费`, (id, price) => {
      const state = shop(difficulty);
      const after = gameReducer(state, { type: 'SHOP_BUY', foodId: id });
      const cost = Math.round(price * DIFFICULTY_CONFIG[difficulty].shopPriceMult);
      expect(after.gold).toBe(state.gold - cost);
      expect(after.inventory[id]).toBe((state.inventory[id] ?? 0) + 1);
      expect(after.runStats!.goldSpent).toBe(state.runStats!.goldSpent + cost);
      expect(gameReducer(after, { type: 'SHOP_BUY', foodId: id })).toBe(after);
      const poor = { ...state, gold: cost - 1 };
      expect(gameReducer(poor, { type: 'SHOP_BUY', foodId: id })).toBe(poor);
    });

    it(`${difficulty}：依次刷新10/15/25基础金币，最多三次`, () => {
      let state = shop(difficulty);
      for (const basePrice of [10, 15, 25]) {
        const after = gameReducer({ ...state, shopBoughtItems: ['berry'] }, { type: 'SHOP_REFRESH' });
        expect(after.gold).toBe(state.gold - Math.round(basePrice * DIFFICULTY_CONFIG[difficulty].shopPriceMult));
        expect(after.shopRefreshCount).toBe(state.shopRefreshCount! + 1);
        expect(after.shopStock).toHaveLength(4);
        expect(after.shopBoughtItems).toEqual([]);
        state = after;
      }
      const fourth = gameReducer(state, { type: 'SHOP_REFRESH' });
      expect(fourth.gold).toBe(state.gold);
      expect(fourth.shopRefreshCount).toBe(3);
    });
  }

  it('余额不足不能刷新，读档保留的刷新次数对应原梯度', () => {
    const poor = { ...shop(), gold: 9 };
    expect(gameReducer(poor, { type: 'SHOP_REFRESH' })).toBe(poor);
    const saved = { ...shop(), shopRefreshCount: 2 };
    expect(gameReducer(saved, { type: 'SHOP_REFRESH' }).gold).toBe(975);
  });
});
