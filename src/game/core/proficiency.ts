/**
 * 熟练度远征模式 - 熟练度系统
 * 管理熟练度获取、等级计算、成长点分配
 */
import type { Unit } from '../types';

/** 熟练度等级表：升级所需熟练度 */
export const PROFICIENCY_LEVEL_TABLE: readonly number[] = [
  0,  // Lv.0 (初始)
  1,  // Lv.1
  2,  // Lv.2
  3,  // Lv.3
  4,  // Lv.4
  5,  // Lv.5
  6,  // Lv.6
  7,  // Lv.7
  8,  // Lv.8
  9,  // Lv.9
  10, // Lv.10
];

/** 熟练度上限 */
export const PROFICIENCY_MAX = 55;

/** 等级上限 */
export const PROFICIENCY_LEVEL_MAX = 10;

/** 属性提升上限 */
export const STAT_CAP_HP = 20;
export const STAT_CAP_SPD = 10;

/** 成本：解锁第4技能槽 */
export const SLOT4_COST = 2;
/** 成本：解锁第5技能槽 */
export const SLOT5_COST = 3;

/** 计算熟练度等级（给定当前熟练度值） */
export function getProficiencyLevel(prof: number): number {
  let level = 0;
  let cumulative = 0;
  for (let i = 1; i <= PROFICIENCY_LEVEL_MAX; i++) {
    cumulative += PROFICIENCY_LEVEL_TABLE[i];
    if (prof >= cumulative) {
      level = i;
    } else {
      break;
    }
  }
  return level;
}

/** 获取当前等级升级所需熟练度（已满级返回 Infinity） */
export function getProficiencyToNextLevel(prof: number): number {
  const level = getProficiencyLevel(prof);
  if (level >= PROFICIENCY_LEVEL_MAX) return Infinity;
  let cumulative = 0;
  for (let i = 1; i <= level + 1; i++) {
    cumulative += PROFICIENCY_LEVEL_TABLE[i];
  }
  return cumulative - prof;
}

/** 给单位增加熟练度，返回实际增加量和是否升级 */
export function addProficiency(unit: Unit, amount: number): { gained: number; leveledUp: boolean; newLevel: number } {
  const oldProf = unit.proficiency ?? 0;
  const oldLevel = getProficiencyLevel(oldProf);
  const newProf = Math.min(oldProf + amount, PROFICIENCY_MAX);
  unit.proficiency = newProf;
  const newLevel = getProficiencyLevel(newProf);
  return {
    gained: newProf - oldProf,
    leveledUp: newLevel > oldLevel,
    newLevel,
  };
}

/** 将熟练度转换为等级（用于UI显示） */
export function proficiencyDisplay(prof: number): { level: number; current: number; toNext: number } {
  const level = getProficiencyLevel(prof);
  const toNext = getProficiencyToNextLevel(prof);
  const prevCumulative = level === 0 ? 0 : PROFICIENCY_LEVEL_TABLE.slice(1, level + 1).reduce((a, b) => a + b, 0);
  return {
    level,
    current: prof - prevCumulative,
    toNext: toNext === Infinity ? 0 : toNext,
  };
}

/** 成长点分配选项类型 */
export type GrowthChoice =
  | { kind: 'hp'; amount: number }
  | { kind: 'spd'; amount: number }
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

  if (gp >= 1 && hpBonus < STAT_CAP_HP) {
    choices.push({ kind: 'hp', amount: 2 });
  }
  if (gp >= 1 && spdBonus < STAT_CAP_SPD) {
    choices.push({ kind: 'spd', amount: 1 });
  }

  // 技能槽解锁
  const extraSlots = unit.extraSkillSlots ?? 0;
  if (extraSlots < 1 && gp >= SLOT4_COST) {
    choices.push({ kind: 'slot4' });
  }
  if (extraSlots < 2 && gp >= SLOT5_COST) {
    choices.push({ kind: 'slot5' });
  }

  // 技能替换（始终可用，只要有点数）
  if (gp >= 1) {
    choices.push({ kind: 'reroll' });
  }

  return choices;
}

/** 执行成长点分配 */
export function applyGrowthChoice(unit: Unit, choice: GrowthChoice): boolean {
  const gp = unit.growthPoints ?? 0;

  switch (choice.kind) {
    case 'hp': {
      if (gp < 1) return false;
      const hpBonus = unit.bonusStats?.hp ?? 0;
      if (hpBonus >= STAT_CAP_HP) return false;
      unit.growthPoints = gp - 1;
      unit.bonusStats = { ...unit.bonusStats, hp: hpBonus + 2 };
      unit.maxHp += 2;
      unit.hp += 2;
      return true;
    }
    case 'spd': {
      if (gp < 1) return false;
      const spdBonus = unit.bonusStats?.spd ?? 0;
      if (spdBonus >= STAT_CAP_SPD) return false;
      unit.growthPoints = gp - 1;
      unit.bonusStats = { ...unit.bonusStats, spd: spdBonus + 1 };
      unit.spd += 1;
      return true;
    }
    case 'slot4': {
      if (gp < SLOT4_COST) return false;
      const extraSlots = unit.extraSkillSlots ?? 0;
      if (extraSlots >= 1) return false;
      unit.growthPoints = gp - SLOT4_COST;
      unit.extraSkillSlots = 1;
      return true;
    }
    case 'slot5': {
      if (gp < SLOT5_COST) return false;
      const extraSlots = unit.extraSkillSlots ?? 0;
      if (extraSlots >= 2) return false;
      unit.growthPoints = gp - SLOT5_COST;
      unit.extraSkillSlots = extraSlots + 1;
      return true;
    }
    case 'reroll': {
      if (gp < 1) return false;
      unit.growthPoints = gp - 1;
      return true;
    }
    default:
      return false;
  }
}

/** 获取单位最大技能槽数（基础3 + 额外解锁） */
export function getMaxSkillSlots(unit: Unit): number {
  return 3 + (unit.extraSkillSlots ?? 0);
}

/** 战斗结束时结算熟练度奖励（加快获取） */
export function settleBattleProficiency(
  units: Unit[],
): { uid: string; gained: number; leveledUp: boolean; newLevel: number }[] {
  const results: { uid: string; gained: number; leveledUp: boolean; newLevel: number }[] = [];

  for (const u of units) {
    if (!u.isPlayer) continue;
    let totalGain = 0;

    // 参与战斗 +2
    totalGain += 2;

    // 存活奖励 +2
    if (u.hp > 0) {
      totalGain += 2;
    }

    if (totalGain > 0) {
      const result = addProficiency(u, totalGain);
      results.push({ uid: u.uid, ...result });
    }
  }

  return results;
}

/** 击杀奖励熟练度（翻倍） */
export function getKillProficiency(isElite: boolean, isBoss: boolean): number {
  if (isBoss) return 6;
  if (isElite) return 4;
  return 2;
}
