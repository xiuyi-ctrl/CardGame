import { describe, expect, it } from 'vitest';
import { simulateRun } from '../src/game/simulation/runner';

const ROBUSTNESS_SEEDS = Array.from({ length: 100 }, (_, index) => 2000 + index);
let cachedMain: ReturnType<typeof simulateRun>[] | undefined;

function mainSample(): ReturnType<typeof simulateRun>[] {
  cachedMain ??= ROBUSTNESS_SEEDS.map((seed) => simulateRun({ mode: 'main', difficulty: 'normal', seed }));
  return cachedMain;
}

describe('整局模拟（共享自动玩家）', () => {
  it('主线 100 个固定种子均能结束', () => {
    const failed = mainSample().filter((result) => result.outcome === 'stuck' || result.outcome === 'error');
    expect(failed.map((result) => `[${result.config.seed}] ${result.detail}`)).toEqual([]);
  });

  it('主线固定样本持续覆盖胜利、失败和奇遇', () => {
    const sample = mainSample().slice(0, 20);
    expect(sample.filter((result) => result.outcome === 'victory').length).toBeGreaterThan(0);
    expect(sample.filter((result) => result.outcome === 'gameover').length).toBeGreaterThan(0);
    expect(sample.reduce((sum, result) => sum + result.specials, 0)).toBeGreaterThan(0);
  });

  it('熟练度固定种子能进入终局且覆盖成长消费', () => {
    const results = [2000, 2001, 2002].map((seed) => simulateRun({ mode: 'proficiency', difficulty: 'normal', seed }));
    expect(results.every((result) => result.outcome === 'victory' || result.outcome === 'gameover')).toBe(true);
    expect(results.some((result) => result.maxLayer >= 2)).toBe(true);
    expect(results.some((result) => result.economy.growthPointsSpent > 0)).toBe(true);
  });
});

