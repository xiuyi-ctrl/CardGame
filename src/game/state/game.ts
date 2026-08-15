import type { BattleState, FoodDef, Unit } from '../types';
import { getMonster, fusionNeed, BASE_POOL, EVO1_POOL, EVO2_POOL } from '../data/monsters';
import { getFood, FOODS } from '../data/foods';
import { ITEMS } from '../data/items';
import { createRng, pick, randInt, shuffle, weightedPick } from '../rng';
import { computeStats, makeUnit } from '../core/battle';

/** 字符串简单哈希（用于按节点 id 派生可复现随机） */
export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

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
  | 'gauntlet-order'
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
  | 'tame-overflow'
  | 'test-type'
  | 'test-pick'
  | 'test-config';

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
  /** 本次商人节点已刷新次数（0-3，刷新费用递增） */
  shopRefreshCount?: number;
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
  /** 溢出处理完毕后返回的界面：战斗驯服→'reward'；孵化→'map'；招募→'roster' */
  tameOverflowReturn?: 'reward' | 'map' | 'roster';
  /** 布阵：进入普通/精英/被侵蚀/守卫战斗前选择站位（FORMATION_CONFIRM 确认后创建战斗） */
  formation?: {
    units: Unit[];
    /** 默认自动布阵的出战宠物（带站位），布阵界面棋盘初始放置它们 */
    initialField: Unit[];
    encounter: { speciesId: string }[];
    nodeId: string;
    options?: { corruptDebuff?: 'spd' | 'dmg'; untameable?: boolean; act?: number; nodeType?: string };
    /** 移动前的位置（BACK_TO_MAP 时恢复） */
    prevRow?: number;
    prevNodeId?: string;
  };
  /** 车轮战：等待玩家选择出战顺序（GAUNTLET_ORDER_CONFIRM 确认后创建战斗） */
  gauntletOrder?: Unit[];
  /** 车轮战：敌方数量（n v n，顺序栏只解锁 n 个槽位） */
  gauntletSize?: number;
  /** 车轮战：移动前的位置（BACK_TO_MAP 时恢复） */
  gauntletPrevRow?: number;
  gauntletPrevNodeId?: string;
  /** 侦查符使用结果：查看指定节点情报（背包界面展示） */
  scoutResult?: { nodeId: string; title: string; detail: string } | null;
  /** 侦查选择模式：打开背包使用侦查符后跳回地图，点击任意节点查看情报 */
  scoutSelecting?: boolean;
  /** 跳关选择模式：打开背包使用跳关道具后跳回地图，点击可达的战斗类节点直接获得奖励 */
  skipSelecting?: boolean;
  /** 全局toast提示：选择奖励后显示获得的食物/宠物等信息 */
  toast?: { msg: string; kind?: 'info' | 'success' | 'error' };
  /** 打开背包前所在的界面（关闭背包时返回） */
  backpackFrom?: Screen;
  /** 自定义测试进行中：战斗结束后直接回首页 */
  testRun?: boolean;
  /** 自定义测试流程暂存：当前阶段（选我方/选敌方）、关卡类型、我方已选宠物 */
  testPick?: {
    side: 'player' | 'enemy';
    nodeType: MapNode['type'];
    corruptDebuff?: 'spd' | 'dmg';
    corruptReward?: 'gold' | 'food';
    playerUnits?: Unit[];
  };
  /** 自定义测试：选宠确认后、开战前暂存的战斗数据（test-config 界面确认后创建战斗） */
  pendingBattle?: {
    units: Unit[];
    encounter: { speciesId: string }[];
    seed: number;
    options?: { corruptDebuff?: 'spd' | 'dmg'; gauntlet?: boolean; untameable?: boolean; enemyExact?: boolean };
    nodeType: NodeType;
  };
  /** 战斗胜利后进入队伍管理界面：禁止选择出战，只能释放/融合 */
  postBattle?: boolean;
  /** 孵化预览：点击「孵化它」后暂存，弹出确认弹窗显示将孵化的宠物 */
  pendingEventHatch?: { choiceId: string; monsterId: string };
}

export const ROSTER_MAX = 8;
/** 出战宠物上限（最大 5 只，实际受敌方数量限制：敌方 n 只时玩家最多 n+1 只） */
export const FIELD_MAX = 5;
/** 根据敌方数量计算我方出战上限（n+1，不超过 FIELD_MAX） */
export function maxFieldForEnemy(enemyCount: number): number {
  return Math.min(enemyCount + 1, FIELD_MAX);
}

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
    case 'shop': {
      // 与进入商店时的库存生成保持一致（同一 seed 公式），保证侦查/瞭望塔看到的就是实际可购商品
      const row = state.map.layers.findIndex((r) => r.includes(n));
      const rng = createRng(state.seed * 7919 + row * 104729 + hashStr(n.id));
      const pool = [...Object.keys(FOODS).filter((id) => FOODS[id].shop !== false), ...Object.keys(ITEMS).filter((id) => ITEMS[id].price > 0)];
      const stock = shuffle(rng, pool).slice(0, 4);
      const goods = stock
        .map((id) => {
          const f = FOODS[id];
          if (f) return `${f.emoji} ${f.name} ${f.price} 金`;
          const it = ITEMS[id];
          return `${it.emoji} ${it.name} ${it.price} 金`;
        })
        .join('、');
      return {
        icon: NODE_ICON.shop,
        title: '商店',
        detail: `本店出售：${goods}（每种限购 1 次，花 5 金可休整）`,
      };
    }
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

