import type { BattleState, FoodDef, Unit } from '../types';
import { getMonster } from '../data/monsters';
import { getFood, FOODS } from '../data/foods';
import { chance, createRng, pick, randInt, shuffle } from '../rng';
import { computeStats, unlockedSkills } from '../core/battle';

export type NodeType = 'battle' | 'elite' | 'rest' | 'shop' | 'event' | 'boss';

export interface MapNode {
  id: string;
  type: NodeType;
  label: string;
  /** 列序号：本行第几个节点，用于判断下一层相邻路线 */
  col: number;
}

export interface EventChoice {
  id: string;
  label: string;
  desc: string;
  kind: 'heal' | 'gold' | 'food' | 'recruit' | 'damage' | 'exp' | 'none';
  /** heal/damage=百分比，gold=金额，exp=经验值 */
  amount?: number;
  /** 金币变动（food/exp 附加） */
  goldDelta?: number;
  foodId?: string;
  monsterId?: string;
}

export interface EventNode {
  title: string;
  desc: string;
  choices: EventChoice[];
}

export interface RunMap {
  layers: MapNode[][];
  encounter: Record<string, { speciesId: string; level: number }[]>;
  boss: Record<string, { speciesId: string; level: number }[]>;
  events: Record<string, EventNode>;
}

export type Screen =
  | 'title'
  | 'starter'
  | 'map'
  | 'battle'
  | 'reward'
  | 'roster'
  | 'shop'
  | 'rest'
  | 'event'
  | 'gameover'
  | 'victory';

export interface RewardChoice {
  id: string;
  label: string;
  desc: string;
  kind: 'food' | 'heal' | 'recruit' | 'gold';
  foodId?: string;
  monsterId?: string;
  amount?: number;
}

export interface GameState {
  screen: Screen;
  seed: number;
  act: number;
  map: RunMap;
  currentRow: number;
  currentNodeId: string;
  roster: Unit[];
  field: string[];
  inventory: Record<string, number>;
  gold: number;
  battle?: BattleState;
  rewards: RewardChoice[];
  log: string[];
}

export const ROSTER_MAX = 6;
export const FIELD_MAX = 3;

let nodeSeq = 0;
function nodeId(): string {
  nodeSeq += 1;
  return `n${nodeSeq}`;
}

// ---------- 地图生成 ----------

const ACT1_BATTLE_POOL = ['momo', 'lulu', 'fifi', 'kiki', 'mimi', 'pipi'];
const ACT1_ELITE_POOL = ['sisi', 'gora'];
const ACT2_BATTLE_POOL = ['momo_queen', 'lulu_king', 'fifi_king', 'sisi', 'gora'];
const ACT2_ELITE_POOL = ['momo_god'];
const ACT3_BATTLE_POOL = ['momo_queen', 'fifi_king', 'sisi', 'gora', 'momo_god'];
const ACT3_ELITE_POOL = ['momo_god'];
const BOSSES = ['boss_vine', 'boss_dark', 'boss_fire'];
const RECRUIT_POOL = ['momo', 'lulu', 'fifi', 'kiki', 'mimi', 'pipi'];

/** 中间层节点类型加权随机：越靠后精英越多，前期偏战斗/奇遇 */
function middleNodeType(rng: () => number, progress: number): NodeType {
  const r = rng();
  if (progress < 0.25) {
    if (r < 0.7) return 'battle';
    if (r < 0.9) return 'event';
    return 'elite';
  }
  if (progress < 0.7) {
    if (r < 0.4) return 'battle';
    if (r < 0.55) return 'shop';
    if (r < 0.7) return 'rest';
    if (r < 0.85) return 'event';
    return 'elite';
  }
  if (r < 0.45) return 'battle';
  if (r < 0.7) return 'elite';
  if (r < 0.8) return 'shop';
  if (r < 0.9) return 'rest';
  return 'event';
}

