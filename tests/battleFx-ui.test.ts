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

  it('真实战斗：灼烧层数随动画事件回放（攻击时 5 层 → dot 结算后 2 层）', () => {
    vi.useFakeTimers();
    const lord = makeUnit('boss_fire', true, 0, false); // 熔火灼烧被动（灼烧 3 层）+ 烈焰爆发（灼烧 2 层）
    const k = makeUnit(SPECIES[1], false, 1, false);
    const b0 = createBattle([lord], [{ speciesId: k.speciesId }], 12345);
    const bOrdered = playerSkill(b0, lord.uid, 'flame_burst', b0.enemyUnits[0].uid);
    const b1 = playerEndTurn(bOrdered);
    const kUid = b1.enemyUnits[0].uid;
    // 引擎确实附加了 5 层（攻击后 dot 结算 3、剩 2），显示回放只是滞后
    expect(b1.enemyUnits[0].statuses.find((s) => s.kind === 'burn')!.value).toBe(2);

    const { result, rerender } = renderHook(({ b }: { b: BattleState }) => useBattleFx(b), {
      initialProps: { b: bOrdered },
    });

    act(() => rerender({ b: b1 }));
    // 攻击动画事件（0ms）触发：揭示灼烧，层数为施加时的 5 层（技能 2 + 被动 3）
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.statusMap?.[kUid]?.find((s) => s.kind === 'burn')?.value).toBe(5);

    // 敌方行动事件（800ms）：尚未到 dot 结算，仍显示 5 层
    act(() => vi.advanceTimersByTime(800));
    expect(result.current.statusMap?.[kUid]?.find((s) => s.kind === 'burn')?.value).toBe(5);

    // dot 结算事件（1600ms）：层数降到剩 2 层，与 -3 掉血动画同步
    act(() => vi.advanceTimersByTime(800));
    expect(result.current.statusMap?.[kUid]?.find((s) => s.kind === 'burn')?.value).toBe(2);

    // 再生被动事件（2400ms）：灼烧仍为 2 层（regen heal 不影响灼烧层数）
    act(() => vi.advanceTimersByTime(800));
    expect(result.current.statusMap?.[kUid]?.find((s) => s.kind === 'burn')?.value).toBe(2);

    // 动画播放完：回退到真实最终状态
    act(() => vi.advanceTimersByTime(2100));
    expect(result.current.statusMap).toBeNull();
    expect(b1.enemyUnits[0].statuses.find((s) => s.kind === 'burn')!.value).toBe(2);
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
    const b1 = playerEndTurn(playerSkill(b0, a.uid, 'weaken', b0.enemyUnits[0].uid));
    const enemyUid = b1.enemyUnits[0].uid;

    const { result, rerender } = renderHook(({ b }: { b: BattleState }) => useBattleFx(b), {
      initialProps: { b: b0 },
      wrapper: ({ children }) => createElement(StrictMode, null, children),
    });
    expect(result.current.hiddenStatuses).toEqual({});

    // 结算后新增减攻/减速先隐藏（StrictMode 下曾因 useMemo 工厂副作用导致差集为空、攻击前就显示）
    act(() => rerender({ b: b1 }));
    const hiddenKinds = result.current.hiddenStatuses[enemyUid] ?? [];
    expect(hiddenKinds.length).toBe(1);
    expect(['atkDown', 'spdDown']).toContain(hiddenKinds[0]);

    // 未到该目标被攻击的动画事件前，仍保持隐藏
    act(() => vi.advanceTimersByTime(0));
    const hiddenKinds2 = result.current.hiddenStatuses[enemyUid] ?? [];
    expect(hiddenKinds2.length).toBe(1);
    expect(['atkDown', 'spdDown']).toContain(hiddenKinds2[0]);
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

  it('敌人战吼强化自身：atkUp 状态在敌人施法动画播放时揭示', () => {
    vi.useFakeTimers();
    const a = makeUnit(SPECIES[0], true, 1, false);
    const k = makeUnit(SPECIES[1], false, 1, false);
    const atkUp: StatusEffect = { kind: 'atkUp', value: 2, turns: 2 };

    const battle0 = makeBattle([], [], a, k);
    const battle1 = makeBattle(
      [
        {
          text: `${k.name} 使用「战吼」，强化自身`,
          side: 'enemy',
          hp: { [a.uid]: a.hp, [k.uid]: k.hp },
          actorUid: k.uid,
          targetUid: k.uid,
        },
      ],
      [atkUp],
      a,
      k,
    );

    const { result, rerender } = renderHook(({ b }: { b: BattleState }) => useBattleFx(b), {
      initialProps: { b: battle0 },
    });
    expect(result.current.hiddenStatuses).toEqual({});

    act(() => rerender({ b: battle1 }));
    expect(result.current.hiddenStatuses).toEqual({ [k.uid]: ['atkUp'] });

    // 敌人施法动画（0ms）触发：atkUp 揭示，与施法动画同步
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.hiddenStatuses).toEqual({});
    vi.useRealTimers();
  });

  it('敌人战吼后该回合仍攻击：atkUp 在战吼施法动画时揭示，不会等到攻击动画', () => {
    vi.useFakeTimers();
    const a = makeUnit(SPECIES[0], true, 1, false);
    const k = makeUnit(SPECIES[1], false, 1, false);
    const atkUp: StatusEffect = { kind: 'atkUp', value: 2, turns: 2 };

    const battle0 = makeBattle([], [], a, k);
    const battle1 = makeBattle(
      [
        {
          text: `${k.name} 使用「战吼」，强化自身`,
          side: 'enemy',
          hp: { [a.uid]: a.hp, [k.uid]: k.hp },
          actorUid: k.uid,
          targetUid: k.uid,
        },
        {
          text: `${k.name} 使用「爪击」攻击 ${a.name}，造成 5 伤害`,
          side: 'enemy',
          hp: { [a.uid]: a.hp - 5, [k.uid]: k.hp },
          actorUid: k.uid,
          targetUid: a.uid,
        },
      ],
      [atkUp],
      a,
      k,
    );

    const { result, rerender } = renderHook(({ b }: { b: BattleState }) => useBattleFx(b), {
      initialProps: { b: battle0 },
    });

    act(() => rerender({ b: battle1 }));
    expect(result.current.hiddenStatuses).toEqual({ [k.uid]: ['atkUp'] });

    // 事件0（0ms）：战吼施法动画 → 揭示 atkUp
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.hiddenStatuses).toEqual({});

    // 事件1（800ms）：攻击动画播放后仍保持显示
    act(() => vi.advanceTimersByTime(800));
    expect(result.current.hiddenStatuses).toEqual({});
    vi.useRealTimers();
  });

  it('敌人带灼烧先掉血再战吼：atkUp 在战吼施法动画时揭示，不被更早的 dot 掉血动画提前', () => {
    vi.useFakeTimers();
    const a = makeUnit(SPECIES[0], true, 1, false);
    const k = makeUnit(SPECIES[1], false, 1, false);
    const burn: StatusEffect = { kind: 'burn', value: 2, turns: 2 };
    const atkUp: StatusEffect = { kind: 'atkUp', value: 2, turns: 2 };

    // battle0：敌人已带灼烧（上一回合附加，非本次新增）
    const battle0 = makeBattle([], [burn], a, k);
    const battle1 = makeBattle(
      [
        {
          text: `${k.name} 受到灼烧 2 点伤害`,
          side: 'enemy',
          hp: { [a.uid]: a.hp, [k.uid]: k.hp - 2 },
          targetUid: k.uid,
        },
        {
          text: `${k.name} 使用「战吼」，强化自身`,
          side: 'enemy',
          hp: { [a.uid]: a.hp, [k.uid]: k.hp - 2 },
          actorUid: k.uid,
          targetUid: k.uid,
        },
      ],
      [burn, atkUp],
      a,
      k,
    );

    const { result, rerender } = renderHook(({ b }: { b: BattleState }) => useBattleFx(b), {
      initialProps: { b: battle0 },
    });
    expect(result.current.hiddenStatuses).toEqual({});

    act(() => rerender({ b: battle1 }));
    expect(result.current.hiddenStatuses).toEqual({ [k.uid]: ['atkUp'] });

    // 事件0（0ms）：dot 掉血动画 → atkUp 仍隐藏（不归入 dot 事件）
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.hiddenStatuses).toEqual({ [k.uid]: ['atkUp'] });

    // 事件1（800ms）：战吼施法动画 → 揭示 atkUp
    act(() => vi.advanceTimersByTime(800));
    expect(result.current.hiddenStatuses).toEqual({});
    vi.useRealTimers();
  });
});

