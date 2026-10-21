// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { createInitialState } from '../src/game/state/reducer';
import { BattleStatusIcons, BATTLE_BUFF_ICON_IMAGES } from '../src/ui/BattleStatusIcons';
import { BattleScreen } from '../src/ui/BattleScreen';
import { BuffDetailPanel } from '../src/ui/components';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('战场右侧状态图标', () => {
  it('狐火独立显示层数和上限，不与灼烧状态混淆', () => {
    const unit = makeUnit('phantom_tail_fox', true, 0, false);
    unit.statuses = [{ kind: 'foxFire', value: 3, turns: 0 }, { kind: 'burn', value: 2, turns: 2 }];
    const { unmount } = render(createElement(BattleStatusIcons, { unit }));
    expect(screen.getByAltText('狐火').title).toContain('3');
    expect(screen.getByAltText('灼烧').title).toContain('2');
    unmount();
    render(createElement(BuffDetailPanel, { unit }));
    expect(screen.getByText('狐火 3/5')).toBeTruthy();
  });

  it('日华显示当前层数并在Buff详情中说明上限与衰减', () => {
    const unit = makeUnit('solar_spirit', true, 0, false);
    unit.statuses = [{ kind: 'sunRadiance', value: 2, turns: 0 }];
    const { unmount } = render(createElement(BattleStatusIcons, { unit }));
    expect(screen.getByAltText('日华').title).toContain('2');
    unmount();
    render(createElement(BuffDetailPanel, { unit }));
    expect(screen.getByText('日华 2/3')).toBeTruthy();
    expect(screen.getByText(/日华 2\/3；增强日华灼击/)).toBeTruthy();
  });

  it('按状态顺序最多显示三个，所有素材路径有效', () => {
    const unit = makeUnit('momo', true, 0, false);
    unit.statuses = [
      { kind: 'burn', value: 3, turns: 0 },
      { kind: 'poison', value: 2, turns: 0 },
      { kind: 'skillSeal', value: 1, turns: 2 },
      { kind: 'atkUp', value: 2, turns: 2 },
    ];
    render(createElement(BattleStatusIcons, { unit }));
    expect(screen.getAllByRole('img').map((image) => image.getAttribute('alt'))).toEqual(['灼烧', '中毒', '技能封印']);
    expect(screen.getByAltText('灼烧').title).toContain('3');
    expect(BATTLE_BUFF_ICON_IMAGES).toHaveLength(36);
    for (const src of BATTLE_BUFF_ICON_IMAGES) expect(existsSync(resolve('public', src.slice(1)))).toBe(true);
  });

  it('护盾不重复，药水和诅咒可显示，状态清除后移除图标', () => {
    const unit = makeUnit('momo', true, 0, false);
    unit.shield = 4;
    unit.statuses = [{ kind: 'shield', value: 4, turns: 0 }];
    unit.battleBuffs = { spdUp: 2 };
    unit.curse = 'hpDown';
    const { rerender } = render(createElement(BattleStatusIcons, { unit }));
    expect(screen.getAllByRole('img').map((image) => image.getAttribute('alt'))).toEqual(['护盾', '药水·速度提升', '血脆诅咒']);
    rerender(createElement(BattleStatusIcons, { unit: { ...unit, shield: 0, statuses: [], battleBuffs: undefined, curse: undefined } }));
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('敌我双方均显示图标，选中我方后右侧技能栏不显示状态列表', () => {
    const battle = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 42);
    battle.playerUnits[0].statuses = [{ kind: 'atkUp', value: 2, turns: 2 }];
    battle.enemyUnits[0].statuses = [{ kind: 'poison', value: 2, turns: 0 }];
    render(createElement(BattleScreen, { state: { ...createInitialState(), screen: 'battle', battle }, dispatch: vi.fn() }));
    expect(document.querySelector('.player-area .battle-status-icons img')?.getAttribute('alt')).toBe('攻击提升');
    expect(document.querySelector('.enemy-area .battle-status-icons img')?.getAttribute('alt')).toBe('中毒');
    fireEvent.click(screen.getByRole('button', { name: /迅迅，右键或按菜单键查看我方生物 Buff/ }));
    expect(document.querySelector('.battle-sidebar .buff-detail-panel')).toBeNull();
    expect(document.querySelector('.battle-skill-grid .buff-art-icon')).toBeNull();
  });

  it('新增灼烧在对应攻击动画开始时才显示', () => {
    vi.useFakeTimers();
    const battle = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 42);
    const player = battle.playerUnits[0];
    const enemy = battle.enemyUnits[0];
    const state = { ...createInitialState(), screen: 'battle' as const, battle };
    const { rerender } = render(createElement(BattleScreen, { state, dispatch: vi.fn() }));
    const nextBattle = {
      ...battle,
      enemyUnits: [{ ...enemy, statuses: [{ kind: 'burn' as const, value: 2, turns: 0 }] }],
      log: [{ text: `${player.name} 使用「烈焰」攻击 ${enemy.name}，造成 1 伤害`, side: 'player' as const, hp: { [player.uid]: player.hp, [enemy.uid]: enemy.hp }, actorUid: player.uid, targetUid: enemy.uid, addsStatus: ['burn'] }],
    };
    rerender(createElement(BattleScreen, { state: { ...state, battle: nextBattle }, dispatch: vi.fn() }));
    expect(document.querySelector('.enemy-area .battle-status-icons')).toBeNull();
    act(() => vi.advanceTimersByTime(0));
    expect(document.querySelector('.enemy-area .battle-status-icons img')?.getAttribute('alt')).toBe('灼烧');
  });
});
