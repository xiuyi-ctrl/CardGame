import type { BattleState, FoodDef, Unit } from '../types';
import { getMonster, fusionNeed } from '../data/monsters';
import { getFood, FOODS } from '../data/foods';
import { createRng, pick, randInt, shuffle } from '../rng';
import { computeStats, makeUnit } from '../core/battle';

export type NodeType =
  | 'battle'
  | 'elite'
  | 'rest'
  | 'shop'
  | 'event'
  | 'special'
  | 'boss'
  | 'arena'
  | 'gauntlet'
  | 'corrupted'
  | 'watchtower'
  | 'sync'
  | 'guardian'
  | 'keydoor';

export interface MapNode {
  id: string;
  type: NodeType;
  label: string;
  /** 列序号：本行第几个节点，用于判断下一层相邻路线 */
  col: number;
  /** 被侵蚀节点 debuff：'spd' 我方速度 -10% | 'dmg' 我方受到伤害 +10% */
  corruptDebuff?: 'spd' | 'dmg';
  /** 被侵蚀节点奖励翻倍方式：'gold' 金币翻倍 | 'food' 食物翻倍 */
  corruptReward?: 'gold' | 'food';
  /** 车轮战敌人数：2 或 3 */
  gauntletSize?: 2 | 3;
  /** 同步双节点：配对节点 id（同一行相邻，虚线相连；抵达其一另一消失） */
  pairedId?: string;
  /** 钥匙门节点：对应守卫节点 id（击败守卫获得专用钥匙） */
  guardianId?: string;
}

/**
 * 相邻路线判定：从当前行 currentRow、当前列 currentCol 能否踏上下一行节点 node。
 * - 出发层（currentRow === 0，即尚未出发或站在出发节点）可直达下一层任意节点；
 * - currentCol 为 null/undefined 表示旧存档或状态异常，放行；
 * - 节点无 col（旧存档）时放行；
 * - 已失效节点（同步双节点被开启后的配对节点）不可到达；
 * - 其余要求列号相差不超过 1（末层首领同样遵循相邻寻路）。
 */
export function canStepTo(
  currentRow: number,
  currentCol: number | null | undefined,
  node: MapNode,
  map?: RunMap,
): boolean {
  if (map?.disabled?.[node.id]) return false;
  if (currentRow === 0) return true;
  if (currentCol == null) return true;
  if (typeof node.col !== 'number') return true;
  return Math.abs(node.col - currentCol) <= 1;
}

export interface EventChoice {
  id: string;
  label: string;
  desc: string;
  kind: 'heal' | 'gold' | 'food' | 'recruit' | 'damage' | 'item' | 'none';
  /** heal/damage=百分比，gold=金额 */
  amount?: number;
  /** 金币变动（food/exp 附加） */
  goldDelta?: number;
  foodId?: string;
  monsterId?: string;
  /** item 道具 id */
  itemId?: string;
}

export interface EventNode {
  title: string;
  desc: string;
  choices: EventChoice[];
}

/** 奇遇关高级奖励类型 */
export type SpecialRewardKind = 'evolve' | 'superevolve' | 'gold' | 'boost' | 'custom' | 'item';

export interface SpecialReward {
  id: string;
  label: string;
  desc: string;
  kind: SpecialRewardKind;
  /** gold 的金额 */
  amount?: number;
  /** item 的（道具或食物）id */
  itemId?: string;
}

export interface SpecialNode {
  title: string;
  desc: string;
  rewards: SpecialReward[];
}

export const SPECIAL_REWARDS: SpecialReward[] = [
  { id: 'sr-evolve', label: '进化之光', desc: '选择一只宠物免费融合进化到下一形态', kind: 'evolve' },
  { id: 'sr-gold', label: '龙之宝藏', desc: '获得 60 金币', kind: 'gold', amount: 60 },
  { id: 'sr-golden-fruit', label: '圣果', desc: '获得 1 个必定驯服的圣果', kind: 'item', itemId: 'golden_fruit' },
  { id: 'sr-boost', label: '属性强化', desc: '选择一只宠物，永久提升生命+3 或速度+1', kind: 'boost' },
  { id: 'sr-custom', label: '造物·自创生物', desc: '从三种属性模板中创造一只独特生物，技能随机组合', kind: 'custom' },
  { id: 'sr-superevolve', label: '超进化', desc: '选择一只宠物融合进化，但附带随机负面诅咒', kind: 'superevolve' },
  { id: 'sr-purify', label: '净化药水', desc: '获得 1 瓶清除负面诅咒的药水', kind: 'item', itemId: 'purify' },
  { id: 'sr-skip', label: '跳关道具', desc: '获得 1 个可跳过战斗关卡的跳关道具', kind: 'item', itemId: 'skip' },
];

