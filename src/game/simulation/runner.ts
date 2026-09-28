import { BATTLE_FATIGUE_START_ROUND, canUnitUseSkill, getActablePlayerUnits, isTameable, playerHasMove, resetUidSequenceForSimulation } from '../core/battle';
import { applyGrowthChoice, applySkillEnhance, getSkillEnhanceCost } from '../core/growth';
import { FOODS } from '../data/foods';
import { getSkill } from '../data/skills';
import type { BattleState, Unit } from '../types';
import { createInitialState, gameReducer, type GameAction } from '../state/reducer';
import { canStepTo, canTameEnemy, nextStage, type GameState, type MapNode } from '../state/game';
import type { BattleSimulationSummary, SimulationConfig, SimulationResult } from './types';

export const DEFAULT_SIMULATION_STEPS = { main: 2500, proficiency: 6000 } as const;

function dispatch(state: GameState, action: GameAction): GameState {
  return gameReducer(state, action);
}

function withTelemetry(state: GameState, enabled: boolean): GameState {
  if (!enabled || !state.battle || state.battle.telemetry) return state;
  const units = [...state.battle.playerUnits, ...state.battle.enemyUnits];
  return {
    ...state,
    battle: {
      ...state.battle,
      telemetry: units.map((unit) => ({
        kind: 'battle-start' as const,
        round: state.battle!.round,
        side: unit.isPlayer ? 'player' as const : 'enemy' as const,
        actorUid: unit.uid,
        actorSpeciesId: unit.speciesId,
      })),
      telemetryHp: Object.fromEntries(units.map((unit) => [unit.uid, unit.hp])),
    },
  };
}

function battleStep(state: GameState): GameState {
  const battle = state.battle!;
  if (battle.phase !== 'acting') return state;
  if (battle.pendingSwap?.player || battle.pendingSwap?.enemy) return dispatch(state, { type: 'GAUNTLET_SWAP' });
  if (!playerHasMove(battle)) return dispatch(state, { type: 'END_TURN' });
  const actor = getActablePlayerUnits(battle)[0];
  if (!actor) return dispatch(state, { type: 'END_TURN' });

  const tameTarget = battle.enemyUnits
    .filter((unit) => unit.hp > 0 && canTameEnemy(unit) && isTameable(unit) && unit.hp / unit.maxHp <= 0.25)
    .sort((a, b) => a.hp - b.hp)[0];
  const food = Object.keys(state.inventory).find((id) => (state.inventory[id] ?? 0) > 0 && FOODS[id]);
  if (state.runMode !== 'proficiency' && tameTarget && food) {
    return dispatch(state, { type: 'PLAYER_TAME', foodId: food, enemyUid: tameTarget.uid });
  }

  const usable = actor.skills.filter((id) => canUnitUseSkill(actor, id)).map(getSkill);
  if (usable.length === 0) return dispatch(state, { type: 'PLAYER_REST', actorUid: actor.uid });
  const heal = usable.find((skill) => skill.kind === 'heal');
  const ally = [...battle.playerUnits].filter((unit) => unit.hp > 0).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  if (heal && ally && ally.hp / ally.maxHp < 0.5) {
    return dispatch(state, { type: 'PLAYER_SKILL', actorUid: actor.uid, skillId: heal.id, targetUid: ally.uid });
  }

  const offensive = usable
    .filter((skill) => skill.kind !== 'heal' && skill.target !== 'ally' && skill.target !== 'allyAll')
    .sort((a, b) => (b.damage ?? 0) - (a.damage ?? 0));
  const chosen = offensive[0] ?? usable[0];
  if (chosen.target === 'all' || chosen.target === 'random' || chosen.target === 'self' || chosen.target === 'allyAll') {
    return dispatch(state, { type: 'PLAYER_SKILL', actorUid: actor.uid, skillId: chosen.id });
  }
  if (chosen.target === 'ally') {
    return dispatch(state, { type: 'PLAYER_SKILL', actorUid: actor.uid, skillId: chosen.id, targetUid: ally?.uid });
  }
  const enemies = battle.enemyUnits.filter((unit) => unit.hp > 0);
  const front = enemies.filter((unit) => unit.row === 'front');
  const back = enemies.filter((unit) => unit.row === 'back');
  const reach = chosen.reach ?? 'front';
  const pool = reach === 'direct' ? enemies : reach === 'back' ? (back.length ? back : front) : (front.length ? front : back);
  const target = [...pool].sort((a, b) => a.hp - b.hp)[0];
  return dispatch(state, { type: 'PLAYER_SKILL', actorUid: actor.uid, skillId: chosen.id, targetUid: target?.uid });
}

