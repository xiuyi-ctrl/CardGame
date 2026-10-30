import { expect, it } from 'vitest';
import { generateGrowthMap } from '../src/game/core/growth-map';
import { createRng } from '../src/game/rng';
import { buildGrowthEvent, GROWTH_EVENT_GROUPS, GROWTH_EVENT_NAMES } from '../src/game/data/growth-events';
import { getGrowthShopStock } from '../src/game/data/growth-shop';
import { createInitialState, gameReducer, migrateGameState } from '../src/game/state/reducer';
import type { GameState, NodeType } from '../src/game/state/game';

it('一万种子最终地图满足数量、首次强化、最大间隔和首领前整备', () => {
  const signatures = new Set<string>();
  for (let seed = 1; seed <= 10000; seed++) {
    const map = generateGrowthMap(seed), nodes = map.layers.map(row => row[0]);
    const positions = (type: NodeType) => nodes.flatMap((node, index) => node.type === type ? [index + 1] : []);
    const iron = positions('blacksmith'), shops = positions('shop'), events = positions('event');
    expect(nodes).toHaveLength(50); expect(nodes.slice(0, 5).every(node => node.type === 'battle')).toBe(true);
    expect(iron).toHaveLength(7); expect(iron[0]).toBeGreaterThanOrEqual(6); expect(iron[0]).toBeLessThanOrEqual(8);
    expect(iron.at(-1)).toBeGreaterThanOrEqual(46); expect(iron.at(-1)).toBeLessThanOrEqual(48);
    expect(iron.slice(1).every((layer, i) => layer - iron[i] <= 8)).toBe(true);
    expect(iron.some(layer => layer <= 13)).toBe(true); expect(iron.some(layer => layer >= 23 && layer <= 28)).toBe(true);
    expect(shops.length >= 5 && shops.length <= 6).toBe(true); expect(shops.slice(1).every((layer, i) => layer - shops[i] >= 3)).toBe(true);
    expect(events.length >= 4 && events.length <= 6).toBe(true); expect(events.slice(1).every((layer, i) => layer - events[i] >= 2)).toBe(true);
    expect(positions('special')).toHaveLength(3); expect(positions('arena3')).toHaveLength(2);
    for (const layer of [15, 30, 50]) expect(nodes[layer - 1].type).toBe('boss');
    for (const layer of [10, 14, 20, 29, 40, 49]) expect(nodes[layer - 1].type).toBe('rest');
    for (const [start, end] of [[6, 13], [16, 28], [31, 48]]) expect(events.some(layer => layer >= start && layer <= end)).toBe(true);
    if (seed <= 100) { expect(generateGrowthMap(seed)).toEqual(map); signatures.add(nodes.map(node => node.type).join(',')); }
  }
  expect(signatures.size).toBeGreaterThan(90);
}, 30000);

it('事件按类别轮换，前四次涵盖四类；指定测试及存档快照仍保留', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const rng = createRng(seed), seen: string[] = [], groups: number[] = [];
    for (let i = 0; i < 4; i++) {
      const event = buildGrowthEvent(rng, undefined, 0, 20, seen.at(-1), seen);
      groups.push(GROWTH_EVENT_GROUPS.findIndex(group => group.some(id => GROWTH_EVENT_NAMES[id] === event.title)));
      expect(event.title).not.toBe(seen.at(-1)); seen.push(event.title);
    }
    expect(new Set(groups).size).toBe(4);
  }
  expect(buildGrowthEvent(createRng(1), 'stone_of_forget', 0, 1).title).toBe('拆解工坊');
});

function shopState(seed: number): GameState {
  const state = gameReducer(createInitialState(), { type: 'START_PROFICIENCY_PICKED', seed, starterId: 'momo', companionId: 'lulu' });
  return { ...state, gold: 100, map: { ...state.map, layers: Array.from({ length: 5 }, (_, i) => [{ id: `shop-${i}`, type: 'shop', label: '商店', col: 0 }]) } };
}
it('连续不同商店首次库存至少一家有强化石，刷新和读档不重置进度', () => {
  for (let seed = 1; seed <= 100; seed++) {
    let state = shopState(seed), missed = false;
    for (let index = 0; index < 5; index++) {
      state = gameReducer({ ...state, screen: 'map' }, { type: 'MOVE', nodeId: `shop-${index}` });
      const hasStone = state.shopStock!.includes('skill_enhance_stone');
      expect(missed && !hasStone).toBe(false);
      expect(new Set(state.shopStock).size).toBe(4);
      missed = !hasStone;
      const before = state.growthShopGuarantee;
      state = gameReducer(state, { type: 'PROF_SHOP_REFRESH' });
      expect(state.growthShopGuarantee).toEqual(before);
      const saved = JSON.parse(JSON.stringify(state));
      state = migrateGameState(saved)!;
      expect(state.growthShopGuarantee).toEqual(before);
    }
  }
});
it('保证货架仍然四件不重复，新局不继承旧保底，旧地图读档不重生成', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const stock = getGrowthShopStock(createRng(seed), true);
    expect(stock).toHaveLength(4); expect(new Set(stock).size).toBe(4); expect(stock).toContain('skill_enhance_stone');
  }
  const old = shopState(2578); old.map.layers[0][0].type = 'battle'; old.growthShopGuarantee = { nodeId: 'old', missedEnhanceStone: true };
  expect(migrateGameState(JSON.parse(JSON.stringify(old)))!.map).toEqual(old.map);
  expect(gameReducer(old, { type: 'START_PROFICIENCY_PICKED', seed: 1, starterId: 'momo', companionId: 'lulu' }).growthShopGuarantee).toBeUndefined();
});
