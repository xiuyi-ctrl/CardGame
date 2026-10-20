import { canUnitUseSkill, createBattle, getActablePlayerUnits, getEffectiveSpd, makeUnit, playerCancelOrder, playerEndTurn, playerRest, playerSkill, resetUidSequenceForSimulation } from '../core/battle';
import { BASE_POOL, EVO1_POOL } from '../data/monsters';
import { getSkill } from '../data/skills';
import { BOSS_MINIONS, fuseUnit, maxFieldForEnemy } from '../state/game';
import type { BattleState, PlayerOrder, SkillDef, Unit } from '../types';

export const FUSION_POLICIES = ['greedy', 'lookahead'] as const;
export const FUSION_VARIANTS = ['before', 'empty', 'damage', 'healer'] as const;
export type FusionPolicy = typeof FUSION_POLICIES[number];
export type FusionVariant = typeof FUSION_VARIANTS[number];
export interface FusionEncounter { id: string; enemies: string[]; nodeType: 'battle' | 'elite' | 'boss' }

export function fusionEncounters(stage: 1 | 2): FusionEncounter[] {
  const ids = stage === 1 ? BASE_POOL : EVO1_POOL;
  const [fast, water, fire, guard, poison, thorn] = stage === 1 ? ids : [ids[0], ids[1], ids[2], ids[4], ids[5], ids[3]];
  const boss = stage === 1 ? 'boss_vine' : 'boss_golem';
  return [
    { id: '快攻', enemies: [fast, fire], nodeType: 'battle' },
    { id: '防守反伤', enemies: [guard, thorn], nodeType: 'battle' },
    { id: '毒火状态', enemies: [poison, fire], nodeType: 'battle' },
    { id: '回复消耗', enemies: [water, guard], nodeType: 'battle' },
    { id: '进阶精英', enemies: stage === 1 ? ['momo_queen', 'mimi_king'] : ['momo_god', 'mimi_god'], nodeType: 'elite' },
    { id: '首领小怪', enemies: [boss, ...BOSS_MINIONS[boss]], nodeType: 'boss' },
  ];
}

export function fusionTeam(id: string, variant: FusionVariant, wounded: boolean): Unit[] {
  const advanced = EVO1_POOL.includes(id);
  const defensive = ['kiki', 'gora', 'pipi', 'sisi'].includes(id);
  const primary = makeUnit(id, true, 0, false, defensive ? 'front' : 'back');
  const material = makeUnit(id, true, 2, false, defensive ? 'front' : 'back');
  const anchor = makeUnit(defensive ? (advanced ? 'momo_queen' : 'momo') : (advanced ? 'gora' : 'kiki'), true, 1, false);
  const spare = makeUnit(variant === 'healer' ? (advanced ? 'lulu_king' : 'lulu') : (advanced ? 'momo_queen' : 'momo'), true, 2, false, material.row);
  if (wounded) for (const unit of [primary, material, anchor, spare]) unit.hp = Math.ceil(unit.maxHp / 2);
  if (variant === 'before') return [primary, material, anchor];
  const evolved = fuseUnit(primary);
  if (!evolved) throw new Error(`不可融合：${id}`);
  return variant === 'empty' ? [evolved, anchor] : [evolved, spare, anchor];
}

function targets(b: BattleState, actor: Unit, skill: SkillDef): Array<string | undefined> {
  if (skill.target === 'ally') return b.playerUnits.filter(unit => unit.hp > 0).map(unit => unit.uid);
  if (skill.target !== 'single') return [undefined];
  const enemies = b.enemyUnits.filter(unit => unit.hp > 0);
  const taunt = actor.statuses.find(status => status.kind === 'taunt')?.sourceUid;
  if (taunt && enemies.some(unit => unit.uid === taunt)) return [taunt];
  const front = enemies.filter(unit => unit.row === 'front');
  const back = enemies.filter(unit => unit.row === 'back');
  const pool = skill.reach === 'direct' ? enemies : skill.reach === 'back' ? (back.length ? back : front) : (front.length ? front : back);
  return [...pool].sort((a, z) => a.hp - z.hp).map(unit => unit.uid);
}

