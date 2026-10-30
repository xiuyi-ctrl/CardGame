import type { BattleState, SkillDef, StatusEffect, TestSkillOverride } from '../types';
import { getSkill } from './skills';

// 这些效果由专属机制直接结算，不能把数据表中的展示值当作可编辑参数。
const FIXED_EFFECT_SKILLS = new Set(['flame_tail_shield', 'molten_self_burn', 'illusory_flame', 'clean_flame_care', 'despair_gaze', 'sun_sunder', 'solar_strike', 'time_lag']);
const FIXED_LIMIT_SKILLS = new Set(['mirror_copy', 'ride_wind', 'mirror_speed_up', 'mirror_speed_down', 'chain_activate', 'soul_share', 'growth_summon', 'chain_bind', 'chain_link', 'rock_reforge', 'spore_summon', 'ghostly_summon', 'puppet_soul_return', 'ghost_burst']);

export const testEffectValueEditable = (kind: StatusEffect['kind']) => !['stun', 'taunt'].includes(kind);
export const testEffectTurnsEditable = (kind: StatusEffect['kind']) => !['burn', 'poison', 'shield'].includes(kind);

export function testSkillEditable(skill: SkillDef) {
  return {
    damage: (skill.damage ?? 0) > 0 && !['puppet_soul_return', 'ghost_burst'].includes(skill.id),
    heal: (skill.heal ?? 0) > 0 && skill.id !== 'water_wave',
    hits: skill.kind === 'attack' && (skill.damage ?? 0) > 0 && !['chain_activate', 'puppet_soul_return', 'ghost_burst'].includes(skill.id),
    cooldown: !FIXED_LIMIT_SKILLS.has(skill.id), uses: !FIXED_LIMIT_SKILLS.has(skill.id),
    effects: !!skill.effects?.length && !FIXED_EFFECT_SKILLS.has(skill.id)
      && skill.effects.every(effect => !['emberSeed', 'foxTailGuard', 'sunRadiance', 'timeLag', 'burnBrand', 'chainLink', 'skillSealPending'].includes(effect.kind)),
  };
}

export function validTestSkillOverride(skill: SkillDef, patch: TestSkillOverride): boolean {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length) return false;
  const editable = testSkillEditable(skill);
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.keys(editable).includes(key) || !editable[key as keyof typeof editable]) return false;
    if (key === 'effects') {
      if (!Array.isArray(value) || value.length !== skill.effects!.length) return false;
      if (!value.every((effect, i) => effect && effect.kind === skill.effects![i].kind
        && Object.keys(effect).every(key => ['kind', 'value', 'turns'].includes(key))
        && Number.isSafeInteger(effect.value) && effect.value >= 1 && effect.value <= 99
        && Number.isSafeInteger(effect.turns) && effect.turns >= 0 && effect.turns <= 99
        && (testEffectValueEditable(effect.kind) || effect.value === skill.effects![i].value)
        && (testEffectTurnsEditable(effect.kind) || effect.turns === skill.effects![i].turns))) return false;
    } else {
      const min = key === 'cooldown' || key === 'uses' ? 0 : 1;
      const max = key === 'hits' ? 20 : key === 'damage' || key === 'heal' ? 999 : 99;
      if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < min || value > max) return false;
    }
  }
  return true;
}

export function getBattleSkill(battle: Pick<BattleState, 'testSkillOverrides'> | undefined, id: string): SkillDef {
  const skill = getSkill(id), patch = battle?.testSkillOverrides?.[id];
  return patch ? { ...skill, ...patch, uses: patch.uses === 0 ? undefined : patch.uses ?? skill.uses, testAdjusted: true } : skill;
}
