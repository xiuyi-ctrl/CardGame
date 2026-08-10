import { describe, it, expect } from 'vitest';
import { computeRevealAt, type RevealEntry } from '../src/ui/battleFx';

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

  it('目标从未出现在任何事件时兜底归入第一个事件，保证不迟于动画开始显示', () => {
    const events = [{ targetUid: 'enemy-1', kind: 'dot', statusKind: 'burn' }];
    const revealAt = computeRevealAt(events, { 'enemy-1': ['atkDown'] });
    expect(kindsAt(revealAt, 0, 'enemy-1')).toEqual(['atkDown']);
  });

  it('无事件时返回空映射（由调用方直接显示）', () => {
    expect(computeRevealAt([], { 'enemy-1': ['burn'] })).toEqual({});
  });
});
