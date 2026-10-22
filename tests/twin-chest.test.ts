import { describe, expect, it } from 'vitest';
import { makeUnit } from '../src/game/core/battle';
import { mainShopItemPool } from '../src/game/data/items';
import { nodeInfo, rollChest, type GameState } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';

function setup(seed: number, twin = 0): GameState {
  const base = createInitialState();
  return {
    ...base, seed, screen: 'map', currentRow: 0, currentNodeId: 'start', gold: 10,
    roster: [{ ...makeUnit('momo', true, 0, false), hp: 1 }], inventory: { twin },
    map: {
      ...base.map,
      layers: [
        [{ id: 'start', type: 'battle', label: '出发', col: 0 }],
        [{ id: 'left', type: 'sync', label: '双生宝箱', col: 0, pairedId: 'right' },
          { id: 'right', type: 'sync', label: '双生宝箱', col: 1, pairedId: 'left' }],
      ],
    },
  };
}

describe('双生宝箱奖励', () => {
  it('只产生金币、非圣果食物或一个商店可售道具，所有候选可抽取且结果可复现', () => {
    const foods = new Set<string>();
    const items = new Set<string>();
    let goldCount = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const roll = rollChest(seed, 1, 'left', false);
      expect(roll).toEqual(rollChest(seed, 1, 'left', false));
      expect(roll.healRatio).toBeUndefined();
      if (roll.gold) {
        goldCount++;
        expect(roll.gold).toBeGreaterThanOrEqual(12);
        expect(roll.gold).toBeLessThanOrEqual(20);
        expect(roll.foodId).toBeUndefined();
        expect(roll.extras).toEqual([]);
      } else if (roll.foodId) {
        foods.add(roll.foodId);
        expect(['berry', 'meat', 'gem']).toContain(roll.foodId);
        expect(roll.extras).toEqual([]);
      } else {
        expect(roll.extras).toHaveLength(1);
        expect(mainShopItemPool()).toContain(roll.extras[0].id);
        items.add(roll.extras[0].id);
      }
    }
    expect(goldCount).toBeGreaterThan(0);
    expect([...foods].sort()).toEqual(['berry', 'gem', 'meat']);
    expect([...items].sort()).toEqual(mainShopItemPool().sort());
  });

  it.each([0, 1])('实际到账与情报一致，不自动回血或重复发奖（双生符=%s）', twin => {
    for (let seed = 1; seed <= 60; seed++) {
      const state = setup(seed, twin);
      const nodes = state.map.layers[1];
      const rolls = nodes.slice(0, twin ? 2 : 1).map(node => rollChest(seed, 1, node.id, false));
      const preview = nodeInfo(state, nodes[0]);
      expect(preview.detail).toContain(rolls[0].text);
      const opened = gameReducer(state, { type: 'MOVE', nodeId: 'left' });
      expect(opened.screen).toBe('chest');
      expect(opened.chestResult).toHaveLength(rolls.length);
      expect(opened.chestResult?.[0]).toContain(rolls[0].text);
      expect(opened.gold).toBe(state.gold + rolls.reduce((sum, roll) => sum + roll.gold, 0));
      expect(opened.roster).toEqual(state.roster);
      const expected: GameState['inventory'] = { ...state.inventory, twin: 0 };
      for (const roll of rolls) {
        const ids = [...(roll.foodId ? [roll.foodId] : []), ...roll.extras.map(extra => extra.id)];
        for (const id of ids) expected[id] = (expected[id] ?? 0) + 1;
      }
      expect(opened.inventory).toEqual(expected);
      expect(opened.map.disabled?.left).toBe(true);
      expect(opened.map.disabled?.right).toBe(true);
      expect(gameReducer(opened, { type: 'NEXT_NODE' }).inventory).toEqual(expected);
    }
  });

  it('钥匙门仍同时获得金币和食物，并保留概率圣果', () => {
    let hasFruit = false;
    for (let seed = 1; seed <= 200; seed++) {
      const roll = rollChest(seed, 1, 'door', true);
      expect(roll.gold).toBeGreaterThanOrEqual(25);
      expect(roll.gold).toBeLessThanOrEqual(40);
      expect(['berry', 'meat', 'gem']).toContain(roll.foodId);
      hasFruit ||= roll.extras.some(extra => extra.id === 'golden_fruit');
    }
    expect(hasFruit).toBe(true);
  });
});
