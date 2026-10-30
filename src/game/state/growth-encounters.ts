import type { GameState } from './game';
import type { Unit } from '../types';
import { DIFFICULTY_CONFIG, getMaxRoster, hashStr } from './game';
import { createRng, shuffle } from '../rng';
import { createBattle, makeUnit, updateUnitSkills } from '../core/battle';
import { getMonster } from '../data/monsters';
import { applyMasterEnhance, canMasterEnhance, getMaxSkillSlots, getNormalSkillPool, getSkillEnhanceMaxLevel, LEGENDARY_SKILLS, BLOCKED_SKILLS, STAT_CAP_HP, STAT_CAP_SPD } from '../core/growth';
import { restoreFormation } from './formation';

export type GrowthEncounterKind = 'train_core' | 'train_pair' | 'insight' | 'relearn' | 'transfer' | 'absorb' | 'recycle' | 'buy_stone' | 'master' | 'spring' | 'contract'
  | 'altar_hp' | 'altar_spd' | 'supply_heal' | 'supply_book' | 'companions' | 'duel' | 'trial' | 'grave' | 'revival_spring' | 'legend' | 'tools';
export interface GrowthEncounterPending { kind: GrowthEncounterKind; uid?: string; slot?: number; enemies?: Unit[] }
export type GrowthEncounterAction =
  | { type: 'GROWTH_ENCOUNTER_CANCEL' }
  | { type: 'GROWTH_ENCOUNTER_PREVIEW'; uid: string; slot?: number }
  | { type: 'GROWTH_ENCOUNTER_CONFIRM'; uid?: string; otherUid?: string; slot?: number; amount?: number; skillId?: string; speciesId?: string; share?: boolean };

