import type { FoodDef } from '../types';

export const FOODS: Record<string, FoodDef> = {
  berry: {
    id: 'berry', name: '浆果', emoji: '🍓', desc: '驯服成功率一般',
    baseTame: 0.6, price: 10,
  },
  meat: {
    id: 'meat', name: '鲜肉', emoji: '🍖', desc: '驯服成功率较高',
    baseTame: 0.7, price: 20,
  },
  gem: {
    id: 'gem', name: '秘晶', emoji: '💎', desc: '驯服成功率最高',
    baseTame: 0.8, price: 30,
  },
  golden_fruit: {
    id: 'golden_fruit', name: '圣果', emoji: '🍎', desc: '必定驯服一只残血且可驯服的敌人',
    baseTame: 1, price: 9999, guaranteed: true, shop: false,
  },
  heal_potion: {
    id: 'heal_potion', name: '治疗圣水', emoji: '🧪', desc: '全队回复50%生命',
    baseTame: 0, price: 30, shop: false,
  },
};

export function getFood(id: string): FoodDef {
  const f = FOODS[id];
  if (!f) throw new Error(`未知食物: ${id}`);
  return f;
}

/** 捕捉食物不包含因历史数据而存于FOODS表内的治疗圣水。 */
export function isCaptureFood(id: string): boolean {
  return !!FOODS[id] && FOODS[id].baseTame > 0;
}
