// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createBattle, makeUnit, playerEndTurn, playerSkill, skillUsesLeft, skillCooldownLeft, canUnitUseSkill } from '../src/game/core/battle';
import { getSkill, SKILLS } from '../src/game/data/skills';
import { getBattleSkill, validTestSkillOverride } from '../src/game/data/test-skill-overrides';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { TestBattleEditor } from '../src/ui/TestBattleEditor';
import { BattleUnitInspectPanel } from '../src/ui/BattleScreen';
import type { GameState } from '../src/game/state/game';
import type { TestSkillOverride } from '../src/game/types';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function setup(skillId = 'punch'): GameState {
  const battle = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'momo' }], 17);
  battle.playerUnits = battle.playerUnits.map(unit => ({ ...unit, passive: undefined, hp: 200, maxHp: 200, spd: 10, skills: [skillId], skillUses: {}, statuses: [] }));
  battle.enemyUnits = battle.enemyUnits.map(unit => ({ ...unit, passive: undefined, hp: 200, maxHp: 200, spd: 1, skills: [skillId], skillUses: {}, statuses: [] }));
  return { ...createInitialState(), screen: 'battle', testRun: true, battle };
}
const edit = (state: GameState, skillId: string, values: TestSkillOverride | null) => gameReducer(state, { type: 'TEST_BATTLE_EDIT_SKILL', skillId, values });

describe('测试战斗同名技能覆盖', () => {
  it('敌我同名攻击真实使用新伤害和段数，次数各自独立，编辑不消耗行动或随机数', () => {
    const state = setup(), original = JSON.stringify(SKILLS);
    const next = edit(state, 'punch', { damage: 7, hits: 2, uses: 2, cooldown: 1 });
    expect(next.battle!.round).toBe(state.battle!.round);
    expect(next.battle!.rngCount).toBe(state.battle!.rngCount);
    expect(next.battle!.orders).toEqual(state.battle!.orders);
    expect(next.roster).toBe(state.roster);
    expect(state.battle!.testSkillOverrides).toBeUndefined();
    const b = next.battle!, player = b.playerUnits[0], enemy = b.enemyUnits[0];
    const resolved = playerEndTurn(playerSkill(b, player.uid, 'punch', enemy.uid));
    expect(resolved.playerUnits[0].hp).toBe(186);
    expect(resolved.enemyUnits[0].hp).toBe(186);
    for (const unit of [...resolved.playerUnits, ...resolved.enemyUnits]) {
      expect(skillUsesLeft(unit, 'punch', resolved)).toBe(1);
      expect(skillCooldownLeft(unit, 'punch', resolved)).toBe(1);
      expect(canUnitUseSkill(unit, 'punch', resolved)).toBe(false);
    }
    expect(JSON.stringify(SKILLS)).toBe(original);
  });

  it('治疗覆盖同时作用于双方，无冷却技能可在测试中设置冷却', () => {
    const state = setup('heal_light');
    state.battle!.playerUnits[0].hp = state.battle!.enemyUnits[0].hp = 10;
    const b = edit(state, 'heal_light', { heal: 11, cooldown: 1 }).battle!;
    const resolved = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'heal_light', b.playerUnits[0].uid));
    expect(resolved.playerUnits[0].hp).toBe(21);
    expect(resolved.enemyUnits[0].hp).toBe(21);
    expect(skillCooldownLeft(resolved.playerUnits[0], 'heal_light', resolved)).toBe(1);
  });

  it('覆盖基础值后仍叠加原强化，后加入本场的单位也使用相同定义', () => {
    const state = setup(); state.battle!.playerUnits[0].skillEnhancements = { 0: 1 };
    const b = edit(state, 'punch', { damage: 7 }).battle!;
    const added = { ...makeUnit('momo', false, 1, false), passive: undefined, hp: 200, maxHp: 200, spd: 1, skills: ['punch'] };
    b.enemyUnits.push(added);
    const result = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid));
    expect(result.enemyUnits[0].hp).toBe(191);
    expect(result.playerUnits[0].hp).toBe(186);
  });

  it('通用护盾与纯中毒的效果值真实生效，不修改已经施加的状态', () => {
    const state = setup('shield_skill'); state.battle!.enemyUnits[0].skills = [];
    const effects = getSkill('shield_skill').effects!.map(effect => ({ ...effect, value: 9 }));
    const b = edit(state, 'shield_skill', { effects }).battle!;
    const shielded = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'shield_skill', b.playerUnits[0].uid));
    expect(shielded.playerUnits[0].shield).toBe(9);
    const poison = setup('poison_mist'); poison.battle!.enemyUnits[0].skills = [];
    const poisoned = edit(poison, 'poison_mist', { effects: getSkill('poison_mist').effects!.map(effect => ({ ...effect, value: 7 })) }).battle!;
    const result = playerEndTurn(playerSkill(poisoned, poisoned.playerUnits[0].uid, 'poison_mist'));
    expect(result.enemyUnits[0].hp).toBe(196);
    expect(result.enemyUnits[0].statuses.find(status => status.kind === 'poison')?.value).toBe(3);
    const changed = edit({ ...poison, battle: result }, 'poison_mist', { effects: getSkill('poison_mist').effects!.map(effect => ({ ...effect, value: 9 })) });
    expect(changed.battle!.enemyUnits[0].statuses).toEqual(result.enemyUnits[0].statuses);
  });

  it('已排技能指令使用新值，恢复原值不污染其他技能或新战斗', () => {
    const state = setup(), b = state.battle!;
    const queued = playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid);
    const edited = edit({ ...state, battle: queued }, 'punch', { damage: 9 });
    expect(edited.battle!.orders).toEqual(queued.orders);
    expect(playerEndTurn(edited.battle!).enemyUnits[0].hp).toBe(191);
    const restored = edit(edited, 'punch', null);
    expect(restored.battle!.testSkillOverrides).toBeUndefined();
    expect(getBattleSkill(restored.battle!, 'punch')).toBe(getSkill('punch'));
    expect(getBattleSkill(createBattle(b.playerUnits, [{ speciesId: 'momo' }], 1), 'punch').damage).toBe(5);
  });

  it('次数0表示不限；修改次数重置所有同名技能的测试次数，其他字段不重置', () => {
    const state = edit(setup(), 'punch', { damage: 7, uses: 1 });
    const b = state.battle!, player = b.playerUnits[0];
    const resolved = playerEndTurn(playerSkill(b, player.uid, 'punch', b.enemyUnits[0].uid));
    expect(skillUsesLeft(resolved.playerUnits[0], 'punch', resolved)).toBe(0);
    const damageOnly = edit({ ...state, battle: resolved }, 'punch', { damage: 9, uses: 1 });
    expect(skillUsesLeft(damageOnly.battle!.playerUnits[0], 'punch', damageOnly.battle!)).toBe(0);
    const reset = edit(damageOnly, 'punch', { uses: 3 });
    expect(skillUsesLeft(reset.battle!.playerUnits[0], 'punch', reset.battle!)).toBe(3);
    const summoned = makeUnit('momo', false, 1, false);
    expect(skillUsesLeft(summoned, 'punch', reset.battle!)).toBe(3);
    const unlimited = edit(reset, 'punch', { uses: 0 });
    expect(skillUsesLeft(player, 'punch', unlimited.battle!)).toBe(Infinity);
  });

  it('镜像复制继承测试技能数值，但不消耗原施法者或复制者的额外技能次数', () => {
    const state = setup();
    const mirror = { ...makeUnit('mirror_beast', true, 1, false), spd: 5 };
    state.battle!.playerUnits.push(mirror); state.battle!.enemyUnits[0].skills = [];
    const b = edit(state, 'punch', { damage: 7, uses: 1 }).battle!;
    const result = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid));
    expect(result.enemyUnits[0].hp).toBe(186);
    expect(skillUsesLeft(result.playerUnits[0], 'punch', result)).toBe(0);
    expect(skillUsesLeft(result.playerUnits[1], 'punch', result)).toBe(1);
  });

  it('正式战斗、结束战斗、场外技能、无效值及未接入机制字段拒绝修改', () => {
    const state = setup();
    for (const blocked of [{ ...state, testRun: false }, { ...state, screen: 'map' as const }, { ...state, battle: { ...state.battle!, phase: 'won' as const } }]) expect(edit(blocked, 'punch', { damage: 9 })).toBe(blocked);
    expect(edit(state, 'heal_light', { heal: 10 })).toBe(state);
    for (const patch of [{}, { damage: 0 }, { damage: NaN }, { hits: 21 }, { cooldown: -1 }, { uses: 1.5 }, { heal: 10 }, { target: 'all' }, { toString: 1 }]) expect(edit(state, 'punch', patch as TestSkillOverride)).toBe(state);
    expect(validTestSkillOverride(getSkill('flame_tail_shield'), { effects: [{ kind: 'shield', value: 8, turns: 99 }] })).toBe(false);
    expect(validTestSkillOverride(getSkill('poison_mist'), { effects: [{ kind: 'poison', value: 8, turns: 9 }] })).toBe(false);
  });
});

