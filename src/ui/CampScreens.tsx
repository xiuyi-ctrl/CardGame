import { useState } from 'react';
import type { Dispatch, DragEvent, ReactNode } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import type { Unit } from '../game/types';
import { recomputeStats } from '../game/state/game';
import { getMonster } from '../game/data/monsters';
import { getPassive } from '../game/data/passives';
import { getSkill } from '../game/data/skills';
import { getMaxSkillSlots, getSkillEnhanceLevel } from '../game/core/growth';
import { skillBrief, skillFullDesc } from './components';
import { FlowIcon, FlowPet, FlowPetStats } from './MainFlowArt';
import { MapNodeIcon } from './MapNodeIcon';
import { UiSymbol } from './UiSymbol';
import { MobileDetails, MobileSkillDescription } from './MobileDetails';
import { useMobileLayout } from './mobile';
import './camp.css';

type Props = { state: GameState; dispatch: Dispatch<GameAction> };

export function CampHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  return <header className="flow-header flow-frame camp-header"><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}{onBack && <button type="button" onClick={onBack}>返回地图</button>}</header>;
}

export function CampSkillCard({ id, enhanced = 0, selected = false, disabled = false, label, onClick }: {
  id: string; enhanced?: number; selected?: boolean; disabled?: boolean; label?: string; onClick: () => void;
}) {
  const skill = getSkill(id);
  const mobile = useMobileLayout();
  const description = <MobileSkillDescription skill={skill} enhanced={enhanced} />;
  const card = <button type="button" className={`camp-skill-card ${selected ? 'is-selected' : ''}`} disabled={disabled} aria-pressed={selected} onClick={onClick}>
    <span className="camp-skill-name">{skill.name}{enhanced > 0 && <em> +{enhanced}</em>}<b>{skillBrief(skill, enhanced)}</b></span>
    {!mobile && <span className="camp-skill-desc">{skillFullDesc(skill, enhanced)}</span>}
    <span className="camp-skill-notes">{skill.uses !== undefined && <span>每场限 {skill.uses} 次</span>}{!!skill.cooldown && <span>冷却 {skill.cooldown} 回合</span>}{label && <span>{label}</span>}</span>
  </button>;
  return mobile ? <div className="mobile-skill-choice">{card}<MobileDetails label={`${skill.name}完整说明`} triggerLabel="说明">{description}</MobileDetails></div> : card;
}

export function CampRestScreen({ state, dispatch }: Props) {
  const isProf = state.runMode === 'proficiency';
  return <div className="flow-screen camp-screen camp-rest-screen">
    <CampHeader title="营火休整" subtitle={isProf ? '选择一项休整方式' : '让伙伴恢复状态，再次出发'} />
    <main className="camp-rest-layout"><section className="camp-rest-scene" aria-label="营地伙伴">
      <div className="camp-scene-pets">{state.roster[0] && <FlowPet unit={state.roster[0]} />}<MapNodeIcon type="rest" />{state.roster[1] && <FlowPet unit={state.roster[1]} />}</div>
      <div className="flow-frame camp-rest-party">{state.roster.map(unit => <div key={unit.uid}><FlowPet unit={unit} /><strong>{unit.name}</strong><FlowPetStats unit={unit} /></div>)}</div>
    </section><section className="flow-frame camp-rest-choices">
      <button type="button" className="camp-rest-choice" onClick={() => dispatch({ type: 'REST_HEAL' })}><MapNodeIcon type="rest" /><span><strong>休息</strong><span>全队恢复全部生命</span></span></button>
      {isProf && <button type="button" className="camp-rest-choice" disabled={state.roster.length < 2} onClick={() => dispatch({ type: 'REST_FUSION_MODE' })}><FlowIcon name="fuse-companion" /><span><strong>宠物融合</strong><span>继承副宠属性与成长点，学习一个技能</span></span></button>}
      <p>{isProf && state.roster.length < 2 ? '至少需要两只伙伴才能融合' : '选择后继续旅途'}</p>
    </section></main>
  </div>;
}

