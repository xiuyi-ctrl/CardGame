/**
 * 成长远征模式 - 线性爬塔地图生成
 * 每层1个节点，共15层 + 最终Boss
 */
import { createRng, randInt, pick } from '../rng';
import type { MapNode, NodeType, RunMap, EventNode, SpecialNode } from '../state/game';
import { labelOf } from '../state/game';

/** 总层数 */
export const TOTAL_LAYERS = 15;

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
  battle: 60,
  elite: 12,
  event: 10,
  shop: 8,
  special: 5,
  rest: 5,
};

/** 根据层进度微调概率 */
function getLayerProbs(layer: number): NodeProb {
  const p = { ...BASE_PROBS };
  if (layer <= 5) {
    p.elite -= 5;
    p.battle += 5;
  }
  if (layer >= 10) {
    p.elite += 5;
    p.battle -= 5;
  }
  return p;
}

/** 按概率选择节点类型 */
function pickNodeType(rng: () => number, probs: NodeProb): NodeType {
  const total = probs.battle + probs.elite + probs.event + probs.shop + probs.special + probs.rest;
  const roll = rng() * total;
  let acc = 0;
  acc += probs.battle;
  if (roll < acc) return 'battle';
  acc += probs.elite;
  if (roll < acc) return 'elite';
  acc += probs.event;
  if (roll < acc) return 'event';
  acc += probs.shop;
  if (roll < acc) return 'shop';
  acc += probs.special;
  if (roll < acc) return 'special';
  return 'rest';
}

/** 生成成长远征模式地图 */
export function generateGrowthMap(seed: number): RunMap {
  const rng = createRng(seed * 7919 + 104729);
  const layers: MapNode[][] = [];
  const encounter: Record<string, { speciesId: string }[]> = {};
  const events: Record<string, EventNode> = {};
  const specials: Record<string, SpecialNode> = {};

  const forcedShopLayers = new Set([5, 10, 15]);
  const forcedSpecialLayer = 10;

  for (let layer = 1; layer <= TOTAL_LAYERS; layer++) {
    let nodeType: NodeType;
    if (layer === 1) {
      nodeType = 'battle';
    } else if (layer === TOTAL_LAYERS) {
      nodeType = 'boss';
    } else if (forcedShopLayers.has(layer)) {
      nodeType = 'shop';
    } else if (layer === forcedSpecialLayer) {
      nodeType = 'special';
    } else {
      const probs = getLayerProbs(layer);
      probs.shop = 0;
      probs.special = 0;
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

  return { layers, encounter, boss: {}, events, specials };
}

/** 获取成长远征模式的普通战斗遭遇 */
export function getGrowthEncounter(
  layer: number,
  rng: () => number,
): { speciesId: string }[] {
  let maxEnemies: number;
  if (layer <= 5) {
    maxEnemies = 1;
  } else if (layer <= 10) {
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
