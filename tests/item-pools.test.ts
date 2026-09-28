import { describe, it, expect } from 'vitest';
import { buildEventByType } from '../src/game/state/game';
import { ITEMS, mainShopItemPool } from '../src/game/data/items';
import { createRng } from '../src/game/rng';

describe('主模式随机道具池', () => {
  it('排除远征专属道具（复活石等 shop=false）与免费道具', () => {
    const pool = mainShopItemPool();
    expect(pool).not.toContain('revival_stone');
    for (const id of pool) {
      expect(ITEMS[id].price).toBeGreaterThan(0);
      expect(ITEMS[id].shop).not.toBe(false);
    }
    for (const id of Object.keys(ITEMS)) {
      if (ITEMS[id].shop === false) expect(pool).not.toContain(id);
    }
  });

  it('所有含随机道具奖励的主模式事件不会产出远征专属道具', () => {
    const itemEventTypes = ['campfire', 'merchant', 'ruins', 'gambler', 'cursed_chest', '精灵'];
    for (const type of itemEventTypes) {
      for (let seed = 1; seed <= 300; seed++) {
        const ev = buildEventByType(createRng(seed * 977 + type.length), type, 2);
        for (const choice of ev.choices) {
          if (!choice.itemId) continue;
          const label = `${type} seed=${seed} choice=${choice.id}`;
          expect(ITEMS[choice.itemId], label).toBeDefined();
          expect(ITEMS[choice.itemId].shop, `${label} itemId=${choice.itemId}`).not.toBe(false);
        }
      }
    }
  });
});