export function CampFusionScreen({ state, dispatch }: Props) {
  const main = state.roster.find(unit => unit.uid === state.fusionMainUid);
  const sub = state.roster.find(unit => unit.uid === state.fusionSubUid);
  const canConfirm = !!main && !!sub && main.uid !== sub.uid;
  const base = sub ? getMonster(sub.speciesId) : undefined;
  const hpGain = base ? Math.round(base.baseHp * .5) : 0;
  const spdGain = base ? Math.round(base.baseSpd * .5) : 0;
  const gpGain = Math.round((sub?.growthPoints ?? 0) * .3);
  const dragStart = (event: DragEvent, unit: Unit) => {
    event.dataTransfer.setData('text/plain', JSON.stringify({ uid: unit.uid }));
    event.dataTransfer.effectAllowed = 'move';
  };
  const drop = (event: DragEvent, slot: 'main' | 'sub') => {
    event.preventDefault();
    try {
      const data = JSON.parse(event.dataTransfer.getData('text/plain'));
      if (state.roster.some(unit => unit.uid === data.uid)) dispatch({ type: slot === 'main' ? 'REST_FUSION_SET_MAIN' : 'REST_FUSION_SET_SUB', uid: data.uid });
    } catch { /* Ignore unrelated drag data. */ }
  };
  const choose = (unit: Unit) => dispatch({ type: unit.uid === main?.uid || (!main && unit.uid !== sub?.uid) ? 'REST_FUSION_SET_MAIN' : 'REST_FUSION_SET_SUB', uid: unit.uid });
  return <div className="flow-screen camp-screen camp-fusion-screen">
    <CampHeader title="宠物融合" subtitle="主宠保留，副宠消耗" onBack={() => dispatch({ type: 'REST_FUSION_CANCEL' })} />
    <main className="flow-frame camp-fusion-panel"><div className="camp-fusion-body camp-scroll">
      <div className="camp-fusion-slots">{(['main', 'sub'] as const).map(slot => {
        const unit = slot === 'main' ? main : sub;
        return <section key={slot} className={`camp-fusion-slot is-${slot}`} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={event => drop(event, slot)}>
          <h2>{slot === 'main' ? '主宠 · 保留' : '副宠 · 消耗'}</h2>
          {unit ? <button type="button" draggable onDragStart={event => dragStart(event, unit)} onClick={() => dispatch({ type: slot === 'main' ? 'REST_FUSION_SET_MAIN' : 'REST_FUSION_SET_SUB', uid: unit.uid })}><FlowPet unit={unit} /><span><strong>{unit.name}</strong><FlowPetStats unit={unit} /></span></button> : <p className="camp-fusion-empty">点击下方伙伴或拖入{slot === 'main' ? '主宠' : '副宠'}</p>}
        </section>;
      })}<span className="camp-fusion-arrow" aria-hidden="true"><UiSymbol name="arrow-left" /></span></div>
      <section className="camp-fusion-preview"><h2>融合效果预览</h2><p>继承副宠50%基础属性与30%成长点</p>{canConfirm ? <div><span>生命 <b>+{hpGain}</b></span><span>速度 <b>+{spdGain}</b></span><span>成长点 <b>+{gpGain}</b></span></div> : <p>请选择主宠和副宠</p>}</section>
    </div><footer className="camp-fusion-confirm"><p>副宠将离开队伍，此操作不可撤销</p><div><button type="button" className="flow-primary" disabled={!canConfirm} onClick={() => dispatch({ type: 'REST_FUSION_CONFIRM' })}>开始融合</button><small>融合后可选择一个未学过的副宠技能</small></div></footer></main>
    <section className="flow-frame camp-fusion-roster"><h2>我的宠物 · 点击或拖动选择</h2><div className="camp-fusion-roster-grid camp-scroll">{state.roster.map(unit => <button type="button" key={unit.uid} draggable onDragStart={event => dragStart(event, unit)} onClick={() => choose(unit)} className={`camp-roster-card ${main?.uid === unit.uid ? 'is-main' : sub?.uid === unit.uid ? 'is-sub' : ''}`}>
      {main?.uid === unit.uid && <span className="camp-roster-badge">主宠</span>}{sub?.uid === unit.uid && <span className="camp-roster-badge">副宠</span>}<FlowPet unit={unit} /><strong>{unit.name}</strong><FlowPetStats unit={unit} /><small>基础生命 {getMonster(unit.speciesId).baseHp} · 速度 {getMonster(unit.speciesId).baseSpd} · 成长点 {unit.growthPoints ?? 0}</small>
    </button>)}</div></section>
  </div>;
}

