import { expect, it } from 'vitest';
import { SPECIAL_REWARDS, buildSpecial, generateMap, finalEvolutionPaths, type GameState } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { makeUnit } from '../src/game/core/battle';
import { SPECIAL_EGG_POOL, getMonster } from '../src/game/data/monsters';
import { createRng } from '../src/game/rng';
import { parseDualSave } from '../src/ui/persistence';

function special(id: string): GameState {
  const run = gameReducer(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'kiki', seed: 1 });
  return { ...run, act: 2, screen: 'special', currentNodeId: 'special', map: { ...run.map,
    specials: { special: { title: '奇遇', desc: '', rewards: [SPECIAL_REWARDS.find(reward => reward.id === id)!] } } } };
}
const choose = (state: GameState, rewardId: string) => gameReducer(state, { type: 'SPECIAL_CHOICE', rewardId });
function pass(state: GameState): GameState {
  const current: GameState = { ...state, screen: 'event', currentNodeId: 'same', map: { ...state.map,
    events: { same: { title: '过关', desc: '', choices: [{ id: 'done', kind: 'none', label: '离开', desc: '' }] } } } };
  return gameReducer(current, { type: 'EVENT_CHOICE', choiceId: 'done' });
}

it('主模式七项新奖励，三选一；无超进化和跳关，保留造物', () => {
  expect(SPECIAL_REWARDS.map(reward => reward.label)).toEqual(['完美进化', '龙之宝藏', '圣果宝藏', '属性重塑', '造物·自创生物', '神秘蛋', '净化药水']);
  for (let seed = 0; seed < 50; seed++) {
    const result = buildSpecial(createRng(seed));
    expect(result.rewards).toHaveLength(3);
    expect(new Set(result.rewards.map(reward => reward.id)).size).toBe(3);
    expect(result).toEqual(buildSpecial(createRng(seed)));
    expect(result.rewards.some(reward => reward.kind === 'superevolve' || reward.itemId === 'skip')).toBe(false);
  }
});

it.each(['mixed', 'emerald_forest'] as const)('第一幕无奇遇，第二三幕保留奇遇 region=%s', region => {
  for (const difficulty of ['normal', 'hard', 'nightmare'] as const) {
    for (let seed = 1; seed <= 100; seed++) {
      const map = generateMap(seed, 1, difficulty, region);
      expect(map.layers.flat().some(node => node.type === 'special')).toBe(false);
      expect(Object.keys(map.specials)).toHaveLength(0);
    }
    for (const act of [2, 3]) expect(Array.from({ length: 20 }, (_, i) => generateMap(i + 1, act, difficulty, region))
      .some(map => map.layers.flat().some(node => node.type === 'special'))).toBe(true);
  }
});

it('龙之宝藏120金币，圣果与净化药水各2个，提示与库存一致', () => {
  const state = special('sr-gold');
  const gold = choose(state, 'sr-gold');
  expect(gold.gold - state.gold).toBe(120);
  expect(gold.runStats!.goldEarned - state.runStats!.goldEarned).toBe(120);
  expect(gold.toast?.msg).toContain('120');
  for (const [id, itemId] of [['sr-golden-fruit', 'golden_fruit'], ['sr-purify', 'purify']]) {
    const state = special(id), after = choose(state, id);
    expect(after.inventory[itemId] - (state.inventory[itemId] ?? 0)).toBe(2);
    expect(after.toast?.msg).toContain('×2');
  }
});

it.each(['hp', 'spd'] as const)('属性重塑%s实际加6/3，读档及选择过程中不丢参数', stat => {
  const state = special('sr-boost');
  const target = state.roster[0];
  const pending = choose(state, 'sr-boost');
  const picked = gameReducer(pending, { type: 'SPECIAL_TARGET', uid: target.uid });
  const loaded = parseDualSave(JSON.stringify(picked))!.main!;
  const after = gameReducer(loaded, { type: 'BOOST_STAT', stat });
  expect(after.roster[0].maxHp).toBe(target.maxHp + (stat === 'hp' ? 6 : 0));
  expect(after.roster[0].spd).toBe(target.spd + (stat === 'spd' ? 3 : 0));
  expect(after.roster[0].bonusStats?.[stat]).toBe((target.bonusStats?.[stat] ?? 0) + (stat === 'hp' ? 6 : 3));
  expect(after.screen).toBe('map');
});

