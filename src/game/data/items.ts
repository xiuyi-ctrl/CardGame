export interface ItemDef {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  kind: 'purify' | 'skip' | 'scout' | 'haste';
  /** 商店售价（金币） */
  price: number;
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
    desc: '抵达「双生宝箱」任一节点时，可同时开启两个宝箱（消耗 1 个）',
    kind: 'scout', price: 8,
  },
  haste: {
    id: 'haste', name: '疾行符', emoji: '⚡',
    desc: '抵达「双生宝箱」任一节点时，可同时开启两个宝箱（消耗 1 个）',
    kind: 'haste', price: 8,
  },
};

export function getItem(id: string): ItemDef {
  const it = ITEMS[id];
  if (!it) throw new Error(`未知道具: ${id}`);
  return it;
}
