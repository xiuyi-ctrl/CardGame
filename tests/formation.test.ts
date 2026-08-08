import { describe, it, expect } from 'vitest';
import { placeUnit } from '../src/game/state/formation';
import type { FormationPosition } from '../src/game/state/formation';

const pos = (row: 'front' | 'back', column: 0 | 1 | 2): FormationPosition => ({ row, column });

describe('placeUnit 布阵站位逻辑', () => {
  it('空位放置：从宠物池上场', () => {
    const next = placeUnit({ A: pos('front', 0), B: pos('front', 1) }, 'C', pos('back', 0));
    expect(next).toEqual({ A: pos('front', 0), B: pos('front', 1), C: pos('back', 0) });
  });

  it('场上宠物挪到空位：只改位置，出战数不变', () => {
    const next = placeUnit({ A: pos('front', 0), B: pos('front', 1), C: pos('front', 2), D: pos('back', 0) }, 'A', pos('back', 1));
    expect(next).toEqual({ A: pos('back', 1), B: pos('front', 1), C: pos('front', 2), D: pos('back', 0) });
    expect(Object.keys(next).length).toBe(4);
  });

  it('场上两只交换站位', () => {
    const next = placeUnit({ A: pos('front', 0), B: pos('front', 1) }, 'A', pos('front', 1));
    expect(next).toEqual({ A: pos('front', 1), B: pos('front', 0) });
    expect(Object.keys(next).length).toBe(2);
  });

  it('池宠换场上的宠物：池宠占位、被换下回池（删除其 key），出战数不变', () => {
    const next = placeUnit({ A: pos('front', 0), B: pos('front', 1), C: pos('front', 2), D: pos('back', 0) }, 'E', pos('front', 1));
    expect(next).toEqual({ A: pos('front', 0), C: pos('front', 2), D: pos('back', 0), E: pos('front', 1) });
    expect(Object.keys(next).length).toBe(4);
    expect(next['B']).toBeUndefined();
  });

  it('被换下的宠物可再次从池上场', () => {
    let next = placeUnit({ A: pos('front', 0), B: pos('front', 1) }, 'C', pos('front', 1));
    next = placeUnit(next, 'B', pos('back', 0));
    expect(next).toEqual({ A: pos('front', 0), C: pos('front', 1), B: pos('back', 0) });
    expect(Object.keys(next).length).toBe(3);
  });

  it('拖到自己的格子：不变', () => {
    const before = { A: pos('front', 0), B: pos('front', 1) };
    expect(placeUnit(before, 'A', pos('front', 0))).toEqual(before);
  });

  it('池宠连续换下场上多只，fieldCount 始终不变', () => {
    let next: Record<string, FormationPosition> = { A: pos('front', 0), B: pos('front', 1), C: pos('front', 2), D: pos('back', 0) };
    for (const [uid, target] of [
      ['E', pos('front', 0)],
      ['F', pos('front', 1)],
      ['G', pos('back', 0)],
    ] as const) {
      next = placeUnit(next, uid, target);
      expect(Object.keys(next).length).toBe(4);
    }
    expect(next['A']).toBeUndefined();
    expect(next['B']).toBeUndefined();
    expect(next['D']).toBeUndefined();
  });
});
