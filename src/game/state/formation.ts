/** 布阵棋盘的站位纯逻辑（与 UI 解耦，可单测）。 */
import type { Unit } from '../types';

export type FormationRow = 'front' | 'back';
export type FormationPosition = { row: FormationRow; column: 0 | 1 | 2 };

/** 自动上阵顺序：从左到右、从上到下（前排 → 后排） */
export const SLOT_ORDER: FormationPosition[] = [
  ...([0, 1, 2] as const).map((column) => ({ row: 'front' as const, column })),
  ...([0, 1, 2] as const).map((column) => ({ row: 'back' as const, column })),
];

/** 仅恢复仍在队伍且存活的生物，保留空位，不自动补入其他伙伴。 */
export function restoreFormation(
  units: Unit[], positions: Record<string, FormationPosition>, maxCount: number,
): Unit[] {
  const restored: Unit[] = [];
  const occupied = new Set<string>();
  for (const [uid, position] of Object.entries(positions)) {
    const unit = units.find(u => u.uid === uid && u.hp > 0);
    if (!unit || !position || !SLOT_ORDER.some(slot => slot.row === position.row && slot.column === position.column)) continue;
    const slot = `${position.row}-${position.column}`;
    if (occupied.has(slot) || restored.length >= maxCount) continue;
    occupied.add(slot);
    restored.push({ ...unit, row: position.row, column: position.column });
  }
  return restored;
}

/** 按自动上阵顺序找第一个空位；六个站位全满时返回 null */
export function firstEmptyFormationSlot(
  positions: Record<string, FormationPosition>,
): FormationPosition | null {
  const occupied = new Set(Object.values(positions).map((p) => `${p.row}-${p.column}`));
  return SLOT_ORDER.find((s) => !occupied.has(`${s.row}-${s.column}`)) ?? null;
}

/**
 * 把 uid 单位放置到目标格子：
 * - 目标为空位：直接放置（上场或挪位，由调用方决定是否受 FIELD_MAX 限制）
 * - 目标有单位且 uid 已在场上：两者交换
 * - 目标有单位且 uid 来自宠物池：uid 上场占位、被换下的单位回宠物池（删除其 key）
 */
export function placeUnit(
  positions: Record<string, FormationPosition>,
  uid: string,
  target: FormationPosition,
): Record<string, FormationPosition> {
  const existing = Object.entries(positions).find(
    ([, pos]) => pos.row === target.row && pos.column === target.column,
  )?.[0];
  const next = { ...positions };
  if (!existing) {
    next[uid] = { row: target.row, column: target.column };
  } else if (existing !== uid) {
    const targetPos = positions[existing];
    if (positions[uid]) {
      // 两者都在场上：交换
      next[uid] = targetPos;
      next[existing] = positions[uid];
    } else {
      // uid 从宠物池上场，existing 回池
      next[uid] = targetPos;
      delete next[existing];
    }
  }
  return next;
}