function bestField(state: GameState): string[] {
  return [...state.roster].sort((a, b) => b.maxHp - a.maxHp).slice(0, state.runMode === 'proficiency' ? 5 : 3).map((unit) => unit.uid);
}

function accessibleMainNodes(state: GameState): MapNode[] {
  const row = state.currentNodeId === '' ? state.currentRow : state.currentRow + 1;
  const nodes = state.map.layers[row] ?? [];
  const currentCol = state.currentNodeId === '' ? null : (state.map.layers[state.currentRow]?.find((node) => node.id === state.currentNodeId)?.col ?? null);
  return nodes.filter((node) => {
    const hasKey = node.guardianId ? (state.inventory[`key_${node.guardianId}`] ?? 0) > 0 : true;
    return canStepTo(state.currentRow, currentCol, node, state.map) && (node.type !== 'keydoor' || hasKey);
  });
}

function mapStep(state: GameState): GameState {
  const field = bestField(state);
  if (field.length > 0 && state.field.length === 0) return dispatch(state, { type: 'SET_FIELD', uids: field });
  if (state.runMode === 'proficiency') {
    const row = state.currentNodeId === '' ? state.currentRow : state.currentRow + 1;
    const node = state.map.layers[row]?.[0];
    return node ? dispatch(state, { type: 'MOVE', nodeId: node.id }) : dispatch(state, { type: 'NEXT_NODE' });
  }
  const nodes = accessibleMainNodes(state);
  if (nodes.length === 0) return dispatch(state, { type: 'NEXT_NODE' });
  const wounded = state.roster.some((unit) => unit.hp / unit.maxHp < 0.6);
  const rest = nodes.find((node) => node.type === 'rest' || node.type === 'shop');
  const special = nodes.find((node) => node.type === 'special');
  const battle = nodes.find((node) => ['battle', 'elite', 'arena', 'gauntlet', 'corrupted', 'guardian', 'boss'].includes(node.type));
  const event = nodes.find((node) => node.type === 'event');
  const chosen = (wounded && rest) || special || battle || event || nodes[0];
  return dispatch(state, { type: 'MOVE', nodeId: chosen.id });
}

function deterministicEventChoice(state: GameState): GameState {
  const event = state.map.events[state.currentNodeId];
  if (!event) return dispatch(state, { type: 'NEXT_NODE' });
  const valid = event.choices.filter((choice) => {
    if ((choice.goldDelta ?? 0) < 0 && state.gold + (choice.goldDelta ?? 0) < 0) return false;
    if (choice.consumeFood && choice.foodId && (state.inventory[choice.foodId] ?? 0) <= 0) return false;
    return choice.chance === undefined || choice.chance >= 1;
  });
  const safe = valid.filter((choice) => !['sacrifice', 'curse'].includes(choice.kind));
  const pool = safe.length ? safe : valid.length ? valid : event.choices;
  const priorities = state.runMode === 'proficiency'
    ? ['heal', 'growthPoint', 'permanentBoost', 'food', 'item', 'gold', 'none', 'battle']
    : ['recruit', 'heal', 'food', 'item', 'none', 'gold', 'battle'];
  const choice = priorities.map((kind) => pool.find((item) => item.kind === kind)).find(Boolean) ?? pool[0];
  return choice ? dispatch(state, { type: 'EVENT_CHOICE', choiceId: choice.id }) : dispatch(state, { type: 'NEXT_NODE' });
}

