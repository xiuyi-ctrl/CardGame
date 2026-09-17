/**
 * 成长远征模式 - 成长点系统
 * 管理成长点获取、上限、分配
 */
import type { Unit } from '../types';
import { SKILLS } from '../data/skills';

/** 属性提升上限 */
export const STAT_CAP_HP = 30;
export const STAT_CAP_SPD = 15;

/** HP 递增消耗表（15 次升级到 +30） */
const HP_COST_TABLE = [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 10];
/** SPD 递增消耗表（15 次升级到 +15） */
const SPD_COST_TABLE = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5];

/** 根据已升级次数返回 HP 下次消耗 */
export function getHpCost(hpBonus: number): number {
  const idx = Math.floor(hpBonus / 2);
  return idx < HP_COST_TABLE.length ? HP_COST_TABLE[idx] : HP_COST_TABLE[HP_COST_TABLE.length - 1];
}

/** 根据已升级次数返回 SPD 下次消耗 */
export function getSpdCost(spdBonus: number): number {
  const idx = spdBonus;
  return idx < SPD_COST_TABLE.length ? SPD_COST_TABLE[idx] : SPD_COST_TABLE[SPD_COST_TABLE.length - 1];
}

/** 成本：解锁第3技能槽 */
export const SLOT3_COST = 5;
/** 成本：解锁第4技能槽 */
export const SLOT4_COST = 8;
/** 成本：解锁第5技能槽 */
export const SLOT5_COST = 10;
/** 成本：替换技能 */
export const REROLL_COST = 8;

// ─── 技能强化系统 ───

/** 强化基础消耗表 */
export const ENHANCE_COST_TABLE = [8, 10, 12];
/** 传奇技能强化消耗倍率 */
export const LEGENDARY_ENHANCE_MULTIPLIER = 1.5;
/** 强化重置返还比例 */
export const ENHANCE_RESET_REFUND_RATIO = 0.5;

/** 判断技能是否为连击类（hits ≥ 2） */
function isMultiHitSkill(skillId: string): boolean {
  const sk = SKILLS[skillId];
  return sk ? (sk.hits ?? 0) >= 2 : false;
}

/** 判断技能是否为速度增益类（buff 且 effect 为 atkUp 用于速度提升） */
function isSpeedBuffSkill(skillId: string): boolean {
  const sk = SKILLS[skillId];
  if (!sk || sk.kind !== 'buff' || !sk.effects) return false;
  // 速度增益技能通常有 atkUp 效果，但这里用特殊标记检查
  // 风羽（wind_feather）是唯一的速度增益技能
  return skillId === 'wind_feather';
}

/** 获取技能最大强化等级（连击/速度类最多2次，其他最多3次） */
export function getSkillEnhanceMaxLevel(skillId: string): number {
  if (isMultiHitSkill(skillId) || isSpeedBuffSkill(skillId)) return 2;
  return 3;
}

/** 获取技能当前强化等级 */
export function getSkillEnhanceLevel(unit: Unit, slotIndex: number): number {
  return unit.skillEnhancements?.[slotIndex] ?? 0;
}

/** 获取技能强化下一级消耗（含传奇倍率，已取整） */
export function getSkillEnhanceCost(unit: Unit, slotIndex: number): number {
  const level = getSkillEnhanceLevel(unit, slotIndex);
  const skillId = unit.skills[slotIndex];
  if (!skillId || level >= getSkillEnhanceMaxLevel(skillId)) return Infinity;
  const base = ENHANCE_COST_TABLE[level] ?? ENHANCE_COST_TABLE[ENHANCE_COST_TABLE.length - 1];
  const sk = SKILLS[skillId];
  const isLegendary = sk && LEGENDARY_SKILLS.has(skillId);
  return isLegendary ? Math.ceil(base * LEGENDARY_ENHANCE_MULTIPLIER) : base;
}

/** 获取技能强化累计消耗（0→level 的总消耗） */
export function getSkillEnhanceTotalCost(skillId: string, level: number): number {
  const sk = SKILLS[skillId];
  const isLegendary = sk && LEGENDARY_SKILLS.has(skillId);
  let total = 0;
  for (let i = 0; i < level && i < ENHANCE_COST_TABLE.length; i++) {
    const base = ENHANCE_COST_TABLE[i];
    total += isLegendary ? Math.ceil(base * LEGENDARY_ENHANCE_MULTIPLIER) : base;
  }
  return total;
}

