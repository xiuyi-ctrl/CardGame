/**
 * 成长远征模式 - 线性爬塔地图生成
 * 每层1个节点，共50层，包含3个Boss（层15/30/50）
 */
import { createRng, randInt, pick, weightedPick } from '../rng';
import type { MapNode, NodeType, RunMap } from '../state/game';
import { labelOf, ACT_BOSS_POOLS, BOSS_MINIONS } from '../state/game';

/** 总层数 */
export const TOTAL_LAYERS = 50;

// ---- 生物池（模块级导出，供 growth-arena.ts 等引用） ----
/** 一阶生物（rank 1） */
export const TIER1 = ['momo', 'lulu', 'fifi', 'kiki', 'mimi', 'pipi', 'coal', 'candle', 'molten_larva', 'ember_hawk', 'light_moss', 'fire_fox'];
/** 二阶生物（rank 2） */
export const TIER2 = ['momo_queen', 'lulu_king', 'fifi_king', 'sisi', 'gora', 'mimi_king', 'coal_guard', 'lantern_moth', 'molten_beetle', 'searing_hawk', 'moss_beast', 'phantom_tail_fox', 'torch_fox'];
/** 传奇生物（rank 3） */
export const LEGENDARY = ['momo_god', 'lulu_god', 'fifi_god', 'gora_god', 'mimi_god', 'sisi_god', 'furnace_beast', 'eternal_moth', 'molten_beast', 'solar_eagle', 'solar_spirit', 'nine_tail_sovereign', 'torch_fox_lord'];

/** 首领与休憩先占位，其他节点只能使用空位。 */
const BOSS_LAYERS = [15, 30, 50];
const GUARANTEED_REST_LAYERS = [10, 14, 20, 29, 40, 49];
const BLACKSMITH_WINDOWS = [[6, 8], [12, 13], [18, 19], [25, 27], [33, 35], [41, 43], [46, 48]];

/** 枚举满足最大间隔的完整方案，避免逐次抽取后走入无解位置。 */
function blacksmithSchedules(index = 0, path: number[] = []): number[][] {
  if (index === BLACKSMITH_WINDOWS.length) return [path];
  const [start, end] = BLACKSMITH_WINDOWS[index];
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
    .filter(layer => !GUARANTEED_REST_LAYERS.includes(layer) && !BOSS_LAYERS.includes(layer)
      && (!path.length || layer - path[path.length - 1] <= 8))
    .flatMap(layer => blacksmithSchedules(index + 1, [...path, layer]));
}
const BLACKSMITH_SCHEDULES = blacksmithSchedules();

/** 剩余空位只生成战斗，保留原先各层段普通／精英的相对权重。 */
function growthBattleType(layer: number, rng: () => number): NodeType {
  if (layer <= 5) return 'battle';
  const [battle, elite] = layer <= 10 ? [60, 7] : layer <= 25 ? [58, 12] : layer <= 40 ? [52, 18] : [53, 20];
  return rng() * (battle + elite) < battle ? 'battle' : 'elite';
}

