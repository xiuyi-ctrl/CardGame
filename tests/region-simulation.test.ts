import { describe, expect, it } from 'vitest';
import { simulateRun } from '../src/game/simulation/runner';

describe('地区模拟隔离', () => {
  it('省略地区与显式混合地区使用相同策略和随机结果', () => {
    const a = simulateRun({ mode: 'main', seed: 4 });
    const b = simulateRun({ mode: 'main', seed: 4, region: 'mixed' });
    expect(a.finalSignature).toBe(b.finalSignature);
    expect(a.outcome).toBe(b.outcome);
  });
  it('林地使用合法开局且可复现，观察器不改变结果', () => {
    let observed = false;
    const a = simulateRun({ mode: 'main', seed: 2, region: 'emerald_forest' }, state => {
      if (!observed) {
        expect(state.region).toBe('emerald_forest');
        expect(state.roster.slice(0, 2).map(u => u.speciesId)).toEqual(['fire_fox', 'fire_fox']);
        observed = true;
      }
    });
    const b = simulateRun({ mode: 'main', seed: 2, region: 'emerald_forest' });
    expect(observed).toBe(true);
    expect(a.finalSignature).toBe(b.finalSignature);
    expect(['victory', 'gameover']).toContain(a.outcome);
  });
});
