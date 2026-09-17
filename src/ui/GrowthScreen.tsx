/**
 * 成长远征模式 - 成长点分配界面
 * 玩家在此界面为宠物分配成长点
 */
import { useState } from 'react';
import type { Dispatch } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import type { Unit } from '../game/types';
import { PetIcon } from './components';
import {
  getAllGrowthChoices,
  growthChoiceCost,
  applyGrowthChoice,
  SLOT3_COST,
  SLOT4_COST,
  SLOT5_COST,
  REROLL_COST,
  getSkillEnhanceCost,
  getSkillEnhanceLevel,
  getSkillEnhanceMaxLevel,
  getSkillEnhanceBonus,
  type GrowthChoice,
} from '../game/core/growth';
import { getSkill } from '../game/data/skills';

interface Props {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}

export function GrowthScreen({ state, dispatch }: Props) {
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showEnhance, setShowEnhance] = useState(false);
  const [enhanceSlotIndex, setEnhanceSlotIndex] = useState<number | null>(null);
  const [resetSlotIndex, setResetSlotIndex] = useState<number | null>(null);

  const roster = state.roster;
  const selectedUnit = roster.find((u) => u.uid === selectedUid);
  const pending = state.specialPending;
  const isShopPending = pending?.kind === 'shopGrantGrowthPoint' || pending?.kind === 'shopStatBoost' || pending?.kind === 'shopSlotUnlock' || pending?.kind === 'shopForget' || pending?.kind === 'legendSkill';
  const isBossNode = state.map.boss[state.currentNodeId] !== undefined;

  const handleGrowthChoice = (unit: Unit, choice: GrowthChoice) => {
    if (choice.kind === 'slot3' || choice.kind === 'slot4' || choice.kind === 'slot5') {
      dispatch({ type: 'PROF_SLOT_UNLOCK', uid: unit.uid, slot: choice.kind === 'slot3' ? 3 : choice.kind === 'slot4' ? 4 : 5 });
      return;
    }
    if (choice.kind === 'reroll') {
      dispatch({ type: 'PROF_SKILL_REPLACE_START', uid: unit.uid });
      return;
    }
    const updatedUnit = applyGrowthChoice(unit, choice);
    if (updatedUnit) {
      const label =
        choice.kind === 'hp' ? `生命 +${choice.amount}` :
        choice.kind === 'spd' ? `速度 +${choice.amount}` :
        '';
      setMessage(`${unit.name}：${label}`);
      dispatch({ type: 'PROF_GROWTH_APPLY', uid: unit.uid, updatedUnit });
      dispatch({ type: 'SHOW_TOAST', msg: `${unit.name} 获得 ${label}`, kind: 'success' });
    }
  };

  const handlePetClick = (unit: Unit) => {
    if (isShopPending) {
      dispatch({ type: 'PROF_SHOP_EFFECT', uid: unit.uid });
      return;
    }
    setSelectedUid(unit.uid);
  };

  const getHintText = () => {
    if (isShopPending && pending) {
      if (pending.kind === 'shopGrantGrowthPoint') return `选择一只宠物获得 ${pending.amount} 成长点`;
      if (pending.kind === 'shopStatBoost') return '选择一只宠物永久 +5 生命 或 +2 速度';
      if (pending.kind === 'shopSlotUnlock') return '选择一只宠物解锁技能槽';
      if (pending.kind === 'shopForget') return '选择一只宠物重置成长点';
      if (pending.kind === 'legendSkill') return '选择一只宠物学习传奇技能';
    }
    return '选择一只宠物，消耗成长点提升其能力';
  };

  // 技能强化全屏界面
  if (showEnhance && selectedUnit) {
    return (
      <div className="screen growth-screen">
        <h2>⚔️ 技能强化</h2>
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
                    <button
                      className={`growth-enhance-btn ${!canEnhance ? 'disabled' : ''}`}
                      disabled={!canEnhance}
                      onClick={() => setEnhanceSlotIndex(idx)}
                    >
                      强化 ({cost}点)
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
                      重置 {(state.inventory['reset_stone'] ?? 0) > 0 && `×${state.inventory['reset_stone']}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="growth-actions">
          <button className="btn" onClick={() => { setShowEnhance(false); setEnhanceSlotIndex(null); setResetSlotIndex(null); }}>
            返回
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

  // 主界面
  return (
    <div className="screen growth-screen">
      <h2>📈 成长点分配</h2>
      <p className="growth-hint">{getHintText()}</p>

      {message && <div className="growth-message">{message}</div>}

      <div className="growth-roster">
        {roster.map((u) => {
          const gp = u.growthPoints ?? 0;
          return (
            <div
              key={u.uid}
              className={`growth-pet-card ${selectedUid === u.uid ? 'selected' : ''}`}
              onClick={() => handlePetClick(u)}
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

      {selectedUnit && !isShopPending && (
        <div className="growth-choices">
          <h3>为 {selectedUnit.name} 选择成长：</h3>
          <div className="growth-choice-list">
            {getAllGrowthChoices(selectedUnit).map((choice, i) => {
              const hpBonus = selectedUnit.bonusStats?.hp ?? 0;
              const spdBonus = selectedUnit.bonusStats?.spd ?? 0;
              const cost = growthChoiceCost(choice, hpBonus, spdBonus);
              const canAfford = (selectedUnit.growthPoints ?? 0) >= cost;
              const label =
                choice.kind === 'hp' ? `生命 +${choice.amount} (${cost}点)` :
                choice.kind === 'spd' ? `速度 +${choice.amount} (${cost}点)` :
                choice.kind === 'slot3' ? `解锁第3技能槽 (${SLOT3_COST}点)` :
                choice.kind === 'slot4' ? `解锁第4技能槽 (${SLOT4_COST}点)` :
                choice.kind === 'slot5' ? `解锁第5技能槽 (${SLOT5_COST}点)` :
                `替换技能 (${REROLL_COST}点)`;
              return (
                <button
                  key={i}
                  className={`growth-choice-btn ${!canAfford ? 'disabled' : ''}`}
                  disabled={!canAfford}
                  onClick={() => handleGrowthChoice(selectedUnit, choice)}
                >
                  {label}
                </button>
              );
            })}
            <button
              className="growth-choice-btn growth-enhance-entry-btn"
              onClick={() => setShowEnhance(true)}
            >
              ⚔️ 技能强化
            </button>
          </div>
        </div>
      )}

      <div className="growth-actions">
        {isShopPending ? (
          <button className="btn" onClick={() => dispatch({ type: 'CANCEL_GROWTH_ITEM' })}>
            取消使用
          </button>
        ) : isBossNode ? (
          <button className="primary btn" onClick={() => dispatch({ type: 'NEXT_NODE' })}>
            继续前进 →
          </button>
        ) : (
          <button className="btn" onClick={() => dispatch({ type: 'BACK_TO_MAP' })}>
            返回地图
          </button>
        )}
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
