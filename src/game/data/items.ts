export interface ItemDef {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  kind: 'purify' | 'skip' | 'scout' | 'twin' | 'atk_up' | 'spd_up' | 'hp_up' | 'atk_down' | 'spd_down' | 'hp_down'
      | 'growthPoint' | 'slotUnlock' | 'resetGrowth' | 'healTeam';
  /** 商店售价（金币） */
  price: number;
  /** 是否可在战斗中使用 */
  usableInBattle?: boolean;
  /** 战斗用途描述 */
  battleDesc?: string;
  /** 战斗中是否需要指定目标 */
  needsTarget?: boolean;
  /** 是否在主模式商店出售（默认 true；远征专属物品设 false） */
  shop?: boolean;
  /** 远征模式专属物品：成长点数量（growthPoint 类型） */
  growthAmount?: number;
}

export const ITEMS: Record<string, ItemDef> = {
  purify: {
    id: 'purify', name: '净化药水', emoji: '🧪',
    desc: '清除一只宠物身上的所有负面诅咒（含超进化的代价）',
    kind: 'purify', price: 0,
  },
  skip: {
    id: 'skip', name: '跳关道具', emoji: '🪜',
    desc: '跳过一场战斗/精英战并直接获得其奖励（不能跳过首领）',
    kind: 'skip', price: 0,
  },
  scout: {
    id: 'scout', name: '侦察符', emoji: '🔍',
    desc: '使用后可查看指定一关的全部节点情报',
    kind: 'scout', price: 16,
  },
  twin: {
    id: 'twin', name: '双生符', emoji: '🔮',
    desc: '抵达「双生宝箱」任一节点时，可同时开启两个宝箱（消耗 1 个）',
    kind: 'twin', price: 16,
  },
  // === 战斗药水：提升己方单体 ===
  atk_up: {
    id: 'atk_up', name: '攻击药水', emoji: '⚔️',
    desc: '战斗中使用：指定一只我方宠物，伤害 +2（持续 2 回合）',
    kind: 'atk_up', price: 15,
    usableInBattle: true,
    battleDesc: '指定一只我方宠物，伤害 +2（2 回合）',
    needsTarget: true,
  },
  spd_up: {
    id: 'spd_up', name: '速度药水', emoji: '💨',
    desc: '战斗中使用：指定一只我方宠物，速度 +2（持续 2 回合）',
    kind: 'spd_up', price: 15,
    usableInBattle: true,
    battleDesc: '指定一只我方宠物，速度 +2（2 回合）',
    needsTarget: true,
  },
  hp_up: {
    id: 'hp_up', name: '生命药水', emoji: '💚',
    desc: '战斗中使用：指定一只我方宠物，回复 50% 生命',
    kind: 'hp_up', price: 12,
    usableInBattle: true,
    battleDesc: '指定一只我方宠物，回复 50% 生命',
    needsTarget: true,
  },
  // === 战斗药水：削弱敌方单体 ===
  atk_down: {
    id: 'atk_down', name: '虚弱药水', emoji: '🪄',
    desc: '战斗中使用：指定一只敌方，伤害 -2（持续 2 回合）',
    kind: 'atk_down', price: 15,
    usableInBattle: true,
    battleDesc: '指定一只敌方，伤害 -2（2 回合）',
    needsTarget: true,
  },
  spd_down: {
    id: 'spd_down', name: '缓速药水', emoji: '🕸️',
    desc: '战斗中使用：指定一只敌方，速度 -2（持续 2 回合）',
    kind: 'spd_down', price: 15,
    usableInBattle: true,
    battleDesc: '指定一只敌方，速度 -2（2 回合）',
    needsTarget: true,
  },
  hp_down: {
    id: 'hp_down', name: '腐蚀药水', emoji: '☠️',
    desc: '战斗中使用：指定一只敌方，当前生命 -30%',
    kind: 'hp_down', price: 15,
    usableInBattle: true,
    battleDesc: '指定一只敌方，当前生命 -30%',
    needsTarget: true,
  },
  // === 远征模式商店物品 ===
  book_small: {
    id: 'book_small', name: '成长之书（小）', emoji: '📖',
    desc: '选择1只宠物，获得1成长点',
    kind: 'growthPoint', price: 15, shop: false, growthAmount: 1,
  },
  book_large: {
    id: 'book_large', name: '成长之书（大）', emoji: '📚',
    desc: '选择1只宠物，获得2成长点',
    kind: 'growthPoint', price: 25, shop: false, growthAmount: 2,
  },
  slot_unlock: {
    id: 'slot_unlock', name: '技能槽解锁', emoji: '🔓',
    desc: '选择1只宠物，解锁一个技能槽',
    kind: 'slotUnlock', price: 50, shop: false,
  },
  forget_stone: {
    id: 'forget_stone', name: '遗忘之石', emoji: '🪨',
    desc: '选择1只宠物，重置其成长点',
    kind: 'resetGrowth', price: 30, shop: false,
  },
  heal_potion_g: {
    id: 'heal_potion_g', name: '治疗圣水', emoji: '🧪',
    desc: '全队回复50%生命',
    kind: 'healTeam', price: 30, shop: false,
  },
  reset_stone: {
    id: 'reset_stone', name: '还原石', emoji: '💎',
    desc: '选择1只宠物，重置其指定技能的强化等级（返还50%累计消耗）',
    kind: 'slotUnlock', price: 25, shop: false,
  },
  skill_enhance_stone: {
    id: 'skill_enhance_stone', name: '技能强化石', emoji: '⚒️',
    desc: '选择1只宠物，强化其1个技能（无需成长点）',
    kind: 'slotUnlock', price: 40, shop: false,
  },
};

export function getItem(id: string): ItemDef {
  const it = ITEMS[id];
  if (!it) throw new Error(`未知道具: ${id}`);
  return it;
}
