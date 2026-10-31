import type { BattleState, BattleTelemetryEvent, LogEntry, LogSpan, PassiveDef, PassiveKind, PlayerOrder, SkillDef, StatusEffect, Unit } from '../types';
import { getSkill, SKILLS } from '../data/skills';
import { getBattleSkill } from '../data/test-skill-overrides';
import { getMonster } from '../data/monsters';
import { getFood } from '../data/foods';
import { getPassive, PASSIVES } from '../data/passives';
import { mimicSkillPool, MIMIC_BLOCKED_SKILLS } from '../data/mimic';
import { createRng, shuffle } from '../rng';
import type { Difficulty } from '../state/game';
import { DIFFICULTY_CONFIG } from '../state/game';
import { getSkillEnhanceLevel, getSkillEnhanceBonus, getSkillEffectEnhanceBonus } from './growth';
import { applyEnemySkillProgression } from './enemy-progression';

export const TAME_THRESHOLD = 0.4;
/** 每次驯服失败增加5个百分点，最多补偿两次，仍受品阶上限限制。 */
export const TAME_FAIL_BONUS = 0.05;
/** 战斗棋盘每排列数（前后排各 3 列 = 6 格） */
export const FIELD_COLS = 3;
/** 休息指令的特殊 skillId（orders 里用它表示「本回合不行动」，可再次点击取消） */
export const REST_SKILL_ID = 'rest';
const NEGATIVE_STATUSES = new Set<StatusEffect['kind']>([
  'burn', 'poison', 'burnBrand', 'atkDown', 'spdDown', 'stun', 'taunt', 'thorns', 'shadowMark', 'fear', 'chainLink', 'skillSeal', 'skillSealPending', 'timeLag',
]);
/** 前排倾向被动：防守/续航类，该被动生物站前排 */
const FRONT_PASSIVES: PassiveKind[] = [
  'hp', 'guard', 'thorns', 'furnace', 'burnShield', 'crystalConversion', 'regen', 'damageCap', 'thornRoyal',
  'bigHitGuard', 'spdOnHit', 'treeSpeedUp', 'lifeSpring',
  'rockShellBreak', 'rockShard', 'chainMaster', 'chainAnchor',
];
/** 后排倾向被动：进攻/输出类，该被动生物站后排 */
const BACK_PASSIVES: PassiveKind[] = [
  'power', 'frenzy', 'venom', 'scorch', 'drain', 'venomPower',
  'speedBonus', 'fasterDamage', 'scorchPlus', 'poisonBreak', 'spdOnAttack',
  'tideRhythm', 'tideEcho', 'thornEntangle', 'soulSiphon', 'chainSpark',
  'afterglow', 'eternalLight', 'burnStripShield',
];
/** AI 选择行动时 softmax 温度：越小越趋向最高分，越大越随机（默认 12） */
const SOFTMAX_TEMP = 12;

/** 第15回合末起，战场崩解直接扣生命，替代旧攻击疲劳增伤。 */
export const BATTLE_FATIGUE_START_ROUND = 15;
/** 崩解触发前两回合首次预警。 */
export const BATTLE_COLLAPSE_WARNING_ROUND = BATTLE_FATIGUE_START_ROUND - 2;
export function battleCollapseDamage(round: number): number {
  return round >= BATTLE_FATIGUE_START_ROUND ? Math.max(0, round - 10) : 0;
}

function applyBattleCollapse(b: BattleState): BattleState {
  const damage = battleCollapseDamage(b.round);
  if (!damage || b.collapseResolvedRound === b.round || b.phase !== 'acting') return b;
  const alive = [...b.playerUnits, ...b.enemyUnits].filter(u => u.hp > 0);
  let nb: BattleState = { ...b, collapseResolvedRound: b.round };
  // 同一批次先扣完双方生命，再处理死亡连锁并判定胜负，不能先扣一侧就结束。
  for (const unit of alive) nb = replaceUnit(nb, { ...unit, hp: Math.max(0, unit.hp - damage) });
  nb = pushLog(nb, `战场崩解！对全体造成 ${damage} 点真实伤害`, 'info', undefined, undefined, undefined, alive.map(u => u.uid));
  for (const unit of alive) {
    const current = actorFromId(nb, unit.uid)!;
    if (current.hp <= 0) nb = applyDefeatedTarget(nb, current);
  }
  return checkEnd(nb);
}

/** 创建战斗的可选参数（地图节点特殊模式） */
export interface BattleOptions {
  relics?: string[];
/** 被侵蚀 debuff：'spd' 我方速度 -2 | 'dmg' 我方受到伤害 +2 | 'burn' 每回合结束受到 2 点伤害 | 'immune' 敌人免疫负面效果 */
corruptDebuff?: 'spd' | 'dmg' | 'burn' | 'immune';
  /** 车轮战：敌方 2~3 只轮换上阵 */
  gauntlet?: boolean;
  /** 敌方不可驯服（斗兽场/车轮战） */
  untameable?: boolean;
  /** 敌方按指定数量原样创建（自定义测试用）：不按我方数量压缩、不复制补齐 */
  enemyExact?: boolean;
  /** 当前幕次（1/2/3），影响 AI 行为差异 */
  act?: number;
  /** 节点类型（battle/elite/arena/gauntlet/corrupted/guardian），影响 AI 行为差异 */
  nodeType?: string;
  /** 难度等级，影响敌方属性缩放 */
  difficulty?: Difficulty;
  /** 成长远征：当前层数，普通敌人的生命与速度按独立曲线缩放，Boss不缩放 */
  layer?: number;
  /** 特殊遭遇生命倍率；默认 1，仅用于斗兽场与第一阶段远征 Boss。 */
  encounterHpMult?: number;
  /** 竞技场模拟战：用这些单位的克隆作为敌人（完整复制属性/技能/被动/强化） */
  mirrorUnits?: Unit[];
  /** 数值平衡模拟专用：收集结构化事件，不影响战斗逻辑与随机序列。 */
  collectTelemetry?: boolean;
}

/** 熟练度远征敌人缩放：生命连续成长，速度每 10 层离散增加。 */
export function getProficiencyEnemyScaling(layer: number): { hpMult: number; spdBonus: number } {
  const safeLayer = Math.max(1, Math.min(50, Math.floor(layer)));
  let hpMult: number;
  if (safeLayer <= 15) hpMult = 1 + (safeLayer - 1) * 0.04;
  else if (safeLayer <= 30) hpMult = 1.56 + (safeLayer - 15) * 0.06;
  else hpMult = 2.46 + (safeLayer - 30) * 0.08;
  return { hpMult, spdBonus: Math.min(4, Math.floor((safeLayer - 1) / 10)) };
}

export function computeStats(speciesId: string) {
  const s = getMonster(speciesId);
  return { maxHp: s.baseHp, spd: s.baseSpd };
}

let uidCounter = 0;
let uidSalt: number | undefined;

/** 数值模拟专用：重置 UID 序列并使用固定盐；不调用时仍使用实时时间盐。 */
export function resetUidSequenceForSimulation(salt: number): void {
  uidCounter = 0;
  uidSalt = salt;
}

