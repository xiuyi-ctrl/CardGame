import { describe, expect, it } from 'vitest';
import { getGrowthEncounter, getGrowthEliteEncounter, growthEncounterPlans } from '../src/game/core/growth-map';
import { createRng } from '../src/game/rng';
import { getMonster } from '../src/game/data/monsters';
import { getEnemySkillTier } from '../src/game/core/enemy-progression';
import { createBattle, makeUnit, getProficiencyEnemyScaling } from '../src/game/core/battle';
import { growthTrialEnemies } from '../src/game/data/growth-encounters';
import { getGrowthArenaEncounter } from '../src/game/data/growth-arena';

const ranks = (team: { speciesId: string }[]) => team.map(e => getMonster(e.speciesId).rank);
const strength = (layer: number, elite = false) => growthEncounterPlans(layer, elite)
  .reduce((sum, [team, weight]) => sum + team.reduce((n, rank) => n + [0, 1, 2, 3.5][rank], 0) * weight / 100, 0);

describe('熟练度敌人平滑成长', () => {
  it('整队预算逐层递增，首领后不跳档，精英只领先有限预算', () => {
    for (const elite of [false, true]) for (let layer = 2; layer <= 50; layer++) {
      const increase = strength(layer, elite) - strength(layer - 1, elite);
      expect(increase).toBeGreaterThanOrEqual(-1e-10);
      expect(increase).toBeLessThanOrEqual(.25);
    }
    for (const layer of [16, 31]) {
      expect(strength(layer)).toBe(strength(layer - 2));
      expect(strength(layer, true)).toBe(strength(layer - 2, true));
      expect(getEnemySkillTier(layer)).toEqual(getEnemySkillTier(layer - 2));
    }
    for (let layer = 1; layer <= 50; layer++) {
      expect(strength(layer, true)).toBeGreaterThanOrEqual(strength(layer));
      expect(strength(layer, true) - strength(layer)).toBeLessThanOrEqual(1.2);
    }
  });

  it('所有层段符合整队模板、确定性、单体排除辅助，组合保留进攻者', () => {
    const support = new Set(['candle', 'lantern_moth', 'eternal_moth', 'light_moss', 'moss_beast', 'solar_spirit', 'torch_fox', 'torch_fox_lord']);
    for (const elite of [false, true]) for (let layer = 1; layer <= 50; layer++) {
      const plans = growthEncounterPlans(layer, elite);
      expect(plans.reduce((n, [, weight]) => n + weight, 0)).toBeCloseTo(100);
      for (let seed = 0; seed < 100; seed++) {
        const generate = elite ? getGrowthEliteEncounter : getGrowthEncounter;
        const team = generate(layer, createRng(seed));
        expect(generate(layer, createRng(seed))).toEqual(team);
        expect(plans.some(([plan, weight]) => weight > 0 && plan.join() === ranks(team).join())).toBe(true);
        expect(team.some(e => !support.has(e.speciesId))).toBe(true);
        if (layer <= 20) expect(ranks(team)).not.toContain(3);
        if (!elite && layer <= 5) expect(ranks(team)).toEqual([1]);
        if (!elite && layer <= 20) expect(team.length).toBeLessThanOrEqual(2);
        if (layer <= 29) expect(ranks(team).filter(rank => rank === 3).length).toBeLessThanOrEqual(1);
      }
    }
    expect(strength(10)).toBeGreaterThan(strength(5));
    expect(strength(14)).toBeGreaterThan(strength(10));
  });

  it('技能一次只提升一个维度，精英不额外叠强化，生命曲线保留', () => {
    for (let layer = 2; layer <= 50; layer++) {
      const previous = getEnemySkillTier(layer - 1), current = getEnemySkillTier(layer);
      const changes = (['enhanceCount', 'enhanceLevel', 'replaceCount'] as const).filter(key => previous[key] !== current[key]);
      expect(changes.length).toBeLessThanOrEqual(previous.enhanceCount === 0 ? 2 : 1);
    }
    for (const layer of [8, 16, 23, 28, 35, 45, 50]) {
      const player = [makeUnit('momo_god', true, 0, false)];
      const normal = createBattle(player, [{ speciesId: 'momo' }], 1, { layer });
      const elite = createBattle(player, [{ speciesId: 'momo' }], 1, { layer, nodeType: 'elite' });
      expect(elite.enemyUnits[0].skillEnhancements).toEqual(normal.enemyUnits[0].skillEnhancements);
      expect(elite.enemyUnits[0].skills).toEqual(normal.enemyUnits[0].skills);
      expect(normal.enemyUnits[0].maxHp).toBe(Math.round(makeUnit('momo', false, 0, false).maxHp * getProficiencyEnemyScaling(layer).hpMult));
    }
  });

  it('挑战赛和协同试炼不再在16、21层突增人数或投放传奇', () => {
    for (const generate of [growthTrialEnemies, getGrowthArenaEncounter]) {
      for (let seed = 0; seed < 100; seed++) {
        for (const layer of [14, 16, 20]) expect(ranks(generate(layer, createRng(seed)))).not.toContain(3);
        expect(generate(16, createRng(seed))).toHaveLength(generate(14, createRng(seed)).length);
        expect(generate(21, createRng(seed)).length).toBeLessThanOrEqual(3);
      }
    }
  });
});
