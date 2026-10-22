// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { WatchtowerScreen } from '../src/ui/App';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { DIFFICULTY_CONFIG, type Difficulty, type GameState } from '../src/game/state/game';
import { FOODS } from '../src/game/data/foods';
import { ITEMS } from '../src/game/data/items';
import { getMonster } from '../src/game/data/monsters';
import { makeUnit } from '../src/game/core/battle';
import { BattleUnitInspectPanel } from '../src/ui/BattleScreen';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup(mobile = false, difficulty: Difficulty = 'normal') {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const base = createInitialState();
  const state: GameState = { ...base, difficulty, screen: 'watchtower', currentRow: 0, currentNodeId: 'tower', watchtowerPreviewNodeId: 'tower', map: {
    ...base.map,
    layers: [
      [{ id: 'tower', type: 'watchtower', label: '瞭望塔', col: 0 }],
      [{ id: 'battle', type: 'battle', label: '遭遇战', col: 0 }, { id: 'arena', type: 'arena', label: '斗兽场', col: 1 }, { id: 'gauntlet', type: 'gauntlet', label: '车轮战', col: 2, gauntletSize: 3 }],
      [{ id: 'shop', type: 'shop', label: '商店', col: 0 }],
      [{ id: 'boss', type: 'boss', label: '首领战', col: 0 }],
    ],
    encounter: { battle: [{ speciesId: 'momo' }, { speciesId: 'momo' }, { speciesId: 'lulu' }], arena: [{ speciesId: 'kiki' }], gauntlet: [{ speciesId: 'pipi' }] },
    boss: { boss: [{ speciesId: 'boss_vine' }] },
  } };
  const dispatch = vi.fn();
  const result = render(createElement(WatchtowerScreen, { state, dispatch }));
  return { ...result, state, dispatch };
}

describe('瞭望塔情报卡', () => {
  it.each(['normal', 'hard', 'nightmare'] as const)('商店只列名字和实付价格，库存与实际商店一致 difficulty=%s', difficulty => {
    const { state, container, dispatch } = setup(false, difficulty);
    fireEvent.click(screen.getByRole('button', { name: '第 3 层' }));
    const list = container.querySelector('.watchtower-shop-items')!;
    const entered = gameReducer({ ...state, roster: [makeUnit('momo', true, 0, false)], screen: 'map', currentRow: 1, currentNodeId: 'arena' }, { type: 'MOVE', nodeId: 'shop' });
    const goods = (entered.shopStock ?? []).map(id => FOODS[id] ?? ITEMS[id]);
    expect(goods).toHaveLength(4);
    expect([...list.querySelectorAll('dt')].map(item => item.textContent)).toEqual(goods.map(item => item.name));
    expect([...list.querySelectorAll('dd')].map(item => item.textContent)).toEqual(goods.map(item => `${Math.round(item.price * DIFFICULTY_CONFIG[difficulty].shopPriceMult)} 金`));
    expect(list.querySelector('img, canvas, button')).toBeNull();
    expect(list.textContent).not.toMatch(/本店出售|限购|每种|休整/);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('共享详情面板只在预览中隐藏护盾及药水提示，战斗默认仍显示', () => {
    const unit = { ...makeUnit('momo', false, 0, false), shield: 4, battleBuffs: { skillSpd: 2 } };
    const { container, rerender } = render(createElement(BattleUnitInspectPanel, { unit, side: 'enemy' }));
    expect(container.textContent).toContain('护盾 4');
    expect(container.querySelector('.enemy-inspect-permanent-buff')).not.toBeNull();
    rerender(createElement(BattleUnitInspectPanel, { unit, side: 'enemy', showBuffs: false }));
    expect(container.textContent).not.toContain('护盾 4');
    expect(container.querySelector('.enemy-inspect-permanent-buff, .enemy-inspect-no-status')).toBeNull();
    expect(container.querySelector('.enemy-inspect-skills')).not.toBeNull();
  });

  it('敌人只显示可点击名字，保留重复敌人并删除高风险文案', () => {
    const { container } = setup();
    const names = container.querySelector('.watchtower-enemy-names')!;
    expect(within(names as HTMLElement).getAllByRole('button').map(button => button.textContent)).toEqual(['迅迅', '迅迅', '泡泡']);
    expect(container.querySelector('.watchtower-enemy-names img, .watchtower-enemy-names canvas')).toBeNull();
    expect(container.textContent).not.toMatch(/1v1|高风险|失败将承受惩罚/);
    expect(screen.getByText('共 3 轮')).toBeTruthy();
  });

  it.each([false, true])('点击名字打开详情，关闭后保留瞭望层且不派发动作 mobile=%s', mobile => {
    const { container, dispatch, state } = setup(mobile);
    const original = JSON.stringify(state);
    const trigger = within(container.querySelector('.watchtower-enemy-names') as HTMLElement).getAllByRole('button')[0];
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: '迅迅 · 生物详情' });
    expect(within(dialog).getByText('图鉴基础属性')).toBeTruthy();
    expect(dialog.classList.contains('enemy-inspect-modal')).toBe(true);
    expect(dialog.querySelector('.enemy-inspect-portrait')).not.toBeNull();
    expect(dialog.querySelector('.enemy-inspect-stats')).not.toBeNull();
    expect(within(dialog).getByText('迅捷')).toBeTruthy();
    expect(dialog.querySelector('.enemy-inspect-no-status, .enemy-inspect-permanent-buff')).toBeNull();
    expect(dialog.textContent).not.toMatch(/当前无状态效果|药水增益|Buff/);
    expect(dialog.textContent).toContain('爪击');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭生物详情' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByRole('button', { name: '第 2 层' }).getAttribute('aria-pressed')).toBe('true');
    expect(dispatch).not.toHaveBeenCalled();
    expect(JSON.stringify(state)).toBe(original);
  });

  it('首领使用首领遭遇名单，非战斗情报仍显示，关闭瞭望动作不变', () => {
    const { dispatch, container } = setup();
    fireEvent.click(screen.getByRole('button', { name: '第 3 层' }));
    expect(container.querySelectorAll('.watchtower-shop-items > div')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: '第 4 层（首领层）' }));
    fireEvent.click(screen.getByRole('button', { name: getMonster('boss_vine').name }));
    fireEvent.click(screen.getByRole('button', { name: '关闭生物详情' }));
    expect(screen.getByRole('button', { name: '第 4 层（首领层）' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '关闭瞭望' }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'CLOSE_WATCHTOWER' });
  });
});