/** 生成成长远征地图：先保底成长骨架，再分段放置补给、事件及挑战。 */
export function generateGrowthMap(seed: number): RunMap {
  const rng = createRng(seed * 7919 + 104729);
  const planned = new Map<number, NodeType>();
  BOSS_LAYERS.forEach(layer => planned.set(layer, 'boss'));
  GUARANTEED_REST_LAYERS.forEach(layer => planned.set(layer, 'rest'));
  pick(rng, BLACKSMITH_SCHEDULES).forEach(layer => planned.set(layer, 'blacksmith'));
  const available = (type: NodeType, start: number, end: number) => Array.from({ length: end - start + 1 }, (_, i) => start + i)
    .filter(layer => !planned.has(layer) && (type !== 'shop' || [...planned].every(([other, kind]) => kind !== 'shop' || Math.abs(other - layer) >= 3))
      && (type !== 'event' || planned.get(layer - 1) !== 'event' && planned.get(layer + 1) !== 'event'));
  const place = (type: NodeType, start: number, end: number) => {
    const candidates = available(type, start, end);
    if (!candidates.length) throw new Error(`熟练度地图无法放置${type}：${start}～${end}`);
    planned.set(pick(rng, candidates), type);
  };
  for (const [start, end] of [[6, 11], [16, 23], [24, 31], [32, 39], [42, 48]]) place('shop', start, end);
  const eventCount = randInt(rng, 4, 6);
  const omitEvent = eventCount === 4 ? randInt(rng, 1, 4) : -1;
  [[6, 9], [16, 18], [21, 24], [32, 37], [43, 48]].forEach(([start, end], index) => {
    if (index !== omitEvent) place('event', start, end);
  });
  for (const [start, end] of [[9, 13], [21, 28], [36, 45]]) place('special', start, end);
  for (const [start, end] of [[16, 28], [32, 45]]) place('arena3', start, end);
  if (rng() < .5) {
    const candidates = available('shop', 9, 48);
    if (candidates.length) planned.set(pick(rng, candidates), 'shop');
  }
  if (eventCount === 6) place('event', 6, 48);
  const layers: MapNode[][] = Array.from({ length: TOTAL_LAYERS }, (_, index) => {
    const layer = index + 1, type = planned.get(layer) ?? growthBattleType(layer, rng);
    return [{ id: `pf_${layer}`, type, label: labelOf(type, layer), col: 0 }];
  });
  const positions = (type: NodeType) => layers.flatMap((row, index) => row[0].type === type ? [index + 1] : []);
  const iron = positions('blacksmith'), shops = positions('shop'), events = positions('event');
  if (iron.length !== 7 || iron[0] < 6 || iron[0] > 8 || iron[6] < 46 || iron[6] > 48
    || iron.slice(1).some((layer, i) => layer - iron[i] > 8)
    || shops.length < 5 || shops.length > 6 || events.length < 4 || events.length > 6
    || positions('special').length !== 3 || positions('arena3').length !== 2
    || BOSS_LAYERS.some(layer => layers[layer - 1][0].type !== 'boss')
    || GUARANTEED_REST_LAYERS.some(layer => layers[layer - 1][0].type !== 'rest')) {
    throw new Error('熟练度最终地图不满足成长与补给保底');
  }
  return { layers, encounter: {}, boss: pregenerateBoss(seed), events: {}, specials: {} };
}