export function nextUid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}${uidCounter}_${uidSalt ?? Date.now() % 100000}`;
}

export function makeUnit(
  speciesId: string,
  isPlayer: boolean,
  column: 0 | 1 | 2,
  tameable: boolean,
  row: 'front' | 'back' = 'front',
): Unit {
  const s = getMonster(speciesId);
  const passive = getPassive(s.passive);
  const hpBonus = passive?.kind === 'hp' ? passive.value : 0;
  const spdBonus = passive?.kind === 'spd' ? passive.value : 0;
  const skillUses: Record<string, number> = {};
  for (const id of s.skills) {
    const def = getSkill(id);
    if (def.uses !== undefined) skillUses[id] = def.uses;
  }
  // 也初始化第二形态技能的使用次数
  for (const id of (s.altSkills ?? [])) {
    const def = getSkill(id);
    if (def.uses !== undefined && !(id in skillUses)) skillUses[id] = def.uses;
  }
  return {
    uid: nextUid(isPlayer ? 'p' : 'e'),
    speciesId,
    name: s.name,
    emoji: s.emoji,
    image: s.image,
    maxHp: s.baseHp + hpBonus,
    hp: s.baseHp + hpBonus,
    spd: s.baseSpd + spdBonus,
    skills: [...s.skills],
    passive: s.passive,
    altSkills: s.altSkills ? [...s.altSkills] : undefined,
    altPassive: s.altPassive,
    skillUses,
    statuses: [],
    shield: 0,
    column,
    row,
    isPlayer,
    tameable,
    acted: false,
    soul: passive?.kind === 'soulSiphon' ? 0 : undefined,
    passiveSpdBonus: spdBonus || undefined,
    growthValue: s.growthValue,
  };
}

export function cloneUnit(u: Unit): Unit {
  return {
    ...u,
    statuses: u.statuses.map((s) => ({ ...s })),
    skillUses: u.skillUses ? { ...u.skillUses } : undefined,
  };
}

/** 更新技能列表并同步 skillUses（新技能补入次数限制） */
export function updateUnitSkills(unit: Unit, newSkills: string[]): Unit {
  const newSkillUses = { ...unit.skillUses };
  for (const id of newSkills) {
    if (!(id in newSkillUses)) {
      const def = getSkill(id);
      if (def.uses !== undefined) newSkillUses[id] = def.uses;
    }
  }
  const paid = unit.skillEnhancePaid && Object.fromEntries(Object.entries(unit.skillEnhancePaid).filter(([slot]) => unit.skills[Number(slot)] === newSkills[Number(slot)]));
  return { ...unit, skills: newSkills, skillUses: newSkillUses, ...(paid ? { skillEnhancePaid: paid } : {}) };
}

/** 获取单位的被动技能定义。当 chainMaster 被链接时，返回链接单位的被动 */
export function getUnitPassive(u: Unit, b?: BattleState): PassiveDef | undefined {
  const base = getPassive(u.passive);
  if (base?.kind === 'chainMaster' && b) {
    const chainLink = u.statuses.find((s) => s.kind === 'chainLink');
    if (chainLink?.sourceUid) {
      const linked = [...b.playerUnits, ...b.enemyUnits].find((x) => x.uid === chainLink.sourceUid && x.hp > 0);
      if (linked) return getPassive(linked.passive);
    }
  }
  return base;
}

/** 技能的剩余使用次数（无限制技能返回 Infinity） */
export function skillUsesLeft(u: Unit, skillId: string, b?: BattleState): number {
  const limit = getBattleSkill(b, skillId).uses;
  if (b?.testSkillOverrides?.[skillId]?.uses !== undefined) return limit === undefined ? Infinity : b.testSkillUses?.[u.uid]?.[skillId] ?? limit;
  return limit === undefined ? Infinity : u.skillUses?.[skillId] ?? limit;
}

/** 消耗一次技能使用次数 */
function consumeSkillUse(b: BattleState, actor: Unit, skillId: string): BattleState {
  const current = actorFromId(b, actor.uid);
  if (!current) return b;
  const left = skillUsesLeft(current, skillId, b);
  if (!Number.isFinite(left)) return b;
  if (b.testSkillOverrides?.[skillId]?.uses !== undefined) return { ...b, testSkillUses: {
    ...b.testSkillUses, [current.uid]: { ...b.testSkillUses?.[current.uid], [skillId]: Math.max(0, left - 1) },
  } };
  const next = { ...current.skillUses, [skillId]: Math.max(0, left - 1) };
  return replaceUnit(b, { ...current, skillUses: next });
}

/** 技能冷却剩余回合数（无冷却返回 0） */
export function skillCooldownLeft(u: Unit, skillId: string, b?: BattleState): number {
  if (b?.testSkillOverrides?.[skillId]?.cooldown !== undefined) return b.testSkillOverrides[skillId].cooldown === 0 ? 0 : u.skillCooldowns?.[skillId] ?? 0;
  if (skillId === 'solar_heal' || skillId === 'ember_transfer' || skillId === 'heal_light' || skillId === 'furnace_shell' || skillId === 'ember_veil' || skillId === 'sand_shield') return 0;
  return u.skillCooldowns?.[skillId] ?? 0;
}

/**
 * 单位当前是否可以选择指定技能。
 * 集中校验次数、冷却、封印与成长值，供玩家入口、AI 和自动模拟共用。
 */
export function canUnitUseSkill(u: Unit, skillId: string, b?: BattleState): boolean {
  if (skillId === 'mirror_copy') return false;
  if (skillUsesLeft(u, skillId, b) <= 0 || skillCooldownLeft(u, skillId, b) > 0) return false;
  const sealed = u.statuses.some(
    (status) => status.kind === 'skillSeal' && (status.sealedSkills ?? []).includes(skillId),
  );
  if (sealed) return false;
  const skill = getBattleSkill(b, skillId);
  return !skill.growthCost || (u.growthValue ?? 0) >= skill.growthCost;
}

/** 设置技能冷却（使用后调用） */
function applySkillCooldown(b: BattleState, actor: Unit, skill: SkillDef): BattleState {
  if (!skill.cooldown) return b;
  const current = actorFromId(b, actor.uid);
  if (!current) return b;
  // startRound 会在下一回合开头立即递减，因此存储 cooldown+1 确保实际冷却回合数正确
  const next = { ...current.skillCooldowns, [skill.id]: skill.cooldown + 1 };
  return replaceUnit(b, { ...current, skillCooldowns: next });
}

/**
 * 在战斗状态上取一个随机数，并推进 RNG 计数。
 * 纯函数式：任何随机抽取都必须经由 useRng，保证可复现。
 */
export function useRng(b: BattleState, fn: (value: number, b2: BattleState) => BattleState): BattleState {
  const value = createRng((b.seed + b.rngCount * 7919) >>> 0)();
  return fn(value, { ...b, rngCount: b.rngCount + 1 });
}

export function computeTurnOrder(b: BattleState): string[] {
  const all = [...b.playerUnits, ...b.enemyUnits]
    .filter((u) => u.hp > 0)
    .sort((a, c) => {
      const aLast = a.statuses.some(s => s.kind === 'timeLag' && s.appliedRound === b.round);
      const cLast = c.statuses.some(s => s.kind === 'timeLag' && s.appliedRound === b.round);
      if (aLast !== cLast) return aLast ? 1 : -1;
      // 先手技能优先：使用 priority:'first' 技能的单位必定最先行动
      const aOrder = b.orders?.[a.uid];
      const cOrder = b.orders?.[c.uid];
      const aSkill = aOrder && aOrder.skillId !== REST_SKILL_ID ? getSkill(aOrder.skillId) : undefined;
      const cSkill = cOrder && cOrder.skillId !== REST_SKILL_ID ? getSkill(cOrder.skillId) : undefined;
      let aFirst = aSkill?.priority === 'first' ? 1 : 0;
      let cFirst = cSkill?.priority === 'first' ? 1 : 0;
      // 若无显式 orders，检查单位技能列表中是否有可用的先手技能（用于显示预测）
      if (!aFirst && !aOrder) {
        const avail = a.skills.map(id => getBattleSkill(b, id)).find((s) => s.priority === 'first' && canUnitUseSkill(a, s.id, b));
        if (avail) aFirst = 1;
      }
      if (!cFirst && !cOrder) {
        const avail = c.skills.map(id => getBattleSkill(b, id)).find((s) => s.priority === 'first' && canUnitUseSkill(c, s.id, b));
        if (avail) cFirst = 1;
      }
      if (aFirst !== cFirst) return cFirst - aFirst;
      const speed = getEffectiveSpd(c) - getEffectiveSpd(a);
      if (speed) return speed;
      if (a.isPlayer !== c.isPlayer) return a.isPlayer ? -1 : 1;
      // 同速按前排到后排、我方左到右排序；敌方左右镜像。
      return Number(a.row === 'back') - Number(c.row === 'back')
        || (a.isPlayer ? a.column - c.column : c.column - a.column);
    });
  return all.map((u) => u.uid);
}

function makeEnemy(
  e: { speciesId: string },
  row: 'front' | 'back',
  col: 0 | 1 | 2,
  untameable = false,
  difficulty?: Difficulty,
  layer?: number,
  encounterHpMult = 1,
): Unit {
  const s = getMonster(e.speciesId);
  const unit = makeUnit(e.speciesId, false, col, !untameable && s.rank < 4 && s.tame.difficulty > 0, row);
  if (difficulty && difficulty !== 'normal') {
    const cfg = DIFFICULTY_CONFIG[difficulty];
    unit.maxHp = Math.round(unit.maxHp * cfg.enemyHpMult);
    unit.hp = unit.maxHp;
    unit.spd = Math.max(1, unit.spd + cfg.enemySpdBonus);
  }
  // Boss（rank 4）不随层数缩放；普通敌人的生命与速度采用彼此独立的成长曲线。
  if (layer && layer > 1 && s.rank < 4) {
    const scaling = getProficiencyEnemyScaling(layer);
    unit.maxHp = Math.round(unit.maxHp * scaling.hpMult);
    unit.hp = unit.maxHp;
    unit.spd = Math.max(1, unit.spd + scaling.spdBonus);
  }
  if (encounterHpMult !== 1) {
    unit.maxHp = Math.max(1, Math.round(unit.maxHp * encounterHpMult));
    unit.hp = unit.maxHp;
  }
  // 熟练度远征：敌人技能随层数强化/替换（rank<4 参与，Boss 与小怪不参与）
  if (layer !== undefined && s.rank < 4) {
    return applyEnemySkillProgression(unit, layer);
  }
  return unit;
}

/**
 * 该敌人是否倾向站前排：
 * Boss（rank 4 首领）强制前排；有防守被动 → 前；有进攻被动 → 后；有治疗技能 → 后；默认后。
 */
function wantsFront(speciesId: string): boolean {
  const s = getMonster(speciesId);
  if (s.rank >= 4 && !speciesId.startsWith('boss_minion_')) return true;
  const kind = getPassive(s.passive)?.kind;
  if (kind && FRONT_PASSIVES.includes(kind)) return true;
  if (kind && BACK_PASSIVES.includes(kind)) return false;
  if (s.skills.some((sid) => getSkill(sid).heal !== undefined && (getSkill(sid).heal ?? 0) > 0)) return false;
  return false;
}

/** 按角色分类生成敌方站位（保留 encounter 原始顺序）；确保 ≥1 前排 */
export function planEnemyLayout(
  enemySpecies: { speciesId: string }[],
): { row: 'front' | 'back'; col: 0 | 1 | 2 }[] {
  if (enemySpecies.length === 0) return [];
  // 1. 分类前后
  const fronts: number[] = [];
  const backs: number[] = [];
  enemySpecies.forEach((e, i) => (wantsFront(e.speciesId) ? fronts : backs).push(i));
  // 2. 全后排时把最肉的挪前排（保底 1 前排）
  if (fronts.length === 0 && backs.length > 0) {
    backs.sort((a, b) => {
      const sa = getMonster(enemySpecies[a].speciesId);
      const sb = getMonster(enemySpecies[b].speciesId);
      if (sb.baseHp !== sa.baseHp) return sb.baseHp - sa.baseHp;
      return sa.baseSpd - sb.baseSpd;
    });
    fronts.push(backs.shift()!);
  }
  // 3. 按 encounter 顺序分配 row/col
  const result: { row: 'front' | 'back'; col: 0 | 1 | 2 }[] = enemySpecies.map(() => ({
    row: 'back' as const,
    col: 0 as const,
  }));
  const frontPool = [...fronts];
  const backPool = [...backs];
  // 前排填列 0~2
  for (let col = 0; col < FIELD_COLS && frontPool.length > 0; col++) {
    result[frontPool.shift()!] = { row: 'front', col: col as 0 | 1 | 2 };
  }
  // 溢出前排 + 全部后排 → 后排列 0~2
  const backFill = [...frontPool, ...backPool];
  for (let col = 0; col < FIELD_COLS && backFill.length > 0; col++) {
    result[backFill.shift()!] = { row: 'back', col: col as 0 | 1 | 2 };
  }
  // 超出 6 格的极端情况（≥7 只，当前不可能）：继续循环后排列
  for (let i = 0; i < backFill.length; i++) {
    result[backFill[i]] = { row: 'back', col: (i % FIELD_COLS) as 0 | 1 | 2 };
  }
  return result;
}

/** 潮汐节律/共鸣：为 tideRhythm 和 tideEcho 单位挂 atkUp +2（本回合） */
function applyTideBurst(b: BattleState): BattleState {
  let nb = b;
  for (const u of [...nb.playerUnits, ...nb.enemyUnits]) {
    if (u.hp <= 0) continue;
    const p = getUnitPassive(u);
    if (p?.kind === 'tideRhythm') {
      const boosted = applyStatusTo(u, { kind: 'atkUp', value: p.value, turns: 1 }, nb.round - 1);
      nb = replaceUnit(nb, boosted);
    }
    if (p?.kind === 'tideEcho') {
      const allies = u.isPlayer ? nb.playerUnits : nb.enemyUnits;
      if (allies.some((a) => a.speciesId === 'boss_crab' && a.hp > 0)) {
        const boosted = applyStatusTo(u, { kind: 'atkUp', value: p.value, turns: 1 }, nb.round - 1);
        nb = replaceUnit(nb, boosted);
      }
    }
  }
  return nb;
}

export function createBattle(
  playerUnits: Unit[],
  enemySpecies: { speciesId: string }[],
  seed: number,
  options?: BattleOptions,
): BattleState {
  const preparedPlayer = playerUnits.map((u) => {
    const c = cloneUnit(u);
    c.furnaceTriggers = undefined;
    c.counterTriggeredRound = undefined;
    c.reactiveGuardRound = undefined;
    c.gatherShieldsRound = undefined;
    c.harmonyAttackRound = undefined;
    c.harmonyBuffRound = undefined;
    c.harmonyCharged = undefined;
    c.eternalLightUsed = undefined;
    c.burnStripUsed = undefined;
    c.flameRelayUsed = undefined;
    c.mirrorOwnSkillUsed = undefined;
    c.debuffImmune = undefined;
    c.blockedDebuffPending = undefined;
    c.mirrorCopyRound = undefined;
    c.spd = Math.max(1, c.spd - (c.mirrorSpdDelta ?? 0));
    c.mirrorSpdDelta = undefined;
    c.timeRewindUsed = undefined;
    c.timeRewindRound = undefined;
    c.timeRewindExtraPending = undefined;
    c.timeRewindLogPending = undefined;
    c.candleReviveLogPending = undefined;
    c.statuses = c.statuses.filter(s => s.kind !== 'timeLag');
    c.radianceGainedThisRound = undefined;
    c.statuses = c.statuses.filter(s => s.kind !== 'emberSeed' && s.kind !== 'sunRadiance' && s.kind !== 'foxFire' && s.kind !== 'foxTailGuard');
    if (options?.corruptDebuff === 'spd') c.spd = Math.max(1, c.spd - 2);
    return c;
  });
  // 只有 1 只宠物上场时，位置默认为前排居中
  if (preparedPlayer.length === 1 && preparedPlayer[0]) {
    preparedPlayer[0] = { ...preparedPlayer[0], row: 'front', column: 1 };
  }
  let b: BattleState = {
    playerUnits: [],
    enemyUnits: [],
    turnOrder: [],
    turnIndex: 0,
    round: 1,
    phase: 'acting',
    log: [],
    pendingTame: [],
    tameAttempts: 0,
    圣果Used: 0,
    seed,
    rngCount: 0,
    orders: {},
    corruptDebuff: options?.corruptDebuff,
    act: options?.act,
    nodeType: options?.nodeType,
    difficulty: options?.difficulty,
    relics: options?.relics ? [...options.relics] : undefined,
  };
  const untameable = options?.untameable === true;
  const difficulty = options?.difficulty;
  const layer = options?.layer;
  const encounterHpMult = options?.encounterHpMult ?? 1;
  if (options?.gauntlet) {
    const [first, ...playerRest] = preparedPlayer;
    // 车轮战：我方也一次只上一只，其余进入替补席，阵亡后按序顶替
    b.playerUnits = first ? [{ ...first, row: 'front', column: 1 }] : [];
    b.playerBench = playerRest;
    b.playerDown = [];
    const [firstEnemy, ...enemyRest] = enemySpecies;
    b.enemyUnits = firstEnemy ? [{ ...makeEnemy(firstEnemy, 'front', 1, untameable, difficulty, layer, encounterHpMult), row: 'front', column: 1 }] : [];
    b.enemyBench = enemyRest.map((e) => makeEnemy(e, 'back', 0, untameable, difficulty, layer, encounterHpMult));
    b.gauntlet = { total: enemySpecies.length, current: 1 };
  } else if (options?.mirrorUnits) {
    // 竞技场模拟战：用玩家单位的克隆作为敌人，镜像玩家站位
    b.playerUnits = preparedPlayer;
    b.enemyUnits = options.mirrorUnits.map((u, i) => {
      const c = cloneUnit(u);
      c.uid = nextUid('e');
      c.isPlayer = false;
      c.lastSkillId = undefined;
      c.counterTriggeredRound = undefined;
      c.defensiveStreak = undefined;
      c.mirrorOwnSkillUsed = undefined;
      c.mirrorCopyRound = undefined;
      c.spd = Math.max(1, c.spd - (c.mirrorSpdDelta ?? 0));
      c.mirrorSpdDelta = undefined;
      c.tameable = false;
      const mirrorPos = preparedPlayer[i];
      c.row = mirrorPos?.row ?? 'front';
      c.column = mirrorPos?.column ?? (i as 0 | 1 | 2);
      return c;
    });
  } else {
    // 敌方数量固定为 encounter 原始数量（不再复制补齐）；
    // 玩家出战数由布阵界面限制（≤ 敌方数量+1，最多 FIELD_MAX）
    const exact = options?.enemyExact === true;
    const picked = exact ? [...enemySpecies] : [...enemySpecies];
    const layout = planEnemyLayout(picked);
    b.playerUnits = preparedPlayer;
    b.enemyUnits = picked.map((e, i) => makeEnemy(e, layout[i].row, layout[i].col, untameable, difficulty, layer, encounterHpMult));
    // Boss 小怪战：Boss 显示在前排中间（column 1），与两侧小怪互换位置
    if (b.enemyUnits.length >= 2 && b.enemyUnits[0]?.speciesId.startsWith('boss_')) {
      const boss = b.enemyUnits[0];
      const center = b.enemyUnits[1];
      if (center && boss.row === 'front' && center.row === 'front') {
        b.enemyUnits = [
          { ...center, column: 0 },
          { ...boss, column: 1 },
          ...b.enemyUnits.slice(2),
        ];
      }
    }
    // 只有一个敌人时，默认前排居中显示
    if (b.enemyUnits.length === 1 && b.enemyUnits[0]) {
      b.enemyUnits = [{ ...b.enemyUnits[0], row: 'front', column: 1 }];
    }
    // 成长之主Boss：为成长傀儡设置 sacrificeUid 指向Boss（成长之主可能在玩家一方，需同时搜索敌我）
const growthMaster = [...b.enemyUnits, ...b.playerUnits].find((u) => u.speciesId === 'growth_master' && u.hp > 0);
    if (growthMaster) {
      const linkPuppets = (units: Unit[]) =>
        units.map((u) =>
          u.speciesId === 'growth_puppet' && u.hp > 0 ? { ...u, sacrificeUid: growthMaster.uid } : u,
        );
      b.enemyUnits = linkPuppets(b.enemyUnits);
      b.playerUnits = linkPuppets(b.playerUnits);
    }
  }
  if (options?.corruptDebuff === 'immune') {
    b.enemyUnits = b.enemyUnits.map(unit => ({ ...unit, debuffImmune: true, statuses: unit.statuses.filter(s => !NEGATIVE_STATUSES.has(s.kind)) }));
    b.enemyBench = b.enemyBench?.map(unit => ({ ...unit, debuffImmune: true, statuses: unit.statuses.filter(s => !NEGATIVE_STATUSES.has(s.kind)) }));
  }
  b = drawMimicSkills(b);
  if (options?.collectTelemetry) {
    b.telemetry = [...b.playerUnits, ...b.enemyUnits].map((unit) => ({
      kind: 'battle-start',
      round: b.round,
      side: unit.isPlayer ? 'player' : 'enemy',
      actorUid: unit.uid,
      actorSpeciesId: unit.speciesId,
    }));
    b.telemetryHp = Object.fromEntries([...b.playerUnits, ...b.enemyUnits].map((u) => [u.uid, u.hp]));
  }
  b.turnOrder = computeTurnOrder(b);
  // 首回合潮汐节律触发（createBattle 不调用 startRound，需单独处理）
  if (b.round % 3 === 1) {
    b = applyTideBurst(b);
  }
  return checkEnd(b);
}

/** 开战时一次性抽取，来源快照不含替补或百变兽上一场的技能。 */
export function drawMimicSkills(b: BattleState, onlyUid?: string): BattleState {
  const pool = mimicSkillPool([...b.playerUnits, ...b.enemyUnits]);
  const candidates = pool.length ? pool : ['claw_attack'];
  const roll = (unit: Unit): Unit => {
    if (unit.hp <= 0 || (onlyUid && unit.uid !== onlyUid) || getPassive(unit.passive)?.kind !== 'mimic') return unit;
    const remaining = [...candidates];
    const skills: string[] = [];
    for (let i = 0; i < Math.min(4, candidates.length); i++) {
      b = useRng(b, (value, next) => {
        const index = Math.floor(value * remaining.length);
        skills.push(remaining[index]);
        remaining.splice(index, 1);
        return next;
      });
    }
    b = { ...b, mimicPreviewPending: true };
    return updateUnitSkills({ ...unit, skills: [], skillUses: {}, skillCooldowns: undefined,
      skillEnhancements: undefined, lastSkillId: undefined, defensiveStreak: undefined }, skills);
  };
  // roll只更新随机游标，不在遍历时修改来源；所有百变兽使用同一份原始技能池。
  const playerUnits = b.playerUnits.map(roll);
  const enemyUnits = b.enemyUnits.map(roll);
  const playerBench = b.playerBench?.map(roll);
  const enemyBench = b.enemyBench?.map(roll);
  return { ...b, playerUnits, enemyUnits, playerBench, enemyBench };
}

/** 开始新回合：重置各单位行动标记、结算持续伤害与状态持续、重新按速度排序 */
function startRound(b: BattleState): BattleState {
  const prevRound = b.round;
  let nb = decrementBattleBuffs(b);
  // 递减技能冷却
  nb = {
    ...nb,
    playerUnits: nb.playerUnits.map((u) => {
      if (!u.skillCooldowns) return u;
      const next: Record<string, number> = {};
      let changed = false;
      for (const [k, v] of Object.entries(u.skillCooldowns)) {
        if (v > 1) { next[k] = v - 1; changed = true; }
        else { changed = true; }
      }
      return changed ? { ...u, skillCooldowns: Object.keys(next).length > 0 ? next : undefined } : u;
    }),
    enemyUnits: nb.enemyUnits.map((u) => {
      if (!u.skillCooldowns) return u;
      const next: Record<string, number> = {};
      let changed = false;
      for (const [k, v] of Object.entries(u.skillCooldowns)) {
        if (v > 1) { next[k] = v - 1; changed = true; }
        else { changed = true; }
      }
      return changed ? { ...u, skillCooldowns: Object.keys(next).length > 0 ? next : undefined } : u;
    }),
  };
  nb = {
    ...nb,
    round: nb.round + 1,
    afterglowUsed: undefined,
    lastAllySkill: undefined,
    turnOrder: computeTurnOrder(nb),
    turnIndex: 0,
    playerUnits: nb.playerUnits.map((u) => ({ ...u, statuses: u.statuses.map((s) => ({ ...s })) })),
    enemyUnits: nb.enemyUnits.map((u) => ({ ...u, statuses: u.statuses.map((s) => ({ ...s })) })),
  };
  // 灼烧/中毒DOT在重置前结算，伤害计入上一回合的累计伤害上限
  for (const u of [...nb.playerUnits, ...nb.enemyUnits]) {
    if (u.hp <= 0) continue;
    const cur = actorFromId(nb, u.uid);
    if (!cur || cur.hp <= 0) continue;
    const res = applyDot(nb, cur);
    nb = res.battle;
    if (res.unit.hp > 0) {
      // 孢子防护回合结束回血：在 tickStatuses 移除前检查
      const hadSporeShield = res.unit.statuses.some((s) => s.kind === 'sporeShield');
      tickStatuses(res.unit, prevRound);
      if (hadSporeShield) {
        const maxHp = getEffectiveMaxHp(res.unit);
        const sporeIdx = res.unit.skills.indexOf('spore_shield');
        const sporeEnhance = sporeIdx >= 0 ? getSkillEnhanceLevel(res.unit, sporeIdx) : 0;
        const sporeHeal = 8 + sporeEnhance;
        const healed = { ...res.unit, hp: Math.min(maxHp, res.unit.hp + sporeHeal) };
        nb = replaceUnit(nb, healed);
        nb = pushLog(nb, `${healed.name} 的「孢子防护」恢复 ${sporeHeal} 点生命`, sideOf(healed), healed.uid, healed.uid);
      } else {
        nb = replaceUnit(nb, res.unit);
      }
    } else {
      if (res.unit.speciesId.startsWith('boss_minion_')) {
        const msgDead = `${res.unit.name} 被击倒了`;
        nb = pushLog(nb, msgDead, sideOf(res.unit), res.unit.uid, res.unit.uid, undefined, undefined,
          spans(msgDead, [['target', res.unit.name]]));
        nb = applyRockShardDeath(nb, res.unit);
        nb = applyToxicBurstDeath(nb, res.unit);
        nb = applyEmberDeath(nb, res.unit);
        // 灵魂链接：死亡时为幽灵船长+1灵魂
        const deadP = getUnitPassive(res.unit);
        if (deadP?.kind === 'ghostSoul') {
          const allies = res.unit.isPlayer ? nb.playerUnits : nb.enemyUnits;
          const ghostCaptain = allies.find((u) => u.speciesId === 'boss_ghost' && u.hp > 0);
          if (ghostCaptain) {
            const curSoul = ghostCaptain.soul ?? 0;
            if (curSoul < 20) {
              const newSoul = curSoul + 1;
              nb = replaceUnit(nb, { ...ghostCaptain, soul: newSoul });
              nb = pushLog(nb, `${res.unit.name} 的「灵魂链接」触发！${ghostCaptain.name} 获得 1 个灵魂（共 ${newSoul}）`, sideOf(ghostCaptain), ghostCaptain.uid, ghostCaptain.uid);
              if (newSoul === 5) nb = pushLog(nb, `${ghostCaptain.name} 的「灵魂汲取」达到 5 灵魂！伤害 +2`, sideOf(ghostCaptain), ghostCaptain.uid, ghostCaptain.uid);
              else if (newSoul === 10) nb = pushLog(nb, `${ghostCaptain.name} 的「灵魂汲取」达到 10 灵魂！每回合恢复 3 HP`, sideOf(ghostCaptain), ghostCaptain.uid, ghostCaptain.uid);
              else if (newSoul === 20) nb = pushLog(nb, `${ghostCaptain.name} 的「灵魂汲取」达到 20 灵魂！伤害 +3（共 +5）`, sideOf(ghostCaptain), ghostCaptain.uid, ghostCaptain.uid);
            }
          }
        }
      }
      nb = replaceUnit(nb, res.unit);
    }
    nb = checkEnd(nb);
    if (nb.phase !== 'acting') return nb;
  }
  // 回合末先结算持续伤害，再将存活者剩余灼烧转换；归属本回合的清火机会。
  for (const unit of [...nb.playerUnits, ...nb.enemyUnits]) {
    const passive = getUnitPassive(unit, nb);
    if (unit.hp <= 0 || passive?.kind !== 'burnShield' || !isBurning(unit)) continue;
    const layers = Math.min(passive.burnConsumeMax ?? 1, unit.statuses.find((status) => status.kind === 'burn')!.value);
    const shield = Math.min(passive.value * layers, 99 - unit.shield);
    nb = replaceUnit(nb, { ...consumeBurn(unit, layers), shield: unit.shield + shield });
    const msg = `${unit.name} 的「${passive.name}」获得 ${shield} 点护盾`;
    nb = pushLog(nb, msg, sideOf(unit), unit.uid, unit.uid, undefined, undefined,
      spans(msg, [['actor', unit.name], ['passive', passive.name]]));
    nb = { ...notifyBurnRemoved({ ...nb, round: prevRound }, unit, layers), round: nb.round };
  }
  for (const unit of [...nb.playerUnits, ...nb.enemyUnits]) {
    if (unit.gatherShieldsRound !== prevRound || unit.hp <= 0) continue;
    nb = replaceUnit(nb, { ...unit, shield: 0, statuses: unit.statuses.filter(s => s.kind !== 'shield') });
    nb = pushLog(nb, `${unit.name} 的「集盾」在回合结束时清空护盾`, sideOf(unit), unit.uid, unit.uid);
  }
  // 晶核转化：整批扣血后再处理死亡，不触发攻击命中类被动。
  for (const uid of [...nb.playerUnits, ...nb.enemyUnits].map(unit => unit.uid)) {
    const unit = actorFromId(nb, uid)!;
    if (unit.hp <= 0 || unit.shield <= 0 || getUnitPassive(unit, nb)?.kind !== 'crystalConversion') continue;
    const candidates = [...enemiesOf(nb, unit)];
    const targets: Unit[] = [];
    while (candidates.length && targets.length < 2) {
      const picked = rngPick(nb, candidates);
      nb = picked.battle;
      targets.push(picked.pick!);
      candidates.splice(candidates.findIndex(target => target.uid === picked.pick!.uid), 1);
    }
    if (!targets.length) continue;
    const damage = Math.ceil(unit.shield / 2);
    nb = replaceUnit(nb, { ...unit, shield: 0, statuses: unit.statuses.filter(status => status.kind !== 'shield') });
    for (const target of targets) nb = replaceUnit(nb, { ...target, hp: Math.max(0, target.hp - damage) });
    nb = pushLog(nb, `${unit.name} 的「晶核转化」消耗 ${unit.shield} 点护盾，对${targets.map(target => target.name).join('、')}各造成 ${damage} 点真实伤害`, sideOf(unit), unit.uid, undefined, undefined, targets.map(target => target.uid));
    nb = checkEnd(nb);
    if (nb.phase !== 'acting') return nb;
    for (const target of targets) {
      const current = actorFromId(nb, target.uid)!;
      if (current.hp <= 0) nb = applyDefeatedTarget(nb, current);
      nb = checkEnd(nb);
      if (nb.phase !== 'acting') return nb;
    }
  }
  // 盾反清理：若 shieldCounter 已过期但 shield 状态仍存在，一并移除
  for (const u of [...nb.playerUnits, ...nb.enemyUnits]) {
    if (u.hp <= 0) continue;
    if (!u.statuses.some((s) => s.kind === 'shieldCounter') && u.statuses.some((s) => s.kind === 'shield')) {
      nb = replaceUnit(nb, { ...u, statuses: u.statuses.filter((s) => s.kind !== 'shield') });
    }
  }
  // skillSealPending → skillSeal 转换：封印在命中后的下回合生效
  for (const u of [...nb.playerUnits, ...nb.enemyUnits]) {
    if (u.hp <= 0) continue;
    const pending = u.statuses.find((s) => s.kind === 'skillSealPending');
    if (!pending) continue;
    // tickStatuses 已递减 turns，直接使用当前值
    const remainingTurns = pending.turns;
    if (remainingTurns <= 0) {
      // pending 已到期，直接移除
      nb = replaceUnit(nb, { ...u, statuses: u.statuses.filter((s) => s.kind !== 'skillSealPending') });
    } else {
      // 转换为正式封印。turns 语义：封印禁用 e.turns 个完整回合。
      // 封印转换发生在 startRound 中 tickStatuses（本回合已跑完）之后，因此本回合内不再递减，
      // 封印图标持续到「封印禁用的最后回合结束」才由下回合 tickStatuses 递减移除
      const sealStatus: StatusEffect = { kind: 'skillSeal', value: pending.value, turns: remainingTurns, sealedSkills: pending.sealedSkills };
      // 移除旧的 skillSeal（如有），添加新的
      const withoutPending = u.statuses.filter((s) => s.kind !== 'skillSealPending' && s.kind !== 'skillSeal');
      nb = replaceUnit(nb, { ...u, statuses: [...withoutPending, sealStatus] });
      const sealedNames = (pending.sealedSkills ?? []).map((s) => getSkill(s)?.name ?? s).join('、');
      nb = pushLog(nb, `${u.name} 的「${sealedNames}」被封印 ${remainingTurns} 回合`, sideOf(u), u.uid, u.uid, ['skillSeal']);
    }
  }
  // DOT结算完毕后重置伤害累计（新回合开始）
  nb = { ...nb, roundDmgMap: {} };
  // 形态切换检查：HP≤50% 且有 altPassive 时切换形态
  for (const u of [...nb.playerUnits, ...nb.enemyUnits]) {
    if (u.hp <= 0 || !u.altPassive) continue;
    if (u.hp / u.maxHp > 0.5) continue;
    if (u.passive === u.altPassive) continue; // 已切换
    const switched = { ...u, passive: u.altPassive, skills: u.altSkills ?? u.skills, skillCooldowns: undefined };
    nb = replaceUnit(nb, switched);
    nb = pushLog(nb, `${switched.name} 的熔岩护甲碎裂，进入【爆发形态】！`, sideOf(switched), switched.uid, switched.uid);
  }
  // 被侵蚀 burn debuff：每回合结束受到 2 点伤害
  if (nb.corruptDebuff === 'burn') {
    for (const u of [...nb.playerUnits, ...nb.enemyUnits]) {
      if (u.hp <= 0 || !u.isPlayer) continue;
      const dmg = 2;
      const hitUnit = { ...u, hp: Math.max(0, u.hp - dmg) };
      nb = replaceUnit(nb, hitUnit);
      nb = pushLog(nb, `${u.name} 受到侵蚀伤害 ${dmg} 点`, sideOf(u), u.uid);
    }
    nb = checkEnd(nb);
    if (nb.phase !== 'acting') return nb;
  }
  // 用正在结束的回合编号结算崩解；存活后再进入新回合回复。
  const collapsed = applyBattleCollapse({ ...nb, round: prevRound });
  if (collapsed.phase !== 'acting') return collapsed;
  nb = { ...collapsed, round: nb.round, roundEndedBeforeSwap: collapsed.pendingSwap ? true : undefined };
  // 回合末持续伤害触发回溯时，额外行动仍在进入下一轮之前执行。
  nb = resolveRewindActions({ ...nb, round: prevRound });
  if (nb.rewindChoice) return { ...nb, rewindChoice: { ...nb.rewindChoice, nextRound: prevRound + 1 } };
  return finishRoundStart({ ...nb, round: prevRound + 1 });
}

function finishRoundStart(b: BattleState): BattleState {
  let nb = b;
  if (nb.phase !== 'acting') return nb;
  nb = { ...nb,
    lastAllySkill: undefined,
    playerUnits: nb.playerUnits.map(u => ({ ...u, timeRewindRound: undefined, mirrorOwnSkillUsed: undefined })),
    enemyUnits: nb.enemyUnits.map(u => ({ ...u, timeRewindRound: undefined, mirrorOwnSkillUsed: undefined })),
  };
  // 状态结算完毕后，再根据当前状态设置 acted（眩晕已可能被 tickStatuses 移除）
  nb = {
    ...nb,
    playerUnits: nb.playerUnits.map((u) => ({ ...u, acted: u.statuses.some((s) => s.kind === 'stun'), flameRelayUsed: undefined, furnaceTriggers: undefined, eternalLightUsed: undefined, burnStripUsed: undefined, radianceGainedThisRound: undefined })),
    enemyUnits: nb.enemyUnits.map((u) => ({ ...u, acted: u.statuses.some((s) => s.kind === 'stun'), flameRelayUsed: undefined, furnaceTriggers: undefined, eternalLightUsed: undefined, burnStripUsed: undefined, radianceGainedThisRound: undefined })),
  };
  // 清除来源已死亡的嘲讽
  const allUnits = [...nb.playerUnits, ...nb.enemyUnits];
  for (const u of allUnits) {
    if (u.hp <= 0) continue;
    const taunt = u.statuses.find((s) => s.kind === 'taunt');
    if (taunt?.sourceUid) {
      const src = allUnits.find((x) => x.uid === taunt.sourceUid);
      if (!src || src.hp <= 0) {
        nb = replaceUnit(nb, { ...u, statuses: u.statuses.filter((s) => s.kind !== 'taunt') });
      }
    }
  }
  // 被动再生：每回合开始恢复（存活且未满血）
  for (const u of [...nb.playerUnits, ...nb.enemyUnits]) {
    const p = getUnitPassive(u);
    if ((p?.kind === 'regen' || p?.kind === 'lifeSpring' || p?.kind === 'treeSpeedUp' || (p?.kind === 'soulSiphon' && (u.soul ?? 0) >= 10)) && u.hp > 0 && u.hp < u.maxHp) {
      const maxHp = getEffectiveMaxHp(u);
      let healAmt = p.kind === 'lifeSpring' ? 3 : (p.kind === 'treeSpeedUp' ? 3 : (p.kind === 'soulSiphon' ? 3 : p.value));
      // 共生树皮：若古树之主在场，恢复量翻倍
      if (u.passive === 'symbiotic_bark') {
        const allies = u.isPlayer ? nb.playerUnits : nb.enemyUnits;
        const hasBossVine = allies.some((a) => a.speciesId === 'boss_vine' && a.hp > 0);
        if (hasBossVine) healAmt *= 2;
      }
      const healed = { ...u, hp: Math.min(maxHp, u.hp + healAmt) };
      nb = replaceUnit(nb, healed);
      nb = pushLog(nb, `${u.name} 的「${p.name}」恢复 ${healAmt} 点生命`, sideOf(u), u.uid);
    }
  }
  // 成长值被动：回合结束 +1 成长值（成长之主专属）
  for (const u of [...nb.playerUnits, ...nb.enemyUnits]) {
    if (u.hp <= 0) continue;
    const gp = getUnitPassive(u);
    if (gp?.kind === 'growthValue') {
      const curGV = u.growthValue ?? 0;
      nb = replaceUnit(nb, { ...u, growthValue: curGV + 1 });
      nb = pushLog(nb, `${u.name} 的成长值 +1（共 ${curGV + 1}）`, sideOf(u), u.uid, u.uid, undefined, undefined,
        spans(`${u.name} 的成长值 +1（共 ${curGV + 1}）`, [['actor', u.name], ['heal', String(curGV + 1)]]));
    }
  }
  // 献祭被动：存活的傀儡回合结束给予成长之主 +1 成长值
  for (const u of [...nb.playerUnits, ...nb.enemyUnits]) {
    if (u.hp <= 0) continue;
    const sp = getUnitPassive(u);
    if (sp?.kind === 'sacrifice') {
      const masterUid = u.sacrificeUid;
      if (masterUid) {
        const master = actorFromId(nb, masterUid);
        if (master && master.hp > 0) {
          const curGV = master.growthValue ?? 0;
          nb = replaceUnit(nb, { ...master, growthValue: curGV + 1 });
          nb = pushLog(nb, `${u.name} 的「献祭」给予 ${master.name} 成长值 +1（共 ${curGV + 1}）`, sideOf(master), u.uid, master.uid);
        }
      }
    }
  }
  // 恐惧嚎叫被动：每回合开始随机给1个敌人恐惧1层
  for (const u of [...nb.playerUnits, ...nb.enemyUnits]) {
    if (u.hp <= 0) continue;
    const fp = getUnitPassive(u);
    if (fp?.kind === 'fearOnRoundStart') {
      const enemies = u.isPlayer ? nb.enemyUnits.filter((e) => e.hp > 0) : nb.playerUnits.filter((e) => e.hp > 0);
      if (enemies.length > 0) {
        nb = useRng(nb, (value, next) => {
          const target = enemies[Math.floor(value * enemies.length)];
          let updated = applyFear(next, target, 1);
          updated = pushLog(updated, `${u.name} 的「${fp.name}」触发！${target.name} 恐惧 +1`, sideOf(u), u.uid, target.uid, undefined, undefined,
            spans(`${u.name} 的「${fp.name}」触发！${target.name} 恐惧 +1`, [['actor', u.name], ['target', target.name], ['status', '恐惧']]));
          return updated;
        });
      }
    }
  }
  // 潮汐节律/共鸣：每3回合触发一次（爆发1回合、休2回合），触发回合 round % 3 === 1
  // appliedRound = nb.round - 1 配合 atkUp 跳过规则，确保 atkUp 精确持续当回合
  if (nb.round % 3 === 1) {
    nb = applyTideBurst(nb);
    // 为爆发回合生成日志
    for (const u of [...nb.playerUnits, ...nb.enemyUnits]) {
      if (u.hp <= 0) continue;
      const p = getUnitPassive(u);
      if (p?.kind === 'tideRhythm' || p?.kind === 'tideEcho') {
        nb = pushLog(nb, `${u.name} 的「${p.name}」触发！伤害 +${p.value}`, sideOf(u), u.uid);
      }
    }
  }
  return nb;
}

function replaceUnit(b: BattleState, unit: Unit): BattleState {
  if (!unit.isPlayer && b.corruptDebuff === 'immune') {
    const blocked = unit.statuses.some(s => NEGATIVE_STATUSES.has(s.kind)) || !!unit.battleBuffs?.atkDown || !!unit.battleBuffs?.spdDown;
    unit = { ...unit, debuffImmune: true, statuses: unit.statuses.filter(s => !NEGATIVE_STATUSES.has(s.kind)),
      battleBuffs: unit.battleBuffs ? { ...unit.battleBuffs, atkDown: undefined, spdDown: undefined } : undefined,
      blockedDebuffPending: unit.blockedDebuffPending || blocked };
  }
  const previous = actorFromId(b, unit.uid);
  if (unit.hp <= 0 && previous && previous.hp > 0 && !unit.timeRewindUsed && getUnitPassive(unit, b)?.kind === 'timeRewind') {
    const negative: StatusEffect['kind'][] = ['burn', 'burnBrand', 'poison', 'atkDown', 'spdDown', 'stun', 'taunt', 'thorns', 'shadowMark', 'chainLink', 'skillSeal', 'skillSealPending', 'fear', 'timeLag'];
    const buffs = unit.battleBuffs ? { ...unit.battleBuffs, atkDown: undefined, spdDown: undefined } : undefined;
    unit = { ...unit, hp: Math.ceil(getEffectiveMaxHp(unit) / 2), statuses: unit.statuses.filter(s => !negative.includes(s.kind)),
      battleBuffs: buffs, timeRewindUsed: true, timeRewindRound: b.round, timeRewindExtraPending: true, timeRewindLogPending: true };
  }
  if (unit.hp <= 0 && previous && previous.hp > 0 && unit.isPlayer
    && b.relics?.includes('spare_candle') && !b.spareCandleUsed) {
    unit = { ...unit, hp: 1, candleReviveLogPending: true };
    b = { ...b, spareCandleUsed: true };
  }
  const side = unit.isPlayer ? 'playerUnits' : 'enemyUnits';
  const list = b[side].map((u) => (u.uid === unit.uid ? unit : u));
  return { ...b, [side]: list };
}

function applyDot(b: BattleState, u: Unit): { unit: Unit; battle: BattleState } {
  let nb = b;
  let unit = u;
  // 灼烧/中毒按层数结算：每回合掉 ceil(层数/2) 层（向上进位），扣血并消耗等量层数，归 0 移除
  for (const s of u.statuses) {
    if (unit.hp <= 0) break;
    if (!unit.statuses.includes(s)) continue;
    if (s.kind !== 'burn' && s.kind !== 'poison') continue;
    let dmg = Math.ceil(s.value / 2);
    const left = s.value - dmg;
    // damageCap：dot伤害也计入本回合累计伤害上限
    const p = getUnitPassive(unit);
    const immuneBurn = s.kind === 'burn' && (p?.kind === 'foxFlame' || p?.kind === 'flameRelay');
    if (immuneBurn) dmg = 0;
    if (unit.reactiveGuardRound === b.round - 1) dmg = Math.max(0, dmg - 1);
    if (p?.kind === 'damageCap') {
      const roundDmg = nb.roundDmgMap ?? {};
      const prevDmg = roundDmg[unit.uid] ?? 0;
      const allowed = Math.max(0, p.value - prevDmg);
      if (dmg > allowed) {
        dmg = allowed;
      }
      nb = { ...nb, roundDmgMap: { ...roundDmg, [unit.uid]: prevDmg + dmg } };
    }
    // 层数始终消耗（即使伤害被截断为0）
    unit = {
      ...unit,
      hp: dmg > 0 ? Math.max(0, unit.hp - dmg) : unit.hp,
      statuses: left > 0 ? unit.statuses.map((x) => (x === s ? { ...x, value: left } : x)) : unit.statuses.filter((x) => x !== s),
    };
    nb = replaceUnit(nb, unit);
    unit = actorFromId(nb, unit.uid)!;
    if (immuneBurn) nb = pushLog(nb, `${unit.name} 免疫灼烧伤害（自然消耗 ${s.value - left} 层）`, sideOf(unit), unit.uid, unit.uid);
    if (dmg > 0) {
      const dotName = s.kind === 'burn' ? '灼烧' : '中毒';
      const msgDot = `${unit.name} 受到${dotName} ${dmg} 点伤害`;
      nb = pushLog(nb, msgDot, sideOf(unit), undefined, unit.uid, undefined, undefined,
        spans(msgDot, [['target', unit.name], ['status', `${dotName} ${dmg} 点伤害`]]));
    }
    unit = actorFromId(nb, unit.uid)!;
  }
  return { unit, battle: nb };
}

function tickStatuses(u: Unit, round?: number): void {
  for (const s of u.statuses) {
    // 灼烧/中毒由层数结算管理生命周期，护盾不被打破就永久存在，均不按回合数递减
    if (s.kind === 'burn' || s.kind === 'poison' || s.kind === 'shield' || s.kind === 'emberSeed' || s.kind === 'sunRadiance' || s.kind === 'foxFire') continue;
    // 仅战吼（atkUp）、荆棘（thorns）、怒棘（rageThorn）、风羽（windSpd）、波光环（comboBoost）、暗影印记（shadowMark）、锁链连接（chainLink）施放回合不计入持续回合数：该回合不递减；其他状态正常递减
    if ((s.kind === 'bloodDrain' || s.kind === 'atkUp' || s.kind === 'thorns' || s.kind === 'rageThorn' || s.kind === 'windSpd' || s.kind === 'comboBoost' || s.kind === 'shadowMark' || s.kind === 'chainLink') && s.appliedRound !== undefined && s.appliedRound === round) continue;
    s.turns -= 1;
  }
  u.statuses = u.statuses.filter((s) => s.kind === 'burn' || s.kind === 'poison' || s.kind === 'shield' || s.kind === 'emberSeed' || s.kind === 'sunRadiance' || s.kind === 'foxFire' || s.turns > 0);
}

function addedStatusValues(before: StatusEffect[], after: StatusEffect[]): NonNullable<NonNullable<LogEntry['impacts']>[string]['addedStatuses']> {
  const added: NonNullable<NonNullable<LogEntry['impacts']>[string]['addedStatuses']> = {};
  for (const status of after) {
    if (status.kind === 'shield') continue;
    const delta = status.value - (before.find(s => s.kind === status.kind)?.value ?? 0);
    if (delta > 0) added[status.kind] = delta;
  }
  return added;
}

function attackDebuffNotes(before: StatusEffect[], after: StatusEffect[]): string[] {
  const labels: Partial<Record<StatusEffect['kind'], string>> = {
    burn: '灼烧', poison: '中毒', atkDown: '攻击降低', spdDown: '速度降低', fear: '恐惧',
    thorns: '荆棘', shadowMark: '暗影印记', skillSealPending: '技能封印', skillSeal: '技能封印',
    stun: '眩晕', taunt: '嘲讽', timeLag: '时滞', burnBrand: '灼烧烙印', chainLink: '锁链连接',
  };
  return after.flatMap(status => {
    const label = labels[status.kind];
    if (!label) return [];
    const previous = before.find(old => old.kind === status.kind);
    const added = status.value - (previous?.value ?? 0);
    if (added > 0) {
      if (status.kind === 'stun' || status.kind === 'taunt' || status.kind === 'timeLag') return [`施加${label} ${status.turns} 回合`];
      if (status.kind === 'thorns') return [`附加荆棘（反伤 ${status.value}）`];
      if (status.kind === 'shadowMark') return [`附加暗影印记（受伤+${status.value}）`];
      if (status.kind === 'skillSealPending' || status.kind === 'skillSeal') return [`封印 ${status.value} 个技能${status.kind === 'skillSealPending' ? '（下回合生效）' : ''}`];
      if (status.kind === 'chainLink') return ['施加锁链连接'];
      return [`附加${label} ${added} 层`];
    }
    if (previous && status.turns > previous.turns) return [`刷新${label}（${status.turns} 回合）`];
    return [];
  });
}

export function pushLog(
  b: BattleState,
  msg: string,
  side: 'player' | 'enemy' | 'info' = 'info',
  actorUid?: string,
  targetUid?: string,
  addsStatus?: string[],
  burstTargets?: string[],
  spans?: LogSpan[],
  hitImpact?: Partial<NonNullable<LogEntry['impacts']>[string]>,
  capture?: LogEntry['capture'],
): BattleState {
  if (b.corruptDebuff === 'immune' && b.enemyUnits.some(unit => !unit.debuffImmune)) {
    b = { ...b, enemyUnits: b.enemyUnits.map(unit => unit.debuffImmune ? unit : { ...unit, debuffImmune: true }) };
  }
  if (b.corruptDebuff === 'immune' && addsStatus?.length) {
    const targets = [targetUid, ...(burstTargets ?? [])].filter((uid): uid is string => !!uid);
    if (targets.length && targets.every(uid => b.enemyUnits.some(unit => unit.uid === uid))) {
      addsStatus = addsStatus.filter(kind => !NEGATIVE_STATUSES.has(kind as StatusEffect['kind']));
      if (!addsStatus.length) addsStatus = undefined;
    }
  }
  // 附加当下全体血量快照，供 UI 按动画事件逐步展示血量；log 不截断（由 UI 只展示尾部）
  const hp: Record<string, number> = {};
  for (const u of [...b.playerUnits, ...b.enemyUnits]) hp[u.uid] = u.hp;
  // 附加当下全员状态快照（深拷贝，防 tickStatuses 原地递减污染历史），供 UI 按动画事件回放状态层数
  const statuses: Record<string, StatusEffect[]> = {};
  for (const u of [...b.playerUnits, ...b.enemyUnits]) statuses[u.uid] = u.statuses.map((s) => ({ ...s }));
  if (addsStatus?.includes('burn') && [targetUid, ...(burstTargets ?? [])].some(uid => uid && statuses[uid]?.some(s => s.kind === 'foxFire'))) addsStatus = [...new Set([...addsStatus, 'foxFire'])];
  // 附加当下全员护盾快照，供 UI 按动画事件逐步更新护盾显示
  const shields: Record<string, number> = {};
  for (const u of [...b.playerUnits, ...b.enemyUnits]) shields[u.uid] = u.shield;
  const previous = b.log[b.log.length - 1];
  const impacts: NonNullable<LogEntry['impacts']> = {};
  if (previous?.hp) for (const u of [...b.playerUnits, ...b.enemyUnits]) {
    const hpDelta = u.hp - (previous.hp[u.uid] ?? u.hp);
    const shieldDelta = u.shield - (previous.shields?.[u.uid] ?? u.shield);
    const addedStatuses = addedStatusValues(previous.statuses?.[u.uid] ?? [], u.statuses);
    if (hpDelta || shieldDelta || Object.keys(addedStatuses).length || u.uid === targetUid) impacts[u.uid] = {
      hpLoss: Math.max(0, -hpDelta), healing: Math.max(0, hpDelta),
      shieldLoss: Math.max(0, -shieldDelta), shieldGain: Math.max(0, shieldDelta),
      shieldBroken: shieldDelta < 0 && u.shield === 0,
      ...(Object.keys(addedStatuses).length ? { addedStatuses } : {}),
    };
  }
  // 致命攻击可能立即复活；实际扣血取命中发生处记录，不能由复活后的快照倒推。
  if (hitImpact && targetUid) impacts[targetUid] = {
    ...(impacts[targetUid] ?? { hpLoss: 0, healing: 0, shieldLoss: 0, shieldGain: 0, shieldBroken: false }), ...hitImpact,
  };
  let telemetry = b.telemetry;
  if (telemetry) {
    const events: BattleTelemetryEvent[] = [];
    const previousHp = b.telemetryHp ?? hp;
    const units = [...b.playerUnits, ...b.enemyUnits];
    const byUid = new Map(units.map((u) => [u.uid, u]));
    const actor = actorUid ? byUid.get(actorUid) : undefined;
    const skillSpan = spans?.find((span) => span.kind === 'skill');
    const passiveSpan = spans?.find((span) => span.kind === 'passive');
    const skillName = skillSpan ? msg.slice(skillSpan.from, skillSpan.to) : undefined;
    const passiveName = passiveSpan
      ? msg.slice(passiveSpan.from, passiveSpan.to)
      : Object.values(PASSIVES).find((passive) => msg.includes(`「${passive.name}」`))?.name;
    const skillId = skillName ? Object.values(SKILLS).find((skill) => skill.name === skillName)?.id : undefined;
    const passiveId = passiveName ? Object.values(PASSIVES).find((passive) => passive.name === passiveName)?.id : undefined;
    for (const unit of units) {
      const before = previousHp[unit.uid] ?? unit.hp;
      const delta = unit.hp - before;
      if (delta < 0) {
        events.push({ kind: 'damage', round: b.round, side, actorUid, actorSpeciesId: actor?.speciesId, targetUid: unit.uid, targetSpeciesId: unit.speciesId, skillId, passiveId, amount: -delta });
      } else if (delta > 0) {
        events.push({ kind: 'heal', round: b.round, side, actorUid, actorSpeciesId: actor?.speciesId, targetUid: unit.uid, targetSpeciesId: unit.speciesId, skillId, passiveId, amount: delta });
      }
      if (before > 0 && unit.hp <= 0) {
        events.push({ kind: 'death', round: b.round, side: unit.isPlayer ? 'player' : 'enemy', targetUid: unit.uid, targetSpeciesId: unit.speciesId });
      }
    }
    if (addsStatus?.length) {
      const target = targetUid ? byUid.get(targetUid) : undefined;
      events.push({ kind: 'status', round: b.round, side, actorUid, actorSpeciesId: actor?.speciesId, targetUid, targetSpeciesId: target?.speciesId, skillId, passiveId, statusKinds: addsStatus });
    }
    if (passiveId) {
      events.push({ kind: 'passive-trigger', round: b.round, side, actorUid, actorSpeciesId: actor?.speciesId, targetUid, passiveId });
    }
    telemetry = [...telemetry, ...events];
  }
  let result: BattleState = { ...b, log: [...b.log, { text: msg, side, hp, statuses, shields, actorUid, targetUid, addsStatus, burstTargets, spans, impacts, capture }], telemetry, telemetryHp: telemetry ? hp : undefined };
  const rewound = [...result.playerUnits, ...result.enemyUnits].filter(unit => unit.timeRewindLogPending);
  for (const unit of rewound) {
    result = replaceUnit(result, { ...unit, timeRewindLogPending: undefined });
  }
  for (const unit of rewound) {
    result = pushLog(result, `${unit.name} 的「时砂回溯」恢复 ${Math.ceil(getEffectiveMaxHp(unit) / 2)} 点生命`, sideOf(unit), unit.uid, unit.uid,
      undefined, undefined, undefined, { healing: unit.hp });
  }
  const revived = result.playerUnits.filter(unit => unit.candleReviveLogPending);
  for (const unit of revived) result = replaceUnit(result, { ...unit, candleReviveLogPending: undefined });
  for (const unit of revived) {
    result = pushLog(result, `备用的蜡烛使 ${unit.name} 以 1 点生命复活`, 'player', unit.uid, unit.uid,
      undefined, undefined, undefined, { healing: 1 });
  }
  const immune = result.enemyUnits.filter(unit => unit.blockedDebuffPending);
  for (const unit of immune) result = replaceUnit(result, { ...unit, blockedDebuffPending: undefined });
  for (const unit of immune) result = pushLog(result, `${unit.name} 免疫负面效果`, 'enemy', undefined, unit.uid);
  return result;
}

function sideOf(u: Unit): 'player' | 'enemy' {
  return u.isPlayer ? 'player' : 'enemy';
}

/** 辅助函数：从消息文本中按顺序匹配 token，返回 LogSpan[] */
function spans(msg: string, tokens: [LogSpan['kind'], string][]): LogSpan[] {
  const result: LogSpan[] = [];
  let searchFrom = 0;
  for (const [kind, text] of tokens) {
    const idx = msg.indexOf(text, searchFrom);
    if (idx >= 0) {
      result.push({ kind, from: idx, to: idx + text.length });
      searchFrom = idx + text.length;
    }
  }
  return result;
}

function actorFromId(b: BattleState, uid: string): Unit | undefined {
  return [...b.playerUnits, ...b.enemyUnits].find((u) => u.uid === uid);
}

function alliesOf(b: BattleState, actor: Unit): Unit[] {
  return actor.isPlayer ? b.playerUnits.filter((u) => u.hp > 0) : b.enemyUnits.filter((u) => u.hp > 0);
}

function enemiesOf(b: BattleState, actor: Unit): Unit[] {
  return actor.isPlayer ? b.enemyUnits.filter((u) => u.hp > 0) : b.playerUnits.filter((u) => u.hp > 0);
}

/** 有同伴时指定另一名存活友方；独自上场时只给自身一份护盾。 */
export function furnaceShellTargets(b: BattleState, actor: Unit): Unit[] {
  const others = alliesOf(b, actor).filter((unit) => unit.uid !== actor.uid);
  return others.length > 0 ? others : [actor];
}

export function isBurning(unit: Unit): boolean {
  return unit.hp > 0 && unit.statuses.some((status) => status.kind === 'burn' && status.value > 0);
}

function consumeBurn(unit: Unit, amount: number): Unit {
  return { ...unit, statuses: unit.statuses.map((status) => status.kind === 'burn'
    ? { ...status, value: Math.max(0, status.value - amount) } : status).filter((status) => status.kind !== 'burn' || status.value > 0) };
}

export function radianceLayers(unit: Unit): number {
  return Math.min(3, unit.statuses.find(s => s.kind === 'sunRadiance')?.value ?? 0);
}

export function foxFireLayers(unit: Unit): number {
  return Math.min(9, unit.statuses.find(s => s.kind === 'foxFire')?.value ?? 0);
}

function addFoxFire(unit: Unit, amount: number): Unit {
  const passive = getUnitPassive(unit);
  const cap = passive?.kind === 'foxFlame' ? passive.value : 5;
  const value = Math.min(cap, foxFireLayers(unit) + amount);
  return { ...unit, statuses: unit.statuses.filter(s => s.kind !== 'foxFire').concat([{ kind: 'foxFire', value, turns: 0 }]) };
}

/** 仅由技能/被动实际清除或消耗灼烧的路径调用，绝不从DOT衰减调用。 */
function notifyBurnRemoved(b: BattleState, target: Unit, amount: number): BattleState {
  if (amount <= 0) return b;
  let nb = b;
  const allies = target.isPlayer ? b.playerUnits : b.enemyUnits;
  for (const unit of allies) {
    if (unit.hp <= 0 || unit.radianceGainedThisRound || getUnitPassive(unit, nb)?.kind !== 'sunRadiance') continue;
    const layers = Math.min(3, radianceLayers(unit) + 1);
    const holder = actorFromId(nb, unit.uid)!;
    nb = replaceUnit(nb, { ...holder, radianceGainedThisRound: true,
      statuses: holder.statuses.filter(s => s.kind !== 'sunRadiance').concat([{ kind: 'sunRadiance', value: layers, turns: 0 }]) });
    nb = pushLog(nb, `${unit.name} 的「日华」充能（当前 ${layers}/3）`, sideOf(unit), unit.uid, unit.uid, ['sunRadiance']);
  }
  return nb;
}

/** 以技能治疗前的状态判断加成，灼烧反转尚未移除燃料时即确定。 */
function mossHealBonus(b: BattleState, actor: Unit, target: Unit): number {
  const passive = getUnitPassive(actor, b);
  return passive?.kind === 'healBurnBoost' && isBurning(target) ? passive.value : 0;
}

function cleanseMossAfterHeal(b: BattleState, actor: Unit, targetUid: string): BattleState {
  const healer = actorFromId(b, actor.uid);
  const target = actorFromId(b, targetUid);
  if (!healer || !target || target.hp <= 0) return b;
  const passive = getUnitPassive(healer, b);
  if (passive?.kind !== 'healBurnCleanse' && passive?.kind !== 'healBurnBoost' && passive?.kind !== 'sunRadiance') return b;
  const amount = Math.min(passive.value, target.statuses.find(s => s.kind === 'burn')?.value ?? 0);
  if (amount <= 0) return b;
  const nb = replaceUnit(b, consumeBurn(target, amount));
  const logged = pushLog(nb, `${actor.name} 的「${passive.name}」移除 ${target.name} ${amount} 层灼烧`, sideOf(actor), actor.uid, target.uid);
  return notifyBurnRemoved(logged, target, amount);
}

/** 循焰飞羽仅在真实灼烧存在时越过前排；强制目标仍需满足射程条件。 */
export function flameTracingTargets(b: BattleState, actor: Unit): Unit[] {
  let pool = enemiesOf(b, actor);
  const hasFront = pool.some((unit) => unit.row === 'front');
  const taunt = actor.statuses.find((status) => status.kind === 'taunt');
  const source = pool.find((unit) => unit.uid === taunt?.sourceUid);
  if (source) pool = [source];
  else if (getUnitPassive(actor, b)?.kind === 'bloodScent' && pool.length > 0) {
    pool = [pool.reduce((lowest, unit) => unit.hp < lowest.hp ? unit : lowest)];
  }
  return pool.filter((unit) => !hasFront || unit.row === 'front' || isBurning(unit));
}

/** 添薪可跨前后排，但仍服从嘲讽与嗜血目标限制，不能给未燃烧目标点火。 */
export function requiresBurningTarget(skillId: string): boolean {
  return ['stoke_fire', 'blazing_fuel', 'ember_transfer'].includes(skillId);
}

export function stokeFireTargets(b: BattleState, actor: Unit, skillId = 'stoke_fire'): Unit[] {
  let targets = enemiesOf(b, actor);
  if (skillId === 'ember_transfer' && targets.length < 2) return [];
  const taunt = actor.statuses.find((status) => status.kind === 'taunt');
  const source = targets.find((unit) => unit.uid === taunt?.sourceUid);
  if (source) targets = [source];
  else if (getUnitPassive(actor)?.kind === 'bloodScent' && targets.length > 0) {
    targets = [targets.reduce((lowest, unit) => unit.hp < lowest.hp ? unit : lowest)];
  }
  return targets.filter(isBurning);
}

function grantFlameRelay(b: BattleState, actor: Unit, targets: Unit[]): BattleState {
  const holder = actorFromId(b, actor.uid)!;
  if (holder.flameRelayUsed || getUnitPassive(holder, b)?.kind !== 'flameRelay') return b;
  const target = targets.find(t => t.isPlayer === actor.isPlayer && (actorFromId(b, t.uid)?.hp ?? 0) > 0);
  if (!target) return b;
  let nb = replaceUnit(b, { ...holder, flameRelayUsed: true });
  nb = replaceUnit(nb, applyStatusTo(actorFromId(nb, target.uid)!, { kind: 'emberSeed', value: 1, turns: 0 }, nb.round));
  return pushLog(nb, `${holder.name} 的「传火之尾」使 ${target.name} 获得火种`, sideOf(holder), holder.uid, target.uid, ['emberSeed']);
}

function applyAfterglow(b: BattleState, actor: Unit): BattleState {
  const side = actor.isPlayer ? 'player' : 'enemy';
  if (b.afterglowUsed?.[side]) return b;
  const allies = alliesOf(b, actor).filter((unit) => unit.hp > 0);
  const holders = allies.map((unit) => ({ unit, passive: getUnitPassive(unit, b) }))
    .filter(({ passive }) => passive?.kind === 'afterglow')
    .sort((a, c) => c.passive!.value - a.passive!.value || (c.passive!.targetCount ?? 1) - (a.passive!.targetCount ?? 1));
  if (holders.length === 0) return b;
  const { unit: holder, passive } = holders[0];
  let nb: BattleState = { ...b, afterglowUsed: { ...b.afterglowUsed, [side]: true } };
  const targets = [...allies].sort((a, c) => a.hp - c.hp).slice(0, passive!.targetCount ?? 1);
  // 首次符合条件的攻击即消耗机会，满血时不储存治疗，也不复活阵亡伙伴。
  for (const target of targets) {
    const amount = Math.min(passive!.value, getEffectiveMaxHp(target) - target.hp);
    if (amount <= 0) continue;
    nb = replaceUnit(nb, { ...target, hp: target.hp + amount });
    const msg = `${holder.name} 的「${passive!.name}」治愈 ${target.name} ${amount} 点生命`;
    nb = pushLog(nb, msg, sideOf(holder), holder.uid, target.uid, undefined, undefined,
      spans(msg, [['actor', holder.name], ['passive', passive!.name], ['target', target.name], ['heal', String(amount)]]));
  }
  return nb;
}

/** 长明之光逐只持有者独立结算，不使用余温的阵营共享标记。 */
function applyEternalLight(b: BattleState, actor: Unit): BattleState {
  let nb = b;
  const holders = alliesOf(b, actor).filter((unit) => !unit.eternalLightUsed && getUnitPassive(unit, b)?.kind === 'eternalLight');
  for (const holder of holders) {
    const passive = getUnitPassive(holder, nb)!;
    nb = replaceUnit(nb, { ...actorFromId(nb, holder.uid)!, eternalLightUsed: true });
    for (const target of alliesOf(nb, actor)) {
      const amount = Math.min(passive.value, getEffectiveMaxHp(target) - target.hp);
      if (amount <= 0) continue;
      nb = replaceUnit(nb, { ...target, hp: target.hp + amount });
      const msg = `${holder.name} 的「${passive.name}」治愈 ${target.name} ${amount} 点生命`;
      nb = pushLog(nb, msg, sideOf(holder), holder.uid, target.uid, undefined, undefined,
        spans(msg, [['actor', holder.name], ['passive', passive.name], ['target', target.name], ['heal', String(amount)]]));
    }
  }
  return nb;
}

function checkEnd(b: BattleState): BattleState {
  // 车轮战：场上某侧全灭但还有后备 → 不立即换人，标记 pendingSwap 等待死亡动画播完，
  // 由 UI/测试通过 GAUNTLET_SWAP（performGauntletSwap）按序顶替；无后备才真正结算胜负
  const playersAlive = b.playerUnits.some((u) => u.hp > 0);
  const enemiesAlive = b.enemyUnits.some((u) => u.hp > 0);
  const playerHasBench = !!b.gauntlet && !!b.playerBench && b.playerBench.length > 0;
  const enemyHasBench = !!b.gauntlet && !!b.enemyBench && b.enemyBench.length > 0;
  if (!enemiesAlive && !playersAlive) {
    // 同回合双方全灭：能换则都换（敌先我后），不能换的一侧直接判胜/负
    if (!enemyHasBench) return markBattleEnd({ ...b, phase: 'won' }, 'won');
    if (!playerHasBench) return markBattleEnd({ ...b, phase: 'lost', turnOrder: b.turnOrder, turnIndex: 0 }, 'lost');
    return { ...b, phase: 'acting', pendingSwap: { player: true, enemy: true } };
  }
  if (!enemiesAlive) {
    if (enemyHasBench) {
      return { ...b, phase: 'acting', pendingSwap: { player: !!b.pendingSwap?.player, enemy: true } };
    }
    return markBattleEnd({ ...b, phase: 'won' }, 'won');
  }
  if (!playersAlive) {
    if (playerHasBench) {
      return { ...b, phase: 'acting', pendingSwap: { player: true, enemy: !!b.pendingSwap?.enemy } };
    }
    return markBattleEnd({ ...b, phase: 'lost', turnOrder: b.turnOrder, turnIndex: 0 }, 'lost');
  }
  return b;
}

function markBattleEnd(b: BattleState, result: 'won' | 'lost'): BattleState {
  if (!b.telemetry || b.telemetry.some((event) => event.kind === 'battle-end')) return b;
  return { ...b, telemetry: [...b.telemetry, { kind: 'battle-end', round: b.round, result }] };
}

/** 车轮战：场上一方全灭且仍有替补时，由 UI/测试在死亡动画播完后调用——换下阵亡单位、按序顶替替补并写日志。
 *  仅敌方换人时保留玩家尚未使用的行动；已全部结算则进入新回合。
 *  我方换人说明上一回合结算已结束，直接开启新回合让替补获得基础行动。 */
export function performGauntletSwap(b: BattleState): BattleState {
  let nb = b;
  const g = b.gauntlet;
  const wantsEnemy = !!b.pendingSwap?.enemy;
  const wantsPlayer = !!b.pendingSwap?.player;
  if (wantsEnemy && g && b.enemyBench && b.enemyBench.length > 0 && b.enemyUnits.every((u) => u.hp <= 0)) {
    const recoveredPlayers = nb.playerUnits.map((unit) => unit.hp <= 0 ? unit : {
      ...unit,
      hp: Math.min(unit.maxHp, unit.hp + Math.round(unit.maxHp * 0.2)),
      statuses: [],
      shield: 0,
    });
    const next = b.enemyBench[0];
    // 刚切入场的敌方替补本回合不出手（acted=true，回合结算跳过、下回合 startRound 重置）
    const nextUnit = { ...next, acted: true, statuses: [], row: 'front' as const, column: 1 as const };
    nb = {
      ...nb,
      playerUnits: recoveredPlayers,
      enemyUnits: [nextUnit],
      enemyBench: b.enemyBench.slice(1),
      gauntlet: { total: g.total, current: g.current + 1 },
    };
    nb = pushLog(nb, `敌方派出下一只：${next.name}！`, 'enemy');
  }
  if (wantsPlayer && g && b.playerBench && b.playerBench.length > 0 && b.playerUnits.every((u) => u.hp <= 0)) {
    const next = b.playerBench[0];
    const nextUnit = { ...next, acted: false, statuses: [], row: 'front' as const, column: 1 as const };
    const down = b.playerUnits.filter((u) => u.hp <= 0);
    nb = {
      ...nb,
      playerUnits: [nextUnit],
      playerBench: b.playerBench.slice(1),
      playerDown: [...(nb.playerDown ?? []), ...down],
    };
    nb = pushLog(nb, `我方派出下一只：${next.name}！`, 'player');
  }
  nb = { ...nb, pendingSwap: undefined, roundEndedBeforeSwap: undefined };
  nb = checkEnd(nb);
  if (nb.phase !== 'acting') return nb;
  if (wantsPlayer) {
    // 崩解在完整回合末触发换人时，新回合已初始化，不再递增回合或重复结算。
    if (b.roundEndedBeforeSwap) return { ...nb, turnOrder: computeTurnOrder(nb) };
    nb = startRound(nb);
    return checkEnd(nb);
  }
  if (!playerHasMove(nb) && Object.keys(nb.orders ?? {}).length === 0) return playerEndTurn(nb);
  return nb;
}

/** 从数组抽 1 个，推进 RNG 计数，返回抽到的元素与更新后的战斗状态 */
function rngPick<T>(b: BattleState, arr: T[]): { pick?: T; battle: BattleState } {
  if (arr.length === 0) return { pick: undefined, battle: b };
  let pick: T | undefined;
  const battle = useRng(b, (v, nb) => {
    pick = arr[Math.floor(v * arr.length)];
    return nb;
  });
  return { pick, battle };
}


/**
 * 目标解析（含前后排保护规则）：
 * - 缺省/前端单体：只能选前排存活敌人（前排全灭后可打后排）
 * - pierce 贯穿：命中前排并波及对应列后排
 * - back 后排：跳过前排直击后排（后排空则打前排）
 * - direct 指定：任意位置
 * - all 群攻 / random 随机 / self / ally 不受前排限制
 */
function resolveTargets(b: BattleState, actor: Unit, skill: SkillDef, explicitTarget?: string): { targets: Unit[]; battle: BattleState } {
  if (skill.id === 'twin_tail_flames') {
    let pool = enemiesOf(b, actor);
    const taunt = pool.find(u => u.uid === actor.statuses.find(s => s.kind === 'taunt')?.sourceUid);
    if (taunt) pool = [taunt];
    else if (getUnitPassive(actor, b)?.kind === 'bloodScent') pool = [...pool].sort((a, c) => a.hp - c.hp).slice(0, 1);
    const targets: Unit[] = [];
    let nb = b;
    while (targets.length < 2 && pool.length > 0) {
      const result = rngPick(nb, pool);
      nb = result.battle;
      if (!result.pick) break;
      targets.push(result.pick);
      pool = pool.filter(u => u.uid !== result.pick!.uid);
    }
    return { targets, battle: nb };
  }
  if ((skill.id === 'burn_reversal' || skill.id === 'clean_flame_care') && explicitTarget && !alliesOf(b, actor).some((unit) => unit.uid === explicitTarget)) return { targets: [], battle: b };
  if (skill.id === 'burn_brand' && explicitTarget && !enemiesOf(b, actor).some((unit) => unit.uid === explicitTarget)) return { targets: [], battle: b };
  if (skill.id === 'flame_tracing_feather') {
    const pool = flameTracingTargets(b, actor);
    if (explicitTarget) return { targets: pool.filter((unit) => unit.uid === explicitTarget), battle: b };
    const result = rngPick(b, pool);
    return { targets: result.pick ? [result.pick] : [], battle: result.battle };
  }
  if (skill.id === 'furnace_shell') {
    const pool = furnaceShellTargets(b, actor);
    const other = explicitTarget ? pool.find((unit) => unit.uid === explicitTarget) : pool[0];
    return { targets: other && other.uid !== actor.uid ? [actor, other] : [actor], battle: b };
  }
  if (requiresBurningTarget(skill.id)) {
    const pool = stokeFireTargets(b, actor, skill.id);
    if (explicitTarget) return { targets: pool.filter((unit) => unit.uid === explicitTarget), battle: b };
    const result = rngPick(b, pool);
    return { targets: result.pick ? [result.pick] : [], battle: result.battle };
  }
  const enemies = enemiesOf(b, actor);
  const allies = alliesOf(b, actor);
  const front = enemies.filter((u) => u.row === 'front');
  const back = enemies.filter((u) => u.row === 'back');
  let nb = b;
  let targets: Unit[] = [];
  // 波光环：仅连击类攻击技能（hits>1）消耗 comboBoost 状态并增加连击段数
  const comboBoost = actor.statuses.find((s) => s.kind === 'comboBoost');
  const baseHits = skill.hits ?? 1;
  // 技能强化：连击类段数加成
  const enhanceLevel = getSkillEnhanceLevel(actor, actor.skills.indexOf(skill.id));
  const enhanceBonus = getSkillEnhanceBonus(skill.id, enhanceLevel);
  const enhancedHits = baseHits + enhanceBonus.hitsBonus;
  const isComboAttack = skill.kind === 'attack' && enhancedHits > 1;
  const effectiveHits = comboBoost && isComboAttack ? enhancedHits + comboBoost.value : enhancedHits;
  if (comboBoost && isComboAttack) {
    const boosted = { ...actor, statuses: actor.statuses.filter((s) => s.kind !== 'comboBoost') };
    nb = replaceUnit(nb, boosted);
  }
  // 嘲讽统一约束：被嘲讽者的单体/随机技能强制以嘲讽来源为目标（全体/自身/队友不受限）
  if (skill.target !== 'self' && skill.target !== 'ally' && skill.target !== 'allyAll' && skill.target !== 'all') {
    const tauntSrc = actor.statuses.find((s) => s.kind === 'taunt');
    if (tauntSrc?.sourceUid) {
      const src = enemies.find((u) => u.hp > 0 && u.uid === tauntSrc.sourceUid);
      if (src) {
        targets = Array.from({ length: effectiveHits }, () => src);
        return { targets, battle: nb };
      }
    }
  }
  switch (skill.target) {
    case 'self':
      targets = [actorFromId(nb, actor.uid) ?? actor];
      break;
    case 'ally': {
      if (explicitTarget && allies.some((u) => u.uid === explicitTarget)) {
        targets = [allies.find((u) => u.uid === explicitTarget)!];
      } else {
        targets = [actorFromId(nb, actor.uid) ?? actor];
      }
      break;
    }
    case 'allyAll': {
      targets = allies.filter((u) => u.hp > 0);
      break;
    }
    case 'all': {
      const pool = skill.reach === 'front' ? (front.length > 0 ? front : back) : enemies;
      targets = [];
      for (let i = 0; i < effectiveHits; i++) {
        targets.push(...pool);
      }
      break;
    }
    case 'random': {
      if (enemies.length === 0) {
        targets = [];
      } else {
        // 每段独立随机，允许重复命中同一目标
        targets = [];
        for (let i = 0; i < effectiveHits; i++) {
          const res = rngPick(nb, enemies);
          nb = res.battle;
          if (res.pick) targets.push(res.pick);
        }
      }
      break;
    }
    case 'single': {
      const reach = skill.reach ?? 'front';
      if (reach === 'pierce') {
        let ft: Unit | undefined;
        if (explicitTarget && front.some((u) => u.uid === explicitTarget)) {
          ft = front.find((u) => u.uid === explicitTarget)!;
        } else {
          const res = rngPick(nb, front.length > 0 ? front : back);
          nb = res.battle;
          ft = res.pick;
        }
        if (ft) {
          targets = [ft];
          if (ft.row === 'front') {
            const bc = back.find((u) => u.column === ft.column);
            if (bc) targets.push(bc);
          }
        }
      } else {
        let picked: Unit | undefined;
        if (reach === 'direct') {
          if (explicitTarget && enemies.some((u) => u.uid === explicitTarget)) {
            picked = enemies.find((u) => u.uid === explicitTarget)!;
          } else {
            const res = rngPick(nb, front.length > 0 ? front : back);
            nb = res.battle;
            picked = res.pick;
          }
        } else if (reach === 'back') {
          const backPool = back.length > 0 ? back : front;
          if (explicitTarget && backPool.some((u) => u.uid === explicitTarget)) {
            picked = backPool.find((u) => u.uid === explicitTarget)!;
          } else {
            const res = rngPick(nb, backPool);
            nb = res.battle;
            picked = res.pick;
          }
        } else {
          // 嗜血嗅觉：无视前后排限制，强制攻击指定目标
          const actorPassive = getUnitPassive(actor);
          if (actorPassive?.kind === 'bloodScent' && explicitTarget && enemies.some((u) => u.uid === explicitTarget)) {
            picked = enemies.find((u) => u.uid === explicitTarget)!;
          } else {
            const frontPool = front.length > 0 ? front : back;
            if (explicitTarget && frontPool.some((u) => u.uid === explicitTarget)) {
              picked = frontPool.find((u) => u.uid === explicitTarget)!;
            } else {
              const res = rngPick(nb, frontPool);
              nb = res.battle;
              picked = res.pick;
            }
          }
        }
        // 连击：同一目标命中 hits 次（伤害按 hits 倍结算，perTarget 聚合）
        if (picked) {
          targets = Array.from({ length: effectiveHits }, () => picked);
        }
      }
      break;
    }
    default:
      targets = [enemies[0]].filter(Boolean);
  }
  return { targets, battle: nb };
}

function applyStatusTo(unit: Unit, effect: { kind: Unit['statuses'][number]['kind']; value: number; turns: number; sourceUid?: string; sealedSkills?: string[] }, round?: number): Unit {
  if (unit.debuffImmune && NEGATIVE_STATUSES.has(effect.kind)) return { ...unit, blockedDebuffPending: true };
  if (effect.kind === 'emberSeed') effect = { ...effect, value: 1, turns: 0 };
  if (effect.kind === 'burn' && effect.value > 0 && unit.hp > 0 && getUnitPassive(unit)?.kind === 'foxFlame') unit = addFoxFire(unit, 1);
  const idx = unit.statuses.findIndex((s) => s.kind === effect.kind);
  if (idx >= 0) {
    const next = [...unit.statuses];
    if (effect.kind === 'burn' || effect.kind === 'poison' || effect.kind === 'rageThorn') {
      // 灼烧/中毒/怒棘可叠加：层数相加（可挂多层）
      next[idx] = { ...next[idx], value: next[idx].value + effect.value };
    } else if (effect.kind === 'spdDown') {
      // 减速可叠加，上限 5 层；持续回合取最大值
      next[idx] = { ...next[idx], value: Math.min(5, next[idx].value + effect.value), turns: Math.max(next[idx].turns, effect.turns) };
    } else if (effect.kind === 'atkDown') {
      // 降攻可叠加，上限 2 层；持续回合取最大值
      next[idx] = { ...next[idx], value: Math.min(2, next[idx].value + effect.value), turns: Math.max(next[idx].turns, effect.turns) };
    } else {
      next[idx] = {
        ...next[idx],
        value: Math.max(next[idx].value, effect.value),
        turns: Math.max(next[idx].turns, effect.turns),
        ...(effect.kind === 'bloodDrain' ? { appliedRound: round } : {}),
        ...(effect.kind === 'taunt' || effect.kind === 'chainLink' ? { sourceUid: effect.sourceUid } : {}),
        ...(effect.kind === 'skillSeal' && effect.sealedSkills ? { sealedSkills: effect.sealedSkills } : {}),
      };
    }
    return { ...unit, statuses: next };
  }
  return { ...unit, statuses: [...unit.statuses, { ...effect, appliedRound: round }] };
}

/** 交换己方两只单位的位置（可前后/左右任意交换） */
function swapUnits(b: BattleState, uidA: string, uidB: string): BattleState {
  const a = actorFromId(b, uidA);
  const c = actorFromId(b, uidB);
  if (!a || !c || a.uid === c.uid) return b;
  const aPos = { row: a.row, column: a.column };
  const repA = { ...a, row: c.row, column: c.column };
  const repC = { ...c, row: aPos.row, column: aPos.column };
  const swap = (u: Unit) => (u.uid === uidA ? repA : u.uid === uidB ? repC : u);
  return {
    ...b,
    playerUnits: b.playerUnits.map(swap),
    enemyUnits: b.enemyUnits.map(swap),
  };
}

/** 敌方 AI 尝试把残血前排换到后排（成功返回新状态，失败返回 undefined） */
function tryEnemySwap(b: BattleState, actor: Unit): BattleState | undefined {
  if (actor.row !== 'front') return undefined;
  if ((actor.swapCount ?? 0) >= 2) return undefined;
  if (actor.hp / actor.maxHp >= 0.5) return undefined;
  const backs = alliesOf(b, actor).filter((u) => u.row === 'back' && u.hp > 0 && u.hp / u.maxHp > 0.5);
  if (backs.length === 0) return undefined;
  const target = backs.sort((x, y) => y.hp / y.maxHp - x.hp / y.maxHp)[0];
  let nb = swapUnits(b, actor.uid, target.uid);
  const swappedActor = actorFromId(nb, actor.uid);
  if (swappedActor) {
    nb = replaceUnit(nb, { ...swappedActor, swapCount: (swappedActor.swapCount ?? 0) + 1 });
  }
  nb = markActed(nb, actor.uid);
  nb = pushLog(nb, `${actor.name} 退到后排，${target.name} 顶上`, sideOf(actor));
  return nb;
}

function isDefensiveSkill(skill: SkillDef): boolean {
  return skill.kind === 'heal' || (skill.kind === 'buff' && (skill.id === 'clean_flame_care'
    || skill.id === 'furnace_shell' || skill.id === 'ash_shelter'
    || !!skill.effects?.some(e => e.kind === 'shield' || e.kind === 'shieldCounter' || e.kind === 'sporeShield' || e.kind === 'waterCurtain')));
}

// 仅用公开属性估算直接伤害，不读取我方指令，也不预演随机效果。
function estimateAiDamage(b: BattleState, actor: Unit, skill: SkillDef, target: Unit): number {
  if ((skill.damage ?? 0) <= 0 && !skill.spdScaling && skill.id !== 'wind_assault') return 0;
  const opponents = enemiesOf(b, actor);
  const reach = skill.reach ?? 'front';
  if ((skill.target === 'single' || skill.target === 'all') && reach !== 'direct'
    && getUnitPassive(actor, b)?.kind !== 'bloodScent') {
    const preferredRow = reach === 'back' ? 'back' : 'front';
    if ((skill.target === 'single' || skill.reach === 'front')
      && opponents.some(u => u.row === preferredRow) && target.row !== preferredRow) return 0;
  }
  const bonus = getSkillEnhanceBonus(skill.id, getSkillEnhanceLevel(actor, actor.skills.indexOf(skill.id)));
  let damage = (skill.damage ?? 0) + bonus.damageBonus + getDamageBonus(actor, b)
    + getEffectiveSpd(actor) * (skill.spdScaling ?? 0);
  if (skill.id === 'wind_assault') damage += Math.max(0, getEffectiveSpd(actor) - getEffectiveSpd(target));
  if (skill.id === 'flying_leaf' && getEffectiveSpd(actor) > getEffectiveSpd(target)) damage += 3;
  if (skill.id === 'thorn_retaliation' && actor.counterTriggeredRound === b.round) damage += 1;
  if (skill.id === 'purifying_orb' && isBurning(target)) damage += 2;
  if (skill.id === 'solar_strike') damage += radianceLayers(actor) * 2;
  if (skill.id === 'shell_charge') damage += Math.min(5, actor.shield);
  if (skill.id === 'core_crystal_burst') damage += Math.min(5, actor.shield);
  if (skill.id === 'sun_sunder' && target.shield > 0) damage += 4;
  if (skill.id === 'core_crystal_spike' && actor.shield > 0) damage += 3;
  const attackerPassive = getUnitPassive(actor, b);
  if (attackerPassive?.kind === 'fasterDamage' && getEffectiveSpd(actor) > getEffectiveSpd(target)) damage += attackerPassive.value;
  const hits = skill.target === 'random' && opponents.length > 1 ? 1 : (skill.hits ?? 1) + bonus.hitsBonus;
  let perHit = Math.max(1, damage - getDamageGuard(target, b));
  const guard = getUnitPassive(target, b);
  if ((guard?.kind === 'bigHitGuard' || guard?.kind === 'lifeSpring') && perHit > guard.value) perHit -= 2;
  const total = perHit * hits;
  return Math.max(0, total - (skill.id === 'shadow_claw' || skill.id === 'sun_sunder' ? 0 : target.shield));
}

/** 纯函数：基于公开状态选择敌方行动，不修改状态或消耗随机数。 */
export function selectEnemyAction(
  b: BattleState, actor: Unit, rngVal1: number, rngVal2: number,
): { skillId?: string; targetUid?: string; kind: 'heal' | 'buff' | 'attack' | 'status' | 'swap'; fallbackSkillId?: string } | undefined {
  if (b.testEnemyInactive && !actor.isPlayer) return undefined;
  if (actor.statuses.some((s) => s.kind === 'stun')) return undefined;
  if (getUnitPassive(actor)?.kind === 'mirrorCopy' && !actor.mirrorOwnSkillUsed && actor.mirrorCopyRound !== b.round) {
    const earlierAlly = alliesOf(b, actor).some(u => u.uid !== actor.uid && getEffectiveSpd(u) > getEffectiveSpd(actor));
    if (!mirrorCopyPlan(b, actor).reason || earlierAlly) return { kind: 'status', skillId: 'mirror_copy' };
  }
  // 技能封印：被封印的技能排除出候选池（避免 AI 选到被封印技能导致行动被吞）
  const skills = actor.skills
    .map(id => getBattleSkill(b, id))
    .filter((s) => canUnitUseSkill(actor, s.id, b) && (!requiresBurningTarget(s.id) || stokeFireTargets(b, actor, s.id).length > 0)
      && (s.id !== 'flame_tracing_feather' || flameTracingTargets(b, actor).length > 0)
      && (s.id !== 'ignite_embers' || alliesOf(b, actor).some(u => u.statuses.some(effect => effect.kind === 'emberSeed'))));
  if (skills.length === 0) return undefined;
  const candidates: { kind: 'heal' | 'buff' | 'attack' | 'status' | 'swap'; skill?: SkillDef; targetUid?: string; score: number }[] = [];
  const hpRatio = actor.hp / actor.maxHp;
  const allies = alliesOf(b, actor);
  const enemies = enemiesOf(b, actor);
  // ─── 1. 治疗 ───
  const collapse = battleCollapseDamage(b.round);
  const incomingAttack = (target: Unit) => Math.max(0, ...enemies.flatMap(enemy => enemy.skills
    .map(id => getBattleSkill(b, id)).filter(skill => !enemy.statuses.some(s => s.kind === 'stun') && skill.kind === 'attack' && canUnitUseSkill(enemy, skill.id, b))
    .map(skill => estimateAiDamage(b, enemy, skill, target))));
  const endDamage = (target: Unit) => collapse + target.statuses.reduce((sum, status) =>
    sum + ((status.kind === 'poison' || (status.kind === 'burn' && getUnitPassive(target, b)?.kind !== 'foxFlame'))
      ? Math.ceil(status.value / 2) : 0), 0);
  const lifesaving = new Set<string>();
  const healSkills = skills.filter((s) => s.kind === 'heal');
  if (healSkills.length > 0) {
    for (const hs of healSkills) {
      // 终焉成长专属阈值：残血（<60%）且成长值充足时优先使用；不满足则完全不作为治疗候选（避免成长值不足白选）
      if (hs.id === 'growth_ultimate') {
        const curGV = actor.growthValue ?? 0;
        if (curGV >= 10 && hpRatio < 0.6 && (actor.ultimateUsesLeft ?? 3) > 0) {
          candidates.push({ kind: 'heal', skill: hs, targetUid: actor.uid, score: 75 });
        }
        continue;
      }
      const enhancement = getSkillEnhanceBonus(hs.id, getSkillEnhanceLevel(actor, actor.skills.indexOf(hs.id)));
      const targets = hs.target === 'self' ? [actor] : allies;
      let groupScore = 0;
      for (const ally of targets) {
        const burn = ally.statuses.find(s => s.kind === 'burn')?.value ?? 0;
        const reversed = hs.id === 'burn_reversal' ? Math.min(5, burn) : 0;
        const passive = getUnitPassive(actor, b);
        const cleanse = passive && ['healBurnCleanse', 'healBurnBoost', 'sunRadiance'].includes(passive.kind) ? passive.value : 0;
        const removed = Math.min(burn, reversed + cleanse);
        const effective = Math.min(getEffectiveMaxHp(ally) - ally.hp, Math.max(1, hs.heal ?? 0)
          + enhancement.healBonus + reversed + mossHealBonus(b, actor, ally)
          + (hs.id === 'solar_heal' ? radianceLayers(actor) * 2 : 0));
        const cleanseBenefit = getUnitPassive(ally, b)?.kind === 'foxFlame' ? 0
          : Math.ceil(burn / 2) - Math.ceil((burn - removed) / 2);
        const usefulCleanse = getUnitPassive(ally, b)?.kind === 'burnShield' && ally.hp / ally.maxHp > 0.55 ? 0 : cleanseBenefit;
        if (effective <= 0 && usefulCleanse <= 0) continue;
        const danger = incomingAttack(ally) + endDamage(ally);
        const rescue = ally.hp <= danger && ally.hp + effective > danger - usefulCleanse;
        let score = effective * 5 + usefulCleanse * 6 + (ally.hp / ally.maxHp < 0.4 ? 8 : 0) + (rescue ? 24 : 0);
        // 无法熬过已知回合末伤害的治疗，不再因残血而反复高优先施放。
        if (ally.hp + effective <= endDamage(ally) - usefulCleanse) score -= 35;
        if (rescue) lifesaving.add(`${hs.id}:${hs.target === 'allyAll' ? '' : ally.uid}`);
        if (hs.target === 'allyAll') groupScore += score;
        else candidates.push({ kind: 'heal', skill: hs, targetUid: ally.uid, score });
      }
      if (hs.target === 'allyAll' && groupScore > 0) candidates.push({ kind: 'heal', skill: hs, score: groupScore });
    }
  }
  // ─── 2. 增益/防御 ───
  const nTypeBuff = b.nodeType ?? 'battle';
  const actorPassiveForBuff = getUnitPassive(actor);
  const hasThorns = actorPassiveForBuff?.kind === 'thorns';
  const sporeSummonSkill = skills.find((s) => s.id === 'spore_summon');
  if (sporeSummonSkill) {
    const deadSpores = b.enemyUnits.filter((u) => (u.speciesId === 'boss_minion_spore_sac' || u.speciesId === 'boss_minion_slug') && u.hp <= 0);
    const usedCols = new Set(b.enemyUnits.filter((u) => u.hp > 0).map((u) => `${u.row}:${u.column}`));
    const hasSpace = deadSpores.length > 0 || usedCols.size < 6;
    if (hasSpace) {
      if (deadSpores.length > 0 && rngVal1 < 0.6) {
        candidates.push({ kind: 'buff', skill: sporeSummonSkill, score: 68 });
      } else if (rngVal1 < 0.4) {
        candidates.push({ kind: 'buff', skill: sporeSummonSkill, score: 55 });
      }
    }
  }
  const buffSkills = skills.filter((s) => s.kind === 'buff');
  for (const bs of buffSkills) {
    if (bs.id === 'core_crystal_cleanse') {
      const layers = Math.min(6, actor.statuses.filter(status => ['burn', 'poison', 'fear'].includes(status.kind)).reduce((sum, status) => sum + status.value, 0));
      if (layers > 0) candidates.push({ kind: 'buff', skill: bs, score: layers * 10 });
      continue;
    }
    if (bs.id === 'clean_flame_care') {
      const target = allies.filter(isBurning).sort((a, c) =>
        (c.statuses.find(s => s.kind === 'burn')?.value ?? 0) - (a.statuses.find(s => s.kind === 'burn')?.value ?? 0))[0];
      if (target) candidates.push({ kind: 'buff', skill: bs, targetUid: target.uid, score: 65 });
      continue;
    }
    const shieldEffect = bs.effects?.find(e => e.kind === 'shield');
    if (shieldEffect || bs.id === 'furnace_shell' || bs.id === 'ash_shelter') {
      const enhanced = getSkillEnhanceBonus(bs.id, getSkillEnhanceLevel(actor, actor.skills.indexOf(bs.id))).effectBonus;
      const amount = (bs.id === 'furnace_shell' ? 3 : bs.id === 'ash_shelter'
        ? 4 + (enemies.some(isBurning) ? 2 : 0) : shieldEffect!.value) + enhanced;
      const shieldScore = (target: Unit) => {
        const incoming = incomingAttack(target);
        const effective = getUnitPassive(target, b)?.kind === 'crystalConversion'
          ? Math.min(amount, 99 - target.shield) : Math.min(amount, Math.max(0, incoming - target.shield));
        if (effective <= 0) return 0;
        // 护盾不能抵挡灼烧、中毒或战场崩解。
        if (target.hp <= endDamage(target)) return 0;
        return effective * 5 + (target.hp <= incoming + endDamage(target) ? 12 : 0);
      };
      if (bs.target === 'allyAll') {
        const score = allies.reduce((sum, ally) => sum + shieldScore(ally), 0);
        if (score > 0) candidates.push({ kind: 'buff', skill: bs, score });
      } else {
        const targets = bs.id === 'furnace_shell' ? furnaceShellTargets(b, actor) : bs.target === 'self' ? [actor] : allies;
        for (const target of targets) {
          const score = shieldScore(target) + (bs.id === 'furnace_shell' && target.uid !== actor.uid ? shieldScore(actor) : 0);
          if (score > 0) candidates.push({ kind: 'buff', skill: bs, targetUid: target.uid, score });
        }
      }
      continue;
    }
    if (bs.id === 'spore_shield' && !actor.statuses.some((s) => s.kind === 'sporeShield')) {
      if (hpRatio < 0.5 && rngVal1 < 0.55) {
        candidates.push({ kind: 'buff', skill: bs, score: 55 });
      }
    }
    if (bs.effects?.some((e) => e.kind === 'atkUp') && !actor.statuses.some((s) => s.kind === 'atkUp')) {
      let roarChance = 0.25;
      if (b.round <= 1) {
        if (nTypeBuff === 'arena' || nTypeBuff === 'guardian') roarChance = 0.7;
        else if (nTypeBuff === 'gauntlet') roarChance = 0.7;
        else if (nTypeBuff === 'corrupted') roarChance = 0.7;
        else roarChance = 0.4;
      }
      const canAttackLater = skills.some(s => s.kind === 'attack') && actor.hp > incomingAttack(actor) + endDamage(actor);
      if (canAttackLater && rngVal1 < roarChance) {
        candidates.push({ kind: 'buff', skill: bs, score: 40 });
      }
    }
    if (bs.priority === 'first' && canUnitUseSkill(actor, bs.id, b)) {
      if (!actor.statuses.some((s) => s.kind === 'shield' || s.kind === 'shieldCounter' || s.kind === 'atkUp' || s.kind === 'comboBoost')) {
        let firstChance = b.round <= 1 ? 0.8 : 0.5;
        const offensive = bs.effects?.some(e => e.kind === 'atkUp' || e.kind === 'comboBoost');
        const useful = offensive ? skills.some(s => s.kind === 'attack') && actor.hp > incomingAttack(actor) + endDamage(actor)
          : incomingAttack(actor) > 0 && actor.hp > endDamage(actor);
        if (useful && rngVal1 < firstChance) {
          candidates.push({ kind: 'buff', skill: bs, score: offensive ? 40 : 45 });
        }
      }
    }
    if (bs.effects?.some((e) => e.kind === 'taunt')) {
      const frontEnemies = enemies.filter((u) => u.row === 'front' && u.hp > 0);
      const tauntChance = hasThorns ? 0.6 : 0.35;
      if (frontEnemies.length >= 2 && hpRatio > 0.4 && rngVal1 < tauntChance) {
        candidates.push({ kind: 'buff', skill: bs, score: hasThorns ? 50 : 40 });
      }
    }
    if (bs.effects?.some((e) => e.kind === 'comboBoost') && !actor.statuses.some((s) => s.kind === 'comboBoost')) {
      if (hpRatio > 0.5 && actor.hp > incomingAttack(actor) + endDamage(actor)
        && skills.some(s => s.kind === 'attack' && (s.hits ?? 1) > 1) && rngVal1 < 0.55) {
        candidates.push({ kind: 'buff', skill: bs, score: 45 });
      }
    }
    if (bs.id === 'toxic_burst' && !actor.statuses.some((s) => s.kind === 'toxicBurstReady')) {
      let burstChance = 0.15;
      if (hpRatio < 0.4) burstChance = 0.8;
      else if (hpRatio < 0.7) burstChance = 0.4;
      if (rngVal1 < burstChance) {
        candidates.push({ kind: 'buff', skill: bs, score: hpRatio < 0.4 ? 70 : 45 });
      }
    }
    if (bs.id === 'rock_reforge') {
      const deadMinions = b.enemyUnits.filter((u) => u.hp <= 0 && u.speciesId.startsWith('boss_minion_'));
      const aliveMinions = allies.filter((u) => u.speciesId.startsWith('boss_minion_'));
      if (deadMinions.length > 0) {
        candidates.push({ kind: 'buff', skill: bs, score: 80 });
      } else if (aliveMinions.length >= 2 && hpRatio > 0.3 && rngVal1 < 0.9) {
        candidates.push({ kind: 'buff', skill: bs, score: 65 });
      }
    }
    if (bs.id === 'ghostly_summon') {
      const aliveMinions = allies.filter((u) => u.speciesId === 'boss_minion_ghost_sailor' || u.speciesId === 'boss_minion_phantom');
      if (aliveMinions.length === 0) {
        candidates.push({ kind: 'buff', skill: bs, score: 80 });
      }
    }
    if (bs.id === 'chain_bind') {
      const allChained = enemies.every((e) => e.statuses.some((s) => s.kind === 'chainLink'));
      if (!allChained && rngVal1 < 0.8) {
        candidates.push({ kind: 'buff', skill: bs, score: 65 });
      }
    }
    // 成长之主Boss AI
    if (bs.id === 'growth_roar') {
      if (!actor.statuses.some((s) => s.kind === 'atkUp') && rngVal1 < 0.6) {
        candidates.push({ kind: 'buff', skill: bs, score: 55 });
      }
    }
    if (bs.id === 'growth_summon') {
      const alivePuppets = allies.filter((u) => u.speciesId === 'growth_puppet' && u.hp > 0);
      if (alivePuppets.length < 2 && (actor.growthValue ?? 0) >= 3) {
        if (alivePuppets.length === 0 && rngVal1 < 0.7) {
          candidates.push({ kind: 'buff', skill: bs, score: 70 });
        } else if (alivePuppets.length === 1 && rngVal1 < 0.4) {
          candidates.push({ kind: 'buff', skill: bs, score: 55 });
        }
      }
    }
  }
  // ─── 3. 换位 ───
  const nTypeSwap = b.nodeType ?? 'battle';
  if (actor.row === 'front' && (actor.swapCount ?? 0) < 2 && nTypeSwap !== 'guardian' && b.round > 1) {
    const healthyBack = allies.filter((u) => u.row === 'back' && u.hp > 0 && u.hp / u.maxHp > 0.5);
    if (healthyBack.length > 0) {
      if (hpRatio < 0.25 && rngVal1 < 0.65) {
        candidates.push({ kind: 'swap', score: 55 });
      } else if (hpRatio < 0.35 && rngVal1 < 0.4) {
        candidates.push({ kind: 'swap', score: 40 });
      }
    }
    const hasTaunt = actor.statuses.some((s) => s.kind === 'taunt');
    if (hasTaunt && hpRatio < 0.3 && healthyBack.length > 0 && rngVal1 < 0.5) {
      candidates.push({ kind: 'swap', score: 50 });
    }
  }
  // ─── 4. 攻击 ───
  const chainActivateSkill = skills.find((s) => s.id === 'chain_activate');
  if (chainActivateSkill) {
    const chainCount = enemies.filter((e) => e.statuses.some((s) => s.kind === 'chainLink')).length;
    if (chainCount >= 2) {
      candidates.push({ kind: 'attack', skill: chainActivateSkill, score: 75 });
    } else if (chainCount === 1) {
      candidates.push({ kind: 'attack', skill: chainActivateSkill, score: 45 });
    }
  }
  const attackSkills = skills.filter((s) => s.kind === 'attack' && s.id !== 'chain_activate');
  const statusSkills = skills.filter((s) => s.kind === 'status');
  let targetPool = enemies.filter((u) => u.hp > 0);
  if (targetPool.length === 0 && candidates.length === 0) return undefined;
  const taunt = actor.statuses.find((s) => s.kind === 'taunt');
  if (taunt?.sourceUid) {
    const src = enemies.find((u) => u.uid === taunt.sourceUid && u.hp > 0);
    if (src) targetPool = [src];
  }
  const actorPassive = getUnitPassive(actor);
  // 成长值消耗攻击技能AI（成长之主）
  const growthAtkSkills = skills.filter((s) => s.growthCost && s.kind === 'attack');
  for (const ga of growthAtkSkills) {
    const curGV = actor.growthValue ?? 0;
    if (curGV >= (ga.growthCost ?? 0)) {
      const scoredTargets = targetPool.map((t) => {
        let tScore = (ga.damage ?? 0) + 10;
        if (t.hp / t.maxHp < 0.3) tScore += 15;
        if (ga.target === 'all' && targetPool.length >= 2) tScore += 8;
        return { target: t, score: tScore };
      });
      scoredTargets.sort((a, c) => c.score - a.score);
      const best = scoredTargets[0];
      if (best) {
        candidates.push({ kind: 'attack', skill: ga, targetUid: best.target.uid, score: best.score + 5 });
      }
    }
  }
  const hasVenomPower = actorPassive?.kind === 'venomPower';
  const hasScorchPlus = actorPassive?.kind === 'scorchPlus';
  if (actorPassive?.kind === 'bloodScent' && targetPool.length > 1) {
    const lowest = targetPool.reduce((min, t) => t.hp < min.hp ? t : min, targetPool[0]);
    if (lowest) targetPool = [lowest];
  }
  const hasComboBoost = actor.statuses.some((s) => s.kind === 'comboBoost');
  const currentAct = b.act ?? 1;
  const nType = b.nodeType ?? 'battle';
  for (const atk of attackSkills) {
    const isLimitedHighDmg = atk.uses !== undefined && (atk.damage ?? 0) >= 6;
    const comboBoostBonus = hasComboBoost && (atk.hits ?? 1) > 1 ? 25 : 0;
    let limitedBonus = 0;
    if (isLimitedHighDmg) {
      if (hpRatio < 0.35) limitedBonus += 40;
      else if (targetPool.some((t) => t.statuses.some((s) => s.kind === 'poison' || s.kind === 'burn'))) limitedBonus += 30;
      else if (hpRatio > 0.5) limitedBonus += 15;
      if (nType === 'guardian' && hpRatio < 0.5) limitedBonus += 20;
    }
    const attackTargets = atk.id === 'flame_tracing_feather' ? flameTracingTargets(b, actor) : targetPool;
    const scoredTargets = attackTargets.map((t) => {
      let tScore = 0;
      if (atk.id === 'shell_charge') tScore += Math.min(5, actor.shield) * 3;
      if (atk.id === 'purifying_orb' && isBurning(t)) tScore += 6;
      if (atk.id === 'solar_strike') tScore += radianceLayers(actor) * 4 + 6;
      if (atk.id === 'sun_sunder') {
        tScore += t.shield * 3;
      }
      const lowHpBonus = currentAct >= 2 ? 12 : 8;
      if (t.hp / t.maxHp < 0.3) tScore += lowHpBonus;
      const hasHealSkill = t.skills.some((id) => getSkill(id)?.kind === 'heal');
      const threatBonus = currentAct >= 2 ? 10 : 6;
      if (hasHealSkill) tScore += threatBonus;
      if (t.spd >= 6) tScore += threatBonus;
      const tp = getUnitPassive(t);
      if (tp && (tp.kind === 'power' || tp.kind === 'frenzy')) tScore += threatBonus;
      if (hasVenomPower && t.statuses.some((s) => s.kind === 'poison')) tScore += 15;
      if (hasScorchPlus && t.statuses.some((s) => s.kind === 'burn')) tScore += 15;
      const debuffCount = t.statuses.filter((s) => s.kind === 'poison' || s.kind === 'burn' || s.kind === 'atkDown').length;
      tScore += debuffCount * 3;
      if (currentAct === 1) {
        tScore += rngVal1 * 15;
      } else if (currentAct === 2) {
        if (t.hp / t.maxHp < 0.3) tScore += 5;
        if (hasHealSkill || t.spd >= 6) tScore += 8;
      } else {
        if (hasHealSkill || t.spd >= 6) tScore += 12;
        if (debuffCount > 0) tScore += 10;
      }
      if (nType === 'arena') {
        if (t.hp / t.maxHp < 0.3) tScore += 5;
      } else if (nType === 'gauntlet') {
        if (t.hp / t.maxHp < 0.3) tScore += 4;
        if (atk.target === 'all') tScore += 5;
      } else if (nType === 'corrupted') {
        tScore += 3;
      } else if (nType === 'guardian') {
        if (hasHealSkill) tScore += 10;
      }
      tScore += (atk.damage ?? 0) + getDamageBonus(actor, b);
      if (estimateAiDamage(b, actor, atk, t) >= t.hp) tScore += 65;
      if (actorPassive?.kind === 'shadowHunter' && t.hp / t.maxHp < 0.5) {
        tScore += actorPassive.value;
      }
      if (atk.target === 'all' && targetPool.length >= 3) tScore += 3;
      if (atk.effects?.some((e) => e.kind === 'poison' || e.kind === 'burn')) tScore += 2;
      if (atk.id === 'soul_echo') {
        const actorSoul = actor.soul ?? 0;
        if (actorSoul >= 10) tScore += 25;
        else if (actorSoul >= 5) tScore += 15;
        else if (actorSoul >= 3) tScore += 8;
      }
      const actorSpd = getEffectiveSpd(actor);
      if (atk.spdScaling && atk.spdScaling > 0) {
        const spdBonus = Math.min(25, actorSpd * 4);
        tScore += spdBonus;
        if (atk.target === 'all' && targetPool.length >= 2) {
          tScore += Math.min(10, actorSpd * 2);
        }
      }
      return { target: t, score: tScore };
    });
    scoredTargets.sort((a, c) => c.score - a.score);
    const best = scoredTargets[0];
    if (best) {
      candidates.push({ kind: 'attack', skill: atk, targetUid: best.target.uid, score: best.score + limitedBonus + comboBoostBonus + 5 });
    }
  }
  // ─── 4b. 状态技能评分（弱化/毒雾等 debuff 技能） ───
  for (const st of statusSkills) {
    if (st.id === 'pass_flame' || st.id === 'relay_wildfire') {
      const allies = alliesOf(b, actor).filter(unit => !unit.statuses.some(s => s.kind === 'emberSeed')
        && unit.skills.some(id => getSkill(id).kind === 'attack') && unit.hp > 4);
      const target = allies.sort((a, c) => c.hp - a.hp)[0];
      if (target && (st.id === 'relay_wildfire' || !actor.flameRelayUsed))
        candidates.push({ kind: 'status', skill: st, targetUid: target.uid, score: st.id === 'relay_wildfire' ? 50 : 38 });
      continue;
    }
    if (st.id === 'burn_tail') {
      const p = getUnitPassive(actor, b);
      if (foxFireLayers(actor) < (p?.kind === 'foxFlame' ? p.value : 5)) candidates.push({ kind: 'status', skill: st, score: 55 });
      continue;
    }
    if (st.id === 'illusory_flame') {
      const p = getUnitPassive(actor, b);
      candidates.push({ kind: 'status', skill: st, score: p?.kind === 'foxFlame' && foxFireLayers(actor) < p.value ? 45 : 15 });
      continue;
    }
    if (st.id === 'burn_brand') {
      const target = targetPool.filter((unit) => !unit.statuses.some((status) => status.kind === 'burnBrand' && status.sourceSide === sideOf(actor)))
        .sort((a, c) => (c.statuses.find((status) => status.kind === 'burn')?.value ?? 0) - (a.statuses.find((status) => status.kind === 'burn')?.value ?? 0))[0];
      if (target) candidates.push({ kind: 'status', skill: st, targetUid: target.uid, score: 35 + Math.min(12, target.statuses.find((status) => status.kind === 'burn')?.value ?? 0) });
      continue;
    }
    if (st.id === 'molten_self_burn') {
      const burn = actor.statuses.find((status) => status.kind === 'burn')?.value ?? 0;
      if (hpRatio > 0.3 && actor.hp > 3 && burn < 2) {
        candidates.push({ kind: 'status', skill: st, score: actor.shield < 2 ? 40 : 20 });
      }
      continue;
    }
    if (requiresBurningTarget(st.id)) {
      const target = stokeFireTargets(b, actor, st.id).sort((a, c) => c.hp - a.hp)[0];
      if (target) candidates.push({ kind: 'status', skill: st, targetUid: target.uid, score: 40 });
      continue;
    }
    if (st.target === 'all') {
      // 全体 debuff：对多个目标施加状态，价值随目标数提升
      const aliveEnemies = targetPool.length;
      if (aliveEnemies >= 2 && canUnitUseSkill(actor, st.id, b)) {
        candidates.push({ kind: 'status', skill: st, score: 40 + aliveEnemies * 5 });
      }
    } else {
      // 绝望凝视：仅对恐惧≥3层目标使用，50%概率
      if (st.id === 'despair_gaze') {
        const validTargets = targetPool.filter((t) => getFearStacks(t) >= 3);
        if (validTargets.length > 0 && rngVal1 < 0.5 && canUnitUseSkill(actor, st.id, b)) {
          const best = validTargets.sort((a, b) => b.hp - a.hp)[0];
          candidates.push({ kind: 'status', skill: st, targetUid: best.uid, score: 30 });
        }
        continue;
      }
      // 单体 debuff：优先对高血量/无 debuff 目标使用
      const scoredTargets = targetPool.map((t) => {
        let tScore = 20;
        if (t.hp / t.maxHp > 0.6) tScore += 10;
        if (!t.statuses.some((s) => s.kind === 'poison' || s.kind === 'burn' || s.kind === 'atkDown' || s.kind === 'spdDown')) tScore += 8;
        if (currentAct >= 2) tScore += 5;
        return { target: t, score: tScore };
      });
      scoredTargets.sort((a, c) => c.score - a.score);
      const best = scoredTargets[0];
      if (best && canUnitUseSkill(actor, st.id, b)) {
        candidates.push({ kind: 'status', skill: st, targetUid: best.target.uid, score: best.score + 5 });
      }
    }
  }
  // ─── 5. 连续重复惩罚：上回合使用过的技能降低分数 ───
  const lastId = actor.lastSkillId;
  if (lastId) {
    for (const c of candidates) {
      if (c.skill && c.skill.id === lastId) {
        if (c.kind === 'attack') c.score -= 15;
        else if (c.kind === 'buff') c.score -= 10;
        else if (c.kind === 'status') c.score -= 10;
        else if (c.kind === 'heal') c.score -= 10;
      }
    }
  }
  for (const candidate of candidates) {
    if (candidate.skill && isDefensiveSkill(candidate.skill) && candidate.skill.id !== 'growth_ultimate') {
      const rescue = lifesaving.has(`${candidate.skill.id}:${candidate.targetUid ?? ''}`);
      candidate.score -= Math.min(3, actor.defensiveStreak ?? 0) * (rescue ? 6 : 18);
    }
    if (b.round >= 13 && candidate.kind === 'attack') candidate.score += b.round >= 15 ? 16 : 8;
  }
  // 同一技能/目标仅保留最高评分，避免多个评分入口重复增加抽中权重。
  const unique = new Map<string, typeof candidates[number]>();
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.skill?.id ?? ''}:${candidate.targetUid ?? ''}`;
    if (!unique.has(key) || unique.get(key)!.score < candidate.score) unique.set(key, candidate);
  }
  candidates.splice(0, candidates.length, ...unique.values());
  // ─── 6. softmax 选择 ───
  // 兜底：有可用技能但未产生候选（如封印后只剩治疗/buff且不满足使用条件）时，
  // 从剩余技能中挑一个执行（优先攻击/状态/增益，治疗垫底），避免 AI 瘫痪无行动
  if (candidates.length === 0 && skills.length > 0) {
    const priority: Record<string, number> = { attack: 0, status: 1, buff: 2, heal: 3 };
    const fallback = [...skills].sort((a, b) => (priority[a.kind] ?? 9) - (priority[b.kind] ?? 9))[0];
    return { kind: fallback.kind, skillId: fallback.id, targetUid: undefined };
  }
  if (candidates.length === 0) return undefined;
  const maxScore = Math.max(...candidates.map((c) => c.score));
  const weights = candidates.map((c) => Math.exp((c.score - maxScore) / SOFTMAX_TEMP));
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = rngVal2 * total;
  let chosen = candidates[candidates.length - 1];
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) { chosen = candidates[i]; break; }
  }
  const fallbackAtk = attackSkills.length > 0 ? attackSkills[0] : undefined;
  if (chosen.kind === 'swap') {
    return { kind: 'swap', fallbackSkillId: fallbackAtk?.id };
  }
  let targetUid = chosen.targetUid;
  if (chosen.kind === 'attack' && chosen.skill?.target === 'single') {
    const skill = chosen.skill;
    let pool = skill.id === 'flame_tracing_feather'
      ? targetPool.filter(unit => flameTracingTargets(b, actor).some(target => target.uid === unit.uid)) : targetPool;
    if (actorPassive?.kind !== 'bloodScent' && skill.reach !== 'direct' && skill.id !== 'flame_tracing_feather') {
      const preferred = pool.filter(unit => unit.row === (skill.reach === 'back' ? 'back' : 'front'));
      if (preferred.length) pool = preferred;
    }
    // 技能评分决定攻防；选目标只保留温和偏好，避免可斩杀分数锁死目标。
    const targetWeights = pool.map(target => {
      let weight = 1 + (target.hp / target.maxHp < .3 ? .15 : 0)
        + (estimateAiDamage(b, actor, skill, target) >= target.hp ? .35 : 0);
      if ((hasVenomPower && target.statuses.some(s => s.kind === 'poison'))
        || (hasScorchPlus && isBurning(target)) || (actorPassive?.kind === 'shadowHunter' && target.hp / target.maxHp < .5)) weight += .2;
      const assigned = b.enemyUnits.filter(unit => {
        const order = b.orders?.[unit.uid];
        return unit.uid !== actor.uid && order?.targetUid === target.uid && order.skillId !== REST_SKILL_ID && getSkill(order.skillId).kind === 'attack';
      }).length;
      return weight / (1 + assigned * .75);
    });
    let targetRoll = rngVal1 * targetWeights.reduce((sum, weight) => sum + weight, 0);
    for (let i = 0; i < pool.length; i++) {
      targetRoll -= targetWeights[i];
      if (targetRoll <= 0 || i === pool.length - 1) { targetUid = pool[i].uid; break; }
    }
  }
  return { kind: chosen.kind, skillId: chosen.skill?.id, targetUid, fallbackSkillId: fallbackAtk?.id };
}

