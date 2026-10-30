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

import type { GrowthEncounterKind } from '../state/growth-encounters';

export interface GrowthSpecialReward {
  growthEncounter?: GrowthEncounterKind;
  id: GrowthSpecialKind;
  label: string;
  desc: string;
  emoji: string;
}

export const GROWTH_SPECIAL_REWARDS: Record<GrowthSpecialKind, GrowthSpecialReward> = {
  growth_blessing: {
    id: 'growth_blessing',
    label: '成长之泉',
    desc: '指定一只伙伴获得8成长点，或两只不同伙伴各获得5成长点',
    growthEncounter: 'spring',
    emoji: '🌟',
  },
  stat_blessing: {
    id: 'stat_blessing',
    label: '大师传承',
    desc: '指定伙伴的一个技能免费强化一级，可突破常规上限，最高＋4',
    growthEncounter: 'master',
    emoji: '💪',
  },
  skill_blessing: {
    id: 'skill_blessing',
    label: '空白契约',
    desc: '指定伙伴免费解锁下一个技能槽，并为该槽学习一个技能',
    growthEncounter: 'contract',
    emoji: '🎯',
  },
  legend_recruit: {
    id: 'legend_recruit',
    label: '传奇秘典',
    desc: '指定伙伴，传奇技能三选一学习或替换；新技能＋0，原强化清除',
    growthEncounter: 'legend',
    emoji: '👑',
  },
  gold_treasure: {
    id: 'gold_treasure',
    label: '匠师工具箱',
    desc: '普通技能强化石×1、还原石×1，存入背包',
    growthEncounter: 'tools',
    emoji: '💎',
  },
  revive: {
    id: 'revive',
    label: '返魂之泉',
    desc: '指定死亡伙伴完整养成、满血复活；其他存活伙伴恢复25%生命',
    growthEncounter: 'revival_spring',
    emoji: '💖',
  },
};

export const GROWTH_SPECIAL_IDS = Object.keys(GROWTH_SPECIAL_REWARDS) as GrowthSpecialKind[];

/** 获取奇遇关奖励（随机3种展示，若无死亡宠物则排除复活） */
export function getGrowthSpecialRewards(rng: () => number, deadPetCount: number = 0, layer = 16, eligible: (id: GrowthSpecialKind) => boolean = () => true): GrowthSpecialKind[] {
  let pool = GROWTH_SPECIAL_IDS.filter(id => (layer >= 16 || !['stat_blessing', 'legend_recruit'].includes(id)) && eligible(id));
  if (deadPetCount <= 0) {
    pool = pool.filter((id) => id !== 'revive');
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}
