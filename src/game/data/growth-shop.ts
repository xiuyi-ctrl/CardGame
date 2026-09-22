/**
 * 成长远征模式 - 专属商店商品池（10种）
 * 围绕成长点成长设计
 */

export type GrowthShopItemType =
  | 'book_small'
  | 'book_medium'
  | 'book_large'
  | 'slot_unlock'
  | 'forget_stone'
  | 'pet_recruit'
  | 'heal_potion'
  | 'reset_stone'
  | 'skill_enhance_stone'
  | 'revival_stone';

export interface GrowthShopItem {
  id: GrowthShopItemType;
  label: string;
  desc: string;
  price: number;
  emoji: string;
}

export const GROWTH_SHOP_ITEMS: Record<GrowthShopItemType, GrowthShopItem> = {
  book_small: {
    id: 'book_small',
    label: '成长之书（小）',
    desc: '选择 1 只宠物，+1 成长点',
    price: 12,
    emoji: '📖',
  },
  book_medium: {
    id: 'book_medium',
    label: '成长之书（中）',
    desc: '选择 1 只宠物，+2 成长点',
    price: 22,
    emoji: '📕',
  },
  book_large: {
    id: 'book_large',
    label: '成长之书（大）',
    desc: '选择 1 只宠物，+3 成长点',
    price: 30,
    emoji: '📚',
  },
  slot_unlock: {
    id: 'slot_unlock',
    label: '技能槽解锁',
    desc: '选择 1 只宠物，解锁一个技能槽（无需成长点）',
    price: 50,
    emoji: '🎰',
  },
  forget_stone: {
    id: 'forget_stone',
    label: '遗忘之石',
    desc: '选择 1 只宠物，重置其成长点',
    price: 30,
    emoji: '🪨',
  },
  pet_recruit: {
    id: 'pet_recruit',
    label: '生物招募',
    desc: '获得 1 只随机生物（品阶 1~2）',
    price: 20,
    emoji: '🐾',
  },
  heal_potion: {
    id: 'heal_potion',
    label: '治疗圣水',
    desc: '全队回复 50% 生命',
    price: 30,
    emoji: '🧪',
  },
  reset_stone: {
    id: 'reset_stone',
    label: '还原石',
    desc: '选择 1 只宠物，重置其指定技能的强化等级（返还 50% 累计消耗）',
    price: 25,
    emoji: '💎',
  },
  skill_enhance_stone: {
    id: 'skill_enhance_stone',
    label: '技能强化石',
    desc: '选择 1 只宠物，强化其 1 个技能（无需成长点）',
    price: 40,
    emoji: '⚒️',
  },
  revival_stone: {
    id: 'revival_stone',
    label: '复活石',
    desc: '复活 1 只死亡宠物（保留 50% 属性）',
    price: 60,
    emoji: '🪹',
  },
};

export const GROWTH_SHOP_ITEM_IDS = Object.keys(GROWTH_SHOP_ITEMS) as GrowthShopItemType[];

/** 获取商店库存（随机4种） */
export function getGrowthShopStock(rng: () => number): GrowthShopItemType[] {
  const shuffled = [...GROWTH_SHOP_ITEM_IDS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 4);
}