it.each([false, true])('手机与桌面可选择去重技能、应用和恢复；详情使用覆盖后的数值 mobile=%s', mobile => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const state = setup(), dispatch = vi.fn(), onClose = vi.fn(), units = [...state.battle!.playerUnits, ...state.battle!.enemyUnits];
  const view = render(createElement(TestBattleEditor, { units, battle: state.battle!, dispatch, onClose }));
  fireEvent.click(screen.getByRole('button', { name: '技能数值' }));
  expect(within(screen.getByRole('group', { name: '选择调整技能' })).getAllByRole('button')).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('基础伤害'), { target: { value: '9' } });
  fireEvent.click(screen.getByRole('button', { name: '应用修改' }));
  expect(dispatch).toHaveBeenCalledWith({ type: 'TEST_BATTLE_EDIT_SKILL', skillId: 'punch', values: { damage: 9 } });
  const changed = edit(state, 'punch', { damage: 9 });
  view.unmount();
  const popup = render(createElement(TestBattleEditor, { units, battle: changed.battle!, dispatch, onClose }));
  fireEvent.click(screen.getByRole('button', { name: '技能数值' }));
  fireEvent.click(screen.getByRole('button', { name: '恢复原值' }));
  expect(dispatch).toHaveBeenCalledWith({ type: 'TEST_BATTLE_EDIT_SKILL', skillId: 'punch', values: null });
  popup.unmount();
  render(createElement(BattleUnitInspectPanel, { unit: changed.battle!.enemyUnits[0], side: 'enemy', battle: changed.battle! }));
  expect(screen.getByText(/每段基础伤害9/)).toBeTruthy();
});