function enemyAct(b: BattleState, actor: Unit): BattleState {
  if (b.testEnemyInactive) return markActed(b, actor.uid);
  const nb = b;
  if (actor.statuses.some((s) => s.kind === 'stun')) {
    return markActed(pushLog(nb, `${actor.name} 被眩晕，无法行动`, sideOf(actor)), actor.uid);
  }
  return useRng(nb, (rngVal, b2) => {
    const skills = actor.skills.map(id => getBattleSkill(b, id)).filter((s) => canUnitUseSkill(actor, s.id, b));
    if (skills.length === 0) {
      return markActed(pushLog(b2, `${actor.name} 无技能可用，只能观望`, sideOf(actor)), actor.uid);
    }
    return useRng(b2, (rngVal2, b3) => {
      const decision = selectEnemyAction(b3, actor, rngVal, rngVal2);
      if (!decision) {
        return markActed(pushLog(b3, `${actor.name} 无技能可用，只能观望`, sideOf(actor)), actor.uid);
      }
      if (decision.kind === 'heal' && decision.skillId) {
        const allies = alliesOf(b3, actor);
        const target = decision.targetUid
          ? allies.find((u) => u.uid === decision.targetUid)
          : allies.sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
        return useSkillInner(b3, actor, getSkill(decision.skillId), target?.uid);
      }
      if (decision.kind === 'buff' && decision.skillId) {
        return useSkillInner(b3, actor, getSkill(decision.skillId), decision.targetUid ?? actor.uid);
      }
      if (decision.kind === 'status' && decision.skillId) {
        return useSkillInner(b3, actor, getSkill(decision.skillId), decision.targetUid);
      }
      if (decision.kind === 'swap') {
        const swapped = tryEnemySwap(b3, actor);
        if (swapped) return swapped;
        if (decision.fallbackSkillId) {
          return useSkillInner(b3, actor, getSkill(decision.fallbackSkillId), undefined);
        }
        return markActed(pushLog(b3, `${actor.name} 无技能可用，只能观望`, sideOf(actor)), actor.uid);
      }
      if (decision.kind === 'attack' && decision.skillId) {
        return useSkillInner(b3, actor, getSkill(decision.skillId), decision.targetUid);
      }
      return markActed(pushLog(b3, `${actor.name} 无技能可用，只能观望`, sideOf(actor)), actor.uid);
    });
  });
}