function improveUnit(unit: Unit): Unit | undefined {
  const damageSlots = unit.skills
    .map((id, index) => ({ index, damage: getSkill(id).damage ?? 0 }))
    .sort((a, b) => b.damage - a.damage);
  for (const slot of damageSlots) {
    if (getSkillEnhanceCost(unit, slot.index) <= (unit.growthPoints ?? 0)) {
      const enhanced = applySkillEnhance(unit, slot.index);
      if (enhanced) return enhanced;
    }
  }
  const hp = applyGrowthChoice(unit, { kind: 'hp', amount: 2 });
  if (hp) return hp;
  return applyGrowthChoice(unit, { kind: 'spd', amount: 1 }) ?? undefined;
}

function growthStep(state: GameState): GameState {
  if (state.specialPending) {
    const target = [...state.roster].sort((a, b) => (b.growthPoints ?? 0) - (a.growthPoints ?? 0))[0];
    if (target) {
      const shopKinds = ['shopGrantGrowthPoint', 'shopStatBoost', 'shopSlotUnlock', 'shopForget', 'legendSkill'];
      return shopKinds.includes(state.specialPending.kind)
        ? dispatch(state, { type: 'PROF_SHOP_EFFECT', uid: target.uid })
        : dispatch(state, { type: 'SPECIAL_TARGET', uid: target.uid });
    }
  }
  for (const unit of [...state.roster].sort((a, b) => (b.growthPoints ?? 0) - (a.growthPoints ?? 0))) {
    const improved = improveUnit(unit);
    if (improved) return dispatch(state, { type: 'PROF_GROWTH_APPLY', uid: unit.uid, updatedUnit: improved });
  }
  return dispatch(state, { type: 'NEXT_NODE' });
}

function specialStep(state: GameState): GameState {
  const special = state.map.specials[state.currentNodeId];
  if (!special) return dispatch(state, { type: 'NEXT_NODE' });
  const priorities = state.runMode === 'proficiency'
    ? ['growthPoint', 'boost', 'slotUnlock', 'gold', 'item', 'recruit', 'revive']
    : ['gold', 'item', 'evolve', 'boost', 'custom', 'superevolve'];
  const reward = priorities.map((kind) => special.rewards.find((item) => item.kind === kind)).find(Boolean) ?? special.rewards[0];
  return reward ? dispatch(state, { type: 'SPECIAL_CHOICE', rewardId: reward.id }) : dispatch(state, { type: 'NEXT_NODE' });
}

function shopStep(state: GameState): GameState {
  if (state.runMode !== 'proficiency') {
    if (!state.shopBought && state.gold >= 5 && state.roster.some((unit) => unit.hp / unit.maxHp < 0.5)) return dispatch(state, { type: 'SHOP_REST' });
    if (state.gold >= 14 && (state.shopStock ?? []).includes('gem') && !(state.shopBoughtItems ?? []).includes('gem')) return dispatch(state, { type: 'SHOP_BUY', foodId: 'gem' });
    return dispatch(state, { type: 'NEXT_NODE' });
  }
  const stock = state.shopStock ?? [];
  const price: Record<string, number> = { heal_potion: 30, book_large: 30, book_medium: 22, book_small: 12, skill_enhance_stone: 40 };
  const priorities = state.roster.some((unit) => unit.hp / unit.maxHp < 0.55)
    ? ['heal_potion', 'book_large', 'book_medium', 'book_small', 'skill_enhance_stone']
    : ['book_large', 'book_medium', 'book_small', 'skill_enhance_stone', 'heal_potion'];
  const item = priorities.find((id) => stock.includes(id) && !(state.shopBoughtItems ?? []).includes(id) && state.gold >= (price[id] ?? Infinity));
  return item ? dispatch(state, { type: 'PROF_SHOP_BUY', itemId: item }) : dispatch(state, { type: 'NEXT_NODE' });
}

function rosterStep(state: GameState): GameState {
  const target = [...state.roster].sort((a, b) => b.maxHp - a.maxHp)[0];
  if (state.specialPending?.kind === 'evolve') {
    const evolvable = state.roster.find((unit) => nextStage(unit.speciesId));
    if (evolvable) return dispatch(state, { type: 'EVOLVE_ONE', uid: evolvable.uid });
  }
  if (state.specialPending && target) {
    return dispatch(state, { type: 'SPECIAL_TARGET', uid: target.uid });
  }
  return dispatch(state, { type: 'NEXT_NODE' });
}