const ACT3_PROGRESS_MOD = [
  { threshold: -0.3, mod: [20, -10, -10, 0] },
  { threshold: 0.7, mod: [-20, 5, 15, 15] },
];
const RECRUIT_POOL = ['momo', 'lulu', 'fifi', 'kiki', 'mimi', 'pipi'];

// ---- 第 1 幕固定遭遇表（第一幕敌人.md 设计） ----
// 普通战斗：按规模分表，加权抽取具体组合
const ACT1_ENCOUNTERS_1V1: readonly { species: string[]; weight: number }[] = [
  { species: ['momo'], weight: 1 },  // S1 迅迅
  { species: ['lulu'], weight: 1 },  // S2 泡泡
  { species: ['fifi'], weight: 1 },  // S3 灼灼
  { species: ['kiki'], weight: 1 },  // S4 铁墩
  { species: ['mimi'], weight: 1 },  // S5 咪咪
  { species: ['pipi'], weight: 1 },  // S6 刺刺
];
const ACT1_ENCOUNTERS_2V2: readonly { species: string[]; weight: number }[] = [
  { species: ['momo', 'fifi'], weight: 11 },  // D1 迅迅+灼灼
  { species: ['lulu', 'kiki'], weight: 11 },  // D2 泡泡+铁墩
  { species: ['mimi', 'pipi'], weight: 11 },  // D3 咪咪+刺刺
  { species: ['fifi', 'lulu'], weight: 11 },  // D4 灼灼+泡泡
  { species: ['kiki', 'mimi'], weight: 11 },  // D5 铁墩+咪咪
  { species: ['pipi', 'momo'], weight: 11 },  // D6 刺刺+迅迅
  { species: ['fifi', 'pipi'], weight: 11 },  // D7 灼灼+刺刺
  { species: ['lulu', 'mimi'], weight: 11 },  // D8 泡泡+咪咪
  { species: ['kiki', 'fifi'], weight: 12 },  // D9 铁墩+灼灼
];
const ACT1_ENCOUNTERS_3V3: readonly { species: string[]; weight: number }[] = [
  { species: ['fifi', 'fifi', 'momo'], weight: 12 },       // T1
  { species: ['lulu', 'lulu', 'kiki'], weight: 12 },       // T2
  { species: ['mimi', 'mimi', 'pipi'], weight: 12 },       // T3
  { species: ['kiki', 'kiki', 'lulu'], weight: 10 },       // T4
  { species: ['pipi', 'pipi', 'mimi'], weight: 10 },       // T5
  { species: ['momo', 'momo', 'fifi'], weight: 8 },        // T6
  { species: ['fifi', 'fifi', 'fifi'], weight: 8 },        // T7
  { species: ['lulu', 'lulu', 'lulu'], weight: 6 },        // T8
  { species: ['fifi', 'mimi', 'fifi'], weight: 12 },       // T9
  { species: ['kiki', 'pipi', 'kiki'], weight: 10 },       // T10
];
// 精英：6 种加权抽取
const ACT1_ELITE_ENCOUNTERS: readonly [string, number][] = [
  ['fifi_king', 20],   // E1 灼刃
  ['sisi', 20],        // E2 棘尾
  ['gora', 20],        // E3 铁卫
  ['momo_queen', 15],  // E4 迅牙
  ['lulu_king', 15],   // E5 泡泡将
  ['mimi_king', 10],   // E6 蟒影
];
// 车轮战：按出场顺序排列的固定阵容表
const ACT1_GAUNTLET_2: readonly { sequence: string[]; weight: number }[] = [
  { sequence: ['fifi', 'fifi'], weight: 20 },         // G1 双灼烧
  { sequence: ['lulu', 'kiki'], weight: 20 },         // G2 泡泡→铁墩
  { sequence: ['mimi', 'pipi'], weight: 18 },         // G3 咪咪→刺刺
  { sequence: ['momo', 'fifi'], weight: 16 },         // G4 迅迅→灼灼
  { sequence: ['kiki', 'kiki'], weight: 14 },         // G5 双铁墩
  { sequence: ['pipi', 'mimi'], weight: 12 },         // G6 刺刺→咪咪
];
const ACT1_GAUNTLET_3: readonly { sequence: string[]; weight: number }[] = [
  { sequence: ['fifi', 'mimi', 'fifi'], weight: 20 },       // G7 灼烧→毒→灼烧
  { sequence: ['lulu', 'kiki', 'lulu'], weight: 20 },       // G8 泡泡→铁墩→泡泡
  { sequence: ['pipi', 'kiki', 'pipi'], weight: 18 },       // G9 刺刺→铁墩→刺刺
  { sequence: ['momo', 'momo', 'fifi'], weight: 16 },       // G10 迅迅→迅迅→灼灼
  { sequence: ['mimi', 'mimi', 'pipi'], weight: 14 },       // G11 咪咪→咪咪→刺刺
  { sequence: ['fifi', 'kiki', 'lulu'], weight: 12 },       // G12 灼灼→铁墩→泡泡
];

// ---- 第 2 幕固定遭遇表（第二幕敌人.md 设计） ----
const ACT2_BASE_W = [70, 30, 0]; // 1v1 / 2v2 / 3v3 基础权重
const ACT2_PROGRESS_MOD = [
  { threshold: -0.3, mod: [20, 10, -10] },   // progress < 0.3
  { threshold: 0.7, mod: [-20, 5, 15] },     // progress > 0.7
];
const ACT2_ENCOUNTERS_1V1: readonly { species: string[]; weight: number }[] = [
  { species: ['momo_queen'], weight: 1 },   // S1 迅牙
  { species: ['lulu_king'], weight: 1 },    // S2 泡泡将
  { species: ['fifi_king'], weight: 1 },    // S3 灼刃
  { species: ['sisi'], weight: 1 },         // S4 棘尾
  { species: ['gora'], weight: 1 },         // S5 铁卫
  { species: ['mimi_king'], weight: 1 },    // S6 蟒影
];

