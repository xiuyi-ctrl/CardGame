// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { getSkill } from '../src/game/data/skills';
import { createInitialState } from '../src/game/state/reducer';
import { BattleScreen } from '../src/ui/BattleScreen';
import type { StatusEffect } from '../src/game/types';

afterEach(cleanup);

function setup(skillId = 'punch', options: { taunt?: boolean; bloodScent?: boolean } = {}) {
  const battle = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }, { speciesId: 'pipi' }], 42);
  const actor = battle.playerUnits[0];
  actor.skills = [skillId];
  const front = battle.enemyUnits[0];
  const back = battle.enemyUnits[1];
  front.row = 'front';
  back.row = 'back';
  front.column = back.column = 0;
  back.hp = 1;
  front.statuses = [{ kind: 'poison', value: 2, turns: 0 }];
  if (options.taunt) actor.statuses = [{ kind: 'taunt', value: 1, turns: 2, sourceUid: front.uid } satisfies StatusEffect];
  if (options.bloodScent) actor.passive = 'blood_scent';
  const dispatch = vi.fn();
  render(createElement(BattleScreen, { state: { ...createInitialState(), screen: 'battle', battle }, dispatch }));
  const actorSlot = screen.getByRole('button', { name: /迅迅，右键或按菜单键查看我方生物 Buff/ });
  fireEvent.click(actorSlot);
  const skillButton = screen.getByRole('button', { name: new RegExp(`^${getSkill(skillId).name}`) });
  const frontSlot = screen.getByRole('button', { name: `${front.name}，右键或按菜单键查看敌人信息` });
  const backSlot = screen.getByRole('button', { name: `${back.name}，右键或按菜单键查看敌人信息` });
  fireEvent.click(skillButton);
  return { actor, front, back, actorSlot, skillButton, frontSlot, backSlot, dispatch };
}

describe('战斗攻击目标准星', () => {
  it.each([
    ['punch', true, false],
    ['shockwave', true, false],
    ['snipe', false, true],
    ['pierce_strike', true, true],
  ])('%s 按现有攻击范围标记合法目标', (skillId, frontValid, backValid) => {
    const { frontSlot, backSlot, actorSlot, skillButton, dispatch } = setup(skillId);
    expect(frontSlot.classList.contains('attack-target')).toBe(frontValid);
    expect(frontSlot.classList.contains('attack-target-blocked')).toBe(!frontValid);
    expect(backSlot.classList.contains('attack-target')).toBe(backValid);
    expect(backSlot.classList.contains('attack-target-blocked')).toBe(!backValid);
    expect(actorSlot.classList.contains('selected')).toBe(true);
    expect(skillButton.getAttribute('aria-pressed')).toBe('true');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('嘲讽和嗜血限制沿用既有合法目标集合', () => {
    let view = setup('snipe', { taunt: true });
    expect(view.frontSlot.classList.contains('attack-target')).toBe(true);
    expect(view.backSlot.classList.contains('attack-target-blocked')).toBe(true);
    cleanup();
    view = setup('punch', { bloodScent: true });
    expect(view.frontSlot.classList.contains('attack-target-blocked')).toBe(true);
    expect(view.backSlot.classList.contains('attack-target')).toBe(true);
  });

  it('非法目标不能下令，合法目标可通过键盘确认并清除准星', () => {
    const { actor, front, frontSlot, backSlot, skillButton, dispatch } = setup();
    fireEvent.click(backSlot);
    expect(dispatch).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.attack-target')).toHaveLength(1);
    fireEvent.keyDown(frontSlot, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'PLAYER_SKILL', actorUid: actor.uid, skillId: 'punch', targetUid: front.uid });
    expect(document.querySelectorAll('.attack-target, .attack-target-blocked')).toHaveLength(0);
    expect(skillButton.getAttribute('aria-pressed')).toBe('false');
  });

  it('再次点击技能或按 Esc 取消，不派发行动，也不取消施法者选择', () => {
    const { skillButton, actorSlot, dispatch } = setup();
    fireEvent.click(skillButton);
    expect(document.querySelectorAll('.attack-target')).toHaveLength(0);
    fireEvent.click(skillButton);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelectorAll('.attack-target, .attack-target-blocked')).toHaveLength(0);
    expect(skillButton.getAttribute('aria-pressed')).toBe('false');
    expect(actorSlot.classList.contains('selected')).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('Esc 优先关闭敌人详情，再次按 Esc 才取消瞄准', () => {
    const { frontSlot, dispatch } = setup();
    fireEvent.contextMenu(frontSlot);
    expect(screen.getByRole('dialog', { name: '敌人信息' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(frontSlot.classList.contains('attack-target')).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(frontSlot.classList.contains('attack-target')).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(['tail', 'leaf_needle', 'heal_light'])('%s 不进入敌方单体瞄准模式', (skillId) => {
    setup(skillId);
    expect(document.querySelectorAll('.attack-target, .attack-target-blocked')).toHaveLength(0);
  });
});
