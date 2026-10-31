// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createBattle, makeUnit, playerEndTurn, playerSkill } from '../src/game/core/battle';
import { getSkill } from '../src/game/data/skills';
import { createInitialState } from '../src/game/state/reducer';
import { BattleScreen } from '../src/ui/BattleScreen';
import { parseEvent } from '../src/ui/battleFx';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function cast(skillId: string, immune = false, passive?: string) {
  const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'momo' }], 17);
  Object.assign(b.playerUnits[0], { skills: [skillId], passive, hp: 100, maxHp: 100, spd: 99 });
  Object.assign(b.enemyUnits[0], { skills: [], passive: undefined, hp: 100, maxHp: 100, debuffImmune: immune });
  const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, skillId, b.enemyUnits[0].uid));
  return { b, after, logs: after.log.filter(e => e.text.includes(`使用「${getSkill(skillId).name}」攻击`)) };
}

it.each([['ember', '灼烧', 2], ['poison_sting', '中毒', 2], ['steel_spike', '攻击降低', 1], ['entangle', '速度降低', 2]] as const)('%s攻击记录同时显示伤害与实际附加层数，动画仍识别为攻击', (id, status, layers) => {
  const { after, logs } = cast(id);
  expect(logs).toHaveLength(1);
  expect(logs[0].text).toContain(`；附加${status} ${layers} 层`);
  expect(logs[0].spans).toContainEqual(expect.objectContaining({ kind: 'status' }));
  expect(parseEvent(after, logs[0])).toMatchObject({ kind: 'attack', value: getSkill(id).damage });
});

it('技能和被动附加的同种状态写实际合计，免疫时不写虚假的施加层数', () => {
  const { logs } = cast('ember', false, 'heat');
  const value = Object.values(logs[0].impacts ?? {}).reduce((sum, impact) => sum + (impact.addedStatuses?.burn ?? 0), 0);
  expect(value).toBeGreaterThan(2);
  expect(logs[0].text).toContain(`附加灼烧 ${value} 层`);
  const immune = cast('ember', true, 'heat');
  expect(immune.logs[0].text).not.toContain('附加');
});

it('连击记录每段实际附加层数，不增加或合并动画事件', () => {
  const { after, logs } = cast('flame_combo');
  expect(logs.length).toBeGreaterThan(1);
  for (const entry of logs) {
    const value = Object.values(entry.impacts ?? {}).reduce((sum, impact) => sum + (impact.addedStatuses?.burn ?? 0), 0);
    if (value > 0) expect(entry.text).toContain(`附加灼烧 ${value} 层`);
    expect(parseEvent(after, entry)?.kind).toBe('attack');
  }
});

function uiSetup(mobile: boolean) {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const units = [makeUnit('coal', true, 0, false, 'back'), makeUnit('fifi', true, 2, false, 'back'), makeUnit('light_moss', true, 2, false), makeUnit('momo', true, 0, false)];
  const b = createBattle(units, [{ speciesId: 'momo' }], 17);
  b.playerUnits = units;
  const state = { ...createInitialState(), screen: 'battle' as const, battle: b };
  const dispatch = vi.fn();
  const view = render(createElement(BattleScreen, { state, dispatch }));
  const selected = () => document.querySelector('.battle-selected-name')?.textContent;
  const click = (name: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}，`) }));
  return { b, state, dispatch, view, selected, click };
}

it.each([false, true])('回合后按前排从左到右再后排选择存活伙伴，不按数组顺序，手机=%s', mobile => {
  const { b, state, dispatch, view, selected, click } = uiSetup(mobile);
  click('灼灼');
  expect(selected()).toBe('灼灼');
  const next = { ...b, round: 2 };
  view.rerender(createElement(BattleScreen, { state: { ...state, battle: next }, dispatch }));
  expect(selected()).toBe('迅迅');
  click('煤煤');
  expect(selected()).toBe('煤煤');
  const third = { ...next, round: 3, playerUnits: next.playerUnits.map(u => u.name === '迅迅' ? { ...u, hp: 0 } : u) };
  view.rerender(createElement(BattleScreen, { state: { ...state, battle: third }, dispatch }));
  expect(selected()).toBe('光苔球');
  const fourth = { ...third, round: 4, playerUnits: third.playerUnits.map(u => u.name === '光苔球' ? { ...u, hp: 0 } : u) };
  view.rerender(createElement(BattleScreen, { state: { ...state, battle: fourth }, dispatch }));
  expect(selected()).toBe('煤煤');
});

it('结算动画播放完才默认重选，普通指令阶段不覆盖手动选择', () => {
  const { b, state, dispatch, view, selected, click } = uiSetup(false);
  click('灼灼');
  const actor = b.playerUnits[0], target = b.enemyUnits[0];
  const next = { ...b, round: 2, log: [...b.log, { text: `${actor.name} 使用「爪击」攻击 ${target.name}，造成 5 伤害`, side: 'player' as const, actorUid: actor.uid, targetUid: target.uid, impacts: {} }] };
  view.rerender(createElement(BattleScreen, { state: { ...state, battle: next }, dispatch }));
  expect(selected()).toBe('灼灼');
  act(() => vi.runAllTimers());
  expect(selected()).toBe('迅迅');
  click('煤煤');
  view.rerender(createElement(BattleScreen, { state: { ...state, battle: { ...next, orders: {} } }, dispatch }));
  expect(selected()).toBe('煤煤');
});