function buildEncounter(rng: () => number, type: NodeType, act: number, progress: number): { speciesId: string; level: number }[] {
  const lv = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
  const one = (pool: string[], lo: number, hi: number) => ({ speciesId: pick(rng, pool), level: lv(lo, hi) });
  if (type === 'boss') {
    return [{ speciesId: BOSSES[act - 1], level: lv(3 + act, 4 + act) }];
  }
  if (type === 'elite') {
    if (act === 1) return [one(ACT1_ELITE_POOL, 2, 3)];
    if (act === 2) return [one(ACT2_ELITE_POOL, 4, 5)];
    return [one(ACT3_ELITE_POOL, 6, 7), one(ACT2_BATTLE_POOL, 5, 6)];
  }
  // battle
  const early = progress < 0.2;
  const late = progress > 0.6;
  if (act === 1) {
    const count = early ? 1 : late ? lv(2, 3) : 2;
    const level = early ? 1 : late ? lv(2, 3) : lv(1, 2);
    return Array.from({ length: count }, () => one(ACT1_BATTLE_POOL, level, level));
  }
  if (act === 2) {
    const count = early ? 2 : lv(2, 3);
    const level = early ? lv(3, 4) : lv(3, 5);
    return Array.from({ length: count }, () => one(ACT2_BATTLE_POOL, level, level));
  }
  const count = early ? 2 : lv(2, 3);
  const level = early ? lv(5, 6) : lv(5, 7);
  return Array.from({ length: count }, () => one(ACT3_BATTLE_POOL, level, level));
}

/** 随机事件：多选一抉择，风险与收益并存（结果在生成时用种子预掷，可复现） */
export function buildEvent(rng: () => number): EventNode {
  const roll = rng();
  const foodId = pick(rng, Object.keys(FOODS));
  const monsterId = pick(rng, RECRUIT_POOL);
  const c = (id: number, label: string, desc: string, kind: EventChoice['kind'], extra?: Partial<EventChoice>): EventChoice => ({
    id: `e${id}`,
    label,
    desc,
    kind,
    ...extra,
  });
  if (roll < 0.2) {
    return {
      title: '神秘泉水',
      desc: '一汪泛着微光的泉水在密林深处静静流淌，似有治愈之力。',
      choices: [
        c(1, '饮用泉水', '全体恢复 30% 生命', 'heal', { amount: 30 }),
        c(2, '以泉水入药', '全体恢复 50% 生命，但损失 10 金币', 'heal', { amount: 50, goldDelta: -10 }),
        c(3, '离开', '不打扰这片宁静', 'none'),
      ],
    };
  }
  if (roll < 0.4) {
    return {
      title: '古老祭坛',
      desc: '一座刻满符文的祭坛散发着危险而诱人的力量。',
      choices: [
        c(1, '献上金币祈愿', '损失 20 金币，全体获得大量经验', 'exp', { amount: 30, goldDelta: -20 }),
        c(2, '鲁莽触碰', '符文能量灼伤全队（失去 15% 生命）', 'damage', { amount: 15 }),
        c(3, '离开', '敬畏地绕开祭坛', 'none'),
      ],
    };
  }
  if (roll < 0.6) {
    return {
      title: '流浪商人',
      desc: '一位背着鼓鼓行囊的商人在路边歇脚，愿意与你交易。',
      choices: [
        c(1, '购买补给', `损失 15 金币，获得 1 个${FOODS[foodId].name}`, 'food', { foodId, goldDelta: -15 }),
        c(2, '打探消息', '获得 20 金币', 'gold', { amount: 20 }),
        c(3, '离开', '继续赶路', 'none'),
      ],
    };
  }
  if (roll < 0.8) {
    return {
      title: '神秘蛋',
      desc: '一颗布满奇异纹路的蛋静静躺在草丛中，轻轻颤动。',
      choices: [
        c(1, '孵化它', `随机宠物（${getMonster(monsterId).name}）加入队伍`, 'recruit', { monsterId }),
        c(2, '敲开蛋壳', '里面散落出 15 金币', 'gold', { amount: 15 }),
        c(3, '离开', '让命运保持神秘', 'none'),
      ],
    };
  }
  return {
    title: '训练营地',
    desc: '一片被踩实的空地，似乎曾被勇者用作训练场。',
    choices: [
      c(1, '严格训练', '全体获得经验', 'exp', { amount: 20 }),
      c(2, '休整半天', '全体恢复 20% 生命', 'heal', { amount: 20 }),
      c(3, '离开', '时间不等人', 'none'),
    ],
  };
}

