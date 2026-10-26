import { expect, it } from 'vitest';
import { canStepTo, generateMap } from '../src/game/state/game';

it.each(['mixed', 'emerald_forest'] as const)('%s各幕常规层分支递增，首领前安全收拢且全部节点可达', region => {
  const totals = [0, 0, 0];
  const rows = [0, 0, 0];
  for (const act of [1, 2, 3]) for (let seed = 1; seed <= 100; seed++) {
    const map = generateMap(seed, act, 'normal', region);
    const last = map.layers.length - 1;
    expect(map.layers[0]).toHaveLength(1);
    const reachable = new Set([map.layers[0][0].id]);
    for (let row = 1; row < last; row++) {
      const cap = Math.min(act + 4, 3 + last - 1 - row);
      expect(map.layers[row].length).toBeGreaterThanOrEqual(Math.min(act + 2, cap));
      expect(map.layers[row].length).toBeLessThanOrEqual(cap);
      if (row < last - 3) { totals[act - 1] += map.layers[row].length; rows[act - 1]++; }
    }
    for (let row = 0; row < last; row++) {
      for (const node of map.layers[row]) {
        const next = map.layers[row + 1].filter(to => canStepTo(row, node.col, to));
        expect(next.length).toBeGreaterThan(0);
        if (reachable.has(node.id)) next.forEach(to => reachable.add(to.id));
      }
    }
    expect(reachable.size).toBe(map.layers.flat().length);
    expect(map.layers[last].length).toBeGreaterThanOrEqual(region === 'mixed' ? 2 : 1);
    expect(map.layers[last].length).toBeLessThanOrEqual(region === 'mixed' ? 3 : 1);
  }
  expect(totals[1] / rows[1]).toBeGreaterThan(totals[0] / rows[0]);
  expect(totals[2] / rows[2]).toBeGreaterThan(totals[1] / rows[1]);
});
