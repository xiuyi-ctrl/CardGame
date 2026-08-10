// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { render, screen, act, cleanup } from '@testing-library/react';
import type { BattleState, LogEntry } from '../src/game/types';
import { makeUnit, createBattle } from '../src/game/core/battle';
import { createInitialState } from '../src/game/state/reducer';
import type { GameState } from '../src/game/state/game';
import { BattleScreen } from '../src/ui/BattleScreen';

const noop = () => {};

/** 正常战斗（空日志）→ 同回合结算后我方全灭（lost，带一条击杀我方宠物的攻击日志） */
function makeLostPair(): { b0: BattleState; b1: BattleState } {
  const a = makeUnit('momo', true, 0, false);
  const b0 = createBattle([a], [{ speciesId: 'kiki' }], 42);
  const player = b0.playerUnits[0];
  const enemy = b0.enemyUnits[0];
  const killLog: LogEntry = {
    text: `${enemy.name} 使用「爪击」攻击 ${player.name}，造成 10 伤害`,
    side: 'enemy',
    hp: { [player.uid]: 0, [enemy.uid]: enemy.hp },
    actorUid: enemy.uid,
    targetUid: player.uid,
  };
  const b1: BattleState = {
    ...b0,
    playerUnits: [{ ...player, hp: 0 }],
    phase: 'lost',
    log: [killLog],
  };
  return { b0, b1 };
}

function stateOf(battle: BattleState): GameState {
  return { ...createInitialState(), screen: 'battle', battle };
}

describe('BattleScreen 失败弹窗时机', () => {
  afterEach(() => cleanup());

  it('我方全灭：结算动画（我方宠物死亡动画）播放期间不弹失败界面，动画播完才弹出', () => {
    vi.useFakeTimers();
    const { b0, b1 } = makeLostPair();
    const { rerender } = render(createElement(BattleScreen, { state: stateOf(b0), dispatch: noop }));
    expect(screen.queryByText('全队阵亡')).toBeNull();

    // 结算发生：battle 进入 lost，动画开始播放（animating 期间）
    act(() => rerender(createElement(BattleScreen, { state: stateOf(b1), dispatch: noop })));
    // 事件0（0ms）已播放，但动画尚未结束 → 失败界面不显示
    act(() => vi.advanceTimersByTime(0));
    expect(screen.queryByText('全队阵亡')).toBeNull();

    // 1 个事件全部播放完（800ms）+ 动画清理（1300ms）→ 弹出失败界面
    act(() => vi.advanceTimersByTime(800 + 1300));
    expect(screen.getByText('全队阵亡')).toBeTruthy();
    vi.useRealTimers();
  });

  it('结算帧（phase=lost 但动画尚未开始）：失败界面不闪出，动画播完才弹出', () => {
    vi.useFakeTimers();
    const { b0, b1 } = makeLostPair();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    // flushSync 同步提交渲染但不运行 useEffect（被动 effect）：
    // 结算帧 = phase 已变 lost、animating 仍为 false、新日志尚未开始播放。
    flushSync(() => root.render(createElement(BattleScreen, { state: stateOf(b0), dispatch: noop })));
    expect(screen.queryByText('全队阵亡')).toBeNull();

    flushSync(() => root.render(createElement(BattleScreen, { state: stateOf(b1), dispatch: noop })));
    // 修复点：结算帧 logPending=true 拦截弹窗（修复前此处会闪出「全队阵亡」又立刻消失）
    expect(screen.queryByText('全队阵亡')).toBeNull();

    // flush 被动 effect：动画开始播放（animating=true），依然不弹
    act(() => {});
    expect(screen.queryByText('全队阵亡')).toBeNull();

    // 动画全部播完 → 失败界面仅此一次出现
    act(() => vi.advanceTimersByTime(800 + 1300));
    expect(screen.getByText('全队阵亡')).toBeTruthy();

    root.unmount();
    container.remove();
    vi.useRealTimers();
  });
});
