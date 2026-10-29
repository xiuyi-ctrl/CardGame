import type { GameState } from './game';
import type { Unit } from '../types';
import { hashStr } from './game';
import { createRng, shuffle } from '../rng';
import { updateUnitSkills } from '../core/battle';
import { applyMasterEnhance, canMasterEnhance, getMaxSkillSlots, getNormalSkillPool } from '../core/growth';

export type GrowthEncounterKind = 'train_core' | 'train_pair' | 'insight' | 'relearn' | 'transfer' | 'absorb' | 'recycle' | 'buy_stone' | 'master' | 'spring' | 'contract';
export interface GrowthEncounterPending { kind: GrowthEncounterKind; uid?: string; slot?: number }
export type GrowthEncounterAction =
  | { type: 'GROWTH_ENCOUNTER_CANCEL' }
  | { type: 'GROWTH_ENCOUNTER_PREVIEW'; uid: string; slot?: number }
  | { type: 'GROWTH_ENCOUNTER_CONFIRM'; uid?: string; otherUid?: string; slot?: number; amount?: number; skillId?: string; share?: boolean };

export const GROWTH_ENCOUNTER_NAMES: Record<GrowthEncounterKind, string> = {
  train_core: '集中训练', train_pair: '双人训练', insight: '整理心得', relearn: '重新学习', transfer: '连接伙伴', absorb: '吸收水晶',
  recycle: '回收强化', buy_stone: '购买强化石', master: '大师传承', spring: '成长之泉', contract: '空白契约',
};
export function encounterSkills(unit: Unit): string[] { return getNormalSkillPool().filter(id => !unit.skills.includes(id)); }
export function growthEncounterEligible(state: GameState, kind: GrowthEncounterKind): boolean {
  const units = state.roster.filter(unit => unit.hp > 0);
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
  return { ...state, growthEncounterPending: { kind } };
}
export function growthEncounterUnavailableReason(state: GameState, kind: GrowthEncounterKind): string {
  if (growthEncounterEligible(state, kind)) return '';
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
    if (!unit || !['relearn', 'contract'].includes(pending.kind)) return state;
    const slot = pending.kind === 'contract' ? unit.skills.length : action.slot;
    if (slot === undefined || (pending.kind === 'relearn' && !unit.skills[slot]) ||
      (pending.kind === 'contract' && (slot >= 5 || slot < getMaxSkillSlots(unit)))) return state;
    const key = growthEncounterCacheKey(state, unit.uid, slot);
    const choices = state.growthEncounterCandidates?.[key] ?? shuffle(createRng(state.seed + hashStr(key)), encounterSkills(unit)).slice(0, 3);
    if (!choices.length) return state;
    return { ...state, growthEncounterPending: { ...pending, uid: unit.uid, slot }, growthEncounterCandidates: { ...state.growthEncounterCandidates, [key]: choices } };
  }
  const unit = state.roster.find(unit => unit.uid === action.uid && unit.hp > 0);
  const other = state.roster.find(unit => unit.uid === action.otherUid && unit.hp > 0 && unit.uid !== action.uid);
  if (!growthEncounterEligible(state, pending.kind)) return state;
  let roster = state.roster;
  let gold = state.gold;
  let inventory = state.inventory;
  let message = '';
  const gain = (uids: string[], amount: number) => {
    roster = roster.map(pet => uids.includes(pet.uid) ? { ...pet, growthPoints: (pet.growthPoints ?? 0) + amount } : pet);
    message = `${uids.map(uid => roster.find(pet => pet.uid === uid)!.name).join('、')} 获得${amount}成长点`;
  };
  if (['train_core', 'train_pair', 'insight', 'absorb', 'spring'].includes(pending.kind)) {
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
    else { if (pending.slot !== skills.length || pending.slot < getMaxSkillSlots(unit) || pending.slot >= 5) return state; skills.push(action.skillId); }
    delete levels[pending.slot]; delete paid[pending.slot];
    const updated = updateUnitSkills({ ...unit, extraSkillSlots: pending.kind === 'contract' ? Math.max((unit.extraSkillSlots ?? 0) + 1, skills.length - 2) : unit.extraSkillSlots, skillEnhancements: levels, skillEnhancePaid: paid }, skills);
    roster = roster.map(pet => pet.uid === unit.uid ? updated : pet);
    message = pending.kind === 'relearn' ? `${unit.name} 重新学习，消耗20金币` : `${unit.name} 免费解锁技能槽并学会技能`;
  }
  return { ...state, roster, gold, inventory, screen: 'growth-menu', growthEncounterPending: undefined,
    masterTransmissions: (state.masterTransmissions ?? 0) + (pending.kind === 'master' ? 1 : 0),
    growthEncounterCompleted: [...(state.growthEncounterCompleted ?? []), state.currentNodeId],
    toast: { msg: message, kind: 'success' }, log: [message, ...state.log].slice(0, 20),
    runStats: state.runStats ? { ...state.runStats, goldSpent: state.runStats.goldSpent + state.gold - gold } : undefined };
}
