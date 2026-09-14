/**
 * 熟练度远征模式 - 专属奇遇关奖励池（8种）
 * 围绕熟练度成长设计
 */

/** 奖励类型 */
export type ProficiencySpecialKind =
  | 'proficiency_spring'  // 熟练之泉
  | 'growth_blessing'     // 成长之赐
  | 'stat_blessing'       // 属性之赐
  | 'skill_blessing'      // 技能之赐
  | 'legend_recruit'      // 传奇招募
  | 'gold_treasure'       // 金币宝藏
  | 'forget_blessing'     // 遗忘之赐
  | 'proficiency_crown';  // 熟练之冠

/** 奖励定义 */
export interface ProficiencySpecialReward {
  id: ProficiencySpecialKind;
  label: string;
  desc: string;
  emoji: string;
}

/** 所有奖励 */
export const PROFICIENCY_SPECIAL_REWARDS: Record<ProficiencySpecialKind, ProficiencySpecialReward> = {
  proficiency_spring: {
    id: 'proficiency_spring',
    label: '熟练之泉',
    desc: '全队获得 5 熟练度',
    emoji: '⛲',
  },
  growth_blessing: {
    id: 'growth_blessing',
    label: '成长之赐',
    desc: '选择 1 只宠物，获得 3 成长点',
    emoji: '🌟',
  },
  stat_blessing: {
    id: 'stat_blessing',
    label: '属性之赐',
    desc: '选择 1 只宠物，永久 +5 生命 或 +2 速度',
    emoji: '💪',
  },
  skill_blessing: {
    id: 'skill_blessing',
    label: '技能之赐',
    desc: '选择 1 只宠物，解锁第 4 技能槽（免费）',
    emoji: '🎯',
  },
  legend_recruit: {
    id: 'legend_recruit',
    label: '传奇招募',
    desc: '获得 1 只随机传奇生物（品阶 3）',
    emoji: '👑',
  },
  gold_treasure: {
    id: 'gold_treasure',
    label: '金币宝藏',
    desc: '获得 80 金币',
    emoji: '💎',
  },
  forget_blessing: {
    id: 'forget_blessing',
    label: '遗忘之赐',
    desc: '全队重置成长点（重新分配）',
    emoji: '🔄',
  },
  proficiency_crown: {
    id: 'proficiency_crown',
    label: '熟练之冠',
    desc: '选择 1 只宠物，直接升 1 级熟练度',
    emoji: '🏅',
  },
};

/** 所有奖励ID列表 */
export const PROFICIENCY_SPECIAL_IDS = Object.keys(PROFICIENCY_SPECIAL_REWARDS) as ProficiencySpecialKind[];

/** 获取奇遇关奖励（随机3种展示） */
export function getSpecialRewards(rng: () => number): ProficiencySpecialKind[] {
  const shuffled = [...PROFICIENCY_SPECIAL_IDS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 3);
}
