import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Dispatch, DragEvent } from 'react';
import { gameReducer, createInitialState, newSeed } from '../game/state/reducer';
import type { GameAction } from '../game/state/reducer';
import type { GameState, Difficulty } from '../game/state/game';
import { canStepTo, generateMap, nodeInfo, NODE_ICON, FIELD_MAX, PROF_FIELD_MAX, maxFieldForEnemy, fusionNeedCount, nextStage, CURSE_CN, CUSTOM_PRESETS, labelOf, EVENT_TYPE_LABELS, DIFFICULTY_CONFIG, DIFFICULTY_ORDER, RELIC_DEFS, RELIC_ORDER, DEFAULT_UNLOCKS, getMaxRoster, type MapNode, type SpecialReward } from '../game/state/game';
import type { FormationRow } from '../game/state/formation';
import type { Unit, MonsterSpecies } from '../game/types';
import { MONSTERS, STARTER_GROUP_1, STARTER_GROUP_2, BASE_POOL, getMonster } from '../game/data/monsters';
import { FOODS } from '../game/data/foods';
import { ITEMS } from '../game/data/items';
import { getSkill } from '../game/data/skills';
import { getPassive } from '../game/data/passives';
import { computeStats, makeUnit } from '../game/core/battle';
import { getMaxSkillSlots } from '../game/core/growth';
import { UnitCard, SkillTag, DragScrollRow, PetIcon } from './components';
import { GrowthScreen } from './GrowthScreen';
import { BlacksmithScreen } from './BlacksmithScreen';
import { EnhanceStoneScreen } from './EnhanceStoneScreen';
import { EnhanceResetScreen } from './EnhanceResetScreen';
import { Arena3Screen } from './Arena3Screen';
import { SkillPickScreen } from './SkillPickScreen';
import { BattleScreen } from './BattleScreen';
import { FormationScreen } from './FormationScreen';
import { GauntletOrderScreen } from './GauntletOrderScreen';
import { persistSave, persistUnlocks, loadUnlocks, quitGame, detectUnlocks, listSaves, deleteSave, deleteSaveMode, clearDeletedSlot, type SaveSlotInfo } from './persistence';

const NO_SAVE_SCREENS = ['title', 'starter', 'gameover', 'victory', 'achievements', 'difficulty-select'];

const EMPTY_ROW: MapNode[] = [];

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);

  // 预加载自定义宠物图片，避免切换界面时延迟显示
  useEffect(() => {
    for (const m of Object.values(MONSTERS)) {
      if (m.image) {
        const img = new Image();
        img.src = m.image;
      }
    }
  }, []);

  useEffect(() => {
    if (!NO_SAVE_SCREENS.includes(state.screen)) {
      const t = setTimeout(() => {
        void persistSave(state);
      }, 400);
      return () => clearTimeout(t);
    }
  }, [state]);

  useEffect(() => {
    if (state.toast) {
      const t = setTimeout(() => dispatch({ type: 'CLEAR_TOAST' }), 2500);
      return () => clearTimeout(t);
    }
  }, [state.toast]);

  return (
    <div className="screen">
      {state.screen === 'title' && <HomeScreen dispatch={dispatch} currentSaveSlot={state.saveSlot} />}
      {state.screen === 'starter' && <StarterScreen dispatch={dispatch} />}
      {state.screen === 'map' && <MapScreen state={state} dispatch={dispatch} />}
      {state.screen === 'formation' && <FormationScreen state={state} dispatch={dispatch} />}
      {state.screen === 'gauntlet-order' && <GauntletOrderScreen state={state} dispatch={dispatch} />}
      {state.screen === 'battle' && <BattleScreen state={state} dispatch={dispatch} />}
      {state.screen === 'reward' && <RewardScreen state={state} dispatch={dispatch} />}
      {state.screen === 'roster' && <RosterScreen state={state} dispatch={dispatch} />}
      {state.screen === 'shop' && <ShopScreen state={state} dispatch={dispatch} />}
      {state.screen === 'rest' && <RestScreen state={state} dispatch={dispatch} />}
      {(state.screen === 'rest-fusion' || state.screen === 'rest-fusion-skill') && <RestFusionScreen state={state} dispatch={dispatch} />}
      {state.screen === 'revive-select' && <ReviveSelectScreen state={state} dispatch={dispatch} />}
      {state.screen === 'event' && <EventScreen state={state} dispatch={dispatch} />}
      {state.screen === 'special' && <SpecialScreen state={state} dispatch={dispatch} />}
      {state.screen === 'custom' && <CustomScreen state={state} dispatch={dispatch} />}
      {state.screen === 'boost' && <BoostScreen state={state} dispatch={dispatch} />}
      {state.screen === 'gameover' && <GameOverScreen state={state} dispatch={dispatch} />}
      {state.screen === 'victory' && <VictoryScreen state={state} dispatch={dispatch} />}
      {state.screen === 'inter_act' && <InterActScreen state={state} dispatch={dispatch} />}
      {state.screen === 'watchtower' && <WatchtowerScreen state={state} dispatch={dispatch} />}
      {state.screen === 'chest' && <ChestScreen state={state} dispatch={dispatch} />}
      {state.screen === 'backpack' && <BackpackScreen state={state} dispatch={dispatch} />}
      {state.screen === 'tame-overflow' && <TameOverflowScreen state={state} dispatch={dispatch} />}
      {state.screen === 'test-type' && <TestTypeScreen dispatch={dispatch} />}
      {state.screen === 'test-pick' && <TestPickScreen state={state} dispatch={dispatch} />}
      {state.screen === 'test-config' && <TestConfigScreen state={state} dispatch={dispatch} />}
      {state.screen === 'achievements' && <AchievementsScreen state={state} dispatch={dispatch} />}
      {state.screen === 'growth-menu' && <GrowthScreen state={state} dispatch={dispatch} />}
      {state.screen === 'blacksmith' && <BlacksmithScreen state={state} dispatch={dispatch} />}
      {state.screen === 'enhance-stone' && <EnhanceStoneScreen state={state} dispatch={dispatch} />}
      {state.screen === 'enhance-reset' && <EnhanceResetScreen state={state} dispatch={dispatch} />}
      {state.screen === 'arena3' && <Arena3Screen state={state} dispatch={dispatch} />}
      {state.screen === 'skill-pick' && <SkillPickScreen state={state} dispatch={dispatch} />}
      {state.screen === 'difficulty-select' && <DifficultyScreen state={state} dispatch={dispatch} />}
      {state.screen === 'proficiency-select' && <ProficiencyStarterScreen state={state} dispatch={dispatch} />}
      {state.screen === 'proficiency-result' && <ProficiencyResultScreen state={state} dispatch={dispatch} />}
      {state.toast && (
        <div className={`toast ${state.toast.kind ?? 'info'}`}>
          {state.toast.msg}
        </div>
      )}
    </div>
  );
}

