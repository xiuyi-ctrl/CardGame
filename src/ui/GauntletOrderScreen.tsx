import { useRef, useState } from 'react';
import type { Dispatch, DragEvent } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import type { Unit } from '../game/types';
import { FlowIcon, FlowPet, FlowPetStats } from './MainFlowArt';
import { UiSymbol } from './UiSymbol';
import { useBackAction } from './mobile';

const SLOT_LABELS = ['先发', '第二', '第三', '第四'];

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
  useBackAction(true, () => dispatch({ type: 'BACK_TO_MAP' }));
  function moveOrder(from: number, to: number) {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    setOrder(next);
  }
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
    <div className="flow-screen wheel-order-screen">
      <header className="flow-header flow-frame wheel-header">
        <h1><FlowIcon name="battles-won" />车轮战 · 出战顺序</h1>
        <span>第{state.act}幕 · 轮换上阵</span>
        <button type="button" onClick={() => dispatch({ type: 'BACK_TO_MAP' })}>
          返回地图 <UiSymbol name="arrow-right" />
        </button>
      </header>

      <main className="wheel-main">
        <section className="flow-frame wheel-order-panel">
          <div className="wheel-section-heading"><h2>出战顺序</h2><span>按顺序轮换上阵，拖动可交换</span></div>
          <div className="wheel-slots" style={{ gridTemplateColumns: `repeat(${maxSlots}, minmax(0, 1fr))` }}>
            {order.map((u, i) => (
              <div
                key={i}
                className={`wheel-slot ${i === 0 ? 'is-first' : ''} ${u ? '' : 'is-empty'}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onSlotDrop(e, i)}
              >
                <span className="wheel-order-index">{SLOT_LABELS[i]}</span>
                <div className="wheel-slot-body">
                  {u ? (
                    <button type="button"
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
                      <FlowPet unit={u} /><strong>{u.name}</strong><FlowPetStats unit={u} />
                    </button>
                  ) : (
                    <span className="wheel-empty-slot"><UiSymbol name="plus" />点击下方伙伴加入，或拖入此槽</span>
                  )}
                </div>
                {u && <div className="touch-only wheel-touch-order">
                  <button type="button" disabled={i === 0} aria-label={`${u.name}前移`} onClick={() => moveOrder(i, i - 1)}>前移</button>
                  <button type="button" disabled={i === order.length - 1} aria-label={`${u.name}后移`} onClick={() => moveOrder(i, i + 1)}>后移</button>
                </div>}
              </div>
            ))}
          </div>
        </section>

        <section className="flow-frame wheel-pool-panel">
          <div className="wheel-section-heading"><h2>待命伙伴</h2><span>{encounterLabel} · 点击加入空槽，点击上方伙伴移回</span>
          </div>
          <div className="wheel-pool" role="group" aria-label="待命伙伴" onDragOver={(e) => e.preventDefault()} onDrop={onPoolDrop}>
            {pool.map((u) => (
              <button type="button"
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
                <FlowPet unit={u} /><span><strong>{u.name}</strong><FlowPetStats unit={u} /></span>
              </button>
            ))}
            {pool.length === 0 && <span className="wheel-pool-empty">伙伴已全部上场，可拖到此处移回</span>}
          </div>
        </section>
      </main>

      <footer className="flow-frame remaining-footer">
        <span>已选择 {chosen.length}/{maxSlots}</span>
        <button type="button" className="flow-primary" disabled={chosen.length === 0} onClick={() => dispatch({ type: 'GAUNTLET_ORDER_CONFIRM', units: chosen })}>
          确认出战（{chosen.length}只）
        </button>
      </footer>
    </div>
  );
}
