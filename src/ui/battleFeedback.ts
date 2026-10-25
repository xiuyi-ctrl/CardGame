import type { CombatImpact, StatusEffect } from '../game/types';
import { STATUS_ART } from './BuffIcon';

export interface FeedbackPop {
  text: string;
  heal: boolean;
  kind?: 'damage' | 'healing' | 'shield-loss' | 'shield-gain' | 'status' | 'notice';
  heavy?: boolean;
  shield?: boolean;
  buff?: boolean;
  debuff?: boolean;
  statusIcon?: StatusEffect['kind'];
}

/** 只格式化结算元数据，不模拟伤害或用共享群攻快照倒推数值。 */
export function impactPops(impact: CombatImpact, healingAction = false, damageAction = false, dotKind?: StatusEffect['kind']): FeedbackPop[] {
  const pops: FeedbackPop[] = [];
  const damage = impact.hpLoss + impact.shieldLoss;
  if (damage > 0) pops.push({ text: `−${damage}`, heal: false, kind: 'damage', heavy: damage >= 6, statusIcon: dotKind });
  if (impact.healing > 0) pops.push({ text: `+${impact.healing}`, heal: true, kind: 'healing' });
  if (impact.shieldGain > 0) pops.push({ text: `+${impact.shieldGain}`, heal: false, shield: true, kind: 'shield-gain', statusIcon: 'shield' });
  for (const [key, value] of Object.entries(impact.addedStatuses ?? {})) {
    const kind = key as StatusEffect['kind'];
    if (value && !['shield', 'burn', 'poison'].includes(kind)) pops.push({ text: `${STATUS_ART[kind][0]} +${value}`, heal: false, kind: 'status', statusIcon: kind });
  }
  if (healingAction && impact.healing === 0) pops.push({ text: '生命已满', heal: false, kind: 'notice' });
  if (damageAction && impact.hpLoss === 0 && impact.shieldLoss === 0) pops.push({ text: '未造成伤害', heal: false, kind: 'notice' });
  return pops;
}

/** 首批明确采用弹道的技能，其余攻击先使用短距离冲击。 */
export const RANGED_FEEDBACK_SKILLS = new Set([
  'ember', 'aqua_shot', 'leaf_needle', 'swift_needle', 'water_gun', 'water_wave', 'shockwave',
  'fire_shock', 'poison_sting', 'flame_feather', 'purifying_orb', 'solar_strike', 'fear_bolt',
  'dragon_breath', 'vine_whip', 'nine_tail_wildfire', 'burn_burst',
]);