export const CUSTOM_PRESETS = ['custom_guardian', 'custom_fury', 'custom_gale'] as const;

export const CURSE_CN: Record<NonNullable<Unit['curse']>, string> = {
  hpDown: '血脆',
  atkDown: '虚弱',
  spdDown: '迟缓',
};

export interface RunMap {
  layers: MapNode[][];
  encounter: Record<string, { speciesId: string }[]>;
  boss: Record<string, { speciesId: string }[]>;
  events: Record<string, EventNode>;
  specials: Record<string, SpecialNode>;
  /** 已失效（消失/已开启）的节点 id：同步双节点被开启后配对节点消失、钥匙门开启后失效 */
  disabled?: Record<string, boolean>;
}

export type Screen =
  | 'title'
  | 'starter'
  | 'map'
  | 'formation'
  | 'battle'
  | 'reward'
  | 'roster'
  | 'shop'
  | 'rest'
  | 'event'
  | 'special'
  | 'custom'
  | 'boost'
  | 'gameover'
  | 'victory'
  | 'watchtower'
  | 'chest'
  | 'backpack'
  | 'tame-overflow';

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
  /** 奇遇关奖励进行中：进化/超进化（等待玩家在队伍中点选）或属性强化（等待选属性）；斗兽场等待选择出战宠物 */
  specialPending?:
    | { kind: 'evolve'; super: boolean }
    | { kind: 'boost'; uid: string }
    | { kind: 'arena'; uid: string };
  /** 本次商人节点是否已购买过食物（买了就不能再立即休整） */
  shopBought?: boolean;
  /** 本次商人节点已购买的物品 id（每种物品每次进入商店限购 1 次） */
  shopBoughtItems?: string[];
  /** 本次商人节点在售的 4 个随机物品 id（按节点确定性生成，重进同一商店不变） */
  shopStock?: string[];
  /** 宝箱/钥匙门开启结果（chest 界面展示的文本列表） */
  chestResult?: string[];
  /** 本幕已访问的瞭望塔节点 ID 列表 */
  visitedWatchtowers?: string[];
  /** 当前预览的瞭望塔节点 ID（打开瞭望界面时设置，关闭时清空） */
  watchtowerPreviewNodeId?: string;
  /** 本幕已走过的节点 ID 列表（按访问顺序，用于绘制路径高亮） */
  visitedNodeIds?: string[];
  /** 队伍已满（ROSTER_MAX）时捕捉溢出、等待玩家处理的宠物（替换/融合/放弃） */
  tameOverflow?: Unit[];
  /** 布阵：进入普通/精英/被侵蚀/守卫战斗前选择站位（FORMATION_CONFIRM 确认后创建战斗） */
  formation?: {
    units: Unit[];
    encounter: { speciesId: string }[];
    nodeId: string;
    options?: { corruptDebuff?: 'spd' | 'dmg'; untameable?: boolean };
  };
  /** 侦查符使用结果：查看指定节点情报（背包界面展示） */
  scoutResult?: { nodeId: string; title: string; detail: string } | null;
  /** 侦查选择模式：打开背包使用侦查符后跳回地图，点击任意节点查看情报 */
  scoutSelecting?: boolean;
  /** 跳关选择模式：打开背包使用跳关道具后跳回地图，点击可达的战斗类节点直接获得奖励 */
  skipSelecting?: boolean;
  /** 打开背包前所在的界面（关闭背包时返回） */
  backpackFrom?: Screen;
}

export const ROSTER_MAX = 8;
/** 出战宠物上限（2v2/3v3/4v4，roster≥5 时可能 4v4） */
export const FIELD_MAX = 4;

/** 地图节点图标（UI 与侦查/瞭望共用） */
export const NODE_ICON: Record<NodeType, string> = {
  battle: '⚔️',
  elite: '💀',
  rest: '🛌',
  shop: '🏪',
  event: '📜',
  special: '💎',
  boss: '👑',
  arena: '🗡️',
  gauntlet: '🔥',
  corrupted: '🌑',
  watchtower: '🔭',
  sync: '🎁',
  guardian: '🛡️',
  keydoor: '🔒',
};

export interface NodeInfo {
  icon: string;
  title: string;
  detail: string;
}

