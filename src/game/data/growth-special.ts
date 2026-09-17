/**
 * 成长远征模式 - 专属奇遇关奖励池（6种）
 * 围绕成长点设计
 */

export type GrowthSpecialKind =
  | 'growth_blessing'
  | 'stat_blessing'
  | 'skill_blessing'
  | 'legend_recruit'
  | 'gold_treasure'
  | 'revive';

export interface GrowthSpecialReward {
  id: GrowthSpecialKind;
  label: string;
  desc: string;
  emoji: string;
}

export const GROWTH_SPECIAL_REWARDS: Record<GrowthSpecialKind, GrowthSpecialReward> = {
  growth_blessing: {
    id: 'growth_blessing',
    label: '成长之赐',
    desc: '全队各获得 5 成长点',
    emoji: '🌟',
  },
  stat_blessing: {
    id: 'stat_blessing',
    label: '属性之赐',
    desc: '选择 1 只宠物，永久 +5 生命 或 +2 速度（不计入属性提升上限）',
    emoji: '💪',
  },
  skill_blessing: {
    id: 'skill_blessing',
    label: '技能之赐',
    desc: '选择 1 只宠物，解锁所有技能槽（免费）',
    emoji: '🎯',
  },
  legend_recruit: {
    id: 'legend_recruit',
    label: '传奇招募',
    desc: '获得 1 个随机传奇技能',
    emoji: '👑',
  },
  gold_treasure: {
    id: 'gold_treasure',
    label: '金币宝藏',
    desc: '获得 80 金币',
    emoji: '💎',
  },
  revive: {
    id: 'revive',
    label: '生命之泉',
    desc: '复活 1 只死亡宠物（保留 100% 属性）',
    emoji: '💖',
  },
};

export const GROWTH_SPECIAL_IDS = Object.keys(GROWTH_SPECIAL_REWARDS) as GrowthSpecialKind[];

/** 获取奇遇关奖励（随机3种展示，若无死亡宠物则排除复活） */
export function getGrowthSpecialRewards(rng: () => number, deadPetCount: number = 0): GrowthSpecialKind[] {
  let pool = [...GROWTH_SPECIAL_IDS];
  if (deadPetCount <= 0) {
    pool = pool.filter((id) => id !== 'revive');
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}