export function simulationStep(state: GameState, seed: number): GameState {
  switch (state.screen) {
    case 'inter_act': return dispatch(state, { type: 'INTER_ACT_CONTINUE' });
    case 'map': return mapStep(state);
    case 'battle': return state.battle?.phase === 'acting' ? battleStep(state) : dispatch(state, { type: 'BATTLE_END_CONFIRM' });
    case 'formation': return dispatch(state, { type: 'FORMATION_CONFIRM', units: state.formation?.units ?? [] });
    case 'gauntlet-order': return dispatch(state, { type: 'GAUNTLET_ORDER_CONFIRM', units: state.gauntletOrder ?? [] });
    case 'reward': {
      const wounded = state.roster.some((unit) => unit.hp / unit.maxHp < 0.7);
      const reward = (wounded && state.rewards.find((item) => item.kind === 'heal')) || state.rewards.find((item) => item.kind === 'recruit') || state.rewards.find((item) => item.kind === 'food') || state.rewards[0];
      return dispatch(state, { type: 'PICK_REWARD', rewardId: reward?.id ?? '' });
    }
    case 'roster': return rosterStep(state);
    case 'shop': return shopStep(state);
    case 'rest': return dispatch(state, { type: 'REST_HEAL' });
    case 'event': return deterministicEventChoice(state);
    case 'special': return specialStep(state);
    case 'custom': return dispatch(state, { type: 'PICK_CUSTOM', presetId: 'custom_fury' });
    case 'boost': return dispatch(state, { type: 'BOOST_STAT', stat: 'hp' });
    case 'growth-menu': return growthStep(state);
    case 'blacksmith': return growthStep(state);
    case 'arena3': {
      const preferred = (['simulation', 'challenge', 'exhibition'] as const)[seed % 3];
      return dispatch(state, { type: 'ARENA3_MODE', mode: preferred === 'exhibition' && state.gold < 20 ? 'simulation' : preferred });
    }
    case 'skill-pick': {
      if (state.skillReplace && state.skillReplace.replaceIdx < 0) return dispatch(state, { type: 'PROF_SKILL_REPLACE_SELECT', replaceIdx: 0 });
      const skillId = state.skillReplace?.choices[0] ?? state.skillPick?.choices[0];
      return skillId ? dispatch(state, { type: 'PROF_SLOT_PICK', skillId }) : dispatch(state, { type: 'PROF_SLOT_CANCEL' });
    }
    case 'revive-select': {
      const dead = state.deadPets?.[0];
      return dead ? dispatch(state, { type: 'REVIVE', uid: dead.uid, ratio: 0.5 }) : dispatch(state, { type: 'NEXT_NODE' });
    }
    case 'watchtower': return dispatch(state, { type: 'CLOSE_WATCHTOWER' });
    case 'chest': return dispatch(state, { type: 'NEXT_NODE' });
    case 'backpack': return dispatch(state, { type: 'CLOSE_BACKPACK' });
    case 'tame-overflow': {
      const unit = state.tameOverflow?.[0];
      return unit ? dispatch(state, { type: 'TAME_OVERFLOW_DISCARD', tameUid: unit.uid }) : dispatch(state, { type: 'NEXT_NODE' });
    }
    case 'enhance-stone':
    case 'enhance-reset': return dispatch(state, { type: 'CANCEL_GROWTH_ITEM' });
    case 'rest-fusion': return dispatch(state, { type: 'REST_FUSION_CANCEL' });
    case 'rest-fusion-skill': return dispatch(state, { type: 'REST_FUSION_CANCEL' });
    default: return state;
  }
}

function detail(state: GameState): string {
  return `screen=${state.screen} act=${state.act} row=${state.currentRow} node=${state.currentNodeId || '<start>'} layer=${state.currentLayer ?? 0} roster=${state.roster.length} field=${state.field.join(',')} pending=${state.specialPending?.kind ?? 'none'} battle=${state.battle?.phase ?? 'none'}`;
}