/** 查看单个节点的情报（侦查符 / 瞭望塔共用）：按节点类型展示敌人/货物/事件等内容 */
export function nodeInfo(state: GameState, n: MapNode): NodeInfo {
  const enc = state.map.encounter[n.id];
  const encDetail = (list?: { speciesId: string }[]): string =>
    list && list.length > 0
      ? list.map((x) => `${getMonster(x.speciesId).emoji} ${getMonster(x.speciesId).name}`).join('、')
      : '—';
  switch (n.type) {
    case 'battle':
    case 'elite':
    case 'arena':
    case 'gauntlet':
    case 'corrupted':
      return { icon: NODE_ICON[n.type], title: n.label, detail: encDetail(enc) };
    case 'boss': {
      const e = state.map.boss[n.id]?.[0];
      return {
        icon: NODE_ICON.boss,
        title: n.label,
        detail: e ? `${getMonster(e.speciesId).emoji} ${getMonster(e.speciesId).name}（首领）` : '—',
      };
    }
    case 'shop':
      return {
        icon: NODE_ICON.shop,
        title: '商店',
        detail: '🍓 浆果 5 金 · 🍖 鲜肉 9 金 · 💎 秘晶 14 金（每店每种限购 1 次）',
      };
    case 'event': {
      const ev = state.map.events[n.id];
      return { icon: NODE_ICON.event, title: ev?.title ?? '事件', detail: ev ? ev.choices.map((c) => c.label).join(' ／ ') : '—' };
    }
    case 'special': {
      const sp = state.map.specials[n.id];
      return { icon: NODE_ICON.special, title: sp?.title ?? '奇遇关', detail: sp ? sp.rewards.map((r) => r.label).join(' ／ ') : '—' };
    }
    case 'watchtower':
      return { icon: NODE_ICON.watchtower, title: '瞭望塔', detail: '可以在此继续瞭望更下层' };
    case 'guardian':
      return { icon: NODE_ICON.guardian, title: n.label, detail: `${encDetail(enc)}（守卫·不可驯服，击败获得专用钥匙）` };
    case 'keydoor':
      return { icon: NODE_ICON.keydoor, title: n.label, detail: '需击败对应守卫取得钥匙后开启高级宝箱' };
    case 'sync':
      return { icon: NODE_ICON.sync, title: n.label, detail: '双生宝箱：与配对宝箱二选一（持双生符可同时开启）' };
    default:
      return { icon: NODE_ICON[n.type], title: n.label, detail: '' };
  }
}

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
const RECRUIT_POOL = ['momo', 'lulu', 'fifi', 'kiki', 'mimi', 'pipi'];

/** 每幕首领候选池：末层 2~3 个首领节点从对应幕的池中随机抽取（不重复）。部分首领只在指定幕出现。 */
export const ACT_BOSS_POOLS: Record<number, string[]> = {
  1: ['boss_vine', 'boss_crab', 'boss_golem'],
  2: ['boss_dark', 'boss_moss', 'boss_ghost'],
  3: ['boss_fire', 'boss_dragon', 'boss_demon'],
};

/** 中间层节点类型加权随机：越靠后精英越多，前期偏战斗/事件；奇遇关为低概率稀有节点；休整并入商人（不再生成 rest） */
function middleNodeType(rng: () => number, progress: number): NodeType {
  const r = rng();
  // 战斗类节点变体：80% 普通遭遇战、10% 斗兽场（1v1）、10% 车轮战（轮换上阵）
  const battleVariant = (): NodeType => {
    const vr = rng();
    if (vr < 0.8) return 'battle';
    if (vr < 0.9) return 'arena';
    return 'gauntlet';
  };
  if (progress < 0.2) {
    if (r < 0.77) return battleVariant();
    if (r < 0.92) return 'event';
    return 'elite';
  }
  if (progress < 0.6) {
    if (r < 0.34) return battleVariant();
    if (r < 0.51) return 'shop';
    if (r < 0.73) return 'event';
    if (r < 0.9) return 'elite';
    if (r < 0.94) return 'special';
    return 'watchtower';
  }
  if (r < 0.3) return battleVariant();
  if (r < 0.5) return 'elite';
  if (r < 0.68) return 'shop';
  if (r < 0.76) return 'event';
  if (r < 0.85) return 'special';
  if (r < 0.89) return 'watchtower';
  return battleVariant();
}

