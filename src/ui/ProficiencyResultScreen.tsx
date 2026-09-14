/**
 * 熟练度远征模式 - 结算界面
 * 显示本局统计数据和结果
 */
import type { Dispatch } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { PetIcon } from './components';
import { proficiencyDisplay } from '../game/core/proficiency';

interface Props {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}

export function ProficiencyResultScreen({ state, dispatch }: Props) {
  const stats = state.proficiencyStats;
  const won = state.screen === 'victory';
  const roster = state.roster;
  const layer = state.currentLayer ?? 0;

  // 找到最高熟练度
  let maxProf = 0;
  let maxProfName = '';
  for (const u of roster) {
    const prof = u.proficiency ?? 0;
    if (prof > maxProf) {
      maxProf = prof;
      maxProfName = u.name;
    }
  }
  const maxDisplay = proficiencyDisplay(maxProf);

  return (
    <div className="center-col">
      <div style={{ fontSize: 64 }}>{won ? '🏆' : '💀'}</div>
      <div className="title-name">
        {won ? '熟练度远征 · 胜利！' : '熟练度远征 · 失败'}
      </div>
      <p className="card-sub">
        {won
          ? '你击败了熟练之主，完成了远征！'
          : `你在第 ${layer} 层倒下了`}
      </p>

      <div className="result-stats">
        <div className="result-stat-row">
          <span>到达层数</span>
          <span>{layer} / 15</span>
        </div>
        <div className="result-stat-row">
          <span>总战斗场次</span>
          <span>{(stats?.battlesWon ?? 0) + (stats?.battlesLost ?? 0)}</span>
        </div>
        <div className="result-stat-row">
          <span>战斗胜利</span>
          <span>{stats?.battlesWon ?? 0}</span>
        </div>
        <div className="result-stat-row">
          <span>总击杀数</span>
          <span>{stats?.kills ?? 0}</span>
        </div>
        <div className="result-stat-row">
          <span>最高熟练度</span>
          <span>{maxProfName} Lv.{maxDisplay.level}</span>
        </div>
      </div>

      <div className="result-team">
        <div className="result-team-title">最终队伍</div>
        <div className="result-team-list">
          {roster.map((u) => {
            const prof = u.proficiency ?? 0;
            const display = proficiencyDisplay(prof);
            return (
              <span key={u.uid} className="chip">
                <PetIcon image={u.image} emoji={u.emoji} name={u.name} /> {u.name} Lv.{display.level}
              </span>
            );
          })}
        </div>
      </div>

      <div className="panel-row" style={{ flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 16 }}>
        <button className="primary big-btn" onClick={() => dispatch({ type: 'RETRY', seed: Date.now() })}>
          再来一次
        </button>
        <button className="big-btn" onClick={() => dispatch({ type: 'TITLE' })}>
          返回标题
        </button>
      </div>
    </div>
  );
}
