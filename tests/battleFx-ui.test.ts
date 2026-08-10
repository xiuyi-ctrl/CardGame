// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { StrictMode, createElement } from 'react';
import { renderHook, act } from '@testing-library/react';
import type { BattleState, LogEntry, StatusEffect } from '../src/game/types';
import { makeUnit, createBattle, playerSkill, playerEndTurn } from '../src/game/core/battle';
import { MONSTERS } from '../src/game/data/monsters';
import { useBattleFx } from '../src/ui/battleFx';

const SPECIES = Object.keys(MONSTERS);

function makeBattle(
  log: LogEntry[],
  kStatuses: StatusEffect[],
  a: ReturnType<typeof makeUnit>,
  k: ReturnType<typeof makeUnit>,
): BattleState {
  return {
    playerUnits: [a],
    enemyUnits: [{ ...k, statuses: kStatuses }],
    turnOrder: [],
    turnIndex: 0,
    round: 1,
    playerAp: 3,
    playerApMax: 3,
    enemyAp: 3,
    phase: 'acting',
    log,
    pendingTame: [],
    seed: 1,
    rngCount: 0,
    orders: {},
  };
}

function makeBattleTwo(
  log: LogEntry[],
  kStatuses: StatusEffect[],
  a: ReturnType<typeof makeUnit>,
  b: ReturnType<typeof makeUnit>,
  k: ReturnType<typeof makeUnit>,
): BattleState {
  return {
    playerUnits: [a, b],
    enemyUnits: [{ ...k, statuses: kStatuses }],
    turnOrder: [],
    turnIndex: 0,
    round: 1,
    playerAp: 3,
    playerApMax: 3,
    enemyAp: 3,
    phase: 'acting',
    log,
    pendingTame: [],
    seed: 1,
    rngCount: 0,
    orders: {},
  };
}