/** 获取技能强化的伤害/治疗/buff 加成 */
export function getSkillEnhanceBonus(skillId: string, level: number): {
  damageBonus: number;
  healBonus: number;
  hitsBonus: number;
  effectBonus: number;
} {
  if (level <= 0) return { damageBonus: 0, healBonus: 0, hitsBonus: 0, effectBonus: 0 };
  const sk = SKILLS[skillId];
  if (!sk) return { damageBonus: 0, healBonus: 0, hitsBonus: 0, effectBonus: 0 };

  // 连击类有 effects（铁壁双击/火焰连击/炼狱烈焰/龙息）：段数+1，效果值也加
  if (isMultiHitSkill(skillId) && sk.effects && sk.effects.length > 0) {
    const isShield = sk.effects.some(e => e.kind === 'shield');
    const effectBonus = isShield ? level * 2 : level;
    return { damageBonus: 0, healBonus: 0, hitsBonus: level, effectBonus };
  }

  // 连击类无 effects：段数+1
  if (isMultiHitSkill(skillId)) {
    return { damageBonus: 0, healBonus: 0, hitsBonus: level, effectBonus: 0 };
  }

  // 攻击+状态混合：伤害+1 且 效果值+1/级（火花/铁刺/毒刺等，必须在纯攻击之前）
  if (sk.kind === 'attack' && sk.effects && sk.effects.length > 0) {
    return { damageBonus: level, healBonus: 0, hitsBonus: 0, effectBonus: level };
  }

  // 攻击+治疗混合：伤害+1 且 治疗+1/级
  if (sk.kind === 'attack' && sk.heal) {
    return { damageBonus: level, healBonus: level, hitsBonus: 0, effectBonus: 0 };
  }

  // 纯攻击：伤害+2/级
  if (sk.kind === 'attack') {
    return { damageBonus: level * 2, healBonus: 0, hitsBonus: 0, effectBonus: 0 };
  }

  // 纯治疗：治疗+2/级；有附带效果时效果值+1/级（如潮汐领域的水幕）
  if (sk.kind === 'heal') {
    const effectBonus = (sk.effects && sk.effects.length > 0) ? level : 0;
    return { damageBonus: 0, healBonus: level * 2, hitsBonus: 0, effectBonus };
  }

  // Buff 类：效果值+1/级（护盾类每级+2）；有 heal 字段时治疗+1/级
  if (sk.kind === 'buff') {
    const isShield = sk.effects?.some(e => e.kind === 'shield');
    const effectBonusPerLevel = isShield ? 2 : 1;
    const healBonus = sk.heal ? level : 0;
    return { damageBonus: 0, healBonus, hitsBonus: 0, effectBonus: level * effectBonusPerLevel };
  }

  // 状态技能：效果值+1/级
  if (sk.kind === 'status') {
    return { damageBonus: 0, healBonus: 0, hitsBonus: 0, effectBonus: level };
  }

  return { damageBonus: 0, healBonus: 0, hitsBonus: 0, effectBonus: 0 };
}

/** 应用技能强化（不可变） */
export function applySkillEnhance(unit: Unit, slotIndex: number): Unit | null {
  const gp = unit.growthPoints ?? 0;
  const cost = getSkillEnhanceCost(unit, slotIndex);
  if (gp < cost || cost === Infinity) return null;

  const level = getSkillEnhanceLevel(unit, slotIndex);
  const maxLevel = getSkillEnhanceMaxLevel(unit.skills[slotIndex]);
  if (level >= maxLevel) return null;

  const newEnhancements = { ...unit.skillEnhancements, [slotIndex]: level + 1 };
  return {
    ...unit,
    growthPoints: gp - cost,
    skillEnhancements: newEnhancements,
  };
}

/** 重置技能强化（不可变），返回 { newUnit, refundPoints } */
export function applySkillEnhanceReset(unit: Unit, slotIndex: number): { newUnit: Unit; refundPoints: number } | null {
  const level = getSkillEnhanceLevel(unit, slotIndex);
  if (level <= 0) return null;

  const skillId = unit.skills[slotIndex];
  const totalCost = getSkillEnhanceTotalCost(skillId, level);
  const refundPoints = Math.ceil(totalCost * ENHANCE_RESET_REFUND_RATIO);

  const newEnhancements = { ...unit.skillEnhancements };
  delete newEnhancements[slotIndex];

  return {
    newUnit: {
      ...unit,
      growthPoints: (unit.growthPoints ?? 0) + refundPoints,
      skillEnhancements: newEnhancements,
    },
    refundPoints,
  };
}

