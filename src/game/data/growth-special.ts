/**
 * 成长远征模式 - 专属奇遇关奖励池（7种）
 * 围绕成长点设计（删除"熟练之冠"，替换为"技能之赐（大）"）
 */

export type GrowthSpecialKind =
  | 'growth_spring'
  | 'growth_blessing'
  | 'stat_blessing'
  | 'skill_blessing'
  | 'skill_blessing_large'
  | 'legend_recruit'
  | 'gold_treasure';

export interface GrowthSpecialReward {
  id: GrowthSpecialKind;
  label: string;
  desc: string;
  emoji: string;
}

export const GROWTH_SPECIAL_REWARDS: Record<GrowthSpecialKind, GrowthSpecialReward> = {
  growth_spring: {
    id: 'growth_spring',
    label: '成长之泉',
    desc: '全队各获得 2 成长点',
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
  skill_blessing_large: {
    id: 'skill_blessing_large',
    label: '技能之赐（大）',
    desc: '选择 1 只宠物，解锁第 5 技能槽（免费）',
    emoji: '🏅',
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
};

export const GROWTH_SPECIAL_IDS = Object.keys(GROWTH_SPECIAL_REWARDS) as GrowthSpecialKind[];

/** 获取奇遇关奖励（随机3种展示） */
export function getGrowthSpecialRewards(rng: () => number): GrowthSpecialKind[] {
  const shuffled = [...GROWTH_SPECIAL_IDS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 3);
}
