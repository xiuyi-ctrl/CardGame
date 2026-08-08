import type { BattleState, PassiveDef, SkillDef, Unit } from '../types';
import { getSkill } from '../data/skills';
import { getMonster } from '../data/monsters';
import { getFood } from '../data/foods';
import { getPassive } from '../data/passives';
import { createRng } from '../rng';

export const TAME_THRESHOLD = 0.4;
/** 每次驯服失败对该敌人捕捉概率的乘法加成（如 0.25 = +25%） */
export const TAME_FAIL_BONUS = 0.25;
/** 敌方每场战斗的治疗次数上限，防止治疗无限拉长战斗形成死局 */
export const ENEMY_HEAL_LIMIT = 3;
/** 战斗棋盘每排列数（前后排各 3 列 = 6 格） */
export const FIELD_COLS = 3;

/** 创建战斗的可选参数（地图节点特殊模式） */
export interface BattleOptions {
  /** 被侵蚀 debuff：'spd' 我方速度 -1 | 'dmg' 我方受到伤害 +1 */
  corruptDebuff?: 'spd' | 'dmg';
  /** 车轮战：敌方 2~3 只轮换上阵 */
  gauntlet?: boolean;
  /** 敌方不可驯服（斗兽场/车轮战） */
  untameable?: boolean;
}

export function computeStats(speciesId: string) {
  const s = getMonster(speciesId);
  return { maxHp: s.baseHp, spd: s.baseSpd };
}