describe('useBattleFx：新增灼烧/中毒状态与攻击动画同步显示', () => {
  it('单段攻击：攻击动画触发时揭示灼烧并保持显示', () => {
    vi.useFakeTimers();
    const a = makeUnit(SPECIES[0], true, 1, false);
    const k = makeUnit(SPECIES[1], false, 1, false);
    const burn: StatusEffect = { kind: 'burn', value: 2, turns: 2 };

    const battle0 = makeBattle([], [], a, k);
    const battle1 = makeBattle(
      [
        {
          text: `${a.name} 使用「烈焰」攻击 ${k.name}，造成 8 伤害`,
          side: 'player',
          hp: { [a.uid]: a.hp, [k.uid]: 12 },
          actorUid: a.uid,
          targetUid: k.uid,
        },
      ],
      [burn],
      a,
      k,
    );

    const { result, rerender } = renderHook(({ b }: { b: BattleState }) => useBattleFx(b), {
      initialProps: { b: battle0 },
    });
    expect(result.current.hiddenStatuses).toEqual({});

    // 结算：新增灼烧先隐藏
    act(() => rerender({ b: battle1 }));
    expect(result.current.hiddenStatuses).toEqual({ [k.uid]: ['burn'] });

    // 攻击动画事件触发：揭示灼烧
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.hiddenStatuses).toEqual({});

    // 动画播放中及结束后：灼烧保持显示（不闪没）
    act(() => vi.advanceTimersByTime(400));
    expect(result.current.hiddenStatuses).toEqual({});
    act(() => vi.advanceTimersByTime(800 + 1300));
    expect(result.current.hiddenStatuses).toEqual({});
    vi.useRealTimers();
  });

  it('一轮含攻击+dot：灼烧在攻击动画时揭示，而不是等 dot 掉血动画', () => {
    vi.useFakeTimers();
    const a = makeUnit(SPECIES[0], true, 1, false);
    const k = makeUnit(SPECIES[1], false, 1, false);
    const burn: StatusEffect = { kind: 'burn', value: 2, turns: 2 };

    const battle0 = makeBattle([], [], a, k);
    const battle1 = makeBattle(
      [
        {
          text: `${a.name} 使用「烈焰」攻击 ${k.name}，造成 8 伤害`,
          side: 'player',
          hp: { [a.uid]: a.hp, [k.uid]: 12 },
          actorUid: a.uid,
          targetUid: k.uid,
        },
        {
          text: `${k.name} 受到灼烧 2 点伤害`,
          side: 'enemy',
          hp: { [a.uid]: a.hp, [k.uid]: 10 },
          targetUid: k.uid,
        },
      ],
      [burn],
      a,
      k,
    );

    const { result, rerender } = renderHook(({ b }: { b: BattleState }) => useBattleFx(b), {
      initialProps: { b: battle0 },
    });

    act(() => rerender({ b: battle1 }));
    expect(result.current.hiddenStatuses).toEqual({ [k.uid]: ['burn'] });

    // 攻击动画事件（0ms）触发：灼烧揭示，与扣血动画同时
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.hiddenStatuses).toEqual({});

    // dot 事件（800ms）播放后仍保持显示
    act(() => vi.advanceTimersByTime(800));
    expect(result.current.hiddenStatuses).toEqual({});

    act(() => vi.advanceTimersByTime(800 + 1300));
    expect(result.current.hiddenStatuses).toEqual({});
    vi.useRealTimers();
  });

  it('连击多段命中 + dot：灼烧在第一段攻击动画时就揭示，不等最后一段', () => {
    vi.useFakeTimers();
    const a = makeUnit(SPECIES[0], true, 1, false);
    const k = makeUnit(SPECIES[1], false, 1, false);
    const burn: StatusEffect = { kind: 'burn', value: 2, turns: 2 };

    const battle0 = makeBattle([], [], a, k);
    const battle1 = makeBattle(
      [
        {
          text: `${a.name} 使用「连击」攻击 ${k.name}，造成 4 伤害`,
          side: 'player',
          hp: { [a.uid]: a.hp, [k.uid]: 16 },
          actorUid: a.uid,
          targetUid: k.uid,
        },
        {
          text: `${a.name} 使用「连击」攻击 ${k.name}，造成 4 伤害`,
          side: 'player',
          hp: { [a.uid]: a.hp, [k.uid]: 12 },
          actorUid: a.uid,
          targetUid: k.uid,
        },
        {
          text: `${k.name} 受到灼烧 2 点伤害`,
          side: 'enemy',
          hp: { [a.uid]: a.hp, [k.uid]: 10 },
          targetUid: k.uid,
        },
      ],
      [burn],
      a,
      k,
    );

    const { result, rerender } = renderHook(({ b }: { b: BattleState }) => useBattleFx(b), {
      initialProps: { b: battle0 },
    });

    act(() => rerender({ b: battle1 }));
    expect(result.current.hiddenStatuses).toEqual({ [k.uid]: ['burn'] });

    // 第一段攻击动画（0ms）触发：灼烧立即揭示，与首次扣血同步
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.hiddenStatuses).toEqual({});

    // 第二段（800ms）及 dot（1600ms）播放后仍保持显示
    act(() => vi.advanceTimersByTime(800));
    expect(result.current.hiddenStatuses).toEqual({});
    act(() => vi.advanceTimersByTime(800));
    expect(result.current.hiddenStatuses).toEqual({});
    vi.useRealTimers();
  });

  it('StrictMode 下新增状态仍正确隐藏（useMemo 双调用不丢失新增状态差集）', () => {
    vi.useFakeTimers();
    const a = makeUnit('pipi', true, 1, false);
    const b0 = createBattle([a], [{ speciesId: 'kiki' }], 9);
    const b1 = playerEndTurn(playerSkill(b0, a.uid, 'poison_sting', b0.enemyUnits[0].uid));
    const enemyUid = b1.enemyUnits[0].uid;

    const { result, rerender } = renderHook(({ b }: { b: BattleState }) => useBattleFx(b), {
      initialProps: { b: b0 },
      wrapper: ({ children }) => createElement(StrictMode, null, children),
    });
    expect(result.current.hiddenStatuses).toEqual({});

    // 结算后新增中毒先隐藏（StrictMode 下曾因 useMemo 工厂副作用导致差集为空、攻击前就显示）
    act(() => rerender({ b: b1 }));
    expect(result.current.hiddenStatuses).toEqual({ [enemyUid]: ['poison'] });

    // 未到该目标被攻击的动画事件前，仍保持隐藏
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.hiddenStatuses).toEqual({ [enemyUid]: ['poison'] });
    vi.useRealTimers();
  });

  it('两只宠物先后攻击同一目标：各自的状态随该宠物攻击动画依次揭示', () => {
    vi.useFakeTimers();
    const a = makeUnit(SPECIES[0], true, 1, false); // 先行动：毒刺附加中毒
    const b = makeUnit(SPECIES[1], true, 2, false); // 后行动：火花附加灼烧
    const k = makeUnit(SPECIES[2], false, 1, false);

    const battle0 = makeBattleTwo([], [], a, b, k);
    const battle1 = makeBattleTwo(
      [
        {
          text: `${a.name} 使用「毒刺」攻击 ${k.name}，造成 4 伤害`,
          side: 'player',
          hp: { [a.uid]: a.hp, [b.uid]: b.hp, [k.uid]: 16 },
          actorUid: a.uid,
          targetUid: k.uid,
          addsStatus: ['poison'],
        },
        {
          text: `${b.name} 使用「火花」攻击 ${k.name}，造成 6 伤害`,
          side: 'player',
          hp: { [a.uid]: a.hp, [b.uid]: b.hp, [k.uid]: 10 },
          actorUid: b.uid,
          targetUid: k.uid,
          addsStatus: ['burn'],
        },
      ],
      [
        { kind: 'poison', value: 2, turns: 3 },
        { kind: 'burn', value: 2, turns: 2 },
      ],
      a,
      b,
      k,
    );

    const { result, rerender } = renderHook(({ b }: { b: BattleState }) => useBattleFx(b), {
      initialProps: { b: battle0 },
    });
    expect(result.current.hiddenStatuses).toEqual({});

    act(() => rerender({ b: battle1 }));
    expect(result.current.hiddenStatuses).toEqual({ [k.uid]: ['poison', 'burn'] });

    // 事件0（0ms）：毒刺攻击动画 → 只揭示中毒，灼烧仍隐藏
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.hiddenStatuses).toEqual({ [k.uid]: ['burn'] });

    // 事件1（800ms）：火花攻击动画 → 揭示灼烧，全部显示
    act(() => vi.advanceTimersByTime(800));
    expect(result.current.hiddenStatuses).toEqual({});
    vi.useRealTimers();
  });
});
