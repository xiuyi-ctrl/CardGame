// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createBattle, makeUnit, playerEndTurn, playerSkill } from '../src/game/core/battle';
import { getSkill } from '../src/game/data/skills';
import { impactPops } from '../src/ui/battleFeedback';
import { HIT_DELAY_MS, parseEvent, useBattleFx } from '../src/ui/battleFx';
import { PausableTimers } from '../src/ui/pausableTimers';

function fixture(skill: string, count = 1) {
  const battle = createBattle([makeUnit('momo', true, 0, false)], Array.from({ length: count }, () => ({ speciesId: 'momo' })), 37);
  battle.playerUnits = battle.playerUnits.map(unit => ({ ...unit, skills: [skill], passive: undefined, spd: 99, hp: 20, maxHp: 20 }));
  battle.enemyUnits = battle.enemyUnits.map(unit => ({ ...unit, skills: [], passive: undefined, acted: true, hp: 20, maxHp: 20 }));
  return battle;
}
function cast(battle: ReturnType<typeof fixture>, skill: string, target = battle.enemyUnits[0].uid) {
  return playerEndTurn(playerSkill(battle, battle.playerUnits[0].uid, skill, target));
}
function skillLog(battle: ReturnType<typeof fixture>, skill: string) {
  return battle.log.find(entry => entry.text.includes(`使用「${getSkill(skill).name}」`))!;
}
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('实际战斗反馈数值', () => {
  it('状态施加飘字只含图标和数字，不含状态名称', () => {
    const pops = impactPops({ hpLoss: 0, shieldLoss: 0, healing: 0, shieldGain: 0, shieldBroken: false, addedStatuses: { burn: 2, poison: 3, atkDown: 1 } }, false, false, undefined, true);
    expect(pops).toEqual([
      { text: '+2', heal: false, kind: 'status', statusIcon: 'burn' },
      { text: '+3', heal: false, kind: 'status', statusIcon: 'poison' },
      { text: '+1', heal: false, kind: 'status', statusIcon: 'atkDown' },
    ]);
  });
  it('扣盾与扣血分开记录，飘字合并为同一次伤害', () => {
    const b = fixture('punch');
    b.enemyUnits[0].shield = 2;
    const after = cast(b, 'punch');
    const impact = skillLog(after, 'punch').impacts![b.enemyUnits[0].uid];
    expect(impact).toMatchObject({ hpLoss: getSkill('punch').damage! - 2, shieldLoss: 2, shieldBroken: true });
    expect(impactPops(impact)).toEqual([expect.objectContaining({ text: `−${getSkill('punch').damage}`, kind: 'damage' })]);
  });
  it('5盾5血受到8点伤害时只显示一个−8', () => {
    expect(impactPops({ hpLoss: 3, shieldLoss: 5, healing: 0, shieldGain: 0, shieldBroken: true }, false, true)).toEqual([
      { text: '−8', heal: false, kind: 'damage', heavy: true, statusIcon: undefined },
    ]);
  });
  it('完全吸收仍显示伤害数字，过量击杀只显示实际剩余生命', () => {
    const shielded = fixture('punch');
    shielded.enemyUnits[0].shield = 20;
    const block = skillLog(cast(shielded, 'punch'), 'punch').impacts![shielded.enemyUnits[0].uid];
    expect(block.hpLoss).toBe(0);
    expect(impactPops(block, false, true)).toEqual([expect.objectContaining({ text: `−${getSkill('punch').damage}`, kind: 'damage' })]);
    const dying = fixture('punch');
    dying.enemyUnits[0].hp = 1;
    expect(skillLog(cast(dying, 'punch'), 'punch').impacts![dying.enemyUnits[0].uid].hpLoss).toBe(1);
  });
  it('无视护盾只记录生命损失', () => {
    const b = fixture('shadow_claw');
    b.enemyUnits[0].shield = 10;
    const change = skillLog(cast(b, 'shadow_claw'), 'shadow_claw').impacts![b.enemyUnits[0].uid];
    expect(change).toMatchObject({ hpLoss: 6, shieldLoss: 0, shieldBroken: false });
  });
  it('治疗不虚报溢出量，满血显示明确提示', () => {
    const b = fixture('water_bath');
    b.playerUnits[0].hp = 19;
    const changed = skillLog(cast(b, 'water_bath', b.playerUnits[0].uid), 'water_bath').impacts![b.playerUnits[0].uid];
    expect(changed.healing).toBe(1);
    b.playerUnits[0].hp = 20;
    const full = skillLog(cast(b, 'water_bath', b.playerUnits[0].uid), 'water_bath').impacts![b.playerUnits[0].uid];
    expect(impactPops(full, true)).toContainEqual(expect.objectContaining({ text: '生命已满', kind: 'notice' }));
  });
  it('护盾接近上限时只记录实际增加量', () => {
    const b = fixture('shield_skill');
    b.playerUnits[0].shield = 98;
    const impact = skillLog(cast(b, 'shield_skill', b.playerUnits[0].uid), 'shield_skill').impacts![b.playerUnits[0].uid];
    expect(impact.shieldGain).toBe(1);
  });
  it('群攻共享快照仍保留每个目标独立的实际扣血和耗盾', () => {
    const b = fixture('vine_whip', 2);
    b.enemyUnits[0].shield = 2;
    const after = cast(b, 'vine_whip');
    const logs = after.log.filter(entry => entry.text.includes('使用「藤鞭缠绕」攻击'));
    expect(logs[0].hp).toEqual(logs[1].hp);
    expect(logs[0].impacts![b.enemyUnits[0].uid]).toMatchObject({ hpLoss: 1, shieldLoss: 2 });
    expect(logs[1].impacts![b.enemyUnits[1].uid]).toMatchObject({ hpLoss: 3, shieldLoss: 0 });
  });
  it('首次攻击的灼烧层数也有表现元数据', () => {
    const b = fixture('ember');
    const impact = skillLog(cast(b, 'ember'), 'ember').impacts![b.enemyUnits[0].uid];
    expect(impact.addedStatuses?.burn).toBeGreaterThan(0);
  });
  it('附加灼烧与中毒不显示层数飘字，保留其他增益提示和实际持续伤害', () => {
    const impact = { hpLoss: 0, shieldLoss: 0, healing: 0, shieldGain: 0, shieldBroken: false, addedStatuses: { burn: 2, poison: 3, atkUp: 1 } };
    expect(impactPops(impact)).toEqual([expect.objectContaining({ kind: 'status', statusIcon: 'atkUp' })]);
    expect(impactPops({ ...impact, hpLoss: 2, addedStatuses: undefined }, false, true, 'burn')).toEqual([
      expect.objectContaining({ text: '−2', kind: 'damage', statusIcon: 'burn' }),
    ]);
  });
});

