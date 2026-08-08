import { useRef, useState } from 'react';
import type { Dispatch, DragEvent } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import type { Unit } from '../game/types';
import { UnitCard } from './components';

const SLOT_LABELS = ['⭐ 先发', '第二', '第三', '第四'];

export function GauntletOrderScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const roster = state.roster;
  const maxSlots = Math.min(state.gauntletSize ?? 4, SLOT_LABELS.length);
  const [order, setOrder] = useState<(Unit | null)[]>(() => {
    const init = state.gauntletOrder ?? [];
    const slots: (Unit | null)[] = Array(maxSlots).fill(null);
    init.slice(0, maxSlots).forEach((u, i) => {
      slots[i] = u;
    });
    return slots;
  });

  const inSlots = (uid: string) => order.some((u) => u && u.uid === uid);
  const pool = roster.filter((u) => !inSlots(u.uid));
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

  function slotIndex(uid: string): number {
    return order.findIndex((u) => u && u.uid === uid);
  }

  function onDragStart(e: DragEvent, u: Unit) {
    e.dataTransfer.setData('text/plain', `${u.uid}|${slotIndex(u.uid)}`);
    e.dataTransfer.effectAllowed = 'move';
  }

  /** 拖到顺序槽：来自宠物池则放入（旧宠物回池），来自其他槽则交换 */
  function onSlotDrop(e: DragEvent, i: number) {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    const [uid, fromI] = raw.split('|');
    const fromIdx = parseInt(fromI, 10);
    const dragged = fromIdx >= 0 ? order[fromIdx] : roster.find((u) => u.uid === uid) ?? null;
    if (!dragged || fromIdx === i) return;
    const next = [...order];
    const prev = next[i];
    next[i] = dragged;
    if (fromIdx >= 0) next[fromIdx] = prev;
    setOrder(next);
  }

  /** 拖回宠物池：从顺序槽移除 */
  function onPoolDrop(e: DragEvent) {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    const [, fromI] = raw.split('|');
    const fromIdx = parseInt(fromI, 10);
    if (fromIdx < 0) return;
    const next = [...order];
    next[fromIdx] = null;
    setOrder(next);
  }

  /** 点击宠物池宠物 → 填入第一个空槽 */
  function onClickAdd(u: Unit) {
    if (dragMoved.current) return;
    const empty = order.findIndex((x) => x === null);
    if (empty < 0) return;
    const next = [...order];
    next[empty] = u;
    setOrder(next);
  }

  /** 点击顺序槽中的宠物 → 放回宠物池 */
  function onClickRemove(i: number) {
    if (dragMoved.current) return;
    const next = [...order];
    next[i] = null;
    setOrder(next);
  }

  const chosen = order.filter((u): u is Unit => !!u);
  const encounterLabel = `共 ${roster.length} 只宠物可选`;

  return (
    <div className="screen">
      <div className="hud">
        <span className="act">第 {state.act} 层 · 车轮战出战顺序</span>
        <span className="chip">🔥 轮换上阵</span>
        <button className="home-btn" onClick={() => dispatch({ type: 'NEXT_NODE' })}>
          ↩ 返回地图
        </button>
      </div>

      <div className="formation-main">
        <div className="formation-left">
          <div className="side-label">出战顺序（把宠物拖到「先发 / 第二 / 第三 / 第四」槽位，按序轮换上阵；拖动顺序卡可交换）</div>
          <div className="gauntlet-slots">
            {order.map((u, i) => (
              <div
                key={i}
                className={`gauntlet-slot ${u ? '' : 'empty'}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onSlotDrop(e, i)}
              >
                <span className="gauntlet-order-index">{SLOT_LABELS[i]}</span>
                <div className="gauntlet-slot-body">
                  {u ? (
                    <div
                      draggable
                      title="点击放回宠物池"
                      onClick={() => onClickRemove(i)}
                      onDragStart={(e) => {
                        dragMoved.current = false;
                        onDragStart(e, u);
                      }}
                      onDrag={markDrag}
                      onDragEnd={clearDrag}
                    >
                      <UnitCard unit={u} showSkills={false} topStats />
                    </div>
                  ) : (
                    <span className="gauntlet-empty-slot">拖入宠物</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="formation-list">
          <div className="side-label">
            宠物池（{encounterLabel}，点击加入第一个空槽，或按住拖到左侧槽位）
          </div>
          <div className="formation-pets" onDragOver={(e) => e.preventDefault()} onDrop={onPoolDrop}>
            {pool.map((u) => (
              <div
                key={u.uid}
                draggable
                onClick={() => onClickAdd(u)}
                onDragStart={(e) => {
                  dragMoved.current = false;
                  onDragStart(e, u);
                }}
                onDrag={markDrag}
                onDragEnd={clearDrag}
              >
                <UnitCard unit={u} showSkills={false} topStats />
              </div>
            ))}
            {pool.length === 0 && <span className="gauntlet-empty-slot">宠物已全部上场</span>}
          </div>
        </div>
      </div>

      <div className="formation-footer">
        <button className="primary big-btn" disabled={chosen.length === 0} onClick={() => dispatch({ type: 'GAUNTLET_ORDER_CONFIRM', units: chosen })}>
          ⚔️ 确认出战（{chosen.length} 只）
        </button>
      </div>
    </div>
  );
}