function greedyOrder(b: BattleState, actor: Unit): PlayerOrder {
  const usable = actor.skills.filter(id => canUnitUseSkill(actor, id)).map(getSkill);
  const heal = usable.find(skill => skill.kind === 'heal');
  const ally = b.playerUnits.filter(unit => unit.hp > 0).sort((a, z) => a.hp / a.maxHp - z.hp / z.maxHp)[0];
  if (heal && ally && ally.hp / ally.maxHp < 0.5) return { skillId: heal.id, targetUid: heal.target === 'ally' ? ally.uid : undefined };
  const skill = usable.filter(item => item.kind !== 'heal' && item.target !== 'ally' && item.target !== 'allyAll').sort((a, z) => (z.damage ?? 0) - (a.damage ?? 0))[0] ?? usable[0];
  return skill ? { skillId: skill.id, targetUid: targets(b, actor, skill)[0] } : { skillId: 'rest' };
}

function applyOrder(b: BattleState, actor: Unit, order: PlayerOrder): BattleState {
  const without = playerCancelOrder(b, actor.uid);
  // 休息指令再次点击会取消，先移除原休息以便评估同一候选。
  const clean = without.orders?.[actor.uid]?.skillId === 'rest' ? playerRest(without, actor.uid) : without;
  return order.skillId === 'rest' ? playerRest(clean, actor.uid) : playerSkill(clean, actor.uid, order.skillId, order.targetUid);
}

function utility(b: BattleState): number {
  const side = (units: Unit[]) => units.filter(unit => unit.hp > 0).reduce((sum, unit) => {
    let statusValue = 0;
    for (const status of unit.statuses) {
      if (['burn', 'poison', 'thorns'].includes(status.kind)) statusValue -= status.value;
      if (status.kind === 'atkUp') statusValue += status.value * 1.5;
      if (status.kind === 'atkDown') statusValue -= status.value * 1.5;
      if (status.kind === 'stun') statusValue -= 5;
      if (status.kind === 'spdDown') statusValue -= status.value * 0.5;
      if (['shieldCounter', 'waterCurtain', 'flameShield', 'thornSpikes'].includes(status.kind)) statusValue += 2;
    }
    return sum + unit.hp + unit.shield * 0.35 + 25 + statusValue * 0.6;
  }, 0);
  return side(b.playerUnits) - side(b.enemyUnits) + (b.phase === 'won' ? 1000 : b.phase === 'lost' ? -1000 : 0);
}

export function planFusionRound(b: BattleState, policy: FusionPolicy): BattleState {
  const actors = getActablePlayerUnits(b);
  let planned = b;
  for (const actor of actors) planned = applyOrder(planned, actor, greedyOrder(b, actor));
  if (policy === 'greedy') return planned;
  // 完整队伍已下指令后，逐只枚举技能与合法目标，做一遍坐标改进。
  // 使用真实引擎预演该回合，但不把预演状态写回实战；不代表真人策略或全局最优。
  for (const actor of actors) {
    const candidates: PlayerOrder[] = [{ skillId: 'rest' }];
    for (const skill of actor.skills.filter(id => canUnitUseSkill(actor, id)).map(getSkill)) {
      for (const targetUid of targets(b, actor, skill)) candidates.push({ skillId: skill.id, targetUid });
    }
    let best = planned;
    let bestScore = utility(playerEndTurn({ ...planned, telemetry: undefined, telemetryHp: undefined, log: [] }));
    for (const order of candidates) {
      const trial = applyOrder(planned, actor, order);
      const score = utility(playerEndTurn({ ...trial, telemetry: undefined, telemetryHp: undefined, log: [] }));
      if (score > bestScore + 1e-9) { best = trial; bestScore = score; }
    }
    planned = best;
  }
  return planned;
}

export interface FusionTrial {
  openingSkill?: string;
  speciesId: string; stage: 1 | 2; variant: FusionVariant; policy: FusionPolicy; wounded: boolean; encounter: string; seed: number;
  result: 'won' | 'lost' | 'timeout'; rounds: number; deaths: number; hpStart: number; hpEnd: number; actions: number;
  damage3: number; taken3: number; healing3: number; shield3: number; statuses3: number;
  damage: number; taken: number; healing: number; shielding: number; statusApplications: number;
  focusSkillUses: Record<string, number>;
}

