import { useEffect, useReducer, useState } from 'react';
import type { Dispatch } from 'react';
import { gameReducer, createInitialState, newSeed } from '../game/state/reducer';
import type { GameAction } from '../game/state/reducer';
import type { GameState } from '../game/state/game';
import { ROSTER_MAX, FIELD_MAX, pendingEvolve, type MapNode } from '../game/state/game';
import { STARTING_CHOICES, getMonster } from '../game/data/monsters';
import { FOODS } from '../game/data/foods';
import { getSkill } from '../game/data/skills';
import { computeStats } from '../game/core/battle';
import { UnitCard, elementStyle } from './components';
import { BattleScreen } from './BattleScreen';
import { loadSave, persistSave, quitGame } from './persistence';

const NODE_ICON: Record<MapNode['type'], string> = {
  battle: '⚔️',
  elite: '💀',
  rest: '🛌',
  shop: '🏪',
  event: '❓',
  boss: '👑',
};

const NO_SAVE_SCREENS = ['title', 'starter', 'gameover', 'victory'];

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);

  useEffect(() => {
    if (!NO_SAVE_SCREENS.includes(state.screen)) {
      const t = setTimeout(() => {
        void persistSave(state);
      }, 400);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <div className="screen">
      {state.screen === 'title' && <HomeScreen dispatch={dispatch} />}
      {state.screen === 'starter' && <StarterScreen dispatch={dispatch} />}
      {state.screen === 'map' && <MapScreen state={state} dispatch={dispatch} />}
      {state.screen === 'battle' && <BattleScreen state={state} dispatch={dispatch} />}
      {state.screen === 'reward' && <RewardScreen state={state} dispatch={dispatch} />}
      {state.screen === 'roster' && <RosterScreen state={state} dispatch={dispatch} />}
      {state.screen === 'shop' && <ShopScreen state={state} dispatch={dispatch} />}
      {state.screen === 'rest' && <RestScreen dispatch={dispatch} />}
      {state.screen === 'event' && <EventScreen state={state} dispatch={dispatch} />}
      {state.screen === 'gameover' && <GameOverScreen state={state} dispatch={dispatch} />}
      {state.screen === 'victory' && <VictoryScreen state={state} dispatch={dispatch} />}
    </div>
  );
}

function HUD({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  return (
    <div className="hud">
      <span className="act">第 {state.act} 层</span>
      <span>
        <span className="chip">👥 {state.field.length}/{FIELD_MAX}</span>
        <span className="chip">💰 {state.gold}</span>
        {Object.entries(state.inventory)
          .filter(([, c]) => c > 0)
          .map(([id, c]) => (
            <span key={id} className="chip">
              {FOODS[id].emoji} {FOODS[id].name}×{c}
            </span>
          ))}
      </span>
      <button
        className="home-btn"
        onClick={() => {
          void persistSave(state);
          dispatch({ type: 'TITLE' });
        }}
      >
        🏠 返回首页
      </button>
    </div>
  );
}

function HomeScreen({ dispatch }: { dispatch: Dispatch<GameAction> }) {
  const [hasSave, setHasSave] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadSave().then((s) => {
      if (!cancelled) setHasSave(s !== null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function onContinue() {
    void loadSave().then((s) => {
      if (s) dispatch({ type: 'LOAD_GAME', state: s });
    });
  }

  return (
    <div className="center-col">
      <div className="title-logo">🐉</div>
      <div className="title-name">驯牌远征</div>
      <div className="title-sub">肉鸽卡牌 · 宠物对战 · 生死相随</div>
      <div className="home-menu">
        <button className="primary big-btn" onClick={() => dispatch({ type: 'STARTER' })}>
          新游戏
        </button>
        <button className="big-btn" onClick={onContinue} disabled={hasSave !== true}>
          {hasSave === null ? '检查存档…' : hasSave ? '继续游戏' : '继续游戏（暂无存档）'}
        </button>
        <button className="big-btn" onClick={quitGame}>
          退出游戏
        </button>
      </div>
    </div>
  );
}

function StarterScreen({ dispatch }: { dispatch: Dispatch<GameAction> }) {
  return (
    <div className="center-col">
      <div className="section-title">选择你的初始伙伴</div>
      <div className="starter-grid">
        {STARTING_CHOICES.map((id) => {
          const sp = getMonster(id);
          const stats = computeStats(id, 1);
          return (
            <div key={id} className="unit-card clickable" style={elementStyle(sp.element)} onClick={() => dispatch({ type: 'START_RUN', starterId: id, seed: newSeed() })}>
              <div className="card-top">
                <span className="emoji">{sp.emoji}</span>
                <span className="elem" style={elementStyle(sp.element)}>
                  属性 {sp.element}
                </span>
              </div>
              <div className="card-name">{sp.name}</div>
              <div className="card-sub">
                生命 {stats.maxHp} · 攻击 {stats.atk} · 速度 {stats.spd}
              </div>
              <div className="skill-list">
                {sp.skills.map((s) => (
                  <span key={s} className="chip">
                    {getSkill(s).name}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MapScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const isFirst = state.currentNodeId === '';
  const optionsRow = isFirst ? state.currentRow : state.currentRow + 1;
  const currentCol = isFirst
    ? null
    : (state.map.layers[state.currentRow]?.find((n) => n.id === state.currentNodeId)?.col ?? null);
  const atStart = state.currentRow === 0;
  const canSelect = (n: MapNode) =>
    currentCol === null ||
    atStart ||
    typeof n.col !== 'number' ||
    typeof currentCol !== 'number' ||
    Math.abs(n.col - currentCol) <= 1;

  return (
    <div className="screen">
      <HUD state={state} dispatch={dispatch} />
      <div className="map-canvas">
        {state.map.layers.map((row, ri) => {
          const isOptionRow = ri === optionsRow;
          const isPast = ri < optionsRow;
          return (
            <div className="map-row" key={ri}>
              {row.map((n) => {
                const isCurrent = n.id === state.currentNodeId;
                const selectable = isOptionRow && canSelect(n);
                const cls = isCurrent ? 'current' : isOptionRow ? (selectable ? 'option' : 'dim') : isPast ? '' : 'dim';
                return (
                  <div
                    key={n.id}
                    className={`node ${cls}`}
                    onClick={selectable ? () => dispatch({ type: 'MOVE', nodeId: n.id }) : undefined}
                  >
                    <span className="nicon">{NODE_ICON[n.type]}</span>
                    <span className="nlabel">{n.label}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="card-sub" style={{ textAlign: 'center' }}>
        选择下一处地点（出发后需走相邻路线；消灭首领后可进入下一层）
      </div>
    </div>
  );
}

function RewardScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  return (
    <div className="screen">
      <div className="section-title">战利品</div>
      <div className="log-history">
        {state.log.slice(0, 8).map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
      <div className="reward-cards">
        {state.rewards.map((r) => (
          <div key={r.id} className="reward-card" onClick={() => dispatch({ type: 'PICK_REWARD', rewardId: r.id })}>
            <div className="ricon">
              {r.kind === 'food' && FOODS[r.foodId ?? 'berry'].emoji}
              {r.kind === 'heal' && '❤️'}
              {r.kind === 'recruit' && getMonster(r.monsterId!).emoji}
              {r.kind === 'gold' && '💰'}
            </div>
            <div className="rtitle">{r.label}</div>
            <div className="rdesc">{r.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RosterScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const toggleField = (uid: string) => {
    const inField = state.field.includes(uid);
    if (inField) {
      dispatch({ type: 'SET_FIELD', uids: state.field.filter((u) => u !== uid) });
    } else if (state.field.length < FIELD_MAX) {
      dispatch({ type: 'SET_FIELD', uids: [...state.field, uid] });
    }
  };

  return (
    <div className="screen">
      <div className="section-title">
        队伍管理（{state.field.length}/{FIELD_MAX} 出战，上限 {ROSTER_MAX} 只）
      </div>
      <div className="panel-row" style={{ marginBottom: 10 }}>
        <span className="card-sub">出战宠物（点击下方宠物卡加入/移除）：</span>
        {state.field.map((uid) => {
          const u = state.roster.find((x) => x.uid === uid);
          return u ? <span className="chip" key={uid}>{u.emoji} {u.name}</span> : null;
        })}
      </div>
      <div className="roster-list">
        {state.roster.map((u) => {
          const inField = state.field.includes(u.uid);
          const pending = pendingEvolve(u);
          return (
            <div key={u.uid} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <UnitCard
                unit={u}
                className={inField ? 'selected' : ''}
                onClick={() => toggleField(u.uid)}
              />
              <div className="panel-row">
                {pending && <span className="chip">🧬 已到进化等级，本场战斗结束进化</span>}
                <button onClick={() => dispatch({ type: 'DISCARD', uid: u.uid })}>释放</button>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
        <button className="primary big-btn" onClick={() => dispatch({ type: 'NEXT_NODE' })}>
          继续前进 →
        </button>
      </div>
    </div>
  );
}

function ShopScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  return (
    <div className="screen">
      <HUD state={state} dispatch={dispatch} />
      <div className="section-title">商人 🏪</div>
      <div className="reward-cards">
        {Object.values(FOODS).map((f) => (
          <div key={f.id} className="reward-card">
            <div className="ricon">{f.emoji}</div>
            <div className="rtitle">{f.name}</div>
            <div className="rdesc">{f.desc}</div>
            <div className="panel-row" style={{ justifyContent: 'center', marginTop: 8 }}>
              <span className="chip">💰 {f.price}</span>
              <button
                className="primary"
                disabled={state.gold < f.price}
                onClick={() => dispatch({ type: 'SHOP_BUY', foodId: f.id })}
              >
                购买
              </button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
        <button className="big-btn" onClick={() => dispatch({ type: 'NEXT_NODE' })}>
          离开 →
        </button>
      </div>
    </div>
  );
}

function RestScreen({ dispatch }: { dispatch: Dispatch<GameAction> }) {
  return (
    <div className="center-col">
      <div style={{ fontSize: 56 }}>🛌</div>
      <div className="title-sub">营火休整</div>
      <p className="card-sub">让所有宠物恢复全部生命</p>
      <button className="primary big-btn" onClick={() => dispatch({ type: 'REST_HEAL' })}>
        休息（恢复满血）
      </button>
    </div>
  );
}

function EventScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const ev = state.map.events[state.currentNodeId];
  if (!ev) return null;
  return (
    <div className="screen">
      <HUD state={state} dispatch={dispatch} />
      <div className="center-col">
        <div className="section-title">❓ {ev.title}</div>
        <p className="card-sub" style={{ maxWidth: 480, textAlign: 'center' }}>
          {ev.desc}
        </p>
        <div className="reward-cards">
          {ev.choices.map((c) => (
            <div key={c.id} className="reward-card" onClick={() => dispatch({ type: 'EVENT_CHOICE', choiceId: c.id })}>
              <div className="ricon">
                {c.kind === 'heal' && '❤️'}
                {c.kind === 'gold' && '💰'}
                {c.kind === 'food' && FOODS[c.foodId ?? 'berry'].emoji}
                {c.kind === 'recruit' && getMonster(c.monsterId!).emoji}
                {c.kind === 'damage' && '☠️'}
                {c.kind === 'exp' && '📚'}
                {c.kind === 'none' && '🚶'}
              </div>
              <div className="rtitle">{c.label}</div>
              <div className="rdesc">{c.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GameOverScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  return (
    <div className="center-col">
      <div style={{ fontSize: 56 }}>💀</div>
      <div className="title-name" style={{ color: '#e05555', letterSpacing: 4 }}>
        远征失败
      </div>
      <p className="card-sub">阵亡的宠物已永远消失，但这只是旅程的开始</p>
      {state.roster.length > 0 && (
        <>
          <div className="panel-row" style={{ flexWrap: 'wrap', justifyContent: 'center', margin: '8px 0' }}>
            {state.roster.map((u) => (
              <span className="chip" key={u.uid}>
                {u.emoji} {u.name} Lv{u.level}
              </span>
            ))}
          </div>
          <p className="card-sub">达到进化等级的伙伴已自动完成进化</p>
        </>
      )}
      <button className="primary big-btn" onClick={() => dispatch({ type: 'RETRY', seed: newSeed() })}>
        再来一次
      </button>
      <button className="big-btn" onClick={() => dispatch({ type: 'TITLE' })}>
        返回首页
      </button>
    </div>
  );
}

function VictoryScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  return (
    <div className="center-col">
      <div style={{ fontSize: 64 }}>👑</div>
      <div className="title-name">通关！</div>
      <p className="card-sub">你击败了所有首领，驯服了沿途的怪物军团</p>
      <div className="panel-row" style={{ flexWrap: 'wrap', justifyContent: 'center', margin: '8px 0' }}>
        {state.roster.map((u) => (
          <span className="chip" key={u.uid}>
            {u.emoji} {u.name} Lv{u.level}
          </span>
        ))}
      </div>
      <p className="card-sub">达到进化等级的伙伴已自动完成进化</p>
      <button className="primary big-btn" onClick={() => dispatch({ type: 'TITLE' })}>
        返回标题
      </button>
    </div>
  );
}
