import type { BattleState, ElementType, SkillDef, Unit } from '../types';
import { getSkill } from '../data/skills';
import { getMonster } from '../data/monsters';
import { getFood } from '../data/foods';
import { createRng } from '../rng';

export const TAME_THRESHOLD = 0.4;
/** 每次驯服失败对该敌人捕捉概率的乘法加成（如 0.25 = +25%） */
export const TAME_FAIL_BONUS = 0.25;

/** 创建战斗的可选参数（地图节点特殊模式） */
export interface BattleOptions {
  /** 被侵蚀 debuff：'spd' 我方速度 -10% | 'dmg' 我方受到伤害 +10% */
  corruptDebuff?: 'spd' | 'dmg';
  /** 车轮战：敌方 2~3 只轮换上阵 */
  gauntlet?: boolean;
  /** 敌方不可驯服（斗兽场/车轮战） */
  untameable?: boolean;
}

/** 五行循环克制：i 克 i+1，被 i+2 克 */
export const ELEMENT_ORDER: ElementType[] = ['fire', 'nature', 'water', 'shadow', 'metal'];

export function elementMultiplier(atk: ElementType, def: ElementType): number {
  const i = ELEMENT_ORDER.indexOf(atk);
  const j = ELEMENT_ORDER.indexOf(def);
  if (i === j) return 1;
  if ((i + 1) % ELEMENT_ORDER.length === j) return 1.5;
  if ((i + 2) % ELEMENT_ORDER.length === j) return 0.75;
  return 1;
}

export function unlockedSkills(speciesId: string, level: number): string[] {
  const skills = getMonster(speciesId).skills;
  const count = Math.min(skills.length, Math.max(1, 1 + Math.floor((level - 1) / 2)));
  return skills.slice(0, count);
}

export function computeStats(speciesId: string, level: number) {
  const s = getMonster(speciesId);
  return {
    maxHp: s.baseHp + s.hpGrow * (level - 1),
    atk: s.baseAtk + s.atkGrow * (level - 1),
    spd: s.baseSpd + s.spdGrow * (level - 1),
    def: s.def,
  };
}

