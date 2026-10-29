// @vitest-environment jsdom
import { createElement, useReducer } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BackpackScreen, EventScreen } from '../src/ui/App';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { buildEventByType, type GameState } from '../src/game/state/game';
import { makeUnit } from '../src/game/core/battle';
import { createRng } from '../src/game/rng';
import { getMonster } from '../src/game/data/monsters';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function state(type: string): GameState {
  const base = createInitialState();
  return { ...base, screen: 'event', currentNodeId: 'event', gold: 100,
    roster: [makeUnit('momo', true, 0, false), makeUnit('coal', true, 1, false)],
    map: { ...base.map, events: { event: buildEventByType(createRng(1), type, 2) } } };
}
function Harness({ initial }: { initial: GameState }) {
  const [current, dispatch] = useReducer(gameReducer, initial);
  return current.screen === 'event' ? createElement(EventScreen, { state: current, dispatch }) : createElement('p', null, current.toast?.msg);
}

it.each([false, true])('猜硬币先选正反（有图标），猜中再选伙伴；不提前泄露结果 mobile=%s', mobile => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const initial = state('gambler');
  initial.map.events.event.choices[0].coinResult = 'heads';
  render(createElement(Harness, { initial }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /猜硬币/ }));
  const coin = screen.getByRole('dialog', { name: '猜硬币' });
  expect(coin.querySelectorAll('svg')).toHaveLength(2);
  fireEvent.click(within(coin).getByRole('button', { name: '正面' }));
  const target = screen.getByRole('dialog', { name: '选择事件伙伴' });
  expect(screen.getByRole('button', { name: /离开/ }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(within(target).getByRole('button', { name: /煤煤/ }));
  expect(screen.getByText('煤煤 永久 +1 速度')).toBeTruthy();
});

it('仅有治疗圣水时禁用泉水入药，神秘行商无离开', () => {
  const initial = { ...state('spring'), inventory: { heal_potion: 2 } };
  const { rerender } = render(createElement(EventScreen, { state: initial, dispatch: vi.fn() }));
  expect(screen.getByRole('button', { name: /以泉水入药/ }).hasAttribute('disabled')).toBe(true);
  rerender(createElement(EventScreen, { state: state('行商'), dispatch: vi.fn() }));
  expect(screen.queryByRole('button', { name: /离开/ })).toBeNull();
  expect(screen.getByText('获得2个「侦察符」')).toBeTruthy();
});

it('流浪精灵喂食按食物总份数启用，挑战将同一物种与20金奖励传入战斗', () => {
  const initial = { ...state('精灵'), inventory: { berry: 1, heal_potion: 4 } };
  const dispatch = vi.fn();
  const { rerender } = render(createElement(EventScreen, { state: initial, dispatch }));
  const monsterName = getMonster(initial.map.events.event.choices[1].monsterId!).name;
  expect(screen.getByRole('button', { name: /^挑战/ }).textContent).not.toContain(monsterName);
  expect(screen.getByRole('button', { name: /喂食/ }).textContent).not.toContain(monsterName);
  expect(screen.getByText(/战斗（1只生物）；胜利获得该生物和20金币/)).toBeTruthy();
  expect(screen.getByText(/消耗2个随机持有的捕捉食物，获得该生物；60%概率/)).toBeTruthy();
  expect(screen.getByRole('button', { name: /喂食/ }).hasAttribute('disabled')).toBe(true);
  const ready = { ...initial, inventory: { ...initial.inventory, berry: 2 } };
  rerender(createElement(EventScreen, { state: ready, dispatch }));
  fireEvent.click(screen.getByRole('button', { name: /喂食/ }));
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'EVENT_CHOICE', choiceId: 'e2' });
  fireEvent.click(screen.getByRole('button', { name: /^挑战/ }));
  expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'EVENT_BATTLE_START',
    enemies: initial.map.events.event.choices[0].battleEnemies,
    reward: expect.objectContaining({ kind: 'recruit', amount: 20, monsterId: initial.map.events.event.choices[1].monsterId }),
    penalty: { percent: 20 },
  }));
});

it('随机蛋在背包物品栏合并数量，详情逐蛋显示进度，禁止手动使用且不泄露生物', () => {
  const initial: GameState = { ...state('egg'), screen: 'backpack', inventory: {}, carriedEggs: [
    { id: 'egg1', remaining: 3, special: true, monsterId: 'time_sand_beast', passedNodeIds: [] },
    { id: 'egg2', remaining: 1, special: false, monsterId: 'momo', passedNodeIds: [] },
  ] };
  const dispatch = vi.fn();
  const { container } = render(createElement(BackpackScreen, { state: initial, dispatch }));
  expect(screen.getByRole('button', { name: '查看随机蛋，持有2个' })).toBeTruthy();
  expect(container.querySelector('img[src="/backpack-item-icons/mystery_egg.png"]')).toBeTruthy();
  expect(screen.getByText('随机蛋 1：还需经过3次关卡')).toBeTruthy();
  expect(screen.getByText('随机蛋 2：还需经过1次关卡')).toBeTruthy();
  expect(screen.getByRole('button', { name: '使用随机蛋' }).hasAttribute('disabled')).toBe(true);
  expect(container.textContent).not.toContain('时砂兽');
  expect(dispatch).not.toHaveBeenCalled();
});
