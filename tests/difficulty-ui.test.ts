// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInitialState } from '../src/game/state/reducer';
import { DifficultyScreen } from '../src/ui/App';

afterEach(cleanup);

describe('难度与遗物选择界面', () => {
  it('新存档展示所有锁定选项，但只能按普通难度且不带遗物出发', () => {
    const dispatch = vi.fn();
    render(createElement(DifficultyScreen, { state: createInitialState(), dispatch }));

    expect(screen.getByRole('button', { name: /普通.*敌方生命/ }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByRole('button', { name: /困难.*敌方生命/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /地狱.*敌方生命/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelectorAll('.relic-tile')).toHaveLength(6);
    expect(document.querySelectorAll('.relic-tile:disabled')).toHaveLength(6);
    expect(screen.getByRole('button', { name: /不携带遗物/ }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /下一步：选择伙伴/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_PRERUN_CONFIG', difficulty: 'normal', relic: undefined });
  });

  it('已解锁选项可选，锁定遗物不可选，也可恢复为不携带', () => {
    const dispatch = vi.fn();
    const state = createInitialState();
    state.unlocks = { ...state.unlocks, difficulties: ['normal', 'hard'], relics: ['traveler_charm'] };
    render(createElement(DifficultyScreen, { state, dispatch }));

    fireEvent.click(screen.getByRole('button', { name: /困难.*敌方生命/ }));
    fireEvent.click(screen.getByRole('button', { name: /旅者护符/ }));
    expect(screen.getByText('开局金币 +15')).toBeTruthy();
    expect((screen.getByRole('button', { name: /精锐之证/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /下一步：选择伙伴/ }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'SET_PRERUN_CONFIG', difficulty: 'hard', relic: 'traveler_charm' });

    fireEvent.click(screen.getByRole('button', { name: /不携带遗物/ }));
    fireEvent.click(screen.getByRole('button', { name: /下一步：选择伙伴/ }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'SET_PRERUN_CONFIG', difficulty: 'hard', relic: undefined });
  });
});
