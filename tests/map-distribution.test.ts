import { describe, expect, it } from 'vitest';
import { generateMap } from '../src/game/state/game';
import { createInitialState, migrateGameState } from '../src/game/state/reducer';

describe('主模式地图分段与间距', () => {
  it('两地区、三难度、三幕各200种子满足补给与特殊节点约束', () => {
    for (const region of ['mixed', 'emerald_forest'] as const)
      for (const difficulty of ['normal', 'hard', 'nightmare'] as const)
        for (const act of [1, 2, 3]) for (let seed = 1; seed <= 200; seed++) {
          const map = generateMap(seed, act, difficulty, region);
          const last = map.layers.length - 1;
          const rowsOf = (type: string) => map.layers.flatMap((nodes, row) => nodes.filter(n => n.type === type).map(() => row));
          const shops = rowsOf('shop'), towers = rowsOf('watchtower'), events = rowsOf('event');
          const section = (row: number) => Math.min(2, Math.floor((row - 2) * 3 / (last - 2)));
          const [minShops, maxShops] = ({ 1: [3, 5], 2: [5, 6], 3: [6, 8] } as Record<number, number[]>)[act];
          expect(shops.length).toBeGreaterThanOrEqual(minShops);
          expect(shops.length).toBeLessThanOrEqual(maxShops);
          expect(new Set(shops).size).toBe(shops.length);
          expect(new Set(shops.map(section)).size).toBe(3);
          expect(shops.filter((row, i) => i > 0 && row - shops[i - 1] === 1).length).toBe(Math.max(0, 2 * shops.length - (last - 2) - 1));
          expect(shops[shops.length - 1]).toBeGreaterThanOrEqual(last - 2);
          const gap = Math.max(1, Math.floor((last - 3) / (shops.length - 1)));
          for (let i = 1; i < shops.length; i++) expect(shops[i] - shops[i - 1]).toBeGreaterThanOrEqual(gap);
          expect(towers.length).toBeGreaterThanOrEqual(1);
          expect(towers.length).toBeLessThanOrEqual(2);
          expect(towers.some(row => row >= last - 4 && row <= last - 2)).toBe(true);
          if (towers.length === 2) expect(towers[1] - towers[0]).toBeGreaterThanOrEqual(4);
          expect(events.length).toBeGreaterThanOrEqual(4);
          expect(events.length).toBeLessThanOrEqual(6);
          expect(new Set(events).size).toBe(events.length);
          expect(new Set(events.map(section)).size).toBe(3);
          for (let i = 1; i < events.length; i++) expect(events[i] - events[i - 1]).toBeLessThanOrEqual(3);
          for (let i = 2; i < events.length; i++) expect(events[i] - events[i - 2]).toBeGreaterThan(2);
          // 从商店前三层的每个位置，都有不依赖钥匙门的转入路径；允许玩家主动绕开。
          for (const row of shops) {
            let reachable = map.layers[row].filter(n => n.type === 'shop');
            const from = Math.max(0, row - 3);
            for (let r = row - 1; r >= from; r--)
              reachable = map.layers[r].filter(n => n.type !== 'keydoor' && reachable.some(next => r === 0 || Math.abs(next.col - n.col) <= 1));
            expect(reachable.length, JSON.stringify({ seed, act, region, row, from, layers: map.layers.slice(from, row + 1) })).toBe(map.layers[from].filter(n => n.type !== 'keydoor').length);
          }
          for (const nodes of map.layers.slice(2, -1)) {
            expect(nodes.some(n => !['keydoor', 'guardian', 'elite', 'arena', 'gauntlet', 'corrupted'].includes(n.type))).toBe(true);
          }
        }
  }, 60000);

  it('同种子地图可复现', () => {
    expect(generateMap(20261023, 2)).toEqual(generateMap(20261023, 2));
  });
});


it.each([[1, 3, 5], [2, 5, 6], [3, 6, 8]])('第%s幕可以生成范围内每一种商店数量', (act, min, max) => {
  const seen = new Set<number>();
  for (let seed = 1; seed <= 200; seed++) seen.add(generateMap(seed, act).layers.flat().filter(n => n.type === 'shop').length);
  expect([...seen].sort()).toEqual(Array.from({ length: max - min + 1 }, (_, i) => min + i));
});
it('已保存的第三幕三商店地图不按新数量补建或重抽', () => {
  const map = generateMap(1, 3);
  let count = 0;
  map.layers = map.layers.map(row => row.map(node => node.type === 'shop' && ++count > 3 ? { ...node, type: 'battle', label: '战斗' } : node));
  const saved = { ...createInitialState(), act: 3, map };
  const loaded = migrateGameState(JSON.parse(JSON.stringify(saved)))!;
  expect(loaded.map.layers).toEqual(map.layers);
  expect(loaded.map.layers.flat().filter(n => n.type === 'shop')).toHaveLength(3);
});