function markActed(b: BattleState, uid: string): BattleState {
  const actor = actorFromId(b, uid);
  if (!actor) return b;
  return replaceUnit(b, { ...actor, acted: true });
}

/** 反伤/反击伤害：先扣护盾再扣血，返回更新后的攻击者 */
function applyCounterDmg(attacker: Unit, dmg: number, round: number): Unit {
  let rd = Math.max(0, dmg - (attacker.reactiveGuardRound === round ? 1 : 0));
  let a = { ...attacker };
  if (a.shield > 0) {
    const absorbed = Math.min(a.shield, rd);
    a = { ...a, shield: a.shield - absorbed };
    rd -= absorbed;
    if (a.shield <= 0) {
      a = { ...a, statuses: a.statuses.filter((s) => s.kind !== 'shield') };
    }
  }
  return { ...a, hp: Math.max(0, a.hp - rd) };
}

/** 岩壳碎片连锁自爆：对场上全体单位造成真实伤害（无视护盾），被炸死的小怪连锁触发；Boss 被波及时受击计数 +1（被动受击叠加） */
function applyRockShardDeath(b: BattleState, dead: Unit): BattleState {
  const passive = getUnitPassive(dead);
  if (!passive || passive.kind !== 'rockShard') return b;
  let nb = b;
  const queue: Unit[] = [dead];
  while (queue.length > 0) {
    const src = queue.shift()!;
    const dmg = getUnitPassive(src)?.value ?? 3;
    const victims = [...nb.playerUnits, ...nb.enemyUnits].filter((u) => u.hp > 0);
    let bossWasHit = false;
    const damagedUnits: Unit[] = [];
    for (const v of victims) {
      // 岩壳碎片自爆不会炸死巨像：波及 Boss 时保底 1 HP
      const isGolem = v.speciesId === 'boss_golem' && getUnitPassive(v)?.kind === 'rockShellBreak';
      const after = { ...v, hp: Math.max(isGolem ? 1 : 0, v.hp - dmg) };
      nb = replaceUnit(nb, after);
      damagedUnits.push(after);
      if (after.speciesId === 'boss_golem' && after.hp > 0 && getUnitPassive(after)?.kind === 'rockShellBreak') {
        bossWasHit = true;
      }
      if (after.hp <= 0 && after.uid !== src.uid && getUnitPassive(after)?.kind === 'rockShard') {
        queue.push(after);
      }
    }
    // 单条汇总日志，burstTargets 供动画一次性同时挂飘字（无抖动）
    nb = pushLog(nb, `${src.name} 的「岩壳碎片」爆裂，对全体敌人和友方造成 ${dmg} 点真实伤害！`, sideOf(src), src.uid, undefined, undefined, damagedUnits.map((u) => u.uid));
    if (bossWasHit) {
      const boss = nb.enemyUnits.find((u) => u.speciesId === 'boss_golem' && u.hp > 0);
      if (boss) {
        const bossP = getUnitPassive(boss);
        if (bossP?.kind === 'rockShellBreak') {
          const newCount = (boss.rockShellHits ?? 0) + 1;
          let updatedBoss: Unit = { ...boss, rockShellHits: newCount };
          nb = replaceUnit(nb, updatedBoss);
          if (newCount >= bossP.value) {
            updatedBoss = { ...updatedBoss, rockShellHits: 0 };
            nb = replaceUnit(nb, updatedBoss);
            const pus = nb.playerUnits.filter((u) => u.hp > 0);
            const shardBurstUids: string[] = [];
            for (const pu of pus) {
              let puDmg = 5;
              let pu2 = pu;
              if (pu2.shield > 0) {
                const absorbed = Math.min(pu2.shield, puDmg);
                pu2 = { ...pu2, shield: pu2.shield - absorbed };
                puDmg -= absorbed;
                if (pu2.shield <= 0) pu2 = { ...pu2, statuses: pu2.statuses.filter((s) => s.kind !== 'shield') };
              }
              pu2 = { ...pu2, hp: Math.max(0, pu2.hp - puDmg) };
              nb = replaceUnit(nb, pu2);
              shardBurstUids.push(pu2.uid);
            }
            const debuffKinds = ['burn', 'poison', 'atkDown', 'spdDown', 'taunt', 'stun', 'thorns'];
            const refreshed = actorFromId(nb, updatedBoss.uid);
            const clearedBurn = refreshed?.statuses.find(s => s.kind === 'burn')?.value ?? 0;
            if (refreshed) {
              updatedBoss = { ...refreshed, statuses: refreshed.statuses.filter((s) => !debuffKinds.includes(s.kind)) };
            }
            nb = replaceUnit(nb, updatedBoss);
            nb = pushLog(nb, `${updatedBoss.name} 的「岩壳崩解」触发！岩壳碎裂，对全体敌人造成5点伤害！`, sideOf(updatedBoss), updatedBoss.uid, undefined, undefined, shardBurstUids);
            nb = notifyBurnRemoved(nb, updatedBoss, clearedBurn);
          }
        }
      }
    }
  }
  return nb;
}

/** 毒孢囊死亡爆发：对全体敌人造成 4 点真实伤害 + 中毒 3 层 */
function applyToxicBurstDeath(b: BattleState, dead: Unit): BattleState {
  const hasBurst = dead.statuses.some((s) => s.kind === 'toxicBurstReady');
  if (!hasBurst) return b;
  let nb = { ...b };
  // 移除 toxicBurstReady 状态
  const cleaned = { ...dead, statuses: dead.statuses.filter((s) => s.kind !== 'toxicBurstReady') };
  nb = replaceUnit(nb, cleaned);
  const victims = (dead.isPlayer ? nb.enemyUnits : nb.playerUnits).filter((u) => u.hp > 0);
  const hitUids: string[] = [];
  for (const v of victims) {
    const after = { ...v, hp: Math.max(0, v.hp - 4) };
    const poisoned = applyStatusTo(after, { kind: 'poison', value: 3, turns: 3 }, nb.round);
    nb = replaceUnit(nb, poisoned);
    hitUids.push(poisoned.uid);
    nb = applyCorruptSpread(nb, poisoned.uid);
  }
  nb = pushLog(nb, `${dead.name} 的「毒性爆发」触发！对全体敌人造成 4 点伤害 + 中毒 3 层`, sideOf(dead), dead.uid, undefined, ['poison'], hitUids);
  return nb;
}

/** 余烬遗火：死亡时对全体敌人造成 3 点伤害 + 灼烧 3 层 */
function applyEmberDeath(b: BattleState, dead: Unit): BattleState {
  const passive = getUnitPassive(dead);
  if (passive?.kind !== 'emberDeath') return b;
  let nb = b;
  const victims = (dead.isPlayer ? nb.enemyUnits : nb.playerUnits).filter((u) => u.hp > 0);
  const hitUids: string[] = [];
  for (const v of victims) {
    let after = { ...v, hp: Math.max(0, v.hp - 3) };
    after = applyStatusTo(after, { kind: 'burn', value: 3, turns: 2 }, nb.round);
    nb = replaceUnit(nb, after);
    hitUids.push(after.uid);
  }
  nb = pushLog(nb, `${dead.name} 的「余烬遗火」触发！对全体敌人造成 3 点伤害 + 灼烧 3 层`, sideOf(dead), dead.uid, undefined, ['burn'], hitUids);
  return nb;
}

/** 腐化蔓延：当场上有苔藓领主存活时，任何单位被附加中毒后，随机对另一个敌方单位附加中毒2层 */
function applyCorruptSpread(b: BattleState, poisonedUid: string): BattleState {
  const moss = b.enemyUnits.find((u) => u.speciesId === 'boss_moss' && u.hp > 0);
  if (!moss) return b;
  const p = getUnitPassive(moss);
  if (p?.kind !== 'corruptSpread') return b;
  // 随机选一个我方存活单位（非刚中毒的单位优先）
  const candidates = b.playerUnits.filter((u) => u.hp > 0 && u.uid !== poisonedUid);
  const pool = candidates.length > 0 ? candidates : b.playerUnits.filter((u) => u.hp > 0);
  if (pool.length === 0) return b;
  let nb = b;
  const rngVal = Math.abs((nb.rngCount ?? 0)) % pool.length;
  nb = { ...nb, rngCount: (nb.rngCount ?? 0) + 1 };
  const target = pool[rngVal];
  const fresh = actorFromId(nb, target.uid) ?? target;
  const poisoned = applyStatusTo(fresh, { kind: 'poison', value: p.value, turns: 3 }, nb.round);
  nb = replaceUnit(nb, poisoned);
  nb = pushLog(nb, `${moss.name} 的「腐化蔓延」触发！${poisoned.name} 中毒 ${p.value} 层`, sideOf(moss), moss.uid, poisoned.uid);
  return nb;
}

/** 逐目标攻击结算：伤害计算 + 段数拆分 + 护盾/吸血/反伤/状态写回 */
type AttackReactions = Array<(battle: BattleState) => BattleState>;

/** 群体主效果全部写入后封存同一快照，后续反击/死亡效果另行记录。 */
function sealSkillGroup(b: BattleState, from: number): BattleState {
  if (b.log.length === from) return b;
  const snapshot = b.log[b.log.length - 1];
  return { ...b, log: b.log.map((entry, index) => index < from ? entry : {
    ...entry, simultaneousGroup: from, hp: snapshot.hp, statuses: snapshot.statuses, shields: snapshot.shields,
  }) };
}