let uidCounter = 0;
export function nextUid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}${uidCounter}_${Date.now() % 100000}`;
}

export function makeUnit(
  speciesId: string,
  level: number,
  isPlayer: boolean,
  column: 0 | 1 | 2,
  tameable: boolean,
): Unit {
  const s = getMonster(speciesId);
  const stats = computeStats(speciesId, level);
  return {
    uid: nextUid(isPlayer ? 'p' : 'e'),
    speciesId,
    name: s.name,
    emoji: s.emoji,
    level,
    maxHp: stats.maxHp,
    hp: stats.maxHp,
    atk: stats.atk,
    spd: stats.spd,
    def: stats.def,
    element: s.element,
    skills: unlockedSkills(speciesId, level),
    statuses: [],
    column,
    isPlayer,
    tameable,
    expValue: s.rank * 15,
    exp: 0,
    expToLevel: 10 * level,
    acted: false,
  };
}

export function cloneUnit(u: Unit): Unit {
  return { ...u, statuses: u.statuses.map((s) => ({ ...s })) };
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

function makeEnemy(e: { speciesId: string; level: number }, index: number, untameable = false): Unit {
  const col = Math.min(2, index) as 0 | 1 | 2;
  const s = getMonster(e.speciesId);
  const u = makeUnit(e.speciesId, e.level, false, col, !untameable && s.rank < 4 && s.tame.difficulty > 0);
  u.expValue = s.rank * 15;
  return u;
}

export function createBattle(
  playerUnits: Unit[],
  enemySpecies: { speciesId: string; level: number }[],
  seed: number,
  options?: BattleOptions,
): BattleState {
  const preparedPlayer = playerUnits.map((u) => {
    const c = cloneUnit(u);
    if (options?.corruptDebuff === 'spd') c.spd = Math.max(1, Math.round(c.spd * 0.9));
    return c;
  });
  const b: BattleState = {
    playerUnits: [],
    enemyUnits: [],
    turnOrder: [],
    turnIndex: 0,
    round: 0,
    phase: 'acting',
    log: [],
    pendingTame: [],
    seed,
    rngCount: 0,
    corruptDebuff: options?.corruptDebuff,
  };
  const untameable = options?.untameable === true;
  if (options?.gauntlet) {
    const [first, ...playerRest] = preparedPlayer;
    // 车轮战：我方也一次只上一只，其余进入替补席，阵亡后按序顶替
    b.playerUnits = first ? [first] : [];
    b.playerBench = playerRest;
    b.playerDown = [];
    const [firstEnemy, ...enemyRest] = enemySpecies;
    b.enemyUnits = firstEnemy ? [makeEnemy(firstEnemy, 0, untameable)] : [];
    b.enemyBench = enemyRest.map((e, i) => makeEnemy(e, i + 1, untameable));
    b.gauntlet = { total: enemySpecies.length, current: 1 };
  } else {
    b.playerUnits = preparedPlayer;
    b.enemyUnits = enemySpecies.map((e, i) => makeEnemy(e, i, untameable));
  }
  return advance(b);
}

/** 开始新回合：重置行动标记、结算持续伤害与状态持续、重新按速度排序 */
function startRound(b: BattleState): BattleState {
  // 递减战斗药水效果回合数
  let nb = decrementBattleBuffs(b);
  nb = {
    ...nb,
    round: nb.round + 1,
    turnOrder: computeTurnOrder(nb),
    turnIndex: 0,
    playerUnits: nb.playerUnits.map((u) => ({ ...u, acted: false, statuses: u.statuses.map((s) => ({ ...s })) })),
    enemyUnits: nb.enemyUnits.map((u) => ({ ...u, acted: false, statuses: u.statuses.map((s) => ({ ...s })) })),
  };
  for (const u of [...nb.playerUnits, ...nb.enemyUnits]) {
    const res = applyDot(nb, u);
    nb = res.battle;
    if (res.unit.hp > 0) tickStatuses(res.unit);
    nb = replaceUnit(nb, res.unit);
  }
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
    if (s.kind === 'burn' || s.kind === 'poison') {
      const dmg = Math.max(1, s.value);
      unit = { ...unit, hp: Math.max(0, unit.hp - dmg) };
      nb = pushLog(nb, `${unit.name} 受到${s.kind === 'burn' ? '灼烧' : '中毒'} ${dmg} 点伤害`);
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

export function pushLog(b: BattleState, msg: string): BattleState {
  return { ...b, log: [...b.log.slice(-40), msg] };
}

function actorFromId(b: BattleState, uid: string): Unit | undefined {
  return [...b.playerUnits, ...b.enemyUnits].find((u) => u.uid === uid);
}

function currentActor(b: BattleState): Unit | undefined {
  if (b.turnOrder.length === 0) return undefined;
  return actorFromId(b, b.turnOrder[b.turnIndex]);
}

function nextActor(b: BattleState): Unit | undefined {
  for (let i = 0; i < b.turnOrder.length; i++) {
    const u = actorFromId(b, b.turnOrder[(b.turnIndex + i) % b.turnOrder.length]);
    if (u && u.hp > 0 && !u.acted) return u;
  }
  return undefined;
}

/**
 * 推进到「轮到玩家行动」或「战斗结束」。
 * 若当前行动者是敌方，则由 AI 自动结算；回合内全部行动完则开启新回合。
 * 迭代实现，避免深递归栈溢出。
 */
function advance(b: BattleState): BattleState {
  let nb = checkEnd(b);
  let guard = 0;
  while (nb.phase === 'acting' && guard < 10000) {
    guard += 1;
    const actor = nextActor(nb);
    if (!actor) {
      nb = startRound(checkEnd(nb));
      continue;
    }
    const idx = nb.turnOrder.indexOf(actor.uid);
    nb = { ...nb, turnIndex: idx };
    if (actor.isPlayer) return nb;
    nb = useRng(nb, (_v, b2) => enemyAct(b2));
    nb = checkEnd(nb);
  }
  return nb;
}

function checkEnd(b: BattleState): BattleState {
  // 车轮战：场上敌方全灭但还有后备 → 下一只上场
  if (b.gauntlet && b.enemyBench && b.enemyBench.length > 0 && b.enemyUnits.every((u) => u.hp <= 0)) {
    const next = b.enemyBench[0];
    const nextUnit = { ...next, acted: false, statuses: [] };
    b = {
      ...b,
      enemyUnits: [...b.enemyUnits, nextUnit],
      enemyBench: b.enemyBench.slice(1),
      gauntlet: { ...b.gauntlet, current: b.gauntlet.current + 1 },
    };
    b = pushLog(b, `敌方派出下一只：${next.name}！`);
  }
  // 车轮战：场上我方全灭但还有后备 → 当前单位战败退场（不再显示），下一只顶替上场
  if (b.gauntlet && b.playerBench && b.playerBench.length > 0 && b.playerUnits.every((u) => u.hp <= 0)) {
    const next = b.playerBench[0];
    const nextUnit = { ...next, acted: false, statuses: [] };
    const down = b.playerUnits.filter((u) => u.hp <= 0);
    b = {
      ...b,
      playerUnits: [nextUnit],
      playerBench: b.playerBench.slice(1),
      playerDown: [...(b.playerDown ?? []), ...down],
    };
    b = pushLog(b, `我方派出下一只：${next.name}！`);
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

function playerTargets(b: BattleState): Unit[] {
  return b.enemyUnits.filter((u) => u.hp > 0);
}

function enemyTargets(b: BattleState): Unit[] {
  return b.playerUnits.filter((u) => u.hp > 0);
}

function alliesOf(b: BattleState, actor: Unit): Unit[] {
  return actor.isPlayer ? b.playerUnits.filter((u) => u.hp > 0) : b.enemyUnits.filter((u) => u.hp > 0);
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

function resolveTargets(b: BattleState, actor: Unit, skill: SkillDef, explicitTarget?: string): { targets: Unit[]; battle: BattleState } {
  const enemies = actor.isPlayer ? playerTargets(b) : enemyTargets(b);
  const allies = alliesOf(b, actor);
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
      const res = randomOf(nb, enemies.filter((u) => u.hp > 0), skill.hits ?? 1);
      nb = res.battle;
      targets = res.picks;
      break;
    }
    case 'single': {
      if (explicitTarget) {
        const t = [...enemies, ...(skill.kind === 'heal' ? allies : [])].find((u) => u.uid === explicitTarget && u.hp > 0);
        if (t) targets = [t];
      }
      if (targets.length === 0) {
        const res = rngPick(nb, enemies);
        nb = res.battle;
        if (res.pick) targets = [res.pick];
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

function enemyAct(b: BattleState): BattleState {
  const actor = currentActor(b);
  if (!actor || actor.hp <= 0) return b;
  if (actor.statuses.some((s) => s.kind === 'stun')) {
    return markActed(pushLog(b, `${actor.name} 被眩晕，无法行动`), actor.uid);
  }

  return useRng(b, (rngVal, nb) => {
    const skills = actor.skills.map(getSkill);
    const healSkills = skills.filter((s) => s.kind === 'heal');
    let chosen = skills[Math.floor(rngVal * skills.length)];
    if (healSkills.length > 0 && actor.hp / actor.maxHp < 0.5 && rngVal > 0.4) {
      chosen = healSkills[0];
    }
    const explicit = chosen.target === 'self' || chosen.target === 'ally' ? actor.uid : undefined;
    return useSkillInner(nb, actor, chosen, explicit);
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
    return markActed(pushLog(b, `${actor.name} 被眩晕，无法行动`), actor.uid);
  }

  let nb = b;
  const { targets, battle } = resolveTargets(nb, actor, skill, explicitTarget);
  nb = battle;
  if (targets.length === 0) {
    return markActed(pushLog(nb, `${actor.name} 的${skill.name}没有目标`), actor.uid);
  }

  if (skill.kind === 'heal') {
    const effectiveAtk = getEffectiveAtk(actor);
    nb = useRng(nb, (rngVal, b2) => {
      let r = b2;
      for (const t of targets) {
        const amt = Math.round(effectiveAtk * skill.power + (skill.bonus ?? 0) + rngVal);
        const maxHp = getEffectiveMaxHp(t);
        const healed = { ...t, hp: Math.min(maxHp, t.hp + amt) };
        r = replaceUnit(r, healed);
        r = pushLog(r, `${actor.name} 使用「${skill.name}」，治愈 ${t.name} ${amt} 点生命`);
      }
      return r;
    });
  } else if (skill.kind === 'buff') {
    for (const t of targets) {
      const e = skill.effects?.[0];
      if (!e) continue;
      const buffed = applyStatusTo(t, { kind: e.kind, value: e.value, turns: e.turns });
      nb = replaceUnit(nb, buffed);
      nb = pushLog(nb, `${actor.name} 使用「${skill.name}」，强化自身`);
    }
  } else {
    const perTarget = new Map<string, number>();
    for (const t of targets) {
      perTarget.set(t.uid, (perTarget.get(t.uid) ?? 0) + 1);
    }
    for (const [uid, count] of perTarget) {
      const t = actorFromId(nb, uid);
      if (!t || t.hp <= 0) continue;
      const single = useRng(nb, (rngVal, b2) => {
        let total = 0;
        const effectiveAtk = getEffectiveAtk(actor);
        for (let i = 0; i < count; i++) {
          const variance = 0.9 + rngVal * 0.2;
          const elem = skill.element ? elementMultiplier(skill.element, t.element) : 1;
          total += Math.max(1, Math.round(effectiveAtk * skill.power * elem * variance) - t.def);
        }
        const crit = rngVal > 0.9 ? 1.5 : 1;
        let finalDmg = Math.max(1, Math.round(total * crit));
        if (t.isPlayer && b2.corruptDebuff === 'dmg') {
          finalDmg = Math.max(1, Math.round(finalDmg * 1.1));
        }
        let t2 = { ...t, hp: Math.max(0, t.hp - finalDmg) };
        for (const e of skill.effects ?? []) {
          if (e.kind === 'burn' || e.kind === 'poison' || e.kind === 'atkDown' || e.kind === 'stun') {
            t2 = applyStatusTo(t2, e);
          }
        }
        const nb2 = replaceUnit(b2, t2);
        return pushLog(nb2, `${actor.name} 使用「${skill.name}」攻击 ${t.name}，造成 ${finalDmg} 伤害${crit > 1 ? '（暴击！）' : ''}`);
      });
      nb = single;
    }
  }
  return markActed(nb, actor.uid);
}

/** 玩家行动：使用技能。自动推进敌方回合直到轮到下一个玩家或战斗结束。 */
export function playerSkill(b: BattleState, skillId: string, targetUid?: string): BattleState {
  const actor = currentActor(b);
  if (!actor || !actor.isPlayer || b.phase !== 'acting') return b;
  return useRng(b, (_v, nb) => {
    const after = useSkillInner(nb, actor, getSkill(skillId), targetUid);
    return advance(after);
  });
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

/** 玩家行动：喂食驯服敌人。每次失败会提高该敌人的后续捕捉概率；残血到 1 点时必定捕捉。 */
export function playerTame(b: BattleState, foodId: string, enemyUid: string): BattleState {
  const enemy = b.enemyUnits.find((u) => u.uid === enemyUid);
  if (!enemy || enemy.hp <= 0) return b;
  if (!enemy.tameable) {
    return pushLog(b, `${enemy.name} 不是可驯服的对手`);
  }
  if (enemy.hp / enemy.maxHp > TAME_THRESHOLD) {
    return pushLog(b, `${enemy.name} 生命值过高，无法驯服`);
  }
  const food = getFood(foodId);
  const chance = tameChance(enemy, foodId);

  return useRng(b, (rng, nb) => {
    const guaranteed = enemy.hp === 1 || food.guaranteed;
    const success = guaranteed ? true : rng < chance;
    let after: BattleState = nb;
    if (success) {
      const avgLevel = Math.max(
        1,
        Math.round(
          nb.playerUnits.reduce((s, u) => s + u.level, 0) / Math.max(1, nb.playerUnits.filter((u) => u.hp > 0).length),
        ),
      );
      const tamed = makeUnit(enemy.speciesId, avgLevel, true, 2, false);
      tamed.maxHp += food.hpBonus;
      tamed.hp = tamed.maxHp;
      after = {
        ...nb,
        enemyUnits: nb.enemyUnits.filter((u) => u.uid !== enemyUid),
        pendingTame: [...nb.pendingTame, tamed],
      };
      after = pushLog(
        after,
        enemy.hp === 1 ? `${enemy.name} 已是强弩之末，被成功驯服！已加入队伍预备役` : `${enemy.name} 被成功驯服！已加入队伍预备役`,
      );
    } else {
      after = {
        ...nb,
        enemyUnits: nb.enemyUnits.map((u) => (u.uid === enemy.uid ? { ...u, tameFails: (u.tameFails ?? 0) + 1 } : u)),
      };
      after = pushLog(after, `喂食${food.name}失败，${enemy.name} 抵抗了驯服（下次捕捉概率提高）`);
    }
    return advance(after);
  });
}

export function currentPlayerUnit(b: BattleState): Unit | undefined {
  const u = currentActor(b);
  return u && u.isPlayer && b.phase === 'acting' ? u : undefined;
}

export function isTameable(enemy: Unit): boolean {
  return enemy.tameable && enemy.hp > 0 && enemy.hp / enemy.maxHp <= TAME_THRESHOLD;
}

export function playerHasMove(b: BattleState): boolean {
  return b.phase === 'acting' && currentActor(b)?.isPlayer === true;
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

/** 使用战斗药水：给指定单位加buff/debuff */
export function useBattleItem(b: BattleState, itemId: string, targetUid: string): BattleState {
  const key = BUFF_MAP[itemId];
  if (!key) return b;

  const target = [...b.playerUnits, ...b.enemyUnits].find(u => u.uid === targetUid);
  if (!target) return b;

  const isPlayer = target.isPlayer;
  // 验证目标合法性：己方增益只能用于我方，敌方减益只能用于敌方
  const isBuff = ['atkUp', 'spdUp', 'hpUp'].includes(key);
  const isDebuff = ['atkDown', 'spdDown', 'hpDown'].includes(key);
  if ((isBuff && !isPlayer) || (isDebuff && isPlayer)) return b;

  return useRng(b, (_rngVal, nb) => {
    const t = [...nb.playerUnits, ...nb.enemyUnits].find(u => u.uid === targetUid);
    if (!t) return nb;

    const unitBuffs = { ...(t.battleBuffs ?? {}) };
    // 生命药水即时生效，不加入持续buff
    if (key !== 'hpUp') {
      unitBuffs[key] = BUFF_DURATION;
    } else {
      // 生命药水：即时回血 50%
      const maxHp = getEffectiveMaxHp(t);
      const heal = Math.round(maxHp * 0.5);
      const healedUnit = { ...t, hp: Math.min(maxHp, t.hp + heal), battleBuffs: unitBuffs };
      const newUnits = [...nb.playerUnits, ...nb.enemyUnits].map(u =>
        u.uid === targetUid ? healedUnit : u
      );
      return pushLog(
        {
          ...nb,
          playerUnits: newUnits.filter(u => u.isPlayer),
          enemyUnits: newUnits.filter(u => !u.isPlayer),
        },
        `对 ${t.name} 使用道具：回复 50% 生命`
      );
    }

    const effectDesc: Record<string, string> = {
      atkUp: '攻击 +30%',
      spdUp: '速度 +30%',
      hpUp: '回复 50% 生命',
      atkDown: '攻击 -30%',
      spdDown: '速度 -30%',
      hpDown: '最大生命 -30%',
    };

    const newUnits = [...nb.playerUnits, ...nb.enemyUnits].map(u =>
      u.uid === targetUid ? { ...u, battleBuffs: unitBuffs } : u
    );

    return pushLog(
      {
        ...nb,
        playerUnits: newUnits.filter(u => u.isPlayer),
        enemyUnits: newUnits.filter(u => !u.isPlayer),
      },
      `对 ${t.name} 使用道具：${effectDesc[key]}（持续 ${BUFF_DURATION} 回合）`
    );
  });
}

/** 回合开始时递减所有单位的战斗药水效果回合数 */
export function decrementBattleBuffs(b: BattleState): BattleState {
  let changed = false;
  const newUnits = [...b.playerUnits, ...b.enemyUnits].map(u => {
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
    ? { ...b, playerUnits: newUnits.filter(u => u.isPlayer), enemyUnits: newUnits.filter(u => !u.isPlayer) }
    : b;
}

/** 获取单位的有效攻击（含临时buff） */
export function getEffectiveAtk(u: Unit): number {
  if (!u.battleBuffs) return u.atk;
  let atk = u.atk;
  if (u.battleBuffs.atkUp) atk = Math.round(atk * 1.3);
  if (u.battleBuffs.atkDown) atk = Math.round(atk * 0.7);
  return atk;
}

/** 获取单位的有效速度（含临时buff） */
export function getEffectiveSpd(u: Unit): number {
  if (!u.battleBuffs) return u.spd;
  let spd = u.spd;
  if (u.battleBuffs.spdUp) spd = Math.round(spd * 1.3);
  if (u.battleBuffs.spdDown) spd = Math.round(spd * 0.7);
  return spd;
}

/** 获取单位的有效最大生命（含临时buff） */
export function getEffectiveMaxHp(u: Unit): number {
  if (!u.battleBuffs) return u.maxHp;
  let maxHp = u.maxHp;
  if (u.battleBuffs.hpDown) maxHp = Math.round(maxHp * 0.7);
  return maxHp;
}

/** 生命药水即时生效：回复 50% 当前最大生命 */
export function applyHpPotion(u: Unit): Unit {
  const maxHp = getEffectiveMaxHp(u);
  const heal = Math.round(maxHp * 0.5);
  return { ...u, hp: Math.min(maxHp, u.hp + heal) };
}
