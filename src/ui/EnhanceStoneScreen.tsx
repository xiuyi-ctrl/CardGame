/**
 * 技能强化石专属界面（从背包使用）
 * 功能：为宠物强化技能效果（消耗技能强化石，不消耗成长点）
 */
import { useState } from 'react';
import type { Dispatch } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { TrainingWorkbench } from './ProficiencyArt';
import { MobileDetails } from './MobileDetails';
import { BACKPACK_ITEM_ART } from './backpackItemArt';
import {
  getSkillEnhanceLevel,
  getSkillEnhanceMaxLevel,
  getSkillEnhanceBonus,
} from '../game/core/growth';
import { getSkill } from '../game/data/skills';

interface Props {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}

export function EnhanceStoneScreen({ state, dispatch }: Props) {
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [enhanceStoneSlotIndex, setEnhanceStoneSlotIndex] = useState<number | null>(null);
  const [resetSlotIndex, setResetSlotIndex] = useState<number | null>(null);

  const roster = state.roster;
  const selectedUnit = roster.find((u) => u.uid === selectedUid);
  const stoneCount = state.inventory['skill_enhance_stone'] ?? 0;

  if (selectedUnit) {
    return (
      <TrainingWorkbench state={state} dispatch={dispatch} title="技能强化石" subtitle="使用强化石提升技能，不消耗成长点" unit={selectedUnit} onSelect={unit => setSelectedUid(unit.uid)} onClear={() => setSelectedUid(null)}>

        <div className="growth-skill-enhance-list">
          {selectedUnit.skills.map((skillId, idx) => {
            const sk = getSkill(skillId);
            if (!sk) return null;
            const level = getSkillEnhanceLevel(selectedUnit, idx);
            const maxLevel = getSkillEnhanceMaxLevel(skillId);
            const canEnhance = level < maxLevel && stoneCount > 0;

            return (
              <div key={idx} className="growth-skill-enhance-item">
                <div className="growth-skill-enhance-info">
                  <div className="growth-skill-enhance-left">
                    <div className="growth-skill-enhance-header">
                      <span className="growth-skill-enhance-name">{sk.name}</span>
                      <span className="growth-skill-enhance-level">+{level}</span>
                    </div>
                    <MobileDetails label={`${sk.name}强化对比`}><div className="growth-skill-enhance-row">
                      <span className="growth-skill-enhance-label">当前：</span>
                      <span className="growth-skill-enhance-val">{renderSkillDesc(skillId, level)}</span>
                    </div>
                    {level < maxLevel && (
                      <div className="growth-skill-enhance-row">
                        <span className="growth-skill-enhance-label">强化后：</span>
                        <span className="growth-skill-enhance-val next">{renderSkillDesc(skillId, level + 1)}</span>
                      </div>
                    )}</MobileDetails>
                  </div>
                </div>
                <div className="growth-skill-enhance-actions">
                  {level < maxLevel ? (
                    <button
                      className={`growth-enhance-stone-btn ${!canEnhance ? 'disabled' : ''}`}
                      disabled={!canEnhance}
                      title={!canEnhance ? (stoneCount <= 0 ? '需要技能强化石' : '已满级') : `消耗 1 个技能强化石`}
                      onClick={() => setEnhanceStoneSlotIndex(idx)}
                    >
                      <img src={BACKPACK_ITEM_ART.skill_enhance_stone} alt="" /> 强化 · 1个
                    </button>
                  ) : (
                    <span className="growth-skill-max">已满级</span>
                  )}
                  {level > 0 && (
                    <button
                      className="growth-reset-btn"
                      disabled={(state.inventory['reset_stone'] ?? 0) <= 0}
                      title={(state.inventory['reset_stone'] ?? 0) <= 0 ? '需要「还原石」才能重置' : '消耗 1 个还原石重置技能强化'}
                      onClick={() => setResetSlotIndex(idx)}
                    >
                      <img src={BACKPACK_ITEM_ART.reset_stone} alt="" /> 重置 {(state.inventory['reset_stone'] ?? 0) > 0 && `×${state.inventory['reset_stone']}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>


        {/* 技能强化石确认弹窗 */}
        {enhanceStoneSlotIndex !== null && (
          <div className="growth-modal-overlay" onClick={() => setEnhanceStoneSlotIndex(null)}>
            <div className="growth-modal" onClick={(e) => e.stopPropagation()}>
              <h3>使用技能强化石</h3>
              <div className="growth-modal-skill">{getSkill(selectedUnit.skills[enhanceStoneSlotIndex])?.name}<span>+{getSkillEnhanceLevel(selectedUnit, enhanceStoneSlotIndex)} → +{getSkillEnhanceLevel(selectedUnit, enhanceStoneSlotIndex) + 1}</span></div>
              <div className="growth-modal-content has-comparison">
                <p><strong>当前</strong>{renderSkillEffect(selectedUnit.skills[enhanceStoneSlotIndex], getSkillEnhanceLevel(selectedUnit, enhanceStoneSlotIndex))}</p>
                <p><strong>强化后</strong>{renderSkillEffect(selectedUnit.skills[enhanceStoneSlotIndex], getSkillEnhanceLevel(selectedUnit, enhanceStoneSlotIndex) + 1)}</p>
                <p>消耗：1 个技能强化石（剩余 {stoneCount - 1} 个）</p>
                <p>无需消耗成长点</p>
              </div>
              <div className="growth-modal-actions">
                <button
                  className="primary btn"
                  onClick={() => {
                    dispatch({ type: 'PROF_SKILL_ENHANCE_STONE', uid: selectedUnit.uid, slotIndex: enhanceStoneSlotIndex });
                    setEnhanceStoneSlotIndex(null);
                  }}
                >
                  确认
                </button>
                <button className="btn" onClick={() => setEnhanceStoneSlotIndex(null)}>
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 重置确认弹窗 */}
        {resetSlotIndex !== null && (
          <div className="growth-modal-overlay" onClick={() => setResetSlotIndex(null)}>
            <div className="growth-modal" onClick={(e) => e.stopPropagation()}>
              <h3>重置：{getSkill(selectedUnit.skills[resetSlotIndex])?.name}</h3>
              <div className="growth-modal-content">
                <p>当前等级：+{getSkillEnhanceLevel(selectedUnit, resetSlotIndex)}</p>
                <p>返还成长点：{Math.ceil(getSkillEnhanceTotalCost(getSkillEnhanceLevel(selectedUnit, resetSlotIndex)) * 0.5)} 点</p>
                <p>消耗：1 个还原石（剩余 {(state.inventory['reset_stone'] ?? 0) - 1} 个）</p>
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

  return <TrainingWorkbench state={state} dispatch={dispatch} title="技能强化石" subtitle="使用强化石提升技能，不消耗成长点" onSelect={unit => setSelectedUid(unit.uid)} onClear={() => setSelectedUid(null)} />;
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

function renderSkillEffect(skillId: string, level: number): string {
  const sk = getSkill(skillId);
  if (!sk) return '';
  if (level <= 0) return sk.desc;
  const bonus = getSkillEnhanceBonus(skillId, level);
  const parts: string[] = [];
  if (bonus.damageBonus > 0) parts.push(`伤害+${bonus.damageBonus}`);
  if (bonus.healBonus > 0) parts.push(`治疗+${bonus.healBonus}`);
  if (bonus.hitsBonus > 0) parts.push(`段数+${bonus.hitsBonus}`);
  if (bonus.effectBonus > 0) parts.push(`效果+${bonus.effectBonus}`);
  return parts.length > 0 ? `${sk.desc}（${parts.join('，')}）` : sk.desc;
}

function getSkillEnhanceTotalCost(level: number): number {
  const ENHANCE_COST_TABLE = [8, 10, 12];
  let total = 0;
  for (let i = 0; i < level && i < ENHANCE_COST_TABLE.length; i++) {
    total += ENHANCE_COST_TABLE[i];
  }
  return total;
}
