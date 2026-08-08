import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import { gameReducer, createInitialState, newSeed } from '../game/state/reducer';
import type { GameAction } from '../game/state/reducer';
import type { GameState } from '../game/state/game';
import { canStepTo, generateMap, nodeInfo, NODE_ICON, ROSTER_MAX, FIELD_MAX, fusionNeedCount, nextStage, CURSE_CN, CUSTOM_PRESETS, type MapNode, type SpecialReward } from '../game/state/game';
import type { Unit, MonsterSpecies } from '../game/types';
import { MONSTERS, STARTING_CHOICES, getMonster } from '../game/data/monsters';
import { FOODS } from '../game/data/foods';
import { ITEMS } from '../game/data/items';
import { getSkill } from '../game/data/skills';
import { getPassive } from '../game/data/passives';
import { computeStats } from '../game/core/battle';
import { UnitCard, SkillTag, DragScrollRow } from './components';
import { BattleScreen } from './BattleScreen';
import { loadSave, persistSave, quitGame } from './persistence';

const NO_SAVE_SCREENS = ['title', 'starter', 'gameover', 'victory'];

const EMPTY_ROW: MapNode[] = [];

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
      {state.screen === 'special' && <SpecialScreen state={state} dispatch={dispatch} />}
      {state.screen === 'custom' && <CustomScreen state={state} dispatch={dispatch} />}
      {state.screen === 'boost' && <BoostScreen state={state} dispatch={dispatch} />}
      {state.screen === 'gameover' && <GameOverScreen state={state} dispatch={dispatch} />}
      {state.screen === 'victory' && <VictoryScreen state={state} dispatch={dispatch} />}
      {state.screen === 'watchtower' && <WatchtowerScreen state={state} dispatch={dispatch} />}
      {state.screen === 'chest' && <ChestScreen state={state} dispatch={dispatch} />}
      {state.screen === 'backpack' && <BackpackScreen state={state} dispatch={dispatch} />}
      {state.screen === 'tame-overflow' && <TameOverflowScreen state={state} dispatch={dispatch} />}
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
      </span>
      {state.screen === 'backpack' ? (
        <button className="home-btn" onClick={() => dispatch({ type: 'CLOSE_BACKPACK' })}>
          🎒 关闭背包
        </button>
      ) : state.screen === 'map' ? (
        <button className="home-btn" onClick={() => dispatch({ type: 'OPEN_BACKPACK' })}>
          🎒 背包
        </button>
      ) : null}
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

type PetConfirm = { kind: 'fuse' | 'discard' | 'notice'; uid?: string; msg?: string } | null;

/** 宠物卡片底部操作区：融合 / 释放（点击弹出确认框，材料不足时提示） */
function PetCardFooter({
  unit,
  state,
  setConfirm,
}: {
  unit: Unit;
  state: GameState;
  setConfirm: (c: NonNullable<PetConfirm>) => void;
}) {
  const stage = nextStage(unit.speciesId);
  const need = stage ? fusionNeedCount(unit.speciesId) : 0;
  const sameCount = state.roster.filter((x) => x.speciesId === unit.speciesId).length;
  const canFuse = stage !== undefined && sameCount >= need;
  return (
    <div className="unit-card-actions">
      <button
        title={stage ? `与同物种融合进化为 ${getMonster(stage).name}（${sameCount}/${need}）` : '该宠物已是最终形态，无法融合'}
        onClick={(e) => {
          e.stopPropagation();
          if (!stage) {
            setConfirm({ kind: 'notice', msg: '该宠物已是最终形态，无法融合' });
          } else if (!canFuse) {
            setConfirm({ kind: 'notice', msg: `同物种不足（${sameCount}/${need}），无法融合` });
          } else {
            setConfirm({ kind: 'fuse', uid: unit.uid });
          }
        }}
      >
        融合
      </button>
      <button
        title="释放后获得金币，宠物被永久移除"
        onClick={(e) => {
          e.stopPropagation();
          setConfirm({ kind: 'discard', uid: unit.uid });
        }}
      >
        释放
      </button>
    </div>
  );
}

