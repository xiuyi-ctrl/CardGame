// @vitest-environment jsdom
import { createElement, useReducer } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { GrowthEncounterScreen } from '../src/ui/GrowthEncounterScreen';
import { beginGrowthEncounter, type GrowthEncounterKind } from '../src/game/state/growth-encounters';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { makeUnit } from '../src/game/core/battle';
import type { GameState } from '../src/game/state/game';

afterEach(cleanup);
function initial(kind: GrowthEncounterKind): GameState {
  return beginGrowthEncounter({ ...createInitialState(), screen: 'event', runMode: 'proficiency', currentNodeId: 'ui-test', gold: 50,
    roster: ['momo', 'lulu'].map((id, i) => ({ ...makeUnit(id, true, i as 0 | 1, false), skills: ['swift_needle', 'punch'], growthPoints: 20, skillEnhancements: { 0: 3 }, skillEnhancePaid: { 0: 18 } })) }, kind);
}
it('大师传承展示实际3→4，确认派发选中伙伴与技能', () => {
  const state = initial('master'), dispatch = vi.fn();
  render(createElement(GrowthEncounterScreen, { state, dispatch }));
  expect(screen.getByRole('button', { name: /迅针 ＋3/ }).textContent).toContain('＋3 → ＋4');
  fireEvent.click(screen.getByRole('button', { name: '确认领取' }));
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'GROWTH_ENCOUNTER_CONFIRM', uid: state.roster[0].uid, slot: 0 }));
});
it('双人奖励必须选择第二位不同伙伴，领取后不重复显示', () => {
  const state = initial('train_pair');
  function Harness() {
    const [current, dispatch] = useReducer(gameReducer, state);
    return current.growthEncounterPending ? createElement(GrowthEncounterScreen, { state: current, dispatch }) : createElement('output', null, current.roster.map(unit => unit.growthPoints).join(','));
  }
  render(createElement(Harness));
  expect((screen.getByRole('button', { name: '确认领取' }) as HTMLButtonElement).disabled).toBe(true);
  const receiver = screen.getByRole('group', { name: '接收伙伴' });
  expect(within(receiver).getAllByRole('button')).toHaveLength(1);
  fireEvent.click(within(receiver).getByRole('button'));
  fireEvent.click(screen.getByRole('button', { name: '确认领取' }));
  expect(screen.getByRole('status').textContent).toBe('22,22');
  expect(screen.queryByRole('button', { name: '确认领取' })).toBeNull();
});
it('重新学习先预览，取消不扣费；切换旧技能后必须重新选候选', () => {
  const state = initial('relearn');
  function Harness() {
    const [current, dispatch] = useReducer(gameReducer, state);
    return current.growthEncounterPending ? createElement(GrowthEncounterScreen, { state: current, dispatch }) : createElement('output', null, current.gold);
  }
  render(createElement(Harness));
  fireEvent.click(screen.getByRole('button', { name: '查看固定技能候选' }));
  const candidates = screen.getByRole('group', { name: '新技能候选' });
  expect(within(candidates).getAllByRole('button')).toHaveLength(3);
  fireEvent.click(within(candidates).getAllByRole('button')[0]);
  expect((screen.getByRole('button', { name: '确认领取' }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: '重新选择旧技能' }));
  fireEvent.click(within(screen.getByRole('group', { name: '选择技能' })).getAllByRole('button')[1]);
  expect(screen.queryByRole('group', { name: '新技能候选' })).toBeNull();
  expect((screen.getByRole('button', { name: '确认领取' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '返回选择' }));
  expect(screen.getByRole('status').textContent).toBe('50');
});