export function simulateFusionTrial(speciesId: string, variant: FusionVariant, policy: FusionPolicy, wounded: boolean, encounter: FusionEncounter, seed: number, openingSkill?: string): FusionTrial {
  resetUidSequenceForSimulation(seed);
  const stage = EVO1_POOL.includes(speciesId) ? 2 : 1;
  const team = fusionTeam(speciesId, variant, wounded);
  if (team.length > maxFieldForEnemy(encounter.enemies.length, 'main')) throw new Error('非法出战人数');
  let b = createBattle(team, encounter.enemies.map(id => ({ speciesId: id })), seed, { act: stage, nodeType: encounter.nodeType, difficulty: 'normal', untameable: true, collectTelemetry: true });
  const start = b;
  let turns = 0;
  let earlyEnd = b;
  while (b.phase === 'acting' && turns < 50) {
    let planned = planFusionRound(b, policy);
    if (turns === 0 && openingSkill) {
      const actor = b.playerUnits[0];
      if (!canUnitUseSkill(actor, openingSkill) || !actor.skills.includes(openingSkill)) throw new Error('无效起手技能');
      planned = applyOrder(planned, actor, { skillId: openingSkill, targetUid: targets(b, actor, getSkill(openingSkill))[0] });
    }
    b = playerEndTurn(planned);
    turns++;
    if (turns <= 3) earlyEnd = b;
  }
  const events = b.telemetry ?? [];
  const focusIds = new Set((variant === 'before' ? team.slice(0, 2) : team.slice(0, 1)).map(unit => unit.uid));
  const focusSkillUses: Record<string, number> = {};
  for (const event of events) if (event.kind === 'skill-use' && event.skillId && event.actorUid && focusIds.has(event.actorUid)) focusSkillUses[event.skillId] = (focusSkillUses[event.skillId] ?? 0) + 1;
  const total = measureFusionBattle(start, b), early = measureFusionBattle(start, earlyEnd);
  return {
    speciesId, stage, variant, policy, wounded, encounter: encounter.id, seed, openingSkill,
    result: b.phase === 'acting' ? 'timeout' : b.phase, rounds: turns,
    deaths: b.playerUnits.filter(unit => unit.hp <= 0).length,
    hpStart: start.playerUnits.reduce((sum, unit) => sum + unit.hp, 0), hpEnd: b.playerUnits.reduce((sum, unit) => sum + Math.max(0, unit.hp), 0),
    actions: events.filter(event => event.kind === 'skill-use' && event.side === 'player').length,
    damage3: early.damage, taken3: early.taken, healing3: early.healing, shield3: early.shielding,
    statuses3: early.statuses, damage: total.damage, taken: total.taken, healing: total.healing, shielding: total.shielding, statusApplications: total.statuses, focusSkillUses,
  };
}

export function measureFusionBattle(start: BattleState, b: BattleState) {
  const ids = new Set(start.playerUnits.map(unit => unit.uid));
  const hp = Object.fromEntries([...start.playerUnits, ...start.enemyUnits].map(unit => [unit.uid, unit.hp]));
  const shields = Object.fromEntries(start.playerUnits.map(unit => [unit.uid, unit.shield]));
  let damage = 0, taken = 0, healing = 0, shielding = 0;
  for (const entry of b.log) {
    for (const [uid, value] of Object.entries(entry.hp ?? {})) {
      const delta = Math.max(0, value) - (hp[uid] ?? Math.max(0, value));
      if (ids.has(uid)) { if (delta < 0) taken -= delta; else healing += delta; }
      else if (delta < 0) damage -= delta;
      hp[uid] = Math.max(0, value);
    }
    for (const [uid, value] of Object.entries(entry.shields ?? {})) {
      if (ids.has(uid)) shielding += Math.max(0, value - (shields[uid] ?? value));
      shields[uid] = value;
    }
  }
  return { damage, taken, healing, shielding, statuses: (b.telemetry ?? []).filter(event => event.kind === 'status' && event.side === 'player').length };
}

export function fusionStatBudget(id: string) {
  const base = makeUnit(id, true, 0, false), evolved = fuseUnit(base)!;
  const skills = (unit: Unit) => unit.skills.map(getSkill).filter(skill => skill.kind === 'attack').map(skill => ({ id: skill.id, raw: (skill.damage ?? 0) * (skill.hits ?? 1), target: skill.target }));
  return { speciesId: id, nextId: evolved.speciesId, pairHp: base.maxHp * 2, fusedHp: evolved.maxHp, hpRatio: evolved.maxHp / (base.maxHp * 2), oldSpd: getEffectiveSpd(base), newSpd: getEffectiveSpd(evolved), beforeActions: 2, afterActions: 1, beforeSkills: skills(base), afterSkills: skills(evolved) };
}
