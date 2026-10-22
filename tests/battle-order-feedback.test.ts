// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, useReducer } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { BattleScreen } from '../src/ui/BattleScreen';
import { getSkill } from '../src/game/data/skills';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function setup(mobile = false, skillIds = ['punch', 'heal_light']) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const battle = createBattle([makeUnit('momo', true, 0, false), makeUnit('pipi', true, 1, false)], [{ speciesId: 'kiki' }, { speciesId: 'momo' }], 42);
  battle.playerUnits[0].skills = skillIds;
  battle.playerUnits[1].hp -= 3;
  battle.enemyUnits.forEach((u, index) => { u.row = 'front'; u.column = index as 0 | 1; });
  function Harness() {
    const [state, dispatch] = useReducer(gameReducer, { ...createInitialState(), screen: 'battle' as const, battle });
    return createElement(BattleScreen, { state, dispatch });
  }
  render(createElement(Harness));
  expect(screen.queryByText(/给每只宠物下达技能指令/)).toBeNull();
  expect(document.querySelector('.hint-text')).toBeNull();
  const actor = screen.getByRole('button', { name: /迅迅，右键或按菜单键查看我方生物 Buff/ });
  const ally = screen.getByRole('button', { name: new RegExp(`^${battle.playerUnits[1].name}，右键或按菜单键查看我方生物 Buff`) });
  const enemies = battle.enemyUnits.map(u => screen.getByRole('button', { name: new RegExp(`^${u.name}，右键或按菜单键查看敌人信息`) }));
  fireEvent.click(actor);
  return { actor, ally, enemies };
}

describe('技能指令确认反馈', () => {
  it.each([false, true])('目标确认后显示光圈、已安排和当前目标，电脑/手机=%s', mobile => {
    vi.useFakeTimers();
    const { actor, ally, enemies } = setup(mobile);
    fireEvent.click(screen.getByRole('button', { name: /^爪击/ }));
    expect(document.querySelector('.battle-order-ready')).toBeNull();
    expect(document.querySelector('.hint-text')).toBeNull();
    fireEvent.click(enemies[0]);
    expect(document.querySelector('.hint-text')).toBeNull();
    expect(document.querySelector('.battle-order-summary')?.textContent).toBe('✓ 爪击 → 铁墩');
    expect(document.querySelector('.battle-order-target-enemy')?.textContent).toBe('铁墩');
    expect(document.querySelector('.battle-order-target-ally')).toBeNull();
    expect(actor.querySelector('.battle-order-ready')?.textContent).toBe('✓ 已安排');
    expect(enemies[0].querySelector('.order-confirm-ring.order-feedback-attack')).not.toBeNull();
    expect(enemies[0].querySelector('.order-target-mark')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(350); });
    expect(document.querySelector('.order-confirm-ring')).toBeNull();
    expect(enemies[0].querySelector('.order-target-mark')).not.toBeNull();
    fireEvent.click(ally);
    expect(document.querySelector('.order-target-mark')).toBeNull();
    expect(document.querySelector('.battle-order-summary')).toBeNull();
    expect(actor.querySelector('.battle-order-ready')).not.toBeNull();
    fireEvent.click(actor);
    expect(enemies[0].querySelector('.order-target-mark')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^爪击/ }));
    expect(document.querySelector('.battle-order-ready, .order-target-mark, .order-confirm-ring')).toBeNull();
    expect(document.querySelector('.battle-order-summary')).toBeNull();
  });

  it('改用友方技能后反馈为青绿，结算时清除标记', () => {
    const { actor, ally, enemies } = setup();
    fireEvent.click(screen.getByRole('button', { name: /^爪击/ }));
    fireEvent.click(enemies[0]);
    fireEvent.click(screen.getByRole('button', { name: /^愈光/ }));
    expect(document.querySelector('.hint-text')).toBeNull();
    expect(document.querySelector('.order-target-mark')).toBeNull();
    fireEvent.click(ally);
    expect(document.querySelector('.hint-text')).toBeNull();
    expect(document.querySelector('.battle-order-summary')?.textContent).toBe('✓ 愈光 → 刺刺');
    expect(document.querySelector('.battle-order-target-ally')?.textContent).toBe('刺刺');
    expect(document.querySelector('.battle-order-target-enemy')).toBeNull();
    expect(enemies[0].querySelector('.order-target-mark, .order-confirm-ring')).toBeNull();
    expect(ally.querySelector('.order-confirm-ring.order-feedback-support')).not.toBeNull();
    expect(ally.querySelector('.order-target-mark.order-feedback-support')).not.toBeNull();
    expect(actor.querySelector('.battle-order-ready')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /结束回合/ }));
    expect(document.querySelector('.battle-order-ready, .order-target-mark, .order-confirm-ring')).toBeNull();
  });

  it.each([false, true])('范围摘要在电脑/手机均不提前揭示随机目标 mobile=%s', mobile => {
    setup(mobile, ['tail', 'seal_furnace', 'roar', 'leaf_needle', 'water_wave']);
    for (const [id, range] of [['tail', '敌方全体'], ['seal_furnace', '我方全体'], ['roar', '自身'], ['leaf_needle', '随机敌方'], ['water_wave', '敌方前排优先']]) {
      const skill = getSkill(id);
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${skill.name}`) }));
      expect(document.querySelector('.battle-selected-unit .battle-order-summary')?.textContent).toBe(`✓ ${skill.name} → ${range}`);
      const friendly = skill.target === 'allyAll' || skill.target === 'self';
      expect(document.querySelector(`.battle-order-target-${friendly ? 'ally' : 'enemy'}`)?.textContent).toBe(range);
      expect(document.querySelector(`.battle-order-target-${friendly ? 'enemy' : 'ally'}`)).toBeNull();
      expect(document.querySelector('.order-target-mark')).toBeNull();
    }
    fireEvent.click(screen.getByRole('button', { name: /^水波冲击/ }));
    fireEvent.click(screen.getByRole('button', { name: /^休息/ }));
    expect(document.querySelector('.battle-order-summary')?.textContent).toBe('✓ 休息');
  });

  it('更换攻击目标时光圈重新播放且不改变血量', () => {
    vi.useFakeTimers();
    const { enemies } = setup();
    fireEvent.click(screen.getByRole('button', { name: /^爪击/ }));
    fireEvent.click(enemies[0]);
    const before = enemies.map(el => el.querySelector('.unit-card')?.textContent);
    act(() => { vi.advanceTimersByTime(350); });
    // 先取消已有技能，再次选择同一技能的新目标，沿用原交互。
    fireEvent.click(screen.getByRole('button', { name: /^爪击/ }));
    fireEvent.click(screen.getByRole('button', { name: /^爪击/ }));
    fireEvent.click(enemies[1]);
    expect(enemies[0].querySelector('.order-target-mark, .order-confirm-ring')).toBeNull();
    expect(enemies[1].querySelector('.order-confirm-ring')).not.toBeNull();
    expect(enemies.map(el => el.querySelector('.unit-card')?.textContent)).toEqual(before);
  });
});
