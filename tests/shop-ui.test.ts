// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { makeUnit } from '../src/game/core/battle';
import { createInitialState } from '../src/game/state/reducer';
import { ShopScreen } from '../src/ui/App';

afterEach(cleanup);

describe('商店界面', () => {
  it('贪婪之眼刷新按难度实付价格翻倍，商品单价不变', () => {
    const state = { ...createInitialState(), screen: 'shop' as const, difficulty: 'hard' as const,
      relics: ['greedy_eye'], shopRefreshCount: 1, gold: 40, shopStock: ['berry', 'atk_up', 'gem', 'scout'] };
    render(createElement(ShopScreen, { state, dispatch: vi.fn() }));
    expect(screen.getByText('花费 34 金币 · 剩余 2 次')).toBeTruthy();
    expect(screen.getByRole('button', { name: '购买 浆果' })).toBeTruthy();
  });
  it('组合包显示数量、食物图标和难度价格，沿用购买与售罄状态', () => {
    const dispatch = vi.fn();
    const { container } = render(createElement(ShopScreen, { dispatch, state: {
      ...createInitialState(), screen: 'shop', difficulty: 'hard', gold: 40,
      shopStock: ['bundle_berry', 'bundle_meat', 'bundle_gem', 'atk_up'], shopBoughtItems: ['bundle_meat'],
    } }));
    expect(container.querySelectorAll('.shop-product-icon img, .shop-product-icon svg')).toHaveLength(4);
    expect([...container.querySelectorAll('.shop-price')].map(el => el.textContent)).toEqual(['28', '39', '55', '33']);
    expect(screen.getByRole('button', { name: '已购买 鲜肉组合包 ×2' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '金币不足 秘晶组合包 ×2' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '购买 浆果组合包 ×3' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'SHOP_BUY', foodId: 'bundle_berry' });
  });
  it('主线显示四件商品、难度实付价格、购买状态及移除休整', () => {
    const dispatch = vi.fn();
    const unit = { ...makeUnit('momo', true, 0, false), hp: 0 };
    const state = {
      ...createInitialState(), screen: 'shop' as const, difficulty: 'hard' as const,
      roster: [unit], field: [unit.uid], gold: 20,
      shopStock: ['berry', 'meat', 'gem', 'scout'], shopBoughtItems: ['meat'], shopRefreshCount: 1,
    };
    const { container } = render(createElement(ShopScreen, { state, dispatch }));

    expect(container.querySelectorAll('.shop-product')).toHaveLength(4);
    expect(container.querySelectorAll('.shop-product-icon img, .shop-product-icon svg')).toHaveLength(4);
    expect(screen.getByText('林间商铺')).toBeTruthy();
    expect(screen.getByText('花费 17 金币 · 剩余 2 次')).toBeTruthy();
    expect(screen.getByRole('button', { name: '已购买 鲜肉' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '金币不足 秘晶' }).hasAttribute('disabled')).toBe(true);
    expect([...container.querySelectorAll('.shop-price')].map((el) => el.textContent)).toEqual(['11', '22', '33', '22']);
    fireEvent.click(screen.getByRole('button', { name: '购买 浆果' }));
    expect(screen.queryByRole('button', { name: '休整' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    fireEvent.click(screen.getByRole('button', { name: '离开' }));
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: 'SHOP_BUY', foodId: 'berry' },
      { type: 'SHOP_REFRESH' }, { type: 'NEXT_NODE' },
    ]);
  });

  it('熟练度远征显示专属商品与刷新，不显示免费休整', () => {
    const dispatch = vi.fn();
    const state = {
      ...createInitialState(), screen: 'shop' as const, runMode: 'proficiency' as const,
      currentLayer: 12, gold: 35, shopStock: ['book_small', 'heal_potion', 'skill_enhance_stone', 'revival_stone'],
      shopBoughtItems: ['heal_potion'],
    };
    const { container } = render(createElement(ShopScreen, { state, dispatch }));

    expect(screen.getByText('远征补给站')).toBeTruthy();
    expect(screen.getByText('花费 5 金币 · 剩余 3 次')).toBeTruthy();
    expect(screen.getByText('熟练度远征 · 第 12 层')).toBeTruthy();
    expect(container.querySelectorAll('.shop-product')).toHaveLength(4);
    expect(screen.queryByText('立即休整')).toBeNull();
    expect(screen.getByRole('button', { name: '已购买 治疗圣水' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '购买 成长之书（小）' }));
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: 'PROF_SHOP_BUY', itemId: 'book_small' }, { type: 'PROF_SHOP_REFRESH' },
    ]);
  });
});
