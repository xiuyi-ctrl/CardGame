import { useRef, useState } from 'react';
import { UiSymbol } from './UiSymbol';
import type { Dispatch, DragEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { GameState } from '../game/state/game';
import { FIELD_MAX, PROF_FIELD_MAX, getMaxRoster, maxFieldForEnemy } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { getMonster } from '../game/data/monsters';
import { getSkill } from '../game/data/skills';
import { getPassive } from '../game/data/passives';
import { firstEmptyFormationSlot, placeUnit } from '../game/state/formation';
import type { FormationPosition, FormationRow } from '../game/state/formation';
import { BattlePixelSprite, PixelCreature, UnitCard } from './components';
import { FORMATION_SPRITES } from './formationSprites';
import { useBackAction } from './mobile';
import type { Unit } from '../game/types';

const ROWS: { row: FormationRow; label: string }[] = [
  { row: 'front', label: '我方前排' },
  { row: 'back', label: '我方后排' },
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
  const [focusedUid, setFocusedUid] = useState<string | null>(null);
  const [placingUid, setPlacingUid] = useState<string | null>(null);
  const [touchDraggingUid, setTouchDraggingUid] = useState<string | null>(null);
  useBackAction(true, () => {
    if (placingUid) setPlacingUid(null);
    else dispatch({ type: 'BACK_TO_MAP' });
  });
  /** 拖拽标记：区分「点击」与「拖拽后松手」（拖拽结束不应触发 click） */
  const dragMoved = useRef(false);
  const touchDrag = useRef<{ uid: string; pointerId: number; x: number; y: number; moved: boolean } | null>(null);

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
  const focusedUnit = fb.units.find((u) => u.uid === focusedUid) ?? fb.units.find((u) => !positions[u.uid]) ?? fb.units[0];
  const emptyRosterSlots = Math.max(0, getMaxRoster(state.runMode) - fb.units.length);

  function moveToSlot(uid: string, row: FormationRow, col: 0 | 1 | 2) {
    const key = `${row}-${col}`;
    const existing = bySlot[key];
    if (!existing && !positions[uid] && fieldCount >= maxField) return;
    setPositions(placeUnit(positions, uid, { row, column: col }));
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

  /** 点击场上宠物：下阵放回宠物池（模拟战强制全上时禁止） */
  function onSlotClick(row: FormationRow, col: 0 | 1 | 2) {
    if (dragMoved.current) return;
    if (placingUid) {
      moveToSlot(placingUid, row, col);
      setPlacingUid(null);
      return;
    }
    const existing = bySlot[`${row}-${col}`];
    if (!existing || forceAll) return;
    const next = { ...positions };
    delete next[existing.uid];
    setPositions(next);
  }

  /** 点击伙伴卡片切换上场/下场；上场时按空位顺序自动布阵。 */
  function onListClick(uid: string) {
    if (dragMoved.current || forceAll) return;
    if (placingUid) { setPlacingUid(uid); setFocusedUid(uid); return; }
    if (positions[uid]) {
      const next = { ...positions };
      delete next[uid];
      setPositions(next);
      setFocusedUid(uid);
      return;
    }
    if (fieldCount >= maxField) return;
    const slot = firstEmptyFormationSlot(positions);
    if (!slot) return;
    setPositions(placeUnit(positions, uid, slot));
    setFocusedUid(uid);
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

  function onTouchDragStart(e: ReactPointerEvent<HTMLElement>, uid: string) {
    if (e.pointerType === 'mouse') return;
    touchDrag.current = { uid, pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onNativeDragStart(e: DragEvent<HTMLElement>, uid: string) {
    if (touchDrag.current || document.documentElement.classList.contains('mobile-ui')) {
      e.preventDefault();
      return;
    }
    dragMoved.current = false;
    e.dataTransfer.setData('text/plain', uid);
  }

  function onTouchDragMove(e: ReactPointerEvent<HTMLElement>) {
    const drag = touchDrag.current;
    if (!drag || drag.pointerId !== e.pointerId || drag.moved) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 9) return;
    drag.moved = true;
    dragMoved.current = true;
    setTouchDraggingUid(drag.uid);
  }

  function onTouchDragEnd(e: ReactPointerEvent<HTMLElement>) {
    const drag = touchDrag.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    touchDrag.current = null;
    if (!drag.moved) return;

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const slot = target?.closest<HTMLElement>('.formation-slot');
    if (slot?.dataset.formationRow && slot.dataset.formationColumn) {
      moveToSlot(drag.uid, slot.dataset.formationRow as FormationRow, Number(slot.dataset.formationColumn) as 0 | 1 | 2);
    } else if (!forceAll && target?.closest('.formation-pets') && positions[drag.uid]) {
      const next = { ...positions };
      delete next[drag.uid];
      setPositions(next);
    }
    setTouchDraggingUid(null);
    clearDrag();
  }

  function onTouchDragCancel(e: ReactPointerEvent<HTMLElement>) {
    if (touchDrag.current?.pointerId !== e.pointerId) return;
    touchDrag.current = null;
    setTouchDraggingUid(null);
    clearDrag();
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
  const location = state.runMode === 'proficiency'
    ? `第 ${state.currentLayer ?? 1} 层`
    : (['', '翠绿之径', '暗影沼泽', '余烬险地'][state.act] || `第 ${state.act} 幕`);
  const enemyKind = curNode?.type === 'boss' ? '首领来袭' : curNode?.type === 'guardian' ? '守卫战' : curNode?.type === 'elite' ? '精英小队' : '怪物小队';

  return (
    <div className="screen formation-screen">
      <div className="hud formation-hud">
        <div className="formation-hud-brand">
          <img className="formation-hud-icon" src="/formation-art/formation-title-pines-v1.png" alt="" aria-hidden="true" />
          <span><strong>{title}</strong><small>整顿伙伴，迎接新的冒险。</small></span>
        </div>
        <div className="formation-intel" aria-label={`敌方情报：${forceAll ? '同我方生物' : enemyDesc}`}>
          <span className="formation-intel-copy"><strong>敌方情报</strong><small>{forceAll ? '模拟战 · 同我方生物' : `${location} · ${enemyKind}`}</small></span>
          <span className="formation-enemy-portraits">
            {fb.encounter.map((enemy, index) => {
              const monster = getMonster(enemy.speciesId);
              const image = enemy.speciesId === 'momo' ? '/battle-momo.png' : monster.image;
              return <span className="formation-enemy-portrait" key={`${enemy.speciesId}-${index}`} title={monster.name}>
                {FORMATION_SPRITES[enemy.speciesId]
                  ? <img src={FORMATION_SPRITES[enemy.speciesId]} alt={monster.name} />
                  : image ? <BattlePixelSprite src={image} name={monster.name} /> : monster.emoji}
              </span>;
            })}
          </span>
        </div>
        <div className="formation-deploy-count" aria-label={`出战 ${fieldCount}/${maxField}`}>
          <span>出战</span><strong>{fieldCount}<em>/{maxField}</em></strong>
        </div>
        <button className="home-btn formation-back-btn" aria-label="返回地图" onClick={() => dispatch({ type: 'BACK_TO_MAP' })}>
          <span aria-hidden="true">⬅</span> 返回
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
                  const isSel = u ? focusedUid === u.uid : false;
                  return (
                    <div
                      key={`${row}-${col}`}
                      className={`formation-slot ${isSel ? 'selected' : ''} ${u ? '' : 'empty'}`}
                      data-formation-row={row}
                      data-formation-column={col}
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
                          onDragStart={(e) => onNativeDragStart(e, u.uid)}
                          onDrag={markDrag}
                          onDragEnd={clearDrag}
                          onPointerDown={(e) => onTouchDragStart(e, u.uid)}
                          onPointerMove={onTouchDragMove}
                          onPointerUp={onTouchDragEnd}
                          onPointerCancel={onTouchDragCancel}
                          className={touchDraggingUid === u.uid ? 'formation-touch-dragging' : undefined}
                        >
                          <UnitCard unit={u} battleDisplay imageOverride={FORMATION_SPRITES[u.speciesId]} />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="formation-list">
          <div className="formation-list-head">
            <div className="formation-list-title">{forceAll ? '队伍总览' : '队伍伙伴'} <small>（最多 {getMaxRoster(state.runMode)} 只）</small></div>
            <span className="formation-list-hint">{forceAll ? '全员上场' : '点击切换上场'} <UiSymbol name="sparkle" /></span>
          </div>
          <div className="touch-only formation-touch-actions">
            <button type="button" disabled={!focusedUnit} onClick={() => setPlacingUid(placingUid ? null : focusedUnit?.uid ?? null)}>{placingUid ? '取消放置' : '调整站位'}</button>
            {placingUid ? <span role="status">点击目标位置放置或交换</span> : <span>拖动伙伴头像调整站位</span>}
          </div>
          <div className="formation-pets" onDragOver={(e) => e.preventDefault()} onDrop={onPoolDrop}>
            {fb.units.map((u) => {
              return (
                <div
                  key={u.uid}
                  className={`formation-pet-tile ${forceAll ? 'read-only' : ''} ${positions[u.uid] ? 'deployed' : ''}`}
                  draggable={!forceAll}
                  role={forceAll ? 'listitem' : 'button'}
                  tabIndex={0}
                  aria-label={`${u.name}，速度 ${u.spd}，生命 ${u.hp}/${u.maxHp}，${positions[u.uid] ? '已上场，点击下场' : fieldCount >= maxField ? '待命，出战名额已满' : '待命，点击上场'}`}
                  aria-pressed={forceAll ? undefined : !!positions[u.uid]}
                  title={forceAll ? '模拟战：全员上场' : positions[u.uid] ? '点击下场' : fieldCount >= maxField ? '出战名额已满，请先下场一只伙伴' : '点击上场'}
                  onClick={() => { if (!forceAll) onListClick(u.uid); }}
                  onKeyDown={(e) => { if (!forceAll && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onListClick(u.uid); } }}
                  onMouseEnter={() => setFocusedUid(u.uid)}
                  onMouseLeave={() => setFocusedUid(null)}
                  onFocus={() => setFocusedUid(u.uid)}
                  onBlur={() => setFocusedUid(null)}
                  onDragStart={(e) => onNativeDragStart(e, u.uid)}
                  onDrag={markDrag}
                  onDragEnd={clearDrag}
                >
                  <span
                    className={`formation-pet-portrait ${touchDraggingUid === u.uid ? 'formation-touch-dragging' : ''}`}
                    onPointerDown={(e) => onTouchDragStart(e, u.uid)}
                    onPointerMove={onTouchDragMove}
                    onPointerUp={onTouchDragEnd}
                    onPointerCancel={onTouchDragCancel}
                  >
                    {FORMATION_SPRITES[u.speciesId] ? <img src={FORMATION_SPRITES[u.speciesId]} alt={u.name} draggable={false} /> : <PixelCreature unit={u} />}
                  </span>
                  {positions[u.uid] && !forceAll && <span className="formation-pet-status">已上场</span>}
                </div>
              );
            })}
            {Array.from({ length: emptyRosterSlots }, (_, index) => (
              <div className="formation-pet-empty" key={`empty-${index}`} aria-hidden="true">
                <UiSymbol name="sparkle" /><small>{forceAll ? '未招募' : '空位'}</small>
              </div>
            ))}
          </div>
          <div className="formation-detail">
            {focusedUnit ? (
              <>
                <div className="formation-detail-summary">
                  <span className="formation-detail-portrait">
                    {FORMATION_SPRITES[focusedUnit.speciesId] ? <img src={FORMATION_SPRITES[focusedUnit.speciesId]} alt={focusedUnit.name} /> : <PixelCreature unit={focusedUnit} />}
                  </span>
                  <div className="formation-detail-main">
                    <div className="formation-detail-head"><strong>{focusedUnit.name}</strong><span>{positions[focusedUnit.uid] ? '出战' : '待命'}</span></div>
                    <div className="formation-detail-stats">
                      <span><i className="formation-detail-stat-icon hp" aria-hidden="true" />生命 <b>{focusedUnit.hp}/{focusedUnit.maxHp}</b></span>
                      <span><i className="formation-detail-stat-icon spd" aria-hidden="true" />速度 <b>{focusedUnit.spd}</b></span>
                    </div>
                  </div>
                </div>
                <div className="formation-detail-ability formation-detail-passive">
                  <div><span className="formation-ability-tag passive">被动</span><strong>{focusedUnit.passive ? getPassive(focusedUnit.passive)?.name ?? '无' : '无'}</strong></div>
                  <p title={focusedUnit.passive ? getPassive(focusedUnit.passive)?.desc ?? '无被动效果' : '无被动效果'}>{focusedUnit.passive ? getPassive(focusedUnit.passive)?.desc ?? '无被动效果' : '无被动效果'}</p>
                </div>
                <div className="formation-detail-ability formation-detail-skills">
                  <span className="formation-ability-tag skill">技能</span>
                  <div className="formation-skill-tags">
                    {focusedUnit.skills.map((id) => <span className="formation-skill-tag" key={id}>{getSkill(id).name}</span>)}
                  </div>
                </div>
              </>
            ) : <span className="formation-detail-empty">悬停或聚焦生物查看详情</span>}
          </div>
          <div className="formation-footer">
            <button className="primary big-btn" disabled={fieldCount === 0} onClick={confirm} aria-label={`确认出战，当前 ${fieldCount} 只`}>
              确认出战
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
