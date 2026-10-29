/**
 * 成长远征模式 - 专属事件池（10个）
 * 围绕成长点成长设计
 */
import { pick, shuffle } from '../rng';
import type { EventChoice, EventNode } from '../state/game';
import type { GrowthEncounterKind } from '../state/growth-encounters';

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
  ancient_arena: '分岔训练场',
  battle_master: '战斗大师',
  soul_resonance: '共鸣水晶',
  skill_mentor: '遗忘书屋',
  mysterious_altar: '神秘祭坛',
  expedition_supply: '远征补给',
  pet_recruit: '生物招募',
  arena_challenge: '训练场挑战',
  stone_of_forget: '拆解工坊',
  revive_dead: '灵魂墓园',
};

export function buildGrowthEvent(rng: () => number, eventType?: GrowthEventType, deadPetCount: number = 0, layer = 16, previousTitle?: string): EventNode {
  let type = eventType;
  if (!type) {
    let pool = GROWTH_EVENT_TYPES.filter(id => (layer >= 16 || id !== 'stone_of_forget') && GROWTH_EVENT_NAMES[id] !== previousTitle);
    if (deadPetCount <= 0) {
      pool = pool.filter((id) => id !== 'revive_dead');
    }
    type = pick(rng, pool);
  }
  return buildGrowthEventByType(type);
}

function growthChoice(kind: GrowthEncounterKind, label: string, desc: string): EventChoice {
  return { id: kind, kind: 'growthEncounter', growthEncounter: kind, label, desc };
}

function buildGrowthEventByType(type: GrowthEventType): EventNode {
  switch (type) {
    case 'ancient_arena':
      return { title: '分岔训练场', desc: '独行试炼与双人协作，你选择哪种训练？', choices: [
        growthChoice('train_core', '集中训练', '指定一只伙伴获得3成长点'),
        growthChoice('train_pair', '双人训练', '指定两只不同伙伴，各获得2成长点'),
        { id: 'leave', label: '离开', desc: '无事发生', kind: 'none' },
      ] };
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
      return { title: '共鸣水晶', desc: '短暂连接两位伙伴的成长记忆。', choices: [
        growthChoice('transfer', '连接伙伴', '指定两只伙伴，免手续费转移1～6成长点'),
        growthChoice('absorb', '吸收水晶', '指定一只伙伴获得2成长点'),
        { id: 'leave', label: '离开', desc: '无事发生', kind: 'none' },
      ] };
    case 'skill_mentor':
      return { title: '遗忘书屋', desc: '用一段旧记忆交换新的战斗知识。', choices: [
        growthChoice('relearn', '重新学习', '20金币，指定伙伴替换一个技能；新技能三选一，原强化清除'),
        growthChoice('insight', '整理心得', '指定一只伙伴获得1成长点'),
        { id: 'leave', label: '离开', desc: '无事发生', kind: 'none' },
      ] };
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
      return { title: '拆解工坊', desc: '回收真实训练投入，或购买一颗强化石。', choices: [
        growthChoice('recycle', '回收强化', '清除一个技能全部强化，返还实际支付费用100%；免费强化不退款'),
        growthChoice('buy_stone', '购买强化石', '30金币，获得一颗普通技能强化石'),
        { id: 'leave', label: '离开', desc: '无事发生', kind: 'none' },
      ] };
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

export function getRandomGrowthEventTypes(rng: () => number, count: number, deadPetCount: number = 0): GrowthEventType[] {
  let pool = [...GROWTH_EVENT_TYPES];
  if (deadPetCount <= 0) {
    pool = pool.filter((id) => id !== 'revive_dead');
  }
  return shuffle(rng, pool).slice(0, count);
}
