// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { getSkill } from '../src/game/data/skills';
import { createInitialState } from '../src/game/state/reducer';
import { BattleScreen } from '../src/ui/BattleScreen';
import type { StatusEffect } from '../src/game/types';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup(skillId = 'punch', options: { taunt?: boolean; bloodScent?: boolean; burnBack?: boolean } = {}) {
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
  if (options.burnBack) back.statuses = [{ kind: 'burn', value: 3, turns: 2 }];
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
  it('灼烧反转可以指定满血但灼烧的己方伙伴，不进入敌方瞄准', () => {
    const battle = createBattle([makeUnit('moss_beast', true, 0, false), makeUnit('momo', true, 1, false)], [{ speciesId: 'momo' }], 4);
    battle.playerUnits[1].statuses = [{ kind: 'burn', value: 4, turns: 2 }];
    const dispatch = vi.fn();
    render(createElement(BattleScreen, { state: { ...createInitialState(), screen: 'battle', battle }, dispatch }));
    fireEvent.click(screen.getByRole('button', { name: /光苔兽，右键或按菜单键查看我方生物 Buff/ }));
    const skill = screen.getByRole('button', { name: /^灼烧反转/ });
    expect(skill.hasAttribute('disabled')).toBe(false);
    fireEvent.click(skill);
    const ally = screen.getByRole('button', { name: /迅迅，右键或按菜单键查看我方生物 Buff/ });
    expect(ally.classList.contains('attack-target')).toBe(false);
    expect(ally.classList.contains('ally-target')).toBe(true);
    fireEvent.click(ally);
    expect(dispatch).toHaveBeenCalledWith({ type: 'PLAYER_SKILL', actorUid: battle.playerUnits[0].uid, skillId: 'burn_reversal', targetUid: battle.playerUnits[1].uid });
  });

  it('灼烧烙印可以直接指定未燃烧的后排', () => {
    const { actor, back, backSlot, dispatch } = setup('burn_brand');
    fireEvent.click(backSlot);
    expect(dispatch).toHaveBeenCalledWith({ type: 'PLAYER_SKILL', actorUid: actor.uid, skillId: 'burn_brand', targetUid: back.uid });
  });

  it('裂壳冲撞没有护盾时按钮禁用', () => {
    const battle = createBattle([makeUnit('molten_beetle', true, 0, false)], [{ speciesId: 'momo' }], 7);
    const dispatch = vi.fn();
    render(createElement(BattleScreen, { state: { ...createInitialState(), screen: 'battle', battle }, dispatch }));
    fireEvent.click(screen.getByRole('button', { name: /熔甲虫，右键或按菜单键查看我方生物 Buff/ }));
    const skill = screen.getByRole('button', { name: /^裂壳冲撞/ });
    expect(skill.hasAttribute('disabled')).toBe(true);
    fireEvent.click(skill);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each([false, true])('循焰飞羽只允许跨排选择真正燃烧的后排 burn=%s', (burnBack) => {
    const { actor, frontSlot, backSlot, back, dispatch } = setup('flame_tracing_feather', { burnBack });
    expect(frontSlot.classList.contains('attack-target')).toBe(true);
    expect(backSlot.classList.contains('attack-target')).toBe(burnBack);
    fireEvent.click(backSlot);
    if (burnBack) expect(dispatch).toHaveBeenCalledWith({ type: 'PLAYER_SKILL', actorUid: actor.uid, skillId: 'flame_tracing_feather', targetUid: back.uid });
    else expect(dispatch).not.toHaveBeenCalled();
  });

  it('熔火自焚生命仅1点时也可选择施放', () => {
    const battle = createBattle([makeUnit('molten_larva', true, 0, false)], [{ speciesId: 'momo' }], 7);
    battle.playerUnits[0].hp = 1;
    const dispatch = vi.fn();
    render(createElement(BattleScreen, { state: { ...createInitialState(), screen: 'battle', battle }, dispatch }));
    fireEvent.click(screen.getByRole('button', { name: /熔壳虫，右键或按菜单键查看我方生物 Buff/ }));
    const skill = screen.getByRole('button', { name: /^熔火自焚/ });
    expect(skill.hasAttribute('disabled')).toBe(false);
    fireEvent.click(skill);
    expect(dispatch).toHaveBeenCalledWith({ type: 'PLAYER_SKILL', actorUid: battle.playerUnits[0].uid, skillId: 'molten_self_burn' });
  });

  it('炉壳指定另一名伙伴，点击施法者本身不会下令', () => {
    const units = [makeUnit('coal', true, 0, false), makeUnit('momo', true, 1, false), makeUnit('kiki', true, 2, false)];
    const battle = createBattle(units, [{ speciesId: 'momo' }], 2);
    const dispatch = vi.fn();
    render(createElement(BattleScreen, { state: { ...createInitialState(), screen: 'battle', battle }, dispatch }));
    const actorSlot = screen.getByRole('button', { name: /煤煤，右键或按菜单键查看我方生物 Buff/ });
    fireEvent.click(actorSlot);
    fireEvent.click(screen.getByRole('button', { name: /^炉壳/ }));
    expect(actorSlot.classList.contains('ally-target-blocked')).toBe(true);
    expect(actorSlot.classList.contains('valid-target')).toBe(false);
    expect(actorSlot.querySelector('.unit-card')?.classList.contains('valid-target')).toBe(false);
    expect(actorSlot.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(actorSlot);
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /铁墩，右键或按菜单键查看我方生物 Buff/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'PLAYER_SKILL', actorUid: units[0].uid, skillId: 'furnace_shell', targetUid: units[2].uid });
  });

  it('添薪只能选择已灼烧目标，跨排选择；没有合法目标时禁用', () => {
    const view = setup('stoke_fire', { burnBack: true });
    expect(view.frontSlot.classList.contains('attack-target-blocked')).toBe(true);
    expect(view.backSlot.classList.contains('attack-target')).toBe(true);
    fireEvent.click(view.frontSlot);
    expect(view.dispatch).not.toHaveBeenCalled();
    fireEvent.click(view.backSlot);
    expect(view.dispatch).toHaveBeenCalledWith({ type: 'PLAYER_SKILL', actorUid: view.actor.uid, skillId: 'stoke_fire', targetUid: view.back.uid });
    cleanup();
    expect(setup('stoke_fire').skillButton.hasAttribute('disabled')).toBe(true);
    cleanup();
    expect(setup('stoke_fire', { burnBack: true, taunt: true }).skillButton.hasAttribute('disabled')).toBe(true);
  });

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

  it.each([false, true])('电脑与手机的友方技能区分存活和阵亡目标，并可取消 mobile=%s', (mobile) => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const units = [makeUnit('lulu', true, 0, false), makeUnit('momo', true, 1, false), makeUnit('kiki', true, 2, false)];
    const battle = createBattle(units, [{ speciesId: 'momo' }], 42);
    battle.playerUnits[0].skills = ['heal_light'];
    battle.playerUnits[0].hp -= 1;
    battle.playerUnits[2].hp = 0;
    const dispatch = vi.fn();
    render(createElement(BattleScreen, { state: { ...createInitialState(), screen: 'battle', battle }, dispatch }));
    const actor = screen.getByRole('button', { name: /泡泡，右键或按菜单键查看我方/ });
    const dead = screen.getByRole('button', { name: /铁墩，右键或按菜单键查看我方/ });
    fireEvent.click(actor);
    const skill = screen.getByRole('button', { name: /^愈光/ });
    fireEvent.click(skill);
    expect(document.querySelectorAll('.ally-target')).toHaveLength(2);
    expect(dead.classList.contains('ally-target-blocked')).toBe(true);
    expect(skill.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(dead);
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelectorAll('.ally-target, .ally-target-blocked')).toHaveLength(0);
    expect(actor.classList.contains('selected')).toBe(true);
    fireEvent.click(skill);
    fireEvent.click(skill);
    expect(document.querySelectorAll('.ally-target, .ally-target-blocked')).toHaveLength(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(['tail', 'leaf_needle', 'heal_light'])('%s 不进入敌方单体瞄准模式', (skillId) => {
    setup(skillId);
    expect(document.querySelectorAll('.attack-target, .attack-target-blocked')).toHaveLength(0);
  });
});
