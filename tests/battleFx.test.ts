import { describe, it, expect } from 'vitest';
import { computeRevealAt, type RevealEntry, rockShellHitsAfterEvent } from '../src/ui/battleFx';

const kindsAt = (revealAt: Record<number, RevealEntry[]>, i: number, uid: string): string[] | undefined =>
  revealAt[i]?.find((e) => e.uid === uid)?.kinds;

describe('computeRevealAt：新增状态按附加它的攻击动画揭示', () => {
  it('攻击附加灼烧：在该攻击动画事件播放时揭示', () => {
    const events = [
      { targetUid: 'enemy-1', kind: 'attack', addsStatus: ['burn'] as string[] },
      { targetUid: 'player-1', kind: 'attack' },
    ];
    const revealAt = computeRevealAt(events, { 'enemy-1': ['burn'] });
    expect(kindsAt(revealAt, 0, 'enemy-1')).toEqual(['burn']);
  });

  it('无归属标记的攻击（旧日志）：归入该单位作为目标的第一个事件，仍与攻击动画同步', () => {
    const events = [
      { targetUid: 'enemy-1', kind: 'attack' },
      { targetUid: 'enemy-2', kind: 'attack' },
    ];
    const revealAt = computeRevealAt(events, { 'enemy-1': ['poison'] });
    expect(kindsAt(revealAt, 0, 'enemy-1')).toEqual(['poison']);
  });

  it('连击多段：状态在最后一段攻击动画揭示（状态全部段结算后才附加）', () => {
    const events = [
      { targetUid: 'enemy-1', kind: 'attack' },
      { targetUid: 'enemy-1', kind: 'attack', addsStatus: ['burn'] as string[] },
    ];
    const revealAt = computeRevealAt(events, { 'enemy-1': ['burn'] });
    expect(revealAt[0]).toBeUndefined();
    expect(kindsAt(revealAt, 1, 'enemy-1')).toEqual(['burn']);
  });

  it('两只宠物先后攻击同一目标：各状态随各自攻击动画依次揭示', () => {
    const events = [
      { targetUid: 'enemy-1', kind: 'attack', addsStatus: ['poison'] as string[] },
      { targetUid: 'enemy-2', kind: 'attack' },
      { targetUid: 'enemy-1', kind: 'attack', addsStatus: ['burn'] as string[] },
    ];
    const revealAt = computeRevealAt(events, { 'enemy-1': ['poison', 'burn'] });
    expect(kindsAt(revealAt, 0, 'enemy-1')).toEqual(['poison']);
    expect(kindsAt(revealAt, 2, 'enemy-1')).toEqual(['burn']);
  });

  it('同轮紧跟的 dot（灼烧掉血）事件不参与匹配，不会把揭示推迟到 dot 动画', () => {
    const events = [
      { targetUid: 'enemy-1', kind: 'attack', addsStatus: ['burn'] as string[] },
      { targetUid: 'enemy-1', kind: 'dot', statusKind: 'burn' },
    ];
    const revealAt = computeRevealAt(events, { 'enemy-1': ['burn'] });
    expect(kindsAt(revealAt, 0, 'enemy-1')).toEqual(['burn']);
    expect(revealAt[1]).toBeUndefined();
  });

  it('无攻击归属的状态（如 buff 施法强化）：归入该单位作为目标的第一个事件，随施法动画揭示', () => {
    const events = [
      { targetUid: 'player-1', kind: 'attack' },
      { targetUid: 'enemy-1', kind: 'buff' },
    ];
    const revealAt = computeRevealAt(events, { 'enemy-1': ['atkUp'] });
    expect(revealAt[0]).toBeUndefined();
    expect(kindsAt(revealAt, 1, 'enemy-1')).toEqual(['atkUp']);
  });

  it('buff 状态精确归入该单位的施法事件：即使该单位先受 dot 掉血，也不被提前到 dot 动画', () => {
    const events = [
      { targetUid: 'enemy-1', kind: 'dot', statusKind: 'burn' },
      { targetUid: 'enemy-1', kind: 'buff', actorUid: 'enemy-1' },
    ];
    const revealAt = computeRevealAt(events, { 'enemy-1': ['atkUp'] });
    expect(revealAt[0]).toBeUndefined();
    expect(kindsAt(revealAt, 1, 'enemy-1')).toEqual(['atkUp']);
  });

  it('buff 状态优先匹配施法事件而非更早的受击事件（如铁刺减防反向反伤）', () => {
    const events = [
      { targetUid: 'enemy-1', kind: 'thorn' },
      { targetUid: 'enemy-2', kind: 'attack' },
      { targetUid: 'enemy-1', kind: 'buff', actorUid: 'enemy-1' },
    ];
    const revealAt = computeRevealAt(events, { 'enemy-1': ['atkUp'] });
    expect(revealAt[0]).toBeUndefined();
    expect(revealAt[1]).toBeUndefined();
    expect(kindsAt(revealAt, 2, 'enemy-1')).toEqual(['atkUp']);
  });

  it('目标从未出现在任何事件时兜底归入第一个事件，保证不迟于动画开始显示', () => {
    const events = [{ targetUid: 'enemy-1', kind: 'dot', statusKind: 'burn' }];
    const revealAt = computeRevealAt(events, { 'enemy-1': ['atkDown'] });
    expect(kindsAt(revealAt, 0, 'enemy-1')).toEqual(['atkDown']);
  });

  it('无事件时返回空映射（由调用方直接显示）', () => {
    expect(computeRevealAt([], { 'enemy-1': ['burn'] })).toEqual({});
  });
});

