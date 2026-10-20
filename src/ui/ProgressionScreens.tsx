import { useState } from 'react';
import type { Dispatch } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import type { Unit } from '../game/types';
import { nextStage, evolutionLockReason, CURSE_CN, CUSTOM_PRESETS } from '../game/state/game';
import { getMonster } from '../game/data/monsters';
import { getPassive } from '../game/data/passives';
import { getSkill } from '../game/data/skills';
import { computeStats } from '../game/core/battle';
import { persistSave } from './persistence';
import { FlowHeader, FlowIcon, FlowPet, FlowPetStats } from './MainFlowArt';
import { BuffIcon, CURSE_ART } from './BuffIcon';
import { UiSymbol } from './UiSymbol';
import './progression.css';

// 仅用于展示：按 fuseUnit 的属性公式计算，不调用 makeUnit，避免预览递增全局 UID。
function evolutionPreview(unit: Unit): Unit | undefined {
  const id = nextStage(unit.speciesId);
  if (!id) return undefined;
  const species = getMonster(id);
  const passive = getPassive(species.passive);
  let hp = species.baseHp + (passive?.kind === 'hp' ? passive.value : 0) + (unit.bonusStats?.hp ?? 0);
  let spd = species.baseSpd + (passive?.kind === 'spd' ? passive.value : 0) + (unit.bonusStats?.spd ?? 0);
  if (unit.curse === 'hpDown') hp = Math.max(1, hp - 5);
  else if (unit.curse === 'spdDown') spd = Math.max(1, spd - 2);
  return { ...unit, speciesId: id, name: species.name, emoji: species.emoji, image: species.image,
    hp, maxHp: hp, spd, passive: species.passive, skills: unit.customSkills ?? [...species.skills] };
}

