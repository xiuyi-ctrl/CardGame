// @vitest-environment jsdom
import { createElement, useReducer } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { RegionScreen, DifficultyScreen, StarterScreen } from '../src/ui/App';
import { MobileShell } from '../src/ui/mobile';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { parseDualSave } from '../src/ui/persistence';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const unlocks = { ...createInitialState().unlocks!, difficulties: ['normal', 'hard'] as ('normal' | 'hard')[], relics: ['traveler_charm'] };

function Flow() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => gameReducer(createInitialState(), { type: 'STARTER', saveSlot: 3, unlocks }));
  const C = state.screen === 'region-select' ? RegionScreen : state.screen === 'difficulty-select' ? DifficultyScreen : state.screen === 'starter' ? StarterScreen : null;
  return createElement('div', null,
    C && createElement(C, { key: state.screen + state.region, state, dispatch }),
    createElement('output', { 'data-testid': 'state' }, JSON.stringify(state)),
    createElement(MobileShell, { state, dispatch, canSave: false }));
}

function setup(mobile = false) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  render(createElement(Flow));
}

const current = () => JSON.parse(screen.getByTestId('state').textContent!);
const chooseForest = () => {
  fireEvent.click(screen.getByRole('button', { name: /翠影林地.*神秘林地/ }));
  fireEvent.click(screen.getByRole('button', { name: '下一步：难度与遗物' }));
};

describe('地区开局流程', () => {
  it('生态详情仅展示林地全部形态的未遇见轮廓，关闭后保留地区选择且不进入新局', () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute('open'); } });
    try {
      setup(true);
      expect(screen.queryByText('新远征 1/4')).toBeNull();
      expect(screen.queryByText(/7条进化链/)).toBeNull();
      expect(screen.queryByText(/本局地区固定/)).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /翠影林地.*神秘林地/ }));
      fireEvent.click(screen.getByRole('button', { name: '查看生态详情' }));
      const detail = within(screen.getByRole('dialog'));
      expect(detail.getAllByRole('img', { name: '未遇见生物' })).toHaveLength(27);
      expect(detail.queryByText('棘刺王')).toBeNull();
      expect(detail.queryByText('九尾炎尊')).toBeNull();
      expect(detail.queryByText('焚风雏鹰')).toBeNull();
      expect(detail.queryByText(/第三幕暂从/)).toBeNull();
      act(() => window.dispatchEvent(new Event('petcard-back')));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(current().screen).toBe('region-select');
      expect(screen.getByRole('button', { name: /翠影林地.*神秘林地/ }).getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(screen.getByRole('button', { name: '下一步：难度与遗物' }));
      expect(current().region).toBe('emerald_forest');
    } finally {
      cleanup();
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    }
  });

  it('只有在当前地区遇见的形态显示立绘，未遇见的不暴露名称', () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute('open'); } });
    try {
      const state = { ...createInitialState(), region: 'emerald_forest' as const,
        unlocks: { ...unlocks, regionEncounters: { emerald_forest: ['momo', 'time_sand_beast'], mixed: ['lulu'] } } };
      render(createElement(RegionScreen, { state, dispatch: vi.fn() }));
      fireEvent.click(screen.getByRole('button', { name: '查看生态详情' }));
      const detail = within(screen.getByRole('dialog'));
      expect(detail.getByRole('img', { name: '迅迅' }).closest('.undiscovered')).toBeNull();
      expect(detail.getAllByRole('img', { name: '未遇见生物' })).toHaveLength(25);
      expect(detail.getByRole('region', { name: '神秘生物' }).querySelectorAll('.undiscovered')).toHaveLength(3);
      expect(detail.getByRole('img', { name: '时砂兽' }).closest('.undiscovered')).toBeNull();
      expect(detail.queryByRole('img', { name: '泡泡' })).toBeNull();
    } finally {
      cleanup();
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    }
  });

  it.each([false, true])('林地开局获得两只火狐和一只同行，保留槽位、难度、遗物和解锁 mobile=%s', mobile => {
    setup(mobile);
    expect(current().screen).toBe('region-select');
    chooseForest();
    fireEvent.click(screen.getByRole('button', { name: /困难.*敌方生命/ }));
    fireEvent.click(screen.getByRole('button', { name: /旅者护符/ }));
    fireEvent.click(screen.getByRole('button', { name: /下一步：选择伙伴/ }));
    const choices = within(screen.getByRole('region', { name: '选择生物' }));
    expect(choices.queryByRole('button', { name: /灼灼/ })).toBeNull();
    expect(choices.getByRole('img', { name: '火狐' }).tagName).toBe('CANVAS');
    fireEvent.click(choices.getByRole('button', { name: /火狐/ }));
    fireEvent.click(screen.getByRole('button', { name: /选择火狐/ }));
    expect(screen.getByText(/已选主力：火狐 ×2/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /选择铁墩/ }));
    const state = current();
    expect(state.screen).toBe('map');
    expect(state.region).toBe('emerald_forest');
    expect(state.roster.map((u: { speciesId: string }) => u.speciesId)).toEqual(['fire_fox', 'fire_fox', 'kiki']);
    expect(state.difficulty).toBe('hard');
    expect(state.relics).toEqual(['traveler_charm']);
    expect(state.gold).toBe(70);
    expect(state.saveSlot).toBe(3);
    expect(state.unlocks).toEqual(unlocks);
    expect(parseDualSave(JSON.stringify(state))!.main!.region).toBe('emerald_forest');
  });

  it('更换地区保留难度和遗物，丢弃先前局部生物选择', () => {
    setup();
    chooseForest();
    fireEvent.click(screen.getByRole('button', { name: /困难.*敌方生命/ }));
    fireEvent.click(screen.getByRole('button', { name: /旅者护符/ }));
    fireEvent.click(screen.getByRole('button', { name: /下一步：选择伙伴/ }));
    fireEvent.click(within(screen.getByRole('region', { name: '选择生物' })).getByRole('button', { name: /火狐/ }));
    fireEvent.click(screen.getByRole('button', { name: /选择火狐/ }));
    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    expect(current().screen).toBe('region-select');
    fireEvent.click(screen.getByRole('button', { name: /混合地区.*原有生态/ }));
    fireEvent.click(screen.getByRole('button', { name: '下一步：难度与遗物' }));
    expect(screen.getByRole('button', { name: /困难.*敌方生命/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /旅者护符/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /下一步：选择伙伴/ }));
    const choices = within(screen.getByRole('region', { name: '选择生物' }));
    expect(choices.queryByRole('button', { name: /火狐/ })).toBeNull();
    expect(choices.getByRole('button', { name: /迅迅/ }).getAttribute('aria-pressed')).toBe('true');
    expect(choices.getByRole('button', { name: /灼灼/ })).toBeTruthy();
    expect(current().saveSlot).toBe(3);
  });

  it('未确认难度选项也能返回地区并恢复，手机系统返回与界面按钮一致', () => {
    setup(true);
    chooseForest();
    fireEvent.click(screen.getByRole('button', { name: /困难.*敌方生命/ }));
    fireEvent.click(screen.getByRole('button', { name: /旅者护符/ }));
    act(() => window.dispatchEvent(new Event('petcard-back')));
    expect(current().screen).toBe('region-select');
    fireEvent.click(screen.getByRole('button', { name: '下一步：难度与遗物' }));
    expect(screen.getByRole('button', { name: /困难.*敌方生命/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /旅者护符/ }).getAttribute('aria-pressed')).toBe('true');
    act(() => window.dispatchEvent(new Event('petcard-back')));
    act(() => window.dispatchEvent(new Event('petcard-back')));
    expect(current().screen).toBe('title');
  });
});

