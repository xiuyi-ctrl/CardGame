import { useRef, useState } from 'react';
import type { Dispatch, DragEvent } from 'react';
import type { GameState } from '../game/state/game';
import { FIELD_MAX, PROF_FIELD_MAX, maxFieldForEnemy } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { getMonster } from '../game/data/monsters';
import { getSkill } from '../game/data/skills';
import { getPassive } from '../game/data/passives';
import { placeUnit } from '../game/state/formation';
import type { FormationPosition, FormationRow } from '../game/state/formation';
import { PixelCreature, UnitCard } from './components';
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
  const [focusedUid, setFocusedUid] = useState<string | null>(null);
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
  const forceAll = !!fb.forceAllUnits;
  /** 敌方数量 → 我方出战上限（n+1，不超过 FIELD_MAX）；Boss 战固定出战上限；强制全上时无上限 */
  const isBoss = !!state.map.boss[state.currentNodeId];
  const enemyCount = fb.encounter?.length ?? 1;
  const maxField = forceAll ? fb.units.length : (isBoss ? (state.runMode === 'proficiency' ? PROF_FIELD_MAX : FIELD_MAX) : maxFieldForEnemy(enemyCount, state.runMode));
  /** 宠物池 = 全部宠物中未上场的（强制全上时池为空） */
  const pool = forceAll ? [] : fb.units.filter((u) => !positions[u.uid]);
  const visiblePool = forceAll ? fb.units : pool;
  const focusedUnit = fb.units.find((u) => u.uid === (focusedUid ?? selected));

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
      } else if (!forceAll) {
        // 点击场上宠物 → 放回宠物池（下阵）；强制全上时不可下阵
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

  /** 拖回宠物池区域：从棋盘下阵（强制全上时禁止） */
  function onPoolDrop(e: DragEvent) {
    e.preventDefault();
    if (forceAll) return;
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

  const enemyDesc = fb.encounter.map((e) => getMonster(e.speciesId).name).join('、');
  const curNode = state.map.layers[state.currentRow]?.find((n) => n.id === state.currentNodeId);
  const title = curNode?.type === 'boss' ? '首领战布阵' : curNode?.type === 'guardian' ? '守卫战布阵' : '战前布阵';

  return (
    <div className="screen formation-screen">
      <div className="hud formation-hud">
        <span className="act">第 {state.act} 层 · {title}</span>
        <span className="formation-intel" title={forceAll ? '同我方生物' : enemyDesc}>
          <span>敌方情报</span>
          <strong>{forceAll ? '同我方生物' : `${enemyDesc} · ${enemyCount} 只`}</strong>
        </span>
        <span className="chip">👥 出战 {fieldCount}/{maxField} 只</span>
        <button className="home-btn" onClick={() => dispatch({ type: 'BACK_TO_MAP' })}>
          ↩ 返回地图
        </button>
      </div>

      <div className="formation-main">
        <div className="formation-left">
          <div className="formation-board">
            {ROWS.map(({ row, label }) => (
              <div key={row} className={`formation-row ${row === 'front' ? 'row-front' : 'row-back'}`}>
                <span className="formation-row-label">{label}</span>
                {COLS.map((col) => {
                  const u = bySlot[`${row}-${col}`];
                  const isSel = u ? selected === u.uid || focusedUid === u.uid : false;
                  const canPlace = !!selected && (!!u || !!positions[selected] || fieldCount < maxField);
                  return (
                    <div
                      key={`${row}-${col}`}
                      className={`formation-slot ${isSel ? 'selected' : ''} ${canPlace ? 'can-place' : ''} ${u ? '' : 'empty'}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${label.replace(/\s/g, '')}第 ${col + 1} 位：${u ? u.name : '空位'}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => onSlotDrop(e, row, col)}
                      onClick={() => onSlotClick(row, col)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSlotClick(row, col); } }}
                      onMouseEnter={() => setFocusedUid(u?.uid ?? null)}
                      onMouseLeave={() => setFocusedUid(null)}
                      onFocus={() => setFocusedUid(u?.uid ?? null)}
                      onBlur={() => setFocusedUid(null)}
                    >
                      {u ? (
                        <div
                          draggable
                          title={forceAll ? '拖拽调整站位' : '拖拽调整站位，点击放回宠物池'}
                          onDragStart={(e) => {
                            dragMoved.current = false;
                            e.dataTransfer.setData('text/plain', u.uid);
                          }}
                          onDrag={markDrag}
                          onDragEnd={clearDrag}
                        >
                          <UnitCard unit={u} battleDisplay />
                        </div>
                      ) : (
                        <span className="formation-empty-slot" aria-hidden="true">+</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="formation-tip">
            {forceAll ? '模拟战：全员上场，拖动生物交换站位' : fieldCount >= maxField ? '出战名额已满，可拖到已上场位置交换' : '拖动或点选候选生物布阵；点击场上生物可下阵'}
          </div>
        </div>

        <div className="formation-list">
          <div className="formation-list-title">{forceAll ? '队伍总览 · 全员上场' : `候选队伍 · ${pool.length} 只待命`}</div>
          <div className="formation-pets" onDragOver={(e) => e.preventDefault()} onDrop={onPoolDrop}>
            {visiblePool.map((u) => {
              const isSel = selected === u.uid;
              return (
                <div
                  key={u.uid}
                  className={`formation-pet-tile ${isSel ? 'selected' : ''} ${forceAll ? 'read-only' : ''}`}
                  draggable={!forceAll}
                  role={forceAll ? 'listitem' : 'button'}
                  tabIndex={0}
                  aria-label={`${u.name}，速度 ${u.spd}，生命 ${u.hp}/${u.maxHp}`}
                  onClick={() => { if (!forceAll) onListClick(u.uid); }}
                  onKeyDown={(e) => { if (!forceAll && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onListClick(u.uid); } }}
                  onMouseEnter={() => setFocusedUid(u.uid)}
                  onMouseLeave={() => setFocusedUid(null)}
                  onFocus={() => setFocusedUid(u.uid)}
                  onBlur={() => setFocusedUid(null)}
                  onDragStart={(e) => {
                    dragMoved.current = false;
                    e.dataTransfer.setData('text/plain', u.uid);
                  }}
                  onDrag={markDrag}
                  onDragEnd={clearDrag}
                >
                  <span className="formation-pet-portrait"><PixelCreature unit={u} /></span>
                  <span className="formation-pet-info">
                    <strong>{u.name}</strong>
                    <span><i>⚡</i>{u.spd} <i>♥</i>{u.hp}/{u.maxHp}</span>
                  </span>
                </div>
              );
            })}
            {visiblePool.length === 0 && <span className="formation-pool-empty">宠物已全部上场</span>}
          </div>
          <div className="formation-detail">
            {focusedUnit ? (
              <>
                <div className="formation-detail-head"><strong>{focusedUnit.name}</strong><span>⚡ {focusedUnit.spd}　♥ {focusedUnit.hp}/{focusedUnit.maxHp}</span></div>
                <div className="formation-detail-line">被动：{focusedUnit.passive ? getPassive(focusedUnit.passive)?.name ?? '无' : '无'}</div>
                <div className="formation-detail-line">技能：{focusedUnit.skills.map((id) => getSkill(id).name).join(' · ')}</div>
              </>
            ) : <span className="formation-detail-empty">悬停或聚焦生物查看详情</span>}
          </div>
          <div className="formation-footer">
            <button className="primary big-btn" disabled={fieldCount === 0} onClick={confirm}>
              ⚔️ 确认出战（{fieldCount} 只）
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
