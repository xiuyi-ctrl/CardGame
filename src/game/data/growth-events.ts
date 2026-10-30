/**
 * 成长远征模式 - 专属事件池（10个）
 * 围绕成长点成长设计
 */
import { pick, shuffle } from '../rng';
import type { EventChoice, EventNode } from '../state/game';
import type { GrowthEncounterKind } from '../state/growth-encounters';
import { growthCompanions, growthDuelEnemy, growthTrialEnemies } from './growth-encounters';

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
  battle_master: '实战教官',
  soul_resonance: '共鸣水晶',
  skill_mentor: '遗忘书屋',
  mysterious_altar: '潜能祭坛',
  expedition_supply: '行脚补给站',
  pet_recruit: '同行契约',
  arena_challenge: '协同试炼',
  stone_of_forget: '拆解工坊',
  revive_dead: '回响墓园',
};

export const GROWTH_EVENT_GROUPS: GrowthEventType[][] = [
  ['ancient_arena', 'soul_resonance', 'mysterious_altar'],
  ['skill_mentor', 'stone_of_forget'],
  ['expedition_supply', 'pet_recruit'],
  ['battle_master', 'arena_challenge', 'revive_dead'],
];

export function buildGrowthEvent(rng: () => number, eventType?: GrowthEventType, deadPetCount: number = 0, layer = 16, previousTitle?: string, seenTitles: readonly string[] = []): EventNode {
  let type = eventType;
  if (!type) {
    let pool = GROWTH_EVENT_TYPES.filter(id => (layer >= 16 || id !== 'stone_of_forget') && GROWTH_EVENT_NAMES[id] !== previousTitle);
    if (deadPetCount <= 0) {
      pool = pool.filter((id) => id !== 'revive_dead');
    }
    const groups = GROWTH_EVENT_GROUPS.map(group => ({ pool: group.filter(id => pool.includes(id)),
      count: seenTitles.filter(title => group.some(id => GROWTH_EVENT_NAMES[id] === title)).length })).filter(group => group.pool.length > 0);
    const minCount = Math.min(...groups.map(group => group.count));
    type = pick(rng, pick(rng, groups.filter(group => group.count === minCount)).pool);
  }
  const event = buildGrowthEventByType(type);
  if (type === 'pet_recruit') event.choices[0].recruitCandidates = growthCompanions(layer, rng);
  if (type === 'battle_master') event.choices[0].battleEnemies = growthDuelEnemy(layer, rng);
  if (type === 'arena_challenge') event.choices[0].battleEnemies = growthTrialEnemies(layer, rng);
  return event;
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
      return { title: '实战教官', desc: '选择一位伙伴，独立完成实战考核。', choices: [
        growthChoice('duel', '单人考核', '指定1只伙伴单独战斗，胜利获得6成长点'),
        { id: 'gm-leave', label: '离开', desc: '无事发生', kind: 'none' },
      ] };
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
      return { title: '潜能祭坛', desc: '以旅费磨炼潜能，不消耗成长点。', choices: [
        growthChoice('altar_hp', '淬炼体魄', '30金币，指定伙伴最大生命＋2，计入成长上限'),
        growthChoice('altar_spd', '磨炼身法', '30金币，指定伙伴速度＋1，计入成长上限'),
        { id: 'ma-leave', label: '离开', desc: '无事发生', kind: 'none' },
      ] };
    case 'expedition_supply':
      return {
        title: '行脚补给站',
        desc: '你发现了一个补给箱。',
        choices: [
          growthChoice('supply_heal', '领取疗伤补给', '治疗圣水×1，存入背包'),
          growthChoice('supply_book', '领取训练补给', '成长之书（中）×1，存入背包'),
          { id: 'es-leave', label: '离开', desc: '无事发生', kind: 'none' },
        ],
      };
    case 'pet_recruit':
      return {
        title: '同行契约',
        desc: '一只野生生物似乎愿意加入你的队伍。',
        choices: [
          growthChoice('companions', '查看同行伙伴', '两位候选选1位，按层段携带4／8／12成长点；满队可领取'),
          { id: 'pr-refuse', label: '换取旅费', desc: '获得15金币', kind: 'gold', goldDelta: 15 },
          { id: 'pr-leave', label: '离开', desc: '无事发生', kind: 'none' },
        ],
      };
    case 'arena_challenge':
      return {
        title: '协同试炼',
        desc: '训练场守卫向你发起挑战。',
        choices: [
          growthChoice('trial', '接受试炼', '挑战协作敌队；胜利出战存活伙伴各＋3成长点及20金币；失败结束远征'),
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
        title: '回响墓园',
        desc: '你发现了一处古老的墓园，亡灵的低语回荡在空气中。或许可以尝试唤醒逝去的伙伴……',
        choices: [
          growthChoice('grave', '唤回伙伴', '指定死亡伙伴，保留完整养成，以50%生命复活'),
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