function resolveAttack(
  b: BattleState,
  actor: Unit,
  target: Unit,
  skill: SkillDef,
  count: number,
  foxBurnBonus: number = 0,
  firstHitBurnBonus: number = 0,
  batch?: { reactions: AttackReactions; hit: number; last: boolean; shieldIgnore: Map<string, number> },
): { battle: BattleState; lastHitLog: number | undefined; passiveAdds: string[]; didPoison: boolean } {
  let nb = b;
  // 技能强化：伤害加成
  const enhanceLevel = getSkillEnhanceLevel(actor, actor.skills.indexOf(skill.id));
  const enhanceBonus = getSkillEnhanceBonus(skill.id, enhanceLevel);
  // 恐惧爆发：伤害 = 8 + 目标恐惧层数
  // 恐惧收割：伤害 = 目标恐惧层数×2
  let base: number;
  if (skill.id === 'fear_burst') {
    const fearStacks = getFearStacks(target);
    base = (skill.damage ?? 8) + fearStacks;
  } else if (skill.id === 'fear_harvest') {
    const fearStacks = getFearStacks(target);
    base = fearStacks * 2;
  } else {
    base = (skill.damage ?? 0) + getDamageBonus(actor, nb);
  }
  if (skill.id === 'wind_assault') base += Math.max(0, getEffectiveSpd(actor) - getEffectiveSpd(target));
  if (skill.id === 'thorn_retaliation' && actor.counterTriggeredRound === nb.round) base += 1;
  // 技能强化：伤害加成
  base += enhanceBonus.damageBonus;
  // 锁链火花：攻击锁链目标时伤害+2
  const ap0 = getUnitPassive(actor, nb);
  const chainSparkBonus = ap0?.kind === 'chainSpark' && target.statuses.some((s) => s.kind === 'chainLink') ? ap0.value : 0;
  // 灵魂回响：每5个灵魂额外+2伤害
  let soulEchoBonus = 0;
  if (skill.id === 'soul_echo' && actor.soul) {
    soulEchoBonus = Math.floor(actor.soul / 5) * 2;
  }
  let perHitDmg = base + soulEchoBonus + chainSparkBonus - getDamageGuard(target, nb);
  // 速度加成伤害
  if (skill.spdScaling && skill.spdScaling > 0) {
    perHitDmg += getEffectiveSpd(actor) * skill.spdScaling;
  }
  if (target.isPlayer && nb.corruptDebuff === 'dmg') {
    perHitDmg += 2;
  }
  // 恐惧：目标恐惧≥3层时受到伤害+1
  const targetFearStacks = getFearStacks(target);
  if (targetFearStacks >= 3) {
    perHitDmg += 1;
  }
  // 恐惧之王：对有恐惧效果的敌人伤害+2（ap0 已在上方声明）
  if (ap0?.kind === 'fearLord' && targetFearStacks > 0) {
    perHitDmg += 2;
  }
  const passiveAdds: string[] = [];
  const ap = getUnitPassive(actor);
  let didPoison = false;
  let tWithPassive = target;
  if (ap?.kind === 'venom' && (!batch || batch.hit === 0)) {
    tWithPassive = applyStatusTo(tWithPassive, { kind: 'poison', value: ap.value, turns: 2 }, nb.round);
    passiveAdds.push('poison');
    didPoison = true;
  }
  if (ap?.kind === 'scorch') {
    tWithPassive = applyStatusTo(tWithPassive, { kind: 'burn', value: ap.value, turns: 2 }, nb.round);
    passiveAdds.push('burn');
  }
  if (ap?.kind === 'venomPower' && tWithPassive.statuses.some((s) => s.kind === 'poison')) {
    perHitDmg += ap.value;
  }
  if (ap?.kind === 'speedBonus') {
    const spdDiff = Math.max(0, getEffectiveSpd(actor) - getEffectiveSpd(tWithPassive));
    perHitDmg += Math.min(ap.value, spdDiff);
  }
  if (ap?.kind === 'fasterDamage' && getEffectiveSpd(actor) > getEffectiveSpd(target)) perHitDmg += ap.value;
  if (skill.id === 'toxic_bite' && tWithPassive.statuses.some((s) => s.kind === 'poison')) {
    perHitDmg *= 2;
  }
  // 蟹钳重击：目标生命值高于80%时额外+2
  if (skill.id === 'claw_smash' && target.hp > target.maxHp * 0.8) {
    perHitDmg += 2;
  }
  if (ap?.kind === 'poisonBreak' && tWithPassive.statuses.some((s) => s.kind === 'poison')) {
    perHitDmg += ap.value;
    perHitDmg += Math.min(8, getDamageGuard(target, nb));
  }
  if (ap?.kind === 'scorchPlus') {
    if (!batch || batch.hit === 0) tWithPassive = applyStatusTo(tWithPassive, { kind: 'burn', value: ap.value, turns: 2 }, nb.round);
    passiveAdds.push('burn');
    const burnStacks = tWithPassive.statuses.filter((s) => s.kind === 'burn').reduce((sum, s) => sum + s.value, 0) - ap.value;
    if (burnStacks > 0) {
      perHitDmg += Math.min(3, burnStacks);
    }
  }
  // 灼血撕咬：目标已灼烧时额外 +2
  if (skill.id === 'blood_fang' && tWithPassive.statuses.some((s) => s.kind === 'burn')) {
    perHitDmg += 2;
  }
  if (skill.id === 'purifying_orb' && isBurning(target)) perHitDmg += 2;
  if (skill.id === 'solar_strike') perHitDmg += radianceLayers(actor) * 2;
  if (skill.id === 'flying_leaf' && getEffectiveSpd(actor) > getEffectiveSpd(target)) perHitDmg += 3;
  if (skill.id === 'sand_time_strike' && (actor.timeRewindRound === nb.round || getEffectiveSpd(target) <= getEffectiveSpd(actor))) perHitDmg += 2;
  if (skill.id === 'core_crystal_spike' && actor.shield > 0) perHitDmg += 3;
  // 暗影追猎：对生命值低于50%的目标伤害+3
  if (ap?.kind === 'shadowHunter' && target.hp / target.maxHp < 0.5) {
    perHitDmg += ap.value;
  }
  // 暗影印记：目标有 shadowMark 时，受到伤害 +value
  const shadowMark = tWithPassive.statuses.find((s) => s.kind === 'shadowMark');
  if (shadowMark) {
    perHitDmg += shadowMark.value;
  }
  // 原本带伤害的攻击每段至少造成 1 点，避免降攻与减伤叠加后出现 0/负伤害软锁。
  const isDamagingAttack = skill.kind === 'attack' && ((skill.damage ?? 0) > 0 || base > 0 || perHitDmg > 0);
  const chargedActor = actorFromId(nb, actor.uid)!;
  let firstHitBonus = 0;
  if (skill.kind === 'attack' && actor.isPlayer !== target.isPlayer && target.hp > 0
    && getUnitPassive(chargedActor, nb)?.kind === 'harmony' && chargedActor.harmonyCharged) {
    firstHitBonus += 2;
    nb = replaceUnit(nb, { ...chargedActor, harmonyCharged: undefined });
  }
  const firstHitDamage = perHitDmg + firstHitBonus;
  if (isDamagingAttack) perHitDmg = Math.max(1, perHitDmg);
  if (skill.id === 'wind_assault') perHitDmg = Math.max(0, perHitDmg);
  const finalDmg = perHitDmg * count;
  const segments = splitDamage(finalDmg, count);
  if (firstHitBonus > 0 && segments.length > 0) segments[0] = isDamagingAttack ? Math.max(1, firstHitDamage) : firstHitDamage;
  let t2 = tWithPassive;
  const skillEffectKinds: string[] = (skill.effects ?? [])
    .filter((e) => e.kind === 'burn' || e.kind === 'poison' || e.kind === 'atkDown' || e.kind === 'stun' || e.kind === 'thorns' || e.kind === 'shieldCounter' || e.kind === 'shadowMark' || e.kind === 'skillSeal' || e.kind === 'fear')
    .map((e) => e.kind);
  let lastHitLog: number | undefined;
  let shieldIgnoreLeft = batch?.shieldIgnore.get(target.uid)
    ?? ((ap?.kind === 'poisonBreak' && tWithPassive.statuses.some((s) => s.kind === 'poison')) ? 8 : 0);
  for (let i = 0; i < segments.length; i++) {
    let seg = segments[i];
    if (i > 0 && t2.reactiveGuardRound === nb.round && target.reactiveGuardRound !== nb.round) seg = Math.max(1, seg - 1);
    if (t2.hp <= 0) break;
    const beforeHitStatuses = i === 0 ? target.statuses : t2.statuses;
    let actualHpLoss = 0;
    let actualShieldLoss = 0;
    let shieldBroken = false;
    if (seg > 0) {
      const tgtPassive = getUnitPassive(t2);
      if ((tgtPassive?.kind === 'bigHitGuard' || tgtPassive?.kind === 'lifeSpring') && seg > tgtPassive.value) {
        seg = seg - 2;
      }
      if (tgtPassive?.kind === 'damageCap') {
        const roundDmg = nb.roundDmgMap ?? {};
        const prevDmg = roundDmg[t2.uid] ?? 0;
        const allowed = Math.max(0, tgtPassive.value - prevDmg);
        if (seg > allowed) {
          seg = allowed;
        }
        nb = { ...nb, roundDmgMap: { ...roundDmg, [t2.uid]: prevDmg + seg } };
      }
      let remainingDmg = seg;
      let effectiveShield = skill.id === 'shadow_claw' ? 0 : t2.shield;
      if (shieldIgnoreLeft > 0 && effectiveShield > 0) {
        const ignored = Math.min(shieldIgnoreLeft, effectiveShield);
        effectiveShield -= ignored;
        shieldIgnoreLeft -= ignored;
      }
      if (effectiveShield > 0) {
        const shieldAbsorb = Math.min(effectiveShield, remainingDmg);
        actualShieldLoss = shieldAbsorb;
        t2 = { ...t2, shield: t2.shield - shieldAbsorb };
        remainingDmg -= shieldAbsorb;
        if (t2.shield <= 0) {
          shieldBroken = true;
          t2 = { ...t2, statuses: t2.statuses.filter((s) => s.kind !== 'shield') };
        }
      }
      actualHpLoss = Math.min(t2.hp, remainingDmg);
      t2 = { ...t2, hp: Math.max(0, t2.hp - remainingDmg) };
      // 锁链传导：被锁链连接的单位受到伤害时，50%传导给伙伴（传导伤害不再触发连锁）
      const conductChain = (state: BattleState): BattleState => {
        let nb = state;
        if (remainingDmg > 0) {
          const chain = t2.statuses.find((s) => s.kind === 'chainLink');
          if (chain?.sourceUid) {
            const partner = actorFromId(nb, chain.sourceUid);
            if (partner && partner.hp > 0 && partner.uid !== t2.uid) {
              const chainGuard = getDamageGuard(partner, nb);
              const chainDmg = Math.max(1, Math.floor(remainingDmg * chain.value / 100) - chainGuard);
              let p2 = partner;
              if (p2.shield > 0) {
                const absorbed = Math.min(p2.shield, chainDmg);
                p2 = { ...p2, shield: p2.shield - absorbed };
                if (p2.shield <= 0) p2 = { ...p2, statuses: p2.statuses.filter((s) => s.kind !== 'shield') };
              }
              const actualDmg = chainDmg - Math.min(p2.shield, chainDmg);
              p2 = { ...p2, hp: Math.max(0, p2.hp - actualDmg) };
              nb = replaceUnit(nb, p2);
              nb = pushLog(nb, `🔗 锁链传导！${partner.name} 受到 ${chainDmg} 点伤害`, sideOf(partner), t2.uid, partner.uid);
            }
          }
        }
        return nb;
      };
      if (batch) batch.reactions.push(conductChain);
      else nb = conductChain(nb);
    }
    for (const e of skill.effects ?? []) {
      if (skill.id === 'weaken') {
        const rngKind = (nb.rngCount ?? 0) % 2 === 0 ? 'atkDown' : 'spdDown';
        const weakenValue = e.value + enhanceBonus.effectBonus;
        t2 = applyStatusTo(t2, { kind: rngKind, value: weakenValue, turns: e.turns }, nb.round);
        nb = { ...nb, rngCount: (nb.rngCount ?? 0) + 1 };
      } else if (e.kind === 'shield') {
        // 攻击附带的自身护盾在本段命中日志之后写入，避免伤害动画前提前显示。
        continue;
      } else if (e.kind === 'fear') {
        const fearValue = e.value + enhanceBonus.effectBonus;
        nb = applyFear(nb, t2, fearValue);
        t2 = actorFromId(nb, t2.uid) ?? t2;
      } else if (e.kind === 'burn' || e.kind === 'poison' || e.kind === 'atkDown' || e.kind === 'stun' || e.kind === 'taunt' || e.kind === 'spdDown' || e.kind === 'thorns' || e.kind === 'shadowMark') {
        // 眩晕/封印/嘲讽固定，不随强化变化；其余效果值叠加强化加成
        const effectValue = e.value + getSkillEffectEnhanceBonus(skill.id, enhanceLevel, e.kind) + (e.kind === 'burn' && actor.isPlayer !== t2.isPlayer ? foxBurnBonus : 0);
        t2 = applyStatusTo(t2, e.kind === 'taunt' ? { ...e, value: effectValue, sourceUid: actor.uid } : { ...e, value: effectValue }, nb.round);
        if (e.kind === 'poison') didPoison = true;
      } else if (e.kind === 'skillSeal') {
        // 技能封印：从目标技能中随机选 value 个封印，下一回合生效
        // （不限定攻击技能——泡泡将的治疗/增益等技能同样可被封印）
        const availableSkills = t2.skills.filter((s) => {
          const sd = getSkill(s);
          return !!sd;
        });
        const sealCount = Math.min(e.value, availableSkills.length);
        if (sealCount > 0) {
          // 可播种随机洗牌选技能（Fisher-Yates），保证每次封印选择的技能不同
          const rng = createRng((nb.seed + (nb.rngCount ?? 0) * 7919) >>> 0);
          nb = { ...nb, rngCount: (nb.rngCount ?? 0) + 1 };
          const sealed = shuffle(rng, availableSkills).slice(0, sealCount);
          // 应用 skillSealPending：turns+1，转换时减1
          t2 = applyStatusTo(t2, { kind: 'skillSealPending', value: sealCount, turns: e.turns + 1, sealedSkills: sealed }, nb.round);
          // 记录封印的技能名
          const sealedNames = sealed.map((s) => getSkill(s)?.name ?? s).join('、');
          nb = pushLog(nb, `${t2.name} 的「${sealedNames}」将在下回合被封印 ${e.turns} 回合`, sideOf(t2), actor.uid, t2.uid, ['skillSeal']);
        }
      }
    }
    if (ap?.kind === 'scorch' && i > 0) {
      t2 = applyStatusTo(t2, { kind: 'burn', value: ap.value, turns: 2 }, nb.round);
    }
    const seededActor = actorFromId(nb, actor.uid)!;
    if (i === 0 && firstHitBurnBonus > 0) t2 = applyStatusTo(t2, { kind: 'burn', value: firstHitBurnBonus, turns: 2 }, nb.round);
    const seeded = skill.kind === 'attack' && actor.isPlayer !== target.isPlayer && seededActor.statuses.some(s => s.kind === 'emberSeed');
    if (seeded) {
      t2 = applyStatusTo(t2, { kind: 'burn', value: 2, turns: 2 }, nb.round);
      nb = replaceUnit(nb, { ...seededActor, statuses: seededActor.statuses.filter(s => s.kind !== 'emberSeed') });
    }
    nb = replaceUnit(nb, t2);
    t2 = actorFromId(nb, t2.uid)!;
    const extraBurn = seeded || (i === 0 && firstHitBurnBonus > 0);
    const hitAdds = skillEffectKinds.length || extraBurn ? [...skillEffectKinds, ...(extraBurn ? ['burn'] : [])] : undefined;
    const hitLogIndex = nb.log.length;
    if (seg === 0 && skill.effects && skill.effects.length > 0 && skill.target === 'all' && !batch) {
      // 零伤全体 debuff：由 useSkillInner 统一推送合并日志，此处跳过
    } else if (seg === 0 && skill.effects && skill.effects.length > 0) {
      const effectDesc = skill.effects.map((e) => {
        const val = e.value + getSkillEffectEnhanceBonus(skill.id, enhanceLevel, e.kind);
        if (e.kind === 'poison') return `中毒 ${val} 层`;
        if (e.kind === 'burn') return `灼烧 ${val} 层`;
        if (e.kind === 'atkDown') return `降低攻击 ${val} 层`;
        if (e.kind === 'spdDown') return `降低速度 ${val} 层`;
        if (e.kind === 'stun') return '眩晕';
        if (e.kind === 'fear') return `恐惧 ${val} 层`;
        return e.kind;
      }).join('，');
      const msg0 = `${actor.name} 使用「${skill.name}」，${target.name} ${effectDesc}`;
      nb = pushLog(nb, msg0, sideOf(actor), actor.uid, target.uid, hitAdds, undefined,
        spans(msg0, [['actor', actor.name], ['skill', skill.name], ['target', target.name]]));
    } else {
      const debuffNotes = attackDebuffNotes(beforeHitStatuses, t2.statuses);
      const msg1 = `${actor.name} 使用「${skill.name}」攻击 ${target.name}，造成 ${seg} 伤害${debuffNotes.length ? `；${debuffNotes.join('，')}` : ''}`;
      nb = pushLog(nb, msg1, sideOf(actor), actor.uid, target.uid, hitAdds, undefined,
        spans(msg1, [['actor', actor.name], ['skill', skill.name], ['target', target.name], ['damage', String(seg)], ...debuffNotes.map(note => ['status', note] as [LogSpan['kind'], string])]),
        { hpLoss: actualHpLoss, healing: 0, shieldLoss: actualShieldLoss, shieldBroken, addedStatuses: addedStatusValues(beforeHitStatuses, t2.statuses) });
    }
    lastHitLog = nb.log.length > hitLogIndex ? hitLogIndex : undefined;
    for (const effect of skill.effects ?? []) {
      if (effect.kind !== 'shield') continue;
      const shielded = actorFromId(nb, actor.uid);
      if (!shielded || shielded.hp <= 0) continue;
      const shieldValue = effect.value + enhanceBonus.effectBonus;
      const newShield = { ...shielded, shield: Math.min(99, shielded.shield + shieldValue) };
      nb = replaceUnit(nb, newShield);
      nb = pushLog(nb, `${shielded.name} 获得 ${newShield.shield - shielded.shield} 点护盾`, sideOf(shielded), actor.uid, actor.uid,
        undefined, undefined, undefined, { shieldGain: newShield.shield - shielded.shield });
    }
    t2 = actorFromId(nb, t2.uid)!;
    if (skill.kind === 'attack' && actor.isPlayer !== t2.isPlayer && t2.hp > 0
      && getUnitPassive(t2, nb)?.kind === 'reactiveGuard' && t2.reactiveGuardRound !== nb.round) {
      const gain = Math.min(3, 99 - t2.shield);
      t2 = { ...t2, shield: t2.shield + gain, reactiveGuardRound: nb.round };
      nb = replaceUnit(nb, t2);
      nb = pushLog(nb, `${t2.name} 的「磐岩之力」获得 ${gain} 点护盾，本回合后续伤害-1`, sideOf(t2), t2.uid, t2.uid);
    }
    t2 = actorFromId(nb, t2.uid)!;
    const reactToHit = (state: BattleState): BattleState => {
      let nb = state;
      let t2 = actorFromId(nb, target.uid)!;
      // 命中即换盾，先于本次命中引发的即时反击。
      if (skill.id === 'heated_shell_bump' && i === 0) {
        const current = actorFromId(nb, actor.uid);
        if (current && isBurning(current)) {
          const amount = Math.min(2 + enhanceBonus.effectBonus, 99 - current.shield);
          nb = replaceUnit(nb, { ...consumeBurn(current, 1), shield: current.shield + amount });
          nb = pushLog(nb, `${actor.name} 的「热壳顶撞」获得 ${amount} 点护盾`, sideOf(actor), actor.uid, actor.uid);
          nb = notifyBurnRemoved(nb, current, 1);
        }
      }
      const drainActor = actorFromId(nb, actor.uid);
      const bloodDrain = drainActor?.statuses.find(s => s.kind === 'bloodDrain')?.value ?? 0;
      if (bloodDrain > 0 && (actualHpLoss > 0 || actualShieldLoss > 0) && drainActor && drainActor.hp > 0) {
        const amount = Math.min(bloodDrain, actualHpLoss + actualShieldLoss, getEffectiveMaxHp(drainActor) - drainActor.hp);
        nb = replaceUnit(nb, { ...drainActor, hp: drainActor.hp + amount });
        if (amount > 0) nb = pushLog(nb, `${drainActor.name} 的「嗜血」恢复 ${amount} 点生命`, sideOf(drainActor), drainActor.uid, drainActor.uid);
      }
      if (ap?.kind === 'drain') {
        const healedActor = actorFromId(nb, actor.uid);
        if (healedActor && healedActor.hp > 0) {
          const maxHp = getEffectiveMaxHp(healedActor);
          const healed = { ...healedActor, hp: Math.min(maxHp, healedActor.hp + ap.value) };
          nb = replaceUnit(nb, healed);
          const msgDrain = `${healedActor.name} 的「${ap.name}」恢复 ${ap.value} 点生命`;
          nb = pushLog(nb, msgDrain, sideOf(healedActor), healedActor.uid, healedActor.uid, undefined, undefined,
            spans(msgDrain, [['actor', healedActor.name], ['passive', ap.name], ['heal', String(ap.value)]]));
        }
      }
      // 灵魂汲取：攻击命中时，攻击者灵魂 +1（上限 20）
      if (t2.hp <= 0 || seg > 0) {
        const freshActor = actorFromId(nb, actor.uid);
        if (freshActor && freshActor.hp > 0) {
          const fp = getUnitPassive(freshActor);
          if (fp?.kind === 'soulSiphon') {
            const curSoul = freshActor.soul ?? 0;
            if (curSoul < 20) {
              const newSoul = curSoul + 1;
              nb = replaceUnit(nb, { ...freshActor, soul: newSoul });
              // 阶梯触发日志
              if (newSoul === 5) { const m = `${freshActor.name} 的「灵魂汲取」达到 5 灵魂！伤害 +2`; nb = pushLog(nb, m, sideOf(freshActor), freshActor.uid, freshActor.uid, undefined, undefined, spans(m, [['actor', freshActor.name], ['passive', '灵魂汲取']])); }
              else if (newSoul === 10) { const m = `${freshActor.name} 的「灵魂汲取」达到 10 灵魂！每回合恢复 3 HP`; nb = pushLog(nb, m, sideOf(freshActor), freshActor.uid, freshActor.uid, undefined, undefined, spans(m, [['actor', freshActor.name], ['passive', '灵魂汲取']])); }
              else if (newSoul === 20) { const m = `${freshActor.name} 的「灵魂汲取」达到 20 灵魂！伤害 +3（共 +5）`; nb = pushLog(nb, m, sideOf(freshActor), freshActor.uid, freshActor.uid, undefined, undefined, spans(m, [['actor', freshActor.name], ['passive', '灵魂汲取']])); }
            }
          }
        }
      }
      // 成长值被动：主动攻击命中 +2 成长值（成长值消耗与命中加成互相独立，各自生效）
      if (t2.hp <= 0 || seg > 0) {
        const freshActor2 = actorFromId(nb, actor.uid);
        if (freshActor2 && freshActor2.hp > 0) {
          const gp = getUnitPassive(freshActor2);
          if (gp?.kind === 'growthValue') {
            const curGV = freshActor2.growthValue ?? 0;
            nb = replaceUnit(nb, { ...freshActor2, growthValue: curGV + 2 });
          }
        }
      }
      // 荆棘缠绕：攻击时概率使目标伤害 -1（古树之主在场时概率更高）
      if (ap?.kind === 'thornEntangle' && t2.hp > 0) {
        const bossAlive = nb.enemyUnits.some((u) => u.speciesId === 'boss_vine' && u.hp > 0);
        const chance = bossAlive ? 60 : 40;
        const roll = Math.abs((nb.rngCount ?? 0)) % 100;
        nb = { ...nb, rngCount: (nb.rngCount ?? 0) + 1 };
        if (roll < chance) {
          t2 = applyStatusTo(t2, { kind: 'atkDown', value: ap.value, turns: 2 }, nb.round);
          nb = replaceUnit(nb, t2);
          const msgEnt = `${actor.name} 的「${ap.name}」使 ${t2.name} 伤害 -1`;
          nb = pushLog(nb, msgEnt, sideOf(actor), actor.uid, t2.uid, ['atkDown'], undefined,
            spans(msgEnt, [['actor', actor.name], ['passive', ap.name], ['target', t2.name], ['status', '伤害 -1']]));
        }
      }
      // 恐惧支配/恐惧之王：攻击命中附加恐惧1层
      if ((ap?.kind === 'fearOnHit' || ap?.kind === 'fearLord') && t2.hp > 0) {
        nb = applyFear(nb, t2, 1);
        t2 = actorFromId(nb, t2.uid) ?? t2;
        const freshT2 = t2;
        const fearStacks = getFearStacks(freshT2);
        const passiveName = ap?.kind === 'fearLord' ? '恐惧之王' : '恐惧支配';
        const msgFH = `${actor.name} 的「${passiveName}」使 ${freshT2.name} 恐惧 +1（共 ${fearStacks} 层）`;
        nb = pushLog(nb, msgFH, sideOf(actor), actor.uid, freshT2.uid, undefined, undefined,
          spans(msgFH, [['actor', actor.name], ['passive', passiveName], ['target', freshT2.name], ['status', `恐惧 ${fearStacks} 层`]]));
      }
      // 烈焰环绕：被攻击时 30% 概率使攻击者灼烧 1 层，熔火领主在场时 100%
      if (t2.hp > 0) {
        const tp = getUnitPassive(t2);
        if (tp?.kind === 'flameAura') {
          const attacker = actorFromId(nb, actor.uid);
          if (attacker && attacker.hp > 0) {
            const hasBossFire = alliesOf(nb, t2).some((a) => a.speciesId === 'boss_fire');
            if (hasBossFire || Math.abs((nb.rngCount ?? 0)) % 100 < 30) {
              nb = { ...nb, rngCount: (nb.rngCount ?? 0) + 1 };
              const burned = applyStatusTo(attacker, { kind: 'burn', value: tp.value, turns: 2 }, nb.round);
              nb = replaceUnit(nb, burned);
              const msgFA = `${t2.name} 的「烈焰环绕」触发！${burned.name} 被灼烧 ${tp.value} 层`;
              const burnDesc = `灼烧 ${tp.value} 层`;
              nb = pushLog(nb, msgFA, sideOf(t2), t2.uid, attacker.uid, ['burn'], undefined,
                spans(msgFA, [['passive', '烈焰环绕'], ['target', burned.name], ['status', burnDesc]]));
            } else {
              nb = { ...nb, rngCount: (nb.rngCount ?? 0) + 1 };
            }
          }
        }
      }
        if (t2.hp > 0) {
          const tp = getUnitPassive(t2);
          if (tp?.kind === 'thorns') {
            const attacker = actorFromId(nb, actor.uid);
            if (attacker && attacker.hp > 0) {
              const hurt = applyCounterDmg(attacker, tp.value, nb.round);
              nb = replaceUnit(nb, hurt);
              t2 = { ...t2, counterTriggeredRound: nb.round };
              nb = replaceUnit(nb, t2);
              const msgTh = `${t2.name} 的「${tp.name}」反伤 ${attacker.name} ${tp.value} 点`;
              nb = pushLog(nb, msgTh, sideOf(t2), t2.uid, attacker.uid, undefined, undefined,
                spans(msgTh, [['passive', tp.name], ['target', attacker.name], ['damage', String(tp.value)]]));
            }
          }
          if (tp?.kind === 'thornRoyal') {
            const attacker = actorFromId(nb, actor.uid);
            if (attacker && attacker.hp > 0) {
              const rageThornStacks = t2.statuses.filter((s) => s.kind === 'rageThorn').reduce((sum, s) => sum + s.value, 0);
              const baseDmg = tp.value + rageThornStacks;
              t2 = { ...t2, thornsHitCount: (t2.thornsHitCount ?? 0) + 1, counterTriggeredRound: nb.round };
              const hitCount = t2.thornsHitCount!;
              const isBurst = hitCount % 3 === 0;
              const thornDmg = isBurst ? 5 + rageThornStacks : baseDmg;
              const newAttacker = applyCounterDmg(attacker, thornDmg, nb.round);
              nb = replaceUnit(nb, newAttacker);
              nb = replaceUnit(nb, t2);
              const msgTR = `${t2.name} 的「荆棘之躯」反伤 ${attacker.name} ${thornDmg} 点`;
              nb = pushLog(nb, msgTR, sideOf(t2), t2.uid, attacker.uid, undefined, undefined,
                spans(msgTR, [['passive', '荆棘之躯'], ['target', attacker.name], ['damage', String(thornDmg)]]));
              if (isBurst) {
                const freshT2 = actorFromId(nb, t2.uid) ?? t2;
                t2 = { ...freshT2, hp: Math.min(getEffectiveMaxHp(freshT2), freshT2.hp + 2) };
                nb = replaceUnit(nb, t2);
                const msgTRh = `${t2.name} 的「荆棘之躯」恢复 2 点生命`;
                nb = pushLog(nb, msgTRh, sideOf(t2), t2.uid, t2.uid, undefined, undefined,
                  spans(msgTRh, [['passive', '荆棘之躯'], ['heal', '2']]));
              }
            }
          }
          // 熔岩护体：受到攻击时灼烧攻击者 1 层
          if (tp?.id === 'molten_armor' && t2.hp > 0) {
            const attacker = actorFromId(nb, actor.uid);
            if (attacker && attacker.hp > 0) {
              let burned = applyStatusTo(attacker, { kind: 'burn', value: 1, turns: 2 }, nb.round);
              nb = replaceUnit(nb, burned);
              const msgMA = `${t2.name} 的「熔岩护体」触发！${burned.name} 被灼烧 1 层`;
              nb = pushLog(nb, msgMA, sideOf(t2), t2.uid, attacker.uid, ['burn'], undefined,
                spans(msgMA, [['passive', '熔岩护体'], ['target', burned.name], ['status', '灼烧 1 层']]));
            }
          }
          // 岩壳崩解：每受到4次攻击，对全体敌人造成5点伤害并清除自身所有减益
          if (tp?.kind === 'rockShellBreak' && t2.hp > 0) {
            t2 = { ...t2, rockShellHits: (t2.rockShellHits ?? 0) + 1 };
            nb = replaceUnit(nb, t2);
            if (t2.rockShellHits! >= tp.value) {
              t2 = { ...t2, rockShellHits: 0 };
              nb = replaceUnit(nb, t2);
              // 对全体敌人（玩家单位）造成5点伤害
              const playerUnits = nb.playerUnits.filter((u) => u.hp > 0);
              const resolveShardBurstUids: string[] = [];
              for (const pu of playerUnits) {
                let puDmg = 5;
                let pu2 = pu;
                if (pu2.shield > 0) {
                  const absorbed = Math.min(pu2.shield, puDmg);
                  pu2 = { ...pu2, shield: pu2.shield - absorbed };
                  puDmg -= absorbed;
                  if (pu2.shield <= 0) pu2 = { ...pu2, statuses: pu2.statuses.filter((s) => s.kind !== 'shield') };
                }
                pu2 = { ...pu2, hp: Math.max(0, pu2.hp - puDmg) };
                nb = replaceUnit(nb, pu2);
                resolveShardBurstUids.push(pu2.uid);
              }
              // 清除自身所有减益状态
              const debuffKinds = ['burn', 'poison', 'atkDown', 'spdDown', 'taunt', 'stun', 'thorns'];
              const clearedBurn = (actorFromId(nb, t2.uid) ?? t2).statuses.find(s => s.kind === 'burn')?.value ?? 0;
              t2 = { ...(actorFromId(nb, t2.uid) ?? t2), statuses: (actorFromId(nb, t2.uid) ?? t2).statuses.filter((s) => !debuffKinds.includes(s.kind)) };
              nb = replaceUnit(nb, t2);
              nb = notifyBurnRemoved(nb, t2, clearedBurn);
              nb = pushLog(nb, `${t2.name} 的「岩壳崩解」触发！岩壳碎裂，对全体敌人造成5点伤害！`, sideOf(t2), t2.uid, undefined, undefined, resolveShardBurstUids);
            }
          }
          // 受击加速/古木加速：受到攻击后速度 +1（可叠加，上限按被动类型区分）
          if ((tp?.kind === 'spdOnHit' || tp?.kind === 'treeSpeedUp') && t2.hp > 0) {
          const stacks = t2.passiveSpdStacks ?? 0;
          const cap = tp.kind === 'treeSpeedUp' ? 8 : 6;
          if (stacks < cap) {
            t2 = { ...t2, spd: t2.spd + 1, passiveSpdStacks: stacks + 1 };
            nb = replaceUnit(nb, t2);
            const msgSpd = `${t2.name} 的「${tp.name}」速度 +1`;
            nb = pushLog(nb, msgSpd, sideOf(t2), t2.uid, t2.uid, undefined, undefined,
              spans(msgSpd, [['passive', tp.name]]));
          }
        }
        if (t2.hp > 0 && t2.statuses.some((s) => s.kind === 'thornSpikes')) {
          t2 = applyStatusTo(t2, { kind: 'rageThorn', value: 1, turns: 2 }, nb.round);
          nb = replaceUnit(nb, t2);
          const msgRT = `${t2.name} 的「复仇棘甲」蓄力，攻击 +1`;
          nb = pushLog(nb, msgRT, sideOf(t2), t2.uid, t2.uid, ['rageThorn'], undefined,
            spans(msgRT, [['passive', '复仇棘甲']]));
        }
        // 腐化囊体：被攻击时50%概率使攻击者中毒2层
        if (t2.hp > 0) {
          const tp2 = getUnitPassive(t2);
          if (tp2?.kind === 'corruptSac') {
            const roll = Math.abs((nb.rngCount ?? 0)) % 100;
            nb = { ...nb, rngCount: (nb.rngCount ?? 0) + 1 };
            if (roll < 50) {
              const attacker2 = actorFromId(nb, actor.uid);
              if (attacker2 && attacker2.hp > 0) {
                const poisoned = applyStatusTo(attacker2, { kind: 'poison', value: tp2.value, turns: 2 }, nb.round);
                nb = replaceUnit(nb, poisoned);
                const msgCS = `${t2.name} 的「腐化囊体」使 ${attacker2.name} 中毒 ${tp2.value} 层`;
                nb = pushLog(nb, msgCS, sideOf(t2), t2.uid, attacker2.uid, undefined, undefined,
                  spans(msgCS, [['passive', '腐化囊体'], ['target', attacker2.name], ['status', `中毒 ${tp2.value} 层`]]));
                didPoison = true;
                if (batch) nb = applyCorruptSpread(nb, t2.uid);
              }
            }
          }
        }
        // 粘滞躯体：攻击蛞蝓的单位速度-1，持续2回合
        if (t2.hp > 0) {
          const tp2 = getUnitPassive(t2);
          if (tp2?.kind === 'stickyBody') {
            const attacker3 = actorFromId(nb, actor.uid);
            if (attacker3 && attacker3.hp > 0) {
              const slowed = applyStatusTo(attacker3, { kind: 'spdDown', value: tp2.value, turns: 2 }, nb.round);
              nb = replaceUnit(nb, slowed);
              const msgSB = `${t2.name} 的「粘滞躯体」使 ${attacker3.name} 速度 -${tp2.value}`;
              nb = pushLog(nb, msgSB, sideOf(t2), t2.uid, attacker3.uid, undefined, undefined,
                spans(msgSB, [['passive', '粘滞躯体'], ['target', attacker3.name], ['status', `速度 -${tp2.value}`]]));
            }
          }
        }
        // 恐惧传递：被攻击时50%概率给攻击者恐惧1层
        if (t2.hp > 0) {
          const tp2 = getUnitPassive(t2);
          if (tp2?.kind === 'fearOnBeingHit') {
            const roll = Math.abs((nb.rngCount ?? 0)) % 100;
            nb = { ...nb, rngCount: (nb.rngCount ?? 0) + 1 };
            if (roll < 50) {
              const attackerFear = actorFromId(nb, actor.uid);
              if (attackerFear && attackerFear.hp > 0) {
                nb = applyFear(nb, attackerFear, 1);
                const msgFB = `${t2.name} 的「恐惧传递」使 ${attackerFear.name} 恐惧 +1`;
                nb = pushLog(nb, msgFB, sideOf(t2), t2.uid, attackerFear.uid, undefined, undefined,
                  spans(msgFB, [['passive', '恐惧传递'], ['target', attackerFear.name], ['status', '恐惧']]));
              }
            }
          }
        }
      }
      if (t2.hp > 0) {
        const scIdx = t2.statuses.findIndex((s) => s.kind === 'shieldCounter');
        if (scIdx >= 0) {
          const scVal = t2.statuses[scIdx].value;
          const attacker = actorFromId(nb, actor.uid);
          if (attacker && attacker.hp > 0) {
            const hurt = applyCounterDmg(attacker, scVal, nb.round);
            t2 = { ...t2, counterTriggeredRound: nb.round };
            const debuffed = applyStatusTo(hurt, { kind: 'atkDown', value: 2, turns: 2 }, nb.round);
            nb = replaceUnit(nb, debuffed);
            const msgSC = `${t2.name} 的「盾反」反击 ${attacker.name} ${scVal} 点并降低目标攻击2层`;
            nb = pushLog(nb, msgSC, sideOf(t2), t2.uid, attacker.uid, ['atkDown'], undefined,
              spans(msgSC, [['passive', '盾反'], ['target', attacker.name], ['damage', String(scVal)]]));
          }
          t2 = { ...t2, shield: 0, statuses: t2.statuses.filter((s) => s.kind !== 'shield' && s.kind !== 'shieldCounter') };
          nb = replaceUnit(nb, t2);
        }
      }
      if (t2.hp > 0) {
        const fsIdx = t2.statuses.findIndex((s) => s.kind === 'flameShield');
        if (fsIdx >= 0) {
          const fsVal = t2.statuses[fsIdx].value;
          const attacker = actorFromId(nb, actor.uid);
          if (attacker && attacker.hp > 0) {
            const burned = applyStatusTo(attacker, { kind: 'burn', value: fsVal, turns: 2 }, nb.round);
            nb = replaceUnit(nb, burned);
            const msgFS = `${t2.name} 的「烈焰护盾」灼烧 ${attacker.name} ${fsVal} 层`;
            const burnFS = `灼烧 ${fsVal} 层`;
            nb = pushLog(nb, msgFS, sideOf(t2), t2.uid, attacker.uid, undefined, undefined,
              spans(msgFS, [['passive', '烈焰护盾'], ['target', attacker.name], ['status', burnFS]]));
          }
        }
      }
      return nb;
    };
    if (batch) batch.reactions.push(reactToHit);
    else { nb = reactToHit(nb); t2 = actorFromId(nb, target.uid)!; }
  }
  if (batch) batch.shieldIgnore.set(target.uid, shieldIgnoreLeft);
  if (passiveAdds.length > 0 && lastHitLog !== undefined) {
    nb = { ...nb, log: nb.log.map((l, idx) => (idx === lastHitLog ? { ...l, addsStatus: [...(l.addsStatus ?? []), ...passiveAdds] } : l)) };
  }
  nb = replaceUnit(nb, t2);
  const defeatedByHit = t2.hp <= 0;
  const finishHit = (state: BattleState): BattleState => {
    let nb = state;
    let t2 = actorFromId(nb, target.uid)!;
    // 炉火按一次攻击技能命中结算，不随连击段数重复触发；致死命中、反伤和持续伤害不触发。
    const furnace = getUnitPassive(t2, nb);
    const attacker = actorFromId(nb, actor.uid);
    if (skill.kind === 'attack' && t2.isPlayer !== actor.isPlayer && t2.hp > 0
      && (!batch || batch.last) && furnace?.kind === 'furnace' && (t2.furnaceTriggers ?? 0) < 2 && attacker && attacker.hp > 0) {
      t2 = { ...t2, furnaceTriggers: (t2.furnaceTriggers ?? 0) + 1 };
      const shieldGain = Math.min(furnace.shieldOnTrigger ?? 0, 99 - t2.shield);
      if (shieldGain > 0) t2 = { ...t2, shield: t2.shield + shieldGain };
      nb = replaceUnit(nb, t2);
      nb = replaceUnit(nb, applyStatusTo(attacker, { kind: 'burn', value: furnace.value, turns: 2 }, nb.round));
      const msg = `${t2.name} 的「${furnace.name}」使 ${attacker.name} 灼烧 ${furnace.value} 层`;
      nb = pushLog(nb, msg, sideOf(t2), t2.uid, attacker.uid, ['burn'], undefined,
        spans(msg, [['actor', t2.name], ['passive', furnace.name], ['target', attacker.name], ['status', `灼烧 ${furnace.value} 层`]]));
      if (shieldGain > 0) nb = pushLog(nb, `${t2.name} 的「${furnace.name}」获得 ${shieldGain} 点护盾`, sideOf(t2), t2.uid, t2.uid);
    }
    const defended = actorFromId(nb, t2.uid)!;
    if (skill.kind === 'attack' && lastHitLog !== undefined && defended.hp > 0 && defended.isPlayer !== actor.isPlayer
      && defended.statuses.some(s => s.kind === 'foxTailGuard' && s.appliedRound === nb.round)) {
      t2 = addFoxFire({ ...defended, statuses: defended.statuses.filter(s => s.kind !== 'foxTailGuard') }, 1);
      nb = replaceUnit(nb, t2);
      nb = pushLog(nb, `${t2.name} 的「焰尾护盾」获得 ${foxFireLayers(t2) - foxFireLayers(defended)} 层狐火（当前 ${foxFireLayers(t2)}）`, sideOf(t2), t2.uid, t2.uid, ['foxFire']);
    }
    if (!batch || defeatedByHit) nb = applyDefeatedTarget(nb, t2);
    if (skill.kind === 'attack' && actor.isPlayer !== target.isPlayer && isBurning(target) && lastHitLog !== undefined) {
      nb = applyAfterglow(nb, actor);
      nb = applyEternalLight(nb, actor);
    }
    return nb;
  };
  if (batch) batch.reactions.push(finishHit);
  else nb = finishHit(nb);
  return { battle: nb, lastHitLog, passiveAdds, didPoison };
}

