import { describe, expect, it } from 'vitest';
import { generateMap } from '../src/game/state/game';

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
          expect(shops.map(section)).toEqual([0, 1, 2]);
          expect(shops[2]).toBeGreaterThanOrEqual(last - 2);
          expect(shops[1] - shops[0]).toBeGreaterThanOrEqual(3);
          expect(shops[2] - shops[1]).toBeGreaterThanOrEqual(3);
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