const ACT2_ENCOUNTERS_2V2: readonly { species: string[]; weight: number }[] = [
  { species: ['fifi_king', 'momo_queen'], weight: 10 },  // D1
  { species: ['lulu_king', 'gora'], weight: 10 },        // D2
  { species: ['mimi_king', 'sisi'], weight: 9 },         // D3
  { species: ['momo_queen', 'lulu_king'], weight: 9 },   // D4
  { species: ['fifi_king', 'mimi_king'], weight: 9 },    // D5
  { species: ['sisi', 'gora'], weight: 8 },              // D6
  { species: ['fifi', 'fifi_king'], weight: 8 },         // D7
  { species: ['lulu', 'lulu_king'], weight: 8 },         // D8
  { species: ['mimi', 'mimi_king'], weight: 8 },         // D9
  { species: ['kiki', 'gora'], weight: 7 },              // D10
  { species: ['pipi', 'sisi'], weight: 7 },              // D11
  { species: ['momo_queen', 'fifi_king'], weight: 7 },   // D12
];

const ACT2_ENCOUNTERS_3V3: readonly { species: string[]; weight: number }[] = [
  { species: ['fifi_king', 'fifi_king', 'momo_queen'], weight: 12 },    // T1
  { species: ['lulu_king', 'lulu_king', 'gora'], weight: 12 },          // T2
  { species: ['mimi_king', 'mimi_king', 'sisi'], weight: 10 },          // T3
  { species: ['gora', 'gora', 'lulu_king'], weight: 9 },                // T4
  { species: ['sisi', 'sisi', 'mimi_king'], weight: 9 },                // T5
  { species: ['momo_queen', 'momo_queen', 'fifi_king'], weight: 8 },    // T6
  { species: ['fifi', 'fifi_king', 'fifi'], weight: 8 },                // T7
  { species: ['lulu', 'lulu_king', 'gora'], weight: 8 },                // T8
  { species: ['mimi', 'mimi_king', 'sisi'], weight: 7 },                // T9
  { species: ['kiki', 'gora', 'sisi'], weight: 6 },                     // T10
  { species: ['fifi_king', 'mimi_king', 'fifi_king'], weight: 6 },      // T11
  { species: ['momo_queen', 'fifi_king', 'mimi_king'], weight: 5 },     // T12
];

const ACT2_ENCOUNTERS_4V4: readonly { species: string[]; weight: number }[] = [
  { species: ['fifi_king', 'fifi_king', 'momo_queen', 'mimi_king'], weight: 16 },       // F1
  { species: ['lulu_king', 'lulu_king', 'gora', 'gora'], weight: 16 },                  // F2
  { species: ['mimi_king', 'mimi_king', 'sisi', 'gora'], weight: 14 },                  // F3
  { species: ['momo_queen', 'momo_queen', 'fifi_king', 'lulu_king'], weight: 12 },      // F4
  { species: ['fifi', 'fifi_king', 'mimi_king', 'momo_queen'], weight: 10 },            // F5
  { species: ['gora', 'lulu_king', 'fifi_king', 'momo_queen'], weight: 10 },            // F6
  { species: ['sisi', 'sisi', 'fifi_king', 'mimi_king'], weight: 8 },                   // F7
  { species: ['lulu', 'lulu_king', 'gora', 'sisi'], weight: 6 },                        // F8
  { species: ['mimi', 'mimi_king', 'fifi_king', 'momo_queen'], weight: 4 },             // F9
  { species: ['fifi', 'fifi', 'fifi', 'lulu_king'], weight: 4 },                        // F10
];

const ACT2_ELITE_ENCOUNTERS: readonly { species: string; weight: number }[] = [
  { species: 'gora_god', weight: 18 },     // E1 铁壁神
  { species: 'mimi_god', weight: 18 },     // E2 深渊蛇王
  { species: 'fifi_god', weight: 17 },     // E3 灼天
  { species: 'momo_god', weight: 17 },     // E4 迅天
  { species: 'lulu_god', weight: 16 },     // E5 泡泡龙神
  { species: 'sisi_god', weight: 14 },    // E6 棘刺王
];

const ACT2_GAUNTLET_2: readonly { species: string[]; weight: number }[] = [
  { species: ['fifi_king', 'fifi_king'], weight: 20 },       // G1
  { species: ['lulu_king', 'gora'], weight: 18 },            // G2
  { species: ['mimi_king', 'sisi'], weight: 18 },            // G3
  { species: ['fifi', 'fifi_king'], weight: 16 },            // G4
  { species: ['gora', 'gora'], weight: 14 },                 // G5
  { species: ['sisi', 'mimi_king'], weight: 14 },            // G6
];

const ACT2_GAUNTLET_3: readonly { species: string[]; weight: number }[] = [
  { species: ['fifi_king', 'mimi_king', 'fifi_king'], weight: 20 },       // G7
  { species: ['lulu_king', 'gora', 'lulu_king'], weight: 18 },            // G8
  { species: ['sisi', 'gora', 'sisi'], weight: 18 },                      // G9
  { species: ['fifi', 'fifi_king', 'mimi_king'], weight: 16 },            // G10
  { species: ['mimi_king', 'mimi_king', 'sisi'], weight: 14 },            // G11
  { species: ['fifi_king', 'gora', 'lulu_king'], weight: 14 },            // G12
];

