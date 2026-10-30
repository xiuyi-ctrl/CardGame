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
it.each(['relearn', 'legend', 'contract'] as const)('%s复用技能卡点击结算，保留费用、槽位及新技能零强化规则', kind => {
  const start = initial(kind), original = start.roster[0];
  let latest = start;
  function Harness() {
    const [state, dispatch] = useReducer(gameReducer, start); latest = state;
    return state.growthEncounterPending ? createElement(GrowthEncounterScreen, { state, dispatch }) : createElement('output', null, state.screen);
  }
  render(createElement(Harness));
  fireEvent.click(document.querySelector('.training-pet')!);
  if (kind !== 'contract') fireEvent.click(document.querySelector('.camp-learning-cards .camp-skill-card')!);
  expect(document.querySelectorAll('.camp-learning-cards .camp-skill-card')).toHaveLength(3);
  fireEvent.click(document.querySelector('.camp-learning-cards .camp-skill-card')!);
  expect(latest.growthEncounterPending).toBeUndefined();
  expect(latest.gold).toBe(kind === 'relearn' ? 30 : 50);
  expect(latest.roster[0].growthPoints).toBe(original.growthPoints);
  expect(latest.roster[0].skills).toHaveLength(kind === 'contract' ? 3 : 2);
  const slot = kind === 'contract' ? 2 : 0;
  expect(latest.roster[0].skillEnhancements?.[slot] ?? 0).toBe(0);
});
it('大师传承通过强化工作台确认，免费突破到4且不扣背包道具', () => {
  const start = initial('master'); start.inventory = { skill_enhance_stone: 2, reset_stone: 1 };
  let latest = start;
  function Harness() {
    const [state, dispatch] = useReducer(gameReducer, start); latest = state;
    return state.growthEncounterPending ? createElement(GrowthEncounterScreen, { state, dispatch }) : createElement('output', null, state.screen);
  }
  render(createElement(Harness));
  fireEvent.click(document.querySelector('.training-pet')!);
  expect(screen.queryByRole('button', { name: /重置/ })).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: '免费强化' })[0]);
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(latest.masterTransmissions ?? 0).toBe(0);
  fireEvent.click(screen.getAllByRole('button', { name: '免费强化' })[0]);
  fireEvent.click(screen.getByRole('button', { name: '确认' }));
  expect(latest.roster[0].skillEnhancements?.[0]).toBe(4);
  expect(latest.roster[0].skillEnhancePaid?.[0]).toBe(18);
  expect(latest.inventory).toEqual(start.inventory);
  expect(latest.masterTransmissions).toBe(1);
});
it('大师传承展示实际3→4，确认派发选中伙伴与技能', () => {
  const state = initial('master'), dispatch = vi.fn();
  render(createElement(GrowthEncounterScreen, { state, dispatch }));
  fireEvent.click(document.querySelector('.training-pet')!);
  fireEvent.click(screen.getAllByRole('button', { name: '免费强化' })[0]);
  expect(document.querySelector('.growth-modal-skill')!.textContent).toContain('+3 → +4');
  fireEvent.click(screen.getByRole('button', { name: '确认' }));
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
it('重新学习复用旧技能与新技能选择页，取消不扣费', () => {
  const state = initial('relearn');
  function Harness() {
    const [current, dispatch] = useReducer(gameReducer, state);
    return current.growthEncounterPending ? createElement(GrowthEncounterScreen, { state: current, dispatch }) : createElement('output', null, current.gold);
  }
  render(createElement(Harness));
  fireEvent.click(document.querySelector('.training-pet')!);
  expect(screen.getByText('替换技能 · 选择旧技能')).toBeTruthy();
  fireEvent.click(document.querySelector('.camp-learning-cards button')!);
  expect(screen.getByText('替换技能 · 选择新技能')).toBeTruthy();
  expect(document.querySelectorAll('.camp-learning-cards .camp-skill-card')).toHaveLength(3);
  expect(screen.queryByRole('button', { name: /刷新/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.getByRole('status').textContent).toBe('50');
});
