/**
 * 技能学习与替换：只更新展示层，保持原有分步选择、刷新与取消动作。
 */
import type { Dispatch } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { getSkillEnhanceLevel, REFRESH_COST, MAX_REFRESH_COUNT } from '../game/core/growth';
import { getSkill } from '../game/data/skills';
import { FlowPet, FlowPetStats } from './MainFlowArt';
import { CampHeader, CampSkillCard } from './CampScreens';

export function SkillPickScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const { skillPick, skillReplace } = state;
  const uid = skillReplace?.uid ?? skillPick?.uid;
  const unit = state.roster.find(candidate => candidate.uid === uid);
  if (!unit || (!skillPick && !skillReplace)) return null;
  const choosingOld = skillReplace?.replaceIdx === -1;
  const isLegend = state.specialPending?.kind === 'legendSkill';
  const refreshCount = skillReplace?.refreshCount ?? 0;
  const canRefresh = !isLegend && refreshCount < MAX_REFRESH_COUNT && (unit.growthPoints ?? 0) >= REFRESH_COST;
  const choices = choosingOld ? unit.skills : skillReplace?.choices ?? skillPick?.choices ?? [];
  const title = skillReplace ? (choosingOld ? '替换技能 · 选择旧技能' : '替换技能 · 选择新技能') : '学习新技能';
  const subtitle = choosingOld ? '先选择要替换的技能' : skillReplace
    ? `将「${getSkill(unit.skills[skillReplace.replaceIdx]).name}」替换为以下技能之一`
    : `为${unit.name}选择第${skillPick!.slot}技能槽的新技能`;
  return <div className="flow-screen camp-screen camp-learning-screen">
    <CampHeader title={title} subtitle={subtitle} />
    <main className="camp-learning-layout">
      <aside className="flow-frame camp-learning-target camp-scroll"><h2>{unit.name}</h2><FlowPet unit={unit} /><FlowPetStats unit={unit} />
        <h3>当前技能</h3><div className="flow-skill-chips">{unit.skills.map((id, index) => <span className={skillReplace && skillReplace.replaceIdx === index ? 'training-replace-pending' : ''} key={`${id}-${index}`}>{getSkill(id).name}{getSkillEnhanceLevel(unit, index) > 0 && ` +${getSkillEnhanceLevel(unit, index)}`}{skillReplace && skillReplace.replaceIdx === index && <small>待替换</small>}</span>)}</div>
        <p>{skillReplace ? '替换后不可撤销' : `第${skillPick!.slot}技能槽`}</p>
        {!!skillReplace && !isLegend && <p>成长点：{unit.growthPoints ?? 0}</p>}
      </aside>
      <section className="flow-frame camp-learning-panel"><h2>{choosingOld ? '选择要替换的槽位' : '从以下技能中选择一项'}</h2>
        <div className="camp-learning-cards camp-scroll">{choices.map((id, index) => <CampSkillCard key={`${id}-${index}`} id={id}
          enhanced={choosingOld ? getSkillEnhanceLevel(unit, index) : 0}
          label={choosingOld ? `槽位 ${index + 1} · 点击选择` : skillReplace ? '点击替换' : '点击学习'}
          onClick={() => dispatch(choosingOld ? { type: 'PROF_SKILL_REPLACE_SELECT', replaceIdx: index } : { type: 'PROF_SLOT_PICK', skillId: id })} />)}
          {choices.length === 0 && <p>没有可选择的技能</p>}
        </div>
        <footer className="camp-learning-actions"><p>{choosingOld ? '选择旧技能后，再选择新技能' : skillReplace ? '点击技能直接替换' : '点击技能直接学习'}</p><div>
          {!!skillReplace && !choosingOld && !isLegend && <button type="button" disabled={!canRefresh} onClick={() => dispatch({ type: 'PROF_SKILL_REFRESH' })}>刷新（{REFRESH_COST}成长点，剩{MAX_REFRESH_COUNT - refreshCount}次）</button>}
          <button type="button" onClick={() => dispatch({ type: 'PROF_SLOT_CANCEL' })}>{skillReplace ? '取消' : '取消（不解锁）'}</button>
        </div></footer>
      </section>
    </main>
  </div>;
}
