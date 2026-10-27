import { FOODS } from './foods';
import { ITEMS, mainShopItemPool } from './items';
import { pick, shuffle } from '../rng';

export interface MainShopOffer {
  id: string;
  name: string;
  desc: string;
  price: number;
  inventoryId: string;
  amount: number;
  iconId: string;
}

/** 仅商店商品，不加入食物、事件或宝箱随机奖励池。购买后拆成普通食物。 */
export const FOOD_BUNDLES: Record<string, MainShopOffer> = {
  bundle_berry: { id: 'bundle_berry', name: '浆果组合包 ×3', desc: '获得3个浆果，单买合计30金币。', price: 25, inventoryId: 'berry', amount: 3, iconId: 'berry' },
  bundle_meat: { id: 'bundle_meat', name: '鲜肉组合包 ×2', desc: '获得2个鲜肉，单买合计40金币。', price: 35, inventoryId: 'meat', amount: 2, iconId: 'meat' },
  bundle_gem: { id: 'bundle_gem', name: '秘晶组合包 ×2', desc: '获得2个秘晶，单买合计60金币。', price: 50, inventoryId: 'gem', amount: 2, iconId: 'gem' },
};

export function getMainShopOffer(id: string): MainShopOffer | undefined {
  if (FOOD_BUNDLES[id]) return FOOD_BUNDLES[id];
  const item = FOODS[id] ?? ITEMS[id];
  return item ? { id, name: item.name, desc: item.desc, price: item.price, inventoryId: id, amount: 1, iconId: id } : undefined;
}

/** 首次进入、刷新、侦查共用：4件不同商品，食物与战斗药水保底，最多1包。 */
export function generateMainShopStock(rng: () => number): string[] {
  const foods = Object.keys(FOODS).filter(id => FOODS[id].shop !== false && FOODS[id].baseTame > 0 && !FOODS[id].guaranteed);
  const items = mainShopItemPool();
  const potions = items.filter(id => ITEMS[id].usableInBattle);
  const stock = [pick(rng, foods), pick(rng, potions)];
  if (rng() < .4) stock.push(pick(rng, Object.keys(FOOD_BUNDLES)));
  const other = shuffle(rng, [...foods, ...items].filter(id => !stock.includes(id)));
  stock.push(...other.slice(0, 4 - stock.length));
  return shuffle(rng, stock);
}
