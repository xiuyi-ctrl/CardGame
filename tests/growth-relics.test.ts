import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, performGauntletSwap, playerEndTurn, playerSkill, playerTame, tameChance } from '../src/game/core/battle';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { fuseUnit, type GameState } from '../src/game/state/game';
import { parseDualSave } from '../src/ui/persistence';

const horn = ['horn_of_plenty'];
const candle = ['spare_candle'];
const fresh = (): GameState => gameReducer(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'lulu', seed: 42 });
function fight(species = 'momo', allies = 1) {
  const b = createBattle(Array.from({ length: allies }, (_, col) => makeUnit(species, true, col as 0 | 1 | 2, false)), [{ speciesId: 'momo' }], 71, { relics: candle });
  b.playerUnits = b.playerUnits.map(unit => ({ ...unit, hp: 1, passive: undefined, skills: [], statuses: [], shield: 0 }));
  b.enemyUnits = b.enemyUnits.map(unit => ({ ...unit, passive: undefined, skills: ['shadow_claw'], hp: 100, maxHp: 100, spd: 20 }));
  return b;
}

describe('丰收之角', () => {
  it.each([['berry', .06], ['meat', .07], ['gem', .08]] as const)('%s只将基础食物参数乘1.1，不乘血量与失败补偿', (food, bonus) => {
    const unit = { ...makeUnit('momo_god', false, 0, true), hp: 20, maxHp: 100, tameFails: 1 };
    expect(tameChance(unit, food, horn)).toBeCloseTo(Math.min(.65, tameChance(unit, food) + bonus));
    expect(tameChance({ ...unit, hp: 40, tameFails: 0 }, food, horn)).toBeCloseTo(.3 + (food === 'berry' ? .06 : food === 'meat' ? .17 : .28));
  });
  it.each([['momo', .85], ['momo_queen', .75], ['momo_god', .65]] as const)('保留%s的概率上限与圣果规则', (species, cap) => {
    const unit = { ...makeUnit(species, false, 0, true), hp: 2, maxHp: 100, tameFails: 2 };
    expect(tameChance(unit, 'gem', horn)).toBe(cap);
    expect(tameChance(unit, 'golden_fruit', horn)).toBe(1);
    expect(tameChance(unit, 'heal_potion', horn)).toBe(0);
  });
  it('实际捕捉使用加成后的概率，捕获记录来源，1血必捕与合法性不变', () => {
    let improved = false;
    for (let seed = 1; seed <= 100; seed++) {
      const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'momo_god' }], seed, { relics: horn });
      b.enemyUnits[0] = { ...b.enemyUnits[0], hp: 40, maxHp: 100 };
      const uid = b.enemyUnits[0].uid;
      const boosted = playerTame(b, 'berry', uid), normal = playerTame({ ...b, relics: [] }, 'berry', uid);
      if (boosted.pendingTame.length) expect(boosted.pendingTame[0].tamedOrigin).toBe(true);
      if (boosted.pendingTame.length > normal.pendingTame.length) improved = true;
      expect(playerTame({ ...b, enemyUnits: [{ ...b.enemyUnits[0], hp: 1 }] }, 'berry', uid).pendingTame).toHaveLength(1);
      expect(playerTame({ ...b, enemyUnits: [{ ...b.enemyUnits[0], hp: 41 }] }, 'golden_fruit', uid).pendingTame).toHaveLength(0);
    }
    expect(improved).toBe(true);
  });
  it('累计5只独立驯服生物，融合保留主宠来源，材料与重复访问不多计', () => {
    const run = fresh();
    const main = { ...makeUnit('momo_queen', true, 0, false), tamedOrigin: true };
    const material = { ...makeUnit('momo_queen', true, 1, false), tamedOrigin: true };
    const oldFinals = ['old1', 'old2', 'old3', 'old4'];
    const state: GameState = { ...run, act: 2, screen: 'roster', roster: [main, material], runStats: { ...run.runStats!, finalTamedUids: oldFinals } };
    const fused = gameReducer(state, { type: 'FUSE', primaryUid: main.uid, materialUid: material.uid });
    expect(fused.roster[0].tamedOrigin).toBe(true);
    expect(fused.runStats!.finalTamedUids).toEqual([...oldFinals, main.uid]);
    expect(fused.unlocks!.relics).toContain('horn_of_plenty');
    const loaded = parseDualSave(JSON.stringify(fused))!.main!;
    const again = gameReducer(loaded, { type: 'OPEN_BACKPACK' });
    expect(again.runStats!.finalTamedUids).toEqual(fused.runStats!.finalTamedUids);
  });
  it('开局、招募、蛋生不冒充驯服；不继承材料的来源', () => {
    const run = fresh(), starter = makeUnit('momo_queen', true, 0, false);
    const material = { ...makeUnit('momo_queen', true, 1, false), tamedOrigin: true };
    const state: GameState = { ...run, act: 2, screen: 'roster', roster: [starter, material] };
    const fused = gameReducer(state, { type: 'FUSE', primaryUid: starter.uid, materialUid: material.uid });
    expect(fused.roster[0].tamedOrigin).toBeUndefined();
    expect(fused.runStats!.finalTamedUids ?? []).toEqual([]);
    expect(fuseUnit(material)!.tamedOrigin).toBe(true);
  });
  it('完美进化、直接捕获最终形态、满员预备役均计入且释放不减', () => {
    const run = fresh(), main = { ...makeUnit('fire_fox', true, 0, false), tamedOrigin: true };
    const evolved = gameReducer({ ...run, act: 2, roster: [main], specialPending: { kind: 'evolve', super: false, toFinal: true } }, { type: 'EVOLVE_ONE', uid: main.uid });
    expect(evolved.runStats!.finalTamedUids).toEqual([main.uid]);
    const b = createBattle(evolved.roster, [{ speciesId: 'sisi_god' }], 1);
    b.enemyUnits[0].hp = 1;
    const state = gameReducer({ ...evolved, screen: 'battle', battle: b }, { type: 'PLAYER_TAME', foodId: 'berry', enemyUid: b.enemyUnits[0].uid });
    const captured = state.battle!;
    expect(state.runStats!.finalTamedUids).toEqual([main.uid, captured.pendingTame[0].uid]);
    const full = gameReducer({ ...state, screen: 'tame-overflow', tameOverflow: captured.pendingTame }, { type: 'OPEN_BACKPACK' });
    expect(full.runStats!.finalTamedUids).toHaveLength(2);
    const released = gameReducer({ ...full, roster: [evolved.roster[0], makeUnit('lulu', true, 1, false)] }, { type: 'DISCARD', uid: main.uid });
    expect(released.runStats!.finalTamedUids).toHaveLength(2);
  });
  it('旧档不虚构来源或历史计数，新局不继承上局进度', () => {
    const run = fresh(); run.roster = [makeUnit('momo_god', true, 0, false)];
    const loaded = parseDualSave(JSON.stringify(run))!.main!;
    expect(loaded.runStats!.finalTamedUids).toEqual([]);
    const visited = gameReducer(loaded, { type: 'OPEN_BACKPACK' });
    expect(visited.runStats!.finalTamedUids).toEqual([]);
    const next = gameReducer({ ...run, runStats: { ...run.runStats!, finalTamedUids: ['1', '2', '3', '4'] } }, { type: 'START_RUN', starterId: 'momo', companionId: 'lulu', seed: 2 });
    expect(next.runStats!.finalTamedUids ?? []).toEqual([]);
  });
});

