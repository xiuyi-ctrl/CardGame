import { useState } from 'react';
import type { Dispatch } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { getMonster } from '../game/data/monsters';
import { UnitCard } from './components';
import type { Unit } from '../game/types';

type Row = 'front' | 'back';
type Position = { row: Row; column: 0 | 1 | 2 };
const ROWS: { row: Row; label: string }[] = [
  { row: 'front', label: '前 排' },
  { row: 'back', label: '后 排' },
];
const COLS = [0, 1, 2] as const;

export function FormationScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const f = state.formation;
  if (!f) return null;
  const fb = f;

  const [positions, setPositions] = useState<Record<string, Position>>(() => {
    const p: Record<string, Position> = {};
    for (const u of fb.units) p[u.uid] = { row: u.row, column: u.column };
    return p;
  });
  const [selected, setSelected] = useState<string | null>(null);

  const bySlot: Record<string, Unit | undefined> = {};
  for (const u of fb.units) {
    const pos = positions[u.uid];
    if (pos) bySlot[`${pos.row}-${pos.column}`] = u;
  }

  function onSlotClick(row: Row, col: 0 | 1 | 2) {
    const key = `${row}-${col}`;
    const existing = bySlot[key];
    if (existing) {
      if (selected && selected !== existing.uid) {
        const a = positions[selected];
        const b = positions[existing.uid];
        setPositions({ ...positions, [selected]: b, [existing.uid]: a });
        setSelected(null);
      } else {
        setSelected(existing.uid);
      }
    } else if (selected) {
      setPositions({ ...positions, [selected]: { row, column: col } });
      setSelected(null);
    }
  }

  function onListClick(uid: string) {
    setSelected(selected === uid ? null : uid);
  }

  function confirm() {
    const units = fb.units.map((u) => {
      const pos = positions[u.uid];
      return { ...u, row: pos.row, column: pos.column };
    });
    dispatch({ type: 'FORMATION_CONFIRM', units });
  }

  const enemyDesc = fb.encounter.map((e) => `${getMonster(e.speciesId).emoji} ${getMonster(e.speciesId).name}`).join('、');

  return (
    <div className="screen">
      <div className="hud">
        <span className="act">第 {state.act} 层 · 战前布阵</span>
        <span className="chip">👥 {f.units.length} 只出战</span>
        <button className="home-btn" onClick={() => dispatch({ type: 'NEXT_NODE' })}>
          ↩ 返回地图
        </button>
      </div>

      <div className="formation-main">
        <div className="formation-left">
          <div className="side-label">敌方情报：{enemyDesc}</div>
          <div className="side-label">点选宠物再点击 6 格中的位置即可换位（前/后排任意交换）</div>
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
                      onClick={() => onSlotClick(row, col)}
                    >
                      {u ? (
                        <UnitCard unit={u} small showSkills={false} topStats className={isSel ? 'valid-target targetable' : ''} />
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
          <div className="side-label">出战宠物（点击选中，再点棋盘换位）</div>
          <div className="formation-pets">
            {f.units.map((u) => {
              const isSel = selected === u.uid;
              return (
                <div key={u.uid} onClick={() => onListClick(u.uid)}>
                  <UnitCard unit={u} showSkills={false} topStats className={isSel ? 'valid-target targetable' : ''} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="formation-footer">
        <button className="primary big-btn" onClick={confirm}>
          ⚔️ 确认出战
        </button>
      </div>
    </div>
  );
}