export function ProgressionChoiceScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const [focusedUid, setFocusedUid] = useState<string | null>(null);
  const pending = state.specialPending;
  const isEvolution = pending?.kind === 'evolve';
  const isSuper = isEvolution && pending.super;
  const focused = state.roster.find(unit => unit.uid === focusedUid)
    ?? state.roster.find(unit => !isEvolution || (nextStage(unit.speciesId) && !evolutionLockReason(state, unit.speciesId))) ?? state.roster[0];
  const lockReason = focused && isEvolution ? evolutionLockReason(state, focused.speciesId) : undefined;
  const evolved = focused && isEvolution && !lockReason ? evolutionPreview(focused) : undefined;
  const oldPassive = focused ? getPassive(focused.passive) : undefined;
  const newPassive = evolved ? getPassive(evolved.passive) : undefined;
  const title = isEvolution ? (isSuper ? '超进化' : '进化之光') : '属性强化 · 选择伙伴';
  return <div className={`flow-screen progression-choice-screen ${isSuper ? 'is-super-evolution' : ''}`}>
    <FlowHeader title={title} state={state} onHome={() => { void persistSave(state); dispatch({ type: 'TITLE' }); }} />
    <main className="progression-choice-layout">
      <section className="flow-frame progression-roster"><h2>{isEvolution ? '可选进化伙伴' : '选择强化对象'}</h2>
        <div className="progression-roster-grid">{state.roster.map(unit => {
          const unitLockReason = isEvolution ? evolutionLockReason(state, unit.speciesId) : undefined;
          const eligible = !isEvolution || (!!nextStage(unit.speciesId) && !unitLockReason);
          return <button type="button" key={unit.uid} className={`progression-pet-option ${focused?.uid === unit.uid ? 'is-focused' : ''}`} disabled={!eligible}
            onMouseEnter={() => setFocusedUid(unit.uid)} onFocus={() => setFocusedUid(unit.uid)} onClick={() => dispatch(isEvolution ? { type: 'EVOLVE_ONE', uid: unit.uid } : { type: 'SPECIAL_TARGET', uid: unit.uid })}>
            <span className="progression-pet-label">{unitLockReason ? '传奇未解锁' : eligible ? (isEvolution ? '可进化' : '可强化') : '最终形态'}</span>
            <FlowPet unit={unit} /><strong>{unit.name}</strong><FlowPetStats unit={unit} />
          </button>;
        })}</div>
      </section>
      <section className="flow-frame progression-preview"><h2>{isEvolution ? '进化预览' : '伙伴资料'}</h2>
        <div className="progression-preview-body">{focused && <>
          {evolved ? <>
            <div className="evolution-portraits"><div><FlowPet unit={focused} /><strong>{focused.name}</strong></div><span aria-hidden="true"><UiSymbol name="arrow-right" /></span><div><FlowPet unit={evolved} /><strong>{evolved.name}</strong></div></div>
            <div className="progression-stat-change"><span><i className="starter-stat-icon starter-stat-heart" aria-hidden="true" />最大生命</span><b>{focused.maxHp} → <em>{evolved.maxHp}</em></b></div>
            <div className="progression-stat-change"><span><i className="starter-stat-icon starter-stat-speed" aria-hidden="true" />速度</span><b>{focused.spd} → <em>{evolved.spd}</em></b></div>
            <section className="progression-passive-change"><h3>被动对比</h3><p>{oldPassive?.name ?? '无'} → {newPassive?.name ?? '无'}</p>{newPassive && <p>{newPassive.desc}</p>}</section>
            <section><h3>进化后技能</h3><div className="flow-skill-chips">{evolved.skills.map(id => <span key={id} title={getSkill(id).desc}>{getSkill(id).name}</span>)}</div></section>
            <p className="progression-note">保留原有强化、自创技能与诅咒。{isSuper && '以上尚未计入本次随机诅咒。'}</p>
          </> : <><div className="progression-single-pet"><FlowPet unit={focused} /><h3>{focused.name}</h3><FlowPetStats unit={focused} /></div>
            {oldPassive && <div className="flow-passive"><b>{oldPassive.name}</b><p>{oldPassive.desc}</p></div>}
            <p className="progression-note">{lockReason ?? (isEvolution ? '该伙伴已是最终形态。' : '点击左侧伙伴后，选择生命 +5 或速度 +2。')}</p>
          </>}
        </>}</div>
        {isSuper && <aside className="super-evolution-warning"><h3>随机诅咒</h3><p>进化后随机附带一种负面诅咒</p><div>{(['hpDown', 'atkDown', 'spdDown'] as const).map(curse => <span key={curse}><BuffIcon art={CURSE_ART[curse]} />{CURSE_CN[curse]}</span>)}</div></aside>}
      </section>
    </main>
    <footer className={`flow-frame progression-instruction ${isSuper ? 'is-danger' : ''}`}>{isEvolution ? (isSuper ? '点击伙伴即进化，并承担随机诅咒。' : '点击可进化伙伴，直接完成进化。') : '点击伙伴，进入属性强化选择。'}</footer>
  </div>;
}

export function AttributeBoostScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const uid = state.specialPending?.kind === 'boost' ? state.specialPending.uid : '';
  const unit = state.roster.find(candidate => candidate.uid === uid);
  if (!unit) return null;
  return <div className="flow-screen attribute-boost-screen">
    <FlowHeader title="属性强化 · 选择一项永久提升" state={state} onHome={() => { void persistSave(state); dispatch({ type: 'TITLE' }); }} />
    <main className="flow-frame attribute-boost-panel"><section className="attribute-boost-target"><h2>强化对象</h2><FlowPet unit={unit} /><h3>{unit.name}</h3><FlowPetStats unit={unit} /></section>
      <div className="attribute-boost-options">{([{ stat: 'hp', value: 5, name: '生命', old: unit.maxHp }, { stat: 'spd', value: 2, name: '速度', old: unit.spd }] as const).map(option => <button type="button" key={option.stat} onClick={() => dispatch({ type: 'BOOST_STAT', stat: option.stat })}>
        <i className={`starter-stat-icon ${option.stat === 'hp' ? 'starter-stat-heart' : 'starter-stat-speed'}`} aria-hidden="true" />
        <div><h2>{option.name} <em>+{option.value}</em></h2><p>永久提升{option.stat === 'hp' ? '最大生命' : '速度'}</p><strong>{option.stat === 'hp' ? '最大生命' : '速度'} {option.old} → <em>{option.old + option.value}</em></strong></div>
      </button>)}</div>
    </main><footer className="flow-frame progression-instruction">点击选项直接强化，仅可选择一项。</footer>
  </div>;
}

