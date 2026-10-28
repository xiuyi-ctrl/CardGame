// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AchievementsScreen } from '../src/ui/App';
import { detectUnlocks } from '../src/ui/persistence';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { DEFAULT_UNLOCKS } from '../src/game/state/game';
afterEach(cleanup);
it('三种难度最高评级独立更新、低分不覆盖、读档保留', () => {
  const normal = detectUnlocks(DEFAULT_UNLOCKS, 'A', [], 'normal');
  const hard = detectUnlocks(normal, 'B', [], 'hard');
  const nightmare = detectUnlocks(hard, 'S', [], 'nightmare');
  const lower = detectUnlocks(nightmare, 'D', [], 'normal');
  expect(lower.bestGrades).toEqual({ normal: 'A', hard: 'B', nightmare: 'S' });
  expect(normal.bestGrades).toEqual({ normal: 'A' });
  const loaded = gameReducer(createInitialState(), { type: 'LOAD_GAME', state: JSON.parse(JSON.stringify({ ...createInitialState(), unlocks: lower })) });
  expect(loaded.unlocks?.bestGrades).toEqual(lower.bestGrades);
});
it('成就评级页可切换难度，里程碑按对应难度展示', () => {
  const unlocks = detectUnlocks(detectUnlocks(DEFAULT_UNLOCKS, 'S', [], 'normal'), 'B', [], 'hard');
  const { container } = render(createElement(AchievementsScreen, { state: { ...createInitialState(), unlocks }, dispatch: vi.fn() }));
  fireEvent.click(screen.getByRole('tab', { name: '评级里程碑' }));
  expect(container.querySelector('.achievement-best-grade')?.textContent).toContain('普通最高评级 S');
  fireEvent.click(within(screen.getByRole('group', { name: '评级难度' })).getByRole('button', { name: '困难' }));
  expect(container.querySelector('.achievement-best-grade')?.textContent).toContain('困难最高评级 B');
  expect(container.querySelectorAll('.achievement-row.is-unlocked')).toHaveLength(3);
  fireEvent.click(within(screen.getByRole('group', { name: '评级难度' })).getByRole('button', { name: '地狱' }));
  expect(container.querySelectorAll('.achievement-row.is-unlocked')).toHaveLength(0);
});
it('旧档总评级不自动归入任何难度', () => {
  const { container } = render(createElement(AchievementsScreen, { state: { ...createInitialState(), unlocks: { ...DEFAULT_UNLOCKS, bestGrade: 'S' } }, dispatch: vi.fn() }));
  fireEvent.click(screen.getByRole('tab', { name: '评级里程碑' }));
  expect(screen.getByText(/未记录难度/)).toBeTruthy();
  expect(container.querySelectorAll('.achievement-row.is-unlocked')).toHaveLength(0);
});
