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
  type GrowthChoice,
} from '../game/core/growth';

interface Props {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}

export function GrowthScreen({ state, dispatch }: Props) {
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const roster = state.roster;
  const selectedUnit = roster.find((u) => u.uid === selectedUid);
  const pending = state.specialPending;
  const isShopPending = pending?.kind === 'shopGrantGrowthPoint' || pending?.kind === 'shopStatBoost' || pending?.kind === 'shopSlotUnlock' || pending?.kind === 'shopForget';

  const handleGrowthChoice = (unit: Unit, choice: GrowthChoice) => {
    // 技能槽解锁：路由到技能选择界面（由 reducer 处理 state 转换）
    if (choice.kind === 'slot3' || choice.kind === 'slot4' || choice.kind === 'slot5') {
      dispatch({ type: 'PROF_SLOT_UNLOCK', uid: unit.uid, slot: choice.kind === 'slot3' ? 3 : choice.kind === 'slot4' ? 4 : 5 });
      return;
    }
    // 技能替换：路由到替换技能界面
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
    if (isShopPending) {
      if (pending.kind === 'shopGrantGrowthPoint') return `选择一只宠物获得 ${pending.amount} 成长点`;
      if (pending.kind === 'shopStatBoost') return '选择一只宠物永久 +5 生命 或 +2 速度';
      if (pending.kind === 'shopSlotUnlock') return '选择一只宠物解锁技能槽';
      if (pending.kind === 'shopForget') return '选择一只宠物重置成长点';
    }
    return '选择一只宠物，消耗成长点提升其能力';
  };

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
              const cost = growthChoiceCost(choice);
              const canAfford = (selectedUnit.growthPoints ?? 0) >= cost;
              const label =
                choice.kind === 'hp' ? `生命 +${choice.amount} (2点)` :
                choice.kind === 'spd' ? `速度 +${choice.amount} (2点)` :
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
          </div>
        </div>
      )}

      <div className="growth-actions">
        <button className="btn" onClick={() => dispatch({ type: 'BACK_TO_MAP' })}>
          返回地图
        </button>
      </div>
    </div>
  );
}
