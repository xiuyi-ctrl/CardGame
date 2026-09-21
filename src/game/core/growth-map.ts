/**
 * 成长远征模式 - 线性爬塔地图生成
 * 每层1个节点，共50层 + 3个Boss（层15/30/50）
 */
import { createRng, randInt, pick } from '../rng';
import type { MapNode, NodeType, RunMap, EventNode, SpecialNode } from '../state/game';
import { labelOf, ACT_BOSS_POOLS, BOSS_MINIONS } from '../state/game';

/** 总层数 */
export const TOTAL_LAYERS = 50;

// ---- 生物池（模块级导出，供 growth-arena.ts 等引用） ----
/** 一阶生物（rank 1） */
export const TIER1 = ['momo', 'lulu', 'fifi', 'kiki', 'mimi', 'pipi'];
/** 二阶生物（rank 2） */
export const TIER2 = ['momo_queen', 'lulu_king', 'fifi_king', 'sisi', 'gora', 'mimi_king'];
/** 传奇生物（rank 3） */
export const LEGENDARY = ['momo_god', 'lulu_god', 'fifi_god', 'gora_god', 'mimi_god', 'sisi_god'];

/** 节点类型概率表（按层进度调整） */
interface NodeProb {
  battle: number;
  elite: number;
  event: number;
  shop: number;
  special: number;
  rest: number;
  blacksmith: number;
  arena: number;
}

const BASE_PROBS: NodeProb = {
  battle: 55,
  elite: 15,
  event: 12,
  shop: 0,
  special: 0,
  rest: 8,
  blacksmith: 0,
  arena: 0,
};

/** 根据层进度微调概率 */
function getLayerProbs(layer: number): NodeProb {
  const p = { ...BASE_PROBS };
  // 前5层：无精英、无休整（教学期）
  if (layer <= 5) {
    p.elite = 0;
    p.rest = 0;
    p.battle += 15 + p.elite + p.rest;
  }
  // 6~10层：降精英，升战斗
  if (layer > 5 && layer <= 10) {
    p.elite -= 8;
    p.battle += 5;
    p.rest += 3;
  }
  // 11~25层：中期平稳
  if (layer > 10 && layer <= 25) {
    p.elite -= 3;
    p.battle += 3;
  }
  // 26~40层：升精英
  if (layer > 25 && layer <= 40) {
    p.elite += 3;
    p.battle -= 3;
  }
  // 41~50层：后期高压
  if (layer > 40) {
    p.elite += 5;
    p.battle -= 2;
    p.rest += 1;
  }
  return p;
}

/** 按概率选择节点类型 */
function pickNodeType(rng: () => number, probs: NodeProb): NodeType {
  const total = probs.battle + probs.elite + probs.event + probs.rest;
  const roll = rng() * total;
  let acc = 0;
  acc += probs.battle;
  if (roll < acc) return 'battle';
  acc += probs.elite;
  if (roll < acc) return 'elite';
  acc += probs.event;
  if (roll < acc) return 'event';
  return 'rest';
}

/** Boss层 */
const BOSS_LAYERS = new Set([15, 30, 50]);
/** 保底休憩层（每10层必有一个，排除Boss层） */
const GUARANTEED_REST_LAYERS = new Set([10, 20, 40]);

/** 随机间隔生成固定节点位置（不与Boss/其他固定节点/排除层重叠） */
function generateFixedPositions(
  rng: () => number,
  minInterval: number,
  maxInterval: number,
  maxCount: number,
  exclude: Set<number>,
): Set<number> {
  const positions = new Set<number>();
  let current = Math.max(6, 2 + Math.floor(rng() * minInterval)); // 起始层不低于6（前5层禁止商店/奇遇）
  while (positions.size < maxCount && current <= TOTAL_LAYERS) {
    if (current > 5 && !BOSS_LAYERS.has(current) && !exclude.has(current) && current !== 1 && !GUARANTEED_REST_LAYERS.has(current)) {
      positions.add(current);
    }
    current += minInterval + Math.floor(rng() * (maxInterval - minInterval + 1));
  }
  return positions;
}

