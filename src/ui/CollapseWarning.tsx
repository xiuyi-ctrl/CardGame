import { useEffect, useRef } from 'react';
import './collapse-warning.css';

export function CollapseWarning({ round, onConfirm }: { round: number; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal?.();
    return () => element.close?.();
  }, []);
  return <dialog ref={dialog} className="collapse-warning" aria-labelledby="collapse-warning-title" onCancel={event => { event.preventDefault(); onConfirm(); }}>
    <h2 id="collapse-warning-title">{round === 1 ? '战场崩解规则' : '战场开始崩解'}</h2>
    <p>从第15回合结束起，双方所有场上生物将受到递增真实伤害。{round === 15 ? '本回合结束首次触发。' : '请合理规划战斗回合。'}</p>
    <p>首次5点，此后每回合增加1点。无视护盾、减伤与伤害上限，直接扣生命。</p>
    <button type="button" autoFocus onClick={onConfirm}>继续战斗</button>
  </dialog>;
}