export function CampFusionSkillScreen({ state, dispatch }: Props) {
  const unit = state.roster.find(candidate => candidate.uid === state.fusionMainUid);
  const learn = state.fusionLearnSkill;
  const replace = state.fusionReplaceIdx;
  const hasEmpty = !!unit && unit.skills.length < getMaxSkillSlots(unit);
  const canConfirm = !!learn && (replace !== undefined || hasEmpty);
  return <div className="flow-screen camp-screen camp-fusion-skill-screen">
    <CampHeader title="融合 · 选择技能" subtitle="先选继承技能，再选主宠槽位" />
    {unit ? <><section className="flow-frame camp-target-strip"><FlowPet unit={unit} /><strong>{unit.name}</strong><span>选择要继承的技能</span></section>
      <main className="camp-inherit-columns"><section className="flow-frame camp-skill-column"><h2>副宠技能 · 选择继承</h2><div className="camp-scroll camp-inherit-list">{(state.fusionSubSkills ?? []).map(id => <CampSkillCard key={id} id={id} selected={learn === id} onClick={() => dispatch({ type: 'REST_FUSION_SET_LEARN', skillId: id })} />)}</div></section>
        <section className="flow-frame camp-skill-column"><h2>主宠技能 · {learn ? '选择替换' : '先选左侧技能'}</h2><div className="camp-scroll camp-inherit-list">{unit.skills.map((id, index) => <CampSkillCard key={`${id}-${index}`} id={id} enhanced={getSkillEnhanceLevel(unit, index)} label={`槽位 ${index + 1}`} selected={replace === index} disabled={!learn} onClick={() => dispatch({ type: 'REST_FUSION_SELECT_REPLACE', replaceIdx: index })} />)}
          {hasEmpty && learn && <button type="button" className={`camp-empty-skill ${replace === unit.skills.length ? 'is-selected' : ''}`} onClick={() => dispatch({ type: 'REST_FUSION_SELECT_REPLACE', replaceIdx: unit.skills.length })}>+ 添加到空槽</button>}
        </div></section></main>
    </> : <div className="flow-frame camp-missing">找不到目标宠物</div>}
    <footer className="flow-frame camp-inherit-footer"><p>{learn && unit ? `${getSkill(learn).name} → ${replace !== undefined && replace < unit.skills.length ? `替换 ${getSkill(unit.skills[replace]).name}` : hasEmpty ? '添加到空槽' : '请选择替换槽位'}` : '请选择要继承的技能'}</p><div><button type="button" onClick={() => dispatch({ type: 'REST_FUSION_CANCEL' })}>返回地图</button><span>融合属性已结算，返回不撤销融合</span><button type="button" className="flow-primary" disabled={!unit || !canConfirm} onClick={() => { if (learn) dispatch({ type: 'REST_FUSION_SKILL', skillId: learn, replaceIdx: replace }); }}>{canConfirm ? (replace !== undefined && unit && replace < unit.skills.length ? '确认替换' : '确认学习') : '请先选择技能'}</button></div></footer>
  </div>;
}