/** 融合/释放/提示 的二次确认弹窗 */
function FuseDiscardConfirm({
  confirm,
  state,
  dispatch,
  setConfirm,
}: {
  confirm: PetConfirm;
  state: GameState;
  dispatch: Dispatch<GameAction>;
  setConfirm: (c: PetConfirm) => void;
}) {
  if (!confirm) return null;
  const target = confirm.uid ? state.roster.find((x) => x.uid === confirm.uid) : undefined;
  const isFuse = confirm.kind === 'fuse';
  const isDiscard = confirm.kind === 'discard';
  return (
    <div className="confirm-overlay" onClick={() => setConfirm(null)}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <div className="section-title">{isFuse ? '确认融合' : isDiscard ? '确认释放' : '提示'}</div>
        {isFuse && target && (
          <p>
            确定要融合「{target.name}」吗？将与同物种宠物融合进化为 <b>{getMonster(nextStage(target.speciesId)!).name}</b>，继承强化/诅咒，生命回满。
          </p>
        )}
        {isDiscard && target && (
          <p>
            确定要释放「{target.name}」吗？将获得 <b>{5 * getMonster(target.speciesId).rank} 金币</b>，宠物将被永久移除。
          </p>
        )}
        {confirm.kind === 'notice' && <p>{confirm.msg}</p>}
        <div className="panel-row" style={{ justifyContent: 'center' }}>
          {isFuse || isDiscard ? (
            <>
              <button
                className="primary"
                onClick={() => {
                  if (isFuse) dispatch({ type: 'FUSE', primaryUid: confirm.uid! });
                  else dispatch({ type: 'DISCARD', uid: confirm.uid! });
                  setConfirm(null);
                }}
              >
                确定
              </button>
              <button onClick={() => setConfirm(null)}>取消</button>
            </>
          ) : (
            <button className="primary" onClick={() => setConfirm(null)}>
              知道了
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function HomeScreen({ dispatch }: { dispatch: Dispatch<GameAction> }) {
  const [hasSave, setHasSave] = useState<boolean | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [showCodex, setShowCodex] = useState(false);
  const [dbgAct, setDbgAct] = useState(1);
  const [dbgRow, setDbgRow] = useState(5);
  const [dbgType, setDbgType] = useState<MapNode['type'] | 'all'>('all');
  const [dbgSeed, setDbgSeed] = useState(42);

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

  const DEBUG_TYPES_ALL: { value: MapNode['type'] | 'all'; label: string }[] = [
    { value: 'all', label: '任意' },
    { value: 'battle', label: '战斗' },
    { value: 'arena', label: '斗兽场' },
    { value: 'gauntlet', label: '车轮战' },
    { value: 'corrupted', label: '被侵蚀' },
    { value: 'elite', label: '精英' },
    { value: 'boss', label: '首领' },
    { value: 'event', label: '事件' },
    { value: 'shop', label: '商店' },
    { value: 'special', label: '奇遇' },
    { value: 'watchtower', label: '瞭望塔' },
    { value: 'sync', label: '双生宝箱' },
    { value: 'guardian', label: '守卫' },
    { value: 'keydoor', label: '钥匙门' },
  ];

  // 测试面板联动：按当前幕/种子实时生成地图，仅展示该幕该层实际存在的节点类型与层数
  const dbgMap = useMemo(() => generateMap(dbgSeed, dbgAct), [dbgSeed, dbgAct]);
  const dbgRows = dbgMap.layers.length;
  const dbgRowClamped = Math.min(dbgRow, dbgRows - 1);
  const rowTypes = new Set(dbgMap.layers[dbgRowClamped].map((n) => n.type));
  const DEBUG_TYPES = DEBUG_TYPES_ALL.filter((t) => t.value === 'all' || rowTypes.has(t.value as MapNode['type']));
  const dbgTypeEff = rowTypes.has(dbgType as MapNode['type']) ? dbgType : 'all';

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
        <button className="big-btn" onClick={() => setShowCodex(true)}>
          📖 生物图鉴
        </button>
        <button className="big-btn" onClick={() => setShowDebug((v) => !v)}>
          {showDebug ? '收起测试面板' : '🔬 测试关卡'}
        </button>
        <button className="big-btn" onClick={quitGame}>
          退出游戏
        </button>
      </div>
      {showDebug && (
        <div className="debug-panel">
          <div className="debug-row">
            <label>幕</label>
            <select value={dbgAct} onChange={(e) => setDbgAct(Number(e.target.value))}>
              {[1, 2, 3].map((a) => (
                <option key={a} value={a}>
                  第 {a} 幕
                </option>
              ))}
            </select>
            <label>层</label>
            <select value={dbgRowClamped} onChange={(e) => setDbgRow(Number(e.target.value))}>
              {Array.from({ length: dbgRows }, (_, i) => (
                <option key={i} value={i}>
                  第 {i} 层{i === dbgRows - 1 ? '（首领层）' : ''}
                </option>
              ))}
            </select>
            <label>节点</label>
            <select value={dbgTypeEff} onChange={(e) => setDbgType(e.target.value as MapNode['type'] | 'all')}>
              {DEBUG_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <label>种子</label>
            <input
              type="number"
              value={dbgSeed}
              onChange={(e) => setDbgSeed(Number(e.target.value))}
              style={{ width: 80 }}
            />
          </div>
          <button
            className="primary big-btn"
            onClick={() =>
              dispatch({ type: 'DEBUG_JUMP', act: dbgAct, row: dbgRowClamped, nodeType: dbgTypeEff, seed: dbgSeed })
            }
          >
            直接进入
          </button>
          <div className="debug-hint">调试模式：自动配备 3 只强宠、500 金币、3 个跳关道具；节点类型仅显示当前幕当前层实际存在的类型</div>
        </div>
      )}
      {showCodex && <CodexScreen onClose={() => setShowCodex(false)} />}
    </div>
  );
}

const CODEX_RANK_LABEL: Record<number, string> = { 1: '普通', 2: '精英', 3: '传奇', 4: '首领' };

const CODEX_GROUPS: { key: string; label: string; match: (m: MonsterSpecies) => boolean }[] = [
  { key: 'common', label: '普通宠物', match: (m) => m.rank === 1 },
  { key: 'elite', label: '精英宠物', match: (m) => m.rank === 2 },
  { key: 'legend', label: '传奇宠物', match: (m) => m.rank === 3 && !m.id.startsWith('custom_') },
  { key: 'boss', label: '首领', match: (m) => m.rank === 4 },
  { key: 'custom', label: '造物', match: (m) => m.id.startsWith('custom_') },
];

function CodexScreen({ onClose }: { onClose: () => void }) {
  const groups = useMemo(
    () =>
      CODEX_GROUPS.map((g) => ({
        ...g,
        items: Object.values(MONSTERS).filter(g.match),
      })).filter((g) => g.items.length > 0),
    [],
  );
  const [selectedId, setSelectedId] = useState<string>(() => groups[0]?.items[0]?.id ?? '');
  const sp = getMonster(selectedId);
  const stats = computeStats(sp.id);
  const passive = getPassive(sp.passive);
  const next = nextStage(sp.id);
  const rankLabel = sp.id.startsWith('custom_') ? '造物' : (CODEX_RANK_LABEL[sp.rank] ?? '');
  const tameable = sp.rank !== 4;

  return (
    <div className="codex-root">
      <div className="codex-header">
        <div className="codex-title">📖 生物图鉴</div>
        <div className="codex-sub">
          共 {Object.keys(MONSTERS).length} 种生物 · 点击左侧查看详情
        </div>
        <button className="primary" onClick={onClose}>
          返回
        </button>
      </div>
      <div className="codex-body">
        <div className="codex-list">
          {groups.map((g) => (
            <div key={g.key} className="codex-group">
              <div className="codex-group-title">{g.label}</div>
              {g.items.map((m) => (
                <div
                  key={m.id}
                  className={`codex-item ${m.id === selectedId ? 'selected' : ''}`}
                  onClick={() => setSelectedId(m.id)}
                >
                  <span className="codex-item-emoji">{m.emoji}</span>
                  <span className="codex-item-name">{m.name}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="codex-detail">
          <div className="codex-detail-head">
            <span className="codex-detail-emoji">{sp.emoji}</span>
            <div>
              <div className="codex-detail-name">
                {sp.name}
                <span className="chip rank-chip">{rankLabel}</span>
              </div>
              <div className="codex-detail-stats">
                ❤️ 生命 {stats.maxHp} · ⚡ 速度 {stats.spd}
              </div>
            </div>
          </div>

          {passive && (
            <div className="codex-section">
              <div className="codex-sec-title">💠 专属被动</div>
              <div className="codex-passive" title={passive.desc}>
                {passive.name}：{passive.desc}
              </div>
            </div>
          )}

          <div className="codex-section">
            <div className="codex-sec-title">⚔️ 技能</div>
            <div className="codex-skills">
              {sp.skills.map((sid) => {
                const s = getSkill(sid);
                return <SkillTag key={sid} skill={s} desc usesNote />;
              })}
            </div>
            {sp.id.startsWith('custom_') && (
              <div className="codex-note">造物：从上方技能池随机组合 3 个技能</div>
            )}
          </div>

          <div className="codex-section">
            <div className="codex-sec-title">🎣 驯服</div>
            <div className="codex-line">
              {tameable ? `驯服难度 ${Math.round(sp.tame.difficulty * 100)}%` : '首领 · 不可驯服'}
            </div>
          </div>

          <div className="codex-section">
            <div className="codex-sec-title">✨ 融合</div>
            <div className="codex-line">
              {next ? (
                <>
                  需 {fusionNeedCount(sp.id)} 只同物种 → {getMonster(next).emoji} {getMonster(next).name}
                </>
              ) : (
                '不可融合'
              )}
            </div>
          </div>

          {sp.desc && <div className="codex-desc">{sp.desc}</div>}
        </div>
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
          const stats = computeStats(id);
          return (
            <div key={id} className="unit-card clickable" onClick={() => dispatch({ type: 'START_RUN', starterId: id, seed: newSeed() })}>
              <div className="card-top">
                <span className="emoji">{sp.emoji}</span>
              </div>
              <div className="card-name">{sp.name}</div>
              <div className="card-sub">
                生命 {stats.maxHp} · 速度 {stats.spd}
              </div>
              <div className="skill-list">
                {sp.skills.map((s) => (
                  <SkillTag key={s} skill={getSkill(s)} />
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
  const isDisabled = (n: MapNode) => state.map.disabled?.[n.id] === true;
  const isLocked = (n: MapNode) => (n.type === 'keydoor' && (n.guardianId ? (state.inventory[`key_${n.guardianId}`] ?? 0) > 0 : false) === false);
  const canSelect = (n: MapNode) =>
    !isDisabled(n) && !isLocked(n) && canStepTo(state.currentRow, currentCol, n, state.map);

  // 路线预览：默认显示当前节点 → 下一步可达；悬停某节点时显示该节点的下一步可达
  const nextRow = state.map.layers[optionsRow] ?? EMPTY_ROW;
  const nearIds = useMemo(
    () => new Set(nextRow.filter((n) => canStepTo(state.currentRow, currentCol, n)).map((n) => n.id)),
    [nextRow, state.currentRow, currentCol],
  );
  const [hoverId, setHoverId] = useState<string | null>(null);
  const hoverRow = hoverId ? state.map.layers.findIndex((r) => r.some((n) => n.id === hoverId)) : -1;
  const hoverNode = hoverId && hoverRow >= 0 ? state.map.layers[hoverRow].find((n) => n.id === hoverId) : undefined;
  const hoverNextRow =
    hoverNode && hoverRow + 1 < state.map.layers.length ? state.map.layers[hoverRow + 1] : EMPTY_ROW;
  const hoverReachIds = useMemo(
    () =>
      hoverNode
        ? new Set(hoverNextRow.filter((m) => canStepTo(hoverRow, hoverNode.col, m)).map((m) => m.id))
        : new Set<string>(),
    [hoverNode, hoverRow, hoverNextRow],
  );

  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeEls = useRef<Record<string, HTMLDivElement | null>>({});
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 });
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number; kind: 'near' | 'far' | 'pair' | 'path' }[]>([]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const update = () => {
      const w = canvas.scrollWidth;
      const h = canvas.scrollHeight;
      setSvgSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(canvas);
    window.addEventListener('resize', update);
    canvas.addEventListener('scroll', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      canvas.removeEventListener('scroll', update);
    };
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const center = (id: string): { x: number; y: number } | null => {
      const el = nodeEls.current[id];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left - rect.left + canvas.scrollLeft + r.width / 2, y: r.top - rect.top + canvas.scrollTop + r.height / 2 };
    };
    const result: typeof lines = [];
    if (!isFirst) {
      const src = center(state.currentNodeId);
      if (src) {
        for (const n of nextRow) {
          if (!nearIds.has(n.id)) continue;
          const t = center(n.id);
          if (t) result.push({ x1: src.x, y1: src.y, x2: t.x, y2: t.y, kind: 'near' });
        }
      }
    }
    if (hoverNode) {
      const a = center(hoverNode.id);
      if (a) {
        for (const m of hoverNextRow) {
          if (!hoverReachIds.has(m.id)) continue;
          const b = center(m.id);
          if (b) result.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, kind: 'far' });
        }
      }
    }
    // 同步双节点：虚线连接配对的两个宝箱（二选一，任一开启后连线消失）
    for (const row of state.map.layers) {
      for (const n of row) {
        if (n.type !== 'sync' || !n.pairedId) continue;
        if (isDisabled(n) || isDisabled({ id: n.pairedId, type: 'sync' } as MapNode)) continue;
        const a = center(n.id);
        const b = center(n.pairedId);
        if (a && b) result.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, kind: 'pair' });
      }
    }
    // 已走路径：连接所有 visitedNodeIds（按访问顺序），金色高亮
    const visitedNodeIds = state.visitedNodeIds ?? [];
    for (let i = 1; i < visitedNodeIds.length; i++) {
      const a = center(visitedNodeIds[i - 1]);
      const b = center(visitedNodeIds[i]);
      if (a && b) result.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, kind: 'path' });
    }
    setLines(result);
  }, [isFirst, state.currentNodeId, optionsRow, nearIds, hoverNode, hoverNextRow, hoverReachIds, svgSize, state.map, state.inventory, state.visitedNodeIds]);

  return (
    <div className="screen">
      <HUD state={state} dispatch={dispatch} />
      {state.scoutSelecting && (
        <div className="panel-row" style={{ justifyContent: 'center', marginBottom: 8 }}>
          <span className="chip" style={{ fontSize: 13 }}>
            🔍 侦查模式：点击任意节点查看情报（消耗 1 个侦查符，持有 {state.inventory.scout ?? 0} 个）
          </span>
          <button onClick={() => dispatch({ type: 'CANCEL_SCOUT' })}>✕ 取消</button>
        </div>
      )}
      {state.skipSelecting && (
        <div className="panel-row" style={{ justifyContent: 'center', marginBottom: 8 }}>
          <span className="chip" style={{ fontSize: 13 }}>
            🪜 跳关模式：点击可达的战斗类节点，直接获得其奖励（消耗 1 个跳关道具，持有 {state.inventory.skip ?? 0} 个）
          </span>
          <button onClick={() => dispatch({ type: 'CANCEL_SKIP' })}>✕ 取消</button>
        </div>
      )}
      <div className="map-canvas" ref={canvasRef}>
        <svg className="map-lines" width={svgSize.w} height={svgSize.h}>
          {lines.map((l, i) => (
            <line
              key={i}
              className={
                l.kind === 'near'
                  ? 'ln-near'
                  : l.kind === 'far'
                  ? 'ln-far'
                  : l.kind === 'pair'
                  ? 'ln-pair'
                  : 'ln-path'
              }
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
            />
          ))}
        </svg>
{state.map.layers.map((row, ri) => {
          const isOptionRow = ri === optionsRow;
          const isPast = ri < optionsRow;
          return (
            <div className="map-row" key={ri}>
              {row.map((n) => {
                const isCurrent = n.id === state.currentNodeId;
                const scoutable = state.scoutSelecting === true && !isDisabled(n);
                const selectable = isOptionRow && canSelect(n);
                const skipable =
                  state.skipSelecting === true &&
                  selectable &&
                  (n.type === 'battle' ||
                    n.type === 'elite' ||
                    n.type === 'arena' ||
                    n.type === 'gauntlet' ||
                    n.type === 'corrupted');
                const reachCls = isCurrent ? '' : nearIds.has(n.id) ? 'reach-1' : hoverReachIds.has(n.id) ? 'reach-2' : '';
                const visitedWatchtowers = state.visitedWatchtowers ?? [];
                const isVisitedWatchtower = n.type === 'watchtower' && visitedWatchtowers.includes(n.id);
                const cls = [
                  isCurrent ? 'current' : isOptionRow ? (selectable ? 'option' : 'dim') : isPast ? '' : 'dim',
                  reachCls,
                  isDisabled(n) ? 'node-off' : '',
                  isLocked(n) ? 'node-locked' : '',
                  isVisitedWatchtower ? 'visited-watchtower' : '',
                  scoutable ? 'node-scoutable' : '',
                  skipable ? 'node-skipable' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                const nodeHint =
                  n.type === 'keydoor'
                    ? isLocked(n)
                      ? '钥匙门：需先击败对应守卫取得钥匙'
                      : '持有钥匙，可开启高级宝箱'
                    : n.type === 'sync'
                    ? '双生宝箱：与配对宝箱二选一（持双生符可同时开启）'
                    : n.type === 'guardian'
                    ? '守卫：强力怪物，击败获得专用钥匙'
                    : undefined;
                return (
                  <div
                    key={n.id}
                    ref={(el) => {
                      nodeEls.current[n.id] = el;
                    }}
                    className={`node ${cls}`}
                    title={nodeHint}
                    onMouseEnter={() => setHoverId(n.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onClick={
                      skipable
                        ? () => dispatch({ type: 'USE_SKIP', nodeId: n.id })
                        : scoutable
                          ? () => dispatch({ type: 'USE_SCOUT', nodeId: n.id })
                          : selectable
                            ? () => dispatch({ type: 'MOVE', nodeId: n.id })
                            : isCurrent && n.type === 'watchtower'
                              ? () => dispatch({ type: 'OPEN_WATCHTOWER' })
                              : isVisitedWatchtower && isPast
                                ? () => dispatch({ type: 'OPEN_WATCHTOWER', nodeId: n.id })
                                : undefined
                    }
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
      {state.scoutResult && (
        <div className="confirm-overlay" onClick={() => dispatch({ type: 'CANCEL_SCOUT' })}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">侦查结果 🔍</div>
            <div className="scout-result">
              <div className="ricon">{NODE_ICON[state.map.layers.flat().find((n) => n.id === state.scoutResult!.nodeId)?.type ?? 'battle']}</div>
              <div className="rtitle">{state.scoutResult.title}</div>
              <div className="rdesc">{state.scoutResult.detail}</div>
            </div>
            <div className="panel-row" style={{ justifyContent: 'center' }}>
              <button className="primary" onClick={() => dispatch({ type: 'CANCEL_SCOUT' })}>
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="card-sub" style={{ textAlign: 'center' }}>
        选择下一处地点（出发后需走相邻路线；消灭首领后可进入下一层）
        <span className="route-legend">
          <span className="legend-near" /> 下一步可达
          <span className="legend-far" /> 悬停查看再下一步
        </span>
      </div>
    </div>
  );
}

function RewardScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  return (
    <div className="screen">
      <HUD state={state} dispatch={dispatch} />
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

  const pending = state.specialPending;
  const evolveMode = pending?.kind === 'evolve';
  const boostMode = pending?.kind === 'boost';
  const arenaMode = pending?.kind === 'arena';
  const [confirm, setConfirm] = useState<PetConfirm>(null);
  const title = evolveMode
    ? pending.super
      ? '超进化：选择要进化的宠物（会附带随机负面诅咒）'
      : '进化之光：选择要进化的宠物'
    : boostMode
      ? '属性强化：选择要强化的宠物'
      : arenaMode
        ? '斗兽场：选择 1 只宠物出战（1v1 单挑，胜利得丰厚奖励）'
        : `队伍管理（${state.field.length}/${FIELD_MAX} 出战，上限 ${ROSTER_MAX} 只）`;

  return (
    <div className="screen">
      <HUD state={state} dispatch={dispatch} />
      <div className="section-title">{title}</div>
      {!evolveMode && !boostMode && !arenaMode && (
        <div className="panel-row" style={{ marginBottom: 10 }}>
          <span className="card-sub">出战宠物（点击下方宠物卡加入/移除）：</span>
          {state.field.map((uid) => {
            const u = state.roster.find((x) => x.uid === uid);
            return u ? <span className="chip" key={uid}>{u.emoji} {u.name}</span> : null;
          })}
        </div>
      )}
      <div className="roster-list">
        {state.roster.map((u) => {
          const inField = state.field.includes(u.uid);
          const canEvolve = nextStage(u.speciesId) !== undefined;
          const onCard = evolveMode
            ? canEvolve
              ? () => dispatch({ type: 'EVOLVE_ONE', uid: u.uid })
              : undefined
            : boostMode
              ? () => dispatch({ type: 'SPECIAL_TARGET', uid: u.uid })
              : arenaMode
                ? () => dispatch({ type: 'SPECIAL_TARGET', uid: u.uid })
                : () => toggleField(u.uid);
          return (
        <div key={u.uid} className="roster-item">
          <UnitCard
            unit={u}
            className={`roster-card ${inField ? 'selected' : ''} ${(evolveMode && canEvolve) || boostMode || arenaMode ? 'clickable' : ''}`}
            onClick={onCard}
            showSkillDesc
            topStats
            footer={
              !evolveMode && !boostMode && !arenaMode ? <PetCardFooter unit={u} state={state} setConfirm={setConfirm} /> : undefined
            }
          />
              <div className="roster-actions">
                <div className="panel-row" style={{ justifyContent: 'center' }}>
                  {u.curse && (
                    <span className="chip" title="负面诅咒，可用净化药水解除">
                      ⚠️ {CURSE_CN[u.curse]}
                    </span>
                  )}
                  {u.bonusStats && (u.bonusStats.hp || u.bonusStats.spd) && (
                    <span className="chip" title="来自奇遇关的属性强化">
                      ✨+{(u.bonusStats.hp ?? 0) ? `血${u.bonusStats.hp}` : ''}
                      {(u.bonusStats.spd ?? 0) ? `速${u.bonusStats.spd}` : ''}
                    </span>
                  )}
                </div>
                {u.curse && (state.inventory.purify ?? 0) > 0 && (
                  <button onClick={() => dispatch({ type: 'USE_PURIFY', uid: u.uid })}>
                    🧪 净化（{state.inventory.purify}）
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!evolveMode && !boostMode && !arenaMode && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
          <button className="primary big-btn" onClick={() => dispatch({ type: 'NEXT_NODE' })}>
            继续前进 →
          </button>
        </div>
      )}
      {confirm && (
        <FuseDiscardConfirm confirm={confirm} state={state} dispatch={dispatch} setConfirm={setConfirm} />
      )}
    </div>
  );
}

function ShopScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const bought = state.shopBought === true;
  const boughtItems = state.shopBoughtItems ?? [];
  const stock = (state.shopStock ?? []).filter((id) => FOODS[id] || ITEMS[id]);
  return (
    <div className="screen">
      <HUD state={state} dispatch={dispatch} />
      <div className="section-title">商人 🏪</div>
      <p className="card-sub" style={{ textAlign: 'center' }}>
        本店随机出售 4 种商品，或花 5 金币立即休整（回满血·不解诅咒）；{bought ? '已购买过商品，本节点不可再休整。' : '本节点购物与休整二选一。'}
      </p>
      <div className="reward-cards">
        {stock.map((id) => {
          const f = FOODS[id];
          const it = ITEMS[id];
          const name = f ? f.name : it.name;
          const emoji = f ? f.emoji : it.emoji;
          const desc = f ? f.desc : it.desc;
          const price = f ? f.price : it.price;
          const soldOut = boughtItems.includes(id);
          return (
            <div key={id} className={`reward-card ${soldOut ? 'dim' : ''}`}>
              <div className="ricon">{emoji}</div>
              <div className="rtitle">{name}</div>
              <div className="rdesc">{desc}</div>
              <div className="panel-row" style={{ justifyContent: 'center', marginTop: 8 }}>
                <span className="chip">💰 {price}</span>
                <button
                  className="primary"
                  disabled={soldOut || state.gold < price}
                  onClick={() => dispatch({ type: 'SHOP_BUY', foodId: id })}
                >
                  {soldOut ? '已购买' : '购买'}
                </button>
              </div>
            </div>
          );
        })}
        <div className={`reward-card ${bought ? 'dim' : ''}`}>
          <div className="ricon">🛌</div>
          <div className="rtitle">立即休整</div>
          <div className="rdesc">花费 5 金币让全队回满血（不解超进化诅咒）</div>
          <div className="panel-row" style={{ justifyContent: 'center', marginTop: 8 }}>
            <span className="chip">💰 5</span>
            <button
              className="primary"
              disabled={state.gold < 5 || bought}
              onClick={() => dispatch({ type: 'SHOP_REST' })}
            >
              休整
            </button>
          </div>
        </div>
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

function WatchtowerScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  // 找到正在预览的瞭望塔节点及其所在行
  const previewId = state.watchtowerPreviewNodeId;
  const previewNode = previewId ? state.map.layers.flat().find((n) => n.id === previewId) : undefined;
  const previewRow = previewNode
    ? state.map.layers.findIndex((layer) => layer.some((n) => n.id === previewId))
    : state.currentRow;
  const maxRow = state.map.layers.length - 1;
  const rows = [previewRow + 1, previewRow + 2, previewRow + 3].filter((r) => r <= maxRow);
  const [selRow, setSelRow] = useState<number>(rows[0] ?? previewRow);
  const sel = rows.includes(selRow) ? selRow : rows[0] ?? previewRow;

  return (
    <div className="screen">
      <HUD state={state} dispatch={dispatch} />
      <div className="section-title">
        瞭望塔 🔭 {previewNode ? `(第 ${previewRow + 1} 行)` : ''}
      </div>
      <p className="card-sub" style={{ textAlign: 'center' }}>
        预览该瞭望塔后 3 行内某一行的全部节点情报（敌人属性与数量、商店货物、事件与奇遇）
      </p>
      <div className="panel-row" style={{ justifyContent: 'center', gap: 8, marginBottom: 12 }}>
        {rows.map((r) => (
          <button key={r} className={r === sel ? 'primary' : ''} onClick={() => setSelRow(r)}>
            第 {r} 层{r === maxRow ? '（首领层）' : ''}
          </button>
        ))}
      </div>
      <div className="reward-cards">
        {state.map.layers[sel].map((n) => {
          const info = nodeInfo(state, n);
          return (
            <div key={n.id} className="reward-card">
              <div className="ricon">{info.icon}</div>
              <div className="rtitle">{info.title}</div>
              <div className="rdesc">{info.detail}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
        <button className="big-btn" onClick={() => dispatch({ type: 'CLOSE_WATCHTOWER' })}>
          关闭瞭望
        </button>
      </div>
    </div>
  );
}

function ChestScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const results = state.chestResult ?? [];
  return (
    <div className="screen">
      <HUD state={state} dispatch={dispatch} />
      <div className="center-col">
        <div className="section-title">宝箱 🎁</div>
        <p className="card-sub" style={{ maxWidth: 480, textAlign: 'center' }}>
          你开启了宝箱……
        </p>
        <div className="log-history" style={{ maxWidth: 480 }}>
          {results.map((t, i) => (
            <div key={i}>✨ {t}</div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
          <button className="big-btn" onClick={() => dispatch({ type: 'NEXT_NODE' })}>
            继续前进 →
          </button>
        </div>
      </div>
    </div>
  );
}

function BackpackScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const [confirm, setConfirm] = useState<PetConfirm>(null);
  const items = Object.entries(state.inventory).filter(([, c]) => c > 0);
  const foodList = items.filter(([id]) => FOODS[id]);
  const itemList = items.filter(([id]) => ITEMS[id]).sort((a, b) => (a[0] === 'scout' ? -1 : b[0] === 'scout' ? 1 : 0));
  return (
    <div className="screen">
      <HUD state={state} dispatch={dispatch} />
      <div className="section-title">🎒 背包</div>

      <div className="section-sub">道具</div>
      <DragScrollRow>
        {foodList.map(([id, count]) => {
          const f = FOODS[id];
          return (
            <div key={id} className="reward-card bag-item" style={{ cursor: 'default' }}>
              <div className="ricon">{f.emoji}</div>
              <div className="rtitle">
                {f.name} ×{count}
              </div>
              <div className="rdesc">
                {f.desc}（{f.baseTame}% 驯服率）
              </div>
            </div>
          );
        })}
        {itemList.map(([id, count]) => {
          const it = ITEMS[id];
          const isScout = id === 'scout';
          const isSkip = id === 'skip';
          const clickable = isScout || isSkip;
          return (
            <div
              key={id}
              className="reward-card bag-item"
              style={{ cursor: clickable ? 'pointer' : 'default' }}
              onClick={isScout ? () => dispatch({ type: 'OPEN_SCOUT' }) : isSkip ? () => dispatch({ type: 'OPEN_SKIP' }) : undefined}
              title={isScout ? `点击前往地图选择要侦查的节点（持有 ${count} 个）` : isSkip ? `点击前往地图选择要跳过的战斗节点（持有 ${count} 个）` : undefined}
            >
              <div className="ricon">{it.emoji}</div>
              <div className="rtitle">
                {it.name} ×{count}
              </div>
              <div className="rdesc">{it.desc}</div>
              {id === 'purify' && (
                <span className="card-sub" style={{ fontSize: 11 }}>
                  对有诅咒的宠物使用（见下方宠物区）
                </span>
              )}
            </div>
          );
        })}
      </DragScrollRow>

      <div className="section-sub" style={{ marginTop: 30 }}>
        宠物（{state.roster.length}/{ROSTER_MAX}，出战 {state.field.length}/{FIELD_MAX}）
      </div>
      <DragScrollRow className="bag-pets">
        {state.roster.map((u) => {
          const inField = state.field.includes(u.uid);
          return (
            <div key={u.uid} className="roster-item">
              <UnitCard
                unit={u}
                className={`roster-card ${inField ? 'selected' : ''}`}
                showSkillDesc
                topStats
                footer={<PetCardFooter unit={u} state={state} setConfirm={setConfirm} />}
              />
              <div className="roster-actions">
                <div className="panel-row" style={{ justifyContent: 'center' }}>
                  {u.curse && <span className="chip">⚠️ {CURSE_CN[u.curse]}</span>}
                  {u.bonusStats && (u.bonusStats.hp || u.bonusStats.spd) && (
                    <span className="chip">
                      ✨ 生命+{u.bonusStats.hp ?? 0} 速度+{u.bonusStats.spd ?? 0}
                    </span>
                  )}
                  {u.curse && (state.inventory.purify ?? 0) > 0 && (
                    <button onClick={() => dispatch({ type: 'USE_PURIFY', uid: u.uid })}>
                      🧪 净化（{state.inventory.purify}）
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </DragScrollRow>

      {confirm && (
        <FuseDiscardConfirm confirm={confirm} state={state} dispatch={dispatch} setConfirm={setConfirm} />
      )}
    </div>
  );
}

function TameOverflowScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const tame = (state.tameOverflow ?? [])[0];
  if (!tame) return null;
  const fuseCandidates = state.roster.filter((u) => {
    if (u.speciesId !== tame.speciesId) return false;
    if (!nextStage(u.speciesId)) return false;
    const need = fusionNeedCount(u.speciesId);
    const same = state.roster.filter((x) => x.speciesId === u.speciesId);
    return same.length + 1 >= need;
  });
  const remaining = state.tameOverflow!.length;
  return (
    <div className="screen">
      <div className="section-title">队伍已满（{state.roster.length}/{ROSTER_MAX}）</div>
      <p className="card-sub" style={{ maxWidth: 560, textAlign: 'center', margin: '0 auto 8px' }}>
        你驯服了新的宠物，但队伍已满。三选一：<b>替换</b>（放生一只现有宠物让它加入）／<b>融合</b>（作为材料与同物种宠物进化）／<b>放生</b>（丢弃）。
      </p>
      <div className="center-col" style={{ flex: '0 0 auto', padding: '8px 0' }}>
        <UnitCard unit={tame} />
      </div>

      <div className="section-sub">
        一、替换：放生一只现有宠物，让「{tame.name}」加入（还有 {remaining} 只需要处理）
      </div>
      <div className="roster-list">
        {state.roster.map((u) => (
          <div key={u.uid} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <UnitCard unit={u} />
            <div style={{ textAlign: 'center' }}>
              <button
                className="primary"
                onClick={() => dispatch({ type: 'TAME_OVERFLOW_REPLACE', tameUid: tame.uid, discardUid: u.uid })}
              >
                替换：放生 {u.name}（+{5 * getMonster(u.speciesId).rank}💰）
              </button>
            </div>
          </div>
        ))}
      </div>

      {fuseCandidates.length > 0 && (
        <>
          <div className="section-sub">二、融合：与同物种宠物融合进化（消耗「{tame.name}」作为材料）</div>
          <div className="roster-list">
            {fuseCandidates.map((u) => {
              const stage = nextStage(u.speciesId)!;
              const need = fusionNeedCount(u.speciesId);
              return (
                <div key={u.uid} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <UnitCard unit={u} />
                  <div style={{ textAlign: 'center' }}>
                    <button
                      className="primary"
                      onClick={() => dispatch({ type: 'TAME_OVERFLOW_FUSE', tameUid: tame.uid, primaryUid: u.uid })}
                    >
                      融合 → {getMonster(stage).name}（需 {need} 只同物种）
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
        <button className="big-btn" onClick={() => dispatch({ type: 'TAME_OVERFLOW_DISCARD', tameUid: tame.uid })}>
          放生「{tame.name}」（不加入队伍）
        </button>
      </div>
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
        <div className="section-title">📜 {ev.title}</div>
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
                {c.kind === 'item' && (c.itemId && ITEMS[c.itemId] ? ITEMS[c.itemId].emoji : '🎒')}
                {c.kind === 'recruit' && '🥚'}
                {c.kind === 'damage' && '☠️'}
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

function SpecialScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const sp = state.map.specials[state.currentNodeId];
  if (!sp) return null;
  const hasEvolvable = state.roster.some((u) => nextStage(u.speciesId));
  const rosterFull = state.roster.length >= ROSTER_MAX;
  const disabled = (r: SpecialReward) =>
    ((r.kind === 'evolve' || r.kind === 'superevolve') && !hasEvolvable) ||
    (r.kind === 'custom' && rosterFull);
  return (
    <div className="screen">
      <HUD state={state} dispatch={dispatch} />
      <div className="center-col">
        <div className="section-title">💎 {sp.title}</div>
        <p className="card-sub" style={{ maxWidth: 480, textAlign: 'center' }}>
          {sp.desc}
        </p>
        <div className="reward-cards">
          {sp.rewards.map((r) => (
            <div
              key={r.id}
              className={`reward-card ${disabled(r) ? 'dim' : ''}`}
              onClick={disabled(r) ? undefined : () => dispatch({ type: 'SPECIAL_CHOICE', rewardId: r.id })}
            >
              <div className="ricon">
                {r.kind === 'evolve' && '🧬'}
                {r.kind === 'superevolve' && '🔥'}
                {r.kind === 'gold' && '💰'}
                {r.kind === 'boost' && '📈'}
                {r.kind === 'custom' && '✨'}
                {r.kind === 'item' && (FOODS[r.itemId ?? '']?.emoji ?? ITEMS[r.itemId ?? '']?.emoji)}
              </div>
              <div className="rtitle">{r.label}</div>
              <div className="rdesc">{r.desc}</div>
            </div>
          ))}
        </div>
        {!hasEvolvable && (
          <p className="card-sub" style={{ textAlign: 'center' }}>
            当前没有可进化的宠物，进化/超进化不可选
          </p>
        )}
      </div>
    </div>
  );
}

function CustomScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  return (
    <div className="screen">
      <HUD state={state} dispatch={dispatch} />
      <div className="center-col">
        <div className="section-title">✨ 造物·自创生物</div>
        <p className="card-sub" style={{ maxWidth: 480, textAlign: 'center' }}>
          选择属性模板，技能将从模板技能池中随机组合
        </p>
        <div className="starter-grid">
          {CUSTOM_PRESETS.map((id) => {
            const sp = getMonster(id);
            const stats = computeStats(id);
            return (
              <div
                key={id}
                className="unit-card clickable"
                onClick={() => dispatch({ type: 'PICK_CUSTOM', presetId: id })}
              >
                <div className="card-top">
                  <span className="emoji">{sp.emoji}</span>
                </div>
                <div className="card-name">{sp.name}</div>
                <div className="card-sub">
                  生命 {stats.maxHp} · 速度 {stats.spd}
                </div>
                <div className="skill-list">
                  {sp.skills.map((s) => (
                    <SkillTag key={s} skill={getSkill(s)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BoostScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const uid = state.specialPending?.kind === 'boost' ? state.specialPending.uid : '';
  const u = state.roster.find((x) => x.uid === uid);
  if (!u) return null;
  const options = [
    { stat: 'hp' as const, icon: '❤️', label: '生命 +3', value: 3 },
    { stat: 'spd' as const, icon: '⚡', label: '速度 +1', value: 1 },
  ];
  return (
    <div className="screen">
      <HUD state={state} dispatch={dispatch} />
      <div className="center-col">
        <div className="section-title">
          📈 属性强化：{u.emoji} {u.name}
        </div>
        <div className="reward-cards">
          {options.map((o) => (
            <div key={o.stat} className="reward-card" onClick={() => dispatch({ type: 'BOOST_STAT', stat: o.stat })}>
              <div className="ricon">{o.icon}</div>
              <div className="rtitle">{o.label}</div>
              <div className="rdesc">永久提升 {o.value} 点</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GameOverScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {  return (
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
                {u.emoji} {u.name}
              </span>
            ))}
          </div>
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
            {u.emoji} {u.name}
          </span>
        ))}
      </div>
      <button className="primary big-btn" onClick={() => dispatch({ type: 'TITLE' })}>
        返回标题
      </button>
    </div>
  );
}
