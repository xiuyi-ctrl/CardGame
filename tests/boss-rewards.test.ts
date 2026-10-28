import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { createInitialState, gameReducer, resolveBattle } from '../src/game/state/reducer';
import { generateMap, generateRewards, type GameState } from '../src/game/state/game';
import { MAIN_REGIONS } from '../src/game/data/regions';
function fixture(act = 1, region: 'mixed' | 'emerald_forest' = 'emerald_forest') {
 const base = createInitialState(); const map = generateMap(42, act, 'normal', region);
 const currentRow = map.layers.length - 1, node = map.layers[currentRow][0];
 const roster = [makeUnit('momo', true, 0, false)]; roster[0].hp = 1;
 const state: GameState = { ...base, act, region, map, currentRow, currentNodeId: node.id, roster, gold: 10, inventory: {}, screen: 'battle' };
 const battle = createBattle(roster, map.boss[node.id], 42);
 battle.phase = 'won'; battle.enemyUnits.forEach(u => { u.hp = 0; });
 return { state, settled: resolveBattle(state, battle) };
}
describe('主模式首领战利品', () => {
 it.each([1, 2])('第%s幕必得金币秘晶，三选一，招募仅用当前地区对应阶级', act => {
  for (const region of ['mixed', 'emerald_forest'] as const) {
   const { state, settled } = fixture(act, region);
   expect(settled.gold).toBe(10 + (act === 1 ? 40 : 60));
   expect(settled.inventory.gem).toBe(1);
   expect(settled.rewards.map(r => r.kind)).toEqual(['recruit', 'boss_boost', 'boss_supply']);
   const candidates = settled.rewards[0].recruitCandidates!;
   expect(new Set(candidates).size).toBe(2);
   const pool = act === 1 ? MAIN_REGIONS[region].evo1Pool : MAIN_REGIONS[region].evo2Pool;
   expect(candidates.every(id => pool.includes(id))).toBe(true);
   expect(generateRewards(state)).toEqual(settled.rewards);
   if (act === 1) expect(settled.legendEvolutionUnlocked).toBe(true);
  }
 });
 it('第三幕直接通关，无金币、秘晶和特殊奖励', () => {
  const { settled } = fixture(3);
  expect(settled.screen).toBe('victory'); expect(settled.gold).toBe(10);
  expect(settled.inventory.gem).toBeUndefined(); expect(settled.rewards).toEqual([]);
 });
 it.each([1, 2])('第%s幕强化先锁定再确认，不能回选或重复领', act => {
  const { settled } = fixture(act);
  const locked = gameReducer(settled, { type: 'PICK_REWARD', rewardId: 'boss-boost' });
  expect(gameReducer(locked, { type: 'PICK_REWARD', rewardId: 'boss-recruit' })).toBe(locked);
  const loaded = gameReducer(createInitialState(), { type: 'LOAD_GAME', state: JSON.parse(JSON.stringify(locked)) });
  const next = gameReducer(loaded, { type: 'PICK_REWARD', rewardId: 'boss-boost', targetUid: loaded.roster[0].uid, stat: 'spd' });
  expect(next.roster[0].bonusStats?.spd).toBe(act === 1 ? 1 : 2);
  expect(next.screen).toBe('roster'); expect(next.postBattle).toBe(true);
  expect(gameReducer(next, { type: 'PICK_REWARD', rewardId: 'boss-boost' })).toBe(next);
  expect(gameReducer(next, { type: 'NEXT_NODE' }).screen).toBe('inter_act');
 });
 it.each([1, 2])('第%s幕补给发放固定食物和指定药水', act => {
  const { settled } = fixture(act);
  const bundle = settled.rewards.find(r => r.kind === 'boss_supply')!.foodBundle!;
  expect(bundle).toHaveLength(act === 1 ? 2 : 1);
  if (act === 1) expect(bundle.every(id => ['berry', 'meat', 'gem'].includes(id))).toBe(true);
  else expect(bundle).toEqual(['golden_fruit']);
  const locked = gameReducer(settled, { type: 'PICK_REWARD', rewardId: 'boss-supply' });
  expect(gameReducer(locked, { type: 'PICK_REWARD', rewardId: 'boss-supply', potionId: 'bad' })).toBe(locked);
  const next = gameReducer(locked, { type: 'PICK_REWARD', rewardId: 'boss-supply', potionId: 'hp_up' });
  expect(next.inventory.hp_up).toBe(act === 1 ? 1 : 2);
  for (const id of new Set(bundle)) expect(next.inventory[id]).toBe((settled.inventory[id] ?? 0) + bundle.filter(x => x === id).length);
 });
 it('满员招募进入处理界面，候选固定且只能领一次', () => {
  const { settled } = fixture(); settled.roster = Array.from({length: 8}, () => makeUnit('momo', true, 0, false));
  const locked = gameReducer(settled, { type: 'PICK_REWARD', rewardId: 'boss-recruit' });
  const chosen = locked.rewards[0].recruitCandidates![0];
  const next = gameReducer(locked, { type: 'PICK_REWARD', rewardId: 'boss-recruit', monsterId: chosen });
  expect(next.screen).toBe('tame-overflow'); expect(next.tameOverflow![0].speciesId).toBe(chosen);
  expect(next.tameOverflowReturn).toBe('roster');
 });
});