export function SpecialTargetScreen({ state, dispatch }: Props) {
  const [focusedUid, setFocusedUid] = useState<string | null>(null);
  const pending = state.specialPending;
  const unit = state.roster.find(candidate => candidate.uid === focusedUid) ?? state.roster[0];
  const passive = unit ? getPassive(unit.passive) : undefined;
  const amount = pending && 'amount' in pending ? pending.amount ?? 1 : 1;
  let title = '选择伙伴'; let instruction = ''; let preview: ReactNode;
  if (pending?.kind === 'eventBoostHp' || pending?.kind === 'eventBoostSpd') {
    const isSpd = pending.kind === 'eventBoostSpd'; const stat = isSpd ? '速度' : '最大生命';
    title = '选择强化伙伴'; instruction = `选择一只宠物永久增加${amount}点${stat}`;
    const after = unit ? recomputeStats({ ...unit, bonusStats: { ...unit.bonusStats, [isSpd ? 'spd' : 'hp']: (isSpd ? unit.bonusStats?.spd ?? 0 : unit.bonusStats?.hp ?? 0) + amount } }) : undefined;
    preview = unit && after && <><p>最大生命 <b>{unit.maxHp} → {after.maxHp}</b></p><p>速度 <b>{unit.spd} → {after.spd}</b></p></>;
  } else if (pending?.kind === 'growthPoint' || pending?.kind === 'arena3Exhibition') {
    const gain = pending.kind === 'arena3Exhibition' ? 5 : amount;
    title = pending.kind === 'arena3Exhibition' ? '表演赛 · 选择伙伴' : '领取成长点'; instruction = `选择一只宠物获得 ${gain} 成长点`;
    preview = <><p>成长点 <b>{unit?.growthPoints ?? 0} → {(unit?.growthPoints ?? 0) + gain}</b></p>{pending.kind === 'arena3Exhibition' && <p className="camp-danger">花费20金币 · 当前 {state.gold} 金币</p>}</>;
  } else if (pending?.kind === 'eventResetGrowth') {
    title = '选择重置伙伴'; instruction = '清除所选伙伴属性加成，按规则返还成长点';
    const refund = Math.floor((unit?.bonusStats?.hp ?? 0) / 2) + (unit?.bonusStats?.spd ?? 0);
    preview = <><p>当前生命加成 {unit?.bonusStats?.hp ?? 0} · 速度加成 {unit?.bonusStats?.spd ?? 0}</p><p>返还成长点 <b>{Math.max(0, refund)}</b></p><p className="camp-danger">重置后属性加成清零</p></>;
  } else if (pending?.kind === 'shopSlotUnlock') {
    title = '解锁技能槽 · 选择伙伴'; instruction = '选择伙伴后进入新技能选择';
    preview = <p>{(unit?.extraSkillSlots ?? 0) >= 3 ? '技能槽已全部解锁，选择后按原规则退还金币' : `解锁第 ${(unit?.extraSkillSlots ?? 0) + 3} 技能槽`}</p>;
  } else if (pending?.kind === 'eventSkillReplace') {
    title = '替换技能 · 选择伙伴'; instruction = '选择伙伴，再选择旧技能和新技能'; preview = <p>进入技能替换选择，不改变伙伴属性</p>;
  } else {
    title = '斗兽场 · 选择出战伙伴'; instruction = '选择一只伙伴参加1v1单挑'; preview = <p className="camp-danger">点击伙伴直接出战，无法驯服敌人</p>;
  }
  return <div className="flow-screen camp-screen camp-special-screen"><CampHeader title={title} subtitle={instruction} />
    <main className="camp-special-layout"><section className="flow-frame camp-special-roster"><h2>队伍伙伴</h2><div className="camp-special-grid camp-scroll">{state.roster.map(candidate => <button type="button" key={candidate.uid} className={`camp-roster-card ${unit?.uid === candidate.uid ? 'is-focused' : ''}`} onMouseEnter={() => setFocusedUid(candidate.uid)} onFocus={() => setFocusedUid(candidate.uid)} onClick={() => dispatch({ type: 'SPECIAL_TARGET', uid: candidate.uid })}><FlowPet unit={candidate} /><strong>{candidate.name}</strong><FlowPetStats unit={candidate} /></button>)}</div></section>
      <section className="flow-frame camp-special-preview"><h2>效果预览</h2><div className="camp-scroll">{unit && <><div className="camp-preview-pet"><FlowPet unit={unit} /><h3>{unit.name}</h3></div><div className="camp-effect-preview">{preview}</div><MobileDetails label={`${unit.name}技能与被动`}>{passive && <section><h3>被动特性</h3><p><b>{passive.name}</b>：{passive.desc}</p></section>}<section><h3>技能</h3><div className="flow-skill-chips">{unit.skills.map((id, index) => <span key={`${id}-${index}`}>{getSkill(id).name}</span>)}</div></section></MobileDetails></>}</div></section></main>
    <footer className="flow-frame camp-instruction">{pending?.kind === 'arena' ? '点击伙伴直接出战' : pending?.kind === 'eventBoostHp' || pending?.kind === 'eventBoostSpd' || pending?.kind === 'eventResetGrowth' || pending?.kind === 'growthPoint' || pending?.kind === 'arena3Exhibition' ? '点击伙伴直接应用效果' : '点击伙伴进入技能选择'}</footer>
  </div>;
}
