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

/** 正常战斗（空日志）→ 同回合结算后敌方全灭（won，带一条击杀敌方宠物的攻击日志） */
function makeWonPair(): { b0: BattleState; b1: BattleState } {
  const a = makeUnit('momo', true, 0, false);
  const b0 = createBattle([a], [{ speciesId: 'kiki' }], 42);
  const player = b0.playerUnits[0];
  const enemy = b0.enemyUnits[0];
  const killLog: LogEntry = {
    text: `${player.name} 使用「爪击」攻击 ${enemy.name}，造成 10 伤害`,
    side: 'player',
    hp: { [player.uid]: player.hp, [enemy.uid]: 0 },
    actorUid: player.uid,
    targetUid: enemy.uid,
  };
  const b1: BattleState = {
    ...b0,
    enemyUnits: [{ ...enemy, hp: 0 }],
    phase: 'won',
    log: [killLog],
  };
  return { b0, b1 };
}

function stateOf(battle: BattleState): GameState {
  return { ...createInitialState(), screen: 'battle', battle };
}

describe('BattleScreen 胜利弹窗时机', () => {
  afterEach(() => cleanup());

  it('敌方全灭：结算动画播放期间不弹胜利界面，动画播完才弹出', () => {
    vi.useFakeTimers();
    const { b0, b1 } = makeWonPair();
    const { rerender } = render(createElement(BattleScreen, { state: stateOf(b0), dispatch: noop }));
    expect(screen.queryByText('战斗胜利')).toBeNull();

    // 结算发生：battle 进入 won，动画开始播放（animating 期间）
    act(() => rerender(createElement(BattleScreen, { state: stateOf(b1), dispatch: noop })));
    act(() => vi.advanceTimersByTime(0));
    expect(screen.queryByText('战斗胜利')).toBeNull();

    // 1 个事件全部播放完（800ms）+ 动画清理（1300ms）→ 弹出胜利界面
    act(() => vi.advanceTimersByTime(800 + 1300));
    expect(screen.getByText('战斗胜利')).toBeTruthy();
    vi.useRealTimers();
  });

  it('结算帧（phase=won 但动画尚未开始）：胜利界面不闪出，动画播完才弹出', () => {
    vi.useFakeTimers();
    const { b0, b1 } = makeWonPair();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    // flushSync 同步提交渲染但不运行 useEffect（被动 effect）：
    // 结算帧 = phase 已变 won、animating 仍为 false、新日志尚未开始播放。
    flushSync(() => root.render(createElement(BattleScreen, { state: stateOf(b0), dispatch: noop })));
    expect(screen.queryByText('战斗胜利')).toBeNull();

    flushSync(() => root.render(createElement(BattleScreen, { state: stateOf(b1), dispatch: noop })));
    // 修复点：结算帧 logPending=true 拦截弹窗（修复前此处会闪出「战斗胜利」又立刻消失）
    expect(screen.queryByText('战斗胜利')).toBeNull();

    // flush 被动 effect：动画开始播放（animating=true），依然不弹
    act(() => {});
    expect(screen.queryByText('战斗胜利')).toBeNull();

    // 动画全部播完 → 胜利界面仅此一次出现
    act(() => vi.advanceTimersByTime(800 + 1300));
    expect(screen.getByText('战斗胜利')).toBeTruthy();

    root.unmount();
    container.remove();
    vi.useRealTimers();
  });
});
