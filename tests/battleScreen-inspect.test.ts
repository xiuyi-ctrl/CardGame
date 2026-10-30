// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { createInitialState } from '../src/game/state/reducer';
import { BattleScreen } from '../src/ui/BattleScreen';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('战斗生物右键详情', () => {
  it.each([false, true])('敌方详情显示实际强化等级及强化数值 mobile=%s', mobile => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const battle = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 42);
    battle.enemyUnits[0].skills = ['punch']; battle.enemyUnits[0].skillEnhancements = { 0: 2 };
    render(createElement(BattleScreen, { state: { ...createInitialState(), screen: 'battle', battle }, dispatch: vi.fn() }));
    fireEvent.contextMenu(screen.getByRole('button', { name: /右键或按菜单键查看敌人信息/ }));
    const dialog = screen.getByRole('dialog', { name: '敌人信息' });
    expect(dialog.querySelector('.skill-name')?.textContent).toBe('爪击++');
    expect(dialog.querySelector('.skill-num')?.textContent).toBe('9');
  });
  it('点击仍选中我方生物，键盘菜单键打开 Buff 不改变选中态', () => {
    const battle = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 42);
    const state = { ...createInitialState(), screen: 'battle' as const, battle };
    render(createElement(BattleScreen, { state, dispatch: vi.fn() }));

    const ally = screen.getByRole('button', { name: /迅迅，右键或按菜单键查看我方生物 Buff/ });
    fireEvent.click(ally);
    expect(ally.classList.contains('selected')).toBe(true);
    fireEvent.keyDown(ally, { key: 'F10', shiftKey: true });
    expect(screen.getByRole('dialog', { name: '我方生物 Buff' })).toBeTruthy();
    expect(ally.classList.contains('selected')).toBe(true);
  });

  it('右键我方生物显示当前 Buff，关闭后不改变选中角色', () => {
    const battle = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 42);
    battle.playerUnits[0].statuses = [{ kind: 'burn', value: 2, turns: 0 }];
    battle.playerUnits[0].battleBuffs = { spdUp: 2 };
    const state = { ...createInitialState(), screen: 'battle' as const, battle };
    const dispatch = vi.fn();
    render(createElement(BattleScreen, { state, dispatch }));

    fireEvent.contextMenu(screen.getByRole('button', { name: /迅迅，右键或按菜单键查看我方生物 Buff/ }));
    const dialog = screen.getByRole('dialog', { name: '我方生物 Buff' });
    expect(dialog.textContent).toContain('迅迅');
    expect(dialog.textContent).toContain('灼烧');
    expect(dialog.textContent).toContain('速度加成');
    expect(dialog.textContent).not.toContain('技能');
    expect(document.querySelector('.battle-selected-unit')).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '我方生物 Buff' })).toBeNull();
  });

  it('敌方右键详情仍显示技能', () => {
    const battle = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 42);
    const state = { ...createInitialState(), screen: 'battle' as const, battle };
    render(createElement(BattleScreen, { state, dispatch: vi.fn() }));

    fireEvent.contextMenu(screen.getByRole('button', { name: /右键或按菜单键查看敌人信息/ }));
    const dialog = screen.getByRole('dialog', { name: '敌人信息' });
    expect(dialog.textContent).toContain('技能');
  });
});