function invariantError(state: GameState): string | undefined {
  const groups: Unit[][] = [state.roster];
  if (state.battle) groups.push(state.battle.playerUnits, state.battle.enemyUnits, state.battle.playerBench ?? [], state.battle.enemyBench ?? []);
  for (const group of groups) {
    const ids = group.map((unit) => unit.uid);
    if (new Set(ids).size !== ids.length) return '同一单位集合中出现重复 UID';
    for (const unit of group) {
      const values = [unit.hp, unit.maxHp, unit.spd, unit.shield, unit.growthPoints ?? 0];
      if (values.some((value) => !Number.isFinite(value))) return `${unit.speciesId} 出现非有限数值`;
    }
  }
  return undefined;
}

function signature(state: GameState, outcome: string): string {
  return JSON.stringify({
    outcome,
    screen: state.screen,
    act: state.act,
    row: state.currentRow,
    layer: state.currentLayer ?? 0,
    gold: state.gold,
    roster: state.roster.map((unit) => [unit.speciesId, unit.hp, unit.maxHp, unit.spd, unit.growthPoints ?? 0, unit.skills, unit.skillEnhancements ?? {}]),
    stats: state.runStats,
    proficiency: state.proficiencyStats,
  });
}

function finishBattle(battle: BattleState, nodeType: BattleSimulationSummary['nodeType']): BattleSimulationSummary {
  const telemetry = battle.telemetry ?? [];
  return {
    nodeType,
    result: battle.phase === 'won' ? 'won' : 'lost',
    rounds: battle.round,
    fatigueTriggered: battle.round > BATTLE_FATIGUE_START_ROUND,
    playerDeaths: telemetry.filter((event) => event.kind === 'death' && event.side === 'player').length,
    enemyDeaths: telemetry.filter((event) => event.kind === 'death' && event.side === 'enemy').length,
    telemetry,
  };
}