export function generateMap(seed: number, act: number): RunMap {
  const rng = createRng(seed + act * 1013);
  const layerCount = randInt(rng, 5, 7);
  const encounter: Record<string, { speciesId: string; level: number }[]> = {};
  const boss: Record<string, { speciesId: string; level: number }[]> = {};
  const events: Record<string, EventNode> = {};

  const make = (type: NodeType, row: number, col: number): MapNode => ({
    id: nodeId(),
    type,
    label: labelOf(type, row),
    col,
  });

  const layers: MapNode[][] = [];
  for (let row = 0; row < layerCount; row++) {
    if (row === 0) {
      layers.push([make('battle', row, 0)]);
      continue;
    }
    if (row === layerCount - 1) {
      layers.push([make('boss', row, 0)]);
      continue;
    }
    const count = chance(rng, 0.5) ? 3 : 2;
    const progress = row / (layerCount - 1);
    const nodes: MapNode[] = [];
    for (let i = 0; i < count; i++) nodes.push(make(middleNodeType(rng, progress), row, i));
    layers.push(nodes);
  }

  // 保证每幕至少 1 商人、1 休整、1~2 次奇遇
  const setType = (node: MapNode, t: NodeType): void => {
    const row = layers.findIndex((r) => r.includes(node));
    node.type = t;
    node.label = labelOf(t, row);
  };
  const mid = layers.slice(1, -1).flat();
  if (mid.filter((n) => n.type === 'shop').length < 1) {
    const n = mid.find((x) => x.type === 'battle');
    if (n) setType(n, 'shop');
  }
  if (mid.filter((n) => n.type === 'rest').length < 1) {
    const n = mid.find((x) => x.type === 'battle');
    if (n) setType(n, 'rest');
  }
  const evNodes = mid.filter((n) => n.type === 'event');
  if (evNodes.length < 1) {
    const n = mid.find((x) => x.type === 'battle');
    if (n) setType(n, 'event');
  } else if (evNodes.length > 2) {
    evNodes.slice(2).forEach((n) => setType(n, 'battle'));
  }

  // 为所有节点生成遭遇/首领/事件内容
  for (let row = 0; row < layerCount; row++) {
    const progress = row / (layerCount - 1);
    for (const n of layers[row]) {
      if (n.type === 'boss') boss[n.id] = buildEncounter(rng, n.type, act, progress);
      else if (n.type === 'battle' || n.type === 'elite') encounter[n.id] = buildEncounter(rng, n.type, act, progress);
      else if (n.type === 'event') events[n.id] = buildEvent(rng);
    }
  }
  return { layers, encounter, boss, events };
}

function labelOf(t: NodeType, row: number): string {
  switch (t) {
    case 'battle':
      return row === 0 ? '出发' : '遭遇战';
    case 'elite':
      return '精英怪';
    case 'rest':
      return '休整';
    case 'shop':
      return '商人';
    case 'event':
      return '奇遇';
    case 'boss':
      return '首领';
  }
}

// ---------- 队伍与成长 ----------

/** 该物种的下一段进化等级；不可进化返回 undefined */
export function nextEvolutionLevel(speciesId: string): number | undefined {
  return getMonster(speciesId).evolutions?.[0]?.level;
}

function levelUpUnit(unit: Unit): Unit {
  const next = unit.level + 1;
  const stats = computeStats(unit.speciesId, next);
  const hpDelta = stats.maxHp - unit.maxHp;
  return {
    ...unit,
    level: next,
    maxHp: stats.maxHp,
    hp: Math.min(stats.maxHp, unit.hp + Math.max(0, hpDelta)),
    atk: stats.atk,
    spd: stats.spd,
    def: stats.def,
    exp: 0,
    expToLevel: 10 * next,
    skills: unlockedSkills(unit.speciesId, next),
  };
}

