// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { InterActScreen, GameOverScreen } from '../src/ui/App';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { computeRunRating, emptyMainRating } from '../src/game/rating';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function stateForReport() {
  const state = gameReducer(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'lulu', seed: 42 });
  const rating = emptyMainRating();
  rating.acts[1] = { totalRows: 10, completedRows: Array.from({ length: 10 }, (_, i) => i), bossDefeated: true, challengeTarget: 0 };
  return { ...state, screen: 'inter_act' as const, runStats: { ...state.runStats!, rating, battlesWon: 11, goldEarned: 125, petsTamed: 4, petsLost: 2, turnsPlayed: 39, actSnapshot: { ...state.runStats!.actSnapshot, battlesWon: 3, goldEarned: 25, petsTamed: 1, petsLost: 1, turnsPlayed: 9 } } };
}

describe('主模式结算记录册', () => {
  it.each([false, true])('评分构成常驻，本幕统计使用差值，继续入口保持原动作 mobile=%s', mobile => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const state = stateForReport();
    const dispatch = vi.fn();
    const { container } = render(createElement(InterActScreen, { state, dispatch }));
    expect(screen.getByRole('region', { name: '累计评级' })).toBeTruthy();
    for (const dimension of computeRunRating(state)!.dimensions) expect(screen.getByText(`${dimension.points}/${dimension.weight}`)).toBeTruthy();
    const stats = container.querySelector('.settlement-stats')!;
    expect(Array.from(stats.querySelectorAll('strong')).map(node => node.textContent)).toEqual(['8', '100', '3', '1', '30', String(state.roster.length)]);
    expect(screen.getByRole('list', { name: '远征进度' }).querySelectorAll('.is-complete')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /远征第二幕/ }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'INTER_ACT_CONTINUE' });
  });

  it('失败结算不标记当前幕完成，手机评分说明可以关闭且不派发游戏动作', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const state = { ...stateForReport(), screen: 'gameover' as const, act: 2 };
    const dispatch = vi.fn();
    const root = document.createElement('div'); root.id = 'root'; document.body.append(root);
    try {
      render(createElement(GameOverScreen, { state, dispatch }), { container: root });
      const trail = screen.getByRole('list', { name: '远征进度' });
      expect(trail.querySelectorAll('.is-complete')).toHaveLength(1);
      expect(trail.querySelector('.is-current')?.textContent).toContain('第二幕');
      fireEvent.click(screen.getByRole('button', { name: '评分明细' }));
      expect(within(screen.getByRole('dialog')).getByText(/未完整通关/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: '关闭评分明细' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(dispatch).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: '返回首页' }));
      expect(dispatch).toHaveBeenLastCalledWith({ type: 'TITLE' });
    } finally { root.remove(); }
  });
});