function buildEncounter(
  rng: () => number,
  type: NodeType,
  act: number,
  progress: number,
  bossId?: string,
  gauntletSize?: 2 | 3,
): { speciesId: string }[] {
  const one = (pool: string[]) => ({ speciesId: pick(rng, pool) });
  if (type === 'boss') {
    return [{ speciesId: bossId ?? ACT_BOSS_POOLS[act][0] }];
  }
  if (type === 'elite') {
    if (act === 1) return [one(ACT1_ELITE_POOL)];
    if (act === 2) return [one(ACT2_ELITE_POOL)];
    return [one(ACT3_ELITE_POOL), one(ACT2_BATTLE_POOL)];
  }
  // 斗兽场：1v1 单挑较强野生怪（精英池）
  if (type === 'arena') {
    const pool = act === 1 ? ACT1_ELITE_POOL : act === 2 ? ACT2_ELITE_POOL : ACT3_ELITE_POOL;
    return [one(pool)];
  }
  // 车轮战：2~3 只轮换上阵（数量由节点要求决定）
  if (type === 'gauntlet') {
    const size = gauntletSize ?? (act === 1 ? 2 : 2 + Math.floor(rng() * 2));
    const pool = act === 1 ? ACT1_BATTLE_POOL : act === 2 ? ACT2_BATTLE_POOL : ACT3_BATTLE_POOL;
    return Array.from({ length: size }, () => one(pool));
  }
  // 守卫：强力怪物（精英池、数量更多、不可驯服），击败获得专用钥匙
  if (type === 'guardian') {
    const pool = act === 1 ? ACT1_ELITE_POOL : act === 2 ? ACT2_ELITE_POOL : ACT3_ELITE_POOL;
    const count = act === 1 ? 1 : 1 + Math.floor(rng() * 2);
    return Array.from({ length: count }, () => one(pool));
  }
  // battle
  const early = progress < 0.2;
  const late = progress > 0.6;
  if (act === 1) {
    const count = early ? 1 : late ? 2 + Math.floor(rng() * 2) : 2;
    return Array.from({ length: count }, () => one(ACT1_BATTLE_POOL));
  }
  if (act === 2) {
    const count = early ? 2 : 2 + Math.floor(rng() * 2);
    return Array.from({ length: count }, () => one(ACT2_BATTLE_POOL));
  }
  const count = early ? 2 : 2 + Math.floor(rng() * 2);
  return Array.from({ length: count }, () => one(ACT3_BATTLE_POOL));
}

/** 随机事件：多选一抉择，风险与收益并存（结果在生成时用种子预掷，可复现） */export function buildEvent(rng: () => number): EventNode {
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
        c(1, '献上金币祈愿', '损失 20 金币，全体恢复 40% 生命', 'heal', { amount: 40, goldDelta: -20 }),
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
        c(1, '孵化它', '一只神秘生物破壳而出，加入队伍', 'recruit', { monsterId }),
        c(2, '敲开蛋壳', '里面散落出 15 金币', 'gold', { amount: 15 }),
        c(3, '离开', '让命运保持神秘', 'none'),
      ],
    };
  }
  if (roll < 0.92) {
    return {
      title: '神秘行商',
      desc: '一位兜售奇物符文的游商，称他的货能解开远古双生宝箱的秘密。',
      choices: [
        c(1, '购得侦察符', '获得 1 个「侦察符」（使用后可查看指定一关的情报）', 'item', { itemId: 'scout' }),
        c(2, '购得双生符', '获得 1 个「双生符」（抵达双生宝箱时可同时开启两个宝箱）', 'item', { itemId: 'twin' }),
        c(3, '离开', '继续赶路', 'none'),
      ],
    };
  }
  return {
      title: '训练营地',
    desc: '一片被踩实的空地，似乎曾被勇者用作训练场。',
    choices: [
      c(1, '严格训练', '全体恢复 30% 生命', 'heal', { amount: 30 }),
      c(2, '休整半天', '全体恢复 20% 生命', 'heal', { amount: 20 }),
      c(3, '离开', '时间不等人', 'none'),
    ],
  };
}

/** 奇遇关：从高级奖励池洗牌抽 3 个（种子预掷，可复现） */
export function buildSpecial(rng: () => number): SpecialNode {
  const rewards = shuffle(rng, [...SPECIAL_REWARDS]).slice(0, 3);
  const titles = ['神秘裂隙', '命运回廊', '星辉祭坛'];
  return {
    title: pick(rng, titles),
    desc: '一道泛着星光的裂隙缓缓睁开，其中蕴含着不可思议的机遇与代价。',
    rewards,
  };
}