let uidCounter = 0;
export function nextUid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}${uidCounter}_${Date.now() % 100000}`;
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
  return {
    uid: nextUid(isPlayer ? 'p' : 'e'),
    speciesId,
    name: s.name,
    emoji: s.emoji,
    maxHp: s.baseHp + hpBonus,
    hp: s.baseHp + hpBonus,
    spd: s.baseSpd + spdBonus,
    skills: [...s.skills],
    passive: s.passive,
    skillUses,
    statuses: [],
    column,
    row,
    isPlayer,
    tameable,
    acted: false,
  };
}

export function cloneUnit(u: Unit): Unit {
  return {
    ...u,
    statuses: u.statuses.map((s) => ({ ...s })),
    skillUses: u.skillUses ? { ...u.skillUses } : undefined,
  };
}

/** 获取单位的被动技能定义 */
export function getUnitPassive(u: Unit): PassiveDef | undefined {
  return getPassive(u.passive);
}

/** 技能的剩余使用次数（无限制技能返回 Infinity） */
export function skillUsesLeft(u: Unit, skillId: string): number {
  return u.skillUses?.[skillId] ?? Infinity;
}

/** 消耗一次技能使用次数 */
function consumeSkillUse(b: BattleState, actor: Unit, skillId: string): BattleState {
  if (!actor.skillUses || actor.skillUses[skillId] === undefined) return b;
  const current = actorFromId(b, actor.uid);
  if (!current) return b;
  const next = { ...current.skillUses, [skillId]: Math.max(0, (current.skillUses?.[skillId] ?? 0) - 1) };
  return replaceUnit(b, { ...current, skillUses: next });
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
    .sort((a, c) => getEffectiveSpd(c) - getEffectiveSpd(a) || a.uid.localeCompare(c.uid));
  return all.map((u) => u.uid);
}

function makeEnemy(e: { speciesId: string }, index: number, untameable = false): Unit {
  const row: 'front' | 'back' = index < FIELD_COLS ? 'front' : 'back';
  const col = (index % FIELD_COLS) as 0 | 1 | 2;
  const s = getMonster(e.speciesId);
  return makeUnit(e.speciesId, false, col, !untameable && s.rank < 4 && s.tame.difficulty > 0, row);
}

export function createBattle(
  playerUnits: Unit[],
  enemySpecies: { speciesId: string }[],
  seed: number,
  options?: BattleOptions,
): BattleState {
  const preparedPlayer = playerUnits.map((u) => {
    const c = cloneUnit(u);
    if (options?.corruptDebuff === 'spd') c.spd = Math.max(1, c.spd - 1);
    return c;
  });
  // 只有 1 只宠物上场时，位置默认为前排居中
  if (preparedPlayer.length === 1 && preparedPlayer[0]) {
    preparedPlayer[0] = { ...preparedPlayer[0], row: 'front', column: 1 };
  }
  const b: BattleState = {
    playerUnits: [],
    enemyUnits: [],
    turnOrder: [],
    turnIndex: 0,
    round: 1,
    playerAp: 0,
    playerApMax: 0,
    enemyAp: 0,
    phase: 'acting',
    log: [],
    pendingTame: [],
    seed,
    rngCount: 0,
    orders: {},
    corruptDebuff: options?.corruptDebuff,
    enemyHealsLeft: ENEMY_HEAL_LIMIT,
  };
  const untameable = options?.untameable === true;
  if (options?.gauntlet) {
    const [first, ...playerRest] = preparedPlayer;
    // 车轮战：我方也一次只上一只，其余进入替补席，阵亡后按序顶替
    b.playerUnits = first ? [{ ...first, row: 'front', column: 1 }] : [];
    b.playerBench = playerRest;
    b.playerDown = [];
    const [firstEnemy, ...enemyRest] = enemySpecies;
    b.enemyUnits = firstEnemy ? [{ ...makeEnemy(firstEnemy, 0, untameable), row: 'front', column: 1 }] : [];
    b.enemyBench = enemyRest.map((e, i) => makeEnemy(e, i + 1, untameable));
    b.gauntlet = { total: enemySpecies.length, current: 1 };
  } else {
    // 敌方数量与玩家出战数匹配（最少 2v2；boss/斗兽场等单敌遭遇保留 1 只）
    const n = preparedPlayer.length;
    let target = n >= 2 ? Math.min(n, 4) : 1;
    if (enemySpecies.length === 1) target = 1;
    const picked = enemySpecies.slice(0, target);
    while (picked.length < target) picked.push(picked[picked.length % enemySpecies.length] || enemySpecies[0]);
    b.playerUnits = preparedPlayer;
    b.enemyUnits = picked.map((e, i) => makeEnemy(e, i, untameable));
    // 只有一个敌人时，默认前排居中显示
    if (b.enemyUnits.length === 1 && b.enemyUnits[0]) {
      b.enemyUnits = [{ ...b.enemyUnits[0], row: 'front', column: 1 }];
    }
  }
  b.playerAp = b.playerUnits.filter((u) => u.hp > 0).length;
  b.playerApMax = b.playerAp;
  b.enemyAp = b.enemyUnits.filter((u) => u.hp > 0).length;
  b.turnOrder = computeTurnOrder(b);
  return checkEnd(b);
}

/** 开始新回合：重置行动标记/行动点、结算持续伤害与状态持续、重新按速度排序 */
function startRound(b: BattleState): BattleState {
  let nb = decrementBattleBuffs(b);
  nb = {
    ...nb,
    round: nb.round + 1,
    turnOrder: computeTurnOrder(nb),
    turnIndex: 0,
    playerUnits: nb.playerUnits.map((u) => ({ ...u, acted: u.statuses.some((s) => s.kind === 'stun'), statuses: u.statuses.map((s) => ({ ...s })) })),
    enemyUnits: nb.enemyUnits.map((u) => ({ ...u, acted: u.statuses.some((s) => s.kind === 'stun'), statuses: u.statuses.map((s) => ({ ...s })) })),
  };
  for (const u of [...nb.playerUnits, ...nb.enemyUnits]) {
    if (u.hp <= 0) continue;
    const res = applyDot(nb, u);
    nb = res.battle;
    if (res.unit.hp > 0) tickStatuses(res.unit);
    nb = replaceUnit(nb, res.unit);
  }
  // 被动再生：每回合开始恢复（存活且未满血）
  for (const u of [...nb.playerUnits, ...nb.enemyUnits]) {
    const p = getUnitPassive(u);
    if (p?.kind === 'regen' && u.hp > 0 && u.hp < u.maxHp) {
      const maxHp = getEffectiveMaxHp(u);
      const healed = { ...u, hp: Math.min(maxHp, u.hp + p.value) };
      nb = replaceUnit(nb, healed);
      nb = pushLog(nb, `${u.name} 的「${p.name}」恢复 ${p.value} 点生命`, sideOf(u));
    }
  }
  nb = {
    ...nb,
    playerAp: nb.playerUnits.filter((u) => u.hp > 0).length,
    playerApMax: nb.playerUnits.filter((u) => u.hp > 0).length,
    enemyAp: nb.enemyUnits.filter((u) => u.hp > 0).length,
  };
  return nb;
}

function replaceUnit(b: BattleState, unit: Unit): BattleState {
  const side = unit.isPlayer ? 'playerUnits' : 'enemyUnits';
  const list = b[side].map((u) => (u.uid === unit.uid ? unit : u));
  return { ...b, [side]: list };
}

function applyDot(b: BattleState, u: Unit): { unit: Unit; battle: BattleState } {
  let nb = b;
  let unit = u;
  for (const s of u.statuses) {
    if (unit.hp <= 0) break;
    if (s.kind === 'burn' || s.kind === 'poison') {
      const dmg = Math.max(1, s.value);
      unit = { ...unit, hp: Math.max(0, unit.hp - dmg) };
      // 先写回再记录日志，让日志血量快照包含本次掉血，动画里飘字与血量条下降同步
      nb = replaceUnit(nb, unit);
      nb = pushLog(nb, `${unit.name} 受到${s.kind === 'burn' ? '灼烧' : '中毒'} ${dmg} 点伤害`, sideOf(unit));
    }
  }
  return { unit, battle: nb };
}

function tickStatuses(u: Unit): void {
  for (const s of u.statuses) {
    s.turns -= 1;
  }
  u.statuses = u.statuses.filter((s) => s.turns > 0);
}

export function pushLog(b: BattleState, msg: string, side: 'player' | 'enemy' | 'info' = 'info'): BattleState {
  // 附加当下全体血量快照，供 UI 按动画事件逐步展示血量；log 不截断（由 UI 只展示尾部）
  const hp: Record<string, number> = {};
  for (const u of [...b.playerUnits, ...b.enemyUnits]) hp[u.uid] = u.hp;
  return { ...b, log: [...b.log, { text: msg, side, hp }] };
}

function sideOf(u: Unit): 'player' | 'enemy' {
  return u.isPlayer ? 'player' : 'enemy';
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

function checkEnd(b: BattleState): BattleState {
  // 车轮战：场上敌方全灭但还有后备 → 下一只上场（上一只死亡单位不再显示）
  if (b.gauntlet && b.enemyBench && b.enemyBench.length > 0 && b.enemyUnits.every((u) => u.hp <= 0)) {
    const next = b.enemyBench[0];
    const nextUnit = { ...next, acted: false, statuses: [], row: 'front' as const, column: 1 as const };
    b = {
      ...b,
      enemyUnits: [nextUnit],
      enemyBench: b.enemyBench.slice(1),
      gauntlet: { ...b.gauntlet, current: b.gauntlet.current + 1 },
    };
    b = pushLog(b, `敌方派出下一只：${next.name}！`, 'enemy');
  }
  // 车轮战：场上我方全灭但还有后备 → 当前单位战败退场（不再显示），下一只顶替上场
  if (b.gauntlet && b.playerBench && b.playerBench.length > 0 && b.playerUnits.every((u) => u.hp <= 0)) {
    const next = b.playerBench[0];
    const nextUnit = { ...next, acted: false, statuses: [], row: 'front' as const, column: 1 as const };
    const down = b.playerUnits.filter((u) => u.hp <= 0);
    b = {
      ...b,
      playerUnits: [nextUnit],
      playerBench: b.playerBench.slice(1),
      playerDown: [...(b.playerDown ?? []), ...down],
    };
    b = pushLog(b, `我方派出下一只：${next.name}！`, 'player');
  }
  const playersAlive = b.playerUnits.some((u) => u.hp > 0);
  const enemiesAlive = b.enemyUnits.some((u) => u.hp > 0);
  if (!playersAlive) {
    return { ...b, phase: 'lost', turnOrder: b.turnOrder, turnIndex: 0 };
  }
  if (!enemiesAlive) {
    return { ...b, phase: 'won' };
  }
  return b;
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

function randomOf<T>(b: BattleState, arr: T[], count: number): { picks: T[]; battle: BattleState } {
  const out: T[] = [];
  const pool = [...arr];
  let nb = b;
  for (let i = 0; i < count && pool.length > 0; i++) {
    const res = rngPick(nb, pool);
    nb = res.battle;
    if (res.pick !== undefined) {
      out.push(res.pick);
      pool.splice(pool.indexOf(res.pick), 1);
    }
  }
  return { picks: out, battle: nb };
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
  const enemies = enemiesOf(b, actor);
  const allies = alliesOf(b, actor);
  const front = enemies.filter((u) => u.row === 'front');
  const back = enemies.filter((u) => u.row === 'back');
  let nb = b;
  let targets: Unit[] = [];
  switch (skill.target) {
    case 'self':
      targets = [actor];
      break;
    case 'ally': {
      if (explicitTarget && allies.some((u) => u.uid === explicitTarget)) {
        targets = [allies.find((u) => u.uid === explicitTarget)!];
      } else {
        targets = [actor];
      }
      break;
    }
    case 'all':
      targets = enemies;
      break;
    case 'random': {
      const res = randomOf(nb, enemies, skill.hits ?? 1);
      nb = res.battle;
      targets = res.picks;
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
          if (explicitTarget && back.some((u) => u.uid === explicitTarget)) {
            picked = back.find((u) => u.uid === explicitTarget)!;
          } else {
            const res = rngPick(nb, back.length > 0 ? back : front);
            nb = res.battle;
            picked = res.pick;
          }
        } else {
          if (explicitTarget && front.some((u) => u.uid === explicitTarget)) {
            picked = front.find((u) => u.uid === explicitTarget)!;
          } else {
            const res = rngPick(nb, front.length > 0 ? front : back);
            nb = res.battle;
            picked = res.pick;
          }
        }
        // 连击：同一目标命中 hits 次（伤害按 hits 倍结算，perTarget 聚合）
        if (picked) {
          targets = Array.from({ length: skill.hits ?? 1 }, () => picked);
        }
      }
      break;
    }
    default:
      targets = [enemies[0]].filter(Boolean);
  }
  return { targets, battle: nb };
}

function applyStatusTo(unit: Unit, effect: { kind: Unit['statuses'][number]['kind']; value: number; turns: number }): Unit {
  const idx = unit.statuses.findIndex((s) => s.kind === effect.kind);
  if (idx >= 0) {
    const next = [...unit.statuses];
    next[idx] = { ...next[idx], value: Math.max(next[idx].value, effect.value), turns: Math.max(next[idx].turns, effect.turns) };
    return { ...unit, statuses: next };
  }
  return { ...unit, statuses: [...unit.statuses, { ...effect }] };
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
  if (actor.hp / actor.maxHp >= 0.5) return undefined;
  const backs = alliesOf(b, actor).filter((u) => u.row === 'back' && u.hp / u.maxHp > 0.5);
  if (backs.length === 0) return undefined;
  const target = backs.sort((x, y) => y.hp / y.maxHp - x.hp / x.maxHp)[0];
  let nb = swapUnits(b, actor.uid, target.uid);
  nb = markActed(nb, actor.uid);
  nb = pushLog(nb, `${actor.name} 退到后排，${target.name} 顶上`, sideOf(actor));
  return nb;
}

function enemyAct(b: BattleState, actor: Unit): BattleState {
  let nb = { ...b, enemyAp: b.enemyAp - 1 };
  if (actor.statuses.some((s) => s.kind === 'stun')) {
    return markActed(nb, actor.uid);
  }
  return useRng(nb, (rngVal, b2) => {
    const skills = actor.skills.map(getSkill).filter((s) => skillUsesLeft(actor, s.id) > 0);
    if (skills.length === 0) {
      return markActed(pushLog(b2, `${actor.name} 无技能可用，只能观望`, sideOf(actor)), actor.uid);
    }
    // 治疗：残血且有治疗技能时优先使用（受敌方治疗次数上限约束）
    const healSkills = skills.filter((s) => s.kind === 'heal');
    if (healSkills.length > 0 && (b2.enemyHealsLeft ?? 0) > 0 && actor.hp / actor.maxHp < 0.5 && rngVal > 0.3) {
      const heal = healSkills[0];
      const ally = alliesOf(b2, actor).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
      return useSkillInner(b2, actor, heal, ally?.uid);
    }
    // 换位：残血前排偶尔退到后排
    if (rngVal < 0.15) {
      const swapped = tryEnemySwap(b2, actor);
      if (swapped) return swapped;
    }
    // 攻击：随机选择可用技能（AI 不总是最优，保证难度合理）
    const chosen = skills[Math.floor(rngVal * skills.length)];
    return useSkillInner(b2, actor, chosen, undefined);
  });
}

function markActed(b: BattleState, uid: string): BattleState {
  const actor = actorFromId(b, uid);
  if (!actor) return b;
  return replaceUnit(b, { ...actor, acted: true });
}

/** 玩家与敌方通用的技能结算（内部） */
function useSkillInner(b: BattleState, actor: Unit, skill: SkillDef, explicitTarget?: string): BattleState {
  if (actor.hp <= 0) return b;
  if (actor.statuses.some((s) => s.kind === 'stun')) {
    return markActed(pushLog(b, `${actor.name} 被眩晕，无法行动`, sideOf(actor)), actor.uid);
  }

  let nb = b;
  const { targets, battle } = resolveTargets(nb, actor, skill, explicitTarget);
  nb = battle;
  if (targets.length === 0) {
    return markActed(pushLog(nb, `${actor.name} 的${skill.name}没有目标`, sideOf(actor)), actor.uid);
  }

  if (skill.kind === 'heal') {
    let r = nb;
    const amt = Math.max(1, skill.heal ?? 0);
    if (!actor.isPlayer && (r.enemyHealsLeft ?? 0) > 0) {
      r = { ...r, enemyHealsLeft: (r.enemyHealsLeft ?? 0) - 1 };
    }
    for (const t of targets) {
      const maxHp = getEffectiveMaxHp(t);
      const healed = { ...t, hp: Math.min(maxHp, t.hp + amt) };
      r = replaceUnit(r, healed);
      r = pushLog(r, `${actor.name} 使用「${skill.name}」，治愈 ${t.name} ${amt} 点生命`, sideOf(actor));
    }
    nb = r;
  } else if (skill.kind === 'buff') {
    for (const t of targets) {
      const e = skill.effects?.[0];
      if (!e) continue;
      const buffed = applyStatusTo(t, { kind: e.kind, value: e.value, turns: e.turns });
      nb = replaceUnit(nb, buffed);
      nb = pushLog(nb, `${actor.name} 使用「${skill.name}」，强化自身`, sideOf(actor));
    }
  } else {
    const perTarget = new Map<string, number>();
    for (const t of targets) {
      perTarget.set(t.uid, (perTarget.get(t.uid) ?? 0) + 1);
    }
    for (const [uid, count] of perTarget) {
      const t = actorFromId(nb, uid);
      if (!t || t.hp <= 0) continue;
      const base = Math.max(1, (skill.damage ?? 0) + getDamageBonus(actor));
      const total = base * count;
      let finalDmg = Math.max(1, total - getDamageGuard(t));
      if (t.isPlayer && nb.corruptDebuff === 'dmg') {
        finalDmg += 1;
      }
      let t2 = { ...t, hp: Math.max(0, t.hp - finalDmg) };
      const ap = getUnitPassive(actor);
      if (ap?.kind === 'venom') t2 = applyStatusTo(t2, { kind: 'poison', value: ap.value, turns: 2 });
      if (ap?.kind === 'scorch') t2 = applyStatusTo(t2, { kind: 'burn', value: ap.value, turns: 2 });
      for (const e of skill.effects ?? []) {
        if (e.kind === 'burn' || e.kind === 'poison' || e.kind === 'atkDown' || e.kind === 'stun') {
          t2 = applyStatusTo(t2, e);
        }
      }
      let nb2 = replaceUnit(nb, t2);
      // 吸血：造成伤害后恢复自身
      if (ap?.kind === 'drain') {
        const healedActor = actorFromId(nb2, actor.uid);
        if (healedActor && healedActor.hp > 0) {
          const maxHp = getEffectiveMaxHp(healedActor);
          const healed = { ...healedActor, hp: Math.min(maxHp, healedActor.hp + ap.value) };
          nb2 = replaceUnit(nb2, healed);
        }
      }
      // 尖刺：受击者反伤攻击者
      const tp = getUnitPassive(t2);
      if (tp?.kind === 'thorns' && t2.hp > 0) {
        const attacker = actorFromId(nb2, actor.uid);
        if (attacker && attacker.hp > 0) {
          const hurt = { ...attacker, hp: Math.max(0, attacker.hp - tp.value) };
          nb2 = replaceUnit(nb2, hurt);
          nb2 = pushLog(nb2, `${t2.name} 的「${tp.name}」反伤 ${attacker.name} ${tp.value} 点`, sideOf(t2));
        }
      }
      nb = pushLog(nb2, `${actor.name} 使用「${skill.name}」攻击 ${t.name}，造成 ${finalDmg} 伤害`, sideOf(actor));
    }
  }
  return markActed(consumeSkillUse(nb, actor, skill.id), actor.uid);
}

/** 结束指令阶段并统一结算：敌我所有存活单位按速度依次行动，随后进入新回合 */
export function playerEndTurn(b: BattleState): BattleState {
  if (b.phase !== 'acting') return b;
  let nb: BattleState = { ...b, playerAp: 0 };
  // 回合结算：所有存活单位（敌我混排）按速度统一行动——
  // 我方执行已下达的指令，敌方由 AI 自动行动；未下指令的我方单位本回合不出手。
  for (const uid of computeTurnOrder(nb)) {
    if (nb.phase !== 'acting') break;
    const unit = actorFromId(nb, uid);
    if (!unit || unit.hp <= 0) continue;
    if (unit.isPlayer) {
      const order = nb.orders?.[uid];
      if (order) {
        // useSkillInner 末尾已含 consumeSkillUse + markActed，这里不再重复扣减
        nb = useSkillInner(nb, unit, getSkill(order.skillId), order.targetUid);
      }
    } else if (!unit.acted) {
      nb = enemyAct(nb, unit);
    }
    nb = checkEnd(nb);
  }
  nb = { ...nb, orders: {} };
  if (nb.phase !== 'acting') return nb;
  nb = startRound(nb);
  return checkEnd(nb);
}

/** 即时行动（换位/药水）后的收尾：先结算胜负；未结束时若 AP 用尽或无可行动单位则自动进入结算 */
function afterPlayerAction(b: BattleState): BattleState {
  if (b.phase !== 'acting') return b;
  b = checkEnd(b);
  if (b.phase !== 'acting') return b;
  const canAct = b.playerAp > 0 && b.playerUnits.some((u) => u.hp > 0 && !u.acted);
  if (!canAct) return playerEndTurn(b);
  return b;
}

/** 玩家行动：给一只宠物下达技能指令（不立即结算）。消耗 1 AP；重复下达视为修改指令，不重复扣 AP。 */
export function playerSkill(b: BattleState, actorUid: string, skillId: string, targetUid?: string): BattleState {
  if (b.phase !== 'acting') return b;
  const actor = b.playerUnits.find((u) => u.uid === actorUid);
  if (!actor || actor.hp <= 0) return b;
  if (actor.statuses.some((s) => s.kind === 'stun')) return b;
  const skill = getSkill(skillId);
  if (!skill) return b;
  if (skillUsesLeft(actor, skillId) <= 0) return b;
  // 已下过指令：仅修改指令内容，不重复扣 AP/占用行动
  if (actor.acted && b.orders?.[actorUid]) {
    return { ...b, orders: { ...b.orders, [actorUid]: { skillId, targetUid } } };
  }
  // 本回合已被即时行动（换位/道具）占用：不能再下指令
  if (actor.acted) return b;
  if (b.playerAp <= 0) return b;
  return {
    ...b,
    playerAp: b.playerAp - 1,
    playerUnits: b.playerUnits.map((u) => (u.uid === actorUid ? { ...u, acted: true } : u)),
    orders: { ...(b.orders ?? {}), [actorUid]: { skillId, targetUid } },
  };
}

/** 玩家行动：交换己方两只宠物的位置（可前后左右）。发起者消耗 1 AP 并占用行动。 */
export function playerSwap(b: BattleState, actorUid: string, otherUid: string): BattleState {
  if (b.phase !== 'acting' || b.playerAp <= 0) return b;
  const actor = b.playerUnits.find((u) => u.uid === actorUid);
  const other = b.playerUnits.find((u) => u.uid === otherUid);
  if (!actor || !other || actor.uid === other.uid) return b;
  if (actor.hp <= 0 || other.hp <= 0) return b;
  if (actor.acted) return b;
  if (actor.statuses.some((s) => s.kind === 'stun')) return b;
  let nb = swapUnits(b, actor.uid, other.uid);
  nb = markActed(nb, actor.uid);
  nb = { ...nb, playerAp: nb.playerAp - 1 };
  nb = pushLog(nb, `${actor.name} 与 ${other.name} 交换了位置`, 'player');
  return afterPlayerAction(nb);
}

/** 计算对某敌人使用某食物的捕捉概率（0..1）。不含 1 血/圣果的必定成功判定，由调用方另行判断。 */
export function tameChance(enemy: Unit, foodId: string): number {
  const food = getFood(foodId);
  const species = getMonster(enemy.speciesId);
  const hpFactor = 0.4 + 0.6 * (1 - enemy.hp / enemy.maxHp);
  // 每次驯服失败 +25% 捕捉概率（乘法累加），多次失败后概率显著提高
  const fails = enemy.tameFails ?? 0;
  return Math.min(1, food.baseTame * species.tame.difficulty * hpFactor * (1 + fails * TAME_FAIL_BONUS));
}

/** 玩家行动：喂食驯服敌人（不消耗 AP）。每次失败会提高该敌人的后续捕捉概率；残血到 1 点时必定捕捉。 */
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
  const chance = tameChance(enemy, foodId);

  const nb = useRng(b, (rng, nb2) => {
    const guaranteed = enemy.hp === 1 || food.guaranteed;
    const success = guaranteed ? true : rng < chance;
    let after: BattleState = nb2;
    if (success) {
      const tamed = makeUnit(enemy.speciesId, true, 2, false);
      tamed.maxHp += food.hpBonus;
      tamed.hp = tamed.maxHp;
      after = {
        ...nb2,
        enemyUnits: nb2.enemyUnits.filter((u) => u.uid !== enemyUid),
        pendingTame: [...nb2.pendingTame, tamed],
      };
      after = pushLog(
        after,
        enemy.hp === 1 ? `${enemy.name} 已是强弩之末，被成功驯服！已加入队伍预备役` : `${enemy.name} 被成功驯服！已加入队伍预备役`,
        'enemy',
      );
    } else {
      after = {
        ...nb2,
        enemyUnits: nb2.enemyUnits.map((u) => (u.uid === enemy.uid ? { ...u, tameFails: (u.tameFails ?? 0) + 1 } : u)),
      };
      after = pushLog(after, `喂食${food.name}失败，${enemy.name} 抵抗了驯服（下次捕捉概率提高）`, 'enemy');
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

/** 玩家是否还有可执行的行动（AP 与可行动单位都满足） */
export function playerHasMove(b: BattleState): boolean {
  return b.phase === 'acting' && b.playerAp > 0 && getActablePlayerUnits(b).length > 0;
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

const BUFF_DURATION = 3; // 持续 3 回合

/** 使用战斗药水：给指定单位加buff/debuff（消耗 1 AP） */
export function useBattleItem(b: BattleState, itemId: string, targetUid: string): BattleState {
  if (b.phase !== 'acting' || b.playerAp <= 0) return b;
  const key = BUFF_MAP[itemId];
  if (!key) return b;

  const target = [...b.playerUnits, ...b.enemyUnits].find((u) => u.uid === targetUid);
  if (!target) return b;

  const isPlayer = target.isPlayer;
  // 验证目标合法性：己方增益只能用于我方，敌方减益只能用于敌方
  const isBuff = ['atkUp', 'spdUp', 'hpUp'].includes(key);
  const isDebuff = ['atkDown', 'spdDown', 'hpDown'].includes(key);
  if ((isBuff && !isPlayer) || (isDebuff && isPlayer)) return b;

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
      atkUp: '伤害 +1',
      spdUp: '速度 +1',
      hpUp: '回复 50% 生命',
      atkDown: '伤害 -1',
      spdDown: '速度 -1',
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
  const after = { ...nb, playerAp: nb.playerAp - 1 };
  return afterPlayerAction(after);
}

/** 回合开始时递减所有单位的战斗药水效果回合数 */
export function decrementBattleBuffs(b: BattleState): BattleState {
  let changed = false;
  const newUnits = [...b.playerUnits, ...b.enemyUnits].map((u) => {
    if (!u.battleBuffs) return u;
    const next: Record<string, number> = {};
    let unitChanged = false;
    for (const [k, v] of Object.entries(u.battleBuffs)) {
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
export function getDamageBonus(u: Unit): number {
  let bonus = 0;
  if (u.curse === 'atkDown') bonus -= 1;
  for (const s of u.statuses) {
    if (s.kind === 'atkUp') bonus += s.value;
    else if (s.kind === 'atkDown') bonus -= s.value;
  }
  if (u.battleBuffs) {
    if (u.battleBuffs.atkUp) bonus += 1;
    if (u.battleBuffs.atkDown) bonus -= 1;
  }
  const p = getUnitPassive(u);
  if (p?.kind === 'power') bonus += p.value;
  if (p?.kind === 'frenzy' && u.hp / u.maxHp < 0.5) bonus += p.value;
  return bonus;
}

/** 获取单位的伤害减免（被动守护，整数） */
export function getDamageGuard(u: Unit): number {
  const p = getUnitPassive(u);
  return p?.kind === 'guard' ? p.value : 0;
}

/** 获取单位的有效速度（含临时buff，整数） */
export function getEffectiveSpd(u: Unit): number {
  let spd = u.spd;
  if (u.battleBuffs?.spdUp) spd += 1;
  if (u.battleBuffs?.spdDown) spd -= 1;
  return Math.max(1, spd);
}

/** 获取单位的有效最大生命（含临时buff） */
export function getEffectiveMaxHp(u: Unit): number {
  return u.maxHp;
}
