/** 熟练度挑战赛沿用精英整队预算，避免独立人数／传奇档位形成断层。 */
import { getGrowthEliteEncounter } from '../core/growth-map';

export function getGrowthArenaEncounter(layer: number, rng: () => number): { speciesId: string }[] {
  return getGrowthEliteEncounter(layer, rng);
}
