import { MAIN_REGIONS, type MainRegionId } from './regions';
import { weightedPick } from '../rng';

export interface ProgressEncounter { species: readonly string[]; weight: number }

/** 每场至多一只高阶；整组抽取，保留攻击、支援与防守的搭配。 */
export const HIGH_TIER_ENCOUNTERS: Record<number, readonly (readonly string[])[]> = {
  1: [
    ['momo_queen'], ['mimi_king'], ['sisi'], ['phantom_tail_fox'], ['coal_guard'], ['molten_beetle'], ['searing_hawk'], ['fifi_king'],
    ['momo_queen', 'lulu'], ['mimi_king', 'pipi'], ['sisi', 'mimi'], ['phantom_tail_fox', 'light_moss'], ['torch_fox', 'fire_fox'],
    ['coal_guard', 'coal'], ['molten_beetle', 'lulu'], ['searing_hawk', 'coal'], ['fifi_king', 'candle'],
    ['momo_queen', 'kiki', 'lulu'], ['mimi_king', 'pipi', 'lulu'], ['sisi', 'mimi', 'light_moss'],
    ['phantom_tail_fox', 'fire_fox', 'light_moss'], ['torch_fox', 'fire_fox', 'kiki'],
    ['molten_beetle', 'coal', 'candle'], ['searing_hawk', 'coal', 'ember_hawk'], ['coal_guard', 'fifi', 'candle'], ['fifi_king', 'kiki', 'lulu'],
  ],
  2: [
    ['momo_god'], ['mimi_god'], ['sisi_god'], ['nine_tail_sovereign'], ['furnace_beast'], ['molten_beast'], ['solar_eagle'], ['fifi_god'],
    ['momo_god', 'lulu_king'], ['mimi_god', 'sisi'], ['fifi_god', 'gora'], ['solar_eagle', 'coal_guard'],
    ['furnace_beast', 'lantern_moth'], ['nine_tail_sovereign', 'moss_beast'], ['torch_fox_lord', 'phantom_tail_fox'],
    ['momo_god', 'gora', 'lulu'], ['mimi_god', 'sisi', 'light_moss'], ['nine_tail_sovereign', 'torch_fox', 'fire_fox'],
    ['torch_fox_lord', 'phantom_tail_fox', 'kiki'], ['solar_spirit', 'mimi_king', 'pipi'],
    ['furnace_beast', 'searing_hawk', 'candle'], ['molten_beast', 'lantern_moth', 'coal'],
    ['solar_eagle', 'coal_guard', 'ember_hawk'], ['fifi_god', 'gora', 'light_moss'],
  ],
};

/** 前/中/后段分别为0~30%、30~70%、70~100%；数组依次为1~4名敌人的概率。 */
export const ENCOUNTER_SIZE_WEIGHTS: Record<number, readonly (readonly number[])[]> = {
  1: [[20, 75, 5, 0], [5, 60, 35, 0], [0, 30, 70, 0]],
  2: [[15, 65, 20, 0], [5, 50, 45, 0], [0, 25, 75, 0]],
  3: [[5, 45, 45, 5], [0, 30, 55, 15], [0, 15, 60, 25]],
};

export function highTierChance(act: number, progress: number): number {
  if (act !== 1 && act !== 2) return 0;
  const positions = [0, .3, .7, 1];
  const chances = act === 1 ? [0, .05, .2, .4] : [.05, .1, .25, .45];
  const p = Math.max(0, Math.min(1, progress));
  const end = positions.findIndex((point, i) => i > 0 && p <= point);
  return chances[end - 1] + (chances[end] - chances[end - 1]) * (p - positions[end - 1]) / (positions[end] - positions[end - 1]);
}

export function highTierTeams(act: number, count: number, region: MainRegionId): readonly (readonly string[])[] {
  const ecology = MAIN_REGIONS[region];
  const allowed = [...ecology.basePool, ...ecology.evo1Pool, ...ecology.evo2Pool];
  return (HIGH_TIER_ENCOUNTERS[act] ?? []).filter(team => team.length === count && team.every(id => allowed.includes(id)));
}

/** progress<0为出发，progress=0为首个分支层，末个非首领层为1。 */
export function pickProgressEncounter(rng: () => number, act: number, progress: number,
  tables: readonly (readonly ProgressEncounter[])[], region: MainRegionId): { speciesId: string }[] {
  const phase = progress < .3 ? 0 : progress < .7 ? 1 : 2;
  const weights = progress < 0 ? [100, 0, 0, 0] : progress === 0 ? [30, 70, 0, 0] : ENCOUNTER_SIZE_WEIGHTS[act][phase];
  const count = weightedPick(rng, weights.map((weight, index): [number, number] => [index + 1, weight]).filter(([, weight]) => weight > 0));
  if (progress >= 0 && act < 3 && rng() < highTierChance(act, progress)) {
    const teams = highTierTeams(act, count, region);
    return weightedPick(rng, teams.map(team => [team, 1] as const)).map(speciesId => ({ speciesId }));
  }
  return weightedPick(rng, tables[count - 1].map(team => [team, team.weight] as const)).species.map(speciesId => ({ speciesId }));
}
