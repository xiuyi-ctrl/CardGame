/**
 * 成长远征模式 - 铁匠铺界面
 * 功能：为宠物强化技能效果（消耗成长点）
 */
import { useState } from 'react';
import type { Dispatch } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { PetIcon } from './components';
import {
  getSkillEnhanceCost,
  getSkillEnhanceLevel,
  getSkillEnhanceMaxLevel,
  getSkillEnhanceBonus,
} from '../game/core/growth';
import { getSkill } from '../game/data/skills';

interface Props {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}

export function BlacksmithScreen({ state, dispatch }: Props) {
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [enhanceSlotIndex, setEnhanceSlotIndex] = useState<number | null>(null);
  const [resetSlotIndex, setResetSlotIndex] = useState<number | null>(null);
  const [enhanceStoneSlotIndex, setEnhanceStoneSlotIndex] = useState<number | null>(null);

  const roster = state.roster;
  const selectedUnit = roster.find((u) => u.uid === selectedUid);

  // 技能强化全屏界面
  if (selectedUnit) {
    return (
      <div className="screen growth-screen">
        <h2>🔨 铁匠铺</h2>
        <p className="growth-hint">为 {selectedUnit.name} 强化技能（剩余成长点: {selectedUnit.growthPoints ?? 0}）</p>

        <div className="growth-skill-enhance-list">
          {selectedUnit.skills.map((skillId, idx) => {
            const sk = getSkill(skillId);
            if (!sk) return null;
            const level = getSkillEnhanceLevel(selectedUnit, idx);
            const maxLevel = getSkillEnhanceMaxLevel(skillId);
            const cost = getSkillEnhanceCost(selectedUnit, idx);
            const canEnhance = level < maxLevel && (selectedUnit.growthPoints ?? 0) >= cost;

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
                    {level < maxLevel && (
                      <div className="growth-skill-enhance-row">
                        <span className="growth-skill-enhance-label">强化后：</span>
                        <span className="growth-skill-enhance-val next">{renderSkillDesc(skillId, level + 1)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="growth-skill-enhance-actions">
                  {level < maxLevel ? (
                    <>
                      <button
                        className={`growth-enhance-btn ${!canEnhance ? 'disabled' : ''}`}
                        disabled={!canEnhance}
                        onClick={() => setEnhanceSlotIndex(idx)}
                      >
                        强化 ({cost}点)
                      </button>
                      {(state.inventory['skill_enhance_stone'] ?? 0) > 0 && (
                        <button
                          className="growth-enhance-stone-btn"
                          onClick={() => setEnhanceStoneSlotIndex(idx)}
                        >
                          强化石 ⚒️×{state.inventory['skill_enhance_stone']}
                        </button>
                      )}
                    </>
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
                      重置 {(state.inventory['reset_stone'] ?? 0) > 0 && `×${state.inventory['reset_stone']}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="growth-actions">
          <button className="btn" onClick={() => setSelectedUid(null)}>
            返回
          </button>
          <button className="btn" onClick={() => dispatch({ type: 'BACK_TO_MAP' })}>
            返回地图
          </button>
        </div>

        {/* 强化确认弹窗 */}
        {enhanceSlotIndex !== null && (
          <div className="growth-modal-overlay" onClick={() => setEnhanceSlotIndex(null)}>
            <div className="growth-modal" onClick={(e) => e.stopPropagation()}>
              <h3>强化：{getSkill(selectedUnit.skills[enhanceSlotIndex])?.name}（当前 +{getSkillEnhanceLevel(selectedUnit, enhanceSlotIndex)}）</h3>
              <div className="growth-modal-content">
                <p>当前：{renderSkillEffect(selectedUnit.skills[enhanceSlotIndex], getSkillEnhanceLevel(selectedUnit, enhanceSlotIndex))}</p>
                <p>强化后：{renderSkillEffect(selectedUnit.skills[enhanceSlotIndex], getSkillEnhanceLevel(selectedUnit, enhanceSlotIndex) + 1)}</p>
                <p>消耗：{getSkillEnhanceCost(selectedUnit, enhanceSlotIndex)} 成长点</p>
                <p>剩余成长点：{selectedUnit.growthPoints ?? 0}</p>
              </div>
              <div className="growth-modal-actions">
                <button
                  className="primary btn"
                  onClick={() => {
                    dispatch({ type: 'PROF_SKILL_ENHANCE', uid: selectedUnit.uid, slotIndex: enhanceSlotIndex });
                    setEnhanceSlotIndex(null);
                  }}
                >
                  确认
                </button>
                <button className="btn" onClick={() => setEnhanceSlotIndex(null)}>
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 技能强化石确认弹窗 */}
        {enhanceStoneSlotIndex !== null && (
          <div className="growth-modal-overlay" onClick={() => setEnhanceStoneSlotIndex(null)}>
            <div className="growth-modal" onClick={(e) => e.stopPropagation()}>
              <h3>使用技能强化石：{getSkill(selectedUnit.skills[enhanceStoneSlotIndex])?.name}</h3>
              <div className="growth-modal-content">
                <p>当前：{renderSkillEffect(selectedUnit.skills[enhanceStoneSlotIndex], getSkillEnhanceLevel(selectedUnit, enhanceStoneSlotIndex))}</p>
                <p>强化后：{renderSkillEffect(selectedUnit.skills[enhanceStoneSlotIndex], getSkillEnhanceLevel(selectedUnit, enhanceStoneSlotIndex) + 1)}</p>
                <p>消耗：1 个技能强化石（剩余 {(state.inventory['skill_enhance_stone'] ?? 0) - 1} 个）</p>
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
      </div>
    );
  }

  // 选择宠物界面
  return (
    <div className="screen growth-screen">
      <h2>🔨 铁匠铺</h2>
      <p className="growth-hint">选择一只宠物，为其强化技能效果</p>

      <div className="growth-roster">
        {roster.map((u) => {
          const gp = u.growthPoints ?? 0;
          return (
            <div
              key={u.uid}
              className={`growth-pet-card ${selectedUid === u.uid ? 'selected' : ''}`}
              onClick={() => setSelectedUid(u.uid)}
            >
              <PetIcon image={u.image} emoji={u.emoji} name={u.name} />
              <div className="growth-pet-info">
                <div className="growth-pet-name">{u.name}</div>
                <div className="growth-pet-gp">成长点: {gp}</div>
                <div className="growth-pet-stats">
                  HP:{u.maxHp} SPD:{u.spd}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="growth-actions">
        <button className="btn" onClick={() => dispatch({ type: 'BACK_TO_MAP' })}>
          返回地图
        </button>
      </div>
    </div>
  );
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
