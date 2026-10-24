import type { Unit } from '../types';
import { SKILLS } from './skills';
import { getPassive } from './passives';

/** 依赖专属召唤、指定首领或不可取得的成长值，无法由百变兽独立结算。 */
export const MIMIC_BLOCKED_SKILLS = new Set([
  'rock_reforge', 'spore_summon', 'ghostly_summon', 'growth_summon',
  'soul_share', 'chain_link', 'growth_ultimate', 'growth_impact', 'growth_eruption',
]);

export function mimicSkillPool(units: Unit[]): string[] {
  return [...new Set(units.filter(unit => unit.hp > 0 && getPassive(unit.passive)?.kind !== 'mimic')
    .flatMap(unit => unit.skills))].filter(id => SKILLS[id] && !MIMIC_BLOCKED_SKILLS.has(id) && !SKILLS[id].growthCost);
}
