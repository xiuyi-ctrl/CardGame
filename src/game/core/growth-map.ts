/**
 * 成长远征模式 - 线性爬塔地图生成
 * 每层1个节点，共50层 + 3个Boss（层15/30/50）
 */
import { createRng, randInt, pick } from '../rng';
import type { MapNode, NodeType, RunMap, EventNode, SpecialNode } from '../state/game';
import { labelOf, ACT_BOSS_POOLS, BOSS_MINIONS } from '../state/game';

/** 总层数 */
export const TOTAL_LAYERS = 50;

/** 节点类型概率表（按层进度调整） */
interface NodeProb {
  battle: number;
  elite: number;
  event: number;
  shop: number;
  special: number;
  rest: number;
}

const BASE_PROBS: NodeProb = {
  battle: 55,
  elite: 15,
  event: 12,
  shop: 0,
  special: 0,
  rest: 8,
};

/** 根据层进度微调概率 */
function getLayerProbs(layer: number): NodeProb {
  const p = { ...BASE_PROBS };
  // 前10层：降精英，升战斗（教学期）
  if (layer <= 10) {
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

/** 固定商店层：每~8层一个 */
const FORCED_SHOP_LAYERS = new Set([5, 12, 20, 28, 36, 44]);
/** 固定奇遇层 */
const FORCED_SPECIAL_LAYERS = new Set([10, 25, 40]);
/** Boss层 */
const BOSS_LAYERS = new Set([15, 30, 50]);

/** 生成成长远征模式地图 */
export function generateGrowthMap(seed: number): RunMap {
  const rng = createRng(seed * 7919 + 104729);
  const layers: MapNode[][] = [];
  const encounter: Record<string, { speciesId: string }[]> = {};
  const events: Record<string, EventNode> = {};
  const specials: Record<string, SpecialNode> = {};

  for (let layer = 1; layer <= TOTAL_LAYERS; layer++) {
    let nodeType: NodeType;
    if (layer === 1) {
      nodeType = 'battle';
    } else if (BOSS_LAYERS.has(layer)) {
      nodeType = 'boss';
    } else if (FORCED_SHOP_LAYERS.has(layer)) {
      nodeType = 'shop';
    } else if (FORCED_SPECIAL_LAYERS.has(layer)) {
      nodeType = 'special';
    } else {
      const probs = getLayerProbs(layer);
      nodeType = pickNodeType(rng, probs);
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
  const ENEMY_POOL = [
    'momo', 'lulu', 'fifi', 'kiki', 'mimi', 'pipi',
    'momo_queen', 'lulu_king', 'fifi_king', 'sisi', 'gora', 'mimi_king',
  ];
  const enemies: { speciesId: string }[] = [];
  for (let i = 0; i < maxEnemies; i++) {
    enemies.push({ speciesId: pick(rng, ENEMY_POOL) });
  }
  return enemies;
}

/** 精英战斗遭遇（仅品阶2，全程最多2只） */
export function getGrowthEliteEncounter(
  _layer: number,
  rng: () => number,
): { speciesId: string }[] {
  const ELITE_POOL = [
    'momo_queen', 'lulu_king', 'fifi_king', 'sisi', 'gora', 'mimi_king',
  ];
  const count = 2;
  const enemies: { speciesId: string }[] = [];
  for (let i = 0; i < count; i++) {
    enemies.push({ speciesId: pick(rng, ELITE_POOL) });
  }
  return enemies;
}
