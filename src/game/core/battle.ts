import type { BattleState, ElementType, SkillDef, Unit } from '../types';
import { getSkill } from '../data/skills';
import { getMonster } from '../data/monsters';
import { getFood } from '../data/foods';
import { createRng } from '../rng';

export const TAME_THRESHOLD = 0.4;

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
    .sort((a, c) => c.spd - a.spd || a.uid.localeCompare(c.uid));
  return all.map((u) => u.uid);
}

export function createBattle(
  playerUnits: Unit[],
  enemySpecies: { speciesId: string; level: number }[],
  seed: number,
): BattleState {
  const b: BattleState = {
    playerUnits: playerUnits.map((u) => cloneUnit(u)),
    enemyUnits: enemySpecies.map((e, i) => {
      const col = Math.min(2, i) as 0 | 1 | 2;
      const s = getMonster(e.speciesId);
      const u = makeUnit(e.speciesId, e.level, false, col, s.rank < 4 && s.tame.difficulty > 0);
      u.expValue = s.rank * 15;
      return u;
    }),
    turnOrder: [],
    turnIndex: 0,
    round: 0,
    phase: 'acting',
    log: [],
    pendingTame: [],
    seed,
    rngCount: 0,
  };
  return advance(b);
}

/** 开始新回合：重置行动标记、结算持续伤害与状态持续、重新按速度排序 */
function startRound(b: BattleState): BattleState {
  let nb: BattleState = {
    ...b,
    round: b.round + 1,
    turnOrder: computeTurnOrder(b),
    turnIndex: 0,
    playerUnits: b.playerUnits.map((u) => ({ ...u, acted: false, statuses: u.statuses.map((s) => ({ ...s })) })),
    enemyUnits: b.enemyUnits.map((u) => ({ ...u, acted: false, statuses: u.statuses.map((s) => ({ ...s })) })),
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
    nb = useRng(nb, (rngVal, b2) => {
      let r = b2;
      for (const t of targets) {
        const amt = Math.round(actor.atk * skill.power + (skill.bonus ?? 0) + rngVal);
        const healed = { ...t, hp: Math.min(t.maxHp, t.hp + amt) };
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
        for (let i = 0; i < count; i++) {
          const variance = 0.9 + rngVal * 0.2;
          const elem = skill.element ? elementMultiplier(skill.element, t.element) : 1;
          total += Math.max(1, Math.round(actor.atk * skill.power * elem * variance) - t.def);
        }
        const crit = rngVal > 0.9 ? 1.5 : 1;
        const finalDmg = Math.max(1, Math.round(total * crit));
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

/** 玩家行动：喂食驯服敌人。 */
export function playerTame(b: BattleState, foodId: string, enemyUid: string): BattleState {
  const enemy = b.enemyUnits.find((u) => u.uid === enemyUid);
  if (!enemy || enemy.hp <= 0) return b;
  if (enemy.hp / enemy.maxHp > TAME_THRESHOLD) {
    return pushLog(b, `${enemy.name} 生命值过高，无法驯服`);
  }
  const food = getFood(foodId);
  const species = getMonster(enemy.speciesId);
  const hpFactor = 0.4 + 0.6 * (1 - enemy.hp / enemy.maxHp);
  const chance = food.baseTame * species.tame.difficulty * hpFactor;

  return useRng(b, (rng, nb) => {
    const success = rng < chance;
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
      after = pushLog(after, `${enemy.name} 被成功驯服！已加入队伍预备役`);
    } else {
      after = pushLog(nb, `喂食${food.name}失败，${enemy.name} 抵抗了驯服`);
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
