import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';

interface Props {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

export function Arena3Screen({ state, dispatch }: Props) {
  const gold = state.gold;
  return (
    <div className="screen">
      <div className="section-title">🏟️ 竞技场</div>
      <div style={{ display: 'flex', flexDirection: 'row', gap: 12, padding: '0 16px', marginTop: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        {/* 模拟战 */}
        <div
          className="reward-card"
          style={{ cursor: 'pointer', padding: 16, border: '2px solid #4a9eff', borderRadius: 8, background: 'rgba(74,158,255,0.1)', flex: '1 1 0', minWidth: 200, maxWidth: 280 }}
          onClick={() => dispatch({ type: 'ARENA3_MODE', mode: 'simulation' })}
        >
          <div style={{ fontSize: 18, fontWeight: 'bold', color: '#4a9eff', marginBottom: 8 }}>🎬 模拟战</div>
          <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.5 }}>
            与自己的镜像队伍对战。<br/>
            <span style={{ color: '#6fd8a8' }}>不消耗生命、不产生死亡</span>。<br/>
            胜利 → 全体存活生物获得 <span style={{ color: '#e8c26a' }}>5 成长点</span>。
          </div>
        </div>
        {/* 挑战赛 */}
        <div
          className="reward-card"
          style={{ cursor: 'pointer', padding: 16, border: '2px solid #e8c26a', borderRadius: 8, background: 'rgba(232,194,106,0.1)', flex: '1 1 0', minWidth: 200, maxWidth: 280 }}
          onClick={() => dispatch({ type: 'ARENA3_MODE', mode: 'challenge' })}
        >
          <div style={{ fontSize: 18, fontWeight: 'bold', color: '#e8c26a', marginBottom: 8 }}>⚔️ 挑战赛</div>
          <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.5 }}>
            与 3 只精英级敌人对战。<br/>
            <span style={{ color: '#ff6b6b' }}>正常战斗规则（可死亡）</span>。<br/>
            胜利 → 获得 <span style={{ color: '#e8c26a' }}>50 金币</span> + 全体 <span style={{ color: '#e8c26a' }}>+3 成长点</span>。
          </div>
        </div>
        {/* 表演赛 */}
        <div
          className="reward-card"
          style={{
            cursor: gold >= 20 ? 'pointer' : 'not-allowed',
            padding: 16,
            border: `2px solid ${gold >= 20 ? '#b08dff' : '#555'}`,
            borderRadius: 8,
            background: gold >= 20 ? 'rgba(176,141,255,0.1)' : 'rgba(50,50,50,0.3)',
            opacity: gold >= 20 ? 1 : 0.6,
            flex: '1 1 0',
            minWidth: 200,
            maxWidth: 280,
          }}
          onClick={() => gold >= 20 && dispatch({ type: 'ARENA3_MODE', mode: 'exhibition' })}
        >
          <div style={{ fontSize: 18, fontWeight: 'bold', color: gold >= 20 ? '#b08dff' : '#555', marginBottom: 8 }}>🎭 表演赛</div>
          <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.5 }}>
            消耗 <span style={{ color: '#e8c26a' }}>20 金币</span>，选择 1 只宠物获得 <span style={{ color: '#e8c26a' }}>5 成长点</span>。<br/>
            <span style={{ color: '#999', fontSize: 12 }}>当前金币：{gold}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
