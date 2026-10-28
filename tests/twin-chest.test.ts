import { describe, expect, it } from 'vitest';
import { makeUnit } from '../src/game/core/battle';
import { mainShopItemPool } from '../src/game/data/items';
import { nodeInfo, rollChest, type GameState } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { MAIN_REGIONS } from '../src/game/data/regions';
import { getMonster } from '../src/game/data/monsters';
import { parseDualSave } from '../src/ui/persistence';

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
  it('四类奖励互斥，按30/30/30/10投放；金币20至50，普通食物与可售道具', () => {
    const foods = new Set<string>();
    const items = new Set<string>();
    let goldCount = 0;
    let foodCount = 0, itemCount = 0, monsterCount = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const roll = rollChest(seed, 1, 'left', false);
      expect(roll).toEqual(rollChest(seed, 1, 'left', false));
      expect(roll.healRatio).toBeUndefined();
      if (roll.gold) {
        goldCount++;
        expect(roll.gold).toBeGreaterThanOrEqual(20);
        expect(roll.gold).toBeLessThanOrEqual(50);
        expect(roll.foodId).toBeUndefined();
        expect(roll.extras).toEqual([]);
      } else if (roll.foodId) {
        foodCount++;
        foods.add(roll.foodId);
        expect(['berry', 'meat', 'gem']).toContain(roll.foodId);
        expect(roll.extras).toEqual([]);
      } else if (roll.monsterId) {
        monsterCount++;
        expect(getMonster(roll.monsterId).rank).toBe(1);
        expect(MAIN_REGIONS.mixed.basePool).toContain(roll.monsterId);
        expect(roll.extras).toEqual([]);
      } else {
        itemCount++;
        expect(roll.extras).toHaveLength(1);
        expect(mainShopItemPool()).toContain(roll.extras[0].id);
        items.add(roll.extras[0].id);
      }
    }
    for (const count of [goldCount, foodCount, itemCount]) { expect(count).toBeGreaterThan(250); expect(count).toBeLessThan(350); }
    expect(monsterCount).toBeGreaterThan(70); expect(monsterCount).toBeLessThan(130);
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
      expect(opened.runStats!.goldEarned - state.runStats!.goldEarned).toBe(opened.gold - state.gold);
      const monsters = rolls.flatMap(roll => roll.monsterId ? [roll.monsterId] : []);
      expect(opened.roster.slice(0, state.roster.length)).toEqual(state.roster);
      expect(opened.roster.slice(state.roster.length).map(unit => unit.speciesId)).toEqual(monsters);
      expect(opened.roster.slice(state.roster.length).every(unit => !unit.tamedOrigin)).toBe(true);
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

  it('钥匙门同时获得金币和普通食物，不再产出圣果', () => {
    let hasFruit = false;
    for (let seed = 1; seed <= 200; seed++) {
      const roll = rollChest(seed, 1, 'door', true);
      expect(roll.gold).toBeGreaterThanOrEqual(25);
      expect(roll.gold).toBeLessThanOrEqual(40);
      expect(['berry', 'meat', 'gem']).toContain(roll.foodId);
      hasFruit ||= roll.extras.some(extra => extra.id === 'golden_fruit');
    }
    expect(hasFruit).toBe(false);
  });

  it('生物奖励限制于所选地区一阶池，预览与实际领取相同', () => {
    let count = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const state = { ...setup(seed), region: 'emerald_forest' as const };
      const roll = rollChest(seed, 1, 'left', false, state.region);
      if (!roll.monsterId) continue;
      count++;
      expect(MAIN_REGIONS.emerald_forest.basePool).toContain(roll.monsterId);
      expect(getMonster(roll.monsterId).rank).toBe(1);
      expect(nodeInfo(state, state.map.layers[1][0]).detail).toContain(roll.text);
      const opened = gameReducer(state, { type: 'MOVE', nodeId: 'left' });
      expect(opened.roster.at(-1)!.speciesId).toBe(roll.monsterId);
      expect(parseDualSave(JSON.stringify(opened))!.main!.roster).toEqual(opened.roster);
    }
    expect(count).toBeGreaterThan(30);
  });

  it.each([7, 8])('双开可同时获得两只生物，队伍原有%d只时不丢奖励，满员处理后返回结果且不重复领取', size => {
    const seed = Array.from({ length: 2000 }, (_, i) => i + 1).find(seed => rollChest(seed, 1, 'left', false).monsterId && rollChest(seed, 1, 'right', false).monsterId)!;
    expect(seed).toBeTruthy();
    const base = setup(seed, 1);
    const state = { ...base, roster: Array.from({ length: size }, () => makeUnit('momo', true, 0, false)) };
    const opened = gameReducer(state, { type: 'MOVE', nodeId: 'left' });
    expect(opened.screen).toBe('chest'); expect(opened.roster).toHaveLength(8);
    expect(opened.chestResult).toHaveLength(2); expect(opened.tameOverflow).toHaveLength(size - 6);
    expect(opened.inventory.twin).toBe(0);
    let processing = gameReducer(parseDualSave(JSON.stringify(opened))!.main!, { type: 'NEXT_NODE' });
    expect(processing.screen).toBe('tame-overflow'); expect(processing.tameOverflowReturn).toBe('chest');
    const beforeGold = processing.gold, inventory = processing.inventory;
    const pending = [...processing.tameOverflow!];
    for (const tame of pending) processing = gameReducer(processing, { type: 'TAME_OVERFLOW_DISCARD', tameUid: tame.uid });
    expect(processing.screen).toBe('chest'); expect(processing.tameOverflow).toBeUndefined();
    expect(processing.chestResult).toEqual(opened.chestResult); expect(processing.gold).toBe(beforeGold);
    expect(processing.inventory).toEqual(inventory);
    expect(gameReducer(processing, { type: 'NEXT_NODE' }).screen).not.toBe('tame-overflow');
  });

  it('宝箱新伙伴能用现有替换流程加入，原队伍与结果保留', () => {
    const seed = Array.from({ length: 500 }, (_, i) => i + 1).find(seed => rollChest(seed, 1, 'left', false).monsterId)!;
    const base = setup(seed); base.roster = Array.from({ length: 8 }, () => makeUnit('momo', true, 0, false));
    const opened = gameReducer(base, { type: 'MOVE', nodeId: 'left' });
    const processing = gameReducer(opened, { type: 'NEXT_NODE' });
    const tame = processing.tameOverflow![0];
    const joined = gameReducer(processing, { type: 'TAME_OVERFLOW_REPLACE', tameUid: tame.uid, discardUid: processing.roster[0].uid });
    expect(joined.screen).toBe('chest'); expect(joined.roster).toHaveLength(8);
    expect(joined.roster.some(unit => unit.uid === tame.uid)).toBe(true);
    expect(joined.chestResult).toEqual(opened.chestResult);
  });
  it('处理满员伙伴不会重复推进携带蛋，离开宝箱后只计一个关卡', () => {
    const seed = Array.from({ length: 500 }, (_, i) => i + 1).find(seed => rollChest(seed, 1, 'left', false).monsterId)!;
    const base = setup(seed); base.roster = Array.from({ length: 8 }, () => makeUnit('momo', true, 0, false));
    base.map.layers.push([{ id: 'next', type: 'rest', label: '休息', col: 0 }]);
    base.carriedEggs = [{ id: 'egg', remaining: 3, monsterId: 'momo', special: false, passedNodeIds: [] }];
    const chest = gameReducer(base, { type: 'MOVE', nodeId: 'left' });
    const pending = gameReducer(chest, { type: 'NEXT_NODE' });
    const done = gameReducer(pending, { type: 'TAME_OVERFLOW_DISCARD', tameUid: pending.tameOverflow![0].uid });
    expect(done.carriedEggs![0].remaining).toBe(3);
    const left = gameReducer(done, { type: 'NEXT_NODE' });
    expect(left.screen).toBe('map'); expect(left.carriedEggs![0].remaining).toBe(2);
  });
});
