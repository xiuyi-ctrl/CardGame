// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { createBattle, makeUnit, playerEndTurn, playerSkill } from '../src/game/core/battle';
import { createInitialState } from '../src/game/state/reducer';
import { BattleScreen } from '../src/ui/BattleScreen';
import { ACTION_MS, HIT_DELAY_MS, parseEvent, useBattleFx } from '../src/ui/battleFx';
import { impactPops } from '../src/ui/battleFeedback';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function fixture() {
  const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 17);
  for (const u of [...b.playerUnits, ...b.enemyUnits]) Object.assign(u, { hp: 100, maxHp: 100, passive: undefined, statuses: [], skills: [] });
  b.playerUnits[0].skills = ['weaken'];
  return b;
}

it.each([0, 1])('弱化按实际随机结果显示减益图标和负号，分支=%s', parity => {
  vi.useFakeTimers();
  const b = fixture(); b.rngCount = parity;
  const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'weaken', b.enemyUnits[0].uid));
  const uid = b.enemyUnits[0].uid;
  const kind = after.enemyUnits[0].statuses[0].kind;
  const entry = after.log.find(e => e.text.includes('使用「弱化」'))!;
  expect(parseEvent(after, entry)?.addsStatus).toEqual([kind]);
  const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
  rerender({ battle: after });
  expect(result.current.statusMap?.[uid]).toEqual([]);
  act(() => vi.advanceTimersByTime(HIT_DELAY_MS));
  expect(result.current.pops).toContainEqual(expect.objectContaining({ uid, text: '−2', statusIcon: kind, debuff: true }));
  expect(result.current.pops.some(p => p.statusIcon === (kind === 'atkDown' ? 'spdDown' : 'atkDown'))).toBe(false);
});

it('增益、减益和持续伤害层数分别使用正确符号及图标', () => {
  const pops = impactPops({ hpLoss: 0, shieldLoss: 0, shieldGain: 0, shieldBroken: false, healing: 0,
    addedStatuses: { atkDown: 2, spdDown: 2, atkUp: 2, windSpd: 2, burn: 3, poison: 4, shadowMark: 1, skillSealPending: 1 } }, false, false, undefined, true);
  for (const kind of ['atkDown', 'spdDown']) expect(pops).toContainEqual(expect.objectContaining({ statusIcon: kind, text: '−2', debuff: true }));
  for (const kind of ['atkUp', 'windSpd']) expect(pops).toContainEqual({ statusIcon: kind, text: '+2', kind: 'status', heal: false });
  expect(pops).toContainEqual(expect.objectContaining({ statusIcon: 'burn', text: '+3', debuff: true }));
  expect(pops).toContainEqual(expect.objectContaining({ statusIcon: 'poison', text: '+4', debuff: true }));
});

it('后续施加动画前不显示状态，重新施加同种状态也不泄露，首帧使用旧快照', () => {
  vi.useFakeTimers();
  const b = fixture(), uid = b.enemyUnits[0].uid, actor = b.playerUnits[0].uid;
  const hp = { [uid]: 100, [actor]: 100 };
  const status = { kind: 'spdDown' as const, value: 2, turns: 2 };
  const makeAfter = (before: typeof b) => ({ ...before, enemyUnits: [{ ...before.enemyUnits[0], statuses: [status] }], log: [...before.log,
    { text: `${b.playerUnits[0].name} 使用「爪击」攻击 ${b.enemyUnits[0].name}，造成 0 伤害`, side: 'player' as const, actorUid: actor, targetUid: uid, hp, statuses: { [uid]: [], [actor]: [] }, impacts: {} },
    { text: `${b.playerUnits[0].name} 使用「弱化」，${b.enemyUnits[0].name} 降低速度 2 层`, side: 'player' as const, actorUid: actor, targetUid: uid, hp, statuses: { [uid]: [status], [actor]: [] }, impacts: { [uid]: { hpLoss: 0, shieldLoss: 0, shieldGain: 0, healing: 0, shieldBroken: false, addedStatuses: { spdDown: 2 } } } },
  ] });
  const frames: ReturnType<typeof useBattleFx>['statusMap'][] = [];
  const { result, rerender } = renderHook(({ battle }) => { const fx = useBattleFx(battle); frames.push(fx.statusMap); return fx; }, { initialProps: { battle: b } });
  let before = b;
  for (let cycle = 0; cycle < 2; cycle++) {
    const after = makeAfter(before), firstFrame = frames.length;
    rerender({ battle: after });
    expect(frames[firstFrame]?.[uid]).toEqual([]);
    act(() => vi.advanceTimersByTime(ACTION_MS + HIT_DELAY_MS - 1));
    expect(result.current.statusMap?.[uid]).toEqual([]);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.statusMap?.[uid]).toEqual([status]);
    act(() => vi.runAllTimers());
    before = { ...after, enemyUnits: [{ ...after.enemyUnits[0], statuses: [] }] };
    rerender({ battle: before });
  }
});

it.each([false, true])('战场实际图标在施加命中时才出现，手机=%s', mobile => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const b = fixture();
  const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'weaken', b.enemyUnits[0].uid));
  const state = { ...createInitialState(), screen: 'battle' as const, battle: b };
  const view = render(createElement(BattleScreen, { state, dispatch: vi.fn() }));
  view.rerender(createElement(BattleScreen, { state: { ...state, battle: after }, dispatch: vi.fn() }));
  const art = after.enemyUnits[0].statuses[0].kind === 'atkDown' ? 'atk-down' : 'spd-down';
  const icons = () => document.querySelectorAll(`img[src="/buff-icons/${art}.png"]`);
  expect(icons()).toHaveLength(0);
  act(() => vi.advanceTimersByTime(HIT_DELAY_MS));
  expect(icons().length).toBeGreaterThan(0);
});