// ─── 技能池分类 ───

/** 传奇技能池（仅奇遇关「传奇招募」可获得） */
export const LEGENDARY_SKILLS = new Set([
  // 原传奇宠物技能
  'iron_domain', 'iron_double',
  'poison_mist', 'toxic_bite',
  'wind_flash',
  'tidal_domain',
  'burn_burst', 'flame_shield', 'flame_slash',
  // Boss技能（高强度）
  'inferno', 'soul_rend', 'dragon_breath', 'hellfire',
  'dragon_claw', 'iron_tail',   'boss_vine_shield',
  // 新增Boss技能
  'leaf_quake', 'wild_leaf', 'quake', 'shadow_rift',
  'flame_burst', 'flame_pillar', 'spore_burst', 'spore_shield',
  'ghostly_harvest', 'iron_wall',
  // 恐惧技能
  'fear_gaze', 'hell_scream', 'fear_burst',
]);

/** 不出现在任何技能池中的技能（Boss专属，玩家不可获取） */
export const BLOCKED_SKILLS = new Set([
  'shell_up', 'rock_reforge', 'spore_summon', 'ghostly_summon',
  'soul_share', 'chain_bind', 'chain_activate', 'chain_link',
  'growth_bind', 'growth_roar', 'growth_ultimate', 'growth_impact', 'growth_eruption', 'growth_summon',
  'puppet_bind', 'puppet_fist', 'puppet_soul_return',
]);

/** 普通技能池（解锁槽位/替换技能用）：排除传奇技能 + 不可获取技能 */
export function getNormalSkillPool(): string[] {
  return Object.keys(SKILLS).filter(
    (id) => !LEGENDARY_SKILLS.has(id) && !BLOCKED_SKILLS.has(id),
  );
}

/** 成长点分配选项类型 */
export type GrowthChoice =
  | { kind: 'hp'; amount: number }
  | { kind: 'spd'; amount: number }
  | { kind: 'slot3' }
  | { kind: 'slot4' }
  | { kind: 'slot5' }
  | { kind: 'reroll' };

/** 获取可用的成长选项 */
export function getAvailableGrowthChoices(unit: Unit): GrowthChoice[] {
  const choices: GrowthChoice[] = [];
  const gp = unit.growthPoints ?? 0;

  // 属性提升（递增消耗）
  const hpBonus = unit.bonusStats?.hp ?? 0;
  const spdBonus = unit.bonusStats?.spd ?? 0;

  if (hpBonus < STAT_CAP_HP && gp >= getHpCost(hpBonus)) {
    choices.push({ kind: 'hp', amount: 2 });
  }
  if (spdBonus < STAT_CAP_SPD && gp >= getSpdCost(spdBonus)) {
    choices.push({ kind: 'spd', amount: 1 });
  }

  // 技能槽解锁（必须按顺序：slot3 → slot4 → slot5）
  const extraSlots = unit.extraSkillSlots ?? 0;
  if (extraSlots < 1 && gp >= SLOT3_COST) {
    choices.push({ kind: 'slot3' });
  }
  if (extraSlots >= 1 && extraSlots < 2 && gp >= SLOT4_COST) {
    choices.push({ kind: 'slot4' });
  }
  if (extraSlots >= 2 && extraSlots < 3 && gp >= SLOT5_COST) {
    choices.push({ kind: 'slot5' });
  }

  // 技能替换
  if (gp >= REROLL_COST) {
    choices.push({ kind: 'reroll' });
  }

  return choices;
}