/** 获取经验并升级；若升级会跨过进化等级则经验冻结在该级满经验（局内不可进化） */
export function gainExp(unit: Unit, amount: number): Unit {
  let u = { ...unit };
  const th = nextEvolutionLevel(u.speciesId);
  if (th !== undefined && u.level >= th) return u;
  let remaining = amount;
  while (remaining > 0) {
    const need = u.expToLevel - u.exp;
    if (remaining < need) {
      u = { ...u, exp: u.exp + remaining };
      break;
    }
    const next = u.level + 1;
    if (th !== undefined && next === th) {
      u = { ...u, exp: u.expToLevel };
      break;
    }
    remaining -= need;
    u = levelUpUnit(u);
  }
  return u;
}

export function evolveUnit(unit: Unit): Unit | null {
  const sp = getMonster(unit.speciesId);
  const evo = sp.evolutions?.[0];
  if (!evo || unit.level < evo.level) return null;
  const stats = computeStats(evo.to, unit.level);
  const hpDelta = stats.maxHp - unit.maxHp;
  return {
    ...unit,
    speciesId: evo.to,
    name: getMonster(evo.to).name,
    emoji: getMonster(evo.to).emoji,
    element: getMonster(evo.to).element,
    maxHp: stats.maxHp,
    hp: Math.min(stats.maxHp, unit.hp + Math.max(0, hpDelta)),
    atk: stats.atk,
    spd: stats.spd,
    def: stats.def,
    skills: unlockedSkills(evo.to, unit.level),
  };
}

/** 是否已达到进化等级（局内经验冻结，局末自动进化） */
export function pendingEvolve(unit: Unit): boolean {
  const th = nextEvolutionLevel(unit.speciesId);
  if (th === undefined) return false;
  return unit.level >= th || (unit.level === th - 1 && unit.exp >= unit.expToLevel);
}

/** 局末结算：所有达到进化等级的宠物自动进化一次（属性/外观随新形态更新） */
export function settleEvolutions(state: GameState): GameState {
  const log: string[] = [];
  const roster = state.roster.map((u) => {
    const sp = getMonster(u.speciesId);
    const evo = sp.evolutions?.[0];
    if (!evo || !pendingEvolve(u)) return u;
    let nu = u;
    if (nu.level < evo.level) nu = levelUpUnit(nu);
    const evolved = evolveUnit(nu);
    if (!evolved) return u;
    log.push(`${nu.name} 进化成了 ${evolved.name}！`);
    return evolved;
  });
  if (log.length === 0) return state;
  return { ...state, roster, log: [...log, ...state.log].slice(0, 20) };
}

// ---------- 奖励 ----------

export function generateRewards(state: GameState): RewardChoice[] {
  const rng = createRng(state.seed + state.act * 7 + state.currentRow * 31);
  const options: RewardChoice[] = [
    {
      id: 'r-food',
      label: '补给品',
      desc: '获得 1 个随机食物',
      kind: 'food',
      foodId: pick(rng, Object.keys(FOODS)),
    },
    {
      id: 'r-heal',
      label: '休养',
      desc: '全体恢复 30% 生命',
      kind: 'heal',
      amount: 30,
    },
  ];
  const space = state.roster.length < ROSTER_MAX;
  if (space) {
    options.push({
      id: 'r-recruit',
      label: '招募',
      desc: '随机一只普通宠物加入队伍',
      kind: 'recruit',
      monsterId: pick(rng, ['kiki', 'mimi', 'pipi', 'momo', 'lulu', 'fifi']),
    });
  }
  // 第 1 行（出发）奖励必含招募，保证前期扩员
  if (state.currentRow === 0 && !options.some((o) => o.kind === 'recruit')) {
    options.unshift({
      id: 'r-recruit',
      label: '招募',
      desc: '随机一只普通宠物加入队伍',
      kind: 'recruit',
      monsterId: pick(rng, ['kiki', 'mimi', 'pipi', 'momo', 'lulu', 'fifi']),
    });
  }
  return shuffle(rng, options).slice(0, 2);
}

export function canTameEnemy(enemy: Unit): boolean {
  return enemy.tameable && enemy.hp > 0 && enemy.hp / enemy.maxHp <= 0.4;
}

export function currentFoodList(state: GameState): FoodDef[] {
  return Object.entries(state.inventory)
    .filter(([, count]) => count > 0)
    .map(([id]) => getFood(id));
}