describe('useBattleFx：战斗记录随攻击动画逐条揭示', () => {
  it('新回合日志不一次性全显示，随动画事件逐条出现', () => {
    vi.useFakeTimers();
    const a = makeUnit(SPECIES[0], true, 1, false);
    const k = makeUnit(SPECIES[1], false, 1, false);

    const battle0 = makeBattle([], [], a, k);
    const battle1 = makeBattle(
      [
        { text: '回合开始', side: 'info' },
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
      [],
      a,
      k,
    );

    const { result, rerender } = renderHook(({ b }: { b: BattleState }) => useBattleFx(b), {
      initialProps: { b: battle0 },
    });
    expect(result.current.revealedLogLen).toBe(0);

    // 结算：新日志先全部隐藏（不一次性全显示）
    act(() => rerender({ b: battle1 }));
    expect(result.current.revealedLogLen).toBe(0);

    // 事件0（0ms）：攻击动画 → 揭示到第 2 条（info 与攻击一并显示）
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.revealedLogLen).toBe(2);

    // 事件1（800ms）：dot 动画 → 全部揭示
    act(() => vi.advanceTimersByTime(800));
    expect(result.current.revealedLogLen).toBe(3);

    // 动画结束：保持全部
    act(() => vi.advanceTimersByTime(800 + 1300));
    expect(result.current.revealedLogLen).toBe(3);
    vi.useRealTimers();
  });

  it('进入中途战斗（存档恢复）：既有日志全部显示，不重播', () => {
    vi.useFakeTimers();
    const a = makeUnit(SPECIES[0], true, 1, false);
    const k = makeUnit(SPECIES[1], false, 1, false);
    const battle = makeBattle(
      [{ text: `${a.name} 使用「烈焰」攻击 ${k.name}，造成 8 伤害`, side: 'player' }],
      [],
      a,
      k,
    );
    const { result } = renderHook(({ b }: { b: BattleState }) => useBattleFx(b), {
      initialProps: { b: battle },
    });
    expect(result.current.revealedLogLen).toBe(1);
    vi.useRealTimers();
  });

  it('队友护盾 buff：护盾飘字出现在被加盾的队友身上，而非施法者', () => {
    vi.useFakeTimers();
    const a = makeUnit(SPECIES[0], true, 1, false);
    const b = makeUnit(SPECIES[0], true, 0, false);
    const k = makeUnit(SPECIES[1], false, 1, false);

    const battle0 = { ...makeBattle([], [], a, k), playerUnits: [a, b] };
    const battle1 = {
      ...makeBattle(
        [
          {
            text: `${a.name} 使用「坚盾」，强化${b.name}`,
            side: 'player',
            hp: { [a.uid]: a.hp, [b.uid]: b.hp, [k.uid]: k.hp },
            actorUid: a.uid,
            targetUid: b.uid,
          },
        ],
        [],
        a,
        k,
      ),
      playerUnits: [a, b],
    };

    const { result, rerender } = renderHook(({ b }: { b: BattleState }) => useBattleFx(b), {
      initialProps: { b: battle0 },
    });

    act(() => rerender({ b: battle1 }));
    // 触发 buff 事件动画
    act(() => vi.advanceTimersByTime(0));

    // 飘字应出现在队友 b 身上
    const popOnB = result.current.pops.filter((p) => p.uid === b.uid);
    const popOnA = result.current.pops.filter((p) => p.uid === a.uid);
    expect(popOnB.length).toBe(1);
    expect(popOnB[0].text).toBe('🛡️护盾');
    expect(popOnB[0].shield).toBe(true);
    expect(popOnA.length).toBe(0);

    // 动画结束后飘字消失
    act(() => vi.advanceTimersByTime(800 + 1300));
    expect(result.current.pops.length).toBe(0);
    vi.useRealTimers();
  });
});