describe('起手、命中与清理', () => {
  it('锁链引爆同时播放所有连接目标的伤害与受击，不波及无锁链目标', () => {
    vi.useFakeTimers();
    const b = fixture('chain_activate', 3);
    b.enemyUnits.slice(0, 2).forEach((unit, index) => { unit.statuses = [{ kind: 'chainLink', value: 50, turns: 2, sourceUid: b.enemyUnits[1 - index].uid }]; });
    const after = cast(b, 'chain_activate');
    const logs = after.log.filter(entry => entry.text.includes('使用「锁链引爆」'));
    expect(logs).toHaveLength(2);
    expect(logs[0].simultaneousGroup).toBe(logs[1].simultaneousGroup);
    expect(logs[0].hp).toEqual(logs[1].hp);
    const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
    act(() => rerender({ battle: after }));
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.fx[b.playerUnits[0].uid]).toBeTruthy();
    act(() => vi.advanceTimersByTime(HIT_DELAY_MS));
    const hits = result.current.pops.filter(pop => pop.kind === 'damage');
    expect(hits).toHaveLength(2);
    expect(new Set(hits.map(pop => pop.uid))).toEqual(new Set(b.enemyUnits.slice(0, 2).map(u => u.uid)));
    expect(result.current.fx[b.enemyUnits[0].uid]).toBeTruthy();
    expect(result.current.fx[b.enemyUnits[1].uid]).toBeTruthy();
    expect(after.enemyUnits[2].hp).toBe(20);
  });

  it('群攻同批只有一个施法动作，各目标弹道有独立编号并同时结束', () => {
    vi.useFakeTimers();
    const b = fixture('vine_whip', 3);
    const after = cast(b, 'vine_whip');
    const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
    act(() => rerender({ battle: after }));
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.fx[b.playerUnits[0].uid].cls).toBe('fx-ranged');
    expect(result.current.strikes).toHaveLength(3);
    expect(new Set(result.current.strikes.map(strike => strike.id)).size).toBe(3);
    const castSeq = result.current.fx[b.playerUnits[0].uid].seq;
    act(() => vi.advanceTimersByTime(HIT_DELAY_MS));
    expect(result.current.fx[b.playerUnits[0].uid].seq).toBe(castSeq);
    expect(result.current.strikes).toHaveLength(0);
    expect(result.current.pops.filter(pop => pop.kind === 'damage')).toHaveLength(3);
  });
  it('终结群攻全体先播放死亡再离场，跳过会清理生命动画', () => {
    vi.useFakeTimers();
    const b = fixture('vine_whip', 2);
    b.enemyUnits.forEach(unit => { unit.hp = 1; });
    const after = cast(b, 'vine_whip');
    const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
    act(() => rerender({ battle: after }));
    act(() => vi.advanceTimersByTime(HIT_DELAY_MS));
    expect(b.enemyUnits.every(unit => result.current.life[unit.uid]?.kind === 'dying')).toBe(true);
    expect(result.current.animating).toBe(true);
    act(() => vi.advanceTimersByTime(400));
    expect(b.enemyUnits.every(unit => result.current.life[unit.uid]?.kind === 'gone')).toBe(true);
    act(() => result.current.skipAnim());
    expect(result.current.life).toEqual({});
    act(() => vi.runAllTimers());
    expect(result.current.life).toEqual({});
  });
  it('回溯恢复生命时播放砂粒聚拢，不显示被动名称且旧死亡回调不能覆盖复活', () => {
    vi.useFakeTimers();
    const b = fixture('punch');
    const uid = b.playerUnits[0].uid;
    const after = { ...b, log: [...b.log,
      { text: `${b.playerUnits[0].name} 受到灼烧 20 点伤害`, side: 'player' as const, targetUid: uid, hp: { [uid]: 0 } },
      { text: `${b.playerUnits[0].name} 的「时砂回溯」恢复 10 点生命`, side: 'player' as const, actorUid: uid, targetUid: uid, hp: { [uid]: 10 }, impacts: { [uid]: { hpLoss: 0, shieldLoss: 0, healing: 10, shieldGain: 0, shieldBroken: false } } },
    ] };
    const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
    act(() => rerender({ battle: after }));
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.life[uid]?.kind).toBe('dying');
    act(() => vi.advanceTimersByTime(800));
    expect(result.current.life[uid]?.kind).toBe('rewind');
    expect(result.current.pops.some(pop => pop.text === '+10')).toBe(true);
    expect(result.current.pops.some(pop => pop.text.includes('时砂回溯'))).toBe(false);
    act(() => vi.advanceTimersByTime(480));
    expect(result.current.life[uid]).toBeUndefined();
  });
  it('车轮战替补更换uid仍播放入场而非重置整场动画', () => {
    vi.useFakeTimers();
    const b = { ...fixture('punch'), gauntlet: { total: 2, current: 1 } };
    const next = makeUnit('fifi', false, 1, false);
    const after = { ...b, enemyUnits: [next], log: [...b.log, { text: `敌方派出下一只：${next.name}！`, side: 'enemy' as const, hp: { [next.uid]: next.hp } }] };
    const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
    act(() => rerender({ battle: after }));
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.life[next.uid]?.kind).toBe('enter');
    expect(result.current.animating).toBe(true);
    expect(result.current.pops).toHaveLength(0);
  });
  it('被动触发仅显示实际获盾数字，不显示被动名或重复施法', () => {
    vi.useFakeTimers();
    const b = fixture('punch');
    const uid = b.playerUnits[0].uid;
    const after = { ...b, log: [...b.log, { text: `${b.playerUnits[0].name} 的「熔炉之心」获得 2 点护盾`, side: 'player' as const, actorUid: uid, targetUid: uid,
      impacts: { [uid]: { hpLoss: 0, shieldLoss: 0, healing: 0, shieldGain: 2, shieldBroken: false } } }] };
    const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
    act(() => rerender({ battle: after }));
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.fx).toEqual({});
    act(() => vi.advanceTimersByTime(HIT_DELAY_MS));
    expect(result.current.pops).toEqual([expect.objectContaining({ text: '+2', kind: 'shield-gain' })]);
    expect(result.current.fx[uid]?.cls).toBe('fx-shield');
  });
  it.each(['poison_mist', 'stoke_fire'])('纯对敌负面技能%s播放施法、目标动画及新增层数', skill => {
    vi.useFakeTimers();
    const b = fixture(skill, 2);
    if (skill === 'stoke_fire') b.enemyUnits[0].statuses = [{ kind: 'burn', value: 2, turns: 2 }];
    const after = cast(b, skill);
    const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
    act(() => rerender({ battle: after }));
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.fx[b.playerUnits[0].uid]?.cls).toBe('fx-status-cast');
    expect(result.current.pops).toHaveLength(0);
    act(() => vi.advanceTimersByTime(HIT_DELAY_MS));
    const targets = skill === 'poison_mist' ? b.enemyUnits : [b.enemyUnits[0]];
    for (const target of targets) {
      expect(result.current.fx[target.uid]?.cls).toBe('fx-debuff');
      expect(result.current.statusPulses[target.uid]?.[skill === 'poison_mist' ? 'poison' : 'burn']).toBeGreaterThan(0);
      expect(result.current.pops).toEqual(expect.arrayContaining([expect.objectContaining({ uid: target.uid, kind: 'status', statusIcon: skill === 'poison_mist' ? 'poison' : 'burn' })]));
    }
  });
  it('攻击附带中毒仍不显示附加层数或图标轻弹', () => {
    vi.useFakeTimers();
    const b = fixture('poison_sting');
    const after = cast(b, 'poison_sting');
    const uid = b.enemyUnits[0].uid;
    const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
    act(() => rerender({ battle: after }));
    act(() => vi.advanceTimersByTime(HIT_DELAY_MS));
    expect(result.current.pops.some(pop => pop.kind === 'status' && pop.statusIcon === 'poison')).toBe(false);
    expect(result.current.statusPulses[uid]?.poison).toBeUndefined();
    expect(result.current.statusMap?.[uid]?.some(status => status.kind === 'poison')).toBe(true);
  });
  it('毒雾不能为免疫目标播放成功施加反馈', () => {
    vi.useFakeTimers();
    const b = fixture('poison_mist', 2);
    b.enemyUnits[0].debuffImmune = true;
    const after = cast(b, 'poison_mist');
    const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
    act(() => rerender({ battle: after }));
    act(() => vi.advanceTimersByTime(HIT_DELAY_MS));
    expect(result.current.statusPulses[b.enemyUnits[0].uid]?.poison).toBeUndefined();
    expect(result.current.pops.some(pop => pop.uid === b.enemyUnits[0].uid && pop.kind === 'status')).toBe(false);
    expect(result.current.fx[b.enemyUnits[0].uid]?.cls).not.toBe('fx-debuff');
  });
  it('纯附加灼烧对友方也播放施法与状态附加动画', () => {
    vi.useFakeTimers();
    const b = fixture('pass_flame');
    const uid = b.playerUnits[0].uid;
    const after = cast(b, 'pass_flame', uid);
    const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
    act(() => rerender({ battle: after }));
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.fx[uid]?.cls).toBe('fx-status-cast');
    expect(result.current.pops).toHaveLength(0);
    act(() => vi.advanceTimersByTime(HIT_DELAY_MS));
    expect(result.current.fx[uid]?.cls).toBe('fx-debuff');
    expect(result.current.statusPulses[uid]?.burn).toBeGreaterThan(0);
    expect(result.current.pops).toEqual(expect.arrayContaining([expect.objectContaining({ uid, kind: 'status', statusIcon: 'burn' })]));
  });
  it.each(['illusory_flame', 'pass_flame', 'relay_wildfire', 'molten_self_burn', 'burn_brand', 'blazing_fuel', 'ember_transfer', 'weaken', 'time_lag', 'despair_gaze'])('状态技能%s的所有施加日志都能识别，不依赖固定效果文本', skillId => {
    const b = fixture(skillId, 2);
    b.enemyUnits[0].statuses = [{ kind: 'burn', value: 3, turns: 2 }, { kind: 'fear', value: 3, turns: 99 }];
    const self = ['self', 'ally', 'allyAll'].includes(getSkill(skillId).target);
    const after = cast(b, skillId, self ? b.playerUnits[0].uid : b.enemyUnits[0].uid);
    const logs = after.log.filter(entry => entry.text.includes(`使用「${getSkill(skillId).name}」`));
    expect(logs.length).toBeGreaterThan(0);
    for (const log of logs) expect(parseEvent(after, log), JSON.stringify(log)).toMatchObject({ kind: 'buff', skillName: getSkill(skillId).name });
  });
  it('虚火幻身给自身和敌人施加灼烧均出现动画', () => {
    vi.useFakeTimers();
    const b = fixture('illusory_flame');
    const after = cast(b, 'illusory_flame', b.playerUnits[0].uid);
    const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
    act(() => rerender({ battle: after }));
    const seen = new Set<string>();
    for (let time = 0; time < 1600; time += 80) {
      act(() => vi.advanceTimersByTime(80));
      for (const pop of result.current.pops) if (pop.kind === 'status' && pop.statusIcon === 'burn') seen.add(pop.uid);
    }
    expect([...seen].sort()).toEqual([b.playerUnits[0].uid, b.enemyUnits[0].uid].sort());
  });
  it('起手和弹道先出现，命中时才显示扣血，格挡不显示生命受伤动作', () => {
    vi.useFakeTimers();
    const b = fixture('ember');
    b.enemyUnits[0].shield = 30;
    const after = cast(b, 'ember');
    const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
    act(() => rerender({ battle: after }));
    act(() => vi.advanceTimersByTime(0));
    expect(result.current.strikes).toHaveLength(1);
    expect(result.current.pops).toHaveLength(0);
    act(() => vi.advanceTimersByTime(HIT_DELAY_MS));
    expect(result.current.fx[b.enemyUnits[0].uid].cls).toContain('fx-block');
    expect(result.current.pops.filter(pop => pop.kind === 'damage')).toEqual([expect.objectContaining({ text: `−${getSkill('ember').damage}` })]);
    expect(result.current.pops.some(pop => pop.kind === 'shield-loss')).toBe(false);
    act(() => result.current.skipAnim());
    expect(result.current.strikes).toHaveLength(0);
    expect(result.current.pops).toHaveLength(0);
    expect(result.current.fx).toEqual({});
    expect(result.current.shieldMap?.[b.enemyUnits[0].uid]).toBe(after.enemyUnits[0].shield);
    act(() => vi.runAllTimers());
    expect(result.current.fx).toEqual({});
  });
  it('播放途中改变速度只调整剩余时间，不重复命中', () => {
    vi.useFakeTimers();
    const b = fixture('punch');
    const after = cast(b, 'punch');
    const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
    act(() => rerender({ battle: after }));
    act(() => vi.advanceTimersByTime(60));
    act(() => result.current.setAnimSpeed(2));
    act(() => vi.advanceTimersByTime(49));
    expect(result.current.pops).toHaveLength(0);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.pops.filter(pop => pop.kind === 'damage')).toHaveLength(1);
  });
  it('暂停期间缩放剩余计时，恢复后每个回调只执行一次', () => {
    vi.useFakeTimers();
    const timers = new PausableTimers();
    const callback = vi.fn();
    timers.set(callback, 100);
    vi.advanceTimersByTime(20);
    timers.pause(); timers.scaleRemaining(.5);
    vi.advanceTimersByTime(500);
    expect(callback).not.toHaveBeenCalled();
    timers.resume(); vi.advanceTimersByTime(39);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('桌面和手机共用的可见性事件暂停并恢复命中，不提前扣血', () => {
    vi.useFakeTimers();
    const b = fixture('punch');
    const after = cast(b, 'punch');
    const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
    act(() => window.dispatchEvent(new CustomEvent('petcard-visibility', { detail: true })));
    act(() => rerender({ battle: after }));
    act(() => vi.advanceTimersByTime(60));
    act(() => window.dispatchEvent(new CustomEvent('petcard-visibility', { detail: false })));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.pops).toHaveLength(0);
    expect(result.current.effectsPaused).toBe(true);
    act(() => window.dispatchEvent(new CustomEvent('petcard-visibility', { detail: true })));
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.pops.filter(pop => pop.kind === 'damage')).toHaveLength(1);
  });
});
