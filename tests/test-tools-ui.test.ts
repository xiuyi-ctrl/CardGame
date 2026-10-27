// @vitest-environment jsdom
import { createElement, useReducer } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App, { TestTypeScreen, TestPickScreen, TestConfigScreen, EventScreen } from '../src/ui/App';
import { TestSessionFrame } from '../src/ui/TestSetupScreen';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { persistSave, clearDeletedSlot } from '../src/ui/persistence';

beforeEach(() => { localStorage.clear(); clearDeletedSlot(1); });
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

it.each([false, true])('首页测试按钮直接打开测试页 mobile=%s', mobile => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  render(createElement(App));
  fireEvent.click(screen.getByRole('button', { name: '测试关卡' }));
  expect(screen.getByRole('heading', { name: '关卡测试' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '进入测试' })).toBeTruthy();
  expect(screen.queryByText('直接进入')).toBeNull();
});

function Flow() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => gameReducer(createInitialState(), { type: 'DEBUG_CUSTOM_TEST' }));
  const component = state.screen === 'test-type' ? TestTypeScreen : state.screen === 'test-pick' ? TestPickScreen : state.screen === 'test-config' ? TestConfigScreen : state.screen === 'event' ? EventScreen : null;
  return createElement(TestSessionFrame, { state, dispatch, children: createElement('div', null,
    component && createElement(component, { key: state.screen + state.testPick?.side, state, dispatch }),
    createElement('output', { 'data-testid': 'state' }, JSON.stringify({ screen: state.screen, gold: state.gold, side: state.testPick?.side }))) });
}

it('可选具体事件、设定物资、重置和重选，不需要重新进入首页', () => {
  render(createElement(Flow));
  fireEvent.click(screen.getByRole('button', { name: '事件' }));
  fireEvent.change(screen.getByLabelText('具体事件'), { target: { value: 'merchant' } });
  fireEvent.change(screen.getByLabelText('金币'), { target: { value: '123' } });
  fireEvent.click(screen.getByRole('button', { name: '进入测试' }));
  expect(screen.getByRole('heading', { name: '流浪商人' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /打探消息/ }));
  expect(screen.getByTestId('state').textContent).toContain('143');
  fireEvent.click(screen.getByRole('button', { name: '重置本关' }));
  expect(screen.getByTestId('state').textContent).toContain('123');
  fireEvent.click(screen.getByRole('button', { name: '重选测试' }));
  expect((screen.getByLabelText('具体事件') as HTMLSelectElement).value).toBe('merchant');
});

it('主模式13事件、7奇遇及熟练度10事件、6奇遇均可独立选择', () => {
  render(createElement(Flow));
  fireEvent.click(screen.getByRole('button', { name: '事件' }));
  expect(screen.getByLabelText('具体事件').querySelectorAll('option')).toHaveLength(13);
  fireEvent.click(screen.getByRole('button', { name: '奇遇' }));
  expect(screen.getByLabelText('具体奇遇').querySelectorAll('option')).toHaveLength(8);
  fireEvent.change(screen.getByLabelText('模式'), { target: { value: 'proficiency' } });
  fireEvent.click(screen.getByRole('button', { name: '事件' }));
  expect(screen.getByLabelText('具体事件').querySelectorAll('option')).toHaveLength(10);
  fireEvent.click(screen.getByRole('button', { name: '奇遇' }));
  expect(screen.getByLabelText('具体奇遇').querySelectorAll('option')).toHaveLength(7);
  expect(screen.getByRole('button', { name: '铁匠铺' })).toBeTruthy();
});

it('我方确认后敌方从空阵容开始，非战斗自选伙伴不要求选敌人', () => {
  render(createElement(Flow));
  fireEvent.click(screen.getByLabelText('自选伙伴／敌人（战斗类可配置双方）'));
  fireEvent.click(screen.getByRole('button', { name: '下一步：选择伙伴' }));
  fireEvent.click(screen.getByRole('button', { name: /确认我方出战/ }));
  expect(screen.getByText('👥 已选 0/6 只')).toBeTruthy();
  expect(screen.getByRole('button', { name: /确认敌方阵容/ }).hasAttribute('disabled')).toBe(true);
});

it('保存入口拒绝测试局，即使意外携带正式槽位也不覆盖', async () => {
  const regular = { ...createInitialState(), screen: 'map' as const, saveSlot: 1, gold: 777 };
  expect(await persistSave(regular)).toBe(true);
  const before = localStorage.getItem('petCardSave_1');
  expect(before).not.toBeNull();
  expect(await persistSave({ ...regular, testRun: true, gold: 1 })).toBe(false);
  expect(await persistSave({ ...regular, screen: 'test-type', gold: 2 })).toBe(false);
  expect(localStorage.getItem('petCardSave_1')).toBe(before);
});

it('手机测试选宠可拖动到空位，拖动后的点击不误下阵', () => {
  vi.stubGlobal('PointerEvent', class extends MouseEvent { pointerType = 'touch'; pointerId = 1; });
  render(createElement(Flow));
  fireEvent.click(screen.getByLabelText('自选伙伴／敌人（战斗类可配置双方）'));
  fireEvent.click(screen.getByRole('button', { name: '下一步：选择伙伴' }));
  const origin = screen.getByRole('button', { name: /前排1：迅天/ });
  const target = screen.getByRole('button', { name: /后排3：空位/ });
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });
  try {
    const portrait = origin.querySelector('[draggable]')!;
    fireEvent.pointerDown(portrait, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(portrait, { clientX: 100, clientY: 100 });
    fireEvent.pointerUp(portrait, { clientX: 100, clientY: 100 });
    expect(screen.getByRole('button', { name: /后排3：迅天/ })).toBeTruthy();
    fireEvent.click(target);
    expect(screen.getByRole('button', { name: /后排3：迅天/ })).toBeTruthy();
  } finally { Reflect.deleteProperty(document, 'elementFromPoint'); }
});
