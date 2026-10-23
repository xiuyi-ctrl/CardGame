// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createBattle, makeUnit, playerEndTurn, playerSkill } from '../src/game/core/battle';
import { getSkill } from '../src/game/data/skills';
import { useBattleFx } from '../src/ui/battleFx';

function setup(skillId: string, species = ['pipi', 'pipi']) {
  const b = createBattle([makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)],
    species.map(speciesId => ({ speciesId })), 31);
  b.playerUnits = b.playerUnits.map(u => ({ ...u, hp: 100, maxHp: 100, spd: 99, passive: undefined, skills: [skillId] }));
  b.enemyUnits = b.enemyUnits.map(u => ({ ...u, hp: 100, maxHp: 100, skills: [], acted: true }));
  return b;
}

function cast(b: ReturnType<typeof setup>, id: string) {
  return playerEndTurn(playerSkill(b, b.playerUnits[0].uid, id));
}

function hits(b: ReturnType<typeof setup>, id: string) {
  return b.log.filter(e => e.text.includes(`使用「${getSkill(id).name}」攻击`));
}

afterEach(() => vi.useRealTimers());

describe('群体技能分段批量结算', () => {
  it('所有目标主伤害先结算并共享快照，之后才反伤', () => {
    const b = setup('vine_whip');
    const after = cast(b, 'vine_whip');
    const attack = hits(after, 'vine_whip');
    expect(attack).toHaveLength(2);
    expect(attack[0].simultaneousGroup).toBeDefined();
    expect(attack[1].simultaneousGroup).toBe(attack[0].simultaneousGroup);
    expect(attack[0].hp).toEqual(attack[1].hp);
    for (const enemy of b.enemyUnits) expect(attack[0].hp?.[enemy.uid]).toBe(97);
    expect(attack[0].hp?.[b.playerUnits[0].uid]).toBe(100);
    const firstCounter = after.log.findIndex(e => e.text.includes('反伤'));
    expect(firstCounter).toBeGreaterThan(after.log.indexOf(attack[1]));
  });

  it('第一名敌人反伤击杀施法者，不撤销已经发出的其他群攻命中', () => {
    const b = setup('vine_whip');
    b.playerUnits[0].hp = 1;
    const after = cast(b, 'vine_whip');
    expect(hits(after, 'vine_whip')).toHaveLength(2);
    expect(hits(after, 'vine_whip')[1].hp?.[b.enemyUnits[1].uid]).toBe(97);
  });

  it('多段群攻按段遍历所有目标，每段后再反伤', () => {
    const b = setup('dragon_breath');
    const after = cast(b, 'dragon_breath');
    const attack = hits(after, 'dragon_breath');
    expect(attack.map(e => e.targetUid)).toEqual([...b.enemyUnits, ...b.enemyUnits].map(u => u.uid));
    expect(attack[0].simultaneousGroup).toBe(attack[1].simultaneousGroup);
    expect(attack[2].simultaneousGroup).toBe(attack[3].simultaneousGroup);
    expect(attack[2].simultaneousGroup).not.toBe(attack[0].simultaneousGroup);
    const counters = after.log.filter(e => e.text.includes('反伤'));
    expect(counters).toHaveLength(4);
    expect(after.log.indexOf(counters[0])).toBeGreaterThan(after.log.indexOf(attack[1]));
    expect(after.log.indexOf(counters[1])).toBeLessThan(after.log.indexOf(attack[2]));
  });

  it('群攻全部击杀仍保留所有同批命中，后续段停止', () => {
    const b = setup('dragon_breath');
    b.enemyUnits = b.enemyUnits.map(u => ({ ...u, hp: 1 }));
    const after = cast(b, 'dragon_breath');
    expect(after.phase).toBe('won');
    expect(hits(after, 'dragon_breath')).toHaveLength(2);
    expect(hits(after, 'dragon_breath')[0].hp).toEqual(hits(after, 'dragon_breath')[1].hp);
    expect(after.log.some(e => e.text.includes('反伤'))).toBe(false);
  });

  it('死亡自爆在所有主命中后触发，连锁炸死的目标不会重复自爆', () => {
    const b = setup('vine_whip', ['boss_minion_rock', 'boss_minion_rock', 'momo']);
    b.enemyUnits[0].hp = 1;
    b.enemyUnits[1].hp = 5;
    const after = cast(b, 'vine_whip');
    const attack = hits(after, 'vine_whip');
    expect(attack).toHaveLength(3);
    const explosions = after.log.filter(e => e.text.includes('岩壳碎片」爆裂'));
    expect(explosions).toHaveLength(2);
    expect(after.log.indexOf(explosions[0])).toBeGreaterThan(after.log.indexOf(attack[2]));
    expect(attack[0].hp?.[b.enemyUnits[1].uid]).toBe(2);
  });

  it('群体治疗先治疗所有伙伴，再触发净化被动', () => {
    const b = setup('tidal_domain', ['momo']);
    const healer = makeUnit('light_moss', true, 0, false);
    b.playerUnits[0].passive = healer.passive;
    b.playerUnits = b.playerUnits.map(u => ({ ...u, hp: 30, statuses: [{ kind: 'burn', value: 4, turns: 2 }] }));
    const after = cast(b, 'tidal_domain');
    const heal = after.log.filter(e => e.text.includes('使用「潮汐领域」，治愈'));
    expect(heal).toHaveLength(2);
    for (const u of b.playerUnits) {
      expect(heal[0].hp?.[u.uid]).toBe(34);
      expect(heal[0].statuses?.[u.uid].find(s => s.kind === 'burn')?.value).toBe(4);
    }
    const cleanse = after.log.findIndex(e => e.text.includes('移除') && e.text.includes('灼烧'));
    expect(cleanse).toBeGreaterThan(after.log.indexOf(heal[1]));
  });

  it.each(['tidal_domain', 'iron_domain', 'furnace_shell'])('%s 全体/双友方效果共享批次与完整快照', id => {
    const b = setup(id, ['momo']);
    b.playerUnits = b.playerUnits.map(u => ({ ...u, hp: 30 }));
    const ordered = playerSkill(b, b.playerUnits[0].uid, id, b.playerUnits[1].uid);
    const after = playerEndTurn(ordered);
    const logs = after.log.filter(e => e.actorUid === b.playerUnits[0].uid && e.text.includes(`使用「${getSkill(id).name}」`));
    expect(logs).toHaveLength(2);
    expect(logs[0].simultaneousGroup).toBeDefined();
    expect(logs[0].simultaneousGroup).toBe(logs[1].simultaneousGroup);
    expect(logs[0].hp).toEqual(logs[1].hp);
    expect(logs[0].shields).toEqual(logs[1].shields);
  });
});

