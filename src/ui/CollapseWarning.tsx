import { useEffect, useRef } from 'react';
import './collapse-warning.css';

export function CollapseWarning({ round, onConfirm }: { round: number; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="collapse-warning" aria-labelledby="collapse-warning-title" onCancel={event => { event.preventDefault(); onConfirm(); }}>
    <h2 id="collapse-warning-title">{round === 13 ? '战场即将崩解' : '崩解临近'}</h2>
    <p>从第15回合结束起，双方所有场上生物将受到递增真实伤害。{round === 14 ? '下一回合结束首次触发。' : '请在接下来的两回合内尽快结束战斗。'}</p>
    <p>首次5点，此后每回合增加1点。无视护盾、减伤与伤害上限，直接扣生命。</p>
    <button type="button" autoFocus onClick={onConfirm}>继续战斗</button>
  </dialog>;
}
