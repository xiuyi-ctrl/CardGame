// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createBattle, makeUnit, playerEndTurn, playerSkill } from '../src/game/core/battle';
import { createInitialState } from '../src/game/state/reducer';
import { BattleScreen } from '../src/ui/BattleScreen';
import { BattleStatusIcons } from '../src/ui/BattleStatusIcons';
import { BuffDetailPanel, StatusIcons } from '../src/ui/components';
import { HIT_DELAY_MS } from '../src/ui/battleFx';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('零层灼烧、中毒不显示战场图标或详情，其他有效状态仍保留', () => {
  const unit = makeUnit('momo', true, 0, false);
  unit.statuses = [{ kind: 'burn', value: 0, turns: 2 }, { kind: 'poison', value: 0, turns: 2 }, { kind: 'atkUp', value: 2, turns: 2 }];
  const view = render(createElement('div', null, createElement(BattleStatusIcons, { unit }), createElement(StatusIcons, { unit }), createElement(BuffDetailPanel, { unit })));
  expect(view.container.querySelector('img[src="/buff-icons/burn.png"]')).toBeNull();
  expect(view.container.querySelector('img[src="/buff-icons/poison.png"]')).toBeNull();
  expect(view.container.querySelector('img[src="/buff-icons/atk-up.png"]')).not.toBeNull();
});

it.each([4, 8])('余烬迁移原有%s层：动画落点时更新源图标，归零不显示，有剩余仍显示', layers => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const b = createBattle([makeUnit('eternal_moth', true, 0, false)], [{ speciesId: 'momo' }, { speciesId: 'lulu' }], 17);
  Object.assign(b.playerUnits[0], { skills: ['ember_transfer'], spd: 99, passive: undefined });
  b.enemyUnits.forEach(u => Object.assign(u, { hp: 100, maxHp: 100, passive: undefined, skills: [], acted: true }));
  const source = b.enemyUnits[0];
  source.statuses = [{ kind: 'burn', value: layers, turns: 2 }];
  const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'ember_transfer', source.uid));
  const state = { ...createInitialState(), screen: 'battle' as const, battle: b };
  const dispatch = vi.fn(), view = render(createElement(BattleScreen, { state, dispatch }));
  const icon = () => screen.getByRole('button', { name: new RegExp(`^${source.name}，`) }).querySelector('img[alt="灼烧"]');
  expect(icon()).not.toBeNull();
  view.rerender(createElement(BattleScreen, { state: { ...state, battle: after }, dispatch }));
  expect(icon()).not.toBeNull();
  act(() => vi.advanceTimersByTime(HIT_DELAY_MS));
  expect(!!icon()).toBe(layers > 6);
  act(() => vi.runAllTimers());
  expect(!!icon()).toBe(layers > 6);
});