describe('群体动画同步起播', () => {
  it.each(['vine_whip', 'tidal_domain', 'iron_domain'])('%s 所有目标首帧同时显示，后续反伤不抢播', id => {
    vi.useFakeTimers();
    const b = setup(id);
    b.playerUnits = b.playerUnits.map(u => ({ ...u, hp: 30 }));
    const after = cast(b, id);
    const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
    act(() => rerender({ battle: after }));
    act(() => vi.advanceTimersByTime(0));
    const targets = id === 'vine_whip' ? b.enemyUnits : b.playerUnits;
    for (const target of targets) expect(result.current.pops.some(p => p.uid === target.uid)).toBe(true);
    if (id === 'vine_whip') {
      expect(result.current.pops.some(p => p.uid === b.playerUnits[0].uid)).toBe(false);
      expect(result.current.hpMap?.[b.playerUnits[0].uid]).toBe(30);
    }
  });

  it('终结群攻的所有目标仍同时飘字，不被胜负截断', () => {
    vi.useFakeTimers();
    const b = setup('vine_whip');
    b.enemyUnits = b.enemyUnits.map(u => ({ ...u, hp: 1 }));
    const after = cast(b, 'vine_whip');
    const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
    act(() => rerender({ battle: after }));
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.pops.map(p => p.uid)).toEqual(b.enemyUnits.map(u => u.uid));
  });
});
