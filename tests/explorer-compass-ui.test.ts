// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { MapScreen, WatchtowerScreen, DifficultyScreen } from '../src/ui/App';
import { RELIC_ORDER, type GameState } from '../src/game/state/game';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function setup(): GameState {
  const base = gameReducer(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'kiki', seed: 42 });
  return { ...base, screen: 'map', relics: ['explorer_compass'], map: { ...base.map,
    layers: Array.from({ length: 7 }, (_, i) => [{ id: `tower${i}`, type: 'watchtower', label: '瞭望塔', col: 0 }]), encounter: {}, boss: {} } };
}

it.each([false, true])('罗盘地图上未访问塔可直接预览，当前可达塔点击也不直接行走 mobile=%s', mobile => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const dispatch = vi.fn();
  render(createElement(MapScreen, { state: setup(), dispatch }));
  for (const row of [1, 4]) {
    const button = screen.getByRole('button', { name: `第${row}层 瞭望塔，查看罗盘情报` });
    expect(button.getAttribute('aria-disabled')).toBe('false');
    fireEvent.click(button);
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'OPEN_WATCHTOWER', nodeId: `tower${row - 1}` });
  }
  expect(dispatch.mock.calls.some(([action]) => action.type === 'MOVE')).toBe(false);
});

it('远程情报以被查看的塔为起点只展示后三层，不能进入不可达节点', () => {
  const base = setup();
  const state = gameReducer(base, { type: 'OPEN_WATCHTOWER', nodeId: 'tower2' });
  const dispatch = vi.fn();
  render(createElement(WatchtowerScreen, { state, dispatch }));
  expect(screen.getByRole('button', { name: '第 4 层' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '第 6 层' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '第 2 层' })).toBeNull();
  expect(screen.queryByRole('button', { name: '前往此瞭望塔' })).toBeNull();
});

it('当前可达的罗盘预览提供独立行走按钮，关闭只关闭预览', () => {
  const state = gameReducer(setup(), { type: 'OPEN_WATCHTOWER', nodeId: 'tower0' });
  const dispatch = vi.fn();
  render(createElement(WatchtowerScreen, { state, dispatch }));
  fireEvent.click(screen.getByRole('button', { name: '前往此瞭望塔' }));
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'MOVE', nodeId: 'tower0' });
  fireEvent.click(screen.getByRole('button', { name: '关闭瞭望' }));
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'CLOSE_WATCHTOWER' });
});

it('第八件遗物可正常选择并传入新局配置', () => {
  const state = setup(); state.unlocks = { ...state.unlocks!, relics: RELIC_ORDER };
  const dispatch = vi.fn();
  render(createElement(DifficultyScreen, { state, dispatch }));
  fireEvent.click(screen.getByRole('button', { name: /探险家罗盘/ }));
  expect(screen.getAllByText('无需经过节点，即可随时查看本幕所有瞭望塔后三层的情报')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: /下一步：选择伙伴/ }));
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'SET_PRERUN_CONFIG', difficulty: 'normal', relic: 'explorer_compass' });
});