export function simulateRun(input: Partial<SimulationConfig> & Pick<SimulationConfig, 'mode' | 'seed'>): SimulationResult {
  const config: SimulationConfig = {
    mode: input.mode,
    seed: input.seed,
    difficulty: input.difficulty ?? 'normal',
    maxSteps: input.maxSteps ?? DEFAULT_SIMULATION_STEPS[input.mode],
    collectTelemetry: input.collectTelemetry ?? true,
  };
  const startedAt = performance.now();
  resetUidSequenceForSimulation(config.seed);
  let state = config.mode === 'main'
    ? dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'kiki', seed: config.seed, difficulty: config.difficulty })
    : dispatch(createInitialState(), { type: 'START_PROFICIENCY_PICKED', seed: config.seed, starterId: 'momo', companionId: 'lulu' });
  if (config.mode === 'proficiency') {
    state = { ...state, difficulty: config.difficulty, currentNodeId: '', visitedNodeIds: [] };
  }
  let steps = 0;
  let unchanged = 0;
  let specials = 0;
  let maxAct = state.act;
  let maxLayer = state.currentLayer ?? 0;
  let activeNodeType: BattleSimulationSummary['nodeType'] = 'unknown';
  const battles: BattleSimulationSummary[] = [];
  let growthEarned = 0;
  let growthSpent = 0;
  let enhancements = 0;
  const arenaResults: Record<string, number> = {};
  let outcome: SimulationResult['outcome'] = 'stuck';
  let resultDetail = '';

  try {
    while (steps < config.maxSteps) {
      state = withTelemetry(state, config.collectTelemetry);
      if (state.battle && state.battle.telemetry?.filter((event) => event.kind === 'battle-start').length === [...state.battle.playerUnits, ...state.battle.enemyUnits].length) {
        activeNodeType = (state.battle.nodeType as BattleSimulationSummary['nodeType']) ?? 'unknown';
      }
      if (state.battle && state.battle.phase !== 'acting') {
        battles.push(finishBattle(state.battle, activeNodeType));
        if (activeNodeType === 'arena3') {
          const key = `${state.arena3Pending?.mode ?? 'unknown'}:${state.battle.phase}`;
          arenaResults[key] = (arenaResults[key] ?? 0) + 1;
        }
      }
      if (state.screen === 'victory' || state.screen === 'proficiency-result') {
        outcome = state.screen === 'victory' || state.proficiencyResult === 'won' ? 'victory' : 'gameover';
        break;
      }
      if (state.screen === 'gameover') {
        outcome = 'gameover';
        break;
      }
      const invalid = invariantError(state);
      if (invalid) {
        outcome = 'error';
        resultDetail = invalid;
        break;
      }
      const supported = new Set(['inter_act', 'map', 'battle', 'formation', 'gauntlet-order', 'reward', 'roster', 'shop', 'rest', 'event', 'special', 'custom', 'boost', 'growth-menu', 'blacksmith', 'arena3', 'skill-pick', 'revive-select', 'watchtower', 'chest', 'backpack', 'tame-overflow', 'enhance-stone', 'enhance-reset', 'rest-fusion', 'rest-fusion-skill']);
      if (!supported.has(state.screen)) {
        outcome = 'stuck';
        resultDetail = `未知界面；${detail(state)}`;
        break;
      }
      const before = state;
      const beforeGrowth = new Map(before.roster.map((unit) => [unit.uid, unit.growthPoints ?? 0]));
      const beforeEnhancements = before.roster.reduce((sum, unit) => sum + Object.values(unit.skillEnhancements ?? {}).reduce((a, b) => a + b, 0), 0);
      state = simulationStep(state, config.seed);
      state = withTelemetry(state, config.collectTelemetry);
      for (const unit of state.roster) {
        const previous = beforeGrowth.get(unit.uid);
        if (previous === undefined) continue;
        const delta = (unit.growthPoints ?? 0) - previous;
        if (delta > 0) growthEarned += delta;
        else growthSpent -= delta;
      }
      const afterEnhancements = state.roster.reduce((sum, unit) => sum + Object.values(unit.skillEnhancements ?? {}).reduce((a, b) => a + b, 0), 0);
      if (afterEnhancements > beforeEnhancements) enhancements += afterEnhancements - beforeEnhancements;
      if (before.screen === 'special' && state.screen !== 'special') specials += 1;
      maxAct = Math.max(maxAct, state.act);
      maxLayer = Math.max(maxLayer, state.currentLayer ?? 0);
      steps += 1;
      unchanged = state === before ? unchanged + 1 : 0;
      if (unchanged >= 5) {
        outcome = 'stuck';
        resultDetail = `连续 ${unchanged} 步无状态变化；${detail(state)}`;
        break;
      }
    }
    if (steps >= config.maxSteps) resultDetail = `超过 ${config.maxSteps} 步上限；${detail(state)}`;
  } catch (error) {
    outcome = 'error';
    resultDetail = error instanceof Error ? error.stack ?? error.message : String(error);
  }

  const stats = state.runStats;
  return {
    config,
    outcome,
    detail: resultDetail,
    steps,
    elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
    maxAct,
    maxLayer,
    specials,
    finalSignature: signature(state, outcome),
    battles,
    economy: {
      goldEarned: stats?.goldEarned ?? 0,
      goldSpent: stats?.goldSpent ?? 0,
      shopVisits: stats?.shopVisits ?? 0,
      fusions: stats?.fusions ?? 0,
      petsTamed: stats?.petsTamed ?? 0,
      petsLost: stats?.petsLost ?? 0,
      growthPointsEarned: growthEarned,
      growthPointsSpent: growthSpent,
      skillEnhancements: enhancements,
      arenaResults,
    },
    finalRoster: state.roster.map((unit) => ({ speciesId: unit.speciesId, hp: unit.hp, maxHp: unit.maxHp, growthPoints: unit.growthPoints ?? 0 })),
  };
}

export function verifyDeterminism(configs: SimulationConfig[]): string[] {
  const failures: string[] = [];
  for (const config of configs) {
    const first = simulateRun(config);
    const second = simulateRun(config);
    if (first.finalSignature !== second.finalSignature) failures.push(`${config.mode}/${config.difficulty} seed=${config.seed} 复跑结果不一致`);
  }
  return failures;
}

