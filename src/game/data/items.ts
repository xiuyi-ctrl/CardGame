export interface ItemDef {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  kind: 'purify' | 'skip';
}

export const ITEMS: Record<string, ItemDef> = {
  purify: {
    id: 'purify', name: '净化药水', emoji: '🧪',
    desc: '清除一只宠物身上的所有负面诅咒（含超进化的代价）',
    kind: 'purify',
  },
  skip: {
    id: 'skip', name: '跳关道具', emoji: '🪜',
    desc: '跳过一场战斗/精英战并直接获得其奖励（不能跳过首领）',
    kind: 'skip',
  },
};

export function getItem(id: string): ItemDef {
  const it = ITEMS[id];
  if (!it) throw new Error(`未知道具: ${id}`);
  return it;
}
