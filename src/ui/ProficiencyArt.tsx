import type { Dispatch, ReactNode } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import type { Unit } from '../game/types';
import { getSkillEnhanceLevel } from '../game/core/growth';
import { CampHeader } from './CampScreens';
import { FlowIcon, FlowPet, FlowPetStats } from './MainFlowArt';
import { BACKPACK_ITEM_ART } from './backpackItemArt';
import './proficiency.css';

export function TrainingRoster({ units, selectedUid, disabled = false, onSelect }: { units: Unit[]; selectedUid?: string | null; disabled?: boolean; onSelect: (unit: Unit) => void }) {
  return <section className="flow-frame training-roster"><h2>伙伴列表</h2><div className="camp-scroll training-roster-list">{units.map(unit => <button type="button" key={unit.uid} disabled={disabled} aria-pressed={selectedUid === unit.uid} className={`training-pet ${selectedUid === unit.uid ? 'is-selected' : ''}`} onClick={() => onSelect(unit)}>
    <FlowPet unit={unit} /><strong>{unit.name}</strong><span>成长点 <b>{unit.growthPoints ?? 0}</b></span><FlowPetStats unit={unit} /><small>技能强化 +{unit.skills.reduce((sum, _, index) => sum + getSkillEnhanceLevel(unit, index), 0)}</small>
  </button>)}{units.length === 0 && <p>没有可选择的伙伴</p>}</div></section>;
}

export function TrainingWorkbench({ state, dispatch, title, subtitle, unit, onSelect, onClear, children }: {
  state: GameState; dispatch: Dispatch<GameAction>; title: string; subtitle: string;
  unit?: Unit; onSelect: (unit: Unit) => void; onClear: () => void; children?: ReactNode;
}) {
  return <div className="flow-screen camp-screen training-workbench">
    <CampHeader title={title} subtitle={subtitle} onBack={() => dispatch({ type: 'BACK_TO_MAP' })} />
    <main className="training-workbench-layout">{unit ? <aside className="flow-frame training-target camp-scroll"><h2>{unit.name}</h2><FlowPet unit={unit} /><FlowPetStats unit={unit} />
      <p className="training-points">可用成长点 <b>{unit.growthPoints ?? 0}</b></p><h3>持有道具</h3>
      <div className="training-stones"><span><img src={BACKPACK_ITEM_ART.skill_enhance_stone} alt="" />强化石 ×{state.inventory.skill_enhance_stone ?? 0}</span><span><img src={BACKPACK_ITEM_ART.reset_stone} alt="" />还原石 ×{state.inventory.reset_stone ?? 0}</span></div>
      <button type="button" onClick={onClear}>返回选宠</button>
    </aside> : <TrainingRoster units={state.roster} onSelect={onSelect} />}
      <section className="flow-frame training-workbench-main">{unit ? <><h2>{unit.name}的技能</h2>{children}<p className="training-workbench-note">强化或重置前将显示确认弹窗</p></> : <div className="training-empty"><FlowIcon name="rating-laurel" /><h2>选择一位伙伴</h2><p>{subtitle}</p></div>}</section>
    </main>
  </div>;
}

export function ProficiencyReport({ state, dispatch, onRetry }: { state: GameState; dispatch: Dispatch<GameAction>; onRetry: () => void }) {
  const won = state.proficiencyResult === 'won';
  const alive = state.roster.filter(unit => unit.hp > 0);
  const best = [...alive].sort((a, b) => (b.growthPoints ?? 0) - (a.growthPoints ?? 0))[0];
  return <div className={`flow-screen camp-screen proficiency-report-screen ${won ? 'is-victory' : 'is-defeat'}`}><main className="flow-frame proficiency-report">
    <header><FlowIcon name={won ? 'victory-crown' : 'journey-end'} /><h1>熟练度远征 · {won ? '胜利' : '失败'}</h1></header>
    <div className="camp-scroll proficiency-report-body"><section className="proficiency-report-stats"><div><span>到达层数</span><strong>{state.currentRow + 1}<small>/50</small></strong></div><div><span>总战斗场次</span><strong>{(state.runStats?.battlesWon ?? 0) + (state.runStats?.battlesLost ?? 0)}</strong></div></section>
      <section className="proficiency-final-team"><h2>最终队伍</h2><div>{alive.map(unit => <article key={unit.uid}><h3>{unit.name}</h3><FlowPet unit={unit} /><p>剩余成长点 <b>{unit.growthPoints ?? 0}</b></p></article>)}</div>{alive.length === 0 && <p>没有幸存的伙伴</p>}</section>
      {best && <div className="proficiency-best"><FlowPet unit={best} /><p>最高剩余成长点：{best.name} · <b>{best.growthPoints ?? 0}点</b></p></div>}
    </div><footer>{won && <button type="button" className="flow-primary" onClick={onRetry}>重新开始</button>}<button type="button" onClick={() => dispatch({ type: 'TITLE' })}>返回主菜单</button></footer>
  </main></div>;
}
