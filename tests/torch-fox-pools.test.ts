import { describe, expect, it } from 'vitest';
import { MAIN_REGIONS } from '../src/game/data/regions';
import { STARTER_GROUP_1, STARTER_GROUP_2 } from '../src/game/data/monsters';
import { TIER2, LEGENDARY, getGrowthEliteEncounter, getGrowthEncounter } from '../src/game/core/growth-map';
import { createRng } from '../src/game/rng';
import { buildEventByType, generateRewards, MIXED_ENCOUNTER_TABLES, FOREST_ENCOUNTER_TABLES } from '../src/game/state/game';
import { createInitialState } from '../src/game/state/reducer';

describe('传火分支随机投放', () => {
  it.each(['mixed', 'emerald_forest'] as const)('%s 招募获得传火狐，新版神秘蛋含一二阶形态，开局限制不变', region => {
    const pool = MAIN_REGIONS[region];
    expect(pool.evo1Pool).toContain('torch_fox');
    expect(pool.evo2Pool).toContain('torch_fox_lord');
    expect([...pool.starters, ...pool.companions]).not.toContain('torch_fox');
    const recruits = new Set<string>(), eggs = new Set<string>();
    for (let seed = 1; seed <= 1500; seed++) {
      for (const reward of generateRewards({ ...createInitialState(), region, seed, act: 2 }))
        reward.recruitCandidates?.forEach(id => recruits.add(id));
      const event = buildEventByType(createRng(seed), 'egg', 3, region);
      event.choices.forEach(choice => { if (choice.monsterId) eggs.add(choice.monsterId); });
      for (const reward of generateRewards({ ...createInitialState(), region, seed, act: 1 }))
        expect(reward.recruitCandidates ?? []).not.toContain('torch_fox_lord');
    }
    expect(recruits.has('torch_fox')).toBe(true);
    expect(eggs.has('torch_fox')).toBe(true);
    expect(eggs.has('torch_fox_lord')).toBe(false);
    expect([...eggs].every(id => [...pool.basePool, ...pool.evo1Pool].includes(id))).toBe(true);
  });

  it('两地区组合池均投放，单体、斗兽场、车轮战不加入传火辅助', () => {
    for (const tables of [MIXED_ENCOUNTER_TABLES, FOREST_ENCOUNTER_TABLES]) {
      expect(tables.ACT2_ENCOUNTERS_2V2.some(e => e.species.includes('torch_fox'))).toBe(true);
      expect(tables.ACT3_ENCOUNTERS_3V3.some(e => e.species.includes('torch_fox_lord'))).toBe(true);
      expect(tables.ACT3_ELITE_ENCOUNTERS.some(e => e.species.includes('torch_fox_lord'))).toBe(true);
      for (const [name, entries] of Object.entries(tables)) {
        if (name.startsWith('ACT1') || name.includes('1V1') || name.includes('GAUNTLET') || name.includes('ARENA'))
          expect(JSON.stringify(entries)).not.toContain('torch_fox');
      }
    }
    expect([...STARTER_GROUP_1, ...STARTER_GROUP_2]).not.toContain('torch_fox');
  });

  it('熟练度按原品阶解锁进入随机池，不单独出场或组成纯传火队', () => {
    expect(TIER2).toContain('torch_fox');
    expect(LEGENDARY).toContain('torch_fox_lord');
    const seen = new Set<string>();
    for (const layer of [5, 15, 25, 35, 45]) for (let seed = 0; seed < 500; seed++) {
      for (const encounter of [getGrowthEncounter(layer, createRng(seed)), getGrowthEliteEncounter(layer, createRng(seed))]) {
        const ids = encounter.map(u => u.speciesId);
        ids.forEach(id => seen.add(id));
        expect(ids.every(id => id === 'torch_fox' || id === 'torch_fox_lord')).toBe(false);
        if (layer <= 15) expect(ids).not.toContain('torch_fox_lord');
      }
    }
    expect(seen.has('torch_fox')).toBe(true);
    expect(seen.has('torch_fox_lord')).toBe(true);
  });
});
