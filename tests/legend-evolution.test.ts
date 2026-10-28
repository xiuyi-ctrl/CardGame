import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { BASE_POOL, EVO1_POOL } from '../src/game/data/monsters';
import { evolutionLockReason, type GameState } from '../src/game/state/game';
import { createInitialState, gameReducer, migrateGameState, resolveBattle } from '../src/game/state/reducer';

function pairState(id = 'momo_queen'): GameState {
  return { ...createInitialState(), act: 1, screen: 'roster', roster: [makeUnit(id, true, 0, false), makeUnit(id, true, 1, false)] };
}

describe('第一幕后开放传奇进化', () => {
  it.each(EVO1_POOL)('%s：首领前所有常规融合入口都不能升传奇，也不消耗材料', (id) => {
    const state = pairState(id);
    const [primary, material] = state.roster;
    expect(evolutionLockReason(state, id)).toBe('击败第一幕首领后解锁传奇进化');
    expect(gameReducer(state, { type: 'FUSE', primaryUid: primary.uid, materialUid: material.uid })).toBe(state);
    const backpack = { ...state, screen: 'backpack' as const };
    expect(gameReducer(backpack, { type: 'FUSE', primaryUid: primary.uid })).toBe(backpack);
    const overflow = { ...state, screen: 'tame-overflow' as const, roster: [primary], tameOverflow: [material] };
    expect(gameReducer(overflow, { type: 'TAME_OVERFLOW_FUSE', primaryUid: primary.uid, tameUid: material.uid })).toBe(overflow);
    const internal = { ...state, screen: 'tame-overflow' as const, tameOverflow: [makeUnit('fifi', false, 0, false)] };
    expect(gameReducer(internal, { type: 'FUSE_IN_OVERFLOW', uid: primary.uid, materialUid: material.uid })).toBe(internal);
    expect(state.roster).toHaveLength(2);
  });

  it.each(BASE_POOL)('%s：第一幕仍可三只一阶融合成二阶', (id) => {
    const pair = pairState(id);
    const state = { ...pair, roster: [...pair.roster, makeUnit(id, true, 2, false)] };
    expect(evolutionLockReason(state, id)).toBeUndefined();
    const after = gameReducer(state, { type: 'FUSE', primaryUid: state.roster[0].uid });
    expect(after.roster).toHaveLength(1);
    expect(after.roster[0].speciesId).not.toBe(id);
  });

  it.each([false, true])('免费进化（超进化=%s）也不能绕过限制', (superEvolution) => {
    const raw = pairState();
    const state: GameState = { ...raw, specialPending: { kind: 'evolve', super: superEvolution } };
    expect(gameReducer(state, { type: 'EVOLVE_ONE', uid: state.roster[0].uid })).toBe(state);
    const unlocked = gameReducer({ ...state, legendEvolutionUnlocked: true }, { type: 'EVOLVE_ONE', uid: state.roster[0].uid });
    expect(unlocked.roster[0].speciesId).toBe('momo_god');
    const special: GameState = {
      ...raw, screen: 'special', map: { ...raw.map, specials: { [raw.currentNodeId]: {
        title: '进化奇遇', desc: '', rewards: [{ id: 'evolve', label: '进化', desc: '', kind: superEvolution ? 'superevolve' : 'evolve' }],
      } } },
    };
    expect(gameReducer(special, { type: 'SPECIAL_CHOICE', rewardId: 'evolve' })).toBe(special);
    const loaded = migrateGameState(JSON.parse(JSON.stringify({ ...special, screen: 'roster', specialPending: state.specialPending })))!;
    expect(loaded.screen).toBe('special');
    expect(loaded.specialPending).toBeUndefined();
  });

  it('实际击败第一幕首领后立即解锁，战后阶段可融合，存档保留解锁', () => {
    const raw = pairState();
    const row = raw.map.layers.length - 1;
    const bossNode = raw.map.layers[row].find((node) => node.type === 'boss')!;
    const state: GameState = { ...raw, screen: 'battle', currentRow: row, currentNodeId: bossNode.id };
    expect(evolutionLockReason(state, raw.roster[0].speciesId)).toBeTruthy();
    const battle = createBattle(raw.roster, state.map.boss[bossNode.id], 4);
    const won = { ...battle, phase: 'won' as const, enemyUnits: battle.enemyUnits.map((u) => ({ ...u, hp: 0 })) };
    const settled = resolveBattle(state, won);
    expect(settled.act).toBe(1);
    expect(settled.legendEvolutionUnlocked).toBe(true);
    const loaded = migrateGameState(JSON.parse(JSON.stringify(settled)))!;
    const after = gameReducer({ ...loaded, screen: 'roster' }, { type: 'FUSE', primaryUid: loaded.roster[0].uid });
    expect(after.roster).toHaveLength(1);
    expect(after.roster[0].speciesId).toBe('momo_god');
    const lost = gameReducer({ ...state, battle: { ...battle, phase: 'lost' } }, { type: 'BATTLE_END_CONFIRM' });
    expect(lost.legendEvolutionUnlocked).not.toBe(true);
  });

  it.each([2, 3])('旧存档第 %s 幕无需新字段即可正常融合', (act) => {
    const state = { ...pairState(), act };
    expect(evolutionLockReason(state, 'momo_queen')).toBeUndefined();
    expect(gameReducer(state, { type: 'FUSE', primaryUid: state.roster[0].uid }).roster[0].speciesId).toBe('momo_god');
  });

  it('旧存档已有传奇不回退，新一局不继承上局解锁；熟练度不受该规则限制', () => {
    const unit = makeUnit('momo_god', true, 0, false);
    const state: GameState = { ...pairState(), roster: [unit], legendEvolutionUnlocked: true };
    const loaded = migrateGameState(JSON.parse(JSON.stringify(state)))!;
    expect(loaded.roster[0].speciesId).toBe('momo_god');
    const fresh = gameReducer(loaded, { type: 'START_RUN', starterId: 'momo', companionId: 'lulu', seed: 7 });
    expect(fresh.legendEvolutionUnlocked).not.toBe(true);
    expect(evolutionLockReason(fresh, 'momo_queen')).toBeTruthy();
    expect(evolutionLockReason({ ...fresh, runMode: 'proficiency' }, 'momo_queen')).toBeUndefined();
  });
});
