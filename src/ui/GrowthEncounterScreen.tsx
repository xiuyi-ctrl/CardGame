import { useMemo, useState, type Dispatch } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { canMasterEnhance, getMaxSkillSlots, getSkillEffectEnhanceBonus, getSkillEnhanceLevel } from '../game/core/growth';
import { GROWTH_ENCOUNTER_NAMES, growthCompanionPoints, growthEncounterCacheKey, growthEncounterChoice, growthEncounterEligible } from '../game/state/growth-encounters';
import { makeUnit } from '../game/core/battle';
import type { Unit } from '../game/types';
import { getSkill } from '../game/data/skills';
import { FlowPet } from './MainFlowArt';
import { SkillTag, skillBrief } from './components';
import { useBackAction, useMobileLayout } from './mobile';
import { MobileDetails, MobileSkillDescription, MobileUnitAbilities } from './MobileDetails';
import { STATUS_ART } from './BuffIcon';
import './growthEncounter.css';
import { EnhanceStoneScreen } from './EnhanceStoneScreen';
import { GrowthSkillEncounterScreen } from './GrowthSkillEncounterScreen';

function enhancementPreview(id: string, level: number) {
  const skill = getSkill(id), brief = skillBrief(skill, level);
  const effects = (skill.effects ?? []).filter(effect => ['burn', 'poison', 'atkUp', 'atkDown', 'spdDown', 'healTick', 'thorns', 'windSpd', 'waterCurtain'].includes(effect.kind))
    .map(effect => `${STATUS_ART[effect.kind][0]}${Math.min(effect.kind === 'atkDown' ? 2 : effect.kind === 'spdDown' ? 5 : Infinity, effect.value + getSkillEffectEnhanceBonus(id, level, effect.kind))}`);
  return [brief, ...effects].filter(Boolean).join(' · ');
}

export function GrowthEncounterScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const kind = state.growthEncounterPending!.kind;
  useBackAction(['master', 'relearn', 'contract', 'legend'].includes(kind), () => dispatch({ type: 'GROWTH_ENCOUNTER_CANCEL' }), 10);
  if (kind === 'master') return <EnhanceStoneScreen state={state} dispatch={dispatch} />;
  if (['relearn', 'contract', 'legend'].includes(kind)) return <GrowthSkillEncounterScreen state={state} dispatch={dispatch} />;
  return <GenericGrowthEncounterScreen state={state} dispatch={dispatch} />;
}

function GenericGrowthEncounterScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const pending = state.growthEncounterPending!;
  const kind = pending.kind;
  const mobile = useMobileLayout();
  const reviving = kind === 'grave' || kind === 'revival_spring';
  const partnersList = reviving ? state.deadPets ?? [] : state.roster.filter(unit => unit.hp > 0);
  const [uid, setUid] = useState(pending.uid ?? partnersList[0]?.uid ?? '');
  const [speciesId, setSpeciesId] = useState('');
  const [inspect, setInspect] = useState<Unit>();
  const candidateIds = growthEncounterChoice(state, kind)?.recruitCandidates ?? [];
  const candidates = useMemo(() => candidateIds.map(id => makeUnit(id, true, 0, false)), [candidateIds.join(',')]);
  const [otherUid, setOtherUid] = useState('');
  const [slot, setSlot] = useState(pending.slot ?? 0);
  const [amount, setAmount] = useState(1);
  const [share, setShare] = useState(false);
  const [skillId, setSkillId] = useState('');
  const [selectingOld, setSelectingOld] = useState(!pending.uid);
  const unit = partnersList.find(unit => unit.uid === uid);
  const withoutPartner = ['buy_stone', 'tools', 'supply_heal', 'supply_book', 'trial', 'companions'].includes(kind);
  const pair = kind === 'train_pair' || kind === 'transfer' || (kind === 'spring' && share);
  const choosingSkill = ['relearn', 'contract', 'legend'].includes(kind);
  const legendEmpty = kind === 'legend' && !!unit && unit.skills.length < getMaxSkillSlots(unit);
  const skills = (!['relearn', 'legend'].includes(kind) || !selectingOld) && pending.uid === uid && pending.slot !== undefined && (kind === 'contract' || legendEmpty || pending.slot === slot)
    ? state.growthEncounterCandidates?.[growthEncounterCacheKey(state, uid, pending.slot)] : undefined;
  const needsSlot = ['relearn', 'master', 'recycle'].includes(kind) || kind === 'legend' && !legendEmpty;
  const slotAllowed = (index: number) => !!unit && (kind === 'master' ? canMasterEnhance(unit, index)
    : kind === 'recycle' ? (unit.skillEnhancements?.[index] ?? 0) > 0 && (unit.skillEnhancePaid?.[index] ?? 0) > 0 : true);
  const cost = kind === 'relearn' ? 20 : ['buy_stone', 'altar_hp', 'altar_spd'].includes(kind) ? 30 : 0;
  const valid = growthEncounterEligible(state, kind) && (withoutPartner ? kind !== 'companions' || candidateIds.includes(speciesId) : (!!unit && (!pair || !!otherUid && otherUid !== uid)
    && (!needsSlot || slotAllowed(slot)) && (!choosingSkill || !!skills?.includes(skillId))
    && (!['altar_hp', 'altar_spd'].includes(kind) || growthEncounterEligible({ ...state, roster: [unit] }, kind))
    && (kind !== 'transfer' || amount >= 1 && amount <= Math.min(6, unit.growthPoints ?? 0) && Number.isInteger(amount))));
  const back = () => dispatch({ type: 'GROWTH_ENCOUNTER_CANCEL' });
  useBackAction(true, back, 10);
  useBackAction(!!inspect, () => setInspect(undefined), 100);
  const partners = (second: boolean) => <div className="growth-encounter-partners" role="group" aria-label={second ? '接收伙伴' : '选择伙伴'}>{partnersList.filter(pet => !second || pet.uid !== uid).map(pet => {
    const limited = ['master', 'recycle', 'contract', 'relearn', 'legend', 'altar_hp', 'altar_spd'].includes(kind);
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
      {!withoutPartner && <><h2>{kind === 'transfer' ? '来源伙伴' : reviving ? '选择死亡伙伴' : '选择伙伴'}</h2>{partners(false)}</>}
      {['duel', 'trial'].includes(kind) && <><p>{kind === 'duel' ? '指定1只伙伴单独战斗，胜利获得6成长点。真实阵亡；失败后若仍有其他伙伴存活，可继续远征。' : '真实阵亡，失败结束远征。下一步布阵，胜利出战存活伙伴各＋3成长点、获得20金币。'}</p><div className="growth-encounter-preview-actions">{pending.enemies?.map(enemy => <button key={enemy.uid} onClick={() => setInspect(enemy)}>{enemy.name} · 查看对手详情</button>)}</div></>}
      {['altar_hp', 'altar_spd'].includes(kind) && unit && <p>{unit.name}：{kind === 'altar_hp' ? `最大生命${unit.maxHp} → ${unit.maxHp + 2}` : `速度${unit.spd} → ${unit.spd + 1}`}；计入成长上限，免费档位不退成长点。</p>}
      {reviving && unit && <p>保留完整属性、技能、强化与成长点；复活生命{kind === 'grave' ? Math.ceil(unit.maxHp / 2) : unit.maxHp}/{unit.maxHp}{kind === 'revival_spring' ? '；其他存活伙伴恢复25%生命。' : '。'}</p>}
      {kind === 'companions' && <div className="growth-encounter-recruits">{candidates.map(pet => <article key={pet.speciesId}><button aria-pressed={speciesId === pet.speciesId} onClick={() => setSpeciesId(pet.speciesId)}><FlowPet unit={pet} /><span><strong>{pet.name}</strong><span>生命 {pet.maxHp} · 速度 {pet.spd}</span><span>成长点 {growthCompanionPoints(state.currentLayer ?? 1)}</span></span></button><button onClick={() => setInspect(pet)}>技能与被动详情</button></article>)}</div>}
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
      {['relearn', 'legend'].includes(kind) && unit && <p>{legendEmpty ? `使用已解锁的第${unit.skills.length + 1}技能槽，不消耗其他技能。` : `替换${getSkill(unit.skills[slot]).name}＋${getSkillEnhanceLevel(unit, slot)}，清除其强化，不自动退款。`}</p>}
      {choosingSkill && <div className="growth-encounter-preview-actions"><button disabled={!unit || !growthEncounterEligible({ ...state, roster: unit ? [unit] : [] }, kind) || (needsSlot && !slotAllowed(slot))} onClick={() => { setSkillId(''); if (needsSlot && skills) setSelectingOld(true); else { setSelectingOld(false); dispatch({ type: 'GROWTH_ENCOUNTER_PREVIEW', uid, slot }); } }}>{needsSlot && skills ? '重新选择旧技能' : '查看固定技能候选'}</button>
        {skills && mobile && <MobileDetails label="候选技能完整说明">{skills.map(id => <MobileSkillDescription key={id} skill={getSkill(id)} />)}</MobileDetails>}</div>}
      {skills && <div className="growth-encounter-skills" role="group" aria-label="新技能候选">{skills.map(id => <button key={id} aria-pressed={skillId === id} onClick={() => setSkillId(id)}>{mobile ? <><strong>{getSkill(id).name}</strong><span>{skillBrief(getSkill(id))}</span></> : <SkillTag skill={getSkill(id)} desc usesNote />}</button>)}</div>}
      {kind === 'buy_stone' && <p>消耗30金币，技能强化石×1放入背包，遵守普通强化上限。</p>}
      {kind === 'tools' && <p>普通技能强化石×1、还原石×1，存入背包；强化遵守常规上限。</p>}
      {kind === 'supply_heal' && <p>治疗圣水×1存入背包，使用时全队恢复50%生命。</p>}
      {kind === 'supply_book' && <p>成长之书（中）×1存入背包，使用时指定伙伴获得2成长点。</p>}
      {kind === 'recycle' && <p>免费强化不退款；无法确认实际付费的旧技能不可回收。</p>}
      {kind === 'master' && <p>本次免费＋1，最高＋4；固定机制技能不可选。本局已领取 {state.masterTransmissions ?? 0}/2 次。</p>}
    </main>
    <footer className="flow-frame growth-encounter-footer"><span>{cost ? `确认消耗${cost}金币` : kind === 'trial' ? '进入布阵后确认开战' : kind === 'duel' ? '仅全队无存活伙伴时结束远征' : '确认后领取，不重复结算'}</span><button className="flow-primary" disabled={!valid} onClick={() => dispatch({ type: 'GROWTH_ENCOUNTER_CONFIRM', uid, otherUid, slot, amount, skillId, speciesId, share })}>{kind === 'duel' ? '确认开战' : kind === 'trial' ? '进入布阵' : '确认领取'}</button></footer>
    {inspect && <div className="mobile-system-overlay growth-inspect-overlay" onClick={() => setInspect(undefined)}><section className="mobile-details-dialog" role="dialog" aria-modal="true" aria-label={`${inspect.name}详情`} onClick={event => event.stopPropagation()}><header><h2>{inspect.name} · 生命{inspect.maxHp} · 速度{inspect.spd}</h2><button onClick={() => setInspect(undefined)}>关闭详情</button></header><div className="mobile-details-body"><MobileUnitAbilities unit={inspect} /></div></section></div>}
  </div>;
}
