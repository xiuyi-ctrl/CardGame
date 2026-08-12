import { useRef, useState } from 'react';
import type { Dispatch, DragEvent } from 'react';
import type { GameState } from '../game/state/game';
import { FIELD_MAX, maxFieldForEnemy } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { getMonster } from '../game/data/monsters';
import { placeUnit } from '../game/state/formation';
import type { FormationPosition, FormationRow } from '../game/state/formation';
import { UnitCard } from './components';
import type { Unit } from '../game/types';

const ROWS: { row: FormationRow; label: string }[] = [
  { row: 'front', label: '前 排' },
  { row: 'back', label: '后 排' },
];
const COLS = [0, 1, 2] as const;

export function FormationScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const f = state.formation;
  if (!f) return null;
  const fb = f;

  /** 棋盘站位：uid -> 位置。初始放默认自动布阵的出战宠物 */
  const [positions, setPositions] = useState<Record<string, FormationPosition>>(() => {
    const p: Record<string, FormationPosition> = {};
    for (const u of fb.initialField) p[u.uid] = { row: u.row, column: u.column };
    return p;
  });
  const [selected, setSelected] = useState<string | null>(null);
  /** 拖拽标记：区分「点击」与「拖拽后松手」（拖拽结束不应触发 click） */
  const dragMoved = useRef(false);

  function markDrag() {
    dragMoved.current = true;
  }

  function clearDrag() {
    window.setTimeout(() => {
      dragMoved.current = false;
    }, 0);
  }

  const bySlot: Record<string, Unit | undefined> = {};
  for (const u of fb.units) {
    const pos = positions[u.uid];
    if (pos) bySlot[`${pos.row}-${pos.column}`] = u;
  }

  const fieldCount = Object.keys(positions).filter((k) => positions[k]).length;
  /** 敌方数量 → 我方出战上限（n+1，不超过 FIELD_MAX）；Boss 战固定 5 只 */
  const isBoss = !!state.map.boss[state.currentNodeId];
  const enemyCount = fb.encounter?.length ?? 1;
  const maxField = isBoss ? FIELD_MAX : maxFieldForEnemy(enemyCount);
  /** 宠物池 = 全部宠物中未上场的 */
  const pool = fb.units.filter((u) => !positions[u.uid]);

  function moveToSlot(uid: string, row: FormationRow, col: 0 | 1 | 2) {
    const key = `${row}-${col}`;
    const existing = bySlot[key];
    if (!existing && !positions[uid] && fieldCount >= maxField) return;
    setPositions(placeUnit(positions, uid, { row, column: col }));
    setSelected(null);
  }

  /** 拖到棋盘格子：目标有宠物则交换，空位则移动（出战已满时空位拒绝） */
  function onSlotDrop(e: DragEvent, row: FormationRow, col: 0 | 1 | 2) {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    const uid = raw.split('|')[0];
    if (!fb.units.some((u) => u.uid === uid)) return;
    moveToSlot(uid, row, col);
  }

  function onSlotClick(row: FormationRow, col: 0 | 1 | 2) {
    if (dragMoved.current) return;
    const key = `${row}-${col}`;
    const existing = bySlot[key];
    if (existing) {
      if (selected && selected !== existing.uid) {
        moveToSlot(selected, row, col);
      } else if (selected === existing.uid) {
        setSelected(null);
      } else {
        // 点击场上宠物 → 放回宠物池（下阵）
        const next = { ...positions };
        delete next[existing.uid];
        setPositions(next);
      }
    } else if (selected) {
      moveToSlot(selected, row, col);
    }
  }

  function onListClick(uid: string) {
    if (dragMoved.current) return;
    setSelected(selected === uid ? null : uid);
  }

  /** 拖回宠物池区域：从棋盘下阵 */
  function onPoolDrop(e: DragEvent) {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    const uid = raw.split('|')[0];
    if (!positions[uid]) return;
    const next = { ...positions };
    delete next[uid];
    setPositions(next);
  }

  function confirm() {
    const units = fb.units
      .filter((u) => positions[u.uid])
      .map((u) => {
        const pos = positions[u.uid];
        return { ...u, row: pos.row, column: pos.column };
      });
    dispatch({ type: 'FORMATION_CONFIRM', units });
  }

  const enemyDesc = fb.encounter.map((e) => `${getMonster(e.speciesId).emoji} ${getMonster(e.speciesId).name}`).join('、');
  const curNode = state.map.layers[state.currentRow]?.find((n) => n.id === state.currentNodeId);
  const title = curNode?.type === 'boss' ? '👑 首领战布阵' : curNode?.type === 'guardian' ? '🛡️ 守卫战布阵' : '战前布阵';

  return (
    <div className="screen">
      <div className="hud">
        <span className="act">第 {state.act} 层 · {title}</span>
        <span className="chip">👥 出战 {fieldCount}/{maxField} 只</span>
        <button className="home-btn" onClick={() => dispatch({ type: 'BACK_TO_MAP' })}>
          ↩ 返回地图
        </button>
      </div>

      <div className="formation-main">
        <div className="formation-left">
          <div className="side-label">敌方情报：{enemyDesc}（{enemyCount} 只）</div>
          <div className="side-label">把宠物拖到 6 格中上场（有宠物则交换、空位则移动）；点击场上宠物放回宠物池；敌方 {enemyCount} 只，我方最多 {maxField} 只</div>
          <div className="formation-board">
            {ROWS.map(({ row, label }) => (
              <div key={row} className={`formation-row ${row === 'front' ? 'row-front' : 'row-back'}`}>
                <span className="formation-row-label">{label}</span>
                {COLS.map((col) => {
                  const u = bySlot[`${row}-${col}`];
                  const isSel = u ? selected === u.uid : false;
                  return (
                    <div
                      key={`${row}-${col}`}
                      className={`formation-slot ${isSel ? 'selected' : ''} ${u ? '' : 'empty'}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => onSlotDrop(e, row, col)}
                      onClick={() => onSlotClick(row, col)}
                    >
                      {u ? (
                        <div
                          draggable
                          title="拖拽调整站位，点击放回宠物池"
                          onDragStart={(e) => {
                            dragMoved.current = false;
                            e.dataTransfer.setData('text/plain', u.uid);
                          }}
                          onDrag={markDrag}
                          onDragEnd={clearDrag}
                        >
                          <UnitCard unit={u} small showSkills={false} topStats />
                        </div>
                      ) : (
                        <span className="formation-empty-slot">空</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="formation-list">
          <div className="side-label">宠物池（拖到棋盘上场，或点击选中后点棋盘放置；已上场的不再显示）</div>
          <div className="formation-pets" onDragOver={(e) => e.preventDefault()} onDrop={onPoolDrop}>
            {pool.map((u) => {
              const isSel = selected === u.uid;
              return (
                <div
                  key={u.uid}
                  draggable
                  onClick={() => onListClick(u.uid)}
                  onDragStart={(e) => {
                    dragMoved.current = false;
                    e.dataTransfer.setData('text/plain', u.uid);
                  }}
                  onDrag={markDrag}
                  onDragEnd={clearDrag}
                >
                  <UnitCard unit={u} showSkills={false} topStats className={isSel ? 'valid-target targetable' : ''} />
                </div>
              );
            })}
            {pool.length === 0 && <span className="formation-empty-slot">宠物已全部上场</span>}
          </div>
        </div>
      </div>

      <div className="formation-footer">
        <button className="primary big-btn" disabled={fieldCount === 0} onClick={confirm}>
          ⚔️ 确认出战（{fieldCount} 只）
        </button>
      </div>
    </div>
  );
}