import { parseEvent } from '../src/ui/battleFx';
import type { BattleState, LogEntry } from '../src/game/types';

const mkBattle = (): BattleState => ({
  playerUnits: [],
  enemyUnits: [],
  turnOrder: [],
  turnIndex: 0,
  round: 1,
  playerAp: 0,
  playerApMax: 0,
  enemyAp: 0,
  phase: 'acting',
  log: [],
  pendingTame: [],
  seed: 0,
  rngCount: 0,
});

describe('parseEvent：范围伤害 burst 事件提取正确伤害值', () => {
  it('岩壳碎片自爆：提取真实伤害值', () => {
    const entry: LogEntry = {
      text: '岩壳碎片 的「岩壳碎片」爆裂，对全体敌人和友方造成 3 点真实伤害！',
      side: 'enemy',
      burstTargets: ['u1', 'u2'],
    };
    const ev = parseEvent(mkBattle(), entry);
    expect(ev).not.toBeNull();
    expect(ev!.kind).toBe('burst');
    expect(ev!.value).toBe(3);
    expect(ev!.burstTargets).toEqual(['u1', 'u2']);
  });

  it('岩壳崩解 AOE：提取伤害值（无空格、无"真实"）', () => {
    const entry: LogEntry = {
      text: '岩甲巨像 的「岩壳崩解」触发！岩壳碎裂，对全体敌人造成5点伤害！',
      side: 'enemy',
      burstTargets: ['u1'],
    };
    const ev = parseEvent(mkBattle(), entry);
    expect(ev).not.toBeNull();
    expect(ev!.kind).toBe('burst');
    expect(ev!.value).toBe(5);
  });

  it('无 burstTargets 的普通日志不触发 burst 解析', () => {
    const entry: LogEntry = {
      text: '岩壳碎片 的「岩壳碎片」爆裂，对全体敌人和友方造成 3 点真实伤害！',
      side: 'enemy',
    };
    expect(parseEvent(mkBattle(), entry)).toBeNull();
  });
});

describe('rockShellHitsAfterEvent：岩壳崩解计数动画递增', () => {
  const bossUid = 'boss-1';
  const base: Record<string, number> = { [bossUid]: 0 };

  it('attack 命中 boss 时 +1', () => {
    const ev = { kind: 'attack' as const, targetUid: bossUid, value: 3 };
    expect(rockShellHitsAfterEvent(base, ev, bossUid)).toEqual({ [bossUid]: 1 });
  });

  it('多段 attack 逐 +1', () => {
    let map: Record<string, number> = { [bossUid]: 0 };
    map = rockShellHitsAfterEvent(map, { kind: 'attack', targetUid: bossUid, value: 3 }, bossUid);
    expect(map).toEqual({ [bossUid]: 1 });
    map = rockShellHitsAfterEvent(map, { kind: 'attack', targetUid: bossUid, value: 3 }, bossUid);
    expect(map).toEqual({ [bossUid]: 2 });
    map = rockShellHitsAfterEvent(map, { kind: 'attack', targetUid: bossUid, value: 3 }, bossUid);
    expect(map).toEqual({ [bossUid]: 3 });
  });

  it('burst 波及 boss 时 +1（小怪自爆）', () => {
    const ev = { kind: 'burst' as const, burstTargets: [bossUid, 'player-1'], value: 3 };
    expect(rockShellHitsAfterEvent(base, ev, bossUid)).toEqual({ [bossUid]: 1 });
  });

  it('burst 未波及 boss（岩壳崩解 AOE）时归 0', () => {
    const ev = { kind: 'burst' as const, burstTargets: ['player-1', 'player-2'], value: 5 };
    expect(rockShellHitsAfterEvent({ [bossUid]: 3 }, ev, bossUid)).toEqual({ [bossUid]: 0 });
  });

  it('无关事件（heal/dot/buff/speed）不改变计数', () => {
    expect(rockShellHitsAfterEvent(base, { kind: 'heal', targetUid: bossUid, value: 5 }, bossUid)).toEqual(base);
    expect(rockShellHitsAfterEvent(base, { kind: 'dot', targetUid: bossUid, value: 2 }, bossUid)).toEqual(base);
    expect(rockShellHitsAfterEvent(base, { kind: 'buff', targetUid: bossUid, value: 0 }, bossUid)).toEqual(base);
    expect(rockShellHitsAfterEvent(base, { kind: 'speed', targetUid: bossUid, value: 1 }, bossUid)).toEqual(base);
  });

  it('bossUid 不存在时不做任何改变', () => {
    const ev = { kind: 'attack' as const, targetUid: bossUid, value: 3 };
    expect(rockShellHitsAfterEvent(base, ev, undefined)).toEqual(base);
  });

  it('attack 命中非 boss 目标不改变计数', () => {
    const ev = { kind: 'attack' as const, targetUid: 'other-unit', value: 3 };
    expect(rockShellHitsAfterEvent(base, ev, bossUid)).toEqual(base);
  });
});
