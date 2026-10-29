import { useState, type Dispatch } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { canMasterEnhance, getSkillEnhanceBonus, getSkillEnhanceLevel } from '../game/core/growth';
import { GROWTH_ENCOUNTER_NAMES, growthEncounterCacheKey, growthEncounterEligible } from '../game/state/growth-encounters';
import { getSkill } from '../game/data/skills';
import { FlowPet } from './MainFlowArt';
import { SkillTag, skillBrief } from './components';
import { useBackAction, useMobileLayout } from './mobile';
import { MobileDetails, MobileSkillDescription } from './MobileDetails';
import { STATUS_ART } from './BuffIcon';
import './growthEncounter.css';

function enhancementPreview(id: string, level: number) {
  const skill = getSkill(id), brief = skillBrief(skill, level), bonus = getSkillEnhanceBonus(id, level);
  const effects = (skill.effects ?? []).filter(effect => ['burn', 'poison', 'atkUp', 'atkDown', 'spdDown', 'healTick', 'thorns', 'windSpd', 'waterCurtain'].includes(effect.kind))
    .map(effect => `${STATUS_ART[effect.kind][0]}${Math.min(effect.kind === 'atkDown' ? 2 : effect.kind === 'spdDown' ? 5 : Infinity, effect.value + bonus.effectBonus)}`);
  return [brief, ...effects].filter(Boolean).join(' · ');
}

