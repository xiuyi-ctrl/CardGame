/** 布阵棋盘的站位纯逻辑（与 UI 解耦，可单测）。 */

export type FormationRow = 'front' | 'back';
export type FormationPosition = { row: FormationRow; column: 0 | 1 | 2 };

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