export function CreationScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  return <div className="flow-screen creation-screen">
    <FlowHeader title="造物 · 自创生物" state={state} onHome={() => { void persistSave(state); dispatch({ type: 'TITLE' }); }} />
    <main className="flow-frame creation-panel"><header><h2>三种模板，选择其一</h2><p>从所选模板技能池随机组合3个技能</p></header>
      <div className="creation-options">{CUSTOM_PRESETS.map((id, index) => {
        const species = getMonster(id); const stats = computeStats(id); const passive = getPassive(species.passive);
        return <button type="button" className="creation-option" key={id} onClick={() => dispatch({ type: 'PICK_CUSTOM', presetId: id })}>
          <h3>{species.name}</h3><span className="creation-role">{['坚韧模板', '输出模板', '高速模板'][index]}</span>
          <div className="creation-template-symbol" aria-hidden="true"><img src={`/page-special-icons/creation-${id}.png`} alt="" draggable={false} /><b>?</b></div>
          <div className="flow-pet-stats"><span><i className="starter-stat-icon starter-stat-heart" />{stats.maxHp}</span><span><i className="starter-stat-icon starter-stat-speed" />{stats.spd}</span></div>
          <h4>技能池</h4><div className="flow-skill-chips">{species.skills.map(skill => <span key={skill} title={getSkill(skill).desc}>{getSkill(skill).name}</span>)}</div>
          {passive && <p className="creation-passive">被动 · {passive.name}：{passive.desc}</p>}
        </button>;
      })}</div>
    </main><footer className="flow-frame progression-instruction">点击模板完成造物，技能由系统随机组合。</footer>
  </div>;
}

export function RevivalScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const deadPets = state.deadPets ?? []; const ratio = state.reviveRatio ?? 0.5;
  return <div className="flow-screen revival-screen"><header className="flow-header flow-frame"><h1><FlowIcon name="journey-end" />复活伙伴</h1><button type="button" onClick={() => dispatch({ type: 'BACK_TO_MAP' })}>返回地图</button></header>
    <main className="flow-frame revival-panel"><header><h2>本次复活保留 <em>{Math.round(ratio * 100)}%</em> 属性</h2><p>选择一位伙伴重返旅途，复活后的属性如下</p></header>
      <div className="revival-options">{deadPets.map(unit => {
        const newHp = Math.max(1, Math.round(unit.maxHp * ratio));
        const newMaxHp = ratio >= 1 ? unit.maxHp : Math.round(unit.maxHp * ratio);
        const newSpd = ratio >= 1 ? unit.spd : Math.max(1, Math.round(unit.spd * ratio));
        return <button type="button" key={unit.uid} className="revival-option" onClick={() => dispatch({ type: 'REVIVE', uid: unit.uid, ratio })}><h3>{unit.name}</h3><FlowPet unit={unit} />
          <div className="revival-compare-labels"><span>原属性</span><span>复活后</span></div>
          <div className="progression-stat-change"><span><i className="starter-stat-icon starter-stat-heart" />最大生命</span><b>{unit.maxHp} → <em>{newMaxHp}</em></b></div>
          <div className="progression-stat-change"><span><i className="starter-stat-icon starter-stat-speed" />速度</span><b>{unit.spd} → <em>{newSpd}</em></b></div>
          <p>复活生命 <b>{newHp}/{newMaxHp}</b></p><span className="revival-action">选择复活</span>
        </button>;
      })}{deadPets.length === 0 && <div className="revival-empty"><FlowIcon name="journey-end" /><h3>没有死亡的宠物可复活</h3><p>可以返回地图继续旅途。</p></div>}</div>
      <footer>仅复活所选伙伴，实际属性按本次规则计算。</footer>
    </main>
  </div>;
}
