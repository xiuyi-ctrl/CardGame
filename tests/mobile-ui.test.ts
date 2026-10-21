// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, Fragment } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { createInitialState } from '../src/game/state/reducer';
import { BattleScreen } from '../src/ui/BattleScreen';
import { FormationScreen } from '../src/ui/FormationScreen';
import { GauntletOrderScreen } from '../src/ui/GauntletOrderScreen';
import { MobileShell } from '../src/ui/mobile';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

describe('手机触屏操作', () => {
  it('切后台保存最新状态，返回菜单不推进回合', async () => {
    const state = { ...createInitialState(), screen: 'map' as const, saveSlot: 4, gold: 12 };
    const dispatch = vi.fn();
    const view = render(createElement(MobileShell, { state, dispatch, canSave: true }));
    view.rerender(createElement(MobileShell, { state: { ...state, gold: 45 }, dispatch, canSave: true }));
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('petCardSave_4')!).main.gold).toBe(45));
    act(() => window.dispatchEvent(new Event('petcard-back')));
    expect(screen.getByRole('dialog', { name: '游戏菜单' })).toBeTruthy();
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('只对触屏小窗口启用手机根样式，卸载后不残留', () => {
    const view = render(createElement(MobileShell, { state: createInitialState(), dispatch: vi.fn(), canSave: false }));
    expect(document.documentElement.classList.contains('mobile-ui')).toBe(true);
    view.unmount();
    expect(document.documentElement.classList.contains('mobile-ui')).toBe(false);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(createElement(MobileShell, { state: createInitialState(), dispatch: vi.fn(), canSave: false }));
    expect(document.documentElement.classList.contains('mobile-ui')).toBe(false);
  });

  it('点击详情不下达攻击；我方手机详情包含技能，返回键优先关闭详情', () => {
    const battle = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 42);
    const state = { ...createInitialState(), screen: 'battle' as const, battle };
    const dispatch = vi.fn();
    render(createElement(Fragment, null,
      createElement(BattleScreen, { state, dispatch }), createElement(MobileShell, { state, dispatch, canSave: false })));
    fireEvent.click(screen.getByRole('button', { name: /查看迅迅我方生物信息/ }));
    expect(screen.getByRole('dialog', { name: '我方生物 Buff' }).textContent).toContain('技能');
    expect(dispatch).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event('petcard-back')));
    expect(screen.queryByRole('dialog', { name: '我方生物 Buff' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: '游戏菜单' })).toBeNull();
  });

  it('目标选择可通过按钮取消，不消耗行动或修改指令', () => {
    const battle = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 42);
    const dispatch = vi.fn();
    render(createElement(BattleScreen, { state: { ...createInitialState(), screen: 'battle', battle }, dispatch }));
    fireEvent.click(screen.getByRole('button', { name: /迅迅，右键或按菜单键查看我方/ }));
    fireEvent.click(document.querySelector('.battle-skill-grid .skill-btn')!);
    expect(document.querySelector('.attack-target')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消选择目标' }));
    expect(document.querySelector('.attack-target')).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('布阵通过点击调整指定位置，确认沿用原动作', () => {
    const units = [makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)];
    const state = { ...createInitialState(), screen: 'formation' as const, roster: units,
      formation: { units, initialField: [units[0]], encounter: [{ speciesId: 'momo' }], nodeId: '' } };
    const dispatch = vi.fn();
    render(createElement(FormationScreen, { state, dispatch }));
    fireEvent.click(screen.getByRole('button', { name: '调整站位' }));
    fireEvent.click(screen.getByRole('button', { name: /我方后排第 3 位/ }));
    fireEvent.click(screen.getByRole('button', { name: /确认出战，当前/ }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'FORMATION_CONFIRM', units: expect.arrayContaining([expect.objectContaining({ uid: units[1].uid, row: 'back', column: 2 })]) }));
  });

  it('车轮战无需拖动可前移伙伴，不改变其数据', () => {
    const units = [makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)];
    const state = { ...createInitialState(), screen: 'gauntlet-order' as const, roster: units, gauntletOrder: units, gauntletSize: 2 };
    const dispatch = vi.fn();
    render(createElement(GauntletOrderScreen, { state, dispatch }));
    fireEvent.click(screen.getByRole('button', { name: `${units[1].name}前移` }));
    fireEvent.click(screen.getByRole('button', { name: /确认出战/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'GAUNTLET_ORDER_CONFIRM', units: [units[1], units[0]] });
  });
});
