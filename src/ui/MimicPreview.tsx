import { useEffect, useRef } from 'react';
import type { Unit } from '../game/types';
import { getSkill } from '../game/data/skills';
import { SkillTag } from './components';
import './mimic-preview.css';

export function MimicPreview({ units, onConfirm }: { units: Unit[]; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="mimic-preview" aria-labelledby="mimic-preview-title"
    onCancel={event => { event.preventDefault(); onConfirm(); }}>
    <header><h2 id="mimic-preview-title">🎲 万变 · 本场技能</h2><p>本场已锁定，不继承原生物的被动、强化或层数。</p></header>
    <div className="mimic-preview-body">{units.map(unit => <section key={unit.uid} className="mimic-preview-unit">
      <h3>{unit.isPlayer ? '我方' : '敌方'} · {unit.name}</h3>
      <div className="mimic-preview-skills">{unit.skills.map((id, slot) => <SkillTag key={slot} skill={getSkill(id)} desc usesNote />)}</div>
    </section>)}</div>
    <footer><small>同名技能共享冷却与次数；本次战斗读档不会重抽。</small><button type="button" autoFocus onClick={onConfirm}>开始战斗</button></footer>
  </dialog>;
}
