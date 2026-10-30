import { describe, expect, it } from 'vitest';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { applyGrowthChoice, resetAttributeGrowth, LEGENDARY_SKILLS } from '../src/game/core/growth';
import { buildGrowthEvent, type GrowthEventType } from '../src/game/data/growth-events';
import { growthCompanions, growthDuelEnemy, growthTrialEnemies, growthNormalTiers } from '../src/game/data/growth-encounters';
import { beginGrowthEncounter, growthEncounterCacheKey, growthEncounterEligible, type GrowthEncounterKind } from '../src/game/state/growth-encounters';
import { getGrowthSpecialRewards } from '../src/game/data/growth-special';
import { getMonster } from '../src/game/data/monsters';
import { createRng } from '../src/game/rng';
import type { GameState } from '../src/game/state/game';
import { simulateRun, simulationStep } from '../src/game/simulation/runner';

function state(eventType: GrowthEventType = 'mysterious_altar', layer = 20): GameState {
  const roster = ['momo', 'lulu', 'fifi', 'kiki', 'mimi'].map((id, i) => ({ ...makeUnit(id, true, (i % 3) as 0 | 1 | 2, false), growthPoints: 20 }));
  const base = gameReducer(createInitialState(), { type: 'START_PROFICIENCY_PICKED', seed: 20, starterId: 'momo', companionId: 'lulu' });
  return { ...base, currentNodeId: 'batch2', currentLayer: layer, screen: 'event', roster, field: roster.slice(0, 3).map(unit => unit.uid), gold: 100,
    inventory: {}, deadPets: [{ ...roster[4], uid: 'dead', hp: 0, skillEnhancements: { 0: 4 }, skillEnhancePaid: { 0: 18 }, statGrowthPaid: 8, curse: 'spdDown' }],
    map: { ...base.map, events: { batch2: buildGrowthEvent(createRng(1), eventType, 1, layer) } } };
}
function confirm(s: GameState, kind: GrowthEncounterKind, extra = {}) {
  return gameReducer(beginGrowthEncounter(s, kind), { type: 'GROWTH_ENCOUNTER_CONFIRM', uid: s.roster[0]?.uid, ...extra });
}
describe('第二批属性与物资', () => {
  it('祭坛不花成长点、不制造退款，普通付费投入可真实返还且只退一次', () => {
    const s = state(), before = s.roster[0];
    const after = confirm(s, 'altar_hp');
    expect(after.gold).toBe(70); expect(after.roster[0].maxHp).toBe(before.maxHp + 2);
    expect(after.roster[0].growthPoints).toBe(before.growthPoints);
    expect(resetAttributeGrowth(after.roster[0]).growthPoints).toBe(before.growthPoints);
    const paid = applyGrowthChoice(after.roster[0], { kind: 'spd', amount: 1 })!;
    expect(paid.statGrowthPaid).toBe(2);
    const reset = resetAttributeGrowth(paid);
    expect(reset.growthPoints).toBe(before.growthPoints);
    expect(resetAttributeGrowth(reset).growthPoints).toBe(reset.growthPoints);
    expect(resetAttributeGrowth({ ...before, bonusStats: { hp: 4 } }).growthPoints).toBe(20);
  });
  it('祭坛拒绝封顶或金币不足，不扣款', () => {
    const s = state(); s.roster = s.roster.map(unit => ({ ...unit, bonusStats: { hp: 30, spd: 15 } }));
    expect(beginGrowthEncounter(s, 'altar_hp')).toBe(s);
    s.roster = s.roster.map(unit => ({ ...unit, bonusStats: { hp: 29 } })); expect(beginGrowthEncounter(s, 'altar_hp')).toBe(s);
    const poor = { ...state(), gold: 29 }; expect(beginGrowthEncounter(poor, 'altar_spd')).toBe(poor);
  });
  it.each([['supply_heal', 'heal_potion_g'], ['supply_book', 'book_medium']] as const)('%s只发熟练度道具，重复确认无效', (kind, id) => {
    const after = confirm(state('expedition_supply'), kind);
    expect(after.inventory).toEqual({ [id]: 1 }); expect(after.gold).toBe(100);
    expect(after.screen).toBe('map'); expect(after.toast?.msg).toContain('获得');
    expect(gameReducer(after, { type: 'GROWTH_ENCOUNTER_CONFIRM' })).toBe(after);
    if (id === 'heal_potion_g') {
      const hurt = { ...after, roster: after.roster.map(unit => ({ ...unit, hp: 1 })) };
      const used = gameReducer(hurt, { type: 'USE_GROWTH_ITEM', itemId: id });
      expect(used.inventory[id]).toBe(0); expect(used.roster[0].hp).toBeGreaterThan(1);
    }
  });
  it('工具箱一次发两件工具，全员没有有效用途时过滤', () => {
    const after = confirm(state(), 'tools');
    expect(after.inventory).toEqual({ skill_enhance_stone: 1, reset_stone: 1 });
    expect(growthEncounterEligible({ ...state(), roster: [{ ...state().roster[0], skills: ['gather_shields'] }] }, 'tools')).toBe(false);
  });
});
describe('招募、复活与传奇技能', () => {
  it.each([1, 16, 31])('第%d层候选固定且不重复，满员也能领取，携带分段成长点', layer => {
    let s = state('pet_recruit', layer), original = s.map.events.batch2.choices[0].recruitCandidates!;
    s = gameReducer(createInitialState(), { type: 'LOAD_GAME', state: JSON.parse(JSON.stringify(s)) });
    expect(s.map.events.batch2.choices[0].recruitCandidates).toEqual(original);
    expect(new Set(original).size).toBe(2);
    const after = confirm(s, 'companions', { speciesId: original[0] });
    expect(after.screen).toBe('tame-overflow'); expect(after.roster).toHaveLength(5);
    expect(after.tameOverflow?.[0]).toMatchObject({ speciesId: original[0], growthPoints: layer < 16 ? 4 : layer < 31 ? 8 : 12 });
    expect(after.tameOverflow?.[0].skillEnhancements).toBeUndefined();
  });
  it.each(['grave', 'revival_spring'] as const)('%s保留全部养成、清战斗状态，满员进入处理且治疗不重复', kind => {
    const s = state('revive_dead'); s.roster = s.roster.map(unit => ({ ...unit, hp: 1 }));
    const before = s.deadPets![0]; before.shield = 10; before.skillCooldowns = { punch: 2 };
    const after = confirm(s, kind, { uid: before.uid });
    const pet = after.tameOverflow![0];
    expect(pet).toMatchObject({ maxHp: before.maxHp, spd: before.spd, skillEnhancements: { 0: 4 }, skillEnhancePaid: { 0: 18 }, statGrowthPaid: 8, curse: 'spdDown', shield: 0, statuses: [] });
    expect(pet.skillCooldowns).toBeUndefined(); expect(pet.hp).toBe(kind === 'grave' ? Math.ceil(pet.maxHp / 2) : pet.maxHp);
    expect(after.deadPets).toEqual([]);
    expect(after.roster[0].hp).toBe(kind === 'grave' ? 1 : 1 + Math.ceil(s.roster[0].maxHp / 4));
    expect(gameReducer(after, { type: 'GROWTH_ENCOUNTER_CONFIRM', uid: before.uid })).toBe(after);
  });
  it.each([false, true])('传奇秘典处理替换与已解锁空槽，候选存取固定 empty=%s', empty => {
    let s = state(); s.roster[0].extraSkillSlots = empty ? 1 : 0;
    s.roster[0].skillEnhancements = { 0: 4 }; s.roster[0].skillEnhancePaid = { 0: 18 };
    s = beginGrowthEncounter(s, 'legend');
    s = gameReducer(s, { type: 'GROWTH_ENCOUNTER_PREVIEW', uid: s.roster[0].uid, slot: 0 });
    const slot = s.growthEncounterPending!.slot!, key = growthEncounterCacheKey(s, s.roster[0].uid, slot);
    const choices = s.growthEncounterCandidates![key];
    expect(choices).toHaveLength(3); expect(choices.every(id => LEGENDARY_SKILLS.has(id))).toBe(true);
    s = gameReducer(createInitialState(), { type: 'LOAD_GAME', state: JSON.parse(JSON.stringify(s)) });
    expect(s.growthEncounterCandidates![key]).toEqual(choices);
    const after = gameReducer(s, { type: 'GROWTH_ENCOUNTER_CONFIRM', uid: s.roster[0].uid, slot, skillId: choices[0] });
    expect(after.roster[0].skills[slot]).toBe(choices[0]); expect(after.roster[0].skillEnhancements?.[slot]).toBeUndefined(); expect(after.roster[0].skillEnhancePaid?.[slot]).toBeUndefined();
    expect(after.roster[0].skills.length).toBe(empty ? 3 : 2); expect(after.roster[0].growthPoints).toBe(20);
  });
});
describe('第二批试炼', () => {
  it('旧节点快照不重新生成奖励，协同试炼恢复上次布阵并保留失效空位', () => {
    const s = state('arena_challenge'); s.lastFormation = { [s.roster[1].uid]: { row: 'back', column: 2 }, missing: { row: 'front', column: 0 } };
    expect(confirm(s, 'trial').formation?.initialField.map(unit => [unit.uid, unit.row, unit.column])).toEqual([[s.roster[1].uid, 'back', 2]]);
    s.currentRow = 0; s.currentNodeId = 'a'; s.screen = 'map';
    s.map.layers = [[{ id: 'a', type: 'battle', label: '战斗', col: 0 }], [{ id: 'old', type: 'event', label: '事件', col: 0 }]];
    const legacy = { title: '战斗大师', desc: '旧存档事件', choices: [{ id: 'old-gold', label: '旧奖励', desc: '30金币', kind: 'gold' as const, goldDelta: 30 }] };
    s.map.events.old = legacy;
    const entered = gameReducer(s, { type: 'MOVE', nodeId: 'old' });
    expect(entered.map.events.old).toBe(legacy);
    expect(gameReducer(entered, { type: 'EVENT_CHOICE', choiceId: 'old-gold' }).gold).toBe(s.gold + 30);
  });
  it('事件直接离开后，下一关按实际地图行同步层数；满队自动玩家不循环买招募', () => {
    let s = state('expedition_supply'); s.currentLayer = 1; s.currentRow = 0; s.currentNodeId = 'a'; s.screen = 'map';
    s.map.layers = [[{ id: 'a', type: 'event', label: '事件', col: 0 }], [{ id: 'b', type: 'shop', label: '商人', col: 0 }], [{ id: 'c', type: 'battle', label: '战斗', col: 0 }]];
    const moved = gameReducer(s, { type: 'MOVE', nodeId: 'b' });
    expect(moved.currentLayer).toBe(2);
    const next = simulationStep({ ...moved, shopStock: ['pet_recruit'], shopBoughtItems: [], inventory: {} }, 20);
    expect(next.screen).toBe('map');
  });
  it('新事件涉及的固定种子2089可以正常结束', () => {
    expect(simulateRun({ mode: 'proficiency', seed: 2089, collectTelemetry: false }).outcome).not.toMatch(/stuck|error/);
  });
  it('单人开战，胜利只给6点、不给金币或候补加点', () => {
    const s = state('battle_master'); let battle = confirm(s, 'duel');
    expect(battle.battle?.playerUnits).toHaveLength(1);
    battle.battle!.phase = 'won'; battle.battle!.enemyUnits.forEach(unit => { unit.hp = 0; });
    const after = gameReducer(battle, { type: 'BATTLE_END_CONFIRM' });
    expect(after.roster.map(unit => unit.growthPoints)).toEqual([26, 20, 20, 20, 20]); expect(after.gold).toBe(100);
    expect(gameReducer(after, { type: 'BATTLE_END_CONFIRM' })).toBe(after);
  });
  it('协同布阵可取消；参战阵亡进墓地，存活才领3点，收入20只记一次', () => {
    const s = state('arena_challenge'); let formation = confirm(s, 'trial');
    expect(formation.screen).toBe('formation');
    expect(gameReducer(formation, { type: 'BACK_TO_MAP' }).screen).toBe('event');
    expect(gameReducer(formation, { type: 'FORMATION_CONFIRM', units: s.roster })).toBe(formation);
    let battle = gameReducer(formation, { type: 'FORMATION_CONFIRM', units: s.roster.slice(0, 3) });
    battle.battle!.phase = 'won'; battle.battle!.playerUnits[0].hp = 0;
    const after = gameReducer(battle, { type: 'BATTLE_END_CONFIRM' });
    expect(after.roster).toHaveLength(4); expect(after.deadPets).toHaveLength(2);
    expect(after.roster.map(unit => unit.growthPoints)).toEqual([23, 23, 20, 20]);
    expect(after.gold).toBe(120); expect(after.runStats!.goldEarned).toBe(s.runStats!.goldEarned + 20); expect(after.runStats!.petsLost).toBe(1);
  });
  it('单人考核失败真实阵亡，有其他存活伙伴则回地图继续，旧事件战斗仍沿用旧惩罚', () => {
    let s = confirm(state('battle_master'), 'duel'); s.battle!.phase = 'lost'; s.battle!.playerUnits[0].hp = 0;
    const after = gameReducer(s, { type: 'BATTLE_END_CONFIRM' }); expect(after.proficiencyResult).toBeUndefined(); expect(after.screen).toBe('map'); expect(after.roster).toHaveLength(4); expect(after.gold).toBe(100);
    expect(after.deadPets).toHaveLength(2); expect(after.roster.every(unit => unit.growthPoints === 20)).toBe(true);
    expect(after.toast?.msg).toContain('继续远征');
    expect(gameReducer(after, { type: 'BATTLE_END_CONFIRM' })).toBe(after);
    const old = state(); old.eventBattle = { enemies: [{ speciesId: 'momo' }], reward: { kind: 'gold', amount: 30 }, penalty: { percent: 20 } };
    old.battle = createBattle(old.roster.slice(0, 1), old.eventBattle.enemies, 1); old.battle.phase = 'lost';
    expect(gameReducer(old, { type: 'BATTLE_END_CONFIRM' }).screen).toBe('map');
  });
  it('单人考核全队无存活伙伴才结束，协同试炼失败仍结束远征', () => {
    const alone = state('battle_master'); alone.roster = alone.roster.slice(0, 1);
    const duel = confirm(alone, 'duel'); duel.battle!.phase = 'lost'; duel.battle!.playerUnits[0].hp = 0;
    expect(gameReducer(duel, { type: 'BATTLE_END_CONFIRM' })).toMatchObject({ screen: 'proficiency-result', proficiencyResult: 'lost', roster: [] });
    const s = state('arena_challenge');
    const formation = confirm(s, 'trial');
    const trial = gameReducer(formation, { type: 'FORMATION_CONFIRM', units: s.roster.slice(0, 2) });
    trial.battle!.phase = 'lost'; trial.battle!.playerUnits.forEach(unit => { unit.hp = 0; });
    expect(gameReducer(trial, { type: 'BATTLE_END_CONFIRM' })).toMatchObject({ screen: 'proficiency-result', proficiencyResult: 'lost' });
  });
  it.each(['supply_heal', 'supply_book', 'buy_stone', 'trial'] as const)('%s直接从事件选项进入结果或布阵，不经过二次确认', kind => {
    const s = state(kind === 'trial' ? 'arena_challenge' : kind === 'buy_stone' ? 'stone_of_forget' : 'expedition_supply');
    const choice = s.map.events.batch2.choices.find(choice => choice.growthEncounter === kind)!;
    const after = gameReducer(s, { type: 'EVENT_CHOICE', choiceId: choice.id });
    expect(after.growthEncounterPending).toBeUndefined();
    expect(after.screen).toBe(kind === 'trial' ? 'formation' : 'map');
    if (kind !== 'trial') {
      expect(after.toast?.msg).toContain('获得');
      expect(gameReducer(after, { type: 'EVENT_CHOICE', choiceId: choice.id })).toBe(after);
      expect(beginGrowthEncounter({ ...after, screen: 'event' }, kind).growthEncounterPending).toBeUndefined();
    } else expect(after.formation?.encounter).toEqual(choice.battleEnemies);
  });
  it('拆解确认返还后直接回地图并提示，贫穷时不能直接领取强化石', () => {
    const s = state('stone_of_forget'); s.roster[0].skillEnhancements = { 0: 2 }; s.roster[0].skillEnhancePaid = { 0: 18 };
    const after = confirm(s, 'recycle', { slot: 0 });
    expect(after.screen).toBe('map'); expect(after.roster[0].growthPoints).toBe(38);
    expect(after.toast?.msg).toContain('返还18成长点');
    const poor = { ...s, gold: 29 }, choice = s.map.events.batch2.choices.find(choice => choice.growthEncounter === 'buy_stone')!;
    expect(gameReducer(poor, { type: 'EVENT_CHOICE', choiceId: choice.id })).toBe(poor);
  });
  it('所有层数的候选和组合合法非空，传奇秘典16层前不投放', () => {
    for (let layer = 1; layer <= 50; layer++) for (let seed = 1; seed <= 12; seed++) {
      const rng = createRng(seed), normal = growthNormalTiers(layer).flatMap(([pool]) => pool);
      expect(growthDuelEnemy(layer, rng).every(unit => getMonster(unit.speciesId).rank <= (layer <= 5 ? 1 : layer <= 31 ? 2 : 3))).toBe(true);
      expect(growthCompanions(layer, rng).every(id => normal.includes(id))).toBe(true);
      const team = growthTrialEnemies(layer, rng);
      expect(team.length).toBeGreaterThanOrEqual(2);
      expect(team.length).toBeLessThanOrEqual(3);
      expect(team.every(unit => getMonster(unit.speciesId).rank <= (layer <= 15 ? 2 : 3))).toBe(true);
      if (layer < 16) expect(getGrowthSpecialRewards(rng, 1, layer)).not.toContain('legend_recruit');
    }
  });
});