export const GROWTH_ENCOUNTER_NAMES: Record<GrowthEncounterKind, string> = {
  train_core: '集中训练', train_pair: '双人训练', insight: '整理心得', relearn: '重新学习', transfer: '连接伙伴', absorb: '吸收水晶',
  recycle: '回收强化', buy_stone: '购买强化石', master: '大师传承', spring: '成长之泉', contract: '空白契约',
  altar_hp: '淬炼体魄', altar_spd: '磨炼身法', supply_heal: '疗伤补给', supply_book: '训练补给', companions: '同行契约', duel: '单人考核', trial: '协同试炼', grave: '回响墓园', revival_spring: '返魂之泉', legend: '传奇秘典', tools: '匠师工具箱',
};
export function encounterSkills(unit: Unit, legendary = false): string[] { return (legendary ? [...LEGENDARY_SKILLS].filter(id => !BLOCKED_SKILLS.has(id)) : getNormalSkillPool()).filter(id => !unit.skills.includes(id)); }
export function growthEncounterChoice(state: GameState, kind: GrowthEncounterKind) { return state.map.events[state.currentNodeId]?.choices.find(choice => choice.growthEncounter === kind); }
export function growthCompanionPoints(layer: number) { return layer <= 15 ? 4 : layer <= 30 ? 8 : 12; }
export function growthEncounterEligible(state: GameState, kind: GrowthEncounterKind): boolean {
  const units = state.roster.filter(unit => unit.hp > 0);
  if (kind === 'grave' || kind === 'revival_spring') return !!state.deadPets?.length;
  if (kind === 'altar_hp' || kind === 'altar_spd') return state.gold >= 30 && units.some(unit => kind === 'altar_hp' ? (unit.bonusStats?.hp ?? 0) + 2 <= STAT_CAP_HP : (unit.bonusStats?.spd ?? 0) + 1 <= STAT_CAP_SPD);
  if (kind === 'legend') return units.some(unit => encounterSkills(unit, true).length > 0);
  if (kind === 'companions') return !!growthEncounterChoice(state, kind)?.recruitCandidates?.length;
  if (kind === 'duel' || kind === 'trial') return units.length > 0 && !!growthEncounterChoice(state, kind)?.battleEnemies?.length;
  if (kind === 'tools') return units.some(unit => unit.skills.some((id, slot) => (unit.skillEnhancements?.[slot] ?? 0) > 0 || (unit.skillEnhancements?.[slot] ?? 0) < getSkillEnhanceMaxLevel(id)));
  if (kind === 'master') return (state.masterTransmissions ?? 0) < 2 && units.some(unit => unit.skills.some((_, slot) => canMasterEnhance(unit, slot)));
  if (kind === 'contract') return units.some(unit => unit.skills.length < 5 && unit.skills.length >= getMaxSkillSlots(unit) && encounterSkills(unit).length > 0);
  if (kind === 'relearn') return state.gold >= 20 && units.some(unit => unit.skills.length > 0 && encounterSkills(unit).length > 0);
  if (kind === 'recycle') return units.some(unit => unit.skills.some((_, slot) => (unit.skillEnhancements?.[slot] ?? 0) > 0 && (unit.skillEnhancePaid?.[slot] ?? 0) > 0));
  if (kind === 'buy_stone') return state.gold >= 30;
  if (kind === 'train_pair') return units.length >= 2;
  if (kind === 'transfer') return units.length >= 2 && units.some(unit => (unit.growthPoints ?? 0) > 0);
  return units.length > 0;
}
export function beginGrowthEncounter(state: GameState, kind: GrowthEncounterKind): GameState {
  if (state.runMode !== 'proficiency' || state.growthEncounterCompleted?.includes(state.currentNodeId) || !growthEncounterEligible(state, kind)) return state;
  const enemies = kind === 'duel' || kind === 'trial' ? createBattle([], growthEncounterChoice(state, kind)!.battleEnemies!, state.seed + hashStr(state.currentNodeId),
    { layer: state.currentLayer ?? 1, untameable: true, difficulty: state.difficulty, nodeType: kind === 'trial' ? 'elite' : 'battle' }).enemyUnits : undefined;
  return { ...state, growthEncounterPending: { kind, ...(enemies ? { enemies } : {}) } };
}
export function growthEncounterUnavailableReason(state: GameState, kind: GrowthEncounterKind): string {
  if (growthEncounterEligible(state, kind)) return '';
  if (kind === 'grave' || kind === 'revival_spring') return '没有死亡伙伴';
  if (kind === 'altar_hp' || kind === 'altar_spd') return state.gold < 30 ? '金币不足，需要30金币' : '没有未达该属性上限的伙伴';
  if (kind === 'legend') return '没有可学习的传奇技能';
  if (kind === 'tools') return '没有可普通强化或还原的技能';
  const alive = state.roster.filter(unit => unit.hp > 0);
  if (!alive.length && kind !== 'buy_stone') return '没有存活伙伴';
  if (kind === 'relearn') return state.gold < 20 ? '金币不足，需要20金币' : '没有合法替换技能';
  if (kind === 'buy_stone') return '金币不足，需要30金币';
  if (kind === 'train_pair' || kind === 'transfer' && alive.length < 2) return '需要至少2位不同的存活伙伴';
  if (kind === 'transfer') return '没有可转移的成长点';
  if (kind === 'recycle') return '没有记录实际付费投入的强化技能';
  if (kind === 'master') return (state.masterTransmissions ?? 0) >= 2 ? '本局已领取2次传承' : '没有可继续强化的技能';
  if (kind === 'contract') return '没有可解锁技能槽或合法新技能';
  return '当前条件不满足';
}
export function growthEncounterCacheKey(state: GameState, uid: string, slot: number): string {
  return `${state.currentNodeId}:${state.growthEncounterPending?.kind}:${uid}:${slot}`;
}
export function reduceGrowthEncounter(state: GameState, action: GrowthEncounterAction): GameState {
  const pending = state.growthEncounterPending;
  if (state.runMode !== 'proficiency' || !pending || !['event', 'special'].includes(state.screen) || state.growthEncounterCompleted?.includes(state.currentNodeId)) return state;
  if (action.type === 'GROWTH_ENCOUNTER_CANCEL') return { ...state, growthEncounterPending: undefined };
  if (action.type === 'GROWTH_ENCOUNTER_PREVIEW') {
    const unit = state.roster.find(unit => unit.uid === action.uid && unit.hp > 0);
    if (!unit || !['relearn', 'contract', 'legend'].includes(pending.kind)) return state;
    const slot = pending.kind === 'contract' || pending.kind === 'legend' && unit.skills.length < getMaxSkillSlots(unit) ? unit.skills.length : action.slot;
    if (slot === undefined || !Number.isInteger(slot) || slot < 0 || (pending.kind === 'relearn' && !unit.skills[slot]) ||
      (pending.kind === 'legend' && (unit.skills.length < getMaxSkillSlots(unit) ? slot !== unit.skills.length : !unit.skills[slot])) ||
      (pending.kind === 'contract' && (slot >= 5 || slot < getMaxSkillSlots(unit)))) return state;
    const key = growthEncounterCacheKey(state, unit.uid, slot);
    const choices = state.growthEncounterCandidates?.[key] ?? shuffle(createRng(state.seed + hashStr(key)), encounterSkills(unit, pending.kind === 'legend')).slice(0, 3);
    if (!choices.length) return state;
    return { ...state, growthEncounterPending: { ...pending, uid: unit.uid, slot }, growthEncounterCandidates: { ...state.growthEncounterCandidates, [key]: choices } };
  }
  const reviving = pending.kind === 'grave' || pending.kind === 'revival_spring';
  const unit = (reviving ? state.deadPets ?? [] : state.roster).find(unit => unit.uid === action.uid && (reviving || unit.hp > 0));
  const other = state.roster.find(unit => unit.uid === action.otherUid && unit.hp > 0 && unit.uid !== action.uid);
  if (!growthEncounterEligible(state, pending.kind)) return state;
  let roster = state.roster;
  let gold = state.gold;
  let inventory = state.inventory;
  let deadPets = state.deadPets;
  let overflow: Unit | undefined;
  let message = '';
  const gain = (uids: string[], amount: number) => {
    roster = roster.map(pet => uids.includes(pet.uid) ? { ...pet, growthPoints: (pet.growthPoints ?? 0) + amount } : pet);
    message = `${uids.map(uid => roster.find(pet => pet.uid === uid)!.name).join('、')} 获得${amount}成长点`;
  };
  if (pending.kind === 'duel' || pending.kind === 'trial') {
    const enemies = growthEncounterChoice(state, pending.kind)!.battleEnemies!;
    if (pending.kind === 'duel' && !unit) return state;
    const eventBattle = { growthTrial: pending.kind, enemies, reward: { kind: 'gold' as const, amount: pending.kind === 'trial' ? 20 : 0 }, penalty: {} };
    const options = { layer: state.currentLayer ?? 1, untameable: true, difficulty: state.difficulty, nodeType: pending.kind === 'trial' ? 'elite' : 'battle' };
    if (pending.kind === 'trial') return { ...state, eventBattle, growthEncounterPending: undefined, screen: 'formation', formation: {
      units: roster, initialField: state.lastFormation !== undefined ? restoreFormation(roster, state.lastFormation, 3) : roster.filter(unit => state.field.includes(unit.uid) && unit.hp > 0).slice(0, 3), encounter: enemies, nodeId: state.currentNodeId, forceAllUnits: false, options } };
    return { ...state, eventBattle, growthEncounterPending: undefined, screen: 'battle',
      growthEncounterCompleted: [...(state.growthEncounterCompleted ?? []), state.currentNodeId],
      battle: createBattle([{ ...unit!, row: 'front', column: 1 }], enemies, state.seed + hashStr(state.currentNodeId), options) };
  } else if (pending.kind === 'altar_hp' || pending.kind === 'altar_spd') {
    if (!unit || !growthEncounterEligible({ ...state, roster: [unit] }, pending.kind)) return state;
    const kind = pending.kind === 'altar_hp' ? 'hp' : 'spd';
    const hp = kind === 'hp' ? 2 : 0, spd = kind === 'spd' ? 1 : 0;
    roster = roster.map(pet => pet.uid === unit.uid ? { ...unit, maxHp: unit.maxHp + hp, hp: unit.hp + hp, spd: unit.spd + spd,
      bonusStats: { ...unit.bonusStats, hp: (unit.bonusStats?.hp ?? 0) + hp, spd: (unit.bonusStats?.spd ?? 0) + spd }, statGrowthPaid: unit.statGrowthPaid ?? 0 } : pet);
    gold -= 30; message = `${unit.name} ${kind === 'hp' ? '最大生命＋2' : '速度＋1'}，消耗30金币`;
  } else if (pending.kind === 'supply_heal' || pending.kind === 'supply_book' || pending.kind === 'tools') {
    const items = pending.kind === 'supply_heal' ? ['heal_potion_g'] : pending.kind === 'supply_book' ? ['book_medium'] : ['skill_enhance_stone', 'reset_stone'];
    inventory = { ...inventory };
    for (const id of items) inventory[id] = (inventory[id] ?? 0) + 1;
    message = pending.kind === 'tools' ? '获得技能强化石×1、还原石×1' : pending.kind === 'supply_heal' ? '获得治疗圣水×1' : '获得成长之书（中）×1';
  } else if (pending.kind === 'companions') {
    if (!action.speciesId || !growthEncounterChoice(state, pending.kind)?.recruitCandidates?.includes(action.speciesId)) return state;
    const pet = { ...makeUnit(action.speciesId, true, 0, false), growthPoints: growthCompanionPoints(state.currentLayer ?? 1) };
    if (roster.length < getMaxRoster(state.runMode)) roster = [...roster, pet]; else overflow = pet;
    message = `${pet.name} 加入，携带${pet.growthPoints}成长点`;
  } else if (reviving) {
    if (!unit || roster.some(pet => pet.uid === unit.uid) || state.tameOverflow?.some(pet => pet.uid === unit.uid)) return state;
    const pet = { ...unit, hp: pending.kind === 'grave' ? Math.max(1, Math.ceil(unit.maxHp / 2)) : unit.maxHp, shield: 0, statuses: [], skillUses: undefined, skillCooldowns: undefined, acted: false };
    if (pending.kind === 'revival_spring') roster = roster.map(pet => ({ ...pet, hp: Math.min(pet.maxHp, pet.hp + Math.ceil(pet.maxHp / 4)) }));
    if (roster.length < getMaxRoster(state.runMode)) roster = [...roster, pet]; else overflow = pet;
    deadPets = (deadPets ?? []).filter(dead => dead.uid !== unit.uid);
    message = `${pet.name} 复活，保留完整养成，生命${pet.hp}/${pet.maxHp}${pending.kind === 'revival_spring' ? '；其他伙伴恢复25%生命' : ''}`;
  } else if (['train_core', 'train_pair', 'insight', 'absorb', 'spring'].includes(pending.kind)) {
    if (!unit) return state;
    const pair = pending.kind === 'train_pair' || (pending.kind === 'spring' && action.share);
    if (pair && !other) return state;
    gain(pair ? [unit.uid, other!.uid] : [unit.uid], pending.kind === 'spring' ? pair ? 5 : 8 : pending.kind === 'train_core' ? 3 : pending.kind === 'train_pair' || pending.kind === 'absorb' ? 2 : 1);
  } else if (pending.kind === 'transfer') {
    if (!unit || !other || !Number.isInteger(action.amount) || action.amount! < 1 || action.amount! > Math.min(6, unit.growthPoints ?? 0)) return state;
    roster = roster.map(pet => pet.uid === unit.uid ? { ...pet, growthPoints: (pet.growthPoints ?? 0) - action.amount! } : pet.uid === other.uid ? { ...pet, growthPoints: (pet.growthPoints ?? 0) + action.amount! } : pet);
    message = `${unit.name} 向 ${other.name} 转移${action.amount}成长点，手续费0`;
  } else if (pending.kind === 'buy_stone') {
    gold -= 30;
    inventory = { ...inventory, skill_enhance_stone: (inventory.skill_enhance_stone ?? 0) + 1 };
    message = '消耗30金币，获得技能强化石×1';
  } else if (pending.kind === 'master') {
    if (!unit || action.slot === undefined) return state;
    const updated = applyMasterEnhance(unit, action.slot);
    if (!updated) return state;
    roster = roster.map(pet => pet.uid === unit.uid ? updated : pet);
    message = `${unit.name} 的技能强化至＋${updated.skillEnhancements![action.slot]}`;
  } else if (pending.kind === 'recycle') {
    const slot = action.slot;
    if (!unit || slot === undefined || (unit.skillEnhancements?.[slot] ?? 0) <= 0 || !(unit.skillEnhancePaid?.[slot]! > 0)) return state;
    const refund = unit.skillEnhancePaid![slot];
    const levels = { ...unit.skillEnhancements }, paid = { ...unit.skillEnhancePaid };
    delete levels[slot]; delete paid[slot];
    roster = roster.map(pet => pet.uid === unit.uid ? { ...pet, skillEnhancements: levels, skillEnhancePaid: paid, growthPoints: (pet.growthPoints ?? 0) + refund } : pet);
    message = `${unit.name} 技能强化归零，返还${refund}成长点`;
  } else {
    if (!unit || pending.uid !== unit.uid || pending.slot === undefined || (pending.kind === 'relearn' && action.slot !== pending.slot)) return state;
    const choices = state.growthEncounterCandidates?.[growthEncounterCacheKey(state, unit.uid, pending.slot)];
    if (!action.skillId || !choices?.includes(action.skillId) || unit.skills.includes(action.skillId)) return state;
    const skills = [...unit.skills], levels = { ...unit.skillEnhancements }, paid = { ...unit.skillEnhancePaid };
    if (pending.kind === 'relearn') { if (!skills[pending.slot]) return state; skills[pending.slot] = action.skillId; gold -= 20; }
    else if (pending.kind === 'legend') {
      if (pending.slot > skills.length || pending.slot === skills.length && pending.slot >= getMaxSkillSlots(unit) || action.slot !== pending.slot && pending.slot < skills.length) return state;
      if (pending.slot === skills.length) skills.push(action.skillId); else skills[pending.slot] = action.skillId;
    } else { if (pending.slot !== skills.length || pending.slot < getMaxSkillSlots(unit) || pending.slot >= 5) return state; skills.push(action.skillId); }
    delete levels[pending.slot]; delete paid[pending.slot];
    const updated = updateUnitSkills({ ...unit, extraSkillSlots: pending.kind === 'contract' ? Math.max((unit.extraSkillSlots ?? 0) + 1, skills.length - 2) : unit.extraSkillSlots, skillEnhancements: levels, skillEnhancePaid: paid }, skills);
    roster = roster.map(pet => pet.uid === unit.uid ? updated : pet);
    message = pending.kind === 'relearn' ? `${unit.name} 重新学习，消耗20金币` : pending.kind === 'legend' ? `${unit.name} 学会传奇技能` : `${unit.name} 免费解锁技能槽并学会技能`;
  }
  const returnToMap = ['supply_heal', 'supply_book', 'recycle', 'buy_stone'].includes(pending.kind);
  return { ...state, roster, gold, inventory, deadPets, screen: overflow ? 'tame-overflow' : returnToMap ? 'map' : 'growth-menu', growthEncounterPending: undefined,
    ...(overflow ? { tameOverflow: [...(state.tameOverflow ?? []), overflow], tameOverflowReturn: 'growth-menu' as const } : {}),
    masterTransmissions: (state.masterTransmissions ?? 0) + (pending.kind === 'master' ? 1 : 0),
    growthEncounterCompleted: [...(state.growthEncounterCompleted ?? []), state.currentNodeId],
    toast: { msg: message, kind: 'success' }, log: [message, ...state.log].slice(0, 20),
    runStats: state.runStats ? { ...state.runStats, goldSpent: state.runStats.goldSpent + state.gold - gold } : undefined };
}

