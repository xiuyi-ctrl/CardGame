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
