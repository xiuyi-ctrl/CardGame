import { createRng, pick } from '../rng';
import { makeUnit } from '../core/battle';
import { canMasterEnhance } from '../core/growth';
import type { Unit } from '../types';
import { generateGrowthMap } from '../core/growth-map';
import { GROWTH_EVENT_TYPES, buildGrowthEvent } from '../data/growth-events';
import { GROWTH_SPECIAL_REWARDS, type GrowthSpecialKind } from '../data/growth-special';
import { MAIN_REGIONS } from '../data/regions';
import { FOODS } from '../data/foods';
import { ITEMS } from '../data/items';
import { emptyMainRating } from '../rating';
import { buildEncounter, buildEventByType, buildSpecial, EVENT_TYPE_LABELS, generateMap, hashStr, labelOf, SPECIAL_REWARDS,
  type GameState, type MapNode, type SpecialRewardKind, type TestScenario } from './game';

export function prepareTestScenario(initial: GameState, input: TestScenario): { state: GameState; node: MapNode } {
  const scenario: TestScenario = { ...input, act: Math.max(1, Math.min(3, Math.floor(input.act) || 1)),
    layer: Math.max(1, Math.min(50, Math.floor(input.layer) || 1)), seed: Math.max(1, Math.floor(input.seed) || 1),
    gold: Math.max(0, Math.floor(input.gold) || 0), itemCount: Math.max(0, Math.min(99, Math.floor(input.itemCount) || 0)),
    hpPercent: Math.max(1, Math.min(100, input.hpPercent || 100)), deadCount: Math.max(0, Math.min(3, input.deadCount || 0)) };
  const prof = scenario.mode === 'proficiency';
  const map = prof ? generateGrowthMap(scenario.seed) : generateMap(scenario.seed, scenario.act, scenario.difficulty, scenario.region);
  const row = prof ? scenario.layer - 1 : scenario.nodeType === 'boss' ? map.layers.length - 1 : Math.min(scenario.layer, map.layers.length - 2);
  const nodeId = 'custom_test';
  const node: MapNode = { id: nodeId, type: scenario.nodeType, label: labelOf(scenario.nodeType, row), col: 0 };
  if (node.type === 'corrupted') { node.corruptDebuff = scenario.corruptDebuff ?? 'spd'; node.corruptReward = scenario.corruptReward ?? 'gold'; }
  if (node.type === 'gauntlet') node.gauntletSize = scenario.act === 3 ? 3 : 2;
  if (node.type === 'keydoor') node.guardianId = nodeId;
  if (node.type === 'sync') node.pairedId = `${nodeId}_pair`;
  map.layers[row] = node.type === 'sync'
    ? [node, { ...node, id: node.pairedId!, pairedId: nodeId, col: 1 }] : [node];
  const ids = prof ? ['momo', 'lulu', 'fifi'] : ['momo_god', 'lulu_god', 'fifi_god', 'momo', 'lulu', 'fifi'];
  const roster = Array.from({ length: Math.max(1, Math.min(prof ? 5 : 10, Math.floor(scenario.partySize ?? ids.length))) }, (_, i) => {
    const id = ids[i % ids.length];
    const unit = makeUnit(id, true, (i % 3) as 0 | 1 | 2, false, i < 3 ? 'front' : 'back');
    return configureTestGrowth({ ...unit, hp: Math.max(1, Math.round(unit.maxHp * scenario.hpPercent / 100)), growthPoints: prof ? 100 : undefined }, scenario);
  });
  const inventory = Object.fromEntries([...Object.keys(FOODS), ...Object.keys(ITEMS)].map(id => [id, scenario.itemCount]));
  if (node.type === 'keydoor') inventory[`key_${nodeId}`] = 1;
  const rng = createRng(scenario.seed * 7 + hashStr(nodeId));
  const encounterType = node.type === 'corrupted' ? 'battle' : node.type;
  if (['battle', 'elite', 'boss', 'arena', 'gauntlet', 'corrupted', 'guardian'].includes(node.type)) {
    const bossId = scenario.bossId || (prof ? pick(rng, Object.values(map.boss).map(team => team[0].speciesId)) : pick(rng, MAIN_REGIONS[scenario.region].bossPools[scenario.act]));
    const growthBossLayer = scenario.layer <= 15 ? 15 : scenario.layer <= 30 ? 30 : 50;
    const encounter = prof && node.type === 'boss' && !scenario.bossId
      ? map.boss[`pf_${growthBossLayer}`]
      : buildEncounter(rng, encounterType, scenario.act, Math.min(1, Math.max(0, (row - 1) / (map.layers.length - 3))), bossId, node.gauntletSize, scenario.region);
    if (node.type === 'boss') map.boss[nodeId] = encounter;
    else map.encounter[nodeId] = encounter;
  }
  const state: GameState = { ...initial, testRun: true, testScenario: scenario, saveSlot: undefined, screen: 'map',
    runMode: scenario.mode, region: prof ? undefined : scenario.region, difficulty: scenario.difficulty, act: scenario.act,
    currentLayer: prof ? scenario.layer : undefined, seed: scenario.seed, currentRow: row, currentNodeId: nodeId,
    map, roster, field: roster.slice(0, 5).map(unit => unit.uid), inventory, gold: scenario.gold,
    deadPets: Array.from({ length: scenario.deadCount }, () => ({ ...makeUnit('momo_queen', true, 0, false), hp: 0 })),
    legendEvolutionUnlocked: scenario.act >= 2,
    runStats: initial.runStats ? { ...initial.runStats, rating: prof ? undefined : emptyMainRating() } : undefined,
    proficiencyStats: prof ? { totalProficiency: 0, totalGrowthPoints: 0, battlesWon: 0, battlesLost: 0, kills: 0 } : undefined,
    log: [`[测试] ${scenario.mode === 'main' ? '主模式' : '熟练度'} · ${labelOf(node.type, row)} · 种子${scenario.seed}`],
  };
  return { state: applyTestContent(state), node };
}

