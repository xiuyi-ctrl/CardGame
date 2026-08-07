import { describe, it, expect } from 'vitest';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import type { GameAction } from '../src/game/state/reducer';
import type { GameState } from '../src/game/state/game';
import { generateMap } from '../src/game/state/game';

function dispatch(s: GameState, a: GameAction): GameState {
  return gameReducer(s, a);
}

describe('地图相邻寻路回归', () => {
  it('出发层（row 0）可直达任意下一层节点；此后 MOVE 不接受非相邻列', () => {
    const problems: string[] = [];
    for (let seed = 1; seed < 25; seed++) {
      const s: GameState = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed });
      const seen = new Set<string>();
      const walk = (cur: GameState) => {
        const key = `${cur.currentRow}:${cur.currentNodeId}`;
        if (seen.has(key)) return;
        seen.add(key);
        const isFirst = cur.currentNodeId === '';
        const optionsRow = isFirst ? cur.currentRow : cur.currentRow + 1;
        if (optionsRow >= cur.map.layers.length) return;
        const curNode = isFirst
          ? undefined
          : cur.map.layers[cur.currentRow]?.find((n) => n.id === cur.currentNodeId);
        for (const n of cur.map.layers[optionsRow]) {
          const moved = dispatch(cur, { type: 'MOVE', nodeId: n.id });
          if (moved.currentNodeId !== n.id) continue;
          if (
            cur.currentRow > 0 &&
            curNode &&
            typeof curNode.col === 'number' &&
            typeof n.col === 'number' &&
            Math.abs(n.col - curNode.col) > 1
          ) {
            problems.push(`seed=${seed} 从 ${curNode.label}(c${curNode.col}) 非法移动到 ${n.label}(c${n.col})`);
            continue;
          }
          walk({ ...moved, screen: 'map', battle: undefined });
        }
      };
      walk(s);
    }
    expect(problems).toEqual([]);
  });

  it('地图相邻路线无死路：每个节点下一行都存在相邻节点（含末层首领行）', () => {
    const deadEnds: string[] = [];
    for (let seed = 1; seed < 40; seed++) {
      for (let act = 1; act <= 3; act++) {
        const map = generateMap(seed, act);
        for (let r = 1; r < map.layers.length - 1; r++) {
          const next = map.layers[r + 1];
          if (!next) continue;
          for (const n of map.layers[r]) {
            const adj = next.filter((m) => Math.abs(m.col - n.col) <= 1);
            if (adj.length === 0) {
              deadEnds.push(`seed=${seed} act=${act} row${r} ${n.label}(c${n.col}) 下一行无相邻`);
            }
          }
        }
      }
    }
    expect(deadEnds).toEqual([]);
  });

  it('USE_SKIP 遵守相同路线规则：出发层任意节点、此后相邻列', () => {
    let s: GameState = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 7 });
    const start = s.map.layers[0][0];
    s = dispatch(s, { type: 'MOVE', nodeId: start.id });
    s = { ...s, screen: 'map', battle: undefined, currentNodeId: start.id, currentRow: 0, inventory: { ...s.inventory, skip: 1 } };
    const row1 = s.map.layers[1];
    // 出发层可跳过任意下一行战斗节点（含非相邻列）
    const farBattle = row1.find((n) => n.type === 'battle' && (n.col ?? 0) > 1);
    if (farBattle) {
      const after = dispatch(s, { type: 'USE_SKIP', nodeId: farBattle.id });
      expect(after.currentNodeId).toBe(farBattle.id);
      expect(after.inventory.skip).toBe(0);
    }
  });
});
