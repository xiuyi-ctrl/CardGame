import { describe, expect, it } from 'vitest';
import { GROWTH_SHOP_ITEM_IDS } from '../src/game/data/growth-shop';
import { createInitialState, gameReducer } from '../src/game/state/reducer';

describe('熟练度商店购买提示', () => {
  it('全部商品购买 toast 显示中文名而非原始 itemId', () => {
    for (const itemId of GROWTH_SHOP_ITEM_IDS) {
      let state = gameReducer(createInitialState(), { type: 'START_PROFICIENCY_PICKED', seed: 5, starterId: 'momo', companionId: 'lulu' });
      state = { ...state, gold: 500, screen: 'shop' };
      state = gameReducer(state, { type: 'PROF_SHOP_BUY', itemId });
      const msg = state.toast?.msg ?? '';
      expect(msg, `itemId=${itemId}`).not.toBe('');
      expect(msg, `itemId=${itemId}`).toContain(itemId === 'pet_recruit' ? '招募了' : '获得了');
      expect(msg, `itemId=${itemId}`).not.toMatch(/[a-z_]/);
    }
  });

  it('成长之书（中）与复活石的提示文案正确', () => {
    let state = gameReducer(createInitialState(), { type: 'START_PROFICIENCY_PICKED', seed: 5, starterId: 'momo', companionId: 'lulu' });
    state = { ...state, gold: 500, screen: 'shop' };
    state = gameReducer(state, { type: 'PROF_SHOP_BUY', itemId: 'book_medium' });
    expect(state.toast?.msg).toBe('获得了 成长之书（中），请在背包中使用');

    state = { ...state, gold: 500 };
    state = gameReducer(state, { type: 'PROF_SHOP_BUY', itemId: 'revival_stone' });
    expect(state.toast?.msg).toBe('获得了 复活石，请在背包中使用');
  });
});