export function configureTestGrowth(unit: Unit, scenario?: TestScenario): Unit {
  if (scenario?.mode !== 'proficiency' || !(scenario.growthSkillLevel! > 0)) return unit;
  const slots = unit.skills.map((_, slot) => slot).filter(slot => canMasterEnhance(unit, slot));
  return { ...unit, skillEnhancements: Object.fromEntries(slots.map(slot => [slot, Math.max(0, Math.min(4, Math.floor(scenario.growthSkillLevel!)))])),
    skillEnhancePaid: Object.fromEntries(slots.map(slot => [slot, Math.max(0, Math.floor(scenario.growthSkillPaid ?? 0))])) };
}

/** 进入节点后覆盖指定内容，防止熟练度事件/奇遇入口重新随机。 */
export function applyTestContent(state: GameState): GameState {
  const scenario = state.testScenario;
  if (!scenario) return state;
  const rng = createRng(scenario.seed * 7 + hashStr(state.currentNodeId));
  const id = state.currentNodeId;
  if (scenario.nodeType === 'event') {
    const event = scenario.mode === 'proficiency'
      ? buildGrowthEvent(rng, GROWTH_EVENT_TYPES.find(type => type === scenario.eventType), state.deadPets?.length, scenario.layer)
      : buildEventByType(rng, scenario.eventType && EVENT_TYPE_LABELS[scenario.eventType] ? scenario.eventType : 'spring', scenario.act, scenario.region);
    return { ...state, map: { ...state.map, events: { ...state.map.events, [id]: event } } };
  }
  if (scenario.nodeType === 'special') {
    if (scenario.mode === 'main') {
      const chosen = SPECIAL_REWARDS.find(reward => reward.id === scenario.specialId);
      return { ...state, map: { ...state.map, specials: { ...state.map.specials, [id]: chosen
        ? { title: '奇遇', desc: '选择奖励', rewards: [{ ...chosen }] } : buildSpecial(rng) } } };
    }
    const chosen = GROWTH_SPECIAL_REWARDS[scenario.specialId as GrowthSpecialKind];
    if (chosen) {
      const kinds: Record<GrowthSpecialKind, SpecialRewardKind> = { growth_blessing: 'growthPoint', stat_blessing: 'boost',
        skill_blessing: 'slotUnlock', legend_recruit: 'recruit', gold_treasure: 'gold', revive: 'revive' };
      return { ...state, map: { ...state.map, specials: { ...state.map.specials,
        [id]: { title: '奇遇', desc: '选择奖励', rewards: [{ ...chosen, kind: chosen.growthEncounter ? 'growthEncounter' : kinds[chosen.id] }] } } } };
    }
  }
  return state;
}