/** 新版试炼与旧事件战斗隔离：真实阵亡，限定奖励只发一次。 */
export function resolveGrowthTrial(state: GameState): GameState {
  const battle = state.battle!, kind = state.eventBattle!.growthTrial!;
  const participants = [...battle.playerUnits, ...(battle.playerDown ?? [])];
  const deaths = state.roster.filter(unit => participants.some(pet => pet.uid === unit.uid && pet.hp <= 0));
  const won = battle.phase === 'won';
  const roster = state.roster.filter(unit => !deaths.includes(unit)).map(unit => {
    const current = participants.find(pet => pet.uid === unit.uid);
    if (!current) return unit;
    return { ...unit, hp: current.hp, maxHp: current.maxHp, spd: Math.max(1, current.spd - (current.mirrorSpdDelta ?? 0)), statuses: [],
      skills: getMonster(unit.speciesId).passive === 'myriad_forms' ? [] : current.skills, growthPoints: (unit.growthPoints ?? 0) + (won ? kind === 'duel' ? 6 : 3 : 0) };
  }).map(unit => won ? { ...unit, hp: Math.min(unit.maxHp, unit.hp + Math.round(unit.maxHp * DIFFICULTY_CONFIG[state.difficulty ?? 'normal'].healRatio)) } : unit);
  const gold = won && kind === 'trial' ? 20 : 0;
  const canContinue = roster.some(unit => unit.hp > 0) && (won || kind === 'duel');
  return { ...state, roster, field: state.field.filter(uid => roster.some(unit => unit.uid === uid)),
    deadPets: [...(state.deadPets ?? []), ...deaths.map(unit => ({ ...unit, hp: 0, shield: 0, statuses: [], skillUses: undefined, skillCooldowns: undefined, acted: false }))],
    battle: undefined, eventBattle: undefined, rewards: [], screen: canContinue ? won ? 'growth-menu' : 'map' : 'proficiency-result', proficiencyResult: canContinue ? undefined : 'lost',
    gold: state.gold + gold, runStats: state.runStats ? { ...state.runStats, battlesWon: state.runStats.battlesWon + Number(won), battlesLost: state.runStats.battlesLost + Number(!won),
      petsLost: state.runStats.petsLost + deaths.length, goldEarned: state.runStats.goldEarned + gold, lastBattleRound: 0 } : undefined,
    toast: { msg: won ? `试炼胜利！出战存活伙伴各获得${kind === 'duel' ? 6 : 3}成长点${gold ? '，获得20金币' : ''}` : canContinue ? '单人考核失败，出战伙伴阵亡；其他伙伴继续远征' : '试炼失败，远征结束', kind: won ? 'success' : 'error' } };
}
