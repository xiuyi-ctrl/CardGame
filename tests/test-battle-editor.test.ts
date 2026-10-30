// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { TestBattleEditor } from '../src/ui/TestBattleEditor';
import { BattleScreen } from '../src/ui/BattleScreen';
import type { GameState } from '../src/game/state/game';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function setup(): GameState {
  return { ...createInitialState(), testRun: true, screen: 'battle', battle: createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 8) };
}
it.each(['playerUnits', 'enemyUnits'] as const)('可调整%s指定生物，不消耗行动或随机数，保持状态和技能', side => {
  const state = setup(), before = state.battle!, unit = before[side][0];
  const action = { type: 'TEST_BATTLE_EDIT_UNIT' as const, uid: unit.uid, hp: 2, maxHp: 30, spd: 50, shield: 7 };
  const after = gameReducer(state, action).battle!;
  expect(after[side][0]).toMatchObject({ hp: 2, maxHp: 30, spd: 50, shield: 7, acted: unit.acted, skills: unit.skills, statuses: unit.statuses });
  expect(after.turnOrder[0]).toBe(unit.uid);
  expect(after.round).toBe(before.round); expect(after.rngCount).toBe(before.rngCount); expect(after.orders).toEqual(before.orders);
  expect(before[side][0].hp).toBe(unit.hp);
  expect(after.log.at(-1)?.text).toContain('[测试调整]');
});
it('正式游戏、结束的战斗、无效数值及无效对象均不能修改', () => {
  const state = setup(), action = { type: 'TEST_BATTLE_EDIT_UNIT' as const, uid: state.battle!.playerUnits[0].uid, hp: 3, maxHp: 20, spd: 4, shield: 0 };
  for (const blocked of [{ ...state, testRun: false }, { ...state, screen: 'map' as const }, { ...state, battle: { ...state.battle!, phase: 'won' as const } }]) expect(gameReducer(blocked, action)).toBe(blocked);
  for (const stats of [{ hp: 0 }, { hp: 21 }, { maxHp: 0 }, { spd: 0 }, { shield: -1 }, { hp: 1.5 }, { spd: Infinity }, { uid: 'absent' }]) expect(gameReducer(state, { ...action, ...stats })).toBe(state);
});
it('护盾归零清除旧护盾标记，不移除其他状态', () => {
  const state = setup(), unit = state.battle!.playerUnits[0]; unit.shield = 3; unit.statuses = [{ kind: 'shield', value: 3, turns: 2 }, { kind: 'burn', value: 2, turns: 0 }];
  const after = gameReducer(state, { type: 'TEST_BATTLE_EDIT_UNIT', uid: unit.uid, hp: 3, maxHp: 20, spd: 4, shield: 0 });
  expect(after.battle!.playerUnits[0].statuses).toEqual([{ kind: 'burn', value: 2, turns: 0 }]);
});
it.each([false, true])('仅测试战斗显示调整入口，选择敌方后可应用数值 mobile=%s', mobile => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const state = setup(), dispatch = vi.fn();
  const view = render(createElement(BattleScreen, { state: { ...state, testRun: false }, dispatch }));
  expect(screen.queryByRole('button', { name: '调整数值' })).toBeNull();
  view.rerender(createElement(BattleScreen, { state, dispatch }));
  fireEvent.click(screen.getByRole('button', { name: '调整数值' }));
  fireEvent.click(screen.getByRole('button', { name: /敌方 · 铁墩/ }));
  fireEvent.change(screen.getByLabelText('最大生命'), { target: { value: '40' } });
  fireEvent.change(screen.getByLabelText('当前生命'), { target: { value: '6' } });
  fireEvent.change(screen.getByLabelText('护盾'), { target: { value: '9' } });
  fireEvent.click(screen.getByRole('button', { name: '应用修改' }));
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'TEST_BATTLE_EDIT_UNIT', uid: state.battle!.enemyUnits[0].uid, hp: 6, maxHp: 40, shield: 9 }));
  expect(screen.queryByRole('dialog', { name: '调整测试生物数值' })).toBeNull();
});
it('不合法输入禁用应用，取消不派发数值动作', () => {
  const state = setup(), dispatch = vi.fn(), close = vi.fn();
  render(createElement(TestBattleEditor, { units: state.battle!.playerUnits, dispatch, onClose: close }));
  fireEvent.change(screen.getByLabelText('当前生命'), { target: { value: '' } });
  expect((screen.getByRole('button', { name: '应用修改' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '取消' })); expect(dispatch).not.toHaveBeenCalled(); expect(close).toHaveBeenCalled();
});
