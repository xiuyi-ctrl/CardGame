// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createBattle, makeUnit, playerEndTurn, playerSkill, selectEnemyAction } from '../src/game/core/battle';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import type { GameState } from '../src/game/state/game';
import { TestBattleEditor } from '../src/ui/TestBattleEditor';

afterEach(cleanup);
function setup(): GameState {
  const battle = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'momo' }], 17);
  for (const unit of [...battle.playerUnits, ...battle.enemyUnits]) {
    Object.assign(unit, { hp: 100, maxHp: 100, passive: undefined, skills: ['punch'], statuses: [], shield: 0 });
  }
  return { ...createInitialState(), screen: 'battle', testRun: true, battle };
}
const toggle = (state: GameState, enabled: boolean) => gameReducer(state, { type: 'TEST_BATTLE_SET_ENEMY_ATTACK', enabled });

it('默认正常攻击，关闭后跳过敌方指令，重新开启恢复，切换不消耗行动或随机数', () => {
  const state = setup(), b = state.battle!;
  expect(selectEnemyAction(b, b.enemyUnits[0], .5, .5)?.kind).toBe('attack');
  b.orders = { [b.enemyUnits[0].uid]: { skillId: 'punch', targetUid: b.playerUnits[0].uid } };
  const next = toggle(state, false), paused = next.battle!;
  expect(paused.orders).toEqual({});
  expect(paused.round).toBe(b.round);
  expect(paused.rngCount).toBe(b.rngCount);
  expect(paused.playerUnits).toBe(b.playerUnits);
  expect(selectEnemyAction(paused, paused.enemyUnits[0], .5, .5)).toBeUndefined();
  const result = playerEndTurn(playerSkill(paused, paused.playerUnits[0].uid, 'punch', paused.enemyUnits[0].uid));
  expect(result.playerUnits[0].hp).toBe(100);
  expect(result.enemyUnits[0].hp).toBeLessThan(100);
  expect(result.testEnemyInactive).toBe(true);
  const resumed = toggle({ ...next, battle: result }, true).battle!;
  expect(playerEndTurn(resumed).playerUnits[0].hp).toBeLessThan(100);
  expect(setup().battle!.testEnemyInactive).toBeUndefined();
});

it('暂停同时阻止治疗等主动技能，仍结算持续伤害', () => {
  const state = setup();
  Object.assign(state.battle!.enemyUnits[0], { hp: 50, skills: ['heal_light'], statuses: [{ kind: 'poison', value: 4, turns: 99 }] });
  const b = toggle(state, false).battle!;
  const result = playerEndTurn(b);
  expect(result.enemyUnits[0].hp).toBe(48);
  expect(result.playerUnits[0].hp).toBe(100);
});

it('普通远征、非战斗及结束的战斗拒绝切换', () => {
  const state = setup();
  for (const invalid of [{ ...state, testRun: false }, { ...state, screen: 'map' as const }, { ...state, battle: { ...state.battle!, phase: 'won' as const } }]) {
    expect(toggle(invalid, false)).toBe(invalid);
  }
});

it('编辑器显示开关当前状态并派发正确动作，不关闭窗口', () => {
  const state = toggle(setup(), false), dispatch = vi.fn(), onClose = vi.fn();
  render(createElement(TestBattleEditor, { units: [...state.battle!.playerUnits, ...state.battle!.enemyUnits], battle: state.battle, dispatch, onClose }));
  fireEvent.click(screen.getByRole('button', { name: /敌人攻击：关闭/ }));
  expect(dispatch).toHaveBeenCalledWith({ type: 'TEST_BATTLE_SET_ENEMY_ATTACK', enabled: true });
  expect(onClose).not.toHaveBeenCalled();
});
