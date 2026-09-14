/**
 * 成长远征模式 - 成长点系统
 * 管理成长点获取、上限、分配
 */
import type { Unit } from '../types';
import { SKILLS } from '../data/skills';

/** 属性提升上限 */
export const STAT_CAP_HP = 20;
export const STAT_CAP_SPD = 10;

/** 成本：解锁第3技能槽 */
export const SLOT3_COST = 2;
/** 成本：解锁第4技能槽 */
export const SLOT4_COST = 3;

/** 单只生物累计成长点上限 */
export const GROWTH_POINT_CAP = 10;

/** 成长点分配选项类型 */
export type GrowthChoice =
  | { kind: 'hp'; amount: number }
  | { kind: 'spd'; amount: number }
  | { kind: 'slot3' }
  | { kind: 'slot4' }
  | { kind: 'reroll' };

/** 获取可用的成长选项 */
export function getAvailableGrowthChoices(unit: Unit): GrowthChoice[] {
  const choices: GrowthChoice[] = [];
  const gp = unit.growthPoints ?? 0;

  // 属性提升
  const hpBonus = unit.bonusStats?.hp ?? 0;
  const spdBonus = unit.bonusStats?.spd ?? 0;

  if (gp >= 1 && hpBonus < STAT_CAP_HP) {
    choices.push({ kind: 'hp', amount: 2 });
  }
  if (gp >= 1 && spdBonus < STAT_CAP_SPD) {
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

  // 技能替换（始终可用，只要有点数）
  if (gp >= 1) {
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

  // 技能替换
  choices.push({ kind: 'reroll' });

  return choices;
}

/** 成长选项所需点数 */
export function growthChoiceCost(choice: GrowthChoice): number {
  switch (choice.kind) {
    case 'hp': return 1;
    case 'spd': return 1;
    case 'slot3': return SLOT3_COST;
    case 'slot4': return SLOT4_COST;
    case 'reroll': return 1;
  }
}

/** 不可变成长：返回新 Unit 或 null（失败） */
export function applyGrowthChoice(unit: Unit, choice: GrowthChoice): Unit | null {
  const gp = unit.growthPoints ?? 0;

  switch (choice.kind) {
    case 'hp': {
      if (gp < 1) return null;
      const hpBonus = unit.bonusStats?.hp ?? 0;
      if (hpBonus >= STAT_CAP_HP) return null;
      return {
        ...unit,
        growthPoints: gp - 1,
        bonusStats: { ...unit.bonusStats, hp: hpBonus + 2 },
        maxHp: unit.maxHp + 2,
        hp: unit.hp + 2,
      };
    }
    case 'spd': {
      if (gp < 1) return null;
      const spdBonus = unit.bonusStats?.spd ?? 0;
      if (spdBonus >= STAT_CAP_SPD) return null;
      return {
        ...unit,
        growthPoints: gp - 1,
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
    case 'reroll': {
      if (gp < 1) return null;
      return { ...unit, growthPoints: gp - 1 };
    }
    default:
      return null;
  }
}

/** 获取单位最大技能槽数（基础2 + 额外解锁） */
export function getMaxSkillSlots(unit: Unit): number {
  return 2 + (unit.extraSkillSlots ?? 0);
}

/** 从技能库随机选取 n 个不重复技能（排除已学技能） */
export function getRandomSkillChoices(unit: Unit, n: number, rng: () => number): string[] {
  const allIds = Object.keys(SKILLS);
  const owned = new Set(unit.skills);
  const candidates = allIds.filter((id) => !owned.has(id));
  const result: string[] = [];
  const pool = [...candidates];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    result.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return result;
}
