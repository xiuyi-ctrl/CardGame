/**
 * 熟练度远征模式 - 专属事件池（10个）
 * 围绕熟练度成长设计
 */
import { pick, shuffle } from '../rng';
import type { EventNode } from '../state/game';

/** 事件类型 */
export type ProficiencyEventType =
  | 'ancient_arena'      // 远古训练场
  | 'battle_master'      // 战斗大师
  | 'soul_resonance'     // 灵魂共鸣
  | 'skill_mentor'       // 技能导师
  | 'mysterious_altar'   // 神秘祭坛
  | 'expedition_supply'  // 远征补给
  | 'pet_recruit'        // 生物招募
  | 'arena_challenge'    // 训练场挑战
  | 'stone_of_forget'    // 遗忘之石
  | 'wheel_of_fate';     // 命运之轮

/** 所有事件类型 */
export const PROFICIENCY_EVENT_TYPES: ProficiencyEventType[] = [
  'ancient_arena',
  'battle_master',
  'soul_resonance',
  'skill_mentor',
  'mysterious_altar',
  'expedition_supply',
  'pet_recruit',
  'arena_challenge',
  'stone_of_forget',
  'wheel_of_fate',
];

/** 事件名称映射 */
export const PROFICIENCY_EVENT_NAMES: Record<ProficiencyEventType, string> = {
  ancient_arena: '远古训练场',
  battle_master: '战斗大师',
  soul_resonance: '灵魂共鸣',
  skill_mentor: '技能导师',
  mysterious_altar: '神秘祭坛',
  expedition_supply: '远征补给',
  pet_recruit: '生物招募',
  arena_challenge: '训练场挑战',
  stone_of_forget: '遗忘之石',
  wheel_of_fate: '命运之轮',
};

/** 生成熟练度远征模式事件 */
export function buildProficiencyEvent(rng: () => number, eventType?: ProficiencyEventType): EventNode {
  const type = eventType ?? pick(rng, PROFICIENCY_EVENT_TYPES);
  return buildProficiencyEventByType(type);
}

/** 按类型构建事件 */
function buildProficiencyEventByType(type: ProficiencyEventType): EventNode {
  switch (type) {
    case 'ancient_arena':
      return {
        title: '远古训练场',
        desc: '你发现了一座古老的训练场，空气中弥漫着战斗的气息。',
        choices: [
          { id: 'pa-train-core', label: '训练核心', desc: '选择 1 只宠物，获得 3 熟练度', kind: 'boost', boostStat: 'hp' },
          { id: 'pa-train-all', label: '训练全队', desc: '全队获得 1 熟练度', kind: 'boost', boostStat: 'spd' },
          { id: 'pa-leave', label: '离开', desc: '无事发生', kind: 'none' },
        ],
      };
    case 'battle_master':
      return {
        title: '战斗大师',
        desc: '一位隐居的战斗大师愿意指导你。',
        choices: [
          { id: 'pm-learn', label: '拜师学艺', desc: '选择 1 只宠物，获得 2 熟练度 + 1 成长点', kind: 'boost', boostStat: 'hp' },
          { id: 'pm-duel', label: '切磋', desc: '战斗（1 只精英），胜利后获得 1 成长点', kind: 'battle', battleEnemies: [{ speciesId: 'momo_queen' }], battleReward: { kind: 'gold', amount: 30 }, battlePenalty: { percent: 20 } },
          { id: 'pm-leave', label: '离开', desc: '无事发生', kind: 'none' },
        ],
      };
    case 'soul_resonance':
      return {
        title: '灵魂共鸣',
        desc: '一股神秘的力量在涌动，似乎可以强化你的宠物。',
        choices: [
          { id: 'sr-hp', label: '强化生命', desc: '选择 1 只宠物，永久 +2 生命', kind: 'boost', boostStat: 'hp' },
          { id: 'sr-spd', label: '强化速度', desc: '选择 1 只宠物，永久 +1 速度', kind: 'boost', boostStat: 'spd' },
          { id: 'sr-leave', label: '离开', desc: '无事发生', kind: 'none' },
        ],
      };
    case 'skill_mentor':
      return {
        title: '技能导师',
        desc: '一位精通技能的导师愿意传授知识。',
        choices: [
          { id: 'sm-learn', label: '学习新技能', desc: '选择 1 只宠物，替换 1 个技能（免费）', kind: 'boost', boostStat: 'hp' },
          { id: 'sm-item', label: '请教', desc: '获得 1 个随机道具', kind: 'item', itemId: 'scout' },
          { id: 'sm-leave', label: '离开', desc: '无事发生', kind: 'none' },
        ],
      };
    case 'mysterious_altar':
      return {
        title: '神秘祭坛',
        desc: '一座古老的祭坛散发着神秘的光芒。',
        choices: [
          { id: 'ma-sacrifice', label: '献祭', desc: '放生 1 只宠物，全队获得 5 熟练度', kind: 'sacrifice' },
          { id: 'ma-pray', label: '祈祷', desc: '消耗 20 金币，全队获得 2 熟练度', kind: 'gold', goldDelta: -20 },
          { id: 'ma-leave', label: '离开', desc: '无事发生', kind: 'none' },
        ],
      };
    case 'expedition_supply':
      return {
        title: '远征补给',
        desc: '你发现了一个补给箱。',
        choices: [
          { id: 'es-gold', label: '领取金币', desc: '获得 30 金币', kind: 'gold', goldDelta: 30 },
          { id: 'es-item', label: '领取道具', desc: '获得 1 个随机道具', kind: 'item', itemId: 'scout' },
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
          { id: 'ac-accept', label: '接受挑战', desc: '战斗（2 只敌人），胜利后全队 +2 熟练度', kind: 'battle', battleEnemies: [{ speciesId: 'momo' }, { speciesId: 'lulu' }], battleReward: { kind: 'gold', amount: 25 }, battlePenalty: { percent: 15 } },
          { id: 'ac-leave', label: '离开', desc: '无事发生', kind: 'none' },
        ],
      };
    case 'stone_of_forget':
      return {
        title: '遗忘之石',
        desc: '一块古老的石头散发着神秘的光芒。',
        choices: [
          { id: 'sf-reset', label: '重置', desc: '选择 1 只宠物，重置其成长点（重新分配）', kind: 'boost', boostStat: 'hp' },
          { id: 'sf-leave', label: '离开', desc: '无事发生', kind: 'none' },
        ],
      };
    case 'wheel_of_fate':
      return {
        title: '命运之轮',
        desc: '一个神秘的轮盘，似乎可以决定你的命运。',
        choices: [
          { id: 'wf-bet', label: '投入 20 金', desc: '50% 获得 5 熟练度，50% 全亏', kind: 'gold', goldDelta: -20 },
          { id: 'wf-leave', label: '离开', desc: '无事发生', kind: 'none' },
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

/** 获取随机事件类型（不重复） */
export function getRandomEventTypes(rng: () => number, count: number): ProficiencyEventType[] {
  return shuffle(rng, [...PROFICIENCY_EVENT_TYPES]).slice(0, count);
}
