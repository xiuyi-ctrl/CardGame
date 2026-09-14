/**
 * 熟练度远征模式 - 线性爬塔地图生成
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
  // 前5层：降低精英概率，提高战斗
  if (layer <= 5) {
    p.elite -= 5;
    p.battle += 5;
  }
  // 后5层：提高精英概率
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

/** 生成熟练度远征模式地图 */
export function generateProficiencyMap(seed: number): RunMap {
  const rng = createRng(seed * 7919 + 104729);
  const layers: MapNode[][] = [];
  const encounter: Record<string, { speciesId: string }[]> = {};
  const boss: Record<string, { speciesId: string }[]> = {};
  const events: Record<string, EventNode> = {};
  const specials: Record<string, SpecialNode> = {};

  // 固定节点：第1层战斗，每5层商店，第10层奇遇，第15层Boss
  const forcedShopLayers = new Set([5, 10, 15]);
  const forcedSpecialLayer = 10;

  for (let layer = 1; layer <= TOTAL_LAYERS; layer++) {
    let nodeType: NodeType;

    if (layer === 1) {
      // 第1层：强制战斗（教学战）
      nodeType = 'battle';
    } else if (layer === TOTAL_LAYERS) {
      // 第15层：强制Boss
      nodeType = 'boss';
    } else if (forcedShopLayers.has(layer)) {
      // 固定商店层
      nodeType = 'shop';
    } else if (layer === forcedSpecialLayer) {
      // 第10层：奇遇关
      nodeType = 'special';
    } else {
      // 随机节点类型
      const probs = getLayerProbs(layer);
      // 商店已在固定层处理，降低随机到商店的概率
      probs.shop = 0;
      // 奇遇关已在第10层处理
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

  // 生成Boss遭遇（熟练之主 + 2只小怪）
  const bossNodeId = `pf_${TOTAL_LAYERS}`;
  boss[bossNodeId] = [
    { speciesId: 'proficiency_master' },
    { speciesId: 'proficiency_puppet' },
    { speciesId: 'proficiency_puppet' },
  ];

  return {
    layers,
    encounter,
    boss,
    events,
    specials,
  };
}

/** 获取熟练度远征模式的敌人遭遇 */
export function getProficiencyEncounter(
  layer: number,
  rng: () => number,
): { speciesId: string }[] {
  // 根据层进度选择敌人规模
  let maxEnemies: number;
  if (layer <= 5) {
    maxEnemies = randInt(rng, 1, 2);
  } else if (layer <= 10) {
    maxEnemies = randInt(rng, 2, 3);
  } else {
    maxEnemies = 3;
  }

  // 敌人池：从主模式品阶1~2的生物中随机选择
  const ENEMY_POOL = [
    'momo', 'lulu', 'fifi', 'kiki', 'mimi', 'pipi',  // 品阶1
    'momo_queen', 'lulu_king', 'fifi_king', 'sisi', 'gora', 'mimi_king',  // 品阶2
  ];

  const enemies: { speciesId: string }[] = [];
  for (let i = 0; i < maxEnemies; i++) {
    enemies.push({ speciesId: pick(rng, ENEMY_POOL) });
  }
  return enemies;
}

/** 精英战斗遭遇（更强敌人） */
export function getProficiencyEliteEncounter(
  layer: number,
  rng: () => number,
): { speciesId: string }[] {
  // 精英战斗：2~3只品阶2的生物
  const ELITE_POOL = [
    'momo_queen', 'lulu_king', 'fifi_king', 'sisi', 'gora', 'mimi_king',
    'momo_god', 'lulu_god', 'fifi_god', 'sisi_god', 'gora_god', 'mimi_god',
  ];

  const count = layer >= 10 ? 3 : 2;
  const enemies: { speciesId: string }[] = [];
  for (let i = 0; i < count; i++) {
    enemies.push({ speciesId: pick(rng, ELITE_POOL) });
  }
  return enemies;
}