/** 生成成长远征模式地图 */
export function generateGrowthMap(seed: number): RunMap {
  const rng = createRng(seed * 7919 + 104729);
  const layers: MapNode[][] = [];
  const encounter: Record<string, { speciesId: string }[]> = {};
  const events: Record<string, EventNode> = {};
  const specials: Record<string, SpecialNode> = {};

  // 商店：每隔6~8层，最多6个，排除1-5层和Boss层和保底休憩层
  const shopLayers = generateFixedPositions(rng, 6, 8, 6, new Set());
  // 奇遇关：每隔10~20层，最多4个，排除1-5层、Boss层、商店层和保底休憩层
  const specialLayers = generateFixedPositions(rng, 10, 20, 4, shopLayers);
  // 铁匠铺：每隔6~8层，5~7个，排除1-5层、Boss层、休憩层、商店层
  let blacksmithLayers = generateFixedPositions(rng, 6, 8, 7, shopLayers);
  // 确保至少5个铁匠铺（重新生成直到满足）
  let tries = 0;
  while (blacksmithLayers.size < 5 && tries < 10) {
    blacksmithLayers = generateFixedPositions(rng, 6, 8, 7, shopLayers);
    tries++;
  }
  // 竞技场：每隔8~12层，最多4个，排除1-8层、Boss层、休憩层、商店层、铁匠铺层、奇遇关层
  const fixedExclude = new Set([...shopLayers, ...blacksmithLayers, ...specialLayers, ...GUARANTEED_REST_LAYERS, ...BOSS_LAYERS]);
  const arenaLayers = generateFixedPositions(rng, 8, 12, 4, fixedExclude);

  // 跟踪上次休憩层（5层内不重复）
  let lastRestLayer = -6;

  for (let layer = 1; layer <= TOTAL_LAYERS; layer++) {
    let nodeType: NodeType;
    if (layer === 1) {
      nodeType = 'battle';
    } else if (BOSS_LAYERS.has(layer)) {
      nodeType = 'boss';
    } else if (GUARANTEED_REST_LAYERS.has(layer)) {
      nodeType = 'rest';
      lastRestLayer = layer;
    } else if (shopLayers.has(layer)) {
      nodeType = 'shop';
    } else if (specialLayers.has(layer)) {
      nodeType = 'special';
    } else if (blacksmithLayers.has(layer)) {
      nodeType = 'blacksmith';
    } else if (arenaLayers.has(layer)) {
      nodeType = 'arena3';
    } else {
      const probs = getLayerProbs(layer);
      // 5层内已有休憩则禁用休憩概率
      if (layer - lastRestLayer < 5) {
        const noRest = { ...probs, rest: 0 };
        nodeType = pickNodeType(rng, noRest);
      } else {
        nodeType = pickNodeType(rng, probs);
      }
      if (nodeType === 'rest') lastRestLayer = layer;
    }
    const node: MapNode = {
      id: `pf_${layer}`,
      type: nodeType,
      label: labelOf(nodeType, layer),
      col: 0,
    };
    layers.push([node]);
  }

  return { layers, encounter, boss: pregenerateBoss(seed), events, specials };
}

/** 预生成Boss遭遇（按幕次随机选Boss，供 nodeInfo 显示 + enterNode 读取） */
function pregenerateBoss(seed: number): Record<string, { speciesId: string }[]> {
  const rng = createRng(seed * 4919 + 6131);
  const bossMap: Record<string, { speciesId: string }[]> = {};
  // 层15: 第一幕Boss随机选一个
  const act1Boss = pick(rng, ACT_BOSS_POOLS[1]);
  const act1Minions = BOSS_MINIONS[act1Boss] ?? [];
  bossMap['pf_15'] = [
    { speciesId: act1Boss },
    ...act1Minions.map((m) => ({ speciesId: m })),
  ];
  // 层30: 第二幕Boss随机选一个
  const act2Boss = pick(rng, ACT_BOSS_POOLS[2]);
  const act2Minions = BOSS_MINIONS[act2Boss] ?? [];
  bossMap['pf_30'] = [
    { speciesId: act2Boss },
    ...act2Minions.map((m) => ({ speciesId: m })),
  ];
  // 层50: 成长之主（固定）
  bossMap['pf_50'] = [
    { speciesId: 'growth_master' },
    { speciesId: 'growth_puppet' },
    { speciesId: 'growth_puppet' },
  ];
  return bossMap;
}

/** 获取成长远征模式的普通战斗遭遇 */
export function getGrowthEncounter(
  layer: number,
  rng: () => number,
): { speciesId: string }[] {
  let maxEnemies: number;
  if (layer <= 10) {
    maxEnemies = 1;
  } else if (layer <= 25) {
    maxEnemies = randInt(rng, 1, 2);
  } else {
    maxEnemies = randInt(rng, 2, 3);
  }
  // 按层数区间构建加权池
  let pool: string[];
  if (layer <= 10) {
    // 1~10层：纯一阶
    pool = TIER1;
  } else if (layer <= 25) {
    // 11~25层：一阶 60% + 二阶 40%
    pool = [...TIER1, ...TIER1, ...TIER1, ...TIER2, ...TIER2];
  } else if (layer <= 40) {
    // 26~40层：一阶 20% + 二阶 80%
    pool = [...TIER1, ...TIER2, ...TIER2, ...TIER2, ...TIER2];
  } else {
    // 41~50层：二阶 50% + 传奇 50%
    pool = [...TIER2, ...TIER2, ...LEGENDARY, ...LEGENDARY];
  }

  const enemies: { speciesId: string }[] = [];
  for (let i = 0; i < maxEnemies; i++) {
    enemies.push({ speciesId: pick(rng, pool) });
  }
  return enemies;
}

/** 精英战斗遭遇（全程最多2只） */
export function getGrowthEliteEncounter(
  layer: number,
  rng: () => number,
): { speciesId: string }[] {
  // 按层数区间构建加权池
  let pool: string[];
  if (layer <= 10) {
    // 1~10层：纯二阶
    pool = TIER2;
  } else if (layer <= 25) {
    // 11~25层：二阶 60% + 传奇 40%
    pool = [...TIER2, ...TIER2, ...TIER2, ...LEGENDARY, ...LEGENDARY];
  } else if (layer <= 40) {
    // 26~40层：二阶 30% + 传奇 70%
    pool = [...TIER2, ...LEGENDARY, ...LEGENDARY, ...LEGENDARY, ...LEGENDARY];
  } else {
    // 41~50层：双传奇组合（每场2只，均从传奇池抽取）
    pool = LEGENDARY;
  }

  const count = 2;
  const enemies: { speciesId: string }[] = [];
  for (let i = 0; i < count; i++) {
    enemies.push({ speciesId: pick(rng, pool) });
  }
  return enemies;
}