/** 获取全部成长选项（含点数不够的，供 UI 置灰显示） */
export function getAllGrowthChoices(unit: Unit): GrowthChoice[] {
  const choices: GrowthChoice[] = [];

  // 属性提升
  const hpBonus = unit.bonusStats?.hp ?? 0;
  const spdBonus = unit.bonusStats?.spd ?? 0;

  if (hpBonus < STAT_CAP_HP) {
    choices.push({ kind: 'hp', amount: 2 });
  }
  if (spdBonus < STAT_CAP_SPD) {
    choices.push({ kind: 'spd', amount: 1 });
  }

  // 技能槽解锁（必须按顺序：slot3 → slot4 → slot5）
  const extraSlots = unit.extraSkillSlots ?? 0;
  if (extraSlots < 1) {
    choices.push({ kind: 'slot3' });
  }
  if (extraSlots >= 1 && extraSlots < 2) {
    choices.push({ kind: 'slot4' });
  }
  if (extraSlots >= 2 && extraSlots < 3) {
    choices.push({ kind: 'slot5' });
  }

  // 技能替换
  choices.push({ kind: 'reroll' });

  return choices;
}

/** 成长选项所需点数 */
export function growthChoiceCost(choice: GrowthChoice, hpBonus: number, spdBonus: number): number {
  switch (choice.kind) {
    case 'hp': return getHpCost(hpBonus);
    case 'spd': return getSpdCost(spdBonus);
    case 'slot3': return SLOT3_COST;
    case 'slot4': return SLOT4_COST;
    case 'slot5': return SLOT5_COST;
    case 'reroll': return REROLL_COST;
  }
}

/** 不可变成长：返回新 Unit 或 null（失败） */
export function applyGrowthChoice(unit: Unit, choice: GrowthChoice): Unit | null {
  const gp = unit.growthPoints ?? 0;
  const hpBonus = unit.bonusStats?.hp ?? 0;
  const spdBonus = unit.bonusStats?.spd ?? 0;

  switch (choice.kind) {
    case 'hp': {
      const cost = getHpCost(hpBonus);
      if (gp < cost || hpBonus >= STAT_CAP_HP) return null;
      return {
        ...unit,
        growthPoints: gp - cost,
        bonusStats: { ...unit.bonusStats, hp: hpBonus + 2 },
        maxHp: unit.maxHp + 2,
        hp: unit.hp + 2,
      };
    }
    case 'spd': {
      const cost = getSpdCost(spdBonus);
      if (gp < cost || spdBonus >= STAT_CAP_SPD) return null;
      return {
        ...unit,
        growthPoints: gp - cost,
        bonusStats: { ...unit.bonusStats, spd: spdBonus + 1 },
        spd: unit.spd + 1,
      };
    }
    case 'slot3': {
      if (gp < SLOT3_COST) return null;
      const extraSlots = unit.extraSkillSlots ?? 0;
      if (extraSlots >= 1) return null;
      return { ...unit, growthPoints: gp - SLOT3_COST, extraSkillSlots: 1 };
    }
    case 'slot4': {
      if (gp < SLOT4_COST) return null;
      const extraSlots = unit.extraSkillSlots ?? 0;
      if (extraSlots >= 2) return null;
      return { ...unit, growthPoints: gp - SLOT4_COST, extraSkillSlots: extraSlots + 1 };
    }
    case 'slot5': {
      if (gp < SLOT5_COST) return null;
      const extraSlots = unit.extraSkillSlots ?? 0;
      if (extraSlots >= 3) return null;
      return { ...unit, growthPoints: gp - SLOT5_COST, extraSkillSlots: extraSlots + 1 };
    }
    case 'reroll': {
      if (gp < REROLL_COST) return null;
      return { ...unit, growthPoints: gp - REROLL_COST };
    }
    default:
      return null;
  }
}

/** 获取单位最大技能槽数（基础2 + 额外解锁，最多5） */
export function getMaxSkillSlots(unit: Unit): number {
  return 2 + Math.min(unit.extraSkillSlots ?? 0, 3);
}

/** 从普通技能库随机选取 n 个不重复技能（排除已学、Boss专属、传奇技能） */
export function getRandomSkillChoices(unit: Unit, n: number, rng: () => number): string[] {
  const owned = new Set(unit.skills);
  const candidates = getNormalSkillPool().filter((id) => !owned.has(id));
  const result: string[] = [];
  const pool = [...candidates];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    result.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return result;
}

/** 从传奇技能库随机选取 n 个不重复技能（排除已学技能） */
export function getRandomLegendarySkillChoices(unit: Unit, n: number, rng: () => number): string[] {
  const owned = new Set(unit.skills);
  const candidates = [...LEGENDARY_SKILLS].filter((id) => !owned.has(id));
  const result: string[] = [];
  const pool = [...candidates];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    result.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return result;
}
