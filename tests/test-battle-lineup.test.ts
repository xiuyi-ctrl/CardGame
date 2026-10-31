// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createBattle, makeUnit, playerEndTurn, playerSkill, skillCooldownLeft } from '../src/game/core/battle';
import { createInitialState, gameReducer, type GameAction } from '../src/game/state/reducer';
import { configureTestGrowth } from '../src/game/state/test-scenarios';
import { getSkill } from '../src/game/data/skills';
import { TestBattleEditor } from '../src/ui/TestBattleEditor';
import type { GameState } from '../src/game/state/game';

afterEach(cleanup);
function setup(): GameState {
  const roster = [configureTestGrowth(makeUnit('coal', true, 0, false))];
  const battle = createBattle(roster, [{ speciesId: 'pipi' }], 17);
  return { ...createInitialState(), screen: 'battle', testRun: true, roster, field: roster.map(u => u.uid), battle };
}
const slot = (side: 'player' | 'enemy', row: 'front' | 'back', column: 0 | 1 | 2, speciesId: string | null): GameAction => ({ type: 'TEST_BATTLE_SET_SLOT', side, row, column, speciesId });

it('炉壳无冷却，可连续回合施放，旧冷却计数不再阻挡', () => {
  expect(getSkill('furnace_shell').cooldown).toBeUndefined();
  let b = setup().battle!;
  b.enemyUnits[0].skills = [];
  b.playerUnits[0].skillCooldowns = { furnace_shell: 9 };
  expect(skillCooldownLeft(b.playerUnits[0], 'furnace_shell')).toBe(0);
  for (let i = 0; i < 2; i++) b = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'furnace_shell', b.playerUnits[0].uid));
  expect(b.log.filter(e => e.text.includes('使用「炉壳」'))).toHaveLength(2);
  expect(makeUnit('mimi_king', false, 0, false).maxHp).toBe(14);
});

it('默认与自选测试伙伴当前生命100，生命比例配置保留，正常生物不变', () => {
  expect(configureTestGrowth(makeUnit('momo', true, 0, false))).toMatchObject({ hp: 100, maxHp: 100 });
  const s = gameReducer(createInitialState(), { type: 'TEST_TYPE_PICK', nodeType: 'shop' });
  expect(s.roster.every(u => u.hp === 100 && u.maxHp >= 100)).toBe(true);
  const pick = gameReducer(createInitialState(), { type: 'TEST_TYPE_PICK', nodeType: 'battle' });
  const chosen = gameReducer(pick, { type: 'TEST_PICK_PLAYER_CONFIRM', units: [makeUnit('pipi', true, 0, false)] });
  expect(chosen.roster[0]).toMatchObject({ hp: 100, maxHp: 100 });
  expect(makeUnit('pipi', true, 0, false).hp).toBe(11);
});

it('战斗中新增、替换双方生物，保留其他生物状态、回合、开关与技能覆盖', () => {
  const initial = setup();
  initial.battle!.testEnemyInactive = true;
  initial.battle!.testSkillOverrides = { punch: { damage: 9 } };
  const original = initial.battle!.playerUnits[0];
  let s = gameReducer(initial, slot('player', 'back', 2, 'mimi_king'));
  expect(s.battle!.playerUnits).toHaveLength(2);
  const added = s.battle!.playerUnits.find(u => u.row === 'back')!;
  expect(added).toMatchObject({ hp: 100, maxHp: 100, speciesId: 'mimi_king', row: 'back', column: 2 });
  expect(s.battle!.playerUnits.find(u => u.uid === original.uid)).toBe(original);
  expect(s.roster).toContain(added);
  s = gameReducer(s, slot('player', 'back', 2, 'light_moss'));
  expect(s.roster.some(u => u.uid === added.uid)).toBe(false);
  const enemy = s.battle!.enemyUnits[0];
  s.battle!.orders = { [original.uid]: { skillId: 'coal_claw', targetUid: enemy.uid }, [enemy.uid]: { skillId: 'weaken', targetUid: original.uid } };
  const round = s.battle!.round, rngCount = s.battle!.rngCount;
  s = gameReducer(s, slot('enemy', enemy.row, enemy.column, 'mimi_king'));
  expect(s.battle!.enemyUnits[0]).toMatchObject({ hp: 14, maxHp: 14, tameable: true, speciesId: 'mimi_king' });
  expect(s.battle!.orders).toEqual({});
  expect(s.battle!.testEnemyInactive).toBe(true);
  expect(s.battle!.testSkillOverrides).toEqual({ punch: { damage: 9 } });
  expect(s.battle!.round).toBe(round);
  expect(s.battle!.rngCount).toBe(rngCount);
  s = gameReducer(s, slot('player', 'back', 2, null));
  expect(s.battle!.playerUnits).toHaveLength(1);
  expect(s.roster).toHaveLength(2);
  expect(s.field).toEqual([original.uid]);
});

