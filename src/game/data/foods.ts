import type { FoodDef } from '../types';

export const FOODS: Record<string, FoodDef> = {
  berry: {
    id: 'berry', name: '浆果', emoji: '🍓', desc: '驯服成功率一般，生命加成低',
    baseTame: 0.7, price: 5, hpBonus: 1,
  },
  meat: {
    id: 'meat', name: '鲜肉', emoji: '🍖', desc: '驯服成功率较高',
    baseTame: 0.85, price: 9, hpBonus: 0,
  },
  gem: {
    id: 'gem', name: '秘晶', emoji: '💎', desc: '驯服成功率最高，大幅提升生命',
    baseTame: 0.95, price: 14, hpBonus: 3,
  },
};

export function getFood(id: string): FoodDef {
  const f = FOODS[id];
  if (!f) throw new Error(`未知食物: ${id}`);
  return f;
}
