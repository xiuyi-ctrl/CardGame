/**
 * 成长远征模式 - 专属商店商品池（9种）
 * 围绕成长点成长设计（删除"成长之书"与"成长之石"重复项）
 */

export type GrowthShopItemType =
  | 'book_small'
  | 'book_large'
  | 'stat_boost'
  | 'slot_unlock'
  | 'skill_replace'
  | 'forget_stone'
  | 'pet_recruit'
  | 'heal_potion'
  | 'gold_bag';

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
  book_large: {
    id: 'book_large',
    label: '成长之书（大）',
    desc: '选择 1 只宠物，+2 成长点',
    price: 20,
    emoji: '📚',
  },
  stat_boost: {
    id: 'stat_boost',
    label: '属性强化',
    desc: '选择 1 只宠物，永久 +2 生命 或 +1 速度',
    price: 18,
    emoji: '⬆️',
  },
  slot_unlock: {
    id: 'slot_unlock',
    label: '技能槽解锁',
    desc: '选择 1 只宠物，解锁第 4 技能槽（无需成长点）',
    price: 25,
    emoji: '🎰',
  },
  skill_replace: {
    id: 'skill_replace',
    label: '技能替换',
    desc: '选择 1 只宠物，替换 1 个技能（免费）',
    price: 12,
    emoji: '🔄',
  },
  forget_stone: {
    id: 'forget_stone',
    label: '遗忘之石',
    desc: '选择 1 只宠物，重置其成长点',
    price: 10,
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
    label: '治疗药水',
    desc: '全队回复 50% 生命',
    price: 8,
    emoji: '🧪',
  },
  gold_bag: {
    id: 'gold_bag',
    label: '金币袋',
    desc: '获得 25 金币（净赚 15）',
    price: 10,
    emoji: '💰',
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
