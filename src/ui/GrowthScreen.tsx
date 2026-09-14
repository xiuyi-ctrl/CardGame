/**
 * 熟练度远征模式 - 成长点分配界面
 * 玩家在此界面为宠物分配成长点
 */
import { useState } from 'react';
import type { Dispatch } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import type { Unit } from '../game/types';
import { PetIcon } from './components';
import {
  proficiencyDisplay,
  getAvailableGrowthChoices,
  applyGrowthChoice,
  type GrowthChoice,
} from '../game/core/proficiency';

interface Props {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}

export function GrowthScreen({ state, dispatch }: Props) {
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const roster = state.roster;
  const selectedUnit = roster.find((u) => u.uid === selectedUid);

  const handleGrowthChoice = (unit: Unit, choice: GrowthChoice) => {
    const success = applyGrowthChoice(unit, choice);
    if (success) {
      const label =
        choice.kind === 'hp' ? `生命 +${choice.amount}` :
        choice.kind === 'spd' ? `速度 +${choice.amount}` :
        choice.kind === 'slot4' ? '解锁第4技能槽' :
        choice.kind === 'slot5' ? '解锁第5技能槽' :
        '技能替换点已消耗';
      setMessage(`${unit.name}：${label}`);
      // 触发重新渲染
      dispatch({ type: 'SHOW_TOAST', msg: `${unit.name} 获得 ${label}`, kind: 'success' });
    }
  };

  return (
    <div className="screen growth-screen">
      <h2>📈 成长点分配</h2>
      <p className="growth-hint">选择一只宠物，消耗成长点提升其能力</p>

      {message && <div className="growth-message">{message}</div>}

      <div className="growth-roster">
        {roster.map((u) => {
          const prof = u.proficiency ?? 0;
          const display = proficiencyDisplay(prof);
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
                <div className="growth-pet-level">
                  Lv.{display.level} ({display.current}/{display.toNext})
                </div>
                <div className="growth-pet-gp">成长点: {gp}</div>
                <div className="growth-pet-stats">
                  HP:{u.maxHp} SPD:{u.spd}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedUnit && (
        <div className="growth-choices">
          <h3>为 {selectedUnit.name} 选择成长：</h3>
          <div className="growth-choice-list">
            {getAvailableGrowthChoices(selectedUnit).map((choice, i) => {
              const label =
                choice.kind === 'hp' ? `生命 +${choice.amount}` :
                choice.kind === 'spd' ? `速度 +${choice.amount}` :
                choice.kind === 'slot4' ? '解锁第4技能槽 (2点)' :
                choice.kind === 'slot5' ? '解锁第5技能槽 (3点)' :
                '替换技能 (1点)';
              return (
                <button
                  key={i}
                  className="growth-choice-btn"
                  onClick={() => handleGrowthChoice(selectedUnit, choice)}
                >
                  {label}
                </button>
              );
            })}
            {getAvailableGrowthChoices(selectedUnit).length === 0 && (
              <div className="growth-no-choices">没有可用的成长选项</div>
            )}
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
