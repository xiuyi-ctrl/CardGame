export const BACKPACK_ITEM_ART: Record<string, string> = Object.fromEntries([
  'berry', 'meat', 'gem', 'golden_fruit', 'mystery_egg',
  'scout', 'skip', 'twin', 'purify', 'atk_up', 'spd_up', 'hp_up', 'atk_down', 'spd_down', 'hp_down',
  'book_small', 'book_medium', 'book_large', 'slot_unlock', 'forget_stone', 'heal_potion',
  'reset_stone', 'skill_enhance_stone', 'revival_stone',
].map((id) => [id, `/backpack-item-icons/${id}.png`]));

BACKPACK_ITEM_ART.heal_potion_g = BACKPACK_ITEM_ART.heal_potion;