it('正式游戏、非法物种格位、清空一方及车轮战增加上场人数均被拒绝', () => {
  const s = setup(), enemy = s.battle!.enemyUnits[0];
  expect(gameReducer({ ...s, testRun: false }, slot('player', 'back', 0, 'pipi')).battle).toBe(s.battle);
  for (const action of [slot('player', 'front', 0, null), slot('enemy', enemy.row, enemy.column, null), slot('enemy', 'back', 0, 'invalid'), slot('enemy', 'back', 0, '__proto__')]) {
    expect(gameReducer(s, action)).toBe(s);
  }
  const gauntlet = { ...s, battle: { ...s.battle!, gauntlet: { total: 2, current: 1 } } };
  expect(gameReducer(gauntlet, slot('player', 'back', 1, 'pipi'))).toBe(gauntlet);
  const active = gauntlet.battle.playerUnits[0];
  expect(gameReducer(gauntlet, slot('player', active.row, active.column, 'pipi')).battle!.playerUnits[0].speciesId).toBe('pipi');
});

it('加入百变兽只为新单位抽技，已有百变兽和当前战斗不重置，免疫侵蚀继续生效', () => {
  let s = setup();
  s = gameReducer(s, slot('enemy', 'back', 0, 'mimic_beast'));
  const first = s.battle!.enemyUnits.find(u => u.speciesId === 'mimic_beast')!;
  expect(first.skills.length).toBeGreaterThan(0);
  s = { ...s, battle: { ...s.battle!, corruptDebuff: 'immune' } };
  s = gameReducer(s, slot('enemy', 'back', 1, 'mimic_beast'));
  expect(s.battle!.enemyUnits.find(u => u.uid === first.uid)?.skills).toEqual(first.skills);
  expect(s.battle!.enemyUnits.find(u => u.column === 1 && u.row === 'back')?.debuffImmune).toBe(true);
});

it('界面选择敌方格位和物种，派发替换操作', () => {
  const s = setup(), dispatch = vi.fn();
  render(createElement(TestBattleEditor, { units: [...s.battle!.playerUnits, ...s.battle!.enemyUnits], battle: s.battle, dispatch, onClose: vi.fn() }));
  fireEvent.click(screen.getByRole('button', { name: '上场生物' }));
  fireEvent.click(screen.getByRole('button', { name: '敌方' }));
  const enemy = s.battle!.enemyUnits[0];
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`${enemy.row === 'front' ? '前排' : '后排'}${enemy.column + 1}.*刺刺`) }));
  fireEvent.change(screen.getByLabelText('查找生物'), { target: { value: '蟒影' } });
  fireEvent.click(screen.getByRole('button', { name: '蟒影' }));
  fireEvent.click(screen.getByRole('button', { name: '替换生物' }));
  expect(dispatch).toHaveBeenCalledWith(slot('enemy', enemy.row, enemy.column, 'mimi_king'));
});