it('完美进化基础形态直达最终，保留主宠身份、强化和原诅咒，不消耗材料，采用固定技能', () => {
  const state = special('sr-evolve');
  state.roster[0] = { ...state.roster[0], bonusStats: { hp: 4, spd: 1 }, curse: 'atkDown' };
  const target = state.roster[0];
  const after = gameReducer(choose(state, 'sr-evolve'), { type: 'EVOLVE_ONE', uid: target.uid });
  const evolved = after.roster[0];
  expect(evolved.speciesId).toBe('momo_god'); expect(evolved.uid).toBe(target.uid);
  expect(evolved.bonusStats).toEqual(target.bonusStats); expect(evolved.curse).toBe('atkDown');
  expect(evolved.skills).toEqual(getMonster('momo_god').skills);
  expect(evolved.hp).toBe(evolved.maxHp); expect(after.roster).toHaveLength(state.roster.length);
});

it.each(['nine_tail_sovereign', 'torch_fox_lord'])('完美进化火狐可自由选择最终分支 %s，拒绝非法物种', targetSpeciesId => {
  const state = special('sr-evolve');
  state.roster = [makeUnit('fire_fox', true, 0, false)];
  const target = state.roster[0];
  const pending = choose(state, 'sr-evolve');
  expect(gameReducer(pending, { type: 'EVOLVE_ONE', uid: target.uid, targetSpeciesId: 'momo_god' })).toBe(pending);
  const after = gameReducer(pending, { type: 'EVOLVE_ONE', uid: target.uid, targetSpeciesId });
  expect(after.roster[0].speciesId).toBe(targetSpeciesId);
  expect(after.roster[0].skills).toEqual(getMonster(targetSpeciesId).skills);
  expect(after.roster[0].curse).toBeUndefined();
});

it('最终形态、蛋生和造物不可选择；第一幕不能借完美进化越过传奇限制', () => {
  const state = special('sr-evolve');
  for (const id of ['momo_god', 'time_sand_beast', 'custom_fury']) {
    expect(finalEvolutionPaths(id)).toEqual([]);
    const unavailable = { ...state, roster: [makeUnit(id, true, 0, false)] };
    expect(choose(unavailable, 'sr-evolve')).toBe(unavailable);
  }
  const act1 = { ...state, act: 1, legendEvolutionUnlocked: false };
  expect(choose(act1, 'sr-evolve')).toBe(act1);
});

it.each([false, true])('奇遇神秘蛋3次过关必得特殊，允许重复关卡，存读档固定，满员=%s', full => {
  let state = special('sr-egg');
  if (full) state.roster = Array.from({ length: 10 }, (_, i) => makeUnit('momo', true, (i % 3) as 0 | 1 | 2, false));
  state = choose(state, 'sr-egg');
  expect(state.carriedEggs?.[0].remaining).toBe(3); expect(state.carriedEggs?.[0].special).toBe(true);
  const species = state.carriedEggs![0].monsterId;
  expect(SPECIAL_EGG_POOL).toContain(species);
  state = pass(state);
  expect(state.carriedEggs![0].remaining).toBe(2);
  state = parseDualSave(JSON.stringify(state))!.main!;
  state = pass(state); state = pass(state);
  expect(state.carriedEggs).toHaveLength(0);
  expect(full ? state.tameOverflow![0].speciesId : state.roster.at(-1)!.speciesId).toBe(species);
  expect(state.screen).toBe(full ? 'tame-overflow' : 'map');
});