/** 斗兽场/车轮战失败后的惩罚事件：多选一承受代价（宠物不会阵亡） */
export function buildPunishmentEvent(rng: () => number): EventNode {
  const roll = rng();
  const damage = 15 + Math.floor(rng() * 11); // 15~25
  const goldLoss = 20 + Math.floor(rng() * 16); // 20~35
  return {
    title: roll < 0.5 ? '挑战落败' : '铩羽而归',
    desc: '没能通过这场挑战，队伍付出了代价……（此战没有宠物阵亡）',
    choices: [
      { id: 'p1', label: '承受伤痛', desc: `全体失去 ${damage}% 生命`, kind: 'damage', amount: damage },
      { id: 'p2', label: '破财消灾', desc: `失去 ${goldLoss} 金币`, kind: 'gold', amount: -goldLoss },
    ],
  };
}

/** 斗兽场/车轮战胜利奖励：3 选 1 的丰厚选择（金币/食物/治疗/招募） */
export function generateChallengeRewards(state: GameState, type: 'arena' | 'gauntlet'): RewardChoice[] {
  const rng = createRng(state.seed * 173 + state.act * 37 + state.currentRow * 59 + (type === 'arena' ? 1 : 2));
  const options: RewardChoice[] = [
    { id: 'ch-gold', label: '冠军赏金', desc: '获得 30 金币', kind: 'gold', amount: 30 },
    { id: 'ch-food', label: '美味补给', desc: '获得 1 个随机食物', kind: 'food', foodId: pick(rng, Object.keys(FOODS)) },
    { id: 'ch-heal', label: '庆功宴', desc: '全体恢复 50% 生命', kind: 'heal', amount: 50 },
  ];
  if (state.roster.length < ROSTER_MAX) {
    options.push({
      id: 'ch-recruit',
      label: '斗士招募',
      desc: '随机一只普通宠物加入队伍',
      kind: 'recruit',
      monsterId: pick(rng, RECRUIT_POOL),
    });
  }
  return shuffle(rng, options).slice(0, 3);
}