describe('地区开局边界', () => {
  it('林地不接受地区外主力或同行，混合地区兼容原START_RUN调用', () => {
    const state = { ...createInitialState(), region: 'emerald_forest' as const };
    expect(gameReducer(state, { type: 'START_RUN', starterId: 'fifi', companionId: 'kiki', seed: 42 })).toBe(state);
    expect(gameReducer(state, { type: 'START_RUN', starterId: 'fire_fox', companionId: 'lulu', seed: 42 })).toBe(state);
    expect(gameReducer(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'lulu', seed: 42 }).region).toBe('mixed');
  });

  it('返回与配置只保留合法解锁，重试回地区选择且不丢失槽位成就', () => {
    const state = { ...createInitialState(), screen: 'difficulty-select' as const };
    const back = gameReducer(state, { type: 'BACK_TO_REGIONS', difficulty: 'nightmare', relic: 'traveler_charm' });
    expect(back.screen).toBe('region-select');
    expect(back.difficulty).toBe('normal');
    expect(back.relics).toEqual([]);
    const retry = gameReducer({ ...state, saveSlot: 3, unlocks }, { type: 'RETRY', seed: 42 });
    expect(retry.screen).toBe('region-select');
    expect(retry.saveSlot).toBe(3);
    expect(retry.unlocks).toEqual(unlocks);
    expect(gameReducer({ ...state, screen: 'battle' }, { type: 'SET_REGION', region: 'emerald_forest' }).screen).toBe('battle');
  });
});