/** 攻击或烙印引爆击倒目标时，共用原有死亡效果。 */
function applyDefeatedTarget(b: BattleState, t2: Unit): BattleState {
  if ((actorFromId(b, t2.uid)?.hp ?? 0) > 0) return b;
  let nb = b;
  // 小怪死亡日志
  if (t2.hp <= 0 && t2.speciesId.startsWith('boss_minion_')) {
    const msgDead = `${t2.name} 被击倒了`;
    nb = pushLog(nb, msgDead, sideOf(t2), t2.uid, t2.uid, undefined, undefined,
      spans(msgDead, [['target', t2.name]]));
    nb = applyRockShardDeath(nb, t2);
    nb = applyToxicBurstDeath(nb, t2);
    nb = applyEmberDeath(nb, t2);
    // 灵魂链接：死亡时为幽灵船长+1灵魂
    const deadP = getUnitPassive(t2);
    if (deadP?.kind === 'ghostSoul') {
      const allies = t2.isPlayer ? nb.playerUnits : nb.enemyUnits;
      const ghostCaptain = allies.find((u) => u.speciesId === 'boss_ghost' && u.hp > 0);
      if (ghostCaptain) {
        const curSoul = ghostCaptain.soul ?? 0;
        if (curSoul < 20) {
          const newSoul = curSoul + 1;
          nb = replaceUnit(nb, { ...ghostCaptain, soul: newSoul });
          nb = pushLog(nb, `${t2.name} 的「灵魂链接」触发！${ghostCaptain.name} 获得 1 个灵魂（共 ${newSoul}）`, sideOf(ghostCaptain), ghostCaptain.uid, ghostCaptain.uid);
          if (newSoul === 5) nb = pushLog(nb, `${ghostCaptain.name} 的「灵魂汲取」达到 5 灵魂！伤害 +2`, sideOf(ghostCaptain), ghostCaptain.uid, ghostCaptain.uid);
          else if (newSoul === 10) nb = pushLog(nb, `${ghostCaptain.name} 的「灵魂汲取」达到 10 灵魂！每回合恢复 3 HP`, sideOf(ghostCaptain), ghostCaptain.uid, ghostCaptain.uid);
          else if (newSoul === 20) nb = pushLog(nb, `${ghostCaptain.name} 的「灵魂汲取」达到 20 灵魂！伤害 +3（共 +5）`, sideOf(ghostCaptain), ghostCaptain.uid, ghostCaptain.uid);
        }
      }
    }
  }
  // 锁链掌控：被锁链链接的单位死亡时，链接方回复15%最大生命+伤害+2持续2回合
  if (t2.hp <= 0 && t2.statuses.some((s) => s.kind === 'chainLink')) {
    const chain = t2.statuses.find((s) => s.kind === 'chainLink');
    if (chain?.sourceUid) {
      const allies = t2.isPlayer ? nb.enemyUnits : nb.playerUnits;
      const master = allies.find((u) => u.hp > 0 && getUnitPassive(u)?.kind === 'chainMaster');
      if (master) {
        const healAmt = Math.floor(master.maxHp * 0.15);
        let healed = { ...master, hp: Math.min(master.maxHp, master.hp + healAmt) };
        healed = applyStatusTo(healed, { kind: 'atkUp', value: 2, turns: 2 }, nb.round);
        nb = replaceUnit(nb, healed);
        nb = pushLog(nb, `${master.name} 的「锁链掌控」触发！回复 ${healAmt} 生命 + 伤害+2`, sideOf(master), master.uid, master.uid);
      }
    }
  }
  // 献祭被动：傀儡死亡时给予成长之主 +3 成长值
  if (t2.hp <= 0 && t2.sacrificeUid) {
    const master = actorFromId(nb, t2.sacrificeUid);
    if (master && master.hp > 0) {
      const curGV = master.growthValue ?? 0;
      nb = replaceUnit(nb, { ...master, growthValue: curGV + 3 });
      nb = pushLog(nb, `${t2.name} 的「献祭」触发！${master.name} 获得 3 成长值（共 ${curGV + 3}）`, sideOf(master), t2.uid, master.uid);
    }
  }
  return nb;
}

function detonateBurnBrand(b: BattleState, actor: Unit, uid: string): BattleState {
  const target = actorFromId(b, uid);
  if (!target) return b;
  const statuses = target.statuses.filter((status) => status.kind !== 'burnBrand' || status.sourceSide !== sideOf(actor));
  if (target.hp <= 0) return replaceUnit(b, { ...target, statuses });
  const layers = target.statuses.find((status) => status.kind === 'burn')?.value ?? 0;
  let damage = layers;
  let nb = b;
  const passive = getUnitPassive(target, nb);
  if (passive?.kind === 'foxFlame' || passive?.kind === 'flameRelay') damage = 0;
  if (passive?.kind === 'damageCap') {
    const dealt = nb.roundDmgMap?.[target.uid] ?? 0;
    damage = Math.min(damage, Math.max(0, passive.value - dealt));
    nb = { ...nb, roundDmgMap: { ...nb.roundDmgMap, [target.uid]: dealt + damage } };
  }
  const detonated = { ...target, hp: Math.max(0, target.hp - damage), statuses: statuses.filter((status) => status.kind !== 'burn') };
  nb = replaceUnit(nb, detonated);
  const msg = `${target.name} 的「灼烧烙印」引爆 ${layers} 层，受到 ${damage} 点灼烧伤害`;
  nb = pushLog(nb, msg, sideOf(target), actor.uid, target.uid, undefined, undefined,
    spans(msg, [['target', target.name], ['skill', '灼烧烙印'], ['status', `${layers} 层`], ['damage', String(damage)]]));
  // 只把死亡前状态快照传给死亡回调，运行时尸体保留的是已清火状态。
  nb = notifyBurnRemoved(nb, target, layers);
  return detonated.hp <= 0 ? applyDefeatedTarget(nb, { ...target, hp: 0, statuses }) : nb;
}

export const MIRROR_BLOCKED_SKILLS = new Set([...MIMIC_BLOCKED_SKILLS, 'ghost_burst', 'puppet_soul_return', 'mirror_copy']);

/** 不预掷随机，不改变战斗；仅在镜影兽真正行动时读取上一名友方技能。 */
export function mirrorCopyPlan(b: BattleState, actor: Unit): { skill?: SkillDef; targetUid?: string; reason?: string } {
  if (getUnitPassive(actor)?.kind !== 'mirrorCopy' || actor.hp <= 0 || actor.mirrorOwnSkillUsed || actor.mirrorCopyRound === b.round) return { reason: '本回合已判定复制或使用过自身技能' };
  const record = b.lastAllySkill?.[sideOf(actor)];
  if (!record || record.actorUid === actor.uid) return { reason: '本回合没有其他友方的可复制记录' };
  const skill = SKILLS[record.skillId];
  if (!skill || MIRROR_BLOCKED_SKILLS.has(skill.id) || skill.growthCost) return { reason: '上一名友方使用了不可复制的技能' };
  if (actor.statuses.some(s => s.kind === 'skillSeal' && s.sealedSkills?.includes(skill.id))) return { reason: '该技能被封印' };
  if (skill.id === 'ignite_embers' && !alliesOf(b, actor).some(u => u.statuses.some(s => s.kind === 'emberSeed'))) return { reason: '我方没有火种' };
  const enemies = enemiesOf(b, actor);
  if (skill.id === 'chain_activate' && !enemies.some(u => u.statuses.some(s => s.kind === 'chainLink'))) return { reason: '敌方没有锁链' };
  if (skill.id === 'chain_bind' && enemies.length < 2) return { reason: '不足两名可连接敌人' };
  if (skill.target === 'self') return { skill, targetUid: actor.uid };
  let pool = skill.target === 'ally' || skill.target === 'allyAll' ? alliesOf(b, actor) : enemies;
  if (skill.id === 'furnace_shell') pool = furnaceShellTargets(b, actor);
  else if (requiresBurningTarget(skill.id)) pool = stokeFireTargets(b, actor, skill.id);
  else if (skill.id === 'flame_tracing_feather') pool = flameTracingTargets(b, actor);
  else if (skill.target === 'single') {
    const front = pool.filter(u => u.row === 'front');
    const back = pool.filter(u => u.row === 'back');
    if (skill.reach === 'back') pool = back.length ? back : pool;
    else if (skill.reach !== 'direct') pool = front.length ? front : pool;
    const taunt = actor.statuses.find(s => s.kind === 'taunt');
    if (taunt?.sourceUid) pool = pool.filter(u => u.uid === taunt.sourceUid);
  }
  if (skill.id === 'despair_gaze') pool = pool.filter(u => getFearStacks(u) >= 3);
  if (!pool.length) return { reason: '没有满足技能条件的合法目标' };
  const target = pool.find(u => u.uid === record.targetUid) ?? pool[0];
  return { skill, targetUid: skill.target === 'single' || skill.target === 'ally' ? target.uid : undefined };
}

function resolveMirrorCopy(b: BattleState, actor: Unit): BattleState {
  const plan = mirrorCopyPlan(b, actor);
  let nb = replaceUnit(b, { ...actor, mirrorCopyRound: b.round });
  if (plan.reason || !plan.skill) return markActed(pushLog(nb, `${actor.name} 的「镜影复制」未触发：${plan.reason ?? '没有可复制技能'}`, sideOf(actor), actor.uid), actor.uid);
  nb = replaceUnit(nb, { ...actorFromId(nb, actor.uid)!, skillEnhancements: undefined });
  nb = pushLog(nb, `${actor.name} 的「镜影复制」复制「${plan.skill.name}」`, sideOf(actor), actor.uid);
  nb = useSkillInner(nb, actorFromId(nb, actor.uid)!, plan.skill, plan.targetUid);
  const fresh = actorFromId(nb, actor.uid)!;
  if (nb.testSkillUses) nb = { ...nb, testSkillUses: { ...nb.testSkillUses, [actor.uid]: b.testSkillUses?.[actor.uid] ?? {} } };
  return replaceUnit(nb, { ...fresh, skillUses: actor.skillUses, skillCooldowns: actor.skillCooldowns, skillEnhancements: actor.skillEnhancements });
}