export function generateMap(seed: number, act: number): RunMap {
  const rng = createRng(seed + act * 1013);
  const layerCount = randInt(rng, 8, 10);
  const encounter: Record<string, { speciesId: string }[]> = {};
  const boss: Record<string, { speciesId: string }[]> = {};
  const events: Record<string, EventNode> = {};
  const specials: Record<string, SpecialNode> = {};

  const make = (type: NodeType, row: number, col: number): MapNode => ({
    id: nodeId(),
    type,
    label: labelOf(type, row),
    col,
  });

  const layers: MapNode[][] = [];
  // 保证相邻路线双向无死路：
  // - 向下：本行节点数至少为上一行 -1（任意列 c 在下一行都有 col ∈ [c-1, c+1] 的节点可走）；
  // - 向上：本行节点数最多为上一行 +1（上一行列 0..prevCount-1 只能到达下一行列 0..prevCount，
  //   否则最右节点无父节点、永远不可达）。后者由下方 `row > 1` 的上限约束实现。
  let prevCount = 1;
  // 末层首领池（shuffle 后按列分配，保证不重复）
  let actBossPool: string[] = [];
  for (let row = 0; row < layerCount; row++) {
    if (row === 0) {
      layers.push([make('battle', row, 0)]);
      continue;
    }
    if (row === layerCount - 1) {
      // 末层：2~3 个首领节点，均遵循寻路逻辑。数量纯随机（randInt 2~3），不受上一行节点数约束。
      const m = randInt(rng, 2, 3);
      actBossPool = shuffle(rng, ACT_BOSS_POOLS[act]).slice(0, m);
      layers.push(Array.from({ length: m }, (_, i) => make('boss', row, i)));
      continue;
    }
    let count = Math.max(prevCount - 1, randInt(rng, 3, 5));
    // 可达性：本行数量 ≤ 上一行+1，避免上一行只有 3 个节点时下一行 5 个导致最右节点无父、不可达。
    // 第 1 行除外：出发层（row 0）可直达下一层任意节点，不受列约束。
    if (row > 1) count = Math.min(count, prevCount + 1);
    // 末层数量纯随机 2~3，为保无死路需倒数第二行 ≤3（k≥2 时 p≤k+1）。
    // 而倒数第二行被压到 ≤3 时，倒数第三行必须 ≤4，否则其最右列走不到倒数第二行。
    if (row === layerCount - 2) count = Math.min(3, count);
    else if (row === layerCount - 3) count = Math.min(4, count);
    prevCount = count;
    const progress = row / (layerCount - 1);
    const nodes: MapNode[] = [];
    for (let i = 0; i < count; i++) {
      const n = make(middleNodeType(rng, progress), row, i);
      if (n.type === 'gauntlet') n.gauntletSize = rng() < 0.5 ? 2 : 3;
      nodes.push(n);
    }
    layers.push(nodes);
  }

  // 事件每幕 3~5 个、商人每幕 2~4 个（目标数量用种子预掷，可复现）；另保证最后两层必有一个商人
  const setType = (node: MapNode, t: NodeType): void => {
    const row = layers.findIndex((r) => r.includes(node));
    node.type = t;
    node.label = labelOf(t, row);
  };
  const mid = layers.slice(1, -1).flat();
  // 出发后第 1 行强制全部战斗
  const forcedRows = new Set([1]);
  layers[1].forEach((n) => setType(n, 'battle'));
  // 候选节点：非强制战斗行的普通战斗节点（保证逻辑不破坏 row1 纯战斗）
  const candidateBattles = () => mid.filter((n) => n.type === 'battle' && !forcedRows.has(layers.findIndex((r) => r.includes(n))));
  const countOf = (t: NodeType) => mid.filter((n) => n.type === t).length;
  // 奇遇关每幕最多 1 个：多余转为战斗
  const spNodes = mid.filter((n) => n.type === 'special');
  if (spNodes.length > 1) spNodes.slice(1).forEach((n) => setType(n, 'battle'));
  const evTarget = 3 + Math.floor(rng() * 3); // 3~5
  const shopTarget = 2 + Math.floor(rng() * 3); // 2~4
  // 超出上限的转回战斗
  const over = mid.filter((n) => n.type === 'event');
  if (over.length > 5) over.slice(5).forEach((n) => setType(n, 'battle'));
  const overShop = mid.filter((n) => n.type === 'shop');
  if (overShop.length > 4) overShop.slice(4).forEach((n) => setType(n, 'battle'));
  // 不足的从候选战斗节点补足（优先补事件，再补商人；不动强制战斗行）
  const ensure = (t: NodeType, target: number): void => {
    while (countOf(t) < target) {
      const n = candidateBattles()[0];
      if (!n) break;
      setType(n, t);
    }
  };
  ensure('event', evTarget);
  ensure('shop', shopTarget);
  // 全部战斗的行数上限 2（row1 强制 + 至多 1 行随机巧合）：超出则把靠后的整行战斗行改为事件/商人（仍不超出上限）
  const allBattleRows = () =>
    layers.slice(1, -1).map((row, idx) => ({ row, idx: idx + 1 })).filter(({ row }) => row.every((n) => n.type === 'battle'));
  for (const { row } of allBattleRows().slice(2)) {
    const n = row[Math.floor(rng() * row.length)];
    setType(n, countOf('event') < 5 ? 'event' : countOf('shop') < 4 ? 'shop' : 'elite');
  }

  // 最后两层（首领前两行）必存在一个商人：若都没有，把最靠后一行中一个普通战斗节点改写为商人
  const tailRows = layers.slice(-3, -1);
  if (!tailRows.some((row) => row.some((n) => n.type === 'shop'))) {
    const tailBattle = [...tailRows]
      .reverse()
      .flat()
      .find((n) => n.type === 'battle' && !forcedRows.has(layers.findIndex((r) => r.includes(n))));
    const n = tailBattle ?? [...tailRows].reverse().flat().find((m) => m.type !== 'shop');
    if (n) setType(n, 'shop');
  }

  const lastRow = layers.length - 1;

  // 同步双节点：每幕 1~2 对。同一行两个相邻节点改写为「双生宝箱」（虚线相连，二选一；
  // 持侦察/加速道具可同时开启两个）。只覆盖普通战斗/精英节点，不破坏事件/商人数量保证。
  const syncPairs = randInt(rng, 1, 2);
  let syncMade = 0;
  for (let attempt = 0; attempt < syncPairs * 4 && syncMade < syncPairs; attempt++) {
    const row = randInt(rng, 2, lastRow - 1);
    const rowNodes = layers[row];
    for (let i = 0; i + 1 < rowNodes.length; i++) {
      const a = rowNodes[i];
      const b = rowNodes[i + 1];
      if ((a.type === 'battle' || a.type === 'elite') && (b.type === 'battle' || b.type === 'elite')) {
        a.type = 'sync';
        a.label = labelOf('sync', row);
        a.pairedId = b.id;
        b.type = 'sync';
        b.label = labelOf('sync', row);
        b.pairedId = a.id;
        syncMade += 1;
        break;
      }
    }
  }

  // 守卫 + 钥匙门：每幕 1~2 对。钥匙门在第 r 行，其上一行（r-1）相邻列生成对应守卫；
  // 击败守卫获得该门的专用钥匙后，钥匙门才可开启（高级宝箱）。
  const guardPairs = randInt(rng, 1, 2);
  let guardMade = 0;
  for (let attempt = 0; attempt < guardPairs * 6 && guardMade < guardPairs; attempt++) {
    const row = randInt(rng, 3, lastRow - 1);
    const rowNodes = layers[row];
    const prevNodes = layers[row - 1];
    const doorIdx = rowNodes.findIndex((n) => n.type === 'battle' || n.type === 'elite');
    if (doorIdx < 0) continue;
    const door = rowNodes[doorIdx];
    const guardNode = prevNodes.find(
      (n) => (n.type === 'battle' || n.type === 'elite') && Math.abs(n.col - door.col) <= 1,
    );
    if (!guardNode) continue;
    door.type = 'keydoor';
    door.label = labelOf('keydoor', row);
    door.guardianId = guardNode.id;
    guardNode.type = 'guardian';
    guardNode.label = labelOf('guardian', row - 1);
    guardMade += 1;
  }

  // 瞭望塔：首领关前 3 行内每一行以 20% 概率把该行一个战斗类节点（战斗/精英/被侵蚀）改写为瞭望塔
  // 不覆盖事件/商人/奇遇，也不动强制战斗行 1（此循环从第 2 行开始）
  for (let row = Math.max(2, lastRow - 3); row < lastRow; row++) {
    if (rng() < 0.2) {
      const candidates = layers[row].filter(
        (n) => n.type === 'battle' || n.type === 'elite' || n.type === 'corrupted',
      );
      if (candidates.length > 0) {
        const n = candidates[Math.floor(rng() * candidates.length)];
        n.type = 'watchtower';
        n.label = labelOf('watchtower', row);
      }
    }
  }

  // 被侵蚀节点：每 3~4 行间隔概率出现（行 2 起；不覆盖强制战斗行 1、商人/事件/奇遇/首领；间隔超 5 行则强制出现）
  let lastCorruptRow = 1;
  for (let row = 2; row < layers.length - 1; row++) {
    if (row - lastCorruptRow < 3) continue;
    const battles = layers[row].filter((n) => n.type === 'battle');
    if (battles.length === 0) continue;
    const force = row - lastCorruptRow >= 5;
    if (force || rng() < 0.5) {
      const n = battles[Math.floor(rng() * battles.length)];
      n.type = 'corrupted';
      n.label = labelOf('corrupted', row);
      n.corruptDebuff = rng() < 0.5 ? 'spd' : 'dmg';
      n.corruptReward = rng() < 0.5 ? 'gold' : 'food';
      lastCorruptRow = row;
    }
  }

  // 为所有节点生成遭遇/首领/事件/奇遇关内容
  for (let row = 0; row < layerCount; row++) {
    const progress = row / (layerCount - 1);
    for (const n of layers[row]) {
      if (n.type === 'boss') boss[n.id] = buildEncounter(rng, n.type, act, progress, actBossPool[n.col]);
      else if (n.type === 'battle' || n.type === 'elite') encounter[n.id] = buildEncounter(rng, n.type, act, progress);
      else if (n.type === 'arena') encounter[n.id] = buildEncounter(rng, 'arena', act, progress);
      else if (n.type === 'gauntlet') encounter[n.id] = buildEncounter(rng, 'gauntlet', act, progress, undefined, n.gauntletSize);
      else if (n.type === 'corrupted') encounter[n.id] = buildEncounter(rng, 'battle', act, progress);
      else if (n.type === 'guardian') encounter[n.id] = buildEncounter(rng, 'guardian', act, progress);
      else if (n.type === 'event') events[n.id] = buildEvent(rng);
      else if (n.type === 'special') specials[n.id] = buildSpecial(rng);
    }
  }
  return { layers, encounter, boss, events, specials };
}