function applyProgressModifier(progress: number, baseW: number[], progressMod: { threshold: number; mod: number[] }[]): number[] {
  const w = [...baseW];
  for (const m of progressMod) {
    if ((m.threshold < 0 && progress < Math.abs(m.threshold)) || (m.threshold > 0 && progress > m.threshold)) {
      for (let i = 0; i < m.mod.length && i < w.length; i++) w[i] += m.mod[i];
    }
  }
  return w;
}

function weightedPickEncounterSize(rng: () => number, adjusted: number[]): { count: number; kinds: number } {
  const total = adjusted.reduce((a, b) => a + b, 0);
  const roll = rng() * total;
  let acc = 0;
  for (let i = 0; i < adjusted.length; i++) {
    acc += adjusted[i];
    if (roll < acc) return { count: i + 1, kinds: i + 1 };
  }
  return { count: adjusted.length, kinds: adjusted.length };
}

// ---- 第 3 幕固定遭遇表（第三幕敌人.md 设计） ----
const ACT3_BASE_W = [10, 40, 45, 5]; // 1v1 / 2v2 / 3v3 / 4v4 基础权重
const ACT3_ENCOUNTERS_1V1: readonly { species: string[]; weight: number }[] = [
  { species: ['gora_god'], weight: 15 },    // S1 铁壁神
  { species: ['mimi_god'], weight: 15 },    // S2 深渊蛇王
  { species: ['fifi_god'], weight: 14 },    // S3 灼天
  { species: ['momo_god'], weight: 14 },    // S4 迅天
  { species: ['lulu_god'], weight: 13 },    // S5 泡泡龙神
  { species: ['sisi_god'], weight: 12 },    // S6 棘刺王
  { species: ['momo_queen'], weight: 9 },   // S7 迅牙
  { species: ['fifi_king'], weight: 8 },    // S8 灼刃
];

const ACT3_ENCOUNTERS_2V2: readonly { species: string[]; weight: number }[] = [
  { species: ['fifi_king', 'fifi_god'], weight: 10 },       // D1 灼刃+灼天
  { species: ['lulu_king', 'lulu_god'], weight: 10 },       // D2 泡泡将+泡泡龙神
  { species: ['mimi_king', 'mimi_god'], weight: 9 },        // D3 蟒影+深渊蛇王
  { species: ['gora', 'gora_god'], weight: 9 },             // D4 铁卫+铁壁神
  { species: ['sisi', 'sisi_god'], weight: 8 },             // D5 棘尾+棘刺王
  { species: ['momo_queen', 'momo_god'], weight: 8 },       // D6 迅牙+迅天
  { species: ['fifi_king', 'mimi_king'], weight: 7 },       // D7 灼刃+蟒影
  { species: ['lulu_king', 'gora'], weight: 7 },            // D8 泡泡将+铁卫
  { species: ['momo_queen', 'fifi_king'], weight: 7 },      // D9 迅牙+灼刃
  { species: ['mimi_king', 'sisi'], weight: 6 },            // D10 蟒影+棘尾
  { species: ['gora_god', 'fifi_god'], weight: 6 },         // D11 铁壁神+灼天
  { species: ['lulu_god', 'momo_god'], weight: 5 },         // D12 泡泡龙神+迅天
  { species: ['mimi_god', 'sisi_god'], weight: 4 },         // D13 深渊蛇王+棘刺王
  { species: ['momo_god', 'fifi_god'], weight: 4 },         // D14 迅天+灼天
];

const ACT3_ENCOUNTERS_3V3: readonly { species: string[]; weight: number }[] = [
  { species: ['fifi_king', 'fifi_king', 'fifi_god'], weight: 12 },         // T1
  { species: ['lulu_king', 'lulu_king', 'lulu_god'], weight: 12 },         // T2
  { species: ['mimi_king', 'mimi_king', 'mimi_god'], weight: 10 },         // T3
  { species: ['gora', 'gora', 'gora_god'], weight: 9 },                    // T4
  { species: ['sisi', 'sisi', 'sisi_god'], weight: 9 },                    // T5
  { species: ['momo_queen', 'momo_queen', 'momo_god'], weight: 8 },        // T6
  { species: ['fifi_king', 'mimi_king', 'fifi_god'], weight: 8 },          // T7
  { species: ['lulu_king', 'gora', 'lulu_god'], weight: 7 },              // T8
  { species: ['mimi_king', 'sisi', 'mimi_god'], weight: 7 },              // T9
  { species: ['gora_god', 'fifi_god', 'momo_queen'], weight: 6 },         // T10
  { species: ['lulu_god', 'momo_god', 'fifi_king'], weight: 6 },          // T11
  { species: ['sisi_god', 'momo_god', 'mimi_king'], weight: 6 },          // T12
];

const ACT3_ENCOUNTERS_4V4: readonly { species: string[]; weight: number }[] = [
  { species: ['fifi_god', 'fifi_king', 'fifi_king', 'momo_queen'], weight: 14 },    // F1
  { species: ['lulu_god', 'lulu_king', 'lulu_king', 'gora'], weight: 14 },          // F2
  { species: ['mimi_god', 'mimi_king', 'mimi_king', 'sisi'], weight: 12 },          // F3
  { species: ['gora_god', 'gora', 'gora', 'sisi'], weight: 11 },                    // F4
  { species: ['sisi_god', 'sisi', 'sisi', 'mimi_king'], weight: 10 },              // F5
  { species: ['momo_god', 'momo_queen', 'momo_queen', 'fifi_king'], weight: 10 },  // F6
  { species: ['fifi_god', 'lulu_god', 'fifi_king', 'lulu_king'], weight: 9 },      // F7
  { species: ['mimi_god', 'gora_god', 'mimi_king', 'gora'], weight: 8 },           // F8
  { species: ['sisi_god', 'momo_god', 'momo_queen', 'fifi_king'], weight: 6 },     // F9
  { species: ['fifi_god', 'mimi_god', 'fifi_king', 'mimi_king'], weight: 6 },      // F10
];

