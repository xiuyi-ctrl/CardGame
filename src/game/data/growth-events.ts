/**
 * 成长远征模式 - 专属事件池（10个）
 * 围绕成长点成长设计
 */
import { pick, shuffle } from '../rng';
import type { EventNode } from '../state/game';

export type GrowthEventType =
  | 'ancient_arena'
  | 'battle_master'
  | 'soul_resonance'
  | 'skill_mentor'
  | 'mysterious_altar'
  | 'expedition_supply'
  | 'pet_recruit'
  | 'arena_challenge'
  | 'stone_of_forget'
  | 'revive_dead';

export const GROWTH_EVENT_TYPES: GrowthEventType[] = [
  'ancient_arena',
  'battle_master',
  'soul_resonance',
  'skill_mentor',
  'mysterious_altar',
  'expedition_supply',
  'pet_recruit',
  'arena_challenge',
  'stone_of_forget',
  'revive_dead',
];

export const GROWTH_EVENT_NAMES: Record<GrowthEventType, string> = {
  ancient_arena: '远古训练场',
  battle_master: '战斗大师',
  soul_resonance: '灵魂共鸣',
  skill_mentor: '技能导师',
  mysterious_altar: '神秘祭坛',
  expedition_supply: '远征补给',
  pet_recruit: '生物招募',
  arena_challenge: '训练场挑战',
  stone_of_forget: '遗忘之石',
  revive_dead: '灵魂墓园',
};

export function buildGrowthEvent(rng: () => number, eventType?: GrowthEventType): EventNode {
  const type = eventType ?? pick(rng, GROWTH_EVENT_TYPES);
  return buildGrowthEventByType(type);
}