/** 当前所在节点（按 currentRow + currentNodeId 定位） */
export function currentNode(state: GameState): MapNode | undefined {
  return state.map.layers[state.currentRow]?.find((n) => n.id === state.currentNodeId);
}

export function labelOf(t: NodeType, row: number): string {
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
      return '事件';
    case 'special':
      return '奇遇关';
    case 'boss':
      return '首领';
    case 'arena':
      return '斗兽场';
    case 'gauntlet':
      return '车轮战';
    case 'corrupted':
      return '被侵蚀';
    case 'watchtower':
      return '瞭望塔';
    case 'sync':
      return '双生宝箱';
    case 'guardian':
      return '守卫';
    case 'keydoor':
      return '钥匙门';
  }
}

// ---------- 队伍与成长 ----------

export interface BaseStats {
  maxHp: number;
  spd: number;
}

/** 把属性强化加成与负面诅咒折算进基准属性（融合/净化/强化时统一使用） */
export function applyMods(stats: BaseStats, u: Pick<Unit, 'bonusStats' | 'curse'>): BaseStats {
  let out = { ...stats };
  const b = u.bonusStats;
  if (b) {
    out = {
      ...out,
      maxHp: out.maxHp + (b.hp ?? 0),
      spd: out.spd + (b.spd ?? 0),
    };
  }
  if (u.curse === 'hpDown') out = { ...out, maxHp: Math.max(1, out.maxHp - 5) };
  else if (u.curse === 'spdDown') out = { ...out, spd: Math.max(1, out.spd - 1) };
  // 虚弱（atkDown）：伤害 -1，在战斗伤害结算中体现，不影响属性
  return out;
}

