import { useRef, useState } from 'react';
import type { Dispatch, DragEvent } from 'react';
import type { GameState } from '../game/state/game';
import { FIELD_MAX, PROF_FIELD_MAX, getMaxRoster, maxFieldForEnemy } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { getMonster } from '../game/data/monsters';
import { getSkill } from '../game/data/skills';
import { getPassive } from '../game/data/passives';
import { placeUnit } from '../game/state/formation';
import type { FormationPosition, FormationRow } from '../game/state/formation';
import { BattlePixelSprite, PixelCreature, UnitCard } from './components';
import type { Unit } from '../game/types';

const ROWS: { row: FormationRow; label: string }[] = [
  { row: 'front', label: '前排' },
  { row: 'back', label: '后排' },
];
const COLS = [0, 1, 2] as const;

function StatIcon({ kind }: { kind: 'hp' | 'spd' }) {
  return kind === 'hp'
    ? <svg className="formation-stat-hp" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h4v1h2v1h1V3h2V2h3v1h1v6h-1v2h-2v2h-2v2H6v-2H4v-2H2V9H1V3h1z" fill="currentColor" stroke="#090712" strokeWidth="1.5" strokeLinejoin="miter" /></svg>
    : <svg className="formation-stat-spd" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1h4v2h-2v2H8v2h5v2h-2v2H9v2H7v2H5v-5H3V8h2V6h1V4h1V2h1z" fill="currentColor" stroke="#090712" strokeWidth="1.5" strokeLinejoin="miter" /></svg>;
}

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
  const focusedUnit = fb.units.find((u) => u.uid === (focusedUid ?? selected)) ?? visiblePool[0] ?? fb.units[0];
  const emptyRosterSlots = Math.max(0, getMaxRoster(state.runMode) - visiblePool.length);

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
  const location = state.runMode === 'proficiency'
    ? `第 ${state.currentLayer ?? 1} 层`
    : (['', '翠绿之径', '暗影沼泽', '余烬险地'][state.act] || `第 ${state.act} 幕`);
  const enemyKind = curNode?.type === 'boss' ? '首领来袭' : curNode?.type === 'guardian' ? '守卫战' : curNode?.type === 'elite' ? '精英小队' : '怪物小队';

  return (
    <div className="screen formation-screen">
      <div className="hud formation-hud">
        <div className="formation-hud-brand">
          <span className="formation-hud-swords" aria-hidden="true">⚔</span>
          <span><strong>{title}</strong><small>整顿伙伴，迎接新的冒险。</small></span>
        </div>
        <div className="formation-intel" aria-label={`敌方情报：${forceAll ? '同我方生物' : enemyDesc}`}>
          <span className="formation-intel-mark" aria-hidden="true">☠</span>
          <span className="formation-intel-copy"><strong>敌方情报</strong><small>{forceAll ? '模拟战 · 同我方生物' : `${location} · ${enemyKind}`}</small></span>
          <span className="formation-enemy-portraits">
            {fb.encounter.map((enemy, index) => {
              const monster = getMonster(enemy.speciesId);
              const image = enemy.speciesId === 'momo' ? '/battle-momo.png' : monster.image;
              return <span className="formation-enemy-portrait" key={`${enemy.speciesId}-${index}`} title={monster.name}>
                {image ? <BattlePixelSprite src={image} name={monster.name} /> : monster.emoji}
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
                      ) : null}
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
          <div className="formation-list-head">
            <div className="formation-list-title">{forceAll ? '队伍总览' : '待命伙伴'} <small>（最多 {getMaxRoster(state.runMode)} 只）</small></div>
            <span className="formation-list-hint">{forceAll ? '全员上场' : '选择伙伴加入队伍'} <span aria-hidden="true">✦</span></span>
          </div>
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
                    <span><StatIcon kind="hp" />{u.hp}/{u.maxHp}</span>
                    <span><StatIcon kind="spd" />{u.spd}</span>
                  </span>
                </div>
              );
            })}
            {Array.from({ length: emptyRosterSlots }, (_, index) => (
              <div className="formation-pet-empty" key={`empty-${index}`} aria-hidden="true">
                <span>✦</span><small>{forceAll ? '未招募' : '空位'}</small>
              </div>
            ))}
          </div>
          <div className="formation-detail">
            {focusedUnit ? (
              <>
                <span className="formation-detail-portrait"><PixelCreature unit={focusedUnit} /></span>
                <div className="formation-detail-main">
                  <div className="formation-detail-head"><strong>{focusedUnit.name}</strong><span>{positions[focusedUnit.uid] ? '出战' : '待命'}</span></div>
                  <div className="formation-detail-line">被动：{focusedUnit.passive ? getPassive(focusedUnit.passive)?.name ?? '无' : '无'}</div>
                  <div className="formation-detail-line">技能：{focusedUnit.skills.map((id) => getSkill(id).name).join(' · ')}</div>
                </div>
                <div className="formation-detail-stats">
                  <span><StatIcon kind="hp" />生命 <b>{focusedUnit.hp}/{focusedUnit.maxHp}</b></span>
                  <span><StatIcon kind="spd" />速度 <b>{focusedUnit.spd}</b></span>
                </div>
                <p className="formation-detail-description">{getMonster(focusedUnit.speciesId).desc}</p>
              </>
            ) : <span className="formation-detail-empty">悬停或聚焦生物查看详情</span>}
          </div>
          <div className="formation-footer">
            <span className="formation-footer-note">准备好了吗？<br />林间的冒险正等着你。</span>
            <button className="primary big-btn" disabled={fieldCount === 0} onClick={confirm} aria-label={`确认出战，当前 ${fieldCount} 只`}>
              <span aria-hidden="true">⚔</span> 确认出战
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