const ACT3_ELITE_ENCOUNTERS: readonly { species: string[]; weight: number }[] = [
  { species: ['gora_god', 'lulu_god'], weight: 20 },     // E1 铁壁神+泡泡龙神
  { species: ['mimi_god', 'fifi_god'], weight: 18 },     // E2 深渊蛇王+灼天
  { species: ['sisi_god', 'momo_god'], weight: 17 },     // E3 棘刺王+迅天
  { species: ['momo_god', 'fifi_god'], weight: 16 },     // E4 迅天+灼天
  { species: ['gora_god', 'mimi_god'], weight: 15 },     // E5 铁壁神+深渊蛇王
  { species: ['lulu_god', 'sisi_god'], weight: 14 },     // E6 泡泡龙神+棘刺王
];

const ACT3_ARENA_ENCOUNTERS: readonly { species: string; weight: number }[] = [
  { species: 'gora_god', weight: 18 },
  { species: 'mimi_god', weight: 18 },
  { species: 'fifi_god', weight: 17 },
  { species: 'momo_god', weight: 17 },
  { species: 'lulu_god', weight: 16 },
  { species: 'sisi_god', weight: 14 },
];

const ACT3_GAUNTLET_2: readonly { species: string[]; weight: number }[] = [
  { species: ['fifi_god', 'fifi_god'], weight: 20 },             // G1 灼天→灼天
  { species: ['lulu_god', 'gora_god'], weight: 18 },             // G2 泡泡龙神→铁壁神
  { species: ['mimi_god', 'sisi_god'], weight: 18 },             // G3 深渊蛇王→棘刺王
  { species: ['momo_god', 'fifi_god'], weight: 16 },             // G4 迅天→灼天
  { species: ['gora_god', 'gora_god'], weight: 14 },             // G5 铁壁神→铁壁神
  { species: ['sisi_god', 'mimi_god'], weight: 14 },             // G6 棘刺王→深渊蛇王
];

const ACT3_GAUNTLET_3: readonly { species: string[]; weight: number }[] = [
  { species: ['fifi_god', 'mimi_god', 'fifi_god'], weight: 20 },       // G7 灼天→深渊蛇王→灼天
  { species: ['lulu_god', 'gora_god', 'lulu_god'], weight: 18 },      // G8 泡泡龙神→铁壁神→泡泡龙神
  { species: ['sisi_god', 'gora_god', 'sisi_god'], weight: 18 },      // G9 棘刺王→铁壁神→棘刺王
  { species: ['momo_god', 'momo_god', 'fifi_god'], weight: 16 },     // G10 迅天→迅天→灼天
  { species: ['mimi_god', 'mimi_god', 'sisi_god'], weight: 14 },     // G11 深渊蛇王→深渊蛇王→棘刺王
  { species: ['fifi_god', 'gora_god', 'lulu_god'], weight: 14 },     // G12 灼天→铁壁神→泡泡龙神
];

const ACT3_GUARDIAN_1V1: readonly { species: string; weight: number }[] = [
  { species: 'gora_god', weight: 28 },
  { species: 'mimi_god', weight: 26 },
  { species: 'fifi_god', weight: 24 },
  { species: 'momo_god', weight: 22 },
];

const ACT3_GUARDIAN_2V2: readonly { species: string[]; weight: number }[] = [
  { species: ['gora_god', 'lulu_god'], weight: 38 },     // W5 铁壁神+泡泡龙神
  { species: ['mimi_god', 'fifi_god'], weight: 34 },     // W6 深渊蛇王+灼天
  { species: ['sisi_god', 'momo_god'], weight: 28 },     // W7 棘刺王+迅天
];

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

/** Boss 小怪映射表：每个 boss 的小怪 speciesId 列表 */
export const BOSS_MINIONS: Record<string, string[]> = {
  boss_vine: ['boss_minion_tree_guard', 'boss_minion_thorn'],
  boss_crab: ['boss_minion_shrimp', 'boss_minion_hermit'],
};

