/**
 * 还原石专属界面（从背包使用）
 * 功能：重置宠物技能强化等级（消耗还原石，返还成长点）
 */
import { useState } from 'react';
import type { Dispatch } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { TrainingWorkbench } from './ProficiencyArt';
import { BACKPACK_ITEM_ART } from './backpackItemArt';
import {
  getSkillEnhanceLevel,
  getSkillEnhanceBonus,
} from '../game/core/growth';
import { getSkill } from '../game/data/skills';

interface Props {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}

export function EnhanceResetScreen({ state, dispatch }: Props) {
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [resetSlotIndex, setResetSlotIndex] = useState<number | null>(null);

  const roster = state.roster;
  const selectedUnit = roster.find((u) => u.uid === selectedUid);
  const resetCount = state.inventory['reset_stone'] ?? 0;

  if (selectedUnit) {
    return (
      <TrainingWorkbench state={state} dispatch={dispatch} title="还原石 · 技能重置" subtitle="重置技能强化，按原规则返还成长点" unit={selectedUnit} onSelect={unit => setSelectedUid(unit.uid)} onClear={() => setSelectedUid(null)}>

        <div className="growth-skill-enhance-list">
          {selectedUnit.skills.map((skillId, idx) => {
            const sk = getSkill(skillId);
            if (!sk) return null;
            const level = getSkillEnhanceLevel(selectedUnit, idx);
            const canReset = level > 0 && resetCount > 0;
            const refund = Math.ceil(getSkillEnhanceTotalCost(level) * 0.5);

            return (
              <div key={idx} className="growth-skill-enhance-item">
                <div className="growth-skill-enhance-info">
                  <div className="growth-skill-enhance-left">
                    <div className="growth-skill-enhance-header">
                      <span className="growth-skill-enhance-name">{sk.name}</span>
                      <span className="growth-skill-enhance-level">+{level}</span>
                    </div>
                    <div className="growth-skill-enhance-row">
                      <span className="growth-skill-enhance-label">当前：</span>
                      <span className="growth-skill-enhance-val">{renderSkillDesc(skillId, level)}</span>
                    </div>
                    {level > 0 && (
                      <div className="growth-skill-enhance-row">
                        <span className="growth-skill-enhance-label">重置后：</span>
                        <span className="growth-skill-enhance-val next">{renderSkillDesc(skillId, 0)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="growth-skill-enhance-actions">
                  {level > 0 ? (
                    <button
                      className={`growth-reset-btn ${!canReset ? 'disabled' : ''}`}
                      disabled={!canReset}
                      title={!canReset ? (resetCount <= 0 ? '需要还原石' : '未强化') : `返还 ${refund} 成长点`}
                      onClick={() => setResetSlotIndex(idx)}
                    >
                      <img src={BACKPACK_ITEM_ART.reset_stone} alt="" /> 重置 {resetCount > 0 && `×${resetCount}`}
                    </button>
                  ) : (
                    <span className="growth-skill-max">未强化</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>


        {/* 重置确认弹窗 */}
        {resetSlotIndex !== null && (
          <div className="growth-modal-overlay" onClick={() => setResetSlotIndex(null)}>
            <div className="growth-modal" onClick={(e) => e.stopPropagation()}>
              <h3>重置：{getSkill(selectedUnit.skills[resetSlotIndex])?.name}</h3>
              <div className="growth-modal-content">
                <p>当前等级：+{getSkillEnhanceLevel(selectedUnit, resetSlotIndex)}</p>
                <p>返还成长点：{Math.ceil(getSkillEnhanceTotalCost(getSkillEnhanceLevel(selectedUnit, resetSlotIndex)) * 0.5)} 点</p>
                <p>消耗：1 个还原石（剩余 {resetCount - 1} 个）</p>
              </div>
              <div className="growth-modal-actions">
                <button
                  className="primary btn"
                  onClick={() => {
                    dispatch({ type: 'PROF_SKILL_ENHANCE_RESET', uid: selectedUnit.uid, slotIndex: resetSlotIndex });
                    setResetSlotIndex(null);
                  }}
                >
                  确认重置
                </button>
                <button className="btn" onClick={() => setResetSlotIndex(null)}>
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
      </TrainingWorkbench>
    );
  }

  return <TrainingWorkbench state={state} dispatch={dispatch} title="还原石 · 技能重置" subtitle="重置技能强化，按原规则返还成长点" onSelect={unit => setSelectedUid(unit.uid)} onClear={() => setSelectedUid(null)} />;
}

function renderSkillDesc(skillId: string, level: number): string {
  const sk = getSkill(skillId);
  if (!sk) return '';
  const bonus = getSkillEnhanceBonus(skillId, level);
  const parts: string[] = [];
  if (sk.damage) parts.push(`${sk.damage + bonus.damageBonus} 伤害`);
  if (sk.heal) parts.push(`${sk.heal + bonus.healBonus} 治疗`);
  const hits = (sk.hits ?? 1) + bonus.hitsBonus;
  if (hits > 1) parts.push(`${hits} 段`);
  if (sk.effects && sk.effects.length > 0) {
    for (const e of sk.effects) {
      const val = e.value + bonus.effectBonus;
      if (e.kind === 'shield') parts.push(`${val} 护盾`);
      else if (e.kind === 'burn') parts.push(`灼烧${val}层`);
      else if (e.kind === 'poison') parts.push(`中毒${val}层`);
      else if (e.kind === 'stun') parts.push(`眩晕${e.turns}回合`);
      else if (e.kind === 'taunt') parts.push(`嘲讽${e.turns}回合`);
      else if (e.kind === 'spdDown') parts.push(`减速${val}`);
      else if (e.kind === 'atkDown') parts.push(`降攻${val}`);
      else if (e.kind === 'thorns') parts.push(`荆棘反伤${val}`);
      else if (e.kind === 'skillSeal') parts.push(`封印${e.value}技能`);
      else if (e.kind === 'shadowMark') parts.push(`暗印${val}层`);
      else if (e.kind === 'fear') parts.push(`恐惧${e.value}层`);
    }
  }
  return parts.join(' · ');
}

function getSkillEnhanceTotalCost(level: number): number {
  const ENHANCE_COST_TABLE = [8, 10, 12];
  let total = 0;
  for (let i = 0; i < level && i < ENHANCE_COST_TABLE.length; i++) {
    total += ENHANCE_COST_TABLE[i];
  }
  return total;
}
