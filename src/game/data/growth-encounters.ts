import { TIER1, TIER2, LEGENDARY, getGrowthEliteEncounter, growthEncounterPlans } from '../core/growth-map';
import { pick, weightedPick } from '../rng';
import { MIXED_ENCOUNTER_TABLES } from '../state/game';

export function growthNormalTiers(layer: number): [string[], number][] {
  return layer <= 10 ? [[TIER1, 1]] : layer <= 25 ? [[TIER1, 3], [TIER2, 2]]
    : layer <= 40 ? [[TIER1, 1], [TIER2, 4]] : [[TIER2, 1], [LEGENDARY, 1]];
}
export function growthCompanions(layer: number, rng: () => number): string[] {
  const choices: string[] = [];
  for (let i = 0; i < 2; i++) {
    const tiers = growthNormalTiers(layer).map(([pool, weight]): [string[], number] => [pool.filter(id => !choices.includes(id)), weight]).filter(([pool]) => pool.length > 0);
    choices.push(pick(rng, weightedPick(rng, tiers)));
  }
  return choices;
}
export function growthDuelEnemy(layer: number, rng: () => number): { speciesId: string }[] {
  const tables = MIXED_ENCOUNTER_TABLES;
  const solo = new Set([...tables.ACT1_ENCOUNTERS_1V1, ...tables.ACT2_ENCOUNTERS_1V1, ...tables.ACT3_ENCOUNTERS_1V1].flatMap(entry => entry.species));
  // 单人考核只取普通战模板的最高品阶，不把整队人数或精英预算带入1v1。
  const rank = Math.max(...weightedPick(rng, growthEncounterPlans(layer)));
  const pool = [TIER1, TIER2, LEGENDARY][rank - 1].filter(id => solo.has(id));
  return [{ speciesId: pick(rng, pool) }];
}

// 协同试炼与精英共用整队成长；早期至少两名对手，不在16层突然追加第三人。
export function growthTrialEnemies(layer: number, rng: () => number): { speciesId: string }[] {
  const enemies = getGrowthEliteEncounter(layer, rng);
  return enemies.length >= 2 ? enemies : [...enemies, { speciesId: pick(rng, ['coal', 'fifi', 'mimi', 'pipi']) }];
}