export function GrowthEncounterScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const pending = state.growthEncounterPending!;
  const kind = pending.kind;
  const mobile = useMobileLayout();
  const [uid, setUid] = useState(pending.uid ?? state.roster.find(unit => unit.hp > 0)?.uid ?? '');
  const [otherUid, setOtherUid] = useState('');
  const [slot, setSlot] = useState(pending.slot ?? 0);
  const [amount, setAmount] = useState(1);
  const [share, setShare] = useState(false);
  const [skillId, setSkillId] = useState('');
  const [selectingOld, setSelectingOld] = useState(!pending.uid);
  const unit = state.roster.find(unit => unit.uid === uid && unit.hp > 0);
  const pair = kind === 'train_pair' || kind === 'transfer' || (kind === 'spring' && share);
  const choosingSkill = ['relearn', 'contract'].includes(kind);
  const skills = (kind !== 'relearn' || !selectingOld) && pending.uid === uid && pending.slot !== undefined && (kind === 'contract' || pending.slot === slot)
    ? state.growthEncounterCandidates?.[growthEncounterCacheKey(state, uid, pending.slot)] : undefined;
  const needsSlot = ['relearn', 'master', 'recycle'].includes(kind);
  const slotAllowed = (index: number) => !!unit && (kind === 'master' ? canMasterEnhance(unit, index)
    : kind === 'recycle' ? (unit.skillEnhancements?.[index] ?? 0) > 0 && (unit.skillEnhancePaid?.[index] ?? 0) > 0 : true);
  const cost = kind === 'relearn' ? 20 : kind === 'buy_stone' ? 30 : 0;
  const valid = growthEncounterEligible(state, kind) && (kind === 'buy_stone' || (!!unit && (!pair || !!otherUid && otherUid !== uid)
    && (!needsSlot || slotAllowed(slot)) && (!choosingSkill || !!skills?.includes(skillId))
    && (kind !== 'transfer' || amount >= 1 && amount <= Math.min(6, unit.growthPoints ?? 0) && Number.isInteger(amount))));
  const back = () => dispatch({ type: 'GROWTH_ENCOUNTER_CANCEL' });
  useBackAction(true, back, 10);
  const partners = (second: boolean) => <div className="growth-encounter-partners" role="group" aria-label={second ? '接收伙伴' : '选择伙伴'}>{state.roster.filter(pet => pet.hp > 0 && (!second || pet.uid !== uid)).map(pet => {
    const limited = ['master', 'recycle', 'contract', 'relearn'].includes(kind);
    const enabled = !limited || growthEncounterEligible({ ...state, roster: [pet] }, kind);
    return <button type="button" key={pet.uid} disabled={!enabled} aria-pressed={(second ? otherUid : uid) === pet.uid}
      onClick={() => { if (second) setOtherUid(pet.uid); else { setUid(pet.uid); setOtherUid(''); setSlot(0); setSkillId(''); setSelectingOld(true); } }}>
      <FlowPet unit={pet} /><span><strong>{pet.name}</strong><small>成长点 {pet.growthPoints ?? 0}</small></span>
    </button>;
  })}</div>;
  return <div className="flow-screen growth-encounter-screen">
    <header className="flow-header flow-frame"><h1>{GROWTH_ENCOUNTER_NAMES[kind]}</h1><span>金币 {state.gold}</span><button onClick={back}>返回选择</button></header>
    <main className="flow-frame growth-encounter-body">
      {kind === 'spring' && <div className="panel-row"><button aria-pressed={!share} onClick={() => setShare(false)}>一位伙伴＋8</button><button aria-pressed={share} disabled={state.roster.filter(pet => pet.hp > 0).length < 2} onClick={() => setShare(true)}>两位伙伴各＋5</button></div>}
      {kind !== 'buy_stone' && <><h2>{kind === 'transfer' ? '来源伙伴' : '选择伙伴'}</h2>{partners(false)}</>}
      {pair && <><h2>{kind === 'transfer' ? '接收伙伴' : '第二位伙伴（不可重复）'}</h2>{partners(true)}</>}
      {kind === 'transfer' && <label className="growth-encounter-amount">转移数量（1～{Math.min(6, unit?.growthPoints ?? 0)}，手续费0）<input type="number" min={1} max={Math.min(6, unit?.growthPoints ?? 0)} value={amount} onChange={event => setAmount(Number(event.target.value))} />
        <span>来源 {unit?.growthPoints ?? 0} → {(unit?.growthPoints ?? 0) - amount}；接收 {state.roster.find(pet => pet.uid === otherUid)?.growthPoints ?? 0} → {(state.roster.find(pet => pet.uid === otherUid)?.growthPoints ?? 0) + amount}</span></label>}
      {needsSlot && unit && !skills && <div className="growth-encounter-skills" role="group" aria-label="选择技能">{unit.skills.map((id, index) => {
        const level = getSkillEnhanceLevel(unit, index);
        return <button key={`${id}-${index}`} disabled={!slotAllowed(index)} aria-pressed={slot === index} onClick={() => { setSlot(index); setSkillId(''); }}>
          <strong>{getSkill(id).name} ＋{level}</strong>
          {kind === 'master' ? <span>{slotAllowed(index) ? `＋${level} → ＋${level + 1} · ${enhancementPreview(id, level)} → ${enhancementPreview(id, level + 1)}` : '不可继续强化'}</span>
            : kind === 'recycle' ? <span>强化归零 · 返还{unit.skillEnhancePaid?.[index] ?? 0}点</span> : null}
        </button>;
      })}</div>}
      {kind === 'relearn' && unit && <p>替换{getSkill(unit.skills[slot]).name}＋{getSkillEnhanceLevel(unit, slot)}，清除其强化，不自动退款。</p>}
      {choosingSkill && <div className="growth-encounter-preview-actions"><button disabled={!unit || !growthEncounterEligible({ ...state, roster: unit ? [unit] : [] }, kind) || (needsSlot && !slotAllowed(slot))} onClick={() => { setSkillId(''); if (kind === 'relearn' && skills) setSelectingOld(true); else { setSelectingOld(false); dispatch({ type: 'GROWTH_ENCOUNTER_PREVIEW', uid, slot }); } }}>{kind === 'relearn' && skills ? '重新选择旧技能' : '查看固定技能候选'}</button>
        {skills && mobile && <MobileDetails label="候选技能完整说明">{skills.map(id => <MobileSkillDescription key={id} skill={getSkill(id)} />)}</MobileDetails>}</div>}
      {skills && <div className="growth-encounter-skills" role="group" aria-label="新技能候选">{skills.map(id => <button key={id} aria-pressed={skillId === id} onClick={() => setSkillId(id)}>{mobile ? <><strong>{getSkill(id).name}</strong><span>{skillBrief(getSkill(id))}</span></> : <SkillTag skill={getSkill(id)} desc usesNote />}</button>)}</div>}
      {kind === 'buy_stone' && <p>消耗30金币，技能强化石×1放入背包，遵守普通强化上限。</p>}
      {kind === 'recycle' && <p>免费强化不退款；无法确认实际付费的旧技能不可回收。</p>}
      {kind === 'master' && <p>本次免费＋1，最高＋4；固定机制技能不可选。本局已领取 {state.masterTransmissions ?? 0}/2 次。</p>}
    </main>
    <footer className="flow-frame growth-encounter-footer"><span>{cost ? `确认消耗${cost}金币` : '确认后领取，不重复结算'}</span><button className="flow-primary" disabled={!valid} onClick={() => dispatch({ type: 'GROWTH_ENCOUNTER_CONFIRM', uid, otherUid, slot, amount, skillId, share })}>确认领取</button></footer>
  </div>;
}
