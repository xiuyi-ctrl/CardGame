import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBackAction, useMobileLayout } from './mobile';
import type { SkillDef, Unit } from '../game/types';
import { getPassive } from '../game/data/passives';
import { getSkill } from '../game/data/skills';
import { getSkillEnhanceLevel } from '../game/core/growth';
import { skillBrief, skillFullDesc } from './components';

export function MobileSkillDescription({ skill, enhanced = 0 }: { skill: SkillDef; enhanced?: number }) {
  const target = { single: '敌方单体', all: '敌方全体', random: '随机敌人', ally: '友方单体', allyAll: '友方全体', self: '自身' }[skill.target];
  return <section><h3>{skill.name} {skillBrief(skill, enhanced)}</h3><p>{target}{skill.priority === 'first' ? ' · 先手' : ''}</p><p>{skillFullDesc(skill, enhanced)}</p><p>{skill.uses !== undefined ? `每场限${skill.uses}次` : ''}{skill.cooldown ? ` 冷却${skill.cooldown}回合` : ''}</p></section>;
}

export function MobileUnitAbilities({ unit }: { unit: Unit }) {
  const passive = getPassive(unit.passive);
  return <>{passive && <section><h3>被动 · {passive.name}</h3><p>{passive.desc}</p></section>}{unit.skills.map((id, index) => {
    const skill = getSkill(id);
    return <MobileSkillDescription key={`${id}-${index}`} skill={skill} enhanced={getSkillEnhanceLevel(unit, index)} />;
  })}</>;
}

/** 桌面原样呈现；手机把次要说明移入独立详情，不改变页面选择。 */
export function MobileDetails({ label, triggerLabel, summary, details, children }: { label: string; triggerLabel?: ReactNode; summary?: ReactNode; details?: ReactNode; children: ReactNode }) {
  const mobile = useMobileLayout();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const id = useId();
  useBackAction(mobile && open, () => setOpen(false), 100);
  useEffect(() => { if (!mobile) setOpen(false); }, [mobile]);
  useEffect(() => {
    if (!mobile || !open) return;
    close.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); setOpen(false); }
      if (event.key === 'Tab') { event.preventDefault(); close.current?.focus(); }
    };
    window.addEventListener('keydown', keydown, true);
    return () => { window.removeEventListener('keydown', keydown, true); trigger.current?.focus(); };
  }, [mobile, open]);
  if (!mobile) return <>{children}</>;
  return <div className="mobile-details">
    {summary && <div className="mobile-details-summary">{summary}</div>}
    <button type="button" ref={trigger} className="mobile-details-trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>{triggerLabel ?? label}</button>
    {open && createPortal(<div className="mobile-system-overlay mobile-details-overlay" onClick={() => setOpen(false)}>
      <section className="mobile-details-dialog" role="dialog" aria-modal="true" aria-labelledby={id} onClick={event => event.stopPropagation()}>
        <header><h2 id={id}>{label}</h2><button type="button" ref={close} aria-label={`关闭${label}`} onClick={() => setOpen(false)}>关闭</button></header>
        <div className="mobile-details-body">{details ?? children}</div>
      </section>
    </div>, document.getElementById('root')!)}
  </div>;
}
