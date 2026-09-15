/**
 * 成长远征模式 - 成长点系统
 * 管理成长点获取、上限、分配
 */
import type { Unit } from '../types';
import { SKILLS } from '../data/skills';

/** 属性提升上限 */
export const STAT_CAP_HP = 30;
export const STAT_CAP_SPD = 15;

/** 成本：属性提升 */
export const HP_COST = 2;
export const SPD_COST = 2;
/** 成本：解锁第3技能槽 */
export const SLOT3_COST = 5;
/** 成本：解锁第4技能槽 */
export const SLOT4_COST = 8;
/** 成本：解锁第5技能槽 */
export const SLOT5_COST = 10;
/** 成本：替换技能 */
export const REROLL_COST = 5;

// ─── 技能池分类 ───

/** 传奇技能池（仅奇遇关「传奇招募」可获得） */
export const LEGENDARY_SKILLS = new Set([
  'iron_domain', 'shield_quake', 'iron_double',
  'poison_mist', 'toxic_bite',
  'wind_flash', 'wind_feather', 'whirlwind', 'swift_strike',
  'tidal_domain', 'water_shot', 'wave',
  'burn_burst', 'flame_shield', 'flame_slash',
]);

/** Boss专属技能池（不可被玩家获得） */
export const BOSS_ONLY_SKILLS = new Set([
  'vine_whip', 'shadow_flurry', 'inferno', 'tidal_slam', 'quake', 'spore_burst',
  'soul_rend', 'dragon_breath', 'hellfire', 'revenge_thorn', 'group_taunt',
  'blood_fang', 'flame_pillar', 'wild_leaf', 'leaf_quake', 'boss_vine_shield',
  'poison_vine', 'entangle', 'claw_smash', 'wave_aura', 'water_cannon',
  'shell_up', 'rock_throw', 'gravel_throw', 'crystal_sting', 'rock_reforge',
  'shadow_rift', 'leech_bite', 'spore_summon', 'spore_shield', 'slime_cover',
  'iron_tail', 'dragon_claw', 'iron_wall',
  'chain_bind', 'chain_activate', 'chain_link',
  'ghostly_harvest', 'soul_echo', 'soul_share', 'ghost_burst', 'ghostly_summon',
  'claw_attack', 'growth_strike', 'growth_field', 'growth_burst',
]);

/** 普通技能池（解锁槽位/替换技能用）：排除Boss专属 + 传奇 + 造物 */
export function getNormalSkillPool(): string[] {
  return Object.keys(SKILLS).filter(
    (id) => !BOSS_ONLY_SKILLS.has(id) && !LEGENDARY_SKILLS.has(id),
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

  // 属性提升
  const hpBonus = unit.bonusStats?.hp ?? 0;
  const spdBonus = unit.bonusStats?.spd ?? 0;

  if (gp >= HP_COST && hpBonus < STAT_CAP_HP) {
    choices.push({ kind: 'hp', amount: 2 });
  }
  if (gp >= SPD_COST && spdBonus < STAT_CAP_SPD) {
    choices.push({ kind: 'spd', amount: 1 });
  }

  // 技能槽解锁
  const extraSlots = unit.extraSkillSlots ?? 0;
  if (extraSlots < 1 && gp >= SLOT3_COST) {
    choices.push({ kind: 'slot3' });
  }
  if (extraSlots < 2 && gp >= SLOT4_COST) {
    choices.push({ kind: 'slot4' });
  }
  if (extraSlots < 3 && gp >= SLOT5_COST) {
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

  // 技能槽解锁
  const extraSlots = unit.extraSkillSlots ?? 0;
  if (extraSlots < 1) {
    choices.push({ kind: 'slot3' });
  }
  if (extraSlots < 2) {
    choices.push({ kind: 'slot4' });
  }
  if (extraSlots < 3) {
    choices.push({ kind: 'slot5' });
  }

  // 技能替换
  choices.push({ kind: 'reroll' });

  return choices;
}

/** 成长选项所需点数 */
export function growthChoiceCost(choice: GrowthChoice): number {
  switch (choice.kind) {
    case 'hp': return HP_COST;
    case 'spd': return SPD_COST;
    case 'slot3': return SLOT3_COST;
    case 'slot4': return SLOT4_COST;
    case 'slot5': return SLOT5_COST;
    case 'reroll': return REROLL_COST;
  }
}

/** 不可变成长：返回新 Unit 或 null（失败） */
export function applyGrowthChoice(unit: Unit, choice: GrowthChoice): Unit | null {
  const gp = unit.growthPoints ?? 0;

  switch (choice.kind) {
    case 'hp': {
      if (gp < HP_COST) return null;
      const hpBonus = unit.bonusStats?.hp ?? 0;
      if (hpBonus >= STAT_CAP_HP) return null;
      return {
        ...unit,
        growthPoints: gp - HP_COST,
        bonusStats: { ...unit.bonusStats, hp: hpBonus + 2 },
        maxHp: unit.maxHp + 2,
        hp: unit.hp + 2,
      };
    }
    case 'spd': {
      if (gp < SPD_COST) return null;
      const spdBonus = unit.bonusStats?.spd ?? 0;
      if (spdBonus >= STAT_CAP_SPD) return null;
      return {
        ...unit,
        growthPoints: gp - SPD_COST,
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