function buildEncounter(
  rng: () => number,
  type: NodeType,
  act: number,
  progress: number,
  bossId?: string,
  gauntletSize?: 2 | 3,
): { speciesId: string }[] {
  if (type === 'boss') {
    const id = bossId ?? ACT_BOSS_POOLS[act][0];
    const minions = BOSS_MINIONS[id] ?? [];
    return [{ speciesId: id }, ...minions.map((m) => ({ speciesId: m }))];
  }
  // ---- 第 1 幕：固定遭遇表（加权抽取） ----
  if (act === 1) {
    if (type === 'elite') {
      return [{ speciesId: weightedPick(rng, ACT1_ELITE_ENCOUNTERS) }];
    }
    if (type === 'arena') {
      return [{ speciesId: weightedPick(rng, ACT1_ELITE_ENCOUNTERS) }];
    }
    if (type === 'gauntlet') {
      const size = gauntletSize ?? 2;
      const table = size === 3 ? ACT1_GAUNTLET_3 : ACT1_GAUNTLET_2;
      const picked = weightedPick(rng, table.map((e) => [e, e.weight] as const));
      return picked.sequence.map((speciesId) => ({ speciesId }));
    }
    if (type === 'guardian') {
      return [{ speciesId: weightedPick(rng, ACT1_ELITE_ENCOUNTERS) }];
    }
    // battle：按规模从固定遭遇表抽取
    if (progress === 0) {
      return [{ speciesId: weightedPick(rng, ACT1_ENCOUNTERS_1V1.map((e) => [e.species[0], e.weight] as const)) }];
    }
    if (progress < 0.15) {
      const roll = rng() * 100;
      if (roll < 30) {
        // 30% 1v1
        return [{ speciesId: weightedPick(rng, ACT1_ENCOUNTERS_1V1.map((e) => [e.species[0], e.weight] as const)) }];
      }
      // 70% 2v2
      const picked = weightedPick(rng, ACT1_ENCOUNTERS_2V2.map((e) => [e, e.weight] as const));
      return picked.species.map((speciesId) => ({ speciesId }));
    }
    // 主体行：用 baseWeights 选规模，再从对应表抽取
    const [w22, w33] = [70, 30] as const;
    let aw22 = w22;
    let aw33 = w33;
    if (progress < 0.3) {
      aw22 += 20;
      aw33 -= 10;
    } else if (progress > 0.7) {
      aw22 -= 20;
      aw33 += 5;
    }
    const roll = rng() * 100;
    if (roll < aw22) {
      const picked = weightedPick(rng, ACT1_ENCOUNTERS_2V2.map((e) => [e, e.weight] as const));
      return picked.species.map((speciesId) => ({ speciesId }));
    }
    if (roll < aw22 + aw33) {
      const picked = weightedPick(rng, ACT1_ENCOUNTERS_3V3.map((e) => [e, e.weight] as const));
      return picked.species.map((speciesId) => ({ speciesId }));
    }
    // Act1 baseWeights 第三项为 0，理论上不会到这里；兜底给 3v3
    const fallback = ACT1_ENCOUNTERS_3V3[0];
    return fallback.species.map((speciesId) => ({ speciesId }));
  }
  // ---- 第 2 幕：固定遭遇表（第二幕敌人.md 设计） ----
  if (act === 2) {
    if (type === 'elite') {
      return [{ speciesId: weightedPick(rng, ACT2_ELITE_ENCOUNTERS.map((e) => [e, e.weight] as const)).species }];
    }
    if (type === 'arena') {
      return [{ speciesId: weightedPick(rng, ACT2_ELITE_ENCOUNTERS.map((e) => [e, e.weight] as const)).species }];
    }
    if (type === 'gauntlet') {
      const size = gauntletSize ?? (2 + Math.floor(rng() * 2));
      const table = size === 3 ? ACT2_GAUNTLET_3 : ACT2_GAUNTLET_2;
      return weightedPick(rng, table.map((e) => [e, e.weight] as const)).species.map((speciesId) => ({ speciesId }));
    }
    if (type === 'guardian') {
      return [{ speciesId: weightedPick(rng, ACT2_ELITE_ENCOUNTERS.map((e) => [e, e.weight] as const)).species }];
    }
    // battle — 固定遭遇表 + 进度决定规模
    if (progress === 0) {
      const picked = weightedPick(rng, ACT2_ENCOUNTERS_1V1.map((e) => [e, e.weight] as const));
      return picked.species.map((speciesId) => ({ speciesId }));
    }
    if (progress < 0.15) {
      const roll = rng() * 100;
      if (roll < 30) {
        const picked = weightedPick(rng, ACT2_ENCOUNTERS_1V1.map((e) => [e, e.weight] as const));
        return picked.species.map((speciesId) => ({ speciesId }));
      }
      const picked = weightedPick(rng, ACT2_ENCOUNTERS_2V2.map((e) => [e, e.weight] as const));
      return picked.species.map((speciesId) => ({ speciesId }));
    }
    const adjusted = applyProgressModifier(progress, ACT2_BASE_W, ACT2_PROGRESS_MOD);
    const picked = weightedPickEncounterSize(rng, adjusted);
    if (picked.kinds === 1) {
      const t = weightedPick(rng, ACT2_ENCOUNTERS_1V1.map((e) => [e, e.weight] as const));
      return t.species.map((speciesId) => ({ speciesId }));
    }
    if (picked.kinds === 2) {
      const t = weightedPick(rng, ACT2_ENCOUNTERS_2V2.map((e) => [e, e.weight] as const));
      return t.species.map((speciesId) => ({ speciesId }));
    }
    if (picked.kinds === 3) {
      const t = weightedPick(rng, ACT2_ENCOUNTERS_3V3.map((e) => [e, e.weight] as const));
      return t.species.map((speciesId) => ({ speciesId }));
    }
    const t = weightedPick(rng, ACT2_ENCOUNTERS_4V4.map((e) => [e, e.weight] as const));
    return t.species.map((speciesId) => ({ speciesId }));
  }
  // ---- 第 3 幕：固定遭遇表（第三幕敌人.md 设计） ----
  if (act === 3) {
    if (type === 'elite') {
      const picked = weightedPick(rng, ACT3_ELITE_ENCOUNTERS.map((e) => [e, e.weight] as const));
      return picked.species.map((speciesId) => ({ speciesId }));
    }
    if (type === 'arena') {
      return [{ speciesId: weightedPick(rng, ACT3_ARENA_ENCOUNTERS.map((e) => [e, e.weight] as const)).species }];
    }
    if (type === 'gauntlet') {
      const size = gauntletSize ?? (2 + Math.floor(rng() * 2));
      const table = size === 3 ? ACT3_GAUNTLET_3 : ACT3_GAUNTLET_2;
      return weightedPick(rng, table.map((e) => [e, e.weight] as const)).species.map((speciesId) => ({ speciesId }));
    }
    if (type === 'guardian') {
      // 50% 概率 2v2 双传奇守卫，50% 单传奇
      if (rng() < 0.5) {
        const picked = weightedPick(rng, ACT3_GUARDIAN_2V2.map((e) => [e, e.weight] as const));
        return picked.species.map((speciesId) => ({ speciesId }));
      }
      return [{ speciesId: weightedPick(rng, ACT3_GUARDIAN_1V1.map((e) => [e, e.weight] as const)).species }];
    }
    // battle — 固定遭遇表 + 进度决定规模
    if (progress === 0) {
      const picked = weightedPick(rng, ACT3_ENCOUNTERS_1V1.map((e) => [e, e.weight] as const));
      return picked.species.map((speciesId) => ({ speciesId }));
    }
    if (progress < 0.15) {
      const roll = rng() * 100;
      if (roll < 30) {
        const picked = weightedPick(rng, ACT3_ENCOUNTERS_1V1.map((e) => [e, e.weight] as const));
        return picked.species.map((speciesId) => ({ speciesId }));
      }
      const picked = weightedPick(rng, ACT3_ENCOUNTERS_2V2.map((e) => [e, e.weight] as const));
      return picked.species.map((speciesId) => ({ speciesId }));
    }
    const adjusted = applyProgressModifier(progress, ACT3_BASE_W, ACT3_PROGRESS_MOD);
    const picked = weightedPickEncounterSize(rng, adjusted);
    if (picked.kinds === 1) {
      const t = weightedPick(rng, ACT3_ENCOUNTERS_1V1.map((e) => [e, e.weight] as const));
      return t.species.map((speciesId) => ({ speciesId }));
    }
    if (picked.kinds === 2) {
      const t = weightedPick(rng, ACT3_ENCOUNTERS_2V2.map((e) => [e, e.weight] as const));
      return t.species.map((speciesId) => ({ speciesId }));
    }
    if (picked.kinds === 3) {
      const t = weightedPick(rng, ACT3_ENCOUNTERS_3V3.map((e) => [e, e.weight] as const));
      return t.species.map((speciesId) => ({ speciesId }));
    }
    const t = weightedPick(rng, ACT3_ENCOUNTERS_4V4.map((e) => [e, e.weight] as const));
    return t.species.map((speciesId) => ({ speciesId }));
  }
  // fallback — 理论上不会到这里
  return [{ speciesId: 'momo' }];
}

