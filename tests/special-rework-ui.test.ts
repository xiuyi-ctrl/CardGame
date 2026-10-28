// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SpecialScreen } from '../src/ui/App';
import { ProgressionChoiceScreen, AttributeBoostScreen } from '../src/ui/ProgressionScreens';
import { SPECIAL_REWARDS, type GameState } from '../src/game/state/game';
import { createInitialState } from '../src/game/state/reducer';
import { makeUnit } from '../src/game/core/battle';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const base = (): GameState => ({ ...createInitialState(), act: 2, roster: [makeUnit('fire_fox', true, 0, false)] });

it.each([false, true])('完美进化预览最终分支，选择后提交最终形态 mobile=%s', mobile => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const state: GameState = { ...base(), screen: 'roster', specialPending: { kind: 'evolve', super: false, toFinal: true } };
  const dispatch = vi.fn();
  render(createElement(ProgressionChoiceScreen, { state, dispatch }));
  expect(screen.getByRole('option', { name: '九尾炎尊' })).toBeTruthy();
  expect(screen.getByRole('option', { name: '传火狐尊' })).toBeTruthy();
  expect(screen.queryByRole('option', { name: '幻尾火狐' })).toBeNull();
  fireEvent.change(screen.getByRole('combobox', { name: '进化形态' }), { target: { value: 'torch_fox_lord' } });
  fireEvent.click(screen.getByRole('button', { name: '确认进化' }));
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'EVOLVE_ONE', uid: state.roster[0].uid, targetSpeciesId: 'torch_fox_lord' });
  expect(screen.queryByText('随机诅咒')).toBeNull();
});

it('属性重塑按钮显示6/3，旧熟练度待选仍显示5/2', () => {
  const initial = base();
  const state: GameState = { ...initial, screen: 'boost', specialPending: { kind: 'boost', uid: initial.roster[0].uid, hpBonus: 6, spdBonus: 3 } };
  const dispatch = vi.fn();
  const { rerender } = render(createElement(AttributeBoostScreen, { state, dispatch }));
  expect(screen.getByText('+6')).toBeTruthy(); expect(screen.getByText('+3')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /永久提升最大生命/ }));
  expect(dispatch).toHaveBeenCalledWith({ type: 'BOOST_STAT', stat: 'hp' });
  rerender(createElement(AttributeBoostScreen, { dispatch, state: { ...state, runMode: 'proficiency', specialPending: { kind: 'boost', uid: initial.roster[0].uid } } }));
  expect(screen.getByText('+5')).toBeTruthy(); expect(screen.getByText('+2')).toBeTruthy();
});

it('奇遇新文案和蛋图标正确，不出现已移除的超进化和跳关', () => {
  const initial = base();
  const state: GameState = { ...initial, screen: 'special', currentNodeId: 's', map: { ...initial.map,
    specials: { s: { title: '奇遇', desc: '', rewards: SPECIAL_REWARDS.filter(reward => ['sr-egg', 'sr-golden-fruit', 'sr-gold'].includes(reward.id)) } } } };
  const { container } = render(createElement(SpecialScreen, { state, dispatch: vi.fn() }));
  expect(screen.getByText('圣果宝藏')).toBeTruthy(); expect(screen.getByText('获得120金币')).toBeTruthy();
  expect(container.querySelector('img[src="/backpack-item-icons/mystery_egg.png"]')).toBeTruthy();
  expect(container.textContent).not.toMatch(/超进化|跳关/);
});


it.each([false, true])('满队伍仍可点击造物奖励 mobile=%s', mobile => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const initial = base();
  const state: GameState = { ...initial, screen: 'special', currentNodeId: 's',
    roster: Array.from({ length: 8 }, () => makeUnit('momo', true, 0, false)),
    map: { ...initial.map, specials: { s: { title: '奇遇', desc: '', rewards: SPECIAL_REWARDS.filter(reward => reward.kind === 'custom') } } } };
  const dispatch = vi.fn();
  render(createElement(SpecialScreen, { state, dispatch }));
  const button = screen.getByRole('button', { name: /造物·自创生物/ }) as HTMLButtonElement;
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  expect(dispatch).toHaveBeenCalledWith({ type: 'SPECIAL_CHOICE', rewardId: 'sr-custom' });
});