/** 玩家与敌方通用的技能结算（内部） */
function useSkillInner(b: BattleState, actor: Unit, skill: SkillDef, explicitTarget?: string): BattleState {
  skill = getBattleSkill(b, skill.id);
  const foxBurnBonus = foxFireLayers(actor);
  if (actor.hp <= 0) return b;
  // 指定目标在轮到本次行动前死亡或离场：跳过，不回退到其他目标或消耗技能。
  if (explicitTarget && (skill.target === 'single' || skill.target === 'ally')) {
    const target = actorFromId(b, explicitTarget);
    if (!target || target.hp <= 0) {
      return markActed(pushLog(b, `${actor.name} 选择的目标已死亡或离场，本次行动跳过`, sideOf(actor), actor.uid), actor.uid);
    }
  }
  if (actor.statuses.some((s) => s.kind === 'stun')) {
    return markActed(pushLog(b, `${actor.name} 被眩晕，无法行动`, sideOf(actor)), actor.uid);
  }
  if (skill.id === 'mirror_copy') return resolveMirrorCopy(b, actor);
  // 技能封印检查：skillSeal 封印指定技能
  const sealStatus = actor.statuses.find((s) => s.kind === 'skillSeal');
  if (sealStatus && sealStatus.sealedSkills?.includes(skill.id)) {
    // 被封印的技能无法使用
    return markActed(pushLog(b, `${actor.name} 的「${skill.name}」被封印，无法使用`, sideOf(actor)), actor.uid);
  }
  // 成长值消耗检查
  if (skill.growthCost) {
    const curGV = actor.growthValue ?? 0;
    if (curGV < skill.growthCost) {
      return markActed(pushLog(b, `${actor.name} 的成长值不足，无法使用「${skill.name}」（需要 ${skill.growthCost}，当前 ${curGV}）`, sideOf(actor)), actor.uid);
    }
  }

  let nb = b;
  // 扣除成长值消耗
  if (skill.growthCost) {
    const freshActor = actorFromId(nb, actor.uid);
    if (freshActor && freshActor.hp > 0) {
      nb = replaceUnit(nb, { ...freshActor, growthValue: (freshActor.growthValue ?? 0) - skill.growthCost });
      nb = pushLog(nb, `${freshActor.name} 消耗 ${skill.growthCost} 成长值使用「${skill.name}」`, sideOf(freshActor), freshActor.uid, freshActor.uid);
    }
  }
  const { targets, battle } = resolveTargets(nb, actor, skill, explicitTarget);
  nb = battle;
  if (skill.id === 'ignite_embers') {
    const carriers = alliesOf(nb, actor).filter(unit => unit.statuses.some(s => s.kind === 'emberSeed'));
    if (carriers.length === 0) return markActed(pushLog(nb, `${actor.name} 没有可引燃的我方火种`, sideOf(actor)), actor.uid);
    for (const unit of carriers) nb = replaceUnit(nb, { ...unit, statuses: unit.statuses.filter(s => s.kind !== 'emberSeed') });
    skill = { ...skill, damage: carriers.length * 2 };
  }
  if (targets.length === 0) {
    return markActed(pushLog(nb, `${actor.name} 的${skill.name}没有目标`, sideOf(actor)), actor.uid);
  }
  // 仅含镜影兽的战斗记录已成功进入施放阶段的主动技能；休息、道具、被动不经过此处。
  if ([...nb.playerUnits, ...nb.enemyUnits, ...(nb.playerBench ?? []), ...(nb.enemyBench ?? [])].some(u => getUnitPassive(u)?.kind === 'mirrorCopy')) {
    nb = { ...nb, lastAllySkill: { ...nb.lastAllySkill, [sideOf(actor)]: { actorUid: actor.uid, skillId: skill.id, targetUid: explicitTarget ?? targets[0]?.uid } } };
  }
  if (skill.id === 'gather_shields') {
    const current = actorFromId(nb, actor.uid)!;
    const amount = alliesOf(nb, actor).reduce((sum, unit) => sum + unit.shield, 0);
    const gain = Math.min(amount, 99 - current.shield);
    nb = replaceUnit(nb, { ...current, shield: current.shield + gain, gatherShieldsRound: nb.round });
    nb = pushLog(nb, `${actor.name} 使用「集盾」，获得 ${gain} 点护盾`, sideOf(actor), actor.uid, actor.uid);
    return markActed(consumeSkillUse(applySkillCooldown(nb, actor, skill), actor, skill.id), actor.uid);
  }
  if (skill.id === 'ride_wind') {
    const current = actorFromId(nb, actor.uid)!;
    const level = getSkillEnhanceLevel(actor, actor.skills.indexOf(skill.id));
    const gain = 1 + getSkillEnhanceBonus(skill.id, level).effectBonus;
    nb = replaceUnit(nb, { ...current, spd: current.spd + gain, mirrorSpdDelta: (current.mirrorSpdDelta ?? 0) + gain });
    nb = pushLog(nb, `${actor.name} 使用「乘风」，本场速度提升 ${gain} 点`, sideOf(actor), actor.uid, actor.uid);
    return markActed(nb, actor.uid);
  }
  if (skill.id === 'mirror_speed_up' || skill.id === 'mirror_speed_down') {
    const current = actorFromId(nb, actor.uid)!;
    const spd = Math.max(1, current.spd + (skill.id === 'mirror_speed_up' ? 1 : -1));
    nb = replaceUnit(nb, { ...current, spd, mirrorSpdDelta: (current.mirrorSpdDelta ?? 0) + spd - current.spd, mirrorOwnSkillUsed: true });
    nb = pushLog(nb, `${actor.name} 使用「${skill.name}」，强化自身`, sideOf(actor), actor.uid, actor.uid);
    return markActed(nb, actor.uid);
  }
  if (!actor.isPlayer) {
    const freshActor = actorFromId(nb, actor.uid)!;
    actor = { ...freshActor, lastSkillId: skill.id,
      defensiveStreak: isDefensiveSkill(skill) ? (freshActor.defensiveStreak ?? 0) + 1 : 0 };
    nb = replaceUnit(nb, actor);
    // 后续部分技能从目标快照写回自身，必须同步此次行动记录。
    for (let i = 0; i < targets.length; i++) if (targets[i].uid === actor.uid) targets[i] = actor;
  }
  if (nb.telemetry) {
    nb = {
      ...nb,
      telemetry: [...nb.telemetry, {
        kind: 'skill-use',
        round: nb.round,
        side: sideOf(actor),
        actorUid: actor.uid,
        actorSpeciesId: actor.speciesId,
        targetUid: targets[0]?.uid,
        targetSpeciesId: targets[0]?.speciesId,
        skillId: skill.id,
        targetCount: targets.length,
      }],
    };
  }

  if (skill.id === 'shell_charge' || skill.id === 'core_crystal_burst') {
    const current = actorFromId(nb, actor.uid)!;
    const spent = Math.min(5, current.shield);
    const shield = current.shield - spent;
    nb = replaceUnit(nb, { ...current, shield, statuses: shield === 0 ? current.statuses.filter((status) => status.kind !== 'shield') : current.statuses });
    nb = pushLog(nb, `${actor.name} 使用「${skill.name}」消耗 ${spent} 点护盾`, sideOf(actor), actor.uid, actor.uid);
    skill = { ...skill, damage: (skill.damage ?? 3) + spent };
  }

  if (skill.id === 'core_crystal_cleanse') {
    const current = actorFromId(nb, actor.uid)!;
    let remaining = 6;
    let removedBurn = 0;
    let statuses = current.statuses.map(status => ({ ...status }));
    for (const kind of ['burn', 'poison', 'fear'] as const) {
      for (const status of statuses) {
        if (status.kind !== kind || remaining <= 0) continue;
        const removed = Math.min(remaining, status.value);
        status.value -= removed;
        remaining -= removed;
        if (kind === 'burn') removedBurn += removed;
      }
    }
    statuses = statuses.filter(status => !['burn', 'poison', 'fear'].includes(status.kind) || status.value > 0);
    const removed = 6 - remaining;
    nb = replaceUnit(nb, { ...current, statuses, shield: Math.min(99, current.shield + removed) });
    nb = pushLog(nb, `${actor.name} 使用「晶核净化」，强化自身`, sideOf(actor), actor.uid, actor.uid);
    nb = pushLog(nb, `${actor.name} 移除 ${removed} 层状态，获得 ${Math.min(removed, 99 - current.shield)} 点护盾`, sideOf(actor), actor.uid, actor.uid);
    nb = notifyBurnRemoved(nb, current, removedBurn);
    return markActed(consumeSkillUse(applySkillCooldown(nb, actor, skill), actor, skill.id), actor.uid);
  }

  if (skill.id === 'molten_quake') {
    nb = replaceUnit(nb, applyStatusTo(actorFromId(nb, actor.uid)!, { kind: 'burn', value: 3, turns: 2 }, nb.round));
    nb = pushLog(nb, `${actor.name} 使用「熔甲震荡」，${actor.name} 灼烧 3 层`, sideOf(actor), actor.uid, actor.uid, ['burn']);
  }

  if (skill.id === 'burn_tail') {
    const current = actorFromId(nb, actor.uid)!;
    const empowered = addFoxFire(current, 2);
    nb = replaceUnit(nb, empowered);
    nb = pushLog(nb, `${actor.name} 使用「焚尾」，获得 ${foxFireLayers(empowered) - foxFireLayers(current)} 层狐火（当前 ${foxFireLayers(empowered)}）`, sideOf(actor), actor.uid, actor.uid, ['foxFire']);
    return markActed(consumeSkillUse(applySkillCooldown(nb, actor, skill), actor, skill.id), actor.uid);
  }
  if (skill.id === 'flame_tail_shield') {
    const current = actorFromId(nb, actor.uid)!;
    const enhancement = getSkillEnhanceBonus(skill.id, getSkillEnhanceLevel(actor, actor.skills.indexOf(skill.id)));
    const burning = applyStatusTo(current, { kind: 'burn', value: 2, turns: 2 }, nb.round);
    const guarded = applyStatusTo({ ...burning, shield: Math.min(99, burning.shield + 4 + enhancement.effectBonus) }, { kind: 'foxTailGuard', value: 1, turns: 1 }, nb.round);
    nb = replaceUnit(nb, guarded);
    nb = pushLog(nb, `${actor.name} 使用「焰尾护盾」，强化自身`, sideOf(actor), actor.uid, actor.uid, ['burn', 'foxTailGuard']);
    return markActed(consumeSkillUse(applySkillCooldown(nb, actor, skill), actor, skill.id), actor.uid);
  }
  if (skill.id === 'illusory_flame') {
    const enhanced = getSkillEnhanceBonus(skill.id, getSkillEnhanceLevel(actor, actor.skills.indexOf(skill.id))).effectBonus;
    nb = replaceUnit(nb, applyStatusTo(actorFromId(nb, actor.uid)!, { kind: 'burn', value: 2, turns: 2 }, nb.round));
    nb = pushLog(nb, `${actor.name} 使用「虚火幻身」，${actor.name} 灼烧 2 层`, sideOf(actor), actor.uid, actor.uid, ['burn']);
    const picked = rngPick(nb, enemiesOf(nb, actor));
    nb = picked.battle;
    if (picked.pick) {
      const layers = 2 + enhanced + foxBurnBonus;
      nb = replaceUnit(nb, applyStatusTo(picked.pick, { kind: 'burn', value: layers, turns: 2 }, nb.round));
      nb = pushLog(nb, `${actor.name} 使用「虚火幻身」，${picked.pick.name} 灼烧 ${layers} 层`, sideOf(actor), actor.uid, picked.pick.uid, ['burn']);
    }
    return markActed(consumeSkillUse(applySkillCooldown(nb, actor, skill), actor, skill.id), actor.uid);
  }
  if (skill.id === 'molten_self_burn') {
    const enhanced = getSkillEnhanceLevel(actor, actor.skills.indexOf(skill.id));
    const burning = applyStatusTo(actorFromId(nb, actor.uid)!, { kind: 'burn', value: 4, turns: 2 }, nb.round);
    nb = replaceUnit(nb, { ...burning, shield: Math.min(99, burning.shield + 2 + enhanced * 2) });
    nb = pushLog(nb, `${actor.name} 使用「熔火自焚」，强化自身`, sideOf(actor), actor.uid, actor.uid, ['burn']);
    return markActed(consumeSkillUse(applySkillCooldown(nb, actor, skill), actor, skill.id), actor.uid);
  }
  if (skill.id === 'ember_transfer') {
    const source = targets[0];
    const destinations = enemiesOf(nb, actor).filter((unit) => unit.uid !== source.uid);
    nb = useRng(nb, (rng, current) => {
      const destination = destinations[Math.floor(rng * destinations.length)];
      const burn = source.statuses.find((status) => status.kind === 'burn')!;
      const amount = Math.min(6, burn.value);
      const reduced = { ...source, statuses: source.statuses.map((status) => status.kind === 'burn' ? { ...status, value: status.value - amount } : status)
        .filter((status) => status.kind !== 'burn' || status.value > 0) };
      let moved = replaceUnit(current, reduced);
      moved = replaceUnit(moved, applyStatusTo(destination, { kind: 'burn', value: amount, turns: 2 }, current.round));
      moved = pushLog(moved, `${actor.name} 使用「余烬迁移」，${destination.name} 灼烧 ${amount} 层`, sideOf(actor), actor.uid, destination.uid, ['burn']);
      return notifyBurnRemoved(moved, source, amount);
    });
    return markActed(consumeSkillUse(applySkillCooldown(nb, actor, skill), actor, skill.id), actor.uid);
  // 锁链引爆：对所有被锁链连接的敌方单位造成伤害（独立于 kind 判断，避免 attack kind 走入通用攻击分支打自身）
  } else if (skill.id === 'chain_activate') {
    const enemies = enemiesOf(nb, actor);
    const chainDmg = skill.damage ?? 5;
    const logStart = nb.log.length;
    for (const e of enemies) {
      if (e.statuses.some((s) => s.kind === 'chainLink')) {
        let damaged = { ...e, hp: Math.max(0, e.hp - chainDmg) };
        nb = replaceUnit(nb, damaged);
        nb = pushLog(nb, `${actor.name} 使用「锁链引爆」攻击 ${damaged.name}，造成 ${chainDmg} 伤害`, sideOf(actor), actor.uid, damaged.uid, undefined, undefined, undefined, { hpLoss: Math.min(e.hp, chainDmg) });
      }
    }
    return markActed(sealSkillGroup(nb, logStart), actor.uid);
  }

  if (skill.id === 'clean_flame_care') {
    for (const t of targets) {
      const current = actorFromId(nb, t.uid)!;
      const removed = current.statuses.find(s => s.kind === 'burn')?.value ?? 0;
      if (removed > 0) {
        nb = replaceUnit(nb, consumeBurn(current, removed));
        nb = pushLog(nb, `${actor.name} 的「净焰照护」移除 ${t.name} ${removed} 层灼烧`, sideOf(actor), actor.uid, t.uid);
        nb = notifyBurnRemoved(nb, current, removed);
        nb = useRng(nb, (value, next) => {
          const kind = value < 0.5 ? 'atkUp' : 'windSpd';
          const label = kind === 'atkUp' ? '攻击提升' : '速度提升';
          const buffed = applyStatusTo(actorFromId(next, t.uid)!, { kind, value: 2, turns: 2 }, next.round);
          next = replaceUnit(next, { ...buffed, statuses: buffed.statuses.map(s => s.kind === kind ? { ...s, appliedRound: next.round } : s) });
          const msg = `${actor.name} 使用「净焰照护」，强化${t.name}，获得${label} 2 层，持续 2 回合`;
          return pushLog(next, msg, sideOf(actor), actor.uid, t.uid, [kind], undefined,
            spans(msg, [['actor', actor.name], ['skill', skill.name], ['target', t.name], ['status', label]]));
        });
      } else {
        nb = pushLog(nb, `${actor.name} 使用「净焰照护」，${t.name} 没有灼烧，未获得增益`, sideOf(actor), actor.uid, t.uid);
      }
    }
    return markActed(consumeSkillUse(applySkillCooldown(nb, actor, skill), actor, skill.id), actor.uid);
  }

  if (skill.kind === 'heal') {
    let r = nb;
    const groupStart = r.log.length;
    const baseHeal = Math.max(1, skill.heal ?? 0);
    // 技能强化：治疗加成
    const healEnhanceLevel = getSkillEnhanceLevel(actor, actor.skills.indexOf(skill.id));
    const healEnhanceBonus = getSkillEnhanceBonus(skill.id, healEnhanceLevel);
    const amt = baseHeal + healEnhanceBonus.healBonus;
    const addsKinds = (skill.effects ?? []).map((e) => e.kind);
    for (const t of targets) {
      const removedBurn = skill.id === 'burn_reversal' ? Math.min(5, t.statuses.find(s => s.kind === 'burn')?.value ?? 0) : 0;
      if (removedBurn > 0) {
        r = replaceUnit(r, consumeBurn(t, removedBurn));
        r = pushLog(r, `${actor.name} 的「灼烧反转」移除 ${t.name} ${removedBurn} 层灼烧`, sideOf(actor), actor.uid, t.uid);
        r = notifyBurnRemoved(r, t, removedBurn);
      }
      const treated = actorFromId(r, t.uid)!;
      const totalHeal = amt + removedBurn + mossHealBonus(r, actor, t) + (skill.id === 'solar_heal' ? radianceLayers(actor) * 2 : 0);
      const maxHp = getEffectiveMaxHp(t);
      let healed = { ...treated, hp: Math.min(maxHp, t.hp + totalHeal) };
      // 治疗技能也可附带效果（如潮汐领域的水幕）
      for (const e of skill.effects ?? []) {
        if (e.kind === 'atkUp') {
          // 终焉成长：永久+1伤害每次使用须累加（applyStatusTo 对 atkUp 取最大值，此处绕开以支持叠加）
          const existing = healed.statuses.find((s) => s.kind === 'atkUp');
          if (existing) {
            healed = {
              ...healed,
              statuses: healed.statuses.map((s) => (s.kind === 'atkUp' ? { ...s, value: s.value + (e.value ?? 0) } : s)),
            };
          } else {
            healed = { ...healed, statuses: [...healed.statuses, { kind: 'atkUp', value: e.value ?? 0, turns: e.turns, appliedRound: r.round }] };
          }
          continue;
        }
        const effectValue = e.value + getSkillEffectEnhanceBonus(skill.id, healEnhanceLevel, e.kind);
        healed = applyStatusTo(healed, { kind: e.kind, value: effectValue, turns: e.turns }, r.round);
        if (e.kind === 'shield') {
          healed = { ...healed, shield: Math.min(99, healed.shield + effectValue) };
        }
      }
      r = replaceUnit(r, healed);
      const msgHeal = `${actor.name} 使用「${skill.name}」，治愈 ${t.name} ${totalHeal} 点生命`;
      r = pushLog(r, msgHeal, sideOf(actor), actor.uid, t.uid, addsKinds, undefined,
        spans(msgHeal, [['actor', actor.name], ['skill', skill.name], ['target', t.name], ['heal', String(totalHeal)]]),
        { healing: Math.max(0, healed.hp - treated.hp), addedStatuses: addedStatusValues(treated.statuses, healed.statuses) });
      if (targets.length === 1) r = cleanseMossAfterHeal(r, actor, t.uid);
    }
    if (targets.length > 1) {
      r = sealSkillGroup(r, groupStart);
      for (const t of targets) r = cleanseMossAfterHeal(r, actor, t.uid);
    }
    nb = r;
  } else if (skill.kind === 'buff') {
    const hasRealBuff = (skill.effects && skill.effects.length > 0) || (skill.heal && skill.heal > 0);
    if (hasRealBuff) {
      // 技能强化：buff 效果加成
      const buffEnhanceLevel = getSkillEnhanceLevel(actor, actor.skills.indexOf(skill.id));
      const buffEnhanceBonus = getSkillEnhanceBonus(skill.id, buffEnhanceLevel);
      const groupStart = nb.log.length;
      for (const t of targets) {
        let buffed = t;
        if (skill.heal && skill.heal > 0) {
          const maxHp = getEffectiveMaxHp(buffed);
          const healAmt = skill.heal + buffEnhanceBonus.healBonus + mossHealBonus(nb, actor, buffed);
          buffed = { ...buffed, hp: Math.min(maxHp, buffed.hp + healAmt) };
        }
        for (const e of skill.effects ?? []) {
          // 护盾效果加 effectBonus（level×2），非护盾效果只加 level×1
          const ashBonus = skill.id === 'ash_shelter' && e.kind === 'shield'
            && enemiesOf(nb, actor).some((unit) => unit.statuses.some((status) => status.kind === 'burn' && status.value > 0)) ? 2 : 0;
          const emberBonus = skill.id === 'ember_veil' && t.statuses.some(status => status.kind === 'emberSeed') ? 2 : 0;
          const rewindBonus = skill.id === 'sand_shield' && actor.timeRewindRound === nb.round ? 2 : 0;
          const effectValue = e.value + ashBonus + emberBonus + rewindBonus + getSkillEffectEnhanceBonus(skill.id, buffEnhanceLevel, e.kind);
          buffed = applyStatusTo(buffed, { kind: e.kind, value: effectValue, turns: e.turns }, nb.round);
          if (e.kind === 'shield') {
            buffed = { ...buffed, shield: Math.min(99, buffed.shield + effectValue) };
          }
        }
        nb = replaceUnit(nb, buffed);
        const buffHeal = (skill.heal ?? 0) + buffEnhanceBonus.healBonus + mossHealBonus(nb, actor, t);
        const healPart = (skill.heal && skill.heal > 0) ? `，回复 ${buffHeal} 点生命` : '';
        const msgBuff = `${actor.name} 使用「${skill.name}」，强化${t.name === actor.name ? '自身' : t.name}${healPart}`;
        const buffSpans: [LogSpan['kind'], string][] = [['actor', actor.name], ['skill', skill.name]];
        if (skill.heal && skill.heal > 0) buffSpans.push(['heal', `${buffHeal}`]);
        nb = pushLog(nb, msgBuff, sideOf(actor), actor.uid, t.uid, undefined, undefined,
          spans(msgBuff, buffSpans), { healing: Math.max(0, buffed.hp - t.hp), shieldGain: Math.max(0, buffed.shield - t.shield), addedStatuses: addedStatusValues(t.statuses, buffed.statuses) });
        if (targets.length === 1 && (skill.heal ?? 0) > 0) nb = cleanseMossAfterHeal(nb, actor, t.uid);
      }
      if (targets.length > 1) {
        nb = sealSkillGroup(nb, groupStart);
        if ((skill.heal ?? 0) > 0) for (const t of targets) nb = cleanseMossAfterHeal(nb, actor, t.uid);
      }
    } else {
      nb = pushLog(nb, `${actor.name} 使用「${skill.name}」，强化自身`, sideOf(actor), actor.uid, actor.uid);
    }
    // 缩壳：额外给同侧潮汐巨蟹5点护盾
    if (skill.id === 'shell_up') {
      const allies = actor.isPlayer ? nb.playerUnits : nb.enemyUnits;
      const crab = allies.find((a) => a.speciesId === 'boss_crab' && a.hp > 0 && a.uid !== actor.uid);
      if (crab) {
        const shieldVal = (skill.effects ?? []).find((e) => e.kind === 'shield')?.value ?? 5;
        let shielded = { ...crab, shield: Math.min(99, crab.shield + shieldVal) };
        shielded = applyStatusTo(shielded, { kind: 'shield', value: shieldVal, turns: 99 }, nb.round);
        nb = replaceUnit(nb, shielded);
        nb = pushLog(nb, `${actor.name} 使用「${skill.name}」，强化${crab.name}`, sideOf(actor), actor.uid, crab.uid);
      }
    }
    // 缩壳：施法者自身眩晕1回合
    if (skill.id === 'shell_up') {
      const self = actorFromId(nb, actor.uid);
      if (self && self.hp > 0) {
        const stunned = applyStatusTo(self, { kind: 'stun', value: 1, turns: 2 }, nb.round);
        nb = replaceUnit(nb, stunned);
        nb = pushLog(nb, `${self.name} 缩入壳中，下回合无法行动`, sideOf(self), self.uid);
      }
    }
    // 灵魂共享：为幽灵船长+2灵魂
    if (skill.id === 'soul_share') {
      const allies = actor.isPlayer ? nb.playerUnits : nb.enemyUnits;
      const ghostCaptain = allies.find((a) => a.speciesId === 'boss_ghost' && a.hp > 0);
      if (ghostCaptain) {
        const curSoul = ghostCaptain.soul ?? 0;
        if (curSoul < 20) {
          const newSoul = Math.min(20, curSoul + 2);
          nb = replaceUnit(nb, { ...ghostCaptain, soul: newSoul });
          nb = pushLog(nb, `${actor.name} 使用「灵魂共享」，${ghostCaptain.name} 获得 2 个灵魂（共 ${newSoul}）`, sideOf(actor), actor.uid, ghostCaptain.uid);
          if (curSoul < 5 && newSoul >= 5) nb = pushLog(nb, `${ghostCaptain.name} 的「灵魂汲取」达到 5 灵魂！伤害 +2`, sideOf(ghostCaptain), ghostCaptain.uid, ghostCaptain.uid);
          if (curSoul < 10 && newSoul >= 10) nb = pushLog(nb, `${ghostCaptain.name} 的「灵魂汲取」达到 10 灵魂！每回合恢复 3 HP`, sideOf(ghostCaptain), ghostCaptain.uid, ghostCaptain.uid);
          if (curSoul < 20 && newSoul >= 20) nb = pushLog(nb, `${ghostCaptain.name} 的「灵魂汲取」达到 20 灵魂！伤害 +3（共 +5）`, sideOf(ghostCaptain), ghostCaptain.uid, ghostCaptain.uid);
        }
      }
    }
    // 成长召唤：消耗3成长值，召唤一只成长傀儡（场上最多2只）
    if (skill.id === 'growth_summon') {
      const allies = actor.isPlayer ? nb.playerUnits : nb.enemyUnits;
      const alivePuppets = allies.filter((u) => u.speciesId === 'growth_puppet' && u.hp > 0);
      if (alivePuppets.length >= 2) {
        nb = pushLog(nb, `${actor.name} 使用「${skill.name}」，但场上已有2只傀儡，召唤失败`, sideOf(actor), actor.uid, actor.uid);
      } else {
        const dead = allies.find((u) => u.speciesId === 'growth_puppet' && u.hp <= 0);
        if (dead) {
          const fresh = makeEnemy({ speciesId: 'growth_puppet' }, dead.row, dead.column, true, nb.difficulty);
          const summoned = { ...fresh, acted: true, uid: dead.uid, summoning: true, isPlayer: actor.isPlayer, sacrificeUid: actor.uid };
          nb = replaceUnit(nb, summoned);
          nb = pushLog(nb, `${actor.name} 使用「${skill.name}」，召唤了${summoned.name}！`, sideOf(actor), actor.uid, summoned.uid);
        } else {
          const usedCols = new Set(allies.filter((u) => u.hp > 0).map((u) => `${u.row}:${u.column}`));
          let placed = false;
          for (const row of ['front', 'back'] as const) {
            for (const col of [0, 1, 2] as const) {
              if (!usedCols.has(`${row}:${col}`)) {
                const fresh = makeEnemy({ speciesId: 'growth_puppet' }, row, col, true, nb.difficulty);
                const summoned = { ...fresh, acted: true, summoning: true, isPlayer: actor.isPlayer, sacrificeUid: actor.uid };
                if (actor.isPlayer) {
                  nb = { ...nb, playerUnits: [...nb.playerUnits, summoned] };
                } else {
                  nb = { ...nb, enemyUnits: [...nb.enemyUnits, summoned] };
                }
                nb = pushLog(nb, `${actor.name} 使用「${skill.name}」，召唤了${summoned.name}！`, sideOf(actor), actor.uid, summoned.uid);
                placed = true;
                break;
              }
            }
            if (placed) break;
          }
          if (!placed) {
            nb = pushLog(nb, `${actor.name} 使用「${skill.name}」，但没有空位，召唤失败`, sideOf(actor), actor.uid, actor.uid);
          }
        }
      }
    }
    // 锁链束缚：链接目标与随机另一名敌人（已有锁链的单位不可被选中）
    if (skill.id === 'chain_bind') {
      const enemiesAlive = enemiesOf(nb, actor).filter((e) => e.hp > 0);
      let targetUnit = explicitTarget ? actorFromId(nb, explicitTarget) : undefined;
      // 目标必须是敌方且未锁链，否则从未锁链敌人中随机选一个
      if (!targetUnit || !enemiesAlive.some((e) => e.uid === targetUnit!.uid) || targetUnit.statuses.some((s) => s.kind === 'chainLink')) {
        const validTargets = enemiesAlive.filter((e) => !e.statuses.some((s) => s.kind === 'chainLink'));
        if (validTargets.length < 2) return markActed(nb, actor.uid);
        const pick = rngPick(nb, validTargets);
        nb = pick.battle;
        targetUnit = pick.pick;
      }
      const otherEnemies = enemiesOf(nb, actor).filter((e) => e.uid !== targetUnit!.uid && e.hp > 0 && !e.statuses.some((s) => s.kind === 'chainLink'));
      if (targetUnit && targetUnit.hp > 0 && otherEnemies.length > 0) {
        const res = rngPick(nb, otherEnemies);
        nb = res.battle;
        const partner = res.pick;
        if (partner) {
          let t2 = applyStatusTo(targetUnit, { kind: 'chainLink', value: 50, turns: 2, sourceUid: partner.uid }, nb.round);
          let p2 = applyStatusTo(partner, { kind: 'chainLink', value: 50, turns: 2, sourceUid: targetUnit.uid }, nb.round);
          nb = replaceUnit(nb, t2);
          nb = replaceUnit(nb, p2);
          nb = pushLog(nb, `${actor.name} 使用「锁链束缚」！${t2.name} 和 ${p2.name} 被锁链连接`, sideOf(actor), actor.uid, t2.uid);
        }
      }
      return markActed(nb, actor.uid);
    }
    // 锁链链接：链接自身与Boss（链卫专属，持续2回合）
    if (skill.id === 'chain_link') {
      const allies = actor.isPlayer ? nb.playerUnits : nb.enemyUnits;
      const boss = allies.find((a) => a.speciesId === 'boss_dragon' && a.hp > 0);
      if (boss) {
        let a2 = applyStatusTo(actor, { kind: 'chainLink', value: 50, turns: 2, sourceUid: boss.uid }, nb.round);
        let b2 = applyStatusTo(boss, { kind: 'chainLink', value: 50, turns: 2, sourceUid: actor.uid }, nb.round);
        nb = replaceUnit(nb, a2);
        nb = replaceUnit(nb, b2);
        nb = pushLog(nb, `${actor.name} 使用「锁链链接」！与 ${b2.name} 链接 2 回合`, sideOf(actor), actor.uid, a2.uid);
      }
      return markActed(nb, actor.uid);
    }
    // 碎岩重组：消灭并重新召唤碎石傀儡和晶石虫
    if (skill.id === 'rock_reforge') {
      const minionSpecies = ['boss_minion_rock', 'boss_minion_crystal'];
      const cols: (0 | 1 | 2)[] = [0, 2];
      for (let i = 0; i < minionSpecies.length; i++) {
        const sid = minionSpecies[i];
        const col = cols[i];
        const existing = nb.enemyUnits.find((u) => u.speciesId === sid && u.hp > 0);
        if (existing) {
          // 消灭存活的小怪 → 触发岩壳碎片
          let killed = { ...existing, hp: 0 };
          nb = replaceUnit(nb, killed);
          nb = pushLog(nb, `${existing.name} 被巨像碾碎了`, sideOf(killed), killed.uid, killed.uid);
          nb = applyRockShardDeath(nb, killed);
          nb = applyToxicBurstDeath(nb, killed);
        }
        // 复用同 species 的死亡单位：覆盖其 uid/槽位为新召唤个体，避免死卡占位
        const dead = nb.enemyUnits.find((u) => u.speciesId === sid && u.hp <= 0);
        const fresh = makeEnemy({ speciesId: sid }, dead ? dead.row : 'front', dead ? dead.column : col, true, nb.difficulty);
        const summoned = { ...fresh, acted: true, ...(dead ? { uid: dead.uid } : {}) };
        if (dead) {
          nb = replaceUnit(nb, summoned);
        } else {
          nb = { ...nb, enemyUnits: [...nb.enemyUnits, summoned] };
        }
        nb = pushLog(nb, `${actor.name} 使用「碎岩重组」，召唤了${summoned.name}！`, sideOf(actor), actor.uid, summoned.uid);
      }
    }
    // 孢子召唤：随机召唤一只毒孢囊或沼地蛞蝓（无空位则失败）
    if (skill.id === 'spore_summon') {
      const minionSids = ['boss_minion_spore_sac', 'boss_minion_slug'];
      const rngIdx = Math.abs((nb.rngCount ?? 0)) % minionSids.length;
      nb = { ...nb, rngCount: (nb.rngCount ?? 0) + 1 };
      const sid = minionSids[rngIdx];
      // 找空位：优先复用同 species 的死亡单位槽位，否则在 3 列中找空
      const dead = nb.enemyUnits.find((u) => u.speciesId === sid && u.hp <= 0);
      if (dead) {
        const fresh = makeEnemy({ speciesId: sid }, dead.row, dead.column, true, nb.difficulty);
        const summoned = { ...fresh, acted: true, uid: dead.uid, summoning: true };
        nb = replaceUnit(nb, summoned);
        nb = pushLog(nb, `${actor.name} 使用「孢子召唤」，召唤了${summoned.name}！`, sideOf(actor), actor.uid, summoned.uid);
      } else {
        // 在前排/后排找空列（0/1/2）
        const usedCols = new Set(nb.enemyUnits.filter((u) => u.hp > 0).map((u) => `${u.row}:${u.column}`));
        let placed = false;
        for (const row of ['front', 'back'] as const) {
          for (const col of [0, 1, 2] as const) {
            if (!usedCols.has(`${row}:${col}`)) {
              const fresh = makeEnemy({ speciesId: sid }, row, col, true, nb.difficulty);
              const summoned = { ...fresh, acted: true, summoning: true };
              nb = { ...nb, enemyUnits: [...nb.enemyUnits, summoned] };
              nb = pushLog(nb, `${actor.name} 使用「孢子召唤」，召唤了${summoned.name}！`, sideOf(actor), actor.uid, summoned.uid);
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
        if (!placed) {
          nb = pushLog(nb, `${actor.name} 使用「孢子召唤」，但没有空位，召唤失败`, sideOf(actor), actor.uid, actor.uid);
        }
      }
    }
    // 幽灵召唤：召唤幽灵水手和幽影（仅在所有召唤物死亡时可用）
    if (skill.id === 'ghostly_summon') {
      const minionSids = ['boss_minion_ghost_sailor', 'boss_minion_phantom'];
      for (const sid of minionSids) {
        // 优先复用同 species 的死亡单位槽位
        const dead = nb.enemyUnits.find((u) => u.speciesId === sid && u.hp <= 0);
        if (dead) {
          const fresh = makeEnemy({ speciesId: sid }, dead.row, dead.column, true, nb.difficulty);
          const summoned = { ...fresh, acted: true, uid: dead.uid, summoning: true };
          nb = replaceUnit(nb, summoned);
          nb = pushLog(nb, `${actor.name} 使用「幽灵召唤」，召唤了${summoned.name}！`, sideOf(actor), actor.uid, summoned.uid);
        } else {
          // 在前排/后排找空列
          const usedCols = new Set(nb.enemyUnits.filter((u) => u.hp > 0).map((u) => `${u.row}:${u.column}`));
          let placed = false;
          for (const row of ['front', 'back'] as const) {
            for (const col of [0, 1, 2] as const) {
              if (!usedCols.has(`${row}:${col}`)) {
                const fresh = makeEnemy({ speciesId: sid }, row, col, true, nb.difficulty);
                const summoned = { ...fresh, acted: true, summoning: true };
                nb = { ...nb, enemyUnits: [...nb.enemyUnits, summoned] };
                nb = pushLog(nb, `${actor.name} 使用「幽灵召唤」，召唤了${summoned.name}！`, sideOf(actor), actor.uid, summoned.uid);
                placed = true;
                break;
              }
            }
            if (placed) break;
          }
          if (!placed) {
            nb = pushLog(nb, `${actor.name} 使用「幽灵召唤」，但没有空位，召唤失败`, sideOf(actor), actor.uid, actor.uid);
          }
        }
      }
    }
  } else if (skill.kind === 'status') {
    // 状态技能：对目标施加 debuff，不触发攻击被动（蛇狩、荆棘、吸血等）
    const addsKinds = (skill.effects ?? []).map((e) => e.kind);
    // 技能强化：效果值加成
    const statusEnhanceLevel = getSkillEnhanceLevel(actor, actor.skills.indexOf(skill.id));
    const statusEnhanceBonus = getSkillEnhanceBonus(skill.id, statusEnhanceLevel);
    let weakenAppliedKind: 'atkDown' | 'spdDown' | undefined;
    for (const t of targets) {
      let affected = t;
      for (const e of skill.effects ?? []) {
        if (skill.id === 'weaken') {
          const rngKind = (nb.rngCount ?? 0) % 2 === 0 ? 'atkDown' : 'spdDown';
          weakenAppliedKind = rngKind;
          affected = applyStatusTo(affected, { kind: rngKind, value: e.value + statusEnhanceBonus.effectBonus, turns: e.turns }, nb.round);
          nb = { ...nb, rngCount: (nb.rngCount ?? 0) + 1 };
        } else if (skill.id === 'despair_gaze') {
          // 绝望凝视：若目标恐惧≥3层，使其眩晕1回合，然后清除恐惧
          const fearStacks = getFearStacks(affected);
          if (fearStacks >= 3) {
            affected = applyStatusTo(affected, { kind: 'stun', value: 1, turns: 1 }, nb.round);
            affected = { ...affected, statuses: affected.statuses.filter((s) => s.kind !== 'fear') };
          }
        } else {
          // 眩晕/封印/嘲讽固定，不随强化变化；其余效果值叠加强化加成
          const effectValue = e.value + getSkillEffectEnhanceBonus(skill.id, statusEnhanceLevel, e.kind) + (e.kind === 'burn' && actor.isPlayer !== t.isPlayer ? foxBurnBonus : 0);
          affected = applyStatusTo(affected, { kind: e.kind, value: effectValue, turns: e.turns }, nb.round);
        }
      }
      if (skill.id === 'burn_brand') {
        affected = { ...affected, statuses: affected.statuses.filter((status) => status.kind !== 'burnBrand' || status.sourceSide !== sideOf(actor))
          .concat([{ kind: 'burnBrand', value: 1, turns: 2, appliedRound: nb.round, sourceUid: actor.uid, sourceSide: sideOf(actor) }]) };
      }
      nb = replaceUnit(nb, affected);
    }
    // 推送日志
    const effectDesc = (skill.effects ?? []).map((e) => {
      if (skill.id === 'weaken') {
        const val = e.value + statusEnhanceBonus.effectBonus;
        const label = weakenAppliedKind === 'spdDown' ? '降低速度' : '降低攻击';
        return `${label} ${val} 层`;
      }
      if (e.kind === 'poison') return `中毒 ${e.value + statusEnhanceBonus.effectBonus} 层`;
      if (e.kind === 'burn') return `灼烧 ${e.value + statusEnhanceBonus.effectBonus + (skill.target !== 'self' && skill.target !== 'ally' && skill.target !== 'allyAll' ? foxBurnBonus : 0)} 层`;
      if (e.kind === 'atkDown') return `降低攻击 ${e.value + statusEnhanceBonus.effectBonus} 层`;
      if (e.kind === 'spdDown') return `降低速度 ${e.value + statusEnhanceBonus.effectBonus} 层`;
      if (e.kind === 'stun') return '眩晕';
      if (e.kind === 'timeLag') return '时滞';
      if (e.kind === 'fear') return `恐惧 ${e.value + statusEnhanceBonus.effectBonus} 层`;
      return e.kind;
    }).join('，');
    const hitAdds = (weakenAppliedKind ? [weakenAppliedKind] : addsKinds).filter((k) => ['timeLag', 'emberSeed', 'burn', 'poison', 'atkDown', 'spdDown', 'stun', 'fear'].includes(k));
    if (skill.id === 'burn_brand') hitAdds.push('burnBrand');
    if (skill.target === 'all' || skill.target === 'allyAll') {
      const allTargetUids = targets.filter((t) => { const u = actorFromId(nb, t.uid); return u && u.hp > 0; }).map((t) => t.uid);
      nb = pushLog(nb, `${actor.name} 使用「${skill.name}」，${effectDesc}`, sideOf(actor), actor.uid, undefined, hitAdds.length > 0 ? hitAdds : undefined, allTargetUids);
    } else {
      const firstTarget = targets[0];
      if (firstTarget) {
        nb = pushLog(nb, `${actor.name} 使用「${skill.name}」，${firstTarget.name} ${effectDesc}`, sideOf(actor), actor.uid, firstTarget.uid, hitAdds.length > 0 ? hitAdds : undefined);
      }
    }
    if (skill.effects?.some(e => e.kind === 'burn' && e.value > 0)) nb = grantFlameRelay(nb, actor, targets);
  } else {
    const perTarget = new Map<string, number>();
    let waterWaveHits = 0;
    const brandedHits = new Set<string>();
    for (const t of targets) {
      perTarget.set(t.uid, (perTarget.get(t.uid) ?? 0) + 1);
    }
    let passiveStrippedTarget: string | undefined;
    let passiveBonusTarget: string | undefined;
    let passiveBurnBonus = 0;
    const stripPassive = getUnitPassive(actor, nb);
    if (skill.kind === 'attack' && stripPassive?.kind === 'burnStripShield' && !actor.burnStripUsed) {
      const target = [...perTarget.keys()].map((uid) => actorFromId(nb, uid)!)
        .filter((unit) => unit.hp > 0 && unit.isPlayer !== actor.isPlayer && isBurning(unit))
        .sort((a, c) => c.shield - a.shield)[0];
      if (target) {
        const burn = target.statuses.find(status => status.kind === 'burn')!.value;
        const stripLimit = stripPassive.burnStripCap === undefined ? stripPassive.value
          : Math.min(stripPassive.burnStripCap, stripPassive.value + burn);
        const amount = Math.min(stripLimit, target.shield);
        if (amount > 0) passiveStrippedTarget = target.uid;
        nb = replaceUnit(nb, { ...actorFromId(nb, actor.uid)!, burnStripUsed: true });
        const stripped = { ...target, shield: target.shield - amount };
        if (stripped.shield === 0) stripped.statuses = stripped.statuses.filter((status) => status.kind !== 'shield');
        nb = replaceUnit(nb, stripped);
        if (target.shield === 0) {
          passiveBonusTarget = target.uid;
          passiveBurnBonus = stripPassive.unshieldedBurnBonus ?? 0;
        }
        const msg = amount > 0 ? `${actor.name} 的「${stripPassive.name}」剥除 ${target.name} ${amount} 点护盾`
          : `${actor.name} 的「${stripPassive.name}」对 ${target.name} 本次命中额外附加灼烧 ${passiveBurnBonus} 层`;
        nb = pushLog(nb, msg, sideOf(actor), actor.uid, target.uid, undefined, undefined,
          spans(msg, [['actor', actor.name], ['passive', stripPassive.name], ['target', target.name]]));
      }
    }
    const isGroup = perTarget.size > 1;
    const waves = isGroup ? Math.max(...perTarget.values()) : 1;
    const shieldIgnore = new Map<string, number>();
    for (let hit = 0; hit < waves; hit++) {
      if (hit > 0 && (actorFromId(nb, actor.uid)!.hp <= 0 || checkEnd(nb).phase !== 'acting')) break;
      const reactions: AttackReactions = [];
      const groupStart = nb.log.length;
      for (const [uid, totalHits] of perTarget) {
        if (isGroup && hit >= totalHits) continue;
        const count = isGroup ? 1 : totalHits;
        let t = actorFromId(nb, uid);
        if (!t || t.hp <= 0) continue;
        let targetSkill = skill;
        if (skill.id === 'solar_strike') targetSkill = { ...skill, effects: [{ kind: 'burn', value: 2, turns: 2 }] };
        if (skill.id === 'sun_sunder') {
          const stripped = t.shield;
          t = { ...t, shield: 0, statuses: t.statuses.filter((status) => status.kind !== 'shield') };
          nb = replaceUnit(nb, t);
          if (stripped > 0) nb = pushLog(nb, `${actor.name} 的「掠日破盾」剥除 ${t.name} ${stripped} 点护盾`, sideOf(actor), actor.uid, t.uid);
          if (stripped > 0 || passiveStrippedTarget === uid) targetSkill = { ...skill, damage: (skill.damage ?? 4) + 4, effects: [{ kind: 'burn', value: 5, turns: 2 }] };
        }
        const branded = skill.kind === 'attack' && actor.isPlayer !== t.isPlayer
          && t.statuses.some((status) => status.kind === 'burnBrand' && status.sourceSide === sideOf(actor));
        const result = resolveAttack(nb, actor, t, targetSkill, count, foxBurnBonus,
          passiveBonusTarget === uid && hit === 0 ? passiveBurnBonus : 0,
          isGroup ? { reactions, hit, last: hit === totalHits - 1, shieldIgnore } : undefined);
        nb = result.battle;
        if (branded && result.lastHitLog !== undefined) brandedHits.add(uid);
        if (result.didPoison) {
          if (isGroup) reactions.push((state) => applyCorruptSpread(state, uid));
          else nb = applyCorruptSpread(nb, t.uid);
        }
        if (skill.id === 'water_wave' && hit === 0) waterWaveHits += 1;
      }
      if (isGroup) {
        // 连续随机攻击保留逐次命中的快照与动画；命中多个敌人不等于同时群攻。
        if (skill.target !== 'random' || (skill.hits ?? 1) <= 1) nb = sealSkillGroup(nb, groupStart);
        for (const react of reactions) {
          if (checkEnd(nb).phase !== 'acting') break;
          nb = react(nb);
        }
      }
    }
    // 零伤全体 debuff：推送一条合并日志，所有目标通过 burstTargets 同时触发 buff 图标
    if (skill.damage === 0 && skill.effects?.length && skill.target === 'all' && !isGroup) {
      const zeroDmgEnhanceLevel = getSkillEnhanceLevel(actor, actor.skills.indexOf(skill.id));
      const effectDesc = skill.effects.map((e) => {
        const val = e.value + getSkillEffectEnhanceBonus(skill.id, zeroDmgEnhanceLevel, e.kind);
        if (e.kind === 'poison') return `中毒 ${val} 层`;
        if (e.kind === 'burn') return `灼烧 ${val} 层`;
        if (e.kind === 'atkDown') return `降低攻击 ${val} 层`;
        if (e.kind === 'spdDown') return `降低速度 ${val} 层`;
        if (e.kind === 'stun') return '眩晕';
        if (e.kind === 'fear') return `恐惧 ${val} 层`;
        return e.kind;
      }).join('，');
      const hitAdds = (skill.effects ?? []).filter((e) => ['burn', 'poison', 'atkDown', 'stun', 'thorns', 'shadowMark'].includes(e.kind)).map((e) => e.kind);
      const allTargetUids = targets.filter((t) => { const u = actorFromId(nb, t.uid); return u && u.hp > 0; }).map((t) => t.uid);
      nb = pushLog(nb, `${actor.name} 使用「${skill.name}」，${effectDesc}`, sideOf(actor), actor.uid, undefined, hitAdds.length > 0 ? hitAdds : undefined, allTargetUids);
    }
    // 风灵闪：若自身速度高于目标，额外攻击一次（对每个目标独立判定，与主攻击完全一致）
    if (skill.id === 'wind_flash') {
      const freshActor = actorFromId(nb, actor.uid);
      if (freshActor && freshActor.hp > 0) {
        for (const t of targets) {
          const freshTarget = actorFromId(nb, t.uid);
          if (!freshTarget || freshTarget.hp <= 0) continue;
          if (getEffectiveSpd(freshActor) > getEffectiveSpd(freshTarget)) {
            const result = resolveAttack(nb, freshActor, freshTarget, skill, 1, foxBurnBonus);
            nb = result.battle;
            if (result.didPoison) nb = applyCorruptSpread(nb, freshTarget.uid);
          }
        }
      }
    }
    // 荆棘状态（debuff）：攻击者攻击时自身受到 value 点反伤，触发后立即消失
    {
      const curActor = actorFromId(nb, actor.uid);
      if (curActor && curActor.hp > 0) {
        const thornsIdx = curActor.statuses.findIndex((s) => s.kind === 'thorns');
        if (thornsIdx >= 0) {
          const thVal = curActor.statuses[thornsIdx].value;
          const cleanedStatuses = curActor.statuses.filter((_, i) => i !== thornsIdx);
          const damagedActor = { ...curActor, hp: Math.max(0, curActor.hp - thVal), statuses: cleanedStatuses };
          nb = replaceUnit(nb, damagedActor);
          nb = pushLog(nb, `${curActor.name} 的「荆棘」反噬，受到 ${thVal} 点伤害`, sideOf(curActor), undefined, curActor.uid);
        }
      }
    }
    for (const uid of brandedHits) nb = detonateBurnBrand(nb, actor, uid);
    // 疾风连携被动：攻击后自身速度 +1（可叠加，持续至战斗结束）
    {
      const curActor = actorFromId(nb, actor.uid);
      if (curActor && curActor.hp > 0) {
        const ap2 = getUnitPassive(curActor);
        if (ap2?.kind === 'spdOnAttack' || ap2?.kind === 'speedBonus') {
          const stacks = curActor.passiveSpdStacks ?? 0;
          const newBuffs = { ...curActor.battleBuffs, skillSpd: Math.min(5, (curActor.battleBuffs?.skillSpd ?? 0) + 1) };
          nb = replaceUnit(nb, { ...curActor, battleBuffs: newBuffs, passiveSpdStacks: stacks + 1 });
          nb = pushLog(nb, `${curActor.name} 的「疾风连携」速度 +1`, sideOf(curActor), curActor.uid, curActor.uid);
        }
      }
    }
    // 焚身爆：使用后自身损失 5 点生命（不可减免，不可被护盾抵消）
    if (skill.id === 'burn_burst') {
      const burnedActor = actorFromId(nb, actor.uid);
      if (burnedActor && burnedActor.hp > 0) {
        const newHp = Math.max(1, burnedActor.hp - 5);
        nb = replaceUnit(nb, { ...burnedActor, hp: newHp });
        const msgBB = `${burnedActor.name} 的「焚身爆」反噬，损失 5 点生命`;
        nb = pushLog(nb, msgBB, sideOf(burnedActor), burnedActor.uid, burnedActor.uid, undefined, undefined,
          spans(msgBB, [['actor', burnedActor.name], ['passive', '焚身爆'], ['damage', '5']]));
      }
    }
    // 归魂：使用后自身死亡（对全体敌人造成伤害后）
    if (skill.id === 'puppet_soul_return') {
      const soulActor = actorFromId(nb, actor.uid);
      if (soulActor && soulActor.hp > 0) {
        nb = replaceUnit(nb, { ...soulActor, hp: 0 });
        nb = pushLog(nb, `${soulActor.name} 使用「归魂」，自爆身亡！`, sideOf(soulActor), soulActor.uid, soulActor.uid);
      }
    }
    // 暗影追随：暗影之王击杀时，暗影仆从永久伤害 +1（须在暗影追猎 return 前执行）
    {
      const curActor = actorFromId(nb, actor.uid);
      if (curActor && curActor.hp > 0 && curActor.speciesId === 'boss_dark') {
        const anyKilled = targets.some((t) => {
          const fresh = actorFromId(nb, t.uid);
          return fresh && fresh.hp <= 0;
        });
        if (anyKilled) {
          const allies = (curActor.isPlayer ? nb.playerUnits : nb.enemyUnits).filter((u) => u.hp > 0);
          for (const ally of allies) {
            const ap2 = getUnitPassive(ally);
            if (ap2?.kind === 'shadowFollow') {
              const newBonus = (ally.passiveDmgBonus ?? 0) + ap2.value;
              nb = replaceUnit(nb, { ...ally, passiveDmgBonus: newBonus });
              nb = pushLog(nb, `${ally.name} 的「暗影追随」触发！永久伤害 +${ap2.value}`, sideOf(ally), ally.uid, ally.uid);
            }
          }
        }
      }
    }
    // 暗影追猎：击杀目标后立即获得一次额外行动（不标记 acted）
    {
      const curActor = actorFromId(nb, actor.uid);
      if (curActor && curActor.hp > 0) {
        const ap2 = getUnitPassive(curActor);
        if (ap2?.kind === 'shadowHunter') {
          const anyKilled = targets.some((t) => {
            const fresh = actorFromId(nb, t.uid);
            return fresh && fresh.hp <= 0;
          });
          if (anyKilled) {
            // 释放行动标记；技能次数和冷却仍正常消耗。
            nb = pushLog(nb, `${curActor.name} 的「暗影追猎」触发！击杀目标后获得额外行动`, sideOf(curActor), curActor.uid, curActor.uid);
            nb = consumeSkillUse(applySkillCooldown(nb, actor, skill), actor, skill.id);
            return replaceUnit(nb, { ...actorFromId(nb, actor.uid)!, acted: false });
          }
        }
      }
    }
    // 幽爆：使用后自身立即死亡（自爆对全体敌人造成伤害后）
    if (skill.id === 'ghost_burst') {
      const burstActor = actorFromId(nb, actor.uid);
      if (burstActor && burstActor.hp > 0) {
        nb = replaceUnit(nb, { ...burstActor, hp: 0 });
        nb = pushLog(nb, `${burstActor.name} 使用「幽爆」，自爆身亡！`, sideOf(burstActor), burstActor.uid, burstActor.uid);
        // 灵魂链接：死亡时为幽灵船长+1灵魂
        const bp = getUnitPassive(burstActor);
        if (bp?.kind === 'ghostSoul') {
          const allies = burstActor.isPlayer ? nb.playerUnits : nb.enemyUnits;
          const ghostCaptain = allies.find((u) => u.speciesId === 'boss_ghost' && u.hp > 0);
          if (ghostCaptain) {
            const curSoul = ghostCaptain.soul ?? 0;
            if (curSoul < 20) {
              const newSoul = Math.min(20, curSoul + 1);
              nb = replaceUnit(nb, { ...ghostCaptain, soul: newSoul });
              nb = pushLog(nb, `${burstActor.name} 的「灵魂链接」触发！${ghostCaptain.name} 获得 1 个灵魂（共 ${newSoul}）`, sideOf(ghostCaptain), ghostCaptain.uid, ghostCaptain.uid);
            }
          }
        }
      }
    }
    // 攻击技能附带自愈：水波冲击按命中人数回血，其他技能按固定值回血
    const healAmt = skill.id === 'water_wave' ? waterWaveHits : (skill.heal ?? 0);
    if (healAmt > 0) {
      const healedActor = actorFromId(nb, actor.uid);
      if (healedActor && healedActor.hp > 0) {
        const maxHp = getEffectiveMaxHp(healedActor);
        const totalHeal = healAmt + mossHealBonus(nb, actor, healedActor);
        const healed = { ...healedActor, hp: Math.min(maxHp, healedActor.hp + totalHeal) };
        nb = replaceUnit(nb, healed);
        nb = pushLog(nb, `${actor.name} 使用「${skill.name}」恢复 ${totalHeal} 点生命`, sideOf(actor), actor.uid, actor.uid);
        nb = cleanseMossAfterHeal(nb, actor, actor.uid);
      }
    }
  }
  const harmonyActor = actorFromId(nb, actor.uid);
  if (harmonyActor && harmonyActor.hp > 0 && getUnitPassive(harmonyActor, nb)?.kind === 'harmony') {
    let current = harmonyActor;
    if (skill.kind === 'attack' && current.harmonyAttackRound !== nb.round) {
      const amount = Math.min(2, 99 - current.shield);
      current = { ...current, shield: current.shield + amount, harmonyAttackRound: nb.round };
      nb = replaceUnit(nb, current);
      nb = pushLog(nb, `${current.name} 的「攻守调和」获得 ${amount} 点护盾`, sideOf(current), current.uid, current.uid);
    }
    if ((skill.kind === 'buff' || skill.effects?.some(e => e.kind === 'shield')) && current.harmonyBuffRound !== nb.round) {
      current = { ...current, harmonyCharged: true, harmonyBuffRound: nb.round };
      nb = replaceUnit(nb, current);
      nb = pushLog(nb, `${current.name} 的「攻守调和」蓄势，下次攻击首次命中伤害+2`, sideOf(current), current.uid, current.uid);
    }
  }
  // 记录上一回合使用的技能（敌方 AI 用于降低连续重复使用概率）
  const updatedActor = actorFromId(nb, actor.uid);
  if (updatedActor && !updatedActor.isPlayer) {
    nb = replaceUnit(nb, { ...updatedActor, lastSkillId: skill.id });
  }
  return markActed(consumeSkillUse(applySkillCooldown(nb, actor, skill), actor, skill.id), actor.uid);
}

/** 我方回溯暂停结算并重新选择；敌方由AI选择额外行动。 */
function resolveRewindActions(b: BattleState): BattleState {
  let nb = b;
  while (nb.phase === 'acting') {
    const unit = [...nb.playerUnits, ...nb.enemyUnits].find(u => u.hp > 0 && u.timeRewindExtraPending);
    if (!unit) break;
    const acted = unit.acted;
    nb = replaceUnit(nb, { ...unit, acted: false, timeRewindExtraPending: undefined, timeRewindRound: nb.round });
    if (unit.isPlayer) {
      const order = nb.orders?.[unit.uid];
      const { [unit.uid]: removed, ...orders } = nb.orders ?? {};
      return { ...nb, orders, rewindChoice: { uid: unit.uid, acted, order } };
    }
    nb = enemyAct(nb, actorFromId(nb, unit.uid)!);
    nb = replaceUnit(nb, { ...actorFromId(nb, unit.uid)!, acted });
    nb = checkEnd(nb);
  }
  return nb;
}

function finishRewindChoice(b: BattleState, skillId?: string, targetUid?: string): BattleState {
  const choice = b.rewindChoice!;
  let nb: BattleState = { ...b, rewindChoice: undefined };
  if (skillId) nb = useSkillInner(nb, actorFromId(nb, choice.uid)!, getSkill(skillId), targetUid);
  nb = replaceUnit(nb, { ...actorFromId(nb, choice.uid)!, acted: choice.acted });
  const orders = { ...(nb.orders ?? {}) };
  if (choice.order) orders[choice.uid] = choice.order;
  else delete orders[choice.uid];
  nb = checkEnd({ ...nb, orders });
  if (nb.phase !== 'acting') return nb;
  if (choice.nextRound !== undefined) {
    nb = resolveRewindActions(nb);
    if (nb.rewindChoice) return { ...nb, rewindChoice: { ...nb.rewindChoice, nextRound: choice.nextRound } };
    return checkEnd(finishRoundStart({ ...nb, round: choice.nextRound }));
  }
  return playerEndTurn(nb);
}

/** 结束指令阶段并统一结算：敌我所有存活单位按速度依次行动，随后进入新回合 */
export function playerEndTurn(b: BattleState): BattleState {
  if (b.rewindChoice) return b;
  const resume = b.rewindResume;
  if (b.phase !== 'acting') return b;
  // 车轮战：场上一方全灭待换人——先等替补动画播完（GAUNTLET_SWAP）再结算/开新回合，避免在空场上重复结算
  if (b.pendingSwap?.player || b.pendingSwap?.enemy) return b;
  let nb: BattleState = { ...b };
  // 预选敌方行动：基于回合开始时的快照状态，一次性预选所有可行动敌人的行动
  const snapshot = nb;
  for (const eu of resume ? [] : nb.enemyUnits) {
    if (eu.hp <= 0 || eu.acted) continue;
    if (eu.statuses.some((s) => s.kind === 'stun')) continue;
    const rngVal1 = createRng((snapshot.seed + nb.rngCount * 7919) >>> 0)();
    const rngVal2 = createRng((snapshot.seed + (nb.rngCount + 1) * 7919) >>> 0)();
    const decision = selectEnemyAction({ ...snapshot, orders: nb.orders }, eu, rngVal1, rngVal2);
    if (decision && decision.skillId && decision.kind !== 'swap') {
      const order: PlayerOrder = { skillId: decision.skillId, targetUid: decision.targetUid, kind: decision.kind, fallbackSkillId: decision.fallbackSkillId };
      nb = { ...nb, orders: { ...(nb.orders ?? {}), [eu.uid]: order } };
      nb = { ...nb, rngCount: nb.rngCount + 2 };
    }
  }
  // 预选完成后重新计算回合顺序：orders 已填充所有敌方指令，computeTurnOrder 会据此排序
  nb = { ...nb, rewindResume: undefined, turnOrder: resume ? nb.turnOrder : computeTurnOrder(nb) };
  // 回合结算：所有存活单位（敌我混排）按速度统一行动——
  // 我方执行已下达的指令，敌方执行预选指令；未下指令的我方单位本回合不出手。
  // 使用索引循环以支持「暗影追猎」击杀后再行动（不标记 acted 的单位需重新处理）
  let turnIdx = resume?.index ?? 0;
  const extraActionCount: Record<string, number> = resume?.extraActions ?? {};
  const MAX_EXTRA_ACTIONS = 5;
  while (turnIdx < (nb.turnOrder ?? []).length) {
    nb = resolveRewindActions(nb);
    if (nb.rewindChoice) return { ...nb, rewindResume: { index: turnIdx, extraActions: extraActionCount } };
    // 只移动尚未执行的队列后缀；已行动目标不会因时滞重复出手。
    const remaining = nb.turnOrder.slice(turnIdx);
    const delayed = (uid: string) => actorFromId(nb, uid)?.statuses.some(s => s.kind === 'timeLag' && s.appliedRound === nb.round) ?? false;
    remaining.sort((a, c) => Number(delayed(a)) - Number(delayed(c)));
    nb = { ...nb, turnOrder: [...nb.turnOrder.slice(0, turnIdx), ...remaining] };
    const uid = (nb.turnOrder ?? [])[turnIdx];
    if (nb.phase !== 'acting') break;
    const unit = actorFromId(nb, uid);
    if (!unit || unit.hp <= 0) { turnIdx++; continue; }
    if (unit.isPlayer) {
      const order = nb.orders?.[uid];
      if (getUnitPassive(unit)?.kind === 'mirrorCopy' && (!order || order.skillId === 'mirror_copy')
        && (!unit.acted || order?.skillId === 'mirror_copy')) {
        nb = useSkillInner(nb, unit, getSkill('mirror_copy'));
        turnIdx++;
        nb = checkEnd(nb);
        continue;
      }
      if (order) {
        if (order.skillId === REST_SKILL_ID) {
          // 休息：放弃本回合基础行动。
        } else {
          // useSkillInner 末尾已含 consumeSkillUse + markActed，这里不再重复扣减
          const skillId = !extraActionCount[uid] || canUnitUseSkill(unit, order.skillId, nb) ? order.skillId
            : unit.skills.find((id) => getSkill(id).kind === 'attack' && canUnitUseSkill(unit, id, nb));
          nb = skillId ? useSkillInner(nb, unit, getSkill(skillId), order.targetUid) : markActed(nb, uid);
          const reUnit = actorFromId(nb, uid);
          if (reUnit && reUnit.hp > 0 && !reUnit.acted) {
            extraActionCount[uid] = (extraActionCount[uid] ?? 0) + 1;
            nb = checkEnd(nb);
            if (extraActionCount[uid] < MAX_EXTRA_ACTIONS && nb.phase === 'acting') continue;
            nb = markActed(nb, uid);
          }
        }
      }
      turnIdx++;
      nb = checkEnd(nb);
    } else {
      // 车轮战：上一只阵亡后刚切入场的敌方替补本回合不出手，等下回合（startRound 重置 acted）再行动；
      // 眩晕单位仍走 enemyAct 正常打出「被眩晕」日志（startRound 也把它们标记为 acted）
      if (unit.acted && !unit.statuses.some((s) => s.kind === 'stun')) { turnIdx++; continue; }
      const eOrder = nb.orders?.[uid];
      if (nb.testEnemyInactive) {
        nb = markActed(nb, uid);
      } else if (eOrder?.skillId) {
        // 使用预选指令执行敌方行动
        const skill = getSkill(eOrder.skillId);
        if (skill) {
          if (eOrder.kind === 'swap') {
            const swapped = tryEnemySwap(nb, unit);
            if (swapped) {
              nb = swapped;
            } else if (eOrder.fallbackSkillId) {
              nb = useSkillInner(nb, unit, getSkill(eOrder.fallbackSkillId), undefined);
            } else {
              nb = markActed(pushLog(nb, `${unit.name} 换位失败`, sideOf(unit)), uid);
            }
          } else {
            nb = useSkillInner(nb, unit, skill, eOrder.targetUid);
          }
        } else {
          nb = enemyAct(nb, unit);
        }
      } else {
        nb = enemyAct(nb, unit);
      }
      // 暗影追猎：useSkillInner 返回后若该单位仍「未行动」（跳过了 markActed），说明触发了额外行动，
      // 不递增 turnIdx，立即重处理该单位（再执行一轮 AI），但限制连续额外行动次数防止无限循环
      const reUnit = actorFromId(nb, uid);
      if (reUnit && reUnit.hp > 0 && !reUnit.acted) {
        // 额外行动重新选择 AI 指令，避免重复执行已耗尽次数或进入冷却的技能。
        const { [uid]: _previousOrder, ...remainingOrders } = nb.orders ?? {};
        nb = { ...nb, orders: remainingOrders };
        extraActionCount[uid] = (extraActionCount[uid] ?? 0) + 1;
        if (extraActionCount[uid] >= MAX_EXTRA_ACTIONS) {
          nb = markActed(nb, uid);
          turnIdx++;
        }
        nb = checkEnd(nb);
        if (nb.phase !== 'acting') break;
        continue;
      }
      turnIdx++;
      nb = checkEnd(nb);
    }
  }
  nb = resolveRewindActions(nb);
  if (nb.rewindChoice) return { ...nb, rewindResume: { index: turnIdx, extraActions: extraActionCount } };
  nb = { ...nb, orders: {} };
  if (nb.phase !== 'acting') return nb;
  // 车轮战：结算中一方全灭待换人 → 不开新回合，等死亡动画播完由 GAUNTLET_SWAP 换人
  if (nb.pendingSwap?.player || nb.pendingSwap?.enemy) return nb;
  nb = startRound(nb);
  return checkEnd(nb);
}

/** 即时操作只检查胜负，指令仍等待玩家点击结束回合后统一结算。 */
function afterPlayerAction(b: BattleState): BattleState {
  if (b.phase !== 'acting') return b;
  b = checkEnd(b);
  if (b.phase !== 'acting') return b;
  return b;
}

/** 每只宠物保留一条基础行动指令；结算前可修改或取消，不立即执行。 */
export function playerSkill(b: BattleState, actorUid: string, skillId: string, targetUid?: string): BattleState {
  if (b.rewindChoice && b.rewindChoice.uid !== actorUid) return b;
  if (b.phase !== 'acting') return b;
  const actor = b.playerUnits.find((u) => u.uid === actorUid);
  if (!actor || actor.hp <= 0) return b;
  if (actor.statuses.some((s) => s.kind === 'stun')) return b;
  if (!canUnitUseSkill(actor, skillId, b)) return b;
  const skill = getSkill(skillId);
  // 治疗等 ally 技能只能指定己方单位；非法目标直接拒绝，避免结算时静默回退成治疗自己
  if (skillId === 'flame_tracing_feather' && !flameTracingTargets(b, actor).some((unit) => unit.uid === targetUid)) return b;
  if (skill.target === 'ally' && targetUid && !b.playerUnits.some((u) => u.uid === targetUid)) return b;
  if (skillId === 'furnace_shell' && !furnaceShellTargets(b, actor).some((unit) => unit.uid === targetUid)
    && !(targetUid === undefined && furnaceShellTargets(b, actor).every((unit) => unit.uid === actor.uid))) return b;
  if (requiresBurningTarget(skillId) && !stokeFireTargets(b, actor, skillId).some((unit) => unit.uid === targetUid)) return b;
  // allyAll 不需要选择目标，跳过 targetUid 校验
  if (b.rewindChoice) return finishRewindChoice(b, skillId, targetUid);
  const curOrder = b.orders?.[actorUid];
  // 换位已实际占用行动，不能再下指令；尚未执行的技能或休息指令可以替换。
  if (actor.acted && !curOrder) return b;
  return {
    ...b,
    playerUnits: b.playerUnits.map((u) => (u.uid === actorUid ? { ...u, acted: true } : u)),
    orders: { ...(b.orders ?? {}), [actorUid]: { skillId, targetUid } },
  };
}

/** 玩家行动：让一只宠物放弃本回合基础行动，记入休息指令（可再次点击取消）。 */
export function playerRest(b: BattleState, actorUid: string): BattleState {
  if (b.rewindChoice) return b.rewindChoice.uid === actorUid ? finishRewindChoice(b) : b;
  if (b.phase !== 'acting') return b;
  const actor = b.playerUnits.find((u) => u.uid === actorUid);
  if (!actor || actor.hp <= 0) return b;
  if (actor.statuses.some((s) => s.kind === 'stun')) return b;
  const curOrder = b.orders?.[actorUid];
  // 已有技能指令：与休息互斥，保持原指令
  if (curOrder && curOrder.skillId !== REST_SKILL_ID) return b;
  // 已选择休息：再次点击取消，恢复待命。
  if (curOrder) {
    const { [actorUid]: _removed, ...restOrders } = b.orders ?? {};
    return {
      ...b,
      playerUnits: b.playerUnits.map((u) => (u.uid === actorUid ? { ...u, acted: false } : u)),
      orders: restOrders,
    };
  }
  // 本回合已被即时行动（换位）占用：不能再休息
  if (actor.acted) return b;
  return {
    ...b,
    playerUnits: b.playerUnits.map((u) => (u.uid === actorUid ? { ...u, acted: true } : u)),
    orders: { ...(b.orders ?? {}), [actorUid]: { skillId: REST_SKILL_ID } },
  };
}

/** 取消尚未执行的技能指令，恢复待命。休息指令请用 playerRest 取消。 */
export function playerCancelOrder(b: BattleState, actorUid: string): BattleState {
  if (b.phase !== 'acting') return b;
  const order = b.orders?.[actorUid];
  if (!order || order.skillId === REST_SKILL_ID) return b;
  const actor = b.playerUnits.find((u) => u.uid === actorUid);
  if (!actor || actor.hp <= 0) return b;
  const { [actorUid]: _removed, ...restOrders } = b.orders ?? {};
  return {
    ...b,
    playerUnits: b.playerUnits.map((u) => (u.uid === actorUid ? { ...u, acted: false } : u)),
    orders: restOrders,
  };
}

/** 交换己方两只宠物的位置，仅占用发起者本回合的基础行动。 */
export function playerSwap(b: BattleState, actorUid: string, otherUid: string): BattleState {
  if (b.phase !== 'acting') return b;
  const actor = b.playerUnits.find((u) => u.uid === actorUid);
  const other = b.playerUnits.find((u) => u.uid === otherUid);
  if (!actor || !other || actor.uid === other.uid) return b;
  if (actor.hp <= 0 || other.hp <= 0) return b;
  if (actor.acted) return b;
  if (actor.statuses.some((s) => s.kind === 'stun')) return b;
  let nb = swapUnits(b, actor.uid, other.uid);
  nb = markActed(nb, actor.uid);
  nb = pushLog(nb, `${actor.name} 与 ${other.name} 交换了位置`, 'player');
  return afterPlayerAction(nb);
}

/** 计算对某敌人使用某食物的捕捉概率（0..1）。不含 1 血/圣果的必定成功判定，由调用方另行判断。 */
export function tameChance(enemy: Unit, foodId: string, relics?: readonly string[]): number {
  const food = getFood(foodId);
  const species = getMonster(enemy.speciesId);
  if (food.guaranteed) return 1;
  if (food.baseTame <= 0 || species.rank > 3) return 0;
  const basePercent = 60 - species.rank * 10;
  const foodBonus = Math.round(food.baseTame * (relics?.includes('horn_of_plenty') ? 1.1 : 1) * 100) - 60;
  const hpBonus = 15 * Math.max(0, 1 - enemy.hp / enemy.maxHp / TAME_THRESHOLD);
  const failBonus = Math.min(enemy.tameFails ?? 0, 2) * TAME_FAIL_BONUS * 100;
  return Math.min(basePercent + 35, basePercent + foodBonus + hpBonus + failBonus) / 100;
}

/** 喂食驯服不占用宠物行动。每次失败提高后续捕捉概率；残血到 1 点时必定捕捉。 */
export function playerTame(b: BattleState, foodId: string, enemyUid: string): BattleState {
  if (b.phase !== 'acting') return b;
  const enemy = b.enemyUnits.find((u) => u.uid === enemyUid);
  if (!enemy || enemy.hp <= 0) return b;
  if (!enemy.tameable) {
    return pushLog(b, `${enemy.name} 不是可驯服的对手`, 'enemy');
  }
  if (enemy.hp / enemy.maxHp > TAME_THRESHOLD) {
    return pushLog(b, `${enemy.name} 生命值过高，无法驯服`, 'enemy');
  }
  const food = getFood(foodId);
  const chance = tameChance(enemy, foodId, b.relics);
  // 驯服尝试计数 +1；圣果使用计数
  const nb0 = { ...b, tameAttempts: (b.tameAttempts ?? 0) + 1, 圣果Used: (b.圣果Used ?? 0) + (foodId === 'golden_fruit' ? 1 : 0) };

  const nb = useRng(nb0, (rng, nb2) => {
    const guaranteed = enemy.hp === 1 || food.guaranteed;
    const success = guaranteed ? true : rng < chance;
    let after: BattleState = nb2;
    if (success) {
      const tamed = makeUnit(enemy.speciesId, true, 2, false);
      tamed.tamedOrigin = true;
      after = {
        ...nb2,
        enemyUnits: nb2.enemyUnits.filter((u) => u.uid !== enemyUid),
        pendingTame: [...nb2.pendingTame, tamed],
      };
      after = pushLog(
        after,
        enemy.hp === 1 ? `${enemy.name} 已是强弩之末，被成功驯服！已加入队伍预备役` : `${enemy.name} 被成功驯服！已加入队伍预备役`,
        'enemy',
        undefined, undefined, undefined, undefined,
        spans(enemy.hp === 1 ? `${enemy.name} 已是强弩之末，被成功驯服！已加入队伍预备役` : `${enemy.name} 被成功驯服！已加入队伍预备役`,
          [['target', enemy.name], ['item', '驯服']]),
        undefined, { targetUid: enemyUid, foodId, success: true },
      );
    } else {
      after = {
        ...nb2,
        enemyUnits: nb2.enemyUnits.map((u) => (u.uid === enemy.uid ? { ...u, tameFails: (u.tameFails ?? 0) + 1 } : u)),
      };
      const msgFail = `喂食${food.name}失败，${enemy.name} 抵抗了驯服（下次捕捉概率提高）`;
      after = pushLog(after, msgFail, 'enemy', undefined, undefined, undefined, undefined,
        spans(msgFail, [['item', food.name], ['target', enemy.name]]), undefined, { targetUid: enemyUid, foodId, success: false });
    }
    return after;
  });
  if (nb.rngCount === b.rngCount) return b;
  return afterPlayerAction(nb);
}

/** 第一个尚未行动的存活玩家单位（供 UI 高亮/测试使用；新模型下玩家自由选择，此函数仅为辅助） */
export function currentPlayerUnit(b: BattleState): Unit | undefined {
  return b.playerUnits.find((u) => u.hp > 0 && !u.acted);
}

/** 本回合玩家可操作的存活单位（未行动、未眩晕） */
export function getActablePlayerUnits(b: BattleState): Unit[] {
  if (b.phase !== 'acting') return [];
  return b.playerUnits.filter((u) => u.hp > 0 && !u.acted && !u.statuses.some((s) => s.kind === 'stun'));
}

export function isTameable(enemy: Unit): boolean {
  return enemy.tameable && enemy.hp > 0 && enemy.hp / enemy.maxHp <= TAME_THRESHOLD;
}

/** 玩家是否还有未下令、且可行动的宠物。 */
export function playerHasMove(b: BattleState): boolean {
  return b.phase === 'acting' && getActablePlayerUnits(b).length > 0;
}

/** 战斗药水临时效果键 */
type BuffKey = 'atkUp' | 'spdUp' | 'hpUp' | 'atkDown' | 'spdDown' | 'hpDown';

const BUFF_MAP: Record<string, BuffKey> = {
  atk_up: 'atkUp',
  spd_up: 'spdUp',
  hp_up: 'hpUp',
  atk_down: 'atkDown',
  spd_down: 'spdDown',
  hp_down: 'hpDown',
};

const BUFF_DURATION = 2; // 持续 2 回合

/** 使用战斗药水：给指定单位加buff/debuff，不占用宠物行动。 */
export function useBattleItem(b: BattleState, itemId: string, targetUid: string): BattleState {
  if (b.phase !== 'acting') return b;
  const key = BUFF_MAP[itemId];
  if (!key) return b;

  const target = [...b.playerUnits, ...b.enemyUnits].find((u) => u.uid === targetUid);
  if (!target) return b;

  const isPlayer = target.isPlayer;
  // 验证目标合法性：己方增益只能用于我方，敌方减益只能用于敌方
  const isBuff = ['atkUp', 'spdUp', 'hpUp'].includes(key);
  const isDebuff = ['atkDown', 'spdDown', 'hpDown'].includes(key);
  if ((isBuff && !isPlayer) || (isDebuff && isPlayer)) return b;
  if (!isPlayer && b.corruptDebuff === 'immune' && (key === 'atkDown' || key === 'spdDown')) {
    return pushLog(b, `${target.name} 免疫负面效果，未消耗药水`, 'enemy', undefined, target.uid);
  }

  const nb = useRng(b, (_rngVal, nb2) => {
    const t = [...nb2.playerUnits, ...nb2.enemyUnits].find((u) => u.uid === targetUid);
    if (!t) return nb2;

    // 生命药水/腐蚀药水即时生效，不加入持续buff
    if (key === 'hpUp') {
      const maxHp = getEffectiveMaxHp(t);
      const heal = Math.round(maxHp * 0.5);
      const healedUnit = { ...t, hp: Math.min(maxHp, t.hp + heal) };
      const newUnits = [...nb2.playerUnits, ...nb2.enemyUnits].map((u) => (u.uid === targetUid ? healedUnit : u));
      return pushLog(
        {
          ...nb2,
          playerUnits: newUnits.filter((u) => u.isPlayer),
          enemyUnits: newUnits.filter((u) => !u.isPlayer),
        },
        `对 ${t.name} 使用道具：回复 50% 生命`,
        sideOf(t),
      );
    }
    if (key === 'hpDown') {
      // 对 boss 使用腐蚀药水：造成已损失生命值 30% 的伤害（至少 10 点）
      if (t.speciesId.startsWith('boss_')) {
        const maxHp = getEffectiveMaxHp(t);
        const lostHp = maxHp - t.hp;
        const dmg = Math.max(5, Math.round(lostHp * 0.3));
        const hitUnit = { ...t, hp: Math.max(1, t.hp - dmg) };
        const newUnits = [...nb2.playerUnits, ...nb2.enemyUnits].map((u) => (u.uid === targetUid ? hitUnit : u));
        return pushLog(
          {
            ...nb2,
            playerUnits: newUnits.filter((u) => u.isPlayer),
            enemyUnits: newUnits.filter((u) => !u.isPlayer),
          },
          `对 ${t.name} 使用道具：造成 ${dmg} 点伤害（已损失生命×30%）`,
          sideOf(t),
        );
      }
      // 腐蚀药水：当前生命 -30%（至少保留 1 血，不直接致死）
      const hit = Math.max(1, Math.round(t.hp * 0.7));
      const hitUnit = { ...t, hp: Math.max(1, hit) };
      const newUnits = [...nb2.playerUnits, ...nb2.enemyUnits].map((u) => (u.uid === targetUid ? hitUnit : u));
      return pushLog(
        {
          ...nb2,
          playerUnits: newUnits.filter((u) => u.isPlayer),
          enemyUnits: newUnits.filter((u) => !u.isPlayer),
        },
        `对 ${t.name} 使用道具：当前生命 -30%`,
        sideOf(t),
      );
    }

    const unitBuffs = { ...(t.battleBuffs ?? {}) };
    unitBuffs[key] = BUFF_DURATION;

    const effectDesc: Record<string, string> = {
      atkUp: '伤害 +2',
      spdUp: '速度 +2',
      hpUp: '回复 50% 生命',
      atkDown: '伤害 -2',
      spdDown: '速度 -2',
      hpDown: '当前生命 -30%',
    };

    const newUnits = [...nb2.playerUnits, ...nb2.enemyUnits].map((u) => (u.uid === targetUid ? { ...u, battleBuffs: unitBuffs } : u));

    return pushLog(
      {
        ...nb2,
        playerUnits: newUnits.filter((u) => u.isPlayer),
        enemyUnits: newUnits.filter((u) => !u.isPlayer),
      },
      `对 ${t.name} 使用道具：${effectDesc[key]}（持续 ${BUFF_DURATION} 回合）`,
      sideOf(t),
    );
  });
  if (nb.rngCount === b.rngCount) return b;
  return afterPlayerAction(nb);
}

/** 回合开始时递减所有单位的战斗药水效果回合数 */
export function decrementBattleBuffs(b: BattleState): BattleState {
  let changed = false;
  const newUnits = [...b.playerUnits, ...b.enemyUnits].map((u) => {
    if (!u.battleBuffs) return u;
    const next: Record<string, number> = {};
    let unitChanged = false;
    for (const [k, v] of Object.entries(u.battleBuffs)) {
      // skillSpd 为永久速度加成，不递减
      if (k === 'skillSpd') { next[k] = v; continue; }
      if (v > 1) {
        next[k] = v - 1;
        unitChanged = true;
      }
    }
    if (unitChanged) {
      changed = true;
      return { ...u, battleBuffs: next as Unit['battleBuffs'] };
    }
    if (Object.keys(next).length === 0) {
      changed = true;
      return { ...u, battleBuffs: undefined };
    }
    return u;
  });

  return changed
    ? { ...b, playerUnits: newUnits.filter((u) => u.isPlayer), enemyUnits: newUnits.filter((u) => !u.isPlayer) }
    : b;
}

/** 获取单位的固定伤害修正（诅咒虚弱 + 技能 atkUp/atkDown 状态 + 战斗药水 battleBuffs + 被动，整数） */
export function getDamageBonus(u: Unit, b?: BattleState): number {
  let bonus = 0;
  if (u.curse === 'atkDown') bonus -= 2;
  for (const s of u.statuses) {
    if (s.kind === 'atkUp') bonus += s.value;
    else if (s.kind === 'atkDown') bonus -= s.value;
    else if (s.kind === 'rageThorn') bonus += s.value;
  }
  if (u.battleBuffs) {
    if (u.battleBuffs.atkUp) bonus += 2;
    if (u.battleBuffs.atkDown) bonus -= 2;
  }
  const p = getUnitPassive(u, b);
  if (p?.kind === 'power') bonus += p.value;
  if ((b ? actorFromId(b, u.uid)?.shield ?? u.shield : u.shield) > 0) bonus += p?.shieldDamageBonus ?? 0;
  if (p?.kind === 'foxFlame' && foxFireLayers(u) >= p.value) bonus += p.fullFoxDamage ?? 0;
  if (p?.kind === 'frenzy' && u.hp / u.maxHp < 0.5) bonus += p.value;
  // 熔火狂暴：伤害 +1（与 scorch 3 叠加构成爆发形态）
  if (p?.id === 'fire_rage') bonus += 1;
  // 暗影追随：永久伤害加成
  if (u.passiveDmgBonus) bonus += u.passiveDmgBonus;
  // 灵魂汲取：阶梯式伤害加成（5灵魂+2，20灵魂+3，共+5）
  if (p?.kind === 'soulSiphon' && u.soul) {
    if (u.soul >= 20) bonus += 5;
    else if (u.soul >= 5) bonus += 2;
  }
  return bonus;
}

/** 获取单位的伤害减免（被动守护 + 水幕，整数） */
export function getDamageGuard(u: Unit, b?: BattleState): number {
  let guard = b && u.reactiveGuardRound === b.round ? 1 : 0;
  const p = getUnitPassive(u, b);
  if (p?.kind === 'guard') {
    // 寄居壳：巨蟹在场时减伤提升至2
    if (p.id === 'shell_guard' && b) {
      const allies = u.isPlayer ? b.playerUnits : b.enemyUnits;
      const crabAlive = allies.some((a) => a.speciesId === 'boss_crab' && a.hp > 0);
      guard += crabAlive ? 2 : 1;
    } else {
      guard += p.value;
    }
  }
  // 水幕：减少伤害 value
  const wc = u.statuses.find((s) => s.kind === 'waterCurtain');
  if (wc) guard += wc.value;
  // 孢子防护：减少伤害 value
  const sporeShield = u.statuses.find((s) => s.kind === 'sporeShield');
  if (sporeShield) guard += sporeShield.value;
  // 锁链锚定：被锁链连接时减伤
  if (p?.kind === 'chainAnchor' && u.statuses.some((s) => s.kind === 'chainLink')) {
    guard += p.value;
  }
  // 成长值：每5成长值受伤-1（最多-5）
  if (p?.kind === 'growthValue' && u.growthValue) {
    guard += Math.min(5, Math.floor(u.growthValue / 5));
  }
  return guard;
}

/** 获取单位当前恐惧层数 */
export function getFearStacks(u: Unit): number {
  return u.statuses.filter((s) => s.kind === 'fear').reduce((sum, s) => sum + s.value, 0);
}

/** 给单位附加恐惧（value 层，无持续回合限制），≥6 层触发恐惧震慑 + 清除所有恐惧 */
export function applyFear(b: BattleState, target: Unit, value: number): BattleState {
  if (!target.isPlayer && b.corruptDebuff === 'immune') return pushLog(b, `${target.name} 免疫负面效果：恐惧无效`, sideOf(target), undefined, target.uid);
  const curFear = getFearStacks(target);
  const newFear = curFear + value;
  // 合并为单一条目（类似灼烧/中毒）
  let updatedTarget = { ...target };
  const fearIdx = updatedTarget.statuses.findIndex((s) => s.kind === 'fear');
  const nextStatuses = [...updatedTarget.statuses];
  if (fearIdx >= 0) {
    nextStatuses[fearIdx] = { ...nextStatuses[fearIdx], value: newFear };
  } else {
    nextStatuses.push({ kind: 'fear' as const, value: newFear, turns: 99 });
  }
  updatedTarget = { ...updatedTarget, statuses: nextStatuses };
  let nb = replaceUnit(b, updatedTarget);
  // 恐惧≥6层：先推一条日志记录 fear=6 的快照，再触发震慑
  if (newFear >= 6) {
    nb = pushLog(nb, `${target.name} 恐惧达到 ${newFear} 层`, sideOf(target), target.uid, target.uid, undefined, undefined,
      spans(`${target.name} 恐惧达到 ${newFear} 层`, [['target', target.name], ['status', `恐惧 ${newFear} 层`]]));
    const clearedTarget = { ...updatedTarget, statuses: nextStatuses.filter((s) => s.kind !== 'fear').concat([{ kind: 'stun' as const, value: 1, turns: 1 }]) };
    nb = replaceUnit(nb, clearedTarget);
    nb = pushLog(nb, `${target.name} 恐惧震慑！无法行动 1 回合`, sideOf(target), target.uid, target.uid, undefined, undefined,
      spans(`${target.name} 恐惧震慑！无法行动 1 回合`, [['target', target.name], ['status', '恐惧震慑']]));
  }
  return nb;
}

/** 获取单位的有效速度（含临时buff，整数） */
export function getEffectiveSpd(u: Unit): number {
  let spd = u.spd;
  if (u.battleBuffs?.spdUp) spd += 2;
  if (u.battleBuffs?.skillSpd) spd += u.battleBuffs.skillSpd;
  if (u.battleBuffs?.spdDown) spd -= 2;
  // 状态效果减速（弱化技能）
  const spdDownStatus = u.statuses.find((s) => s.kind === 'spdDown');
  if (spdDownStatus) spd -= spdDownStatus.value;
  // 风羽状态：速度 +value
  const windSpdStatus = u.statuses.find((s) => s.kind === 'windSpd');
  if (windSpdStatus) spd += windSpdStatus.value;
  return Math.max(1, spd);
}

/** 获取单位的有效最大生命（含临时buff） */
export function getEffectiveMaxHp(u: Unit): number {
  return u.maxHp;
}

/**
 * 把一次技能的多次命中（连击）拆成多段伤害：总和不变、每段 ≥ 1（防御性兜底），
 * 供战斗引擎逐段写日志、动画逐段显示飘字（如 8 拆成 4+4）。
 */
export function splitDamage(total: number, hits: number): number[] {
  if (hits <= 1) return [total];
  if (total <= 0) return Array.from({ length: hits }, () => 0);
  const base = Math.floor(total / hits);
  const rem = total - base * hits;
  if (base < 1) {
    // 总伤小于段数：前 total 段各 1，其余为 0（0 段不产生飘字/日志）
    return Array.from({ length: hits }, (_, i) => (i < total ? 1 : 0));
  }
  const segs = Array.from({ length: hits }, () => base);
  for (let i = 0; i < rem; i++) segs[i] += 1;
  return segs;
}