function HUD({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const handleSkip = () => {
    const isFirst = state.currentNodeId === '';
    const targetRow = isFirst ? state.currentRow : state.currentRow + 1;
    const currentCol = isFirst ? null : (state.map.layers[state.currentRow]?.find((n) => n.id === state.currentNodeId)?.col ?? null);
    const nextRow = state.map.layers[targetRow] ?? [];
    const visitedInRow = (state.visitedNodeIds ?? []).filter((id) => nextRow.some((n) => n.id === id));
    const lockedId = visitedInRow.length > 0 ? visitedInRow[0] : null;
    const skipTypes = new Set(['battle', 'elite', 'arena', 'gauntlet', 'corrupted', 'boss']);
    const target = nextRow.find((n) => {
      if (lockedId && n.id !== lockedId) return false;
      if (!skipTypes.has(n.type)) return false;
      return canStepTo(state.currentRow, currentCol, n, state.map);
    });
    if (target) dispatch({ type: 'USE_SKIP', nodeId: target.id, free: true });
  };
  return (
    <div className="hud">
      <span className="act">第 {state.act} 层</span>
      <span>
        <span className="chip">👥 {state.field.length}/{FIELD_MAX}</span>
        <span className="chip">💰 {state.gold}</span>
      </span>
      {state.screen === 'map' && (
        <button className="home-btn" onClick={handleSkip}>
          ⏩ 跳关
        </button>
      )}
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

type PetConfirm = { kind: 'fuse' | 'discard' | 'notice' | 'replace' | 'tame-fuse'; uid?: string; msg?: string; gold?: number; tameUid?: string } | null;

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
  const isProf = state.runMode === 'proficiency';
  const stage = nextStage(unit.speciesId);
  const need = stage ? fusionNeedCount(unit.speciesId) : 0;
  const sameCount = state.roster.filter((x) => x.speciesId === unit.speciesId).length;
  const canFuse = stage !== undefined && sameCount >= need;
  return (
    <div className="unit-card-actions">
      {!isProf && (
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
      )}
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
  const isReplace = confirm.kind === 'replace';
  const isTameFuse = confirm.kind === 'tame-fuse';
  const tameTarget = isTameFuse ? state.tameOverflow?.[0] : undefined;
  return (
    <div className="confirm-overlay" onClick={() => setConfirm(null)}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <div className="section-title">{isFuse ? '确认融合' : isDiscard ? '确认释放' : isReplace ? '确认替换' : isTameFuse ? '确认融合' : '提示'}</div>
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
        {isReplace && target && (
          <p>
            确定要放生「{target.name}」吗？将获得 <b>{confirm.gold ?? 0} 金币</b>，然后「{state.tameOverflow?.[0]?.name ?? '新宠物'}」加入队伍。
          </p>
        )}
        {isTameFuse && target && tameTarget && (
          <p>
            确定要将「{tameTarget.name}」作为材料，与「{target.name}」融合进化为 <b>{getMonster(nextStage(target.speciesId)!).name}</b>？继承强化/诅咒，生命回满。
          </p>
        )}
        {confirm.kind === 'notice' && <p>{confirm.msg}</p>}
        <div className="panel-row" style={{ justifyContent: 'center' }}>
          {(isFuse || isDiscard || isReplace || isTameFuse) ? (
            <>
              <button
                className="primary"
                onClick={() => {
                  if (isFuse) dispatch({ type: 'FUSE', primaryUid: confirm.uid! });
                  else if (isDiscard) dispatch({ type: 'DISCARD', uid: confirm.uid! });
                  else if (isReplace && state.tameOverflow?.[0]) {
                    dispatch({ type: 'TAME_OVERFLOW_REPLACE', tameUid: state.tameOverflow[0].uid, discardUid: confirm.uid! });
                  } else if (isTameFuse && confirm.tameUid) {
                    dispatch({ type: 'TAME_OVERFLOW_FUSE', tameUid: confirm.tameUid, primaryUid: confirm.uid! });
                  }
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

/** 自定义测试可选的全部关卡类型（战斗类需选敌我双方，非战斗类直接进入对应界面） */
const CUSTOM_TYPES: { value: MapNode['type']; label: string }[] = [
  { value: 'battle', label: '⚔ 战斗' },
  { value: 'arena', label: '🆚 斗兽场' },
  { value: 'gauntlet', label: '🔁 车轮战' },
  { value: 'corrupted', label: '☠ 被侵蚀' },
  { value: 'elite', label: '⭐ 精英' },
  { value: 'boss', label: '👑 首领' },
  { value: 'guardian', label: '🛡 守卫' },
  { value: 'rest', label: '🔥 休息' },
  { value: 'shop', label: '🏪 商店' },
  { value: 'event', label: '❓ 事件' },
  { value: 'special', label: '🎁 奇遇' },
  { value: 'watchtower', label: '🔭 瞭望塔' },
  { value: 'sync', label: '📦 双生宝箱' },
  { value: 'keydoor', label: '🗝 钥匙门' },
];

/** 自定义测试需要选宠的战斗类关卡（非战斗类跳过选宠直接进入） */
const TEST_BATTLE_TYPES: MapNode['type'][] = ['battle', 'arena', 'gauntlet', 'corrupted', 'elite', 'boss', 'guardian'];

function TestTypeScreen({ dispatch }: { dispatch: Dispatch<GameAction> }) {
  const [sel, setSel] = useState<MapNode['type']>('battle');
  const [debuff, setDebuff] = useState<'spd' | 'dmg' | 'burn'>('spd');
  const [reward, setReward] = useState<'gold' | 'food'>('gold');
  const [eventType, setEventType] = useState('spring');
  return (
    <div className="screen center-col">
      <div className="hud">
        <span className="act">⚙ 自定义测试 · 选择关卡类型</span>
        <button className="home-btn" onClick={() => dispatch({ type: 'TITLE' })}>
          ↩ 返回首页
        </button>
      </div>
      <div className="side-label">先选择关卡类型，再进入布阵界面依次选我方 / 敌方宠物（同种可上多只）</div>
      <div className="test-type-grid">
        {CUSTOM_TYPES.map((t) => (
          <button
            key={t.value}
            className={`debug-cell big-tap ${sel === t.value ? 'selected' : ''}`}
            onClick={() => setSel(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sel === 'corrupted' && (
        <div className="debug-row">
          <label>侵蚀</label>
          <select value={debuff} onChange={(e) => setDebuff(e.target.value as 'spd' | 'dmg' | 'burn')}>
            <option value="spd">速度 -2</option>
            <option value="dmg">受伤 +2</option>
            <option value="burn">每回合 -2HP</option>
          </select>
          <label>胜利奖励</label>
          <select value={reward} onChange={(e) => setReward(e.target.value as 'gold' | 'food')}>
            <option value="gold">金币</option>
            <option value="food">食物</option>
          </select>
        </div>
      )}
      {sel === 'event' && (
        <div className="debug-row">
          <label>选择事件</label>
          <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
            {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      )}
      <div className="formation-footer">
        <button
          className="primary big-btn"
          onClick={() =>
            dispatch({
              type: 'TEST_TYPE_PICK',
              nodeType: sel,
              corruptDebuff: sel === 'corrupted' ? debuff : undefined,
              corruptReward: sel === 'corrupted' ? reward : undefined,
              eventType: sel === 'event' ? eventType : undefined,
            })
          }
        >
          下一步：{TEST_BATTLE_TYPES.includes(sel) ? '选择宠物' : '进入关卡'}
        </button>
      </div>
    </div>
  );
}

function TestPickScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const tp = state.testPick;
  if (!tp) return null;
  const isPlayerSide = tp.side === 'player';
  const [units, setUnits] = useState<Unit[]>(() => {
    if (isPlayerSide) {
      return [
        makeUnit('momo_god', true, 0, false),
        makeUnit('lulu_god', true, 1, false),
        makeUnit('fifi_god', true, 2, false),
        makeUnit('momo', true, 0, false, 'back'),
        makeUnit('lulu', true, 1, false, 'back'),
        makeUnit('fifi', true, 2, false, 'back'),
      ];
    }
    return [];
  });

  const maxSlots = isPlayerSide ? FIELD_MAX : 6;
  const fieldCount = units.length;
  const bySlot: Record<string, Unit | undefined> = {};
  for (const u of units) bySlot[`${u.row}-${u.column}`] = u;

  function firstEmpty(): { row: FormationRow; column: 0 | 1 | 2 } | null {
    for (const row of ['front', 'back'] as const) {
      for (const col of [0, 1, 2] as const) {
        if (!bySlot[`${row}-${col}`]) return { row, column: col };
      }
    }
    return null;
  }

  function addSpecies(speciesId: string) {
    if (fieldCount >= maxSlots) return;
    const slot = firstEmpty();
    if (!slot) return;
    const u = makeUnit(speciesId, isPlayerSide, slot.column, false, slot.row);
    setUnits((prev) => [...prev, u]);
  }

  function onSlotClick(row: FormationRow, col: 0 | 1 | 2) {
    const existing = bySlot[`${row}-${col}`];
    if (existing) setUnits((prev) => prev.filter((u) => u.uid !== existing.uid));
  }

  function onSlotDrop(e: DragEvent<HTMLDivElement>, row: FormationRow, col: 0 | 1 | 2) {
    e.preventDefault();
    const uid = e.dataTransfer.getData('text/plain');
    const from = units.find((u) => u.uid === uid);
    if (!from) return;
    const target = bySlot[`${row}-${col}`];
    setUnits((prev) =>
      prev.map((u) => {
        if (u.uid === uid) return { ...u, row, column: col };
        if (target && u.uid === target.uid) return { ...u, row: from.row, column: from.column };
        return u;
      }),
    );
  }

  function confirm() {
    const ordered = [...units].sort((a, b) => {
      const ia = (a.row === 'front' ? 0 : 3) + a.column;
      const ib = (b.row === 'front' ? 0 : 3) + b.column;
      return ia - ib;
    });
    if (isPlayerSide) {
      dispatch({ type: 'TEST_PICK_PLAYER_CONFIRM', units: ordered });
    } else {
      dispatch({ type: 'TEST_PICK_ENEMY_CONFIRM', units: ordered });
    }
  }

  const countBySpecies: Record<string, number> = {};
  for (const u of units) countBySpecies[u.speciesId] = (countBySpecies[u.speciesId] ?? 0) + 1;

  return (
    <div className="screen">
      <div className="hud">
        <span className="act">⚙ 自定义测试 · {labelOf(tp.nodeType, 0)} · {isPlayerSide ? '选择我方出战' : '选择敌方阵容'}</span>
        <span className="chip">👥 已选 {fieldCount}/{maxSlots} 只</span>
        <button className="home-btn" onClick={() => dispatch({ type: 'DEBUG_CUSTOM_TEST' })}>
          ↩ 重新选关卡
        </button>
      </div>

      <div className="formation-main">
        <div className="formation-left">
          <div className="side-label">
            {isPlayerSide
              ? '点击下方宠物池即可上阵（同种可多点几只）；点击棋盘上的宠物下阵，拖拽可调整站位'
              : '选择敌方宠物（同种可多点几只），敌方数量决定战斗规模；点击下阵、拖拽调整'}
          </div>
          <div className="formation-board">
            {(['front', 'back'] as const).map((row) => (
              <div key={row} className={`formation-row ${row === 'front' ? 'row-front' : 'row-back'}`}>
                <span className="formation-row-label">{row === 'front' ? '前 排' : '后 排'}</span>
                {([0, 1, 2] as const).map((col) => {
                  const u = bySlot[`${row}-${col}`];
                  return (
                    <div
                      key={`${row}-${col}`}
                      className={`formation-slot ${u ? '' : 'empty'}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => onSlotDrop(e, row, col)}
                      onClick={() => onSlotClick(row, col)}
                    >
                      {u ? (
                        <div
                          draggable
                          title="拖拽调整站位，点击下阵"
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', u.uid)}
                        >
                          <UnitCard unit={u} small showSkills={false} topStats />
                        </div>
                      ) : (
                        <span className="formation-empty-slot">空</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="formation-list">
          <div className="side-label">宠物池（点击上阵，同种可多只）</div>
          <div className="test-pool">
            {Object.values(MONSTERS).map((m) => {
              const cnt = countBySpecies[m.id] ?? 0;
              const full = fieldCount >= maxSlots;
              return (
                <button
                  key={m.id}
                  className={`test-pool-item ${full ? 'disabled' : ''} ${cnt > 0 ? 'has-count' : ''}`}
                  onClick={() => addSpecies(m.id)}
                  title={m.name}
                >
                  <span className="test-pool-emoji">{m.emoji}</span>
                  <span className="test-pool-name">{m.name}</span>
                  {cnt > 0 && <span className="test-pool-count">×{cnt}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="formation-footer">
        <button className="primary big-btn" disabled={fieldCount === 0} onClick={confirm}>
          {isPlayerSide ? '⚔️ 确认我方出战' : '⚔️ 确认敌方阵容'}
        </button>
      </div>
    </div>
  );
}

function TestConfigScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const pb = state.pendingBattle;
  if (!pb) return null;
  const [gold, setGold] = useState(state.gold);
  const [seed, setSeed] = useState(1);
  const [items, setItems] = useState<Record<string, number>>(() => ({ ...state.inventory }));
  const CT_ITEMS: { id: string; label: string }[] = [
    ...Object.keys(FOODS).map((id) => ({ id, label: FOODS[id].name })),
    ...Object.keys(ITEMS).map((id) => ({ id, label: ITEMS[id].name })),
  ];
  const enemyDesc = pb.encounter.map((e) => getMonster(e.speciesId).name).join('、');
  return (
    <div className="screen center-col">
      <div className="hud">
        <span className="act">⚙ 自定义测试 · {labelOf(pb.nodeType, 0)} · 配置战斗</span>
        <button className="home-btn" onClick={() => dispatch({ type: 'TITLE' })}>
          ↩ 返回首页
        </button>
      </div>
      <div className="test-items">
        <div className="side-label">敌方：{enemyDesc}</div>
        <div className="side-label">我方出战：{pb.units.map((u) => u.name).join('、')}</div>
        <div className="debug-row">
          <label>金币</label>
          <input type="number" min={0} value={gold} onChange={(e) => setGold(Number(e.target.value))} style={{ width: 80 }} />
          <label>种子</label>
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} style={{ width: 80 }} />
        </div>
        <div className="side-label">调整本次战斗携带的食物/道具数量，确认后开战</div>
        <div className="debug-grid">
          {CT_ITEMS.map((it) => (
            <label key={it.id} className="debug-cell">
              <span className="debug-cell-name">{it.label}</span>
              <input
                type="number"
                min={0}
                value={items[it.id] ?? 0}
                onChange={(e) => setItems((v) => ({ ...v, [it.id]: Number(e.target.value) }))}
              />
            </label>
          ))}
        </div>
        <button
          className="primary big-btn"
          onClick={() => dispatch({ type: 'TEST_ITEMS_CONFIRM', inventory: items, gold, seed })}
        >
          ⚔ 开始战斗
        </button>
      </div>
    </div>
  );
}

function HomeScreen({ dispatch, currentSaveSlot }: { dispatch: Dispatch<GameAction>; currentSaveSlot?: number }) {
  const [hasSave, setHasSave] = useState<boolean>(() => {
    try {
      for (let i = 1; i <= 6; i++) {
        if (localStorage.getItem(`petCardSave_${i}`)) return true;
      }
    } catch {}
    return false;
  });
  const [showDebug, setShowDebug] = useState(false);
  const [showCodex, setShowCodex] = useState(false);
  const [showSaveMgmt, setShowSaveMgmt] = useState(false);
  const [slots, setSlots] = useState<SaveSlotInfo[]>(() => {
    const result: SaveSlotInfo[] = [];
    for (let i = 1; i <= 6; i++) {
      try {
        const json = localStorage.getItem(`petCardSave_${i}`);
        if (json) {
          const parsed = JSON.parse(json) as Record<string, unknown>;
          // 新格式：{ main?, proficiency? }
          if ('main' in parsed || 'proficiency' in parsed) {
            const main = (parsed.main && typeof parsed.main === 'object' && 'seed' in (parsed.main as object)) ? parsed.main as unknown as GameState : null;
            const prof = (parsed.proficiency && typeof parsed.proficiency === 'object' && 'seed' in (parsed.proficiency as object)) ? parsed.proficiency as unknown as GameState : null;
            result.push({ slot: i, main, proficiency: prof });
          } else if ('seed' in parsed && 'roster' in parsed) {
            // 旧格式：直接 GameState
            const gs = parsed as unknown as GameState;
            if (gs.runMode === 'proficiency') {
              result.push({ slot: i, main: null, proficiency: gs });
            } else {
              result.push({ slot: i, main: gs, proficiency: null });
            }
          } else {
            result.push({ slot: i, main: null, proficiency: null });
          }
        } else {
          result.push({ slot: i, main: null, proficiency: null });
        }
      } catch {
        result.push({ slot: i, main: null, proficiency: null });
      }
    }
    return result;
  });
  const [selectedSlot, setSelectedSlot] = useState<number | undefined>(() => {
    try { return Number(localStorage.getItem('petCardSaveSelected')) || undefined; } catch { return undefined; }
  });
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [overwriteTarget, setOverwriteTarget] = useState<number | null>(null);
  const [profConfirmSlot, setProfConfirmSlot] = useState<number | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [dbgAct, setDbgAct] = useState(1);
  const [dbgRow, setDbgRow] = useState(5);
  const [dbgType, setDbgType] = useState<MapNode['type'] | 'all'>('all');
  const [dbgSeed, setDbgSeed] = useState(42);

  function selectSlot(slot: number | undefined) {
    setSelectedSlot(slot);
    try {
      if (slot) localStorage.setItem('petCardSaveSelected', String(slot));
      else localStorage.removeItem('petCardSaveSelected');
    } catch { /* ignore */ }
  }

  function openSaveMgmt() {
    setShowSaveMgmt(true);
    setSlotsLoading(true);
    void listSaves().then((s) => {
      setSlots(s);
      setHasSave(s.some((x) => x.main || x.proficiency));
      setSlotsLoading(false);
    });
  }

  useEffect(() => {
    let cancelled = false;
    void listSaves().then((s) => {
      if (!cancelled) {
        setSlots(s);
        setHasSave(s.some((x) => x.main || x.proficiency));
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (currentSaveSlot) {
      selectSlot(currentSaveSlot);
    }
  }, [currentSaveSlot, slots]);

  function onNewGame() {
    if (selectedSlot) {
      const target = slots.find((s) => s.slot === selectedSlot);
      if (target?.main || target?.proficiency) {
        setOverwriteTarget(selectedSlot);
        return;
      }
      clearDeletedSlot(selectedSlot);
      selectSlot(selectedSlot);
      dispatch({ type: 'STARTER', saveSlot: selectedSlot, unlocks: loadUnlocks() });
      return;
    }
    const empty = slots.find((s) => !s.main && !s.proficiency);
    if (empty) {
      clearDeletedSlot(empty.slot);
      selectSlot(empty.slot);
      dispatch({ type: 'STARTER', saveSlot: empty.slot, unlocks: loadUnlocks() });
    } else {
      alert('存档已满，请在「存档管理」中删除一个存档');
    }
  }

  function confirmOverwrite() {
    if (overwriteTarget === null) return;
    const slotNum = overwriteTarget;
    const slotState = slots.find((s) => s.slot === slotNum);
    const slotUnlocks = slotState?.main?.unlocks ?? slotState?.proficiency?.unlocks;
    setOverwriteTarget(null);
    if (slotUnlocks) persistUnlocks(slotUnlocks);
    void deleteSaveMode(slotNum, 'main').then(() => {
      setSlots((prev) => {
        const next = prev.map((s) => s.slot === slotNum ? { ...s, main: null } : s);
        setHasSave(next.some((x) => x.main || x.proficiency));
        return next;
      });
      clearDeletedSlot(slotNum);
      selectSlot(slotNum);
      dispatch({ type: 'STARTER', saveSlot: slotNum, unlocks: slotUnlocks });
    });
  }

  function profConfirmContinue() {
    if (profConfirmSlot === null) return;
    const slotState = slots.find(s => s.slot === profConfirmSlot);
    setProfConfirmSlot(null);
    if (slotState?.proficiency) {
      dispatch({ type: 'LOAD_GAME', state: slotState.proficiency });
    }
  }

  function profConfirmRestart() {
    if (profConfirmSlot === null) return;
    const slot = profConfirmSlot;
    setProfConfirmSlot(null);
    clearDeletedSlot(slot);
    selectSlot(slot);
    dispatch({ type: 'START_PROFICIENCY', seed: Date.now(), saveSlot: slot });
  }

  function onContinue() {
    if (!selectedSlot) return;
    const target = slots.find((s) => s.slot === selectedSlot);
    if (!target) return;
    // 优先加载主模式，无则加载熟练度
    const toLoad = target.main ?? target.proficiency;
    if (toLoad) {
      dispatch({ type: 'LOAD_GAME', state: toLoad });
    }
  }

  function onSlotClick(slot: SaveSlotInfo) {
    selectSlot(slot.slot);
    dispatch({ type: 'SHOW_TOAST', msg: `已切换到存档 ${slot.slot}`, kind: 'success' });
  }

  function onDeleteSlot(slotNum: number, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteTarget(slotNum);
  }

  function confirmDelete() {
    if (deleteTarget === null) return;
    const slotNum = deleteTarget;
    setDeleteTarget(null);
    void deleteSave(slotNum).then(() => {
      setSlots((prev) => {
        const next = prev.map((s) => s.slot === slotNum ? { ...s, main: null, proficiency: null } : s);
        setHasSave(next.some((x) => x.main || x.proficiency));
        return next;
      });
      if (selectedSlot === slotNum) {
        selectSlot(undefined);
      }
    });
  }

  function slotSummary(s: SaveSlotInfo) {
    const parts: string[] = [];
    const subs: string[] = [];
    if (s.main) {
      const st = s.main;
      const diffLabel = DIFFICULTY_CONFIG[st.difficulty ?? 'normal'].label;
      parts.push(`主模式 第${st.act}幕 ${st.roster.length}只 ${st.gold}金`);
      subs.push(diffLabel);
    }
    if (s.proficiency) {
      const st = s.proficiency;
      parts.push(`远征 第${st.currentLayer ?? 1}层 ${st.roster.length}只 ${st.gold}金`);
    }
    if (parts.length === 0) return { text: '空', sub: '', cls: 'empty' };
    return {
      text: parts.join(' | '),
      sub: subs.length > 0 ? subs.join(' · ') : '',
      cls: 'occupied',
    };
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
        <button className="primary big-btn" onClick={onNewGame}>
          新游戏
        </button>
        <button className="big-btn" onClick={onContinue} disabled={!selectedSlot || !(slots.find((s) => s.slot === selectedSlot)?.main || slots.find((s) => s.slot === selectedSlot)?.proficiency)}>
          {hasSave === null ? '检查存档…' : selectedSlot ? '继续游戏' : '请先选择存档'}
        </button>
        <button className="big-btn" onClick={openSaveMgmt}>
          💾 存档管理
        </button>
        <button className="big-btn" onClick={() => setShowCodex(true)}>
          📖 生物图鉴
        </button>
        <button className="big-btn" onClick={() => {
          const slotState = slots.find((s) => s.slot === selectedSlot);
          const unlocks = slotState?.main?.unlocks ?? slotState?.proficiency?.unlocks ?? loadUnlocks();
          dispatch({ type: 'ACHIEVEMENTS', unlocks });
        }}>
          🏆 成就
        </button>
        {(() => {
          const slotState = slots.find((s) => s.slot === selectedSlot);
          const unlocks = slotState?.main?.unlocks ?? slotState?.proficiency?.unlocks ?? loadUnlocks();
          const profLocked = !unlocks.proficiencyUnlocked;
          return (
            <button
              className={`big-btn${profLocked ? ' locked-btn' : ''}`}
              disabled={profLocked}
              onClick={() => {
                if (profLocked) return;
                // 确保有选中槽位：优先当前选中，否则选有存档的，最后选空槽
                let slot = selectedSlot;
                if (!slot) {
                  const occupied = slots.find(s => s.main || s.proficiency);
                  slot = occupied ? occupied.slot : slots.find(s => !s.main && !s.proficiency)?.slot;
                }
                if (!slot) { alert('存档已满，请在「存档管理」中删除一个存档'); return; }

                // 检查该槽是否有未完成的熟练度远征
                const slotState2 = slots.find(s => s.slot === slot);
                if (slotState2?.proficiency) {
                  setProfConfirmSlot(slot);
                  return;
                }

                // 无远征记录 → 新开
                clearDeletedSlot(slot);
                selectSlot(slot);
                dispatch({ type: 'START_PROFICIENCY', seed: Date.now(), saveSlot: slot });
              }}
            >
              ⚔️ 熟练度远征
              {profLocked && <span className="locked-hint">🔒 通关第 1 幕后解锁</span>}
            </button>
          );
        })()}
        <button className="big-btn" onClick={() => setShowDebug((v) => !v)}>
          {showDebug ? '收起测试面板' : '🔬 测试关卡'}
        </button>
        <button className="big-btn" onClick={quitGame}>
          退出游戏
        </button>
      </div>
      {showSaveMgmt && (
        <div className="save-mgmt-overlay" onClick={() => setShowSaveMgmt(false)}>
          <div className="save-mgmt-panel" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">存档管理</div>
            {slotsLoading ? (
              <div style={{ padding: 20, color: 'var(--muted)', textAlign: 'center' }}>⏳ 存档加载中…</div>
            ) : (
              <div className="save-grid">
                {slots.map((s) => {
                  const info = slotSummary(s);
                  const isActive = s.slot === selectedSlot;
                  return (
                    <div
                      key={s.slot}
                      className={`save-slot ${info.cls}${isActive ? ' active' : ''}`}
                      onClick={() => onSlotClick(s)}
                    >
                      <div className="save-slot-num">存档 {s.slot}{isActive ? '（当前）' : ''}</div>
                      <div className="save-slot-text">{info.text}</div>
                      {info.sub && <div className="save-slot-sub">{info.sub}</div>}
                      {(s.main || s.proficiency) && (
                        <button className="save-slot-del" onClick={(e) => onDeleteSlot(s.slot, e)} title="删除存档">✕</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <button className="big-btn" style={{ marginTop: 16 }} onClick={() => setShowSaveMgmt(false)}>关闭</button>
          </div>
        </div>
      )}
      {deleteTarget !== null && (
        <div className="confirm-overlay" style={{ zIndex: 1100 }} onClick={() => setDeleteTarget(null)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">⚠️ 删除存档</div>
            <p style={{ margin: '10px 0', color: 'var(--text-dim)' }}>
              确定要删除存档 <b style={{ color: 'var(--gold)' }}>{deleteTarget}</b> 吗？
            </p>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-dim)' }}>
              此操作不可撤销。
            </p>
            <div className="panel-row" style={{ justifyContent: 'center' }}>
              <button className="primary" onClick={confirmDelete}>确定删除</button>
              <button onClick={() => setDeleteTarget(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {overwriteTarget !== null && (
        <div className="confirm-overlay" style={{ zIndex: 1100 }} onClick={() => setOverwriteTarget(null)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">⚠️ 覆盖存档</div>
            <p style={{ margin: '10px 0', color: 'var(--text-dim)' }}>
              存档 <b style={{ color: 'var(--gold)' }}>{overwriteTarget}</b> 已有游戏，确定覆盖？
            </p>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-dim)' }}>
              旧存档将被删除，此操作不可撤销。
            </p>
            <div className="panel-row" style={{ justifyContent: 'center' }}>
              <button className="primary" onClick={confirmOverwrite}>确定覆盖</button>
              <button onClick={() => setOverwriteTarget(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {profConfirmSlot !== null && (
        <div className="confirm-overlay" style={{ zIndex: 1100 }} onClick={() => setProfConfirmSlot(null)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">⚔️ 熟练度远征</div>
            <p style={{ margin: '10px 0', color: 'var(--text-dim)' }}>
              存档 <b style={{ color: 'var(--gold)' }}>{profConfirmSlot}</b> 有未完成的熟练度远征
            </p>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-dim)' }}>
              重新开始将覆盖当前远征记录
            </p>
            <div className="panel-row" style={{ justifyContent: 'center' }}>
              <button className="primary" onClick={profConfirmContinue}>继续游戏</button>
              <button onClick={profConfirmRestart}>重新开始</button>
            </div>
          </div>
        </div>
      )}
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
          <div className="debug-hint">调试模式：自动配备 3 只最高进化形态宠物、500 金币、3 个跳关道具；节点类型仅显示当前幕当前层实际存在的类型</div>
          <button className="debug-sub-toggle" onClick={() => dispatch({ type: 'DEBUG_CUSTOM_TEST' })}>
            ⚙ 自定义测试（选关卡 → 选我方 → 选敌方 → 配置 → 开战）
          </button>
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
        items: Object.values(MONSTERS)
          .filter(g.match)
          .sort((a, b) => {
            const numA = a.image ? parseInt(a.image.replace('/', '').replace('.png', ''), 10) : 999;
            const numB = b.image ? parseInt(b.image.replace('/', '').replace('.png', ''), 10) : 999;
            return numA - numB;
          }),
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
              {g.items.map((m) => {
                const num = m.image ? m.image.replace('/', '').replace('.png', '') : '';
                return (
                  <div
                    key={m.id}
                    className={`codex-item ${m.id === selectedId ? 'selected' : ''}`}
                    onClick={() => setSelectedId(m.id)}
                  >
                    <span className="codex-item-num">{num}</span>
                    <span className="codex-item-name">{m.name}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="codex-detail">
          <div className="codex-detail-head">
            <span className="codex-detail-emoji">{sp.image ? <img src={sp.image} className="pet-image" alt={sp.name} /> : sp.emoji}</span>
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

          {sp.altSkills && sp.altPassive && (() => {
            const p1 = getPassive(sp.passive);
            const p2 = getPassive(sp.altPassive);
            return (
              <>
                <div className="codex-form-block form-1">
                  <div className="codex-form-title">🔥 形态1：HP &gt; 50%</div>
                  {p1 && (
                    <div className="codex-passive" title={p1.desc}>
                      💠 {p1.name}：{p1.desc}
                    </div>
                  )}
                  <div className="codex-skills">
                    {sp.skills.map((sid) => {
                      const s = getSkill(sid);
                      return <SkillTag key={sid} skill={s} desc usesNote />;
                    })}
                  </div>
                </div>
                <div className="codex-form-block form-2">
                  <div className="codex-form-title">💥 形态2：HP ≤ 50%</div>
                  {p2 && (
                    <div className="codex-passive" title={p2.desc}>
                      💠 {p2.name}：{p2.desc}
                    </div>
                  )}
                  <div className="codex-skills">
                    {sp.altSkills.map((sid) => {
                      const s = getSkill(sid);
                      return <SkillTag key={sid} skill={s} desc usesNote />;
                    })}
                  </div>
                </div>
              </>
            );
          })()}

          {!sp.altSkills && (
            <>
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
            </>
          )}

          <div className="codex-section">
            <div className="codex-sec-title">🎣 驯服</div>
            <div className="codex-line">
              {tameable ? `驯服成功率 ${Math.round(sp.tame.difficulty * 100)}%` : '首领 · 不可驯服'}
            </div>
          </div>

          <div className="codex-section">
            <div className="codex-sec-title">✨ 融合</div>
            <div className="codex-line">
              {next ? (
                <>
                  需 {fusionNeedCount(sp.id)} 只同物种 →{' '}
                  <span
                    className="codex-link"
                    onClick={() => setSelectedId(next)}
                  >
                    <PetIcon image={getMonster(next).image} emoji={getMonster(next).emoji} name={getMonster(next).name} /> {getMonster(next).name}
                  </span>
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

function DifficultyScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('normal');
  const [selectedRelic, setSelectedRelic] = useState<string>('');
  const unlocks = state.unlocks ?? { ...DEFAULT_UNLOCKS };
  const diffCfg = DIFFICULTY_CONFIG[selectedDifficulty];

  const handleNext = () => {
    dispatch({ type: 'SET_PRERUN_CONFIG', difficulty: selectedDifficulty, relic: selectedRelic || undefined });
  };

  const diffEffects: string[] = [];
  if (diffCfg.enemyHpMult !== 1) diffEffects.push(`敌方生命 ×${diffCfg.enemyHpMult}`);
  if (diffCfg.enemySpdBonus !== 0) diffEffects.push(`敌方速度 +${diffCfg.enemySpdBonus}`);
  if (diffCfg.shopPriceMult !== 1) diffEffects.push(`商品价格 ×${diffCfg.shopPriceMult}`);
  if (diffCfg.healRatio !== 0.6) diffEffects.push(`战后回血 ${Math.round(diffCfg.healRatio * 100)}%`);
  if (diffCfg.eliteBoost !== 0) diffEffects.push(`精英额外加成`);

  const relicDef = selectedRelic ? RELIC_DEFS[selectedRelic] : null;

  return (
    <div className="center-col">
      <div className="section-title">选择难度与遗物</div>
      {/* 难度选择 */}
      <div className="config-section">
        <div className="config-label">难度</div>
        <div className="config-row">
          {DIFFICULTY_ORDER.map((d) => {
            const cfg = DIFFICULTY_CONFIG[d];
            const locked = !unlocks.difficulties.includes(d);
            return (
              <button
                key={d}
                className={`config-btn ${selectedDifficulty === d ? 'selected' : ''} ${locked ? 'locked' : ''}`}
                disabled={locked}
                onClick={() => setSelectedDifficulty(d)}
                title={locked ? '未解锁' : cfg.label}
              >
                {locked ? '🔒' : ''} {cfg.label}
              </button>
            );
          })}
        </div>
        {diffEffects.length > 0 && (
          <div className="config-effect">{diffEffects.join(' · ')}</div>
        )}
        {diffEffects.length === 0 && (
          <div className="config-effect">标准难度，无额外修正</div>
        )}
      </div>
      {/* 遗物选择 */}
      <div className="config-section">
        <div className="config-label">初始遗物（可选）</div>
        <div className="config-row">
          <button
            className={`config-btn ${selectedRelic === '' ? 'selected' : ''}`}
            onClick={() => setSelectedRelic('')}
          >
            无
          </button>
          {RELIC_ORDER.filter((id) => unlocks.relics.includes(id)).map((id) => {
            const def = RELIC_DEFS[id];
            return (
              <button
                key={id}
                className={`config-btn ${selectedRelic === id ? 'selected' : ''}`}
                onClick={() => setSelectedRelic(id)}
              >
                {def.emoji} {def.name}
              </button>
            );
          })}
          {RELIC_ORDER.every((id) => !unlocks.relics.includes(id)) && (
            <span className="config-hint">通关后解锁遗物</span>
          )}
        </div>
        {relicDef && (
          <div className="config-effect">{relicDef.emoji} {relicDef.name}：{relicDef.desc}</div>
        )}
        {!relicDef && (
          <div className="config-effect">未选择遗物</div>
        )}
      </div>
      <div className="panel-row" style={{ gap: 12, marginTop: 16 }}>
        <button className="big-btn" onClick={() => dispatch({ type: 'TITLE' })}>返回</button>
        <button className="primary big-btn" onClick={handleNext}>下一步：选择伙伴</button>
      </div>
    </div>
  );
}

function StarterScreen({ dispatch }: { dispatch: Dispatch<GameAction> }) {
  const [firstPick, setFirstPick] = useState<string | null>(null);

  const startRun = (starterId: string, companionId: string) => {
    dispatch({ type: 'START_RUN', starterId, companionId, seed: newSeed() });
  };

  if (firstPick) {
    return (
      <div className="center-col">
        <div className="section-title">选择你的初始伙伴</div>
        <div className="starter-hint">
          <span className="chosen-one">{getMonster(firstPick).emoji} {getMonster(firstPick).name} ×2</span> 已选择
        </div>
        <div className="section-sub">再选一只同伴（获得 1 只）</div>
        <div className="starter-grid">
          {STARTER_GROUP_2.map((id) => {
            const sp = getMonster(id);
            const stats = computeStats(id);
            return (
              <div key={id} className="unit-card clickable" onClick={() => startRun(firstPick, id)}>
                <div className="card-top">
                  <span className="emoji">{sp.image ? <img src={sp.image} className="pet-image" alt={sp.name} /> : sp.emoji}</span>
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
        <button className="big-btn" style={{ marginTop: 12 }} onClick={() => setFirstPick(null)}>返回重选</button>
      </div>
    );
  }

  return (
    <div className="center-col">
      <div className="section-title">选择你的初始伙伴</div>
      <div className="section-sub">选一只主力（获得 2 只）</div>
      <div className="starter-grid">
        {STARTER_GROUP_1.map((id) => {
          const sp = getMonster(id);
          const stats = computeStats(id);
          return (
            <div key={id} className="unit-card clickable" onClick={() => setFirstPick(id)}>
              <div className="card-top">
                  <span className="emoji">{sp.image ? <img src={sp.image} className="pet-image" alt={sp.name} /> : sp.emoji}</span>
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
      <button className="big-btn" style={{ marginTop: 12 }} onClick={() => dispatch({ type: 'SELECT_DIFFICULTY_BACK' })}>返回：重新选择难度</button>
    </div>
  );
}

function ProficiencyStarterScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : prev
    );
  };

  const confirmed = selected.length === 2;

  return (
    <div className="center-col">
      <div className="section-title">⚔️ 熟练度远征</div>
      <div className="section-sub">从 6 只基础生物中选择 2 只出征</div>
      <div className="starter-grid">
        {BASE_POOL.map((id) => {
          const sp = getMonster(id);
          const stats = computeStats(id);
          const isSel = selected.includes(id);
          return (
            <div
              key={id}
              className={`unit-card clickable ${isSel ? 'selected' : ''}`}
              onClick={() => toggle(id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div className="card-top" style={{ margin: 0 }}>
                  <span className="emoji">{sp.image ? <img src={sp.image} className="pet-image" alt={sp.name} /> : sp.emoji}</span>
                </div>
                <div className="card-name" style={{ margin: 0 }}>{sp.name}</div>
              </div>
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
      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 8 }}>
        已选 {selected.length}/2{confirmed ? ' — 点击「出发」开始远征' : ' — 点击卡片选择或取消'}
      </p>
      <button
        className="primary big-btn"
        disabled={!confirmed}
        onClick={() => {
          dispatch({
            type: 'START_PROFICIENCY_PICKED',
            seed: state.seed ?? Date.now(),
            saveSlot: state.saveSlot,
            starterId: selected[0],
            companionId: selected[1],
          });
        }}
      >
        {confirmed ? '出发 →' : '请选择 2 只'}
      </button>
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
    (lockedNodeId == null || n.id === lockedNodeId) && !isDisabled(n) && !isLocked(n) && canStepTo(state.currentRow, currentCol, n, state.map);

  // 路线预览：默认显示当前节点 → 下一步可达；悬停某节点时显示该节点的下一步可达
  const nextRow = state.map.layers[optionsRow] ?? EMPTY_ROW;
  const visitedInOptions = useMemo(
    () => nextRow.filter((n) => (state.visitedNodeIds ?? []).includes(n.id)),
    [nextRow, state.visitedNodeIds],
  );
  const lockedNodeId = visitedInOptions.length > 0 ? visitedInOptions[0].id : null;
  const nearIds = useMemo(
    () =>
      new Set(
        nextRow
          .filter((n) => canStepTo(state.currentRow, currentCol, n, state.map))
          .filter((n) => lockedNodeId == null || n.id === lockedNodeId)
          .map((n) => n.id),
      ),
    [nextRow, state.currentRow, currentCol, lockedNodeId],
  );
  const [hoverId, setHoverId] = useState<string | null>(null);
  const hoverRow = hoverId ? state.map.layers.findIndex((r) => r.some((n) => n.id === hoverId)) : -1;
  const hoverNode = hoverId && hoverRow >= 0 ? state.map.layers[hoverRow].find((n) => n.id === hoverId) : undefined;
  const hoverNextRow =
    hoverNode && hoverRow + 1 < state.map.layers.length ? state.map.layers[hoverRow + 1] : EMPTY_ROW;
  const hoverReachIds = useMemo(
    () =>
      hoverNode
        ? new Set(hoverNextRow.filter((m) => canStepTo(hoverRow, hoverNode.col, m, state.map)).map((m) => m.id))
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

  // 每次进入地图，滚动定位到当前所在节点（居中）
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const el = state.currentNodeId ? nodeEls.current[state.currentNodeId] : null;
    if (!el) return;
    const rect = canvas.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const targetTop = canvas.scrollTop + r.top - rect.top - (rect.height - r.height) / 2;
    const targetLeft = canvas.scrollLeft + r.left - rect.left - (rect.width - r.width) / 2;
    canvas.scrollTop = Math.max(0, targetTop);
    canvas.scrollLeft = Math.max(0, targetLeft);
  }, [state.currentNodeId]);

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
    // 战斗胜利后禁止选择出战
    if (state.postBattle) return;
    const inField = state.field.includes(uid);
    if (inField) {
      dispatch({ type: 'SET_FIELD', uids: state.field.filter((u) => u !== uid) });
    } else {
      const isBoss = !!state.map.boss[state.currentNodeId];
      const enemyCount = state.formation?.encounter?.length ?? 1;
      const maxField = isBoss ? (state.runMode === 'proficiency' ? PROF_FIELD_MAX : FIELD_MAX) : maxFieldForEnemy(enemyCount, state.runMode);
      if (state.field.length < maxField) {
        dispatch({ type: 'SET_FIELD', uids: [...state.field, uid] });
      }
    }
  };

  const pending = state.specialPending;
  const evolveMode = pending?.kind === 'evolve';
  const boostMode = pending?.kind === 'boost';
  const arenaMode = pending?.kind === 'arena';
  const growthPointMode = pending?.kind === 'growthPoint';
  const shopSlotUnlockMode = pending?.kind === 'shopSlotUnlock';
  const eventBoostMode = pending?.kind === 'eventBoostHp' || pending?.kind === 'eventBoostSpd';
  const eventResetGrowthMode = pending?.kind === 'eventResetGrowth';
  const eventSkillReplaceMode = pending?.kind === 'eventSkillReplace';
  const arena3ExhibitionMode = pending?.kind === 'arena3Exhibition';
  const [confirm, setConfirm] = useState<PetConfirm>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const title = evolveMode
    ? pending.super
      ? '超进化：选择要进化的宠物（会附带随机负面诅咒）'
      : '进化之光：选择要进化的宠物'
    : boostMode
      ? '属性强化：选择要强化的宠物'
      : growthPointMode
        ? `选择一只宠物获得 ${pending.amount ?? 1} 成长点`
        : eventBoostMode
          ? `选择一只宠物永久 +${pending.amount ?? 1} ${pending.kind === 'eventBoostSpd' ? '速度' : '生命'}`
          : eventResetGrowthMode
            ? '选择一只宠物重置其成长点'
            : eventSkillReplaceMode
              ? '选择一只宠物替换技能'
              : shopSlotUnlockMode
                ? `选择一只宠物解锁第${pending.slot === 4 ? '5' : '4'}技能槽`
                : arenaMode
                  ? '斗兽场：选择 1 只宠物出战（1v1 单挑，胜利得丰厚奖励）'
                  : arena3ExhibitionMode
                    ? '表演赛：选择 1 只宠物获得 5 成长点'
                    : state.postBattle
              ? '战后休整（只能释放或融合宠物）'
              : `队伍管理（上限 ${getMaxRoster(state.runMode)} 只）`;

  return (
    <div className="screen">
      <HUD state={state} dispatch={dispatch} />
      <div className="section-title">{title}</div>
      {!evolveMode && !boostMode && !growthPointMode && !shopSlotUnlockMode && !arenaMode && !arena3ExhibitionMode && !state.postBattle && (
        <div className="panel-row" style={{ marginBottom: 10 }}>
          <span className="card-sub">出战宠物（点击下方宠物卡加入/移除）：</span>
          {state.field.map((uid) => {
            const u = state.roster.find((x) => x.uid === uid);
            return u ? <span className="chip" key={uid}><PetIcon image={u.image} emoji={u.emoji} name={u.name} /> {u.name}</span> : null;
          })}
        </div>
      )}
      <div className="roster-list">
        {state.roster.map((u) => {
          const canEvolve = nextStage(u.speciesId) !== undefined;
          const onCard = evolveMode
            ? canEvolve
              ? () => dispatch({ type: 'EVOLVE_ONE', uid: u.uid })
              : undefined
            : boostMode || growthPointMode || shopSlotUnlockMode || eventBoostMode || eventResetGrowthMode || eventSkillReplaceMode
              ? () => dispatch({ type: 'SPECIAL_TARGET', uid: u.uid })
              : arenaMode
                ? () => dispatch({ type: 'SPECIAL_TARGET', uid: u.uid })
                : arena3ExhibitionMode
                  ? () => dispatch({ type: 'SPECIAL_TARGET', uid: u.uid })
                  : state.postBattle
                  ? () => setSelectedUid(selectedUid === u.uid ? null : u.uid)
                  : () => toggleField(u.uid);
          const isPostBattleSelected = state.postBattle && selectedUid === u.uid;
          return (
        <div key={u.uid} className="roster-item">
          <UnitCard
            unit={u}
            className={`roster-card ${(evolveMode && canEvolve) || boostMode || growthPointMode || eventBoostMode || eventResetGrowthMode || eventSkillReplaceMode || arenaMode || state.postBattle ? 'clickable' : ''} ${isPostBattleSelected ? 'selected' : ''}`}
            onClick={onCard}
            showSkillDesc
            topStats
            footer={
              !evolveMode && !boostMode && !growthPointMode && !eventBoostMode && !eventResetGrowthMode && !eventSkillReplaceMode && !arenaMode ? <PetCardFooter unit={u} state={state} setConfirm={setConfirm} /> : undefined
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
      {!evolveMode && !boostMode && !growthPointMode && !eventBoostMode && !eventResetGrowthMode && !eventSkillReplaceMode && !arenaMode && (
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
  const boughtItems = state.shopBoughtItems ?? [];
  const isProf = state.runMode === 'proficiency';
  const profShopIds = ['heal_potion', 'gold_bag', 'book_small', 'book_large', 'growth_stone', 'stat_boost', 'slot_unlock', 'skill_replace', 'forget_stone', 'pet_recruit', 'reset_stone', 'skill_enhance_stone'];
  const stock = (state.shopStock ?? []).filter((id) =>
    isProf ? profShopIds.includes(id) : (!!FOODS[id] || !!ITEMS[id])
  );
  const refreshCount = state.shopRefreshCount ?? 0;
  const refreshCost = 5 + refreshCount * 5;
  const canRefresh = refreshCount < 3 && state.gold >= refreshCost;
  return (
    <div className="screen">
      <HUD state={state} dispatch={dispatch} />
      <div className="section-title">商人 🏪</div>
      <p className="card-sub" style={{ textAlign: 'center' }}>
        本店随机出售 4 种商品。
      </p>
      <div className="reward-cards">
        {stock.map((id) => {
          const profShopData: Record<string, { label: string; emoji: string; desc: string; price: number }> = {
            heal_potion: { label: '治疗圣水', emoji: '🧪', desc: '全队回复 50% 生命', price: 30 },
            gold_bag: { label: '金币袋', emoji: '💰', desc: '获得 25 金币', price: 10 },
            book_small: { label: '成长之书（小）', emoji: '📖', desc: '选择一只宠物获得 1 成长点', price: 12 },
            book_medium: { label: '成长之书（中）', emoji: '📕', desc: '选择一只宠物获得 2 成长点', price: 22 },
            book_large: { label: '成长之书（大）', emoji: '📚', desc: '选择一只宠物获得 3 成长点', price: 30 },
            growth_stone: { label: '成长之石', emoji: '💎', desc: '选择一只宠物获得 1 成长点', price: 15 },
            stat_boost: { label: '属性强化', emoji: '⚡', desc: '选择一只宠物提升属性', price: 18 },
            slot_unlock: { label: '技能槽解锁', emoji: '🔓', desc: '选择一只宠物解锁技能槽', price: 50 },
            skill_replace: { label: '技能替换', emoji: '🔄', desc: '选择一只宠物替换技能', price: 12 },
            forget_stone: { label: '遗忘之石', emoji: '🪨', desc: '选择一只宠物重置成长点', price: 30 },
            pet_recruit: { label: '宠物招募', emoji: '🐾', desc: '招募一只随机宠物', price: 20 },
            reset_stone: { label: '还原石', emoji: '💎', desc: '重置技能强化等级（返还50%消耗）', price: 25 },
            skill_enhance_stone: { label: '技能强化石', emoji: '⚒️', desc: '强化1个技能（无需成长点）', price: 40 },
            revival_stone: { label: '复活石', emoji: '🪹', desc: '复活1只死亡宠物（保留50%属性）', price: 60 },
          };
          const profItem = isProf ? profShopData[id] : undefined;
          const f = !isProf ? FOODS[id] : undefined;
          const it = !isProf ? ITEMS[id] : undefined;
          const name = profItem?.label ?? f?.name ?? it?.name ?? id;
          const emoji = profItem?.emoji ?? f?.emoji ?? it?.emoji ?? '🎁';
          const desc = profItem?.desc ?? f?.desc ?? it?.desc ?? '';
          const price = profItem?.price ?? f?.price ?? it?.price ?? 0;
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
                  onClick={() => dispatch(isProf ? { type: 'PROF_SHOP_BUY', itemId: id } : { type: 'SHOP_BUY', foodId: id })}
                >
                  {soldOut ? '已购买' : '购买'}
                </button>
              </div>
            </div>
          );
        })}
        {!isProf && (
        <div className="reward-card">
          <div className="ricon">🛌</div>
          <div className="rtitle">立即休整</div>
          <div className="rdesc">免费让全队回满血（不解超进化诅咒）</div>
          <div className="panel-row" style={{ justifyContent: 'center', marginTop: 8 }}>
            <button
              className="primary"
              disabled={state.roster.every((u) => u.hp >= u.maxHp)}
              onClick={() => dispatch({ type: 'SHOP_REST' })}
            >
              {state.roster.every((u) => u.hp >= u.maxHp) ? '已满血' : '休整'}
            </button>
          </div>
        </div>
        )}
        <div className="reward-card">
          <div className="ricon">🔄</div>
          <div className="rtitle">刷新商品</div>
          <div className="rdesc">{refreshCount >= 3 ? '刷新次数已用尽' : `花费 ${refreshCost} 金币刷新全部商品（剩余 ${3 - refreshCount} 次）`}</div>
          <div className="panel-row" style={{ justifyContent: 'center', marginTop: 8 }}>
            {refreshCount < 3 && <span className="chip">💰 {refreshCost}</span>}
            <button
              className="primary"
              disabled={!canRefresh}
              onClick={() => dispatch(isProf ? { type: 'PROF_SHOP_REFRESH' } : { type: 'SHOP_REFRESH' })}
            >
              {refreshCount >= 3 ? '已用完' : '刷新'}
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

function RestScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const isProf = state.runMode === 'proficiency';
  return (
    <div className="center-col">
      <div style={{ fontSize: 56 }}>🛌</div>
      <div className="title-sub">营火休整</div>
      {isProf ? (
        <>
          <p className="card-sub">选择一项：恢复全部生命，或进行宠物融合</p>
          <button className="primary big-btn" style={{ marginBottom: 12 }} onClick={() => dispatch({ type: 'REST_HEAL' })}>
            休息（恢复满血）
          </button>
          <button
            className="primary big-btn"
            disabled={state.roster.length < 2}
            onClick={() => dispatch({ type: 'REST_FUSION_MODE' })}
          >
            宠物融合
          </button>
        </>
      ) : (
        <>
          <p className="card-sub">让所有宠物恢复全部生命</p>
          <button className="primary big-btn" onClick={() => dispatch({ type: 'REST_HEAL' })}>
            休息（恢复满血）
          </button>
        </>
      )}
    </div>
  );
}

function ReviveSelectScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const deadPets = state.deadPets ?? [];
  if (deadPets.length === 0) {
    return (
      <div className="screen">
        <div className="section-title">灵魂墓园</div>
        <p className="card-sub">没有死亡的宠物可复活</p>
        <button className="btn" onClick={() => dispatch({ type: 'BACK_TO_MAP' })}>返回</button>
      </div>
    );
  }
  const ratio = state.reviveRatio ?? 0.5;
  return (
    <div className="screen">
      <div className="section-title">灵魂墓园</div>
      <p className="card-sub">选择一只死亡宠物复活（保留 {Math.round(ratio * 100)}% 属性）</p>
      <div className="reward-cards">
        {deadPets.map((u) => {
          const species = getMonster(u.speciesId);
          const newHp = Math.max(1, Math.round(u.maxHp * ratio));
          const newMaxHp = ratio >= 1 ? u.maxHp : Math.round(u.maxHp * ratio);
          const newSpd = ratio >= 1 ? u.spd : Math.max(1, Math.round(u.spd * ratio));
          return (
            <button key={u.uid} className="reward-card" onClick={() => dispatch({ type: 'REVIVE', uid: u.uid, ratio })}>
              <div className="reward-card-emoji">{species.emoji}</div>
              <div className="reward-card-name">{u.name}</div>
              <div className="reward-card-desc">
                HP: {newHp}/{newMaxHp} | SPD: {newSpd}
              </div>
            </button>
          );
        })}
      </div>
      <button className="btn" onClick={() => dispatch({ type: 'BACK_TO_MAP' })}>返回</button>
    </div>
  );
}

function RestFusionScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  // ─── 技能选择阶段 ───
  if (state.screen === 'rest-fusion-skill') {
    const unit = state.roster.find((u) => u.uid === state.fusionMainUid);
    const subSkills = state.fusionSubSkills ?? [];
    const learnSkill = state.fusionLearnSkill;
    const replaceIdx = state.fusionReplaceIdx;
    const maxSlots = unit ? getMaxSkillSlots(unit) : 3;
    const hasEmptySlot = unit ? unit.skills.length < maxSlots : false;
    const canConfirm = !!learnSkill && (replaceIdx !== undefined || hasEmptySlot);

    if (!unit) {
      return (
        <div className="screen">
          <div className="section-title">融合</div>
          <p className="card-sub">找不到目标宠物</p>
          <button className="btn" onClick={() => dispatch({ type: 'REST_FUSION_CANCEL' })}>返回</button>
        </div>
      );
    }

    return (
      <div className="screen">
        <div className="section-title">选择技能</div>
        <p className="card-sub">为 {unit.name} 选择要继承的技能（从副宠），再选择要替换的已有技能，最后点击确认</p>

        <div className="fusion-skill-layout">
          {/* 左栏：副宠技能（选择要学的） */}
          <div className="fusion-skill-col">
            <div className="fusion-skill-header">副宠技能（点击选择继承）</div>
            <div className="fusion-skill-list">
              {subSkills.map((sid) => {
                const sk = getSkill(sid);
                const selected = learnSkill === sid;
                return (
                  <button
                    key={sid}
                    className={`fusion-skill-btn ${selected ? 'selected' : ''}`}
                    onClick={() => dispatch({ type: 'REST_FUSION_SET_LEARN', skillId: sid })}
                  >
                    <span className="fusion-skill-name">{sk?.name ?? sid}</span>
                    <span className="fusion-skill-desc">{sk?.desc ?? ''}</span>
                    {sk?.damage != null && <span className="fusion-skill-stat">伤害 {sk.damage}</span>}
                    {sk?.heal != null && <span className="fusion-skill-stat">治疗 {sk.heal}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 右栏：主宠已有技能（选择要替换的） */}
          <div className="fusion-skill-col">
            <div className="fusion-skill-header">主宠技能（{learnSkill ? '点击替换' : '先选左侧技能'}）</div>
            <div className="fusion-skill-list">
              {unit.skills.map((sid, idx) => {
                const sk = getSkill(sid);
                const canReplace = !!learnSkill;
                const selected = replaceIdx === idx;
                return (
                  <button
                    key={`${sid}-${idx}`}
                    className={`fusion-skill-btn ${canReplace ? 'replaceable' : ''} ${selected ? 'replace-selected' : ''}`}
                    disabled={!canReplace}
                    onClick={() => {
                      if (learnSkill) {
                        dispatch({ type: 'REST_FUSION_SELECT_REPLACE', replaceIdx: idx });
                      }
                    }}
                  >
                    <span className="fusion-skill-name">{sk?.name ?? sid}</span>
                    <span className="fusion-skill-desc">{sk?.desc ?? ''}</span>
                    {sk?.damage != null && <span className="fusion-skill-stat">伤害 {sk.damage}</span>}
                    {sk?.heal != null && <span className="fusion-skill-stat">治疗 {sk.heal}</span>}
                    <span className="fusion-skill-slot">槽位 {idx + 1}</span>
                  </button>
                );
              })}
              {hasEmptySlot && learnSkill && (
                <button
                  className={`fusion-skill-btn empty-slot ${replaceIdx === -1 ? 'replace-selected' : ''}`}
                  onClick={() => dispatch({ type: 'REST_FUSION_SELECT_REPLACE', replaceIdx: unit.skills.length })}
                >
                  <span className="fusion-skill-name">+ 添加到空槽</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 确认按钮 */}
        <div className="fusion-confirm-row">
          <button
            className="big-btn"
            onClick={() => dispatch({ type: 'REST_FUSION_CANCEL' })}
          >
            ← 返回
          </button>
          <button
            className="primary big-btn"
            disabled={!canConfirm}
            onClick={() => {
              if (learnSkill) {
                dispatch({ type: 'REST_FUSION_SKILL', skillId: learnSkill, replaceIdx });
              }
            }}
          >
            {canConfirm ? '确认替换' : '请先选择技能'}
          </button>
        </div>
      </div>
    );
  }

  // ─── 宠物选择阶段（rest-fusion） ───
  const main = state.fusionMainUid ? state.roster.find((u) => u.uid === state.fusionMainUid) : undefined;
  const sub = state.fusionSubUid ? state.roster.find((u) => u.uid === state.fusionSubUid) : undefined;
  const canConfirm = !!main && !!sub && main.uid !== sub.uid;

  // 拖拽处理
  const handleDragStart = (e: React.DragEvent, uid: string, slot: 'main' | 'sub') => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ uid, from: slot }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetSlot: 'main' | 'sub') => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (targetSlot === 'main') {
        dispatch({ type: 'REST_FUSION_SET_MAIN', uid: data.uid });
      } else {
        dispatch({ type: 'REST_FUSION_SET_SUB', uid: data.uid });
      }
    } catch { /* ignore */ }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // 副宠属性预览
  const subBase = sub ? getMonster(sub.speciesId) : undefined;
  const hpGain = subBase ? Math.round(subBase.baseHp * 0.5) : 0;
  const spdGain = subBase ? Math.round(subBase.baseSpd * 0.5) : 0;

  return (
    <div className="screen">
      <div className="section-title">宠物融合</div>
      <p className="card-sub">拖动或点击宠物放入槽位，主宠继承副宠 50% 基础属性和 30% 成长点并学习一个技能</p>

      {/* 两个槽位 */}
      <div className="fusion-slots">
        <div
          className={`fusion-slot ${main ? 'filled' : 'empty'}`}
          onDrop={(e) => handleDrop(e, 'main')}
          onDragOver={handleDragOver}
        >
          <div className="fusion-slot-label">主宠</div>
          {main ? (
            <div
              className="fusion-slot-card"
              draggable
              onDragStart={(e) => handleDragStart(e, main.uid, 'main')}
              onClick={() => dispatch({ type: 'REST_FUSION_SET_MAIN', uid: main.uid })}
            >
              <div className="fusion-slot-emoji">{main.emoji}</div>
              <div className="fusion-slot-name">{main.name}</div>
              <div className="fusion-slot-stats">HP {main.hp}/{main.maxHp} SPD {main.spd}</div>
            </div>
          ) : (
            <div className="fusion-slot-empty">拖入主宠</div>
          )}
        </div>

        <div className="fusion-slot-arrow">→</div>

        <div
          className={`fusion-slot ${sub ? 'filled' : 'empty'}`}
          onDrop={(e) => handleDrop(e, 'sub')}
          onDragOver={handleDragOver}
        >
          <div className="fusion-slot-label">副宠（消耗）</div>
          {sub ? (
            <div
              className="fusion-slot-card"
              draggable
              onDragStart={(e) => handleDragStart(e, sub.uid, 'sub')}
              onClick={() => dispatch({ type: 'REST_FUSION_SET_SUB', uid: sub.uid })}
            >
              <div className="fusion-slot-emoji">{sub.emoji}</div>
              <div className="fusion-slot-name">{sub.name}</div>
              <div className="fusion-slot-stats">HP {sub.hp}/{sub.maxHp} SPD {sub.spd}</div>
            </div>
          ) : (
            <div className="fusion-slot-empty">拖入副宠</div>
          )}
        </div>
      </div>

      {/* 融合预览 */}
      {canConfirm && (
        <div className="fusion-preview">
          融合后 {main.name}：生命 +{hpGain}，速度 +{spdGain}
        </div>
      )}

      {/* 融合按钮 */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
        <button
          className="primary big-btn"
          disabled={!canConfirm}
          onClick={() => dispatch({ type: 'REST_FUSION_CONFIRM' })}
        >
          {canConfirm ? '开始融合' : '请选择主宠和副宠'}
        </button>
      </div>

      {/* 可选宠物列表 */}
      <div className="fusion-roster">
        <div className="fusion-roster-label">可选宠物（点击或拖入上方槽位）</div>
        <div className="fusion-roster-grid">
          {state.roster.map((u) => {
            const isMain = u.uid === state.fusionMainUid;
            const isSub = u.uid === state.fusionSubUid;
            const base = getMonster(u.speciesId);
            return (
              <div
                key={u.uid}
                className={`fusion-roster-card ${isMain ? 'is-main' : ''} ${isSub ? 'is-sub' : ''}`}
                draggable
                onDragStart={(e) => {
                  const slot = isMain ? 'main' : isSub ? 'sub' : undefined;
                  if (slot) {
                    handleDragStart(e, u.uid, slot);
                  } else {
                    e.dataTransfer.setData('text/plain', JSON.stringify({ uid: u.uid, from: 'roster' }));
                    e.dataTransfer.effectAllowed = 'move';
                  }
                }}
                onClick={() => {
                  if (isMain) {
                    dispatch({ type: 'REST_FUSION_SET_MAIN', uid: u.uid });
                  } else if (isSub) {
                    dispatch({ type: 'REST_FUSION_SET_SUB', uid: u.uid });
                  } else if (!state.fusionMainUid) {
                    dispatch({ type: 'REST_FUSION_SET_MAIN', uid: u.uid });
                  } else {
                    dispatch({ type: 'REST_FUSION_SET_SUB', uid: u.uid });
                  }
                }}
              >
                <div className="fusion-roster-emoji">{u.emoji}</div>
                <div className="fusion-roster-name">{u.name}</div>
                <div className="fusion-roster-stats">HP {u.hp}/{u.maxHp} SPD {u.spd}</div>
                <div className="fusion-roster-base">基础 HP {base.baseHp} SPD {base.baseSpd}</div>
                {isMain && <div className="fusion-roster-badge main">主宠</div>}
                {isSub && <div className="fusion-roster-badge sub">副宠</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
        <button className="big-btn" onClick={() => dispatch({ type: 'REST_FUSION_CANCEL' })}>← 返回</button>
      </div>
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
        预览该瞭望塔后 3 行内某一行的全部节点情报（敌人属性与数量、商店货物、钥匙门/双生宝箱奖励、事件与奇遇）
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
  const isProf = state.runMode === 'proficiency';
  const items = Object.entries(state.inventory).filter(([, c]) => c > 0);
  const foodList = items.filter(([id]) => FOODS[id]);
  const growthItemIds = ['book_small', 'book_medium', 'book_large', 'slot_unlock', 'forget_stone', 'heal_potion', 'reset_stone', 'skill_enhance_stone', 'revival_stone'];
  const growthList = items.filter(([id]) => growthItemIds.includes(id));
  const itemList = items.filter(([id]) => ITEMS[id] && !growthItemIds.includes(id)).sort((a, b) => (a[0] === 'scout' ? -1 : b[0] === 'scout' ? 1 : 0));
  return (
    <div className="screen">
      <HUD state={state} dispatch={dispatch} />
      <div className="section-title">🎒 背包</div>

      {growthList.length > 0 && (
        <>
          <div className="section-sub">远征道具</div>
          <DragScrollRow>
            {growthList.map(([id, count]) => {
              const it = ITEMS[id] ?? FOODS[id];
              if (!it) return null;
              return (
                <div
                  key={id}
                  className="reward-card bag-item"
                  style={{ cursor: 'pointer' }}
                  onClick={() => dispatch({ type: 'USE_GROWTH_ITEM', itemId: id })}
                  title={`点击使用（持有 ${count} 个）`}
                >
                  <div className="ricon">{it.emoji}</div>
                  <div className="rtitle">
                    {it.name} ×{count}
                  </div>
                  <div className="rdesc">{it.desc}</div>
                </div>
              );
            })}
          </DragScrollRow>
        </>
      )}

      {!isProf && (
        <>
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
                    {f.desc}（{Math.round(f.baseTame * 100)}% 驯服率）
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
        </>
      )}

      <div className="section-sub" style={{ marginTop: 30 }}>
        宠物（{state.roster.length}/{getMaxRoster(state.runMode)}）
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
  const remaining = state.tameOverflow!.length;
  const hasSpace = state.roster.length < getMaxRoster(state.runMode);
  const [confirm, setConfirm] = useState<PetConfirm>(null);
  return (
    <div className="screen">
      <div className="section-title">{hasSpace ? '处理队伍' : '队伍已满'}（队伍 {state.roster.length}/{getMaxRoster(state.runMode)}）</div>
      <p className="card-sub" style={{ maxWidth: 560, textAlign: 'center', margin: '0 auto 8px' }}>
        你{state.tameOverflowReturn === 'map' ? '孵化了' : state.tameOverflowReturn === 'roster' ? '招募了' : '驯服了'}新的宠物。{hasSpace
          ? '队伍有空位，可直接加入。'
          : '队伍已满，选择：'}<b>替换</b>（放生一只现有宠物让它加入）{state.runMode !== 'proficiency' && '／融合（同物种足够可直接进化，待处理宠物也可作为材料）'}／<b>放生</b>（丢弃）。
      </p>
      <div className="center-col" style={{ flex: '0 0 auto', padding: '8px 0' }}>
        <UnitCard unit={tame} />
      </div>

      <div className="section-sub">
        选择操作（还有 {remaining} 只需要处理）：
      </div>
      <div className="roster-list">
        {state.roster.map((u) => {
          const stage = nextStage(u.speciesId);
          const need = stage ? fusionNeedCount(u.speciesId) : 0;
          const sameCount = state.roster.filter((x) => x.speciesId === u.speciesId).length;
          const tameSame = tame.speciesId === u.speciesId;
          const totalCount = sameCount + (tameSame ? 1 : 0);
          const canFuse = stage !== undefined && totalCount >= need;
          const needTame = canFuse && tameSame && sameCount < need;
          return (
          <div key={u.uid} className="roster-item">
            <UnitCard
              unit={u}
              className="roster-card"
              topStats
              showSkillDesc
              footer={
                <div className="unit-card-actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const gold = 5 * getMonster(u.speciesId).rank;
                      setConfirm({ kind: 'replace', uid: u.uid, gold });
                    }}
                  >
                    替换
                  </button>
                  {state.runMode !== 'proficiency' && (
                  <button
                    title={stage ? (canFuse ? (needTame ? `融合进化为 ${getMonster(stage).name}（含待处理 ${totalCount}/${need}）` : `融合进化为 ${getMonster(stage).name}（${sameCount}/${need}）`) : `同物种不足（${totalCount}/${need}，${tameSame ? '含待处理 1 只' : '不含待处理'}）`) : '该宠物已是最终形态，无法融合'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!stage) {
                        setConfirm({ kind: 'notice', msg: '该宠物已是最终形态，无法融合' });
                      } else if (!canFuse) {
                        setConfirm({ kind: 'notice', msg: `同物种不足（${totalCount}/${need}），无法融合` });
                      } else if (needTame) {
                        setConfirm({ kind: 'tame-fuse', uid: u.uid, tameUid: tame.uid });
                      } else {
                        dispatch({ type: 'FUSE_IN_OVERFLOW', uid: u.uid });
                      }
                    }}
                  >
                    融合
                  </button>
                  )}
                </div>
              }
            />
          </div>
          );
        })}
      </div>

      {hasSpace && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <button className="primary big-btn" onClick={() => dispatch({ type: 'TAME_OVERFLOW_JOIN', tameUid: tame.uid })}>
            将「{tame.name}」加入队伍
          </button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
        <button className="big-btn" onClick={() => dispatch({ type: 'TAME_OVERFLOW_DISCARD', tameUid: tame.uid })}>
          放生「{tame.name}」（不加入队伍）
        </button>
      </div>
      {confirm && (
        <FuseDiscardConfirm confirm={confirm} state={state} dispatch={dispatch} setConfirm={setConfirm} />
      )}
    </div>
  );
}

function EventScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const ev = state.map.events[state.currentNodeId];
  if (!ev) return null;
  const hatch = state.pendingEventHatch;
  const hatchMonster = hatch ? getMonster(hatch.monsterId) : null;
  return (
    <div className="screen">
      <HUD state={state} dispatch={dispatch} />
      <div className="center-col">
        <div className="section-title">📜 {ev.title}</div>
        <p className="card-sub" style={{ maxWidth: 480, textAlign: 'center' }}>
          {ev.desc}
        </p>
        <div className="reward-cards">
          {ev.choices.map((c) => {
            const cost = c.goldDelta ?? 0;
            const cantAfford = state.gold + cost < 0 || (c.consumeFood && c.foodId && (state.inventory[c.foodId] ?? 0) <= 0);
            return (
              <div
                key={c.id}
                className={`reward-card${cantAfford ? ' disabled' : ''}`}
                onClick={() => {
                  if (cantAfford) return;
                  if (c.kind === 'recruit' && c.monsterId) {
                    dispatch({ type: 'EVENT_HATCH_PREVIEW', choiceId: c.id, monsterId: c.monsterId });
                  } else if (c.kind === 'battle' && c.battleEnemies) {
                    dispatch({
                      type: 'EVENT_BATTLE_START',
                      enemies: c.battleEnemies,
                      reward: c.battleReward ?? { kind: 'gold', amount: c.goldDelta ?? 0 },
                      penalty: c.battlePenalty ?? { percent: 15 },
                      bonusReward: c.bonusReward,
                    });
                  } else {
                    dispatch({ type: 'EVENT_CHOICE', choiceId: c.id });
                  }
                }}
              >
              <div className="ricon">
                {c.kind === 'heal' && '❤️'}
                {c.kind === 'gold' && '💰'}
                {c.kind === 'food' && FOODS[c.foodId ?? 'berry'].emoji}
                {c.kind === 'item' && (c.itemId && ITEMS[c.itemId] ? ITEMS[c.itemId].emoji : '🎒')}
                {c.kind === 'recruit' && '🥚'}
                {c.kind === 'damage' && '☠️'}
                {c.kind === 'none' && '🚶'}
                {c.kind === 'battle' && '⚔️'}
                {c.kind === 'sacrifice' && '🩸'}
                {c.kind === 'boost' && '⬆️'}
                {c.kind === 'purify' && '✨'}
                {c.kind === 'curse' && '💀'}
                {c.kind === 'status' && '🌀'}
              </div>
              <div className="rtitle">{c.label}</div>
              <div className="rdesc">{c.desc}</div>
            </div>
            );
          })}
        </div>
      </div>
      {hatch && hatchMonster && (
        <div className="confirm-overlay" onClick={() => dispatch({ type: 'EVENT_HATCH_CANCEL' })}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>{hatchMonster.image ? <img src={hatchMonster.image} className="pet-image" style={{ width: 48, height: 48 }} alt={hatchMonster.name} /> : hatchMonster.emoji}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>孵化出了 {hatchMonster.name}！</div>
            <div className="card-sub" style={{ marginBottom: 4, justifyContent: 'center' }}>
              ❤️ {hatchMonster.baseHp} &nbsp; ⚡ {hatchMonster.baseSpd}
            </div>
            <div className="panel-row" style={{ marginTop: 12, justifyContent: 'center' }}>
              <button className="primary" onClick={() => dispatch({ type: 'EVENT_HATCH_CONFIRM' })}>收下</button>
              <button onClick={() => dispatch({ type: 'EVENT_HATCH_CANCEL' })}>放生</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SpecialScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const sp = state.map.specials[state.currentNodeId];
  if (!sp) return null;
  const hasEvolvable = state.roster.some((u) => nextStage(u.speciesId));
  const rosterFull = state.roster.length >= getMaxRoster(state.runMode);
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
                  <span className="emoji">{sp.image ? <img src={sp.image} className="pet-image" alt={sp.name} /> : sp.emoji}</span>
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
    { stat: 'hp' as const, icon: '❤️', label: '生命 +5', value: 5 },
    { stat: 'spd' as const, icon: '⚡', label: '速度 +2', value: 2 },
  ];
  return (
    <div className="screen">
      <HUD state={state} dispatch={dispatch} />
      <div className="center-col">
        <div className="section-title">
          📈 属性强化：<PetIcon image={u.image} emoji={u.emoji} name={u.name} /> {u.name}
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

interface RatingDimension {
  key: string;
  name: string;
  weight: number;
  score: number; // 0-100
  grade: string;
}

function computeRating(stats: NonNullable<GameState['runStats']>, rosterSize: number, act: number): {
  score: number; grade: string; label: string; dimensions: RatingDimension[];
} {
  // 通关进度系数：1幕→0.65(最高B)，2幕→0.82(最高A)，3幕→1.0(可达S)
  const actMultiplier = [0.65, 0.82, 1.0][Math.min(3, Math.max(1, act)) - 1];

  // 征服者 (30%)：总胜率
  const totalBattles = stats.battlesWon + stats.battlesLost;
  const winRate = totalBattles > 0 ? stats.battlesWon / totalBattles : 0.5;
  const conqueror = Math.round(Math.min(1, winRate / 0.9) * 100);

  // 驯兽师 (25%)：驯服成功率
  const tameRate = stats.tameAttempts > 0 ? stats.petsTamed / stats.tameAttempts : 0.5;
  const tamer = Math.round(Math.min(1, tameRate / 0.8) * 100);

  // 经济大师 (20%)：金币结余率
  const goldKeptRate = stats.goldEarned > 0 ? (stats.goldEarned - stats.goldSpent) / stats.goldEarned : 0.5;
  const economy = Math.round(Math.min(1, goldKeptRate / 0.3) * 100);

  // 战斗效率 (15%)：总回合数 ≤ 90 满分
  const efficiency = Math.round(Math.max(0, 1 - (stats.turnsPlayed - 90) / 210) * 100);

  // 队伍完整性 (10%)：终局队伍 / 8
  const completeness = Math.round(Math.min(1, rosterSize / 7) * 100);

  const dimGrade = (s: number) => s >= 90 ? 'S' : s >= 75 ? 'A' : s >= 55 ? 'B' : s >= 40 ? 'C' : 'D';

  const dimensions: RatingDimension[] = [
    { key: 'conqueror', name: '征服者', weight: 30, score: Math.round(conqueror * actMultiplier), grade: dimGrade(Math.round(conqueror * actMultiplier)) },
    { key: 'tamer', name: '驯兽师', weight: 25, score: Math.round(tamer * actMultiplier), grade: dimGrade(Math.round(tamer * actMultiplier)) },
    { key: 'economy', name: '经济大师', weight: 20, score: Math.round(economy * actMultiplier), grade: dimGrade(Math.round(economy * actMultiplier)) },
    { key: 'efficiency', name: '战斗效率', weight: 15, score: Math.round(efficiency * actMultiplier), grade: dimGrade(Math.round(efficiency * actMultiplier)) },
    { key: 'completeness', name: '队伍完整性', weight: 10, score: Math.round(completeness * actMultiplier), grade: dimGrade(Math.round(completeness * actMultiplier)) },
  ];

  const score = Math.round(
    (conqueror * 0.3 + tamer * 0.25 + economy * 0.2 + efficiency * 0.15 + completeness * 0.1) * actMultiplier
  );

  if (score >= 90) return { score, grade: 'S', label: '传奇远征者', dimensions };
  if (score >= 75) return { score, grade: 'A', label: '精锐指挥官', dimensions };
  if (score >= 55) return { score, grade: 'B', label: '可靠旅人', dimensions };
  if (score >= 40) return { score, grade: 'C', label: '初生牛犊', dimensions };
  return { score, grade: 'D', label: '幸存者', dimensions };
}

const ACT_THEMES = [
  { emoji: '', name: '', flavor: '' },
  { emoji: '🏕️', name: '远征启程', flavor: '翠绿之径的风已歇，前方的路尚在雾中。整顿行装，你已踏出第一步。' },
  { emoji: '🌑', name: '暗影渡口', flavor: '暗影沼泽的瘴气渐散，你听到了更深处的回响。真正的考验，才刚刚开始。' },
  { emoji: '⚔️', name: '终局之前', flavor: '火焰与铁链的咆哮在身后沉寂。前方，是远征的终点——或是一切湮灭的起点。' },
];

function getHighlights(stats: NonNullable<GameState['runStats']>, snap: NonNullable<NonNullable<GameState['runStats']>['actSnapshot']>, roster: Unit[]): string[] {
  const highlights: string[] = [];
  const tamed = stats.petsTamed - snap.petsTamed;

  // 检测传奇品质驯服（rank 3）
  const legendaryTamed = roster.filter((u) => {
    const sp = getMonster(u.speciesId);
    return sp && sp.rank === 3;
  });
  if (legendaryTamed.length > 0) {
    const names = legendaryTamed.map((u) => u.name).join('、');
    highlights.push(`成功驯服了传奇品质的【${names}】，远征路上的强援`);
  } else if (tamed >= 3) {
    highlights.push(`成功驯服了 ${tamed} 只宠物，队伍不断壮大`);
  } else if (tamed > 0) {
    highlights.push(`驯服了 ${tamed} 只新宠物`);
  }

  const lost = stats.petsLost - snap.petsLost;
  if (lost === 0 && tamed > 0) highlights.push('无损驯服，完美执行');
  if (lost > 0) highlights.push(`${lost} 只宠物在战斗中倒下，它们的牺牲不会被遗忘`);

  const gold = (stats.goldEarned - snap.goldEarned);
  if (gold >= 100) highlights.push(`积累了 ${gold} 金币，财源广进`);
  else if (gold >= 60) highlights.push(`积累了 ${gold} 金币，经济充裕`);

  const turns = stats.turnsPlayed - snap.turnsPlayed;
  const battles = stats.battlesWon - snap.battlesWon;
  if (turns <= 20 && battles >= 3) highlights.push('高效率推进，速战速决');

  if (stats.圣果Used - (snap.圣果Used ?? 0) > 0) highlights.push('圣果发挥了作用，这份馈赠铭记于心');

  if (highlights.length === 0) highlights.push('一路平稳，远征的考验永远在下一座山丘之后');
  return highlights.slice(0, 3);
}

/** 远征日志：根据本幕关键事件生成叙事文本 */
function getExpeditionLog(stats: NonNullable<GameState['runStats']>, snap: NonNullable<NonNullable<GameState['runStats']>['actSnapshot']>, roster: Unit[], act: number): string {
  const actNames = ['', '翠绿之径', '暗影沼泽', '火焰山脉'];
  const actName = actNames[act] ?? '未知之地';

  // 优先级1：驯服传奇宠物
  const legendaryTamed = roster.filter((u) => {
    const sp = getMonster(u.speciesId);
    return sp && sp.rank === 3;
  });
  if (legendaryTamed.length > 0) {
    const u = legendaryTamed[0];
    return `在${actName}的深处，我以一枚圣果赢得了【${u.name}】的信任。它眼中的光芒，将照亮前路。`;
  }

  // 优先级2：宠物阵亡
  const lost = stats.petsLost - snap.petsLost;
  if (lost > 0) {
    return `${lost}只伙伴在${actName}的最后一战中倒下。它们的盾牌已碎，但它们的意志将与我同行。`;
  }

  // 优先级3：高效率通关
  const turns = stats.turnsPlayed - snap.turnsPlayed;
  const battles = stats.battlesWon - snap.battlesWon;
  if (turns <= 20 && battles >= 3) {
    return `穿越${actName}的过程出奇顺利，每一次决策都精准到位。强者的道路，从不拖泥带水。`;
  }

  // 兜底
  const defaults = [
    `一路平静地走过了${actName}，但我深知——远征的真正考验，永远在下一座山丘之后。`,
    `${actName}的风声渐歇，前方的路尚在雾中。整顿行装，继续前行。`,
    `离开了${actName}，身后留下的是战斗的痕迹。前方，是更深处的回响。`,
  ];
  return defaults[act % defaults.length];
}

function InterActScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const stats = state.runStats;
  const snap = stats?.actSnapshot;
  const actStats = snap ? {
    battlesWon: (stats?.battlesWon ?? 0) - snap.battlesWon,
    battlesLost: (stats?.battlesLost ?? 0) - snap.battlesLost,
    goldEarned: (stats?.goldEarned ?? 0) - snap.goldEarned,
    goldSpent: (stats?.goldSpent ?? 0) - snap.goldSpent,
    tamed: (stats?.petsTamed ?? 0) - snap.petsTamed,
    lost: (stats?.petsLost ?? 0) - snap.petsLost,
    turns: (stats?.turnsPlayed ?? 0) - snap.turnsPlayed,
  } : { battlesWon: 0, battlesLost: 0, goldEarned: 0, goldSpent: 0, tamed: 0, lost: 0, turns: 0 };
  const actNames = ['', '第一幕', '第二幕', '第三幕'];
  const actName = actNames[state.act] ?? `第${state.act}幕`;
  const nextName = actNames[state.act + 1] ?? `第${state.act + 1}幕`;
  const theme = ACT_THEMES[state.act] ?? ACT_THEMES[1];
  const rating = stats ? computeRating(stats, state.roster.length, state.act) : null;
  const highlights = snap ? getHighlights(stats!, snap, state.roster) : [];
  const expeditionLog = snap ? getExpeditionLog(stats!, snap, state.roster, state.act) : '';
  return (
    <div className="center-col">
      <div className="inter-act-header">
        <div style={{ fontSize: 48 }}>{theme.emoji}</div>
        <div className="title-name">{theme.name} · {actName}结算</div>
        <div className="inter-act-flavor">"{theme.flavor}"</div>
      </div>
      {expeditionLog && <div className="inter-act-log">{expeditionLog}</div>}
      <div className="inter-act-stats">
        <div>⚔️ 战斗场次：{actStats.battlesWon + actStats.battlesLost}</div>
        <div>💰 金币获取：{actStats.goldEarned}</div>
        <div>🐾 驯服宠物：{actStats.tamed}</div>
        <div>💀 宠物阵亡：{actStats.lost}</div>
        <div>⏱️ 行动回合：{actStats.turns}</div>
      </div>
      {highlights.length > 0 && (
        <div className="highlight-list">
          {highlights.map((h, i) => <div key={i} className="highlight-item">★ {h}</div>)}
        </div>
      )}
      <div className="team-snapshot">
        {state.roster.slice(0, 5).map((u) => (
          <span key={u.uid} className="team-snapshot-pet"><PetIcon image={u.image} emoji={u.emoji} name={u.name} /> {u.name}</span>
        ))}
        {state.roster.length > 5 && <span className="team-snapshot-pet">+{state.roster.length - 5}</span>}
      </div>
      {rating && (
        <div className="rating-display inter-act-rating">
          <span className="rating-grade" style={{ fontSize: 28 }}>{rating.grade}</span>
          <span className="rating-score">{rating.score}分 · {rating.label}</span>
        </div>
      )}
      <button className="primary big-btn" onClick={() => dispatch({ type: 'INTER_ACT_CONTINUE' })}>
        远征{nextName} →
      </button>
    </div>
  );
}

function RatingDisplay({ rating, color }: { rating: NonNullable<ReturnType<typeof computeRating>>; color?: string }) {
  return (
    <div className="rating-display">
      <div className="rating-grade" style={{ color: color ?? '#4ecdc4' }}>{rating.grade}</div>
      <div className="rating-score">{rating.score}分 · {rating.label}</div>
      <div className="rating-dimensions">
        {rating.dimensions.map((d) => (
          <div key={d.key} className="rating-dim-row">
            <span className="rating-dim-name">{d.name} ({d.weight}%)</span>
            <div className="rating-dim-bar">
              <div className="rating-dim-fill" style={{ width: `${d.score}%` }} />
            </div>
            <span className="rating-dim-score">{d.score} {d.grade}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GameOverScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const rating = state.runStats ? computeRating(state.runStats, state.roster.length, state.act) : null;
  return (
    <div className="center-col">
      {rating && <RatingDisplay rating={rating} color="#e05555" />}
      <div style={{ fontSize: 56 }}>💀</div>
      <div className="title-name" style={{ color: '#e05555', letterSpacing: 4 }}>
        远征失败
      </div>
      <p className="card-sub">阵亡的宠物已永远消失，但这只是旅程的开始</p>
      {state.roster.length > 0 && (
        <div className="panel-row" style={{ flexWrap: 'wrap', justifyContent: 'center', margin: '8px 0' }}>
          {state.roster.map((u) => (
            <span className="chip" key={u.uid}><PetIcon image={u.image} emoji={u.emoji} name={u.name} /> {u.name}</span>
          ))}
        </div>
      )}
      <button className="big-btn" onClick={() => dispatch({ type: 'TITLE' })}>
        返回首页
      </button>
    </div>
  );
}

function VictoryScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const rating = state.runStats ? computeRating(state.runStats, state.roster.length, state.act) : null;
  const [unlocked, setUnlocked] = useState<string[]>([]);

  useEffect(() => {
    if (!rating) return;
    const currentUnlocks = state.unlocks ?? { ...DEFAULT_UNLOCKS };
    const rosterInfo = state.roster.map((u) => ({ speciesId: u.speciesId, passive: u.passive }));
    const nextUnlocks = detectUnlocks(currentUnlocks, rating.grade, rosterInfo, state.difficulty);
    const newItems: string[] = [];
    for (const d of nextUnlocks.difficulties) {
      if (!currentUnlocks.difficulties.includes(d)) newItems.push(`难度：${DIFFICULTY_CONFIG[d as Difficulty].label}`);
    }
    for (const r of nextUnlocks.relics) {
      if (!currentUnlocks.relics.includes(r)) newItems.push(`遗物：${RELIC_DEFS[r].name}`);
    }
    if (nextUnlocks.bestGrade !== currentUnlocks.bestGrade) newItems.push(`最高评级：${nextUnlocks.bestGrade}`);
    setUnlocked(newItems);
    // 保存 unlocks 到当前存档槽和全局 localStorage
    const updatedState = { ...state, unlocks: nextUnlocks };
    void persistSave(updatedState);
    persistUnlocks(nextUnlocks);
  }, [rating]);

  return (
    <div className="center-col">
      {rating && <RatingDisplay rating={rating} />}
      <div style={{ fontSize: 64 }}>👑</div>
      <div className="title-name">通关！</div>
      <p className="card-sub">你击败了所有首领，驯服了沿途的怪物军团</p>
      {unlocked.length > 0 && (
        <div className="unlock-notify">
          <div className="unlock-title">🔓 解锁新内容</div>
          {unlocked.map((item) => (
            <div key={item} className="unlock-item">{item}</div>
          ))}
        </div>
      )}
      <div className="panel-row" style={{ flexWrap: 'wrap', justifyContent: 'center', margin: '8px 0' }}>
        {state.roster.map((u) => (
          <span className="chip" key={u.uid}>{u.emoji} {u.name}</span>
        ))}
      </div>
      <button className="primary big-btn" onClick={() => dispatch({ type: 'RETRY', seed: newSeed() })}>
        再来一次
      </button>
      <button className="big-btn" onClick={() => dispatch({ type: 'TITLE' })}>
        返回标题
      </button>
    </div>
  );
}

function ProficiencyResultScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const won = state.proficiencyResult === 'won';
  const maxLayer = state.currentRow + 1;
  const totalLayers = 50;
  const battleCount = (state.runStats?.battlesWon ?? 0) + (state.runStats?.battlesLost ?? 0);
  const alive = state.roster.filter((u) => u.hp > 0);
  const bestPet = [...alive].sort((a, b) => (b.growthPoints ?? 0) - (a.growthPoints ?? 0))[0];

  return (
    <div className="center-col">
      <div style={{ fontSize: 64 }}>{won ? '🏆' : '💀'}</div>
      <div className="title-name" style={{ color: won ? '#e8c26a' : '#e05555' }}>
        成长远征 · {won ? '胜利' : '失败'}
      </div>

      <div style={{ margin: '16px 0', textAlign: 'center' }}>
        <p className="card-sub" style={{ margin: '4px 0' }}>到达层数：{maxLayer} / {totalLayers}</p>
        <p className="card-sub" style={{ margin: '4px 0' }}>总战斗场次：{battleCount}</p>
      </div>

      <div style={{ margin: '12px 0', textAlign: 'center' }}>
        <div className="section-sub">最终队伍</div>
        <div className="panel-row" style={{ flexWrap: 'wrap', justifyContent: 'center', margin: '8px 0' }}>
          {alive.map((u) => (
            <span className="chip" key={u.uid} style={{ margin: '4px' }}>
              {u.emoji} {u.name} +{u.growthPoints ?? 0}
            </span>
          ))}
        </div>
      </div>

      {bestPet && (
        <div style={{ margin: '12px 0', textAlign: 'center' }}>
          <p className="card-sub">最高成长：{bestPet.emoji} {bestPet.name} +{bestPet.growthPoints ?? 0}</p>
        </div>
      )}

      <div className="panel-row" style={{ gap: 12, marginTop: 16 }}>
        {won && (
          <button className="primary big-btn" onClick={() => dispatch({ type: 'RETRY', seed: newSeed() })}>
            重新开始
          </button>
        )}
        <button className="big-btn" onClick={() => dispatch({ type: 'TITLE' })}>
          返回主菜单
        </button>
      </div>
    </div>
  );
}

function AchievementsScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const unlocks = state.unlocks ?? { ...DEFAULT_UNLOCKS };
  const [tab, setTab] = useState<'difficulties' | 'relics' | 'grades'>('difficulties');
  const tabs = ['difficulties', 'relics', 'grades'] as const;
  const tabLabels: Record<string, string> = { difficulties: '难度', relics: '遗物', grades: '评级里程碑' };
  const tabIdx = tabs.indexOf(tab);

  const allDifficulties: { id: Difficulty; label: string; desc: string; unlockCondition: string }[] = [
    { id: 'normal', label: '普通', desc: '标准难度，无额外修正', unlockCondition: '默认解锁' },
    { id: 'hard', label: '困难', desc: '敌方 HP+20%、SPD+1，战后回血 40%，商品加价 20%', unlockCondition: '普通难度 A 级及以上通关' },
    { id: 'nightmare', label: '地狱', desc: '敌方 HP+50%、SPD+2，战后回血 20%，商品加价 40%', unlockCondition: '困难难度 A 级及以上通关' },
  ];
  const relicCondMap: Record<string, string> = {
    traveler_charm: 'B 级通关',
    elite_badge: 'A 级通关',
    legend_seal: 'S 级通关',
    flame_medal: 'S 级通关 + 3 只灼烧系宠物',
    nature_medal: 'S 级通关 + 3 只坦克系宠物',
    shadow_medal: 'S 级通关 + 3 只毒系宠物',
  };
  const allRelics = RELIC_ORDER.map((id) => ({ id, ...RELIC_DEFS[id], unlockCondition: relicCondMap[id] ?? '未知' }));
  const grades = ['S', 'A', 'B', 'C', 'D'];

  return (
    <div className="center-col">
      <div className="achievement-header">
        <div className="section-title achievement-title">🏆 成就</div>
        <div className="section-sub">最高评级：{unlocks.bestGrade ?? '无'}</div>
      </div>
      <div className="achievement-tabs">
        <span className="achievement-tab-label">{tabLabels[tab]}</span>
      </div>
      {createPortal(
        <>
          <button className="achievement-tab-btn left" onClick={() => setTab(tabs[(tabIdx + tabs.length - 1) % tabs.length])}>←</button>
          <button className="achievement-tab-btn right" onClick={() => setTab(tabs[(tabIdx + 1) % tabs.length])}>→</button>
        </>,
        document.body
      )}
      {tab === 'difficulties' && (
        <div className="achievement-group">
          {allDifficulties.map((d) => {
            const unlocked = unlocks.difficulties.includes(d.id);
            return (
              <div key={d.id} className={`achievement-item achievement-item-row ${unlocked ? 'unlocked' : 'locked'}`}>
                <span className="achievement-icon">{unlocked ? '🔓' : '🔒'}</span>
                <span className="achievement-name">{d.label}</span>
                <span className="achievement-desc">{d.desc}</span>
                <span className="achievement-unlock">{d.unlockCondition}</span>
              </div>
            );
          })}
        </div>
      )}
      {tab === 'relics' && (
        <div className="achievement-group">
          {allRelics.map((r) => {
            const unlocked = unlocks.relics.includes(r.id);
            return (
              <div key={r.id} className={`achievement-item achievement-item-row ${unlocked ? 'unlocked' : 'locked'}`}>
                <span className="achievement-icon">{unlocked ? r.emoji : '🔒'}</span>
                <span className="achievement-name">{r.name}</span>
                <span className="achievement-desc">{r.desc}</span>
                <span className="achievement-unlock">{r.unlockCondition}</span>
              </div>
            );
          })}
        </div>
      )}
      {tab === 'grades' && (
        <div className="achievement-group">
          {grades.map((g) => {
            const rank = { S: 4, A: 3, B: 2, C: 1, D: 0 }[g] ?? 0;
            const bestRank = { S: 4, A: 3, B: 2, C: 1, D: 0 }[unlocks.bestGrade ?? 'D'] ?? 0;
            const reached = bestRank >= rank;
            return (
              <div key={g} className={`achievement-item ${reached ? 'unlocked' : 'locked'}`}>
                <div className="achievement-grade-header">
                  <span className="achievement-icon">{reached ? '⭐' : '☆'}</span>
                  <span className="achievement-name">评级 {g}</span>
                </div>
                <span className="achievement-desc">
                  {g === 'D' && '完成任意通关'}
                  {g === 'C' && 'B 级通关解锁困难难度'}
                  {g === 'B' && 'A 级通关解锁旅行者护符'}
                  {g === 'A' && 'S 级通关解锁精英勋章 + 地狱难度'}
                  {g === 'S' && 'S 级通关解锁传说印章 + 勋章检测'}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <button className="big-btn" onClick={() => dispatch({ type: 'TITLE' })} style={{ marginTop: 12 }}>
        返回标题
      </button>
    </div>
  );
}
