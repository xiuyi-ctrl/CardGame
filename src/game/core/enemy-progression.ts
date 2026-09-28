/**
 * 熟练度远征：敌人技能强化与替换（全确定性，无随机）
 *
 * 每 10 层一档（ENEMY_SKILL_TIERS），三个维度联动：
 * - enhanceCount: 强化技能数（从 slot 0 起前 N 个槽位写入 skillEnhancements）
 * - enhanceLevel: 技能强化等级（受 getSkillEnhanceMaxLevel 封顶）
 * - replaceCount: 替换技能数（从列表头部起，对前 R 个存在映射的技能替换为高阶版）
 *
 * 精英节点（nodeType==='elite'）额外 强化技能数+1、强化等级+1（均封顶）。
 * 仅 rank < 4 的普通敌人参与（Boss 本体与小怪完全不参与，与层数 HP 缩放同门槛）。
 */
import type { Unit } from '../types';
import { getSkillEnhanceMaxLevel } from './growth';
import { updateUnitSkills } from './battle';

export interface EnemySkillTier {
  minLayer: number;
  enhanceCount: number;
  enhanceLevel: number;
  replaceCount: number;
}

/** 分档表：每 10 层调整一次（第 1 档为 1~10 层） */
export const ENEMY_SKILL_TIERS: EnemySkillTier[] = [
  { minLayer: 1, enhanceCount: 0, enhanceLevel: 0, replaceCount: 0 },
  { minLayer: 11, enhanceCount: 1, enhanceLevel: 1, replaceCount: 0 },
  { minLayer: 21, enhanceCount: 1, enhanceLevel: 2, replaceCount: 1 },
  { minLayer: 31, enhanceCount: 2, enhanceLevel: 2, replaceCount: 1 },
  { minLayer: 41, enhanceCount: 2, enhanceLevel: 3, replaceCount: 2 },
];

/** 技能替换映射：同主题低阶 → 高阶（无映射的技能跳过） */
export const SKILL_UPGRADES: Record<string, string> = {
  punch: 'claw_smash',
  aqua_shot: 'water_cannon',
  ember: 'burn_burst',
  double_hit: 'shadow_flurry',
  steel_spike: 'shield_quake',
  bite: 'toxic_bite',
  weaken: 'vine_whip',
  provoke: 'group_taunt',
  water_bath: 'water_wave',
  shield_skill: 'iron_wall',
  water_gun: 'water_shot',
  flame_combo: 'inferno',
  shadow_strike: 'soul_rend',
  poison_sting: 'spore_burst',
};

/** 取层数所属档位 */
export function getEnemySkillTier(layer: number): EnemySkillTier {
  let tier = ENEMY_SKILL_TIERS[0];
  for (const t of ENEMY_SKILL_TIERS) {
    if (layer >= t.minLayer) tier = t;
  }
  return tier;
}

/**
 * 按层数档位应用敌人技能强化与替换。
 * 替换先于强化执行：被替换的技能同时享受强化。
 */
export function applyEnemySkillProgression(unit: Unit, layer: number, elite = false): Unit {
  const tier = getEnemySkillTier(layer);
  const enhanceCount = tier.enhanceCount + (elite ? 1 : 0);
  const enhanceLevel = tier.enhanceLevel + (elite ? 1 : 0);
  if (enhanceCount <= 0 && tier.replaceCount <= 0) return unit;

  // 1. 技能替换：从列表头部起，对前 replaceCount 个存在映射的技能替换
  let skills = unit.skills;
  if (tier.replaceCount > 0) {
    skills = [...unit.skills];
    let replaced = 0;
    for (let i = 0; i < skills.length && replaced < tier.replaceCount; i++) {
      const upgraded = SKILL_UPGRADES[skills[i]];
      if (upgraded) {
        skills[i] = upgraded;
        replaced++;
      }
    }
  }
  const skillChanged = skills !== unit.skills;
  let next = skillChanged ? updateUnitSkills(unit, skills) : unit;

  // 2. 技能强化：从 slot 0 起前 enhanceCount 个槽位，等级按每技能上限封顶
  if (enhanceLevel > 0) {
    const enhancements: Record<number, number> = {};
    const count = Math.min(enhanceCount, next.skills.length);
    for (let i = 0; i < count; i++) {
      const level = Math.min(enhanceLevel, getSkillEnhanceMaxLevel(next.skills[i]));
      if (level > 0) enhancements[i] = level;
    }
    next = { ...next, skillEnhancements: Object.keys(enhancements).length > 0 ? enhancements : undefined };
  }
  return next;
}