/** 以物种基准 + 加成/诅咒重算并回写属性（属性强化、净化后调用） */
export function recomputeStats(unit: Unit): Unit {
  const stats = applyMods(computeStats(unit.speciesId), unit);
  return {
    ...unit,
    maxHp: stats.maxHp,
    hp: Math.min(stats.maxHp, unit.hp + Math.max(0, stats.maxHp - unit.maxHp)),
    spd: stats.spd,
  };
}

/** 该物种可融合到的下一形态（不可融合返回 undefined） */
export function nextStage(speciesId: string): string | undefined {
  return getMonster(speciesId).evolutions?.[0]?.to;
}

/** 融合需要的同物种数量（含主宠自身）：第 n 阶需 n+1 只 */
export function fusionNeedCount(speciesId: string): number {
  return fusionNeed(speciesId);
}

/**
 * 融合：主宠 + 若干同物种材料 → 下一形态。
 * 结果宠继承主宠的 bonusStats/诅咒/自创技能，属性为新形态固定值，生命回满。
 * 材料（不含主宠）在调用前应从队伍移除。
 */
export function fuseUnit(primary: Unit): Unit | null {
  const target = nextStage(primary.speciesId);
  if (!target) return null;
  const stats = applyMods(computeStats(target), primary);
  const sp = getMonster(target);
  return {
    ...primary,
    speciesId: target,
    name: sp.name,
    emoji: sp.emoji,
    maxHp: stats.maxHp,
    hp: stats.maxHp,
    spd: stats.spd,
    skills: primary.customSkills ?? [...sp.skills],
  };
}

/** 造物·自创生物：按属性模板生成生物，技能从模板技能池随机组合 3 个 */
export function makeCustomUnit(presetId: string, rng: () => number): Unit {
  const s = getMonster(presetId);
  const u = makeUnit(presetId, true, 0, false);
  const customSkills = shuffle(rng, [...s.skills]).slice(0, 3);
  u.customSkills = customSkills;
  u.skills = customSkills;
  return u;
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

/** 被侵蚀节点奖励翻倍：把奖励池中的食物选项数量翻倍；若无食物选项则强制加入一个双份食物奖励 */
export function applyCorruptFoodReward(rewards: RewardChoice[], rngSeed: number): RewardChoice[] {
  const out = rewards.map((r) => (r.kind === 'food' ? { ...r, amount: 2, desc: '获得 2 个随机食物' } : r));
  if (!out.some((r) => r.kind === 'food')) {
    const rng = createRng(rngSeed);
    out[0] = {
      id: 'r-food-x2',
      label: '暗影战利品',
      desc: '获得 2 个随机食物',
      kind: 'food',
      foodId: pick(rng, Object.keys(FOODS)),
      amount: 2,
    };
  }
  return out;
}

export function canTameEnemy(enemy: Unit): boolean {
  return enemy.tameable && enemy.hp > 0 && enemy.hp / enemy.maxHp <= 0.4;
}

export function currentFoodList(state: GameState): FoodDef[] {
  return Object.entries(state.inventory)
    .filter(([id, count]) => count > 0 && FOODS[id])
    .map(([id]) => getFood(id));
}
