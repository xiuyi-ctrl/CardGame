export interface ItemDef {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  kind: 'purify' | 'skip' | 'scout' | 'twin' | 'atk_up' | 'spd_up' | 'hp_up' | 'atk_down' | 'spd_down' | 'hp_down';
  /** 商店售价（金币） */
  price: number;
  /** 是否可在战斗中使用 */
  usableInBattle?: boolean;
  /** 战斗用途描述 */
  battleDesc?: string;
  /** 战斗中是否需要指定目标 */
  needsTarget?: boolean;
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
    desc: '战斗中使用：指定一只我方宠物，伤害 +1（持续 3 回合）',
    kind: 'atk_up', price: 12,
    usableInBattle: true,
    battleDesc: '指定一只我方宠物，伤害 +1（3 回合）',
    needsTarget: true,
  },
  spd_up: {
    id: 'spd_up', name: '速度药水', emoji: '💨',
    desc: '战斗中使用：指定一只我方宠物，速度 +1（持续 3 回合）',
    kind: 'spd_up', price: 12,
    usableInBattle: true,
    battleDesc: '指定一只我方宠物，速度 +1（3 回合）',
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
    desc: '战斗中使用：指定一只敌方，伤害 -1（持续 3 回合）',
    kind: 'atk_down', price: 15,
    usableInBattle: true,
    battleDesc: '指定一只敌方，伤害 -1（3 回合）',
    needsTarget: true,
  },
  spd_down: {
    id: 'spd_down', name: '缓速药水', emoji: '🕸️',
    desc: '战斗中使用：指定一只敌方，速度 -1（持续 3 回合）',
    kind: 'spd_down', price: 12,
    usableInBattle: true,
    battleDesc: '指定一只敌方，速度 -1（3 回合）',
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
};

export function getItem(id: string): ItemDef {
  const it = ITEMS[id];
  if (!it) throw new Error(`未知道具: ${id}`);
  return it;
}
