import { useState, type Dispatch } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { getMaxSkillSlots } from '../game/core/growth';
import { GROWTH_ENCOUNTER_NAMES, growthEncounterCacheKey, growthEncounterEligible } from '../game/state/growth-encounters';
import { TrainingWorkbench } from './ProficiencyArt';
import { SkillPickScreen } from './SkillPickScreen';

/** 事件奖励复用正常学习／替换页，结算仍交给事件动作，避免消耗普通成长点。 */
export function GrowthSkillEncounterScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const pending = state.growthEncounterPending!;
  const [selectedUid, setSelectedUid] = useState(pending.uid);
  const unit = state.roster.find(pet => pet.uid === selectedUid && pet.hp > 0);
  const cancel = () => dispatch({ type: 'GROWTH_ENCOUNTER_CANCEL' });
  if (!unit) return <TrainingWorkbench state={{ ...state, roster: state.roster.filter(pet => pet.hp > 0 && growthEncounterEligible({ ...state, roster: [pet] }, pending.kind)) }}
    dispatch={action => action.type === 'BACK_TO_MAP' ? cancel() : dispatch(action)} title={GROWTH_ENCOUNTER_NAMES[pending.kind]} subtitle="选择伙伴后进入技能选择界面"
    onClear={() => setSelectedUid(undefined)} onSelect={pet => {
      setSelectedUid(pet.uid);
      if (pending.kind === 'contract' || pending.kind === 'legend' && pet.skills.length < getMaxSkillSlots(pet)) dispatch({ type: 'GROWTH_ENCOUNTER_PREVIEW', uid: pet.uid });
    }} />;
  const learning = pending.kind === 'contract' || pending.kind === 'legend' && unit.skills.length < getMaxSkillSlots(unit);
  const slot = pending.uid === unit.uid ? pending.slot : undefined;
  const choices = slot === undefined ? [] : state.growthEncounterCandidates?.[growthEncounterCacheKey(state, unit.uid, slot)] ?? [];
  const view: GameState = { ...state,
    skillPick: learning ? { uid: unit.uid, slot: (unit.skills.length + 1) as 3 | 4 | 5, choices } : undefined,
    skillReplace: learning ? undefined : { uid: unit.uid, replaceIdx: slot ?? -1, choices, refreshCount: 0 } };
  return <SkillPickScreen state={view} dispatch={action => {
    if (action.type === 'PROF_SKILL_REPLACE_SELECT') dispatch({ type: 'GROWTH_ENCOUNTER_PREVIEW', uid: unit.uid, slot: action.replaceIdx });
    else if (action.type === 'PROF_SLOT_PICK') dispatch({ type: 'GROWTH_ENCOUNTER_CONFIRM', uid: unit.uid, slot, skillId: action.skillId });
    else if (action.type === 'PROF_SLOT_CANCEL') cancel();
  }} />;
}
