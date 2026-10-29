// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { createBattle, makeUnit, playerTame } from '../src/game/core/battle';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { useBattleFx } from '../src/ui/battleFx';
import { BattleScreen } from '../src/ui/BattleScreen';

function fixture(count = 1) {
  const battle = createBattle([makeUnit('momo', true, 0, false)], Array.from({ length: count }, () => ({ speciesId: 'fifi' })), 42);
  battle.enemyUnits.forEach(unit => { unit.hp = 1; });
  return battle;
}
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('捕获表现与原规则', () => {
  it('成功日志保留原目标与食物，最后一名敌人不因被移除而漏播', () => {
    vi.useFakeTimers();
    const b = fixture();
    const target = b.enemyUnits[0];
    const after = playerTame(b, 'berry', target.uid);
    expect(after.phase).toBe('won');
    expect(after.log.find(entry => entry.capture)?.capture).toEqual({ targetUid: target.uid, foodId: 'berry', success: true });
    const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
    act(() => rerender({ battle: after }));
    expect(result.current.departingEnemies.map(unit => unit.uid)).toEqual([target.uid]);
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.capture?.stage).toBe('feed');
    expect(result.current.pops).toHaveLength(0);
    act(() => vi.advanceTimersByTime(360));
    expect(result.current.capture?.stage).toBe('success');
    expect(result.current.life[target.uid]?.kind).toBe('captured');
    expect(result.current.pops.map(pop => pop.text)).toEqual(['捕获成功']);
    expect(result.current.animating).toBe(true);
    act(() => vi.advanceTimersByTime(540));
    expect(result.current.animating).toBe(false);
    expect(result.current.departingEnemies).toHaveLength(0);
    expect(result.current.capture).toBeNull();
  });
  it('捕获第一名敌人时不误判为新战斗，其他敌人保留', () => {
    vi.useFakeTimers();
    const b = fixture(2);
    const after = playerTame(b, 'berry', b.enemyUnits[0].uid);
    const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
    act(() => rerender({ battle: after }));
    act(() => vi.advanceTimersByTime(360));
    expect(result.current.capture?.stage).toBe('success');
    expect(after.enemyUnits).toHaveLength(1);
    act(() => result.current.skipAnim());
    act(() => vi.runAllTimers());
    expect(result.current.departingEnemies).toHaveLength(0);
    expect(result.current.capture).toBeNull();
  });
  it('失败保留生物和生命，仅显示失败反馈，不冒扣血数字或死亡动画', () => {
    vi.useFakeTimers();
    const b = fixture();
    b.enemyUnits[0].hp = Math.floor(b.enemyUnits[0].maxHp * .4);
    let after = b;
    for (let seed = 1; seed <= 100; seed++) {
      b.seed = seed; b.rngCount = 0;
      after = playerTame(b, 'berry', b.enemyUnits[0].uid);
      if (after.log.some(entry => entry.capture?.success === false)) break;
    }
    expect(after.log.some(entry => entry.capture?.success === false)).toBe(true);
    expect(after.enemyUnits[0].hp).toBe(b.enemyUnits[0].hp);
    expect(after.enemyUnits[0].tameFails).toBe(1);
    const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
    act(() => rerender({ battle: after }));
    act(() => vi.advanceTimersByTime(360));
    expect(result.current.capture?.stage).toBe('fail');
    expect(result.current.pops.map(pop => pop.text)).toEqual(['捕获失败']);
    expect(result.current.fx).toEqual({});
    expect(result.current.life).toEqual({});
  });
  it('满队伍捕获仍按原规则进入预备队，食物仅扣一次，动画不改变随机计数', () => {
    const b = fixture();
    const roster = Array.from({ length: 10 }, (_, i) => makeUnit('momo', true, (i % 3) as 0 | 1 | 2, false));
    const state = { ...createInitialState(), screen: 'battle' as const, battle: b, roster, inventory: { berry: 2 } };
    const after = gameReducer(state, { type: 'PLAYER_TAME', foodId: 'berry', enemyUid: b.enemyUnits[0].uid });
    expect(after.roster).toHaveLength(10);
    expect(after.battle?.pendingTame).toHaveLength(1);
    expect(after.inventory.berry).toBe(1);
    expect(after.battle?.rngCount).toBe(b.rngCount + 1);
    const reloaded = JSON.parse(JSON.stringify(after.battle));
    const { result } = renderHook(() => useBattleFx(reloaded));
    expect(result.current.capture).toBeNull();
    expect(result.current.animating).toBe(false);
  });
  it('铭牌显示100%保证捕获，连续点击目标只派发一次捕获', () => {
    const b = fixture();
    b.enemyUnits[0].hp = Math.floor(b.enemyUnits[0].maxHp * .4);
    const state = { ...createInitialState(), screen: 'battle' as const, battle: b, inventory: { golden_fruit: 2 } };
    const dispatch = vi.fn();
    const { container } = render(createElement(BattleScreen, { state, dispatch }));
    fireEvent.click(screen.getByRole('button', { name: '捕获' }));
    fireEvent.click(screen.getByRole('button', { name: /圣果/ }));
    expect(container.querySelector('.tame-tip')?.textContent).toBe('捕获概率 100%');
    expect(container.querySelector('.capture-target-ring')).not.toBeNull();
    const target = container.querySelector(`[data-battle-uid="${b.enemyUnits[0].uid}"]`)!;
    fireEvent.click(target); fireEvent.click(target);
    expect(dispatch.mock.calls.filter(([action]) => action.type === 'PLAYER_TAME')).toHaveLength(1);
  });
  it.each([['berry', '浆果', 56], ['meat', '鲜肉', 67], ['gem', '秘晶', 78]] as const)('丰收之角%s铭牌与食物基础参数加成一致', (food, name, percent) => {
    const b = fixture(); b.relics = ['horn_of_plenty'];
    b.enemyUnits[0] = { ...b.enemyUnits[0], hp: 40, maxHp: 100 };
    const state = { ...createInitialState(), screen: 'battle' as const, battle: b, inventory: { [food]: 2 } };
    const { container } = render(createElement(BattleScreen, { state, dispatch: vi.fn() }));
    fireEvent.click(screen.getByRole('button', { name: '捕获' }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
    expect(container.querySelector('.tame-tip')?.textContent).toBe(`捕获概率 ${percent}%`);
  });
});