/** 随机事件：多选一抉择，风险与收益并存（结果在生成时用种子预掷，可复现） */export function buildEvent(rng: () => number, act: number): EventNode {
  const roll = rng();
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
    // 随机选择：食物（不含圣果）或道具
    const isItem = rng() < 0.5;
    const shopFoodPool = Object.keys(FOODS).filter((id) => id !== 'golden_fruit');
    const shopItemPool = Object.keys(ITEMS).filter((id) => ITEMS[id].price > 0);
    let tradeChoice: EventChoice;
    if (isItem) {
      const itemId = pick(rng, shopItemPool);
      tradeChoice = c(1, '购买补给', `损失 15 金币，获得 1 个${ITEMS[itemId].name}`, 'item', { itemId, goldDelta: -15 });
    } else {
      const foodId2 = pick(rng, shopFoodPool);
      tradeChoice = c(1, '购买补给', `损失 15 金币，获得 1 个${FOODS[foodId2].name}`, 'food', { foodId: foodId2, goldDelta: -15 });
    }
    return {
      title: '流浪商人',
      desc: '一位背着鼓鼓行囊的商人在路边歇脚，愿意与你交易。',
      choices: [
        tradeChoice,
        c(2, '打探消息', '获得 20 金币', 'gold', { amount: 20 }),
        c(3, '离开', '继续赶路', 'none'),
      ],
    };
  }
  if (roll < 0.8) {
    // 按幕数概率选择不同进化阶段的宠物
    let pool: string[];
    const r = rng();
    if (act <= 1) {
      pool = BASE_POOL;
    } else if (act === 2) {
      pool = r < 0.7 ? EVO1_POOL : BASE_POOL;
    } else {
      if (r < 0.6) pool = EVO2_POOL;
      else if (r < 0.9) pool = EVO1_POOL;
      else pool = BASE_POOL;
    }
    const eggMonsterId = pick(rng, pool);
    return {
      title: '神秘蛋',
      desc: '一颗布满奇异纹路的蛋静静躺在草丛中，轻轻颤动。',
      choices: [
        c(1, '孵化它', '一只神秘生物破壳而出，加入队伍', 'recruit', { monsterId: eggMonsterId }),
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
  const LAYER_RANGES: Record<number, [number, number]> = { 1: [8, 10], 2: [10, 12], 3: [12, 14] };
  const [lo, hi] = LAYER_RANGES[act] ?? LAYER_RANGES[1];
  const layerCount = randInt(rng, lo, hi);
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

  // 事件/商人数量随层数缩放（目标数量用种子预掷，可复现）；另保证最后两层必有一个商人
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
  // 奇遇关每幕最多 1 个：多余转为战斗；前 5 层不出现奇遇关
  const spNodes = mid.filter((n) => n.type === 'special');
  const earlySpNodes = spNodes.filter((n) => {
    const row = layers.findIndex((r) => r.includes(n));
    return row < 5;
  });
  earlySpNodes.forEach((n) => setType(n, 'battle'));
  const remainingSp = mid.filter((n) => n.type === 'special');
  if (remainingSp.length > 1) remainingSp.slice(1).forEach((n) => setType(n, 'battle'));
  // 事件/商人目标随层数缩放，保持恢复节点占比基本不变
  const evTarget = Math.min(6, Math.round(layerCount * 0.42) + randInt(rng, 0, 1));
  const shopTarget = Math.min(5, Math.round(layerCount * 0.28) + randInt(rng, 0, 1));
  // 超出上限的转回战斗
  const over = mid.filter((n) => n.type === 'event');
  if (over.length > 6) over.slice(6).forEach((n) => setType(n, 'battle'));
  const overShop = mid.filter((n) => n.type === 'shop');
  if (overShop.length > shopTarget) overShop.slice(shopTarget).forEach((n) => setType(n, 'battle'));
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
  // 第一层（row 2）商店/事件各不超过 4 个：超出转为战斗
  const firstRow = layers[2];
  if (firstRow) {
    const firstRowShops = firstRow.filter((n) => n.type === 'shop');
    if (firstRowShops.length > 4) firstRowShops.slice(4).forEach((n) => setType(n, 'battle'));
    const firstRowEvents = firstRow.filter((n) => n.type === 'event');
    if (firstRowEvents.length > 4) firstRowEvents.slice(4).forEach((n) => setType(n, 'battle'));
  }
  // 全部战斗的行数上限 2（row1 强制 + 至多 1 行随机巧合）：超出则把靠后的整行战斗行改为事件/商人（仍不超出上限）
  const allBattleRows = () =>
    layers.slice(1, -1).map((row, idx) => ({ row, idx: idx + 1 })).filter(({ row }) => row.every((n) => n.type === 'battle'));
  for (const { row } of allBattleRows().slice(2)) {
    const n = row[Math.floor(rng() * row.length)];
    setType(n, countOf('event') < evTarget ? 'event' : countOf('shop') < shopTarget ? 'shop' : 'elite');
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
  // 第一层（row 2）sync+watchtower 总数不超过 2，后面层不超过 3。
  const syncPairs = randInt(rng, 1, 2);
  let syncMade = 0;
  for (let attempt = 0; attempt < syncPairs * 4 && syncMade < syncPairs; attempt++) {
    const row = randInt(rng, 2, lastRow - 1);
    const rowNodes = layers[row];
    // 统计该行已有的 sync+watchtower 数量
    const specialCount = rowNodes.filter((n) => n.type === 'sync' || n.type === 'watchtower').length;
    const limit = row <= 2 ? 2 : 3;
    if (specialCount >= limit) continue;
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
  // 第一层（row 2）sync+watchtower 总数不超过 2，后面层不超过 3。
  for (let row = Math.max(2, lastRow - 3); row < lastRow; row++) {
    if (rng() < 0.2) {
      // 统计该行已有的 sync+watchtower 数量
      const specialCount = layers[row].filter((n) => n.type === 'sync' || n.type === 'watchtower').length;
      const limit = row <= 2 ? 2 : 3;
      if (specialCount >= limit) continue;
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

  // 降低除普通战斗外，每种节点在中间层的相邻层连续出现的概率（降低 20%）
  const nonBattleTypes: NodeType[] = ['event', 'shop', 'elite', 'special', 'watchtower', 'corrupted'];
  for (const t of nonBattleTypes) {
    for (let row = 2; row < lastRow; row++) {
      const prevRow = row - 1;
      const currCount = layers[row].filter((n) => n.type === t).length;
      const prevCount = layers[prevRow].filter((n) => n.type === t).length;
      // 如果相邻两行都有该类型节点，且当前行数量超过1个，则有10%概率将一个转为战斗
      if (currCount > 0 && prevCount > 0 && currCount > 1 && rng() < 0.2) {
        const target = layers[row].find((n) => n.type === t);
        if (target) {
          setType(target, 'battle');
        }
      }
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
      else if (n.type === 'event') events[n.id] = buildEvent(rng, act);
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
  const sp = getMonster(target);
  // 以新形态为基础（自动应用被动属性加成），再叠加主宠的 bonusStats/诅咒
  const fresh = makeUnit(target, primary.isPlayer, primary.column, false, primary.row);
  let hp = fresh.maxHp;
  let spd = fresh.spd;
  const b = primary.bonusStats;
  if (b) { hp += b.hp ?? 0; spd += b.spd ?? 0; }
  if (primary.curse === 'hpDown') hp = Math.max(1, hp - 5);
  else if (primary.curse === 'spdDown') spd = Math.max(1, spd - 1);
  return {
    ...fresh,
    uid: primary.uid,
    hp,
    maxHp: hp,
    spd,
    skills: primary.customSkills ?? [...sp.skills],
    ...(primary.bonusStats ? { bonusStats: primary.bonusStats } : {}),
    ...(primary.curse ? { curse: primary.curse } : {}),
    ...(primary.customSkills ? { customSkills: primary.customSkills } : {}),
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
    options.push({
      id: 'r-recruit',
      label: '招募',
      desc: '随机一只普通宠物加入队伍',
      kind: 'recruit',
      monsterId: pick(rng, ['kiki', 'mimi', 'pipi', 'momo', 'lulu', 'fifi']),
    });
  }
  const shuffled = shuffle(rng, options);
  // 出发层：确保招募选项一定出现在最终结果中
  if (state.currentRow === 0) {
    const hasRecruit = shuffled.slice(0, 2).some((o) => o.kind === 'recruit');
    if (!hasRecruit) {
      const recruitIdx = shuffled.findIndex((o) => o.kind === 'recruit');
      if (recruitIdx >= 0) {
        const recruit = shuffled[recruitIdx];
        shuffled.splice(recruitIdx, 1);
        shuffled.unshift(recruit);
      }
    }
  }
  return shuffled.slice(0, 2);
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
