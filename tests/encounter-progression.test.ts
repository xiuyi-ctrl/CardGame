import { describe, expect, it } from 'vitest';
import { ENCOUNTER_SIZE_WEIGHTS, highTierChance, highTierTeams, pickProgressEncounter } from '../src/game/data/encounter-progression';
import { getMonster } from '../src/game/data/monsters';
import { MAIN_REGIONS, type MainRegionId } from '../src/game/data/regions';
import { createRng } from '../src/game/rng';
import { FOREST_ENCOUNTER_TABLES, MIXED_ENCOUNTER_TABLES, generateMap, nodeInfo } from '../src/game/state/game';
import { createInitialState, migrateGameState } from '../src/game/state/reducer';

function tables(act: number, region: MainRegionId) {
  const t = region === 'mixed' ? MIXED_ENCOUNTER_TABLES : FOREST_ENCOUNTER_TABLES;
  return act === 1 ? [t.ACT1_ENCOUNTERS_1V1, t.ACT1_ENCOUNTERS_2V2, t.ACT1_ENCOUNTERS_3V3]
    : act === 2 ? [t.ACT2_ENCOUNTERS_1V1, t.ACT2_ENCOUNTERS_2V2, t.ACT2_ENCOUNTERS_3V3, t.ACT2_ENCOUNTERS_4V4]
      : [t.ACT3_ENCOUNTERS_1V1, t.ACT3_ENCOUNTERS_2V2, t.ACT3_ENCOUNTERS_3V3, t.ACT3_ENCOUNTERS_4V4];
}

describe('随层数提高品阶与人数', () => {
  it('高阶概率在节点间线性递增且符合四个锚点', () => {
    for (const [index, p] of [0, .3, .7, 1].entries()) {
      expect(highTierChance(1, p)).toBeCloseTo([0, .05, .2, .4][index]);
      expect(highTierChance(2, p)).toBeCloseTo([.05, .1, .25, .45][index]);
    }
    expect(highTierChance(1, .5)).toBeCloseTo(.125);
    expect(highTierChance(2, .5)).toBeCloseTo(.175);
  });

  it.each(['mixed', 'emerald_forest'] as const)('%s每种高阶规模候选非空、完整合法且不堆纯辅助', region => {
    const support = new Set(['torch_fox', 'torch_fox_lord', 'lulu', 'kiki', 'light_moss', 'candle', 'lulu_king', 'gora', 'moss_beast', 'lantern_moth', 'lulu_god', 'gora_god', 'solar_spirit', 'eternal_moth']);
    const healers = new Set(['lulu', 'light_moss', 'candle', 'lulu_king', 'moss_beast', 'lantern_moth', 'lulu_god', 'solar_spirit', 'eternal_moth']);
    const ecology = MAIN_REGIONS[region];
    const allowed = [...ecology.basePool, ...ecology.evo1Pool, ...ecology.evo2Pool];
    for (const act of [1, 2]) for (const count of [1, 2, 3]) {
      const teams = highTierTeams(act, count, region);
      expect(teams.length).toBeGreaterThanOrEqual(3);
      for (const team of teams) {
        expect(team).toHaveLength(count);
        expect(team.every(id => allowed.includes(id))).toBe(true);
        const ranks = team.map(id => getMonster(id).rank).sort();
        expect(ranks.filter(rank => rank === act + 1)).toHaveLength(1);
        expect(ranks.every(rank => rank <= act + 1)).toBe(true);
        if (act === 2 && count === 3) expect(ranks).toEqual([1, 2, 3]);
        expect(team.some(id => !support.has(id))).toBe(true);
        expect(team.filter(id => healers.has(id)).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it.each(['mixed', 'emerald_forest'] as const)('%s实际抽样人数和整场高阶概率符合配置', region => {
    for (const act of [1, 2, 3]) for (const [phase, progress] of [.15, .5, 1].entries()) {
      const rng = createRng(1000 + act * 100 + phase);
      const counts = [0, 0, 0, 0];
      let higher = 0;
      let tooManyHigher = false;
      const sampleCount = 8000;
      for (let i = 0; i < sampleCount; i++) {
        const team = pickProgressEncounter(rng, act, progress, tables(act, region), region);
        counts[team.length - 1]++;
        if (act < 3) {
          const highCount = team.filter(unit => getMonster(unit.speciesId).rank === act + 1).length;
          if (highCount) higher++;
          if (highCount > 1) tooManyHigher = true;
        }
      }
      counts.forEach((count, i) => expect(Math.abs(count / sampleCount - ENCOUNTER_SIZE_WEIGHTS[act][phase][i] / 100)).toBeLessThan(.025));
      if (act < 3) expect(Math.abs(higher / sampleCount - highTierChance(act, progress))).toBeLessThan(.025);
      expect(tooManyHigher).toBe(false);
    }
  });

  it('出发单体、首个分支30/70且不出现三四人；零权重在rng=0时也不会被抽到', () => {
    for (const act of [1, 2, 3]) {
      const rng = createRng(act);
      for (let i = 0; i < 100; i++) {
        expect(pickProgressEncounter(rng, act, -.1, tables(act, 'mixed'), 'mixed')).toHaveLength(1);
        expect(pickProgressEncounter(rng, act, 0, tables(act, 'mixed'), 'mixed').length).toBeLessThanOrEqual(2);
      }
      expect(pickProgressEncounter(() => 0, act, 1, tables(act, 'mixed'), 'mixed').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('新地图首领前达到最大进度，情报使用锁定阵容；旧地图读档不重抽', () => {
    for (const region of ['mixed', 'emerald_forest'] as const) for (const act of [1, 2, 3]) for (let seed = 1; seed <= 30; seed++) {
      const map = generateMap(seed, act, 'normal', region);
      const state = { ...createInitialState(), seed, act, region, map };
      for (const node of map.layers.flat().filter(node => node.type === 'battle' || node.type === 'corrupted')) {
        const team = map.encounter[node.id];
        const detail = nodeInfo(state, node).detail;
        team.forEach(unit => expect(detail).toContain(getMonster(unit.speciesId).name));
        if (act === 1) expect(team.every(unit => getMonster(unit.speciesId).rank < 3)).toBe(true);
      }
      expect(migrateGameState(JSON.parse(JSON.stringify(state)))!.map).toEqual(map);
    }
  });
});