describe('备用的蜡烛', () => {
  it('第一只致死伤自动1血复活；不清减益、不额外行动，下一次正常死亡', () => {
    const b = fight(); b.playerUnits[0].statuses = [{ kind: 'spdDown', value: 1, turns: 3 }];
    const after = playerEndTurn(b);
    expect(after.phase).toBe('acting'); expect(after.playerUnits[0].hp).toBe(1);
    expect(after.spareCandleUsed).toBe(true);
    expect(after.playerUnits[0].statuses.some(s => s.kind === 'spdDown')).toBe(true);
    expect(after.playerUnits[0].timeRewindExtraPending).toBeUndefined();
    expect(after.log.filter(e => e.text.includes('备用的蜡烛使'))).toHaveLength(1);
    expect(playerEndTurn(after).phase).toBe('lost');
  });
  it('群攻只保护第一只，全队共享一次', () => {
    const b = fight('momo', 2); b.enemyUnits[0].skills = ['tail'];
    const after = playerEndTurn(b);
    expect(after.playerUnits.filter(u => u.hp > 0)).toHaveLength(1);
    expect(after.playerUnits.filter(u => u.hp === 0)).toHaveLength(1);
    expect(after.log.filter(e => e.text.includes('备用的蜡烛使'))).toHaveLength(1);
  });
  it.each(['dot', 'collapse', 'corrupt', 'counter'] as const)('%s致死也可触发', kind => {
    const b = fight(); b.enemyUnits[0].acted = true;
    if (kind === 'dot') b.playerUnits[0].statuses = [{ kind: 'poison', value: 2, turns: 2 }];
    if (kind === 'collapse') b.round = 15;
    if (kind === 'corrupt') b.corruptDebuff = 'burn';
    if (kind === 'counter') {
      b.playerUnits[0].skills = ['punch']; b.enemyUnits[0].passive = 'spike';
    }
    const after = playerEndTurn(kind === 'counter' ? playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid) : b);
    expect(after.phase).toBe('acting'); expect(after.playerUnits[0].hp).toBe(1); expect(after.spareCandleUsed).toBe(true);
  });
  it('时砂回溯优先，不消耗蜡烛；多段可在复活后再次击倒', () => {
    const b = fight('time_sand_beast'); b.playerUnits[0].passive = makeUnit('time_sand_beast', true, 0, false).passive;
    const after = playerEndTurn(b);
    expect(after.playerUnits[0].timeRewindUsed).toBe(true); expect(after.spareCandleUsed).toBeUndefined();
    after.playerUnits[0].hp = 1;
    const saved = playerEndTurn(after);
    expect(saved.spareCandleUsed).toBe(true); expect(saved.playerUnits[0].hp).toBe(1);
    const multi = fight(); multi.enemyUnits[0].skills = ['swift_needle'];
    const dead = playerEndTurn(multi);
    expect(dead.phase).toBe('lost'); expect(dead.log.filter(e => e.text.includes('备用的蜡烛使'))).toHaveLength(1);
  });
  it('不保护敌人、不携带无效果；新战斗恢复次数', () => {
    const b = fight(); b.enemyUnits[0].hp = 1; b.enemyUnits[0].acted = true; b.playerUnits[0].skills = ['punch'];
    const won = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid));
    expect(won.phase).toBe('won'); expect(won.spareCandleUsed).toBeUndefined();
    const normal = fight(); normal.relics = [];
    expect(playerEndTurn(normal).phase).toBe('lost');
    const used = playerEndTurn(fight());
    const next = createBattle(used.playerUnits, [{ speciesId: 'momo' }], 2, { relics: candle });
    expect(next.spareCandleUsed).toBeUndefined();
  });
  it('战斗读档保持使用状态与原概率', () => {
    const run = fresh(), battle = playerEndTurn(fight());
    const loaded = parseDualSave(JSON.stringify({ ...run, screen: 'battle', relics: candle, battle }))!.main!;
    expect(loaded.battle!.spareCandleUsed).toBe(true); expect(loaded.battle!.relics).toEqual(candle);
    expect(playerEndTurn(loaded.battle!).phase).toBe('lost');
  });
  it('车轮战换人不重置全场共享次数', () => {
    const b = createBattle([makeUnit('momo', true, 0, false), makeUnit('lulu', true, 0, false)], [{ speciesId: 'momo' }], 2, { relics: candle, gauntlet: true });
    b.playerUnits[0].hp = 1; b.playerUnits[0].passive = undefined; b.playerUnits[0].skills = [];
    b.playerBench![0].hp = 1; b.playerBench![0].skills = [];
    b.enemyUnits[0] = { ...b.enemyUnits[0], hp: 100, maxHp: 100, skills: ['shadow_claw'], passive: undefined, spd: 20 };
    const saved = playerEndTurn(b), down = playerEndTurn(saved);
    expect(saved.spareCandleUsed).toBe(true); expect(down.pendingSwap?.player).toBe(true);
    const swapped = performGauntletSwap(down);
    expect(swapped.spareCandleUsed).toBe(true);
    expect(playerEndTurn(swapped).phase).toBe('lost');
  });
  it('满编但失败、曾有死亡后补满均不解锁', () => {
    const run = fresh();
    const b = createBattle(run.roster, [{ speciesId: 'momo' }], 1); b.phase = 'lost'; b.playerUnits.forEach(u => { u.hp = 0; });
    const lost = gameReducer({ ...run, screen: 'battle', roster: Array.from({ length: 8 }, () => makeUnit('momo', true, 0, false)), battle: b }, { type: 'BATTLE_END_CONFIRM' });
    expect(lost.screen).toBe('gameover'); expect(lost.unlocks!.relics).not.toContain('spare_candle');
  });
  it.each([[8, 0, true], [7, 0, false], [8, 1, false]] as const)('通关队伍%d只、阵亡%d只，解锁=%s', (size, lost, unlocked) => {
    const run = fresh();
    const end: GameState = { ...run, screen: 'roster', act: 3, currentNodeId: 'boss', roster: Array.from({ length: size }, () => makeUnit('momo', true, 0, false)),
      runStats: { ...run.runStats!, rating: undefined, petsLost: lost }, map: { ...run.map, boss: { boss: [{ speciesId: 'boss_vine' }] } } };
    const won = gameReducer(end, { type: 'NEXT_NODE' });
    expect(won.screen).toBe('victory'); expect(won.unlocks!.relics.includes('spare_candle')).toBe(unlocked);
    expect(gameReducer({ ...end, testRun: true }, { type: 'NEXT_NODE' }).unlocks!.relics).not.toContain('spare_candle');
    expect(gameReducer({ ...end, act: 2 }, { type: 'NEXT_NODE' }).unlocks!.relics).not.toContain('spare_candle');
  });
  it('普通、事件和车轮战入场传递遗物，熟练度不启用', () => {
    const run = fresh();
    const node = run.map.layers[0][0];
    const before = gameReducer({ ...run, screen: 'map', relics: candle }, { type: 'MOVE', nodeId: node.id });
    const b = gameReducer(before, { type: 'FORMATION_CONFIRM', units: run.roster.slice(0, 1) });
    expect(b.battle!.relics).toEqual(candle);
    const prof = gameReducer({ ...before, runMode: 'proficiency' }, { type: 'FORMATION_CONFIRM', units: run.roster.slice(0, 1) });
    expect(prof.battle!.relics).toBeUndefined();
    const gauntlet = gameReducer({ ...run, relics: candle, currentNodeId: node.id }, { type: 'GAUNTLET_ORDER_CONFIRM', units: run.roster });
    expect(gauntlet.battle!.relics).toEqual(candle);
  });
});
