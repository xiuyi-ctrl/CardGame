const ICON_KIND: Record<string, string> = {
  berry: 'berry', meat: 'meat', gem: 'gem', scout: 'scout',
  book_small: 'book', book_medium: 'book', book_large: 'book',
  heal_potion: 'potion', skill_enhance_stone: 'hammer', revival_stone: 'revival',
  gold_bag: 'gold', pet_recruit: 'paw', slot_unlock: 'key',
  growth_stone: 'gem', reset_stone: 'gem', forget_stone: 'gem',
  stat_boost: 'hammer', skill_replace: 'scout',
  purify: 'potion', atk_up: 'potion', spd_up: 'potion', hp_up: 'potion',
  atk_down: 'potion', spd_down: 'potion', hp_down: 'potion',
  skip: 'scout', twin: 'gem',
};

export function ShopItemIcon({ itemId }: { itemId: string }) {
  const kind = ICON_KIND[itemId] ?? (itemId.includes('potion') ? 'potion' : 'gem');
  return <svg className="shop-item-icon" viewBox="0 0 50 50" aria-hidden="true" shapeRendering="crispEdges">
    <use href={`/shop-item-icons.svg#${kind}`} />
  </svg>;
}