function buildGrowthEventByType(type: GrowthEventType): EventNode {
  switch (type) {
    case 'ancient_arena':
      return {
        title: '远古训练场',
        desc: '你发现了一座古老的训练场，空气中弥漫着战斗的气息。',
        choices: [
          { id: 'ga-train-core', label: '训练核心', desc: '选择 1 只宠物，获得 2 成长点', kind: 'growthPoint', amount: 2 },
          { id: 'ga-train-all', label: '训练全队', desc: '全队各获得 1 成长点', kind: 'growthPoint', amount: 1, targetAll: true },
          { id: 'ga-leave', label: '离开', desc: '无事发生', kind: 'none' },
        ],
      };
    case 'battle_master':
      return {
        title: '战斗大师',
        desc: '一位隐居的战斗大师愿意指导你。',
        choices: [
          { id: 'gm-learn', label: '拜师学艺', desc: '选择 1 只宠物，获得 2 成长点', kind: 'growthPoint', amount: 2 },
          { id: 'gm-duel', label: '切磋', desc: '战斗（1 只精英），胜利后获得 30 金币', kind: 'battle', battleEnemies: [{ speciesId: 'momo_queen' }], battleReward: { kind: 'gold', amount: 30 }, battlePenalty: { percent: 20 } },
          { id: 'gm-leave', label: '离开', desc: '无事发生', kind: 'none' },
        ],
      };
    case 'soul_resonance':
      return {
        title: '灵魂共鸣',
        desc: '一股神秘的力量在涌动，似乎可以强化你的宠物。',
        choices: [
          { id: 'sr-hp', label: '强化生命', desc: '选择 1 只宠物，永久 +2 生命（不计入属性提升上限）', kind: 'permanentBoost', boostStat: 'hp', amount: 2, noCap: true },
          { id: 'sr-spd', label: '强化速度', desc: '选择 1 只宠物，永久 +1 速度（不计入属性提升上限）', kind: 'permanentBoost', boostStat: 'spd', amount: 1, noCap: true },
          { id: 'sr-leave', label: '离开', desc: '无事发生', kind: 'none' },
        ],
      };
    case 'skill_mentor':
      return {
        title: '技能导师',
        desc: '一位精通技能的导师愿意传授知识。',
        choices: [
          { id: 'sm-learn', label: '学习新技能', desc: '选择 1 只宠物，替换 1 个技能（免费）', kind: 'skillReplace' },
          { id: 'sm-item', label: '请教', desc: '获得 1 个治疗圣水', kind: 'food', foodId: 'heal_potion' },
          { id: 'sm-leave', label: '离开', desc: '无事发生', kind: 'none' },
        ],
      };
    case 'mysterious_altar':
      return {
        title: '神秘祭坛',
        desc: '一座古老的祭坛散发着神秘的光芒。',
        choices: [
          { id: 'ma-pray', label: '祈祷', desc: '消耗 20 金币，选择 1 只宠物获得 3 成长点', kind: 'growthPoint', amount: 3, goldDelta: -20 },
          { id: 'ma-bless', label: '祈福', desc: '选择 1 只宠物，50% 获得 3 成长点', kind: 'growthPoint', amount: 3, chance: 0.5 },
          { id: 'ma-leave', label: '离开', desc: '无事发生', kind: 'none' },
        ],
      };
    case 'expedition_supply':
      return {
        title: '远征补给',
        desc: '你发现了一个补给箱。',
        choices: [
          { id: 'es-gold', label: '领取金币', desc: '获得 30 金币', kind: 'gold', goldDelta: 30 },
          { id: 'es-item', label: '领取道具', desc: '获得 1 个治疗圣水', kind: 'food', foodId: 'heal_potion' },
          { id: 'es-leave', label: '离开', desc: '无事发生', kind: 'none' },
        ],
      };
    case 'pet_recruit':
      return {
        title: '生物招募',
        desc: '一只野生生物似乎愿意加入你的队伍。',
        choices: [
          { id: 'pr-recruit', label: '招募', desc: '获得 1 只随机生物（品阶 1~2）', kind: 'recruit', monsterId: 'momo' },
          { id: 'pr-refuse', label: '拒绝', desc: '获得 15 金币', kind: 'gold', goldDelta: 15 },
          { id: 'pr-leave', label: '离开', desc: '无事发生', kind: 'none' },
        ],
      };
    case 'arena_challenge':
      return {
        title: '训练场挑战',
        desc: '训练场守卫向你发起挑战。',
        choices: [
          { id: 'ac-accept', label: '接受挑战', desc: '战斗（2 只敌人），胜利后获得 30 金币', kind: 'battle', battleEnemies: [{ speciesId: 'momo' }, { speciesId: 'lulu' }], battleReward: { kind: 'gold', amount: 30 }, battlePenalty: { percent: 15 } },
          { id: 'ac-leave', label: '离开', desc: '无事发生', kind: 'none' },
        ],
      };
    case 'stone_of_forget':
      return {
        title: '遗忘之石',
        desc: '一块古老的石头散发着神秘的光芒。',
        choices: [
          { id: 'sf-reset', label: '重置', desc: '选择 1 只宠物，重置其成长点（重新分配）', kind: 'resetGrowthPoints' },
          { id: 'sf-leave', label: '离开', desc: '无事发生', kind: 'none' },
        ],
      };
    case 'revive_dead':
      return {
        title: '灵魂墓园',
        desc: '你发现了一处古老的墓园，亡灵的低语回荡在空气中。或许可以尝试唤醒逝去的伙伴……',
        choices: [
          { id: 'rd-revive', label: '尝试复活', desc: '选择 1 只死亡宠物复活（保留 50% 基础属性）', kind: 'revive', reviveRatio: 0.5 },
          { id: 'rd-leave', label: '离开', desc: '无事发生', kind: 'none' },
        ],
      };
    default:
      return {
        title: '未知事件',
        desc: '你遇到了一个未知的事件。',
        choices: [{ id: 'unknown-leave', label: '离开', desc: '无事发生', kind: 'none' }],
      };
  }
}

export function getRandomGrowthEventTypes(rng: () => number, count: number): GrowthEventType[] {
  return shuffle(rng, [...GROWTH_EVENT_TYPES]).slice(0, count);
}