/** 预生成Boss遭遇（按幕次随机选Boss，供 nodeInfo 显示 + enterNode 读取） */
function pregenerateBoss(seed: number): Record<string, { speciesId: string }[]> {
  const rng = createRng(seed * 4919 + 6131);
  const bossMap: Record<string, { speciesId: string }[]> = {};
  // 层15: 第一幕Boss随机选一个
  const act1Boss = pick(rng, ACT_BOSS_POOLS[1]);
  const act1Minions = (BOSS_MINIONS[act1Boss] ?? []).slice(0, 1);
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

/** 整队品阶模板。相邻锚点线性混合权重，避免人数和品阶各自抽取后叠加。 */
type TeamPlan = [number[], number];
type EncounterAnchor = { layer: number; normal: TeamPlan[]; elite: TeamPlan[] };
const ENCOUNTER_ANCHORS: EncounterAnchor[] = [
  { layer: 1, normal: [[[1], 100]], elite: [[[2], 100]] },
  { layer: 5, normal: [[[1], 100]], elite: [[[2], 100]] },
  { layer: 10, normal: [[[1], 20], [[1, 1], 60], [[2], 20]], elite: [[[2], 70], [[2, 1], 30]] },
  { layer: 14, normal: [[[1, 1], 45], [[2], 40], [[2, 1], 15]], elite: [[[2, 1], 80], [[2, 2], 20]] },
  { layer: 16, normal: [[[1, 1], 45], [[2], 40], [[2, 1], 15]], elite: [[[2, 1], 80], [[2, 2], 20]] },
  { layer: 20, normal: [[[1, 1], 10], [[2], 30], [[2, 1], 60]], elite: [[[2, 1], 50], [[2, 2], 50]] },
  { layer: 24, normal: [[[2, 1], 50], [[2, 2], 30], [[2, 1, 1], 20]], elite: [[[2, 2], 60], [[2, 2, 1], 30], [[3, 1], 10]] },
  { layer: 29, normal: [[[2, 1], 20], [[2, 2], 45], [[2, 2, 1], 35]], elite: [[[2, 2], 40], [[2, 2, 1], 40], [[3, 1], 20]] },
  { layer: 31, normal: [[[2, 1], 20], [[2, 2], 45], [[2, 2, 1], 35]], elite: [[[2, 2], 40], [[2, 2, 1], 40], [[3, 1], 20]] },
  { layer: 35, normal: [[[2, 2], 45], [[2, 2, 1], 40], [[3, 1], 15]], elite: [[[2, 2, 1], 55], [[3, 2], 45]] },
  { layer: 40, normal: [[[2, 2], 20], [[2, 2, 1], 40], [[3, 2], 30], [[3, 2, 1], 10]], elite: [[[2, 2, 1], 30], [[3, 2], 50], [[3, 2, 1], 20]] },
  { layer: 45, normal: [[[2, 2, 1], 20], [[3, 2], 35], [[3, 2, 1], 35], [[3, 3], 10]], elite: [[[3, 2], 30], [[3, 2, 1], 50], [[3, 3], 20]] },
  { layer: 50, normal: [[[3, 2], 20], [[3, 2, 1], 45], [[3, 3], 25], [[3, 3, 2], 10]], elite: [[[3, 2, 1], 50], [[3, 3], 30], [[3, 3, 2], 20]] },
];

export function growthEncounterPlans(layer: number, elite = false): TeamPlan[] {
  const safeLayer = Math.max(1, Math.min(50, layer));
  const right = ENCOUNTER_ANCHORS.findIndex(anchor => anchor.layer >= safeLayer);
  const end = ENCOUNTER_ANCHORS[right], start = ENCOUNTER_ANCHORS[Math.max(0, right - 1)];
  const key = elite ? 'elite' : 'normal';
  if (start === end || safeLayer === end.layer) return end[key];
  const progress = (safeLayer - start.layer) / (end.layer - start.layer);
  return [...start[key].map(([team, weight]): TeamPlan => [team, weight * (1 - progress)]),
    ...end[key].map(([team, weight]): TeamPlan => [team, weight * progress])].filter(([, weight]) => weight > 0);
}

const SUPPORT_SPECIES = new Set(['candle', 'lantern_moth', 'eternal_moth', 'light_moss', 'moss_beast', 'solar_spirit', 'torch_fox', 'torch_fox_lord']);
const BURN_SPECIES = new Set([...TIER1.slice(6), ...TIER2.slice(6), ...LEGENDARY.slice(6), 'fifi', 'fifi_king', 'fifi_god']);
const POISON_SPECIES = new Set(['mimi', 'mimi_king', 'mimi_god', 'pipi', 'sisi', 'sisi_god']);
function encounterTheme(id: string): number { return BURN_SPECIES.has(id) ? 1 : POISON_SPECIES.has(id) ? 2 : 0; }

/** 先定整队预算，再配同主题伙伴；单体及纯辅助队伍必须有进攻／反伤单位。 */
function buildGrowthTeam(layer: number, rng: () => number, elite: boolean): { speciesId: string }[] {
  const plan = weightedPick(rng, growthEncounterPlans(layer, elite));
  const enemies: { speciesId: string }[] = [];
  for (const [index, rank] of plan.entries()) {
    const pool = [TIER1, TIER2, LEGENDARY][rank - 1];
    const needsAttacker = index === plan.length - 1 && enemies.every(unit => SUPPORT_SPECIES.has(unit.speciesId));
    const choices = pool.filter(id => (!needsAttacker || !SUPPORT_SPECIES.has(id)) && !enemies.some(unit => unit.speciesId === id));
    const themed = choices.filter(id => enemies.length && encounterTheme(id) === encounterTheme(enemies[0].speciesId));
    enemies.push({ speciesId: pick(rng, themed.length ? themed : choices) });
  }
  return enemies;
}

export function getGrowthEncounter(layer: number, rng: () => number): { speciesId: string }[] {
  return buildGrowthTeam(layer, rng, false);
}

export function getGrowthEliteEncounter(layer: number, rng: () => number): { speciesId: string }[] {
  return buildGrowthTeam(layer, rng, true);
}
