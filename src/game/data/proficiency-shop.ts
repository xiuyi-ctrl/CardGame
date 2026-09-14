/**
 * 熟练度远征模式 - 专属商店商品池（10种）
 * 围绕熟练度成长设计
 */

/** 商品类型 */
export type ProficiencyShopItemType =
  | 'book_small'       // 熟练之书（小）
  | 'book_large'       // 熟练之书（大）
  | 'growth_stone'     // 成长之石
  | 'stat_boost'       // 属性强化
  | 'slot_unlock'      // 技能槽解锁
  | 'skill_replace'    // 技能替换
  | 'forget_stone'     // 遗忘之石
  | 'pet_recruit'      // 生物招募
  | 'heal_potion'      // 治疗药水
  | 'gold_bag';        // 金币袋

/** 商品定义 */
export interface ProficiencyShopItem {
  id: ProficiencyShopItemType;
  label: string;
  desc: string;
  price: number;
  emoji: string;
}

/** 所有商品 */
export const PROFICIENCY_SHOP_ITEMS: Record<ProficiencyShopItemType, ProficiencyShopItem> = {
  book_small: {
    id: 'book_small',
    label: '熟练之书（小）',
    desc: '选择 1 只宠物，+2 熟练度',
    price: 15,
    emoji: '📖',
  },
  book_large: {
    id: 'book_large',
    label: '熟练之书（大）',
    desc: '选择 1 只宠物，+5 熟练度',
    price: 30,
    emoji: '📚',
  },
  growth_stone: {
    id: 'growth_stone',
    label: '成长之石',
    desc: '选择 1 只宠物，+1 成长点',
    price: 25,
    emoji: '💎',
  },
  stat_boost: {
    id: 'stat_boost',
    label: '属性强化',
    desc: '选择 1 只宠物，永久 +2 生命 或 +1 速度',
    price: 20,
    emoji: '⬆️',
  },
  slot_unlock: {
    id: 'slot_unlock',
    label: '技能槽解锁',
    desc: '选择 1 只宠物，解锁第 4 技能槽（无需成长点）',
    price: 40,
    emoji: '🎰',
  },
  skill_replace: {
    id: 'skill_replace',
    label: '技能替换',
    desc: '选择 1 只宠物，替换 1 个技能（免费）',
    price: 20,
    emoji: '🔄',
  },
  forget_stone: {
    id: 'forget_stone',
    label: '遗忘之石',
    desc: '选择 1 只宠物，重置其成长点',
    price: 35,
    emoji: '🪨',
  },
  pet_recruit: {
    id: 'pet_recruit',
    label: '生物招募',
    desc: '获得 1 只随机生物（品阶 1~2）',
    price: 50,
    emoji: '🐾',
  },
  heal_potion: {
    id: 'heal_potion',
    label: '治疗药水',
    desc: '全队回复 30% 生命',
    price: 10,
    emoji: '🧪',
  },
  gold_bag: {
    id: 'gold_bag',
    label: '金币袋',
    desc: '获得 25 金币（净赚 10）',
    price: 15,
    emoji: '💰',
  },
};

/** 所有商品ID列表 */
export const PROFICIENCY_SHOP_ITEM_IDS = Object.keys(PROFICIENCY_SHOP_ITEMS) as ProficiencyShopItemType[];

/** 获取商店库存（随机4种） */
export function getShopStock(rng: () => number): ProficiencyShopItemType[] {
  const shuffled = [...PROFICIENCY_SHOP_ITEM_IDS];
  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 4);
}
