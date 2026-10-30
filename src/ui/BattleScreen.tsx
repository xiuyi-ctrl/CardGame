import { TestBattleEditor } from './TestBattleEditor';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useBackAction, useMobileLayout } from './mobile';
import type { CSSProperties, Dispatch, PointerEvent as ReactPointerEvent } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { battleVictoryGold, currentFoodList } from '../game/state/game';
import {
  REST_SKILL_ID,
  BATTLE_COLLAPSE_WARNING_ROUND,
  battleCollapseDamage,
  canUnitUseSkill,
  stokeFireTargets,
  requiresBurningTarget,
  furnaceShellTargets,
  flameTracingTargets,
  isTameable,
  skillUsesLeft,
  skillCooldownLeft,
  getEffectiveSpd,
  tameChance,
  TAME_THRESHOLD,
} from '../game/core/battle';
import { getSkillEnhanceLevel } from '../game/core/growth';
import { getBattleSkill } from '../game/data/test-skill-overrides';
import { getFood } from '../game/data/foods';
import { getItem } from '../game/data/items';
import { getPassive } from '../game/data/passives';
import type { BattleState, LogSpan, SkillDef, StatusEffect, Unit } from '../game/types';
import { UnitCard, skillBrief, skillFullDesc, SkillTag, BuffDetailPanel, PixelCreature, BattleHpText } from './components';
import { useBattleFx } from './battleFx';
import { persistSave } from './persistence';
import { BACKPACK_ITEM_ART } from './backpackItemArt';
import { BattleStatusIcons } from './BattleStatusIcons';
import { CollapseWarning } from './CollapseWarning';
import { MimicPreview } from './MimicPreview';
import { BuffIcon, STATUS_ART, BATTLE_BUFF_ART } from './BuffIcon';
import { UiSymbol } from './UiSymbol';
import { BattleStrikeLayer } from './BattleStrikeLayer';
import './battleFeedback.css';

const BATTLE_ITEM_IDS = ['atk_up', 'spd_up', 'hp_up', 'atk_down', 'spd_down', 'hp_down'];

function BattleActionIcon({ kind }: { kind: 'capture' | 'item' | 'swap' }) {
  return <img className={`battle-action-icon battle-action-icon-${kind}`} src={`/battle-action-icons/${kind}.png`} alt="" aria-hidden="true" />;
}

function renderLogText(text: string, spans?: LogSpan[]) {
  if (!spans || spans.length === 0) return text;
  const sorted = [...spans].sort((a, b) => a.from - b.from);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const s of sorted) {
    if (s.from > cursor) parts.push(text.slice(cursor, s.from));
    const content = text.slice(s.from, s.to);
    const wrapped = (s.kind === 'actor' || s.kind === 'target') ? `【${content}】` : content;
    parts.push(<span key={cursor} className={`log-hl log-hl-${s.kind}`}>{wrapped}</span>);
    cursor = s.to;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

interface Props {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}

/** 判断单体攻击技能能否命中该敌人（前后排保护规则） */
function enemyTargetable(skill: SkillDef, enemy: Unit, enemies: Unit[]): boolean {
  if (skill.target !== 'single') return false;
  const front = enemies.filter((u) => u.hp > 0 && u.row === 'front');
  const back = enemies.filter((u) => u.hp > 0 && u.row === 'back');
  const reach = skill.reach ?? 'front';
  if (reach === 'direct') return true;
  if (reach === 'back') return back.length > 0 ? enemy.row === 'back' : true;
  if (reach === 'pierce') return front.length > 0 ? enemy.row === 'front' : true;
  return front.length > 0 ? enemy.row === 'front' : true;
}

export function BattleUnitInspectPanel({ unit, speed, side, showSkills = side === 'enemy', showBuffs = true, eyebrow, children, battle }: { unit: Unit; speed?: number; side: 'enemy' | 'player'; showSkills?: boolean; showBuffs?: boolean; eyebrow?: string; children?: React.ReactNode; battle?: BattleState }) {
  const hasBuffs = unit.shield > 0 || unit.statuses.length > 0 ||
    (!!unit.battleBuffs && Object.values(unit.battleBuffs).some(Boolean));
  return (
    <div className="enemy-skill-panel">
      <div className="enemy-skill-panel-title">
        <span className="enemy-inspect-portrait"><PixelCreature unit={unit} /></span>
        <span className="enemy-inspect-identity">
          <span className="enemy-inspect-eyebrow">{eyebrow ?? `${side === 'enemy' ? '敌方' : '我方'} · ${unit.row === 'front' ? '前排' : '后排'}`}</span>
          <strong>{unit.name}</strong>
          <span className="enemy-inspect-stats">
            <span><i className="starter-stat-icon starter-stat-heart" aria-hidden="true" /><BattleHpText hp={unit.hp} maxHp={unit.maxHp} /></span>
            <span><i className="starter-stat-icon starter-stat-speed" aria-hidden="true" />{speed ?? getEffectiveSpd(unit)}</span>
            {showBuffs && unit.shield > 0 && <span><BuffIcon art={STATUS_ART.shield} /> 护盾 {unit.shield}</span>}
          </span>
        </span>
      </div>
      {children}
      {showBuffs && !!unit.battleBuffs?.skillSpd && <div className="enemy-inspect-permanent-buff"><BuffIcon art={BATTLE_BUFF_ART.skillSpd} /> 技能速度加成 +{unit.battleBuffs.skillSpd}</div>}
      {showBuffs && !hasBuffs && <div className="enemy-inspect-no-status">当前无状态效果</div>}
      {showSkills && <>
        <div className="enemy-inspect-section-title">技能</div>
        <div className="enemy-inspect-skills">
          {unit.skills.map((sid, slot) => (
            <SkillTag key={slot} skill={getBattleSkill(battle, sid)} enhanced={getSkillEnhanceLevel(unit, slot)} desc usesNote />
          ))}
        </div>
      </>}
    </div>
  );
}

export function BattleScreen({ state, dispatch }: Props) {
  const mobile = useMobileLayout();
  const battle = state.battle;
  const { fx, pops, strikes, life, statusPulses, capture, departingEnemies, effectsPaused, hpMap, shieldMap, spdMap, passiveSpdMap, rockShellHitsMap, thornRoyalHitsMap, statusMap, hiddenStatuses, endingStatuses, animating, logPending, revealedLogLen, revealedSummons, animSpeed, setAnimSpeed, skipAnim } = useBattleFx(battle);
  const captureLock = useRef(false);
  useEffect(() => { if (!animating && !logPending) captureLock.current = false; }, [animating, logPending]);
  const fieldRef = useRef<HTMLDivElement>(null);
  if (!battle) return null;
  const b = battle;

  const [pendingSkill, setPendingSkill] = useState<{ actorUid: string; skillId: string } | null>(null);
  const [swapFrom, setSwapFrom] = useState<string | null>(null);
  const [pendingTame, setPendingTame] = useState<string | null>(null);
  const [pendingBattleItem, setPendingBattleItem] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [inspectEnemy, setInspectEnemy] = useState<string | null>(null);
  const [inspectAlly, setInspectAlly] = useState<string | null>(null);
  const [inspectAllySkills, setInspectAllySkills] = useState(false);
  const [foodOverlayOpen, setFoodOverlayOpen] = useState(false);
  const [itemOverlayOpen, setItemOverlayOpen] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);
  const [testEditorOpen, setTestEditorOpen] = useState(false);
  const [mobileLogOpen, setMobileLogOpen] = useState(false);
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; pointerId: number } | null>(null);
  const suppressPressClick = useRef(false);
  function cancelLongPress() {
    if (longPress.current) clearTimeout(longPress.current.timer);
    longPress.current = null;
  }
  useEffect(() => {
    document.addEventListener('visibilitychange', cancelLongPress);
    return () => { cancelLongPress(); document.removeEventListener('visibilitychange', cancelLongPress); };
  }, []);
  function startLongPress(event: ReactPointerEvent, uid: string, side: 'enemy' | 'player') {
    if (!mobile || event.pointerType === 'mouse' || event.isPrimary === false) return;
    cancelLongPress();
    suppressPressClick.current = false;
    longPress.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, timer: setTimeout(() => {
      suppressPressClick.current = true;
      if (side === 'enemy') setInspectEnemy(uid);
      else { setInspectAllySkills(true); setInspectAlly(uid); }
      longPress.current = null;
    }, 450) };
  }
  function moveLongPress(event: ReactPointerEvent) {
    const press = longPress.current;
    if (press && (press.pointerId !== event.pointerId || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10)) cancelLongPress();
  }
  function suppressLongPressClick(event: React.MouseEvent) {
    if (!suppressPressClick.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressPressClick.current = false;
  }
  const hasPendingTarget = !!(pendingSkill || swapFrom || pendingTame || pendingBattleItem);
  function cancelTarget() {
    setPendingSkill(null);
    setSwapFrom(null);
    setPendingTame(null);
    setPendingBattleItem(null);
  }
  useBackAction(!!(inspectEnemy || inspectAlly || foodOverlayOpen || itemOverlayOpen || mobileLogOpen || hasPendingTarget), () => {
    if (inspectEnemy) setInspectEnemy(null);
    else if (inspectAlly) setInspectAlly(null);
    else if (foodOverlayOpen) setFoodOverlayOpen(false);
    else if (itemOverlayOpen) setItemOverlayOpen(false);
    else if (mobileLogOpen) setMobileLogOpen(false);
    else cancelTarget();
  });
  const choosingEnemyTarget = !!pendingSkill && getBattleSkill(battle, pendingSkill.skillId).target === 'single' || !!pendingBattleItem && ['atk_down', 'spd_down', 'hp_down'].includes(pendingBattleItem);
  const choosingAllyTarget = !!pendingSkill && getBattleSkill(battle, pendingSkill.skillId).target === 'ally' || !!pendingBattleItem && ['atk_up', 'spd_up', 'hp_up'].includes(pendingBattleItem);

  const alivePlayers = b.playerUnits.filter((u) => u.hp > 0);
  const aliveEnemies = b.enemyUnits.filter((u) => u.hp > 0 && (!u.summoning || revealedSummons.has(u.uid)));
  // 结算动画播放中禁止操作（结束回合/技能/换位/驯服/道具）；车轮战待换人时也禁止，等替补自动上场
  const collapseWarning = battle.phase === 'acting' && battle.round === BATTLE_COLLAPSE_WARNING_ROUND && battle.collapseWarningSeenRound !== battle.round;
  const acknowledgeCollapse = () => dispatch({ type: 'ACK_COLLAPSE_WARNING' });
  useBackAction(collapseWarning && !animating && !logPending && !inspectEnemy && !inspectAlly, acknowledgeCollapse, 20);
  const canAct = battle.phase === 'acting' && alivePlayers.length > 0 && !animating && !logPending && !battle.pendingSwap && !collapseWarning && !battle.mimicPreviewPending;
  const previousOrders = useRef({ orders: battle.orders, round: battle.round });
  const [orderPulse, setOrderPulse] = useState<{ actorUid: string; targetUid: string; skillId: string; seq: number } | null>(null);
  useEffect(() => {
    const previous = previousOrders.current;
    previousOrders.current = { orders: battle.orders, round: battle.round };
    if (!canAct || previous.round !== battle.round) {
      setOrderPulse(null);
      return;
    }
    const changed = Object.entries(battle.orders ?? {}).find(([uid, order]) => order.targetUid
      && (previous.orders?.[uid]?.skillId !== order.skillId || previous.orders?.[uid]?.targetUid !== order.targetUid));
    if (changed) {
      const [actorUid, order] = changed;
      setOrderPulse(current => ({ actorUid, targetUid: order.targetUid!, skillId: order.skillId, seq: (current?.seq ?? 0) + 1 }));
    }
  }, [battle.orders, battle.round, canAct]);
  useEffect(() => {
    if (!orderPulse) return;
    const timer = setTimeout(() => setOrderPulse(null), 350);
    return () => clearTimeout(timer);
  }, [orderPulse]);

  /** 动画期间按 hpMap/statusMap 覆盖显示血量与状态，随动画事件逐步推进（状态层数随事件回放，
   *  如攻击附加灼烧 5 层→dot 结算后 2 层）；新增状态标签在对应攻击动画触发后才显示，
   *  到期状态标签在对应掉血动画触发时才移除 */
  const shownUnit = (u: Unit): Unit => {
    let next = hpMap ? { ...u, hp: hpMap[u.uid] ?? u.hp } : u;
    if (shieldMap) next = { ...next, shield: shieldMap[u.uid] ?? next.shield };
    const sm = statusMap ? statusMap[u.uid] : undefined;
    if (sm) {
      const smMap = new Map(sm.map((s) => [s.kind, s]));
      // 动画期间：叠加型状态（灼烧/中毒/怒棘）完全由 statusMap 快照控制，
      // 排除不在 smMap 中的叠加型状态，防止从真实 unit 泄露最终层数
      const STACKING_ANIM = new Set(['burn', 'poison', 'rageThorn']);
      const merged = next.statuses
        .filter((s) => !STACKING_ANIM.has(s.kind) || smMap.has(s.kind))
        .map((s) => smMap.get(s.kind) ?? s);
      for (const s of sm) {
        if (!merged.some((ms) => ms.kind === s.kind)) merged.push(s);
      }
      next = { ...next, statuses: merged };
    }
    const hidden = hiddenStatuses[u.uid];
    if (hidden && hidden.length > 0) {
      next = { ...next, statuses: next.statuses.filter((s) => !hidden.includes(s.kind)) };
    }
    const ending = endingStatuses[u.uid];
    if (ending && ending.length > 0) {
      const have = new Set<string>(next.statuses.map((s) => s.kind));
      next = {
        ...next,
        statuses: [
          ...next.statuses,
          ...ending.filter((k) => !have.has(k)).map((k) => ({ kind: k as StatusEffect['kind'], value: 0, turns: 0 })),
        ],
      };
    }
    return next;
  };

  useEffect(() => {
    setPendingSkill(null);
    setSwapFrom(null);
    setPendingTame(null);
    setPendingBattleItem(null);
    setInspectEnemy(null);
    setInspectAlly(null);
    setFoodOverlayOpen(false);
    setItemOverlayOpen(false);
  }, [battle?.round, battle?.rngCount, battle?.phase]);

  useEffect(() => {
    if (!inspectEnemy && !inspectAlly && !choosingEnemyTarget && !choosingAllyTarget) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (inspectEnemy || inspectAlly) {
          setInspectEnemy(null);
          setInspectAlly(null);
        } else {
          setPendingSkill(null);
        }
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [inspectEnemy, inspectAlly, choosingEnemyTarget, choosingAllyTarget]);

  // 车轮战：场上只有一只上场宠物，默认选中它，技能栏直接展示其技能（含替补轮换后自动重选）
  useEffect(() => {
    if (!battle?.gauntlet) return;
    const actable = battle.playerUnits.find((u) => u.hp > 0 && !u.acted);
    if (!actable) return;
    setSelectedUid((cur) =>
      cur && battle.playerUnits.some((u) => u.uid === cur && u.hp > 0 && !u.acted) ? cur : actable.uid,
    );
  }, [battle?.gauntlet, battle?.round, battle?.playerUnits]);

  // 车轮战：替补单位死亡动画播完后自动换人（GAUNTLET_SWAP）
  useEffect(() => {
    if (!battle?.pendingSwap || battle.phase !== 'acting') return;
    if (logPending || animating) return;
    dispatch({ type: 'GAUNTLET_SWAP' });
  }, [battle?.pendingSwap, battle?.phase, logPending, animating]);

  const nodeType = state.map.layers[state.currentRow]?.find((n) => n.id === state.currentNodeId)?.type;
  const isSimulation = nodeType === 'arena3' && state.arena3Pending?.mode === 'simulation';
  const isArena3Challenge = nodeType === 'arena3' && state.arena3Pending?.mode === 'challenge';
  const isChallenge = (nodeType === 'arena' || nodeType === 'gauntlet' || nodeType === 'arena3') && !isSimulation;

  // 模拟战失败：动画播完后自动回地图（无弹窗、无惩罚）
  useEffect(() => {
    if (isSimulation && battle.phase === 'lost' && !animating && !logPending) {
      dispatch({ type: 'BATTLE_END_CONFIRM' });
    }
  }, [isSimulation, battle.phase, animating, logPending]);

  useEffect(() => {
    if (battle.rewindChoice) {
      setSelectedUid(battle.rewindChoice.uid);
      setPendingSkill(null); setPendingTame(null); setPendingBattleItem(null); setSwapFrom(null);
    }
  }, [battle.rewindChoice?.uid]);

  const selected = battle.playerUnits.find((u) => u.uid === selectedUid);
  const inspectedEnemy = inspectEnemy ? battle.enemyUnits.find((u) => u.uid === inspectEnemy && u.hp > 0) : undefined;
  const inspectedAlly = inspectAlly ? battle.playerUnits.find((u) => u.uid === inspectAlly) : undefined;
  const selectedSkills: SkillDef[] = useMemo(
    () => (selected && selected.hp > 0 ? selected.skills.filter(id => id !== 'mirror_copy').map((id) => getBattleSkill(battle, id)) : []),
    [selected, battle.testSkillOverrides],
  );
  const selectedOrder = selected ? battle.orders?.[selected.uid] : undefined;
  const selectedOrderLabel = selectedOrder ? (() => {
    if (selectedOrder.skillId === REST_SKILL_ID) return '✓ 休息';
    if (selectedOrder.skillId === 'mirror_copy') return '自动判定';
    const skill = getBattleSkill(battle, selectedOrder.skillId);
    const targetName = (skill.target === 'single' || skill.target === 'ally')
      ? [...battle.playerUnits, ...battle.enemyUnits].find(unit => unit.uid === selectedOrder.targetUid)?.name ?? '目标已离场'
      : ({ all: skill.reach === 'front' ? '敌方前排优先' : skill.reach === 'back' ? '敌方后排' : '敌方全体', allyAll: '我方全体', self: '自身', random: '随机敌方' } as const)[skill.target];
    const friendly = skill.target === 'ally' || skill.target === 'allyAll' || skill.target === 'self';
    return <>✓ {skill.name} → <span className={`battle-order-target-${friendly ? 'ally' : 'enemy'}`}>{targetName}</span></>;
  })() : selected && getPassive(selected.passive)?.kind === 'mirrorCopy' ? '自动判定' : '';

  const foods = currentFoodList(state);
  const battleItems = BATTLE_ITEM_IDS.map((id) => getItem(id)).filter((it) => (state.inventory[it.id] ?? 0) > 0);

  const validEnemyTargets = useMemo(() => {
    const targets = new Set<string>();
    if (pendingSkill) {
      const skill = getBattleSkill(battle, pendingSkill.skillId);
      if (skill.target === 'single') {
        // 嘲讽反向限制：己方被嘲讽时，所有技能只能以嘲讽来源为目标
        const actor = battle?.playerUnits.find((u) => u.uid === pendingSkill.actorUid);
        if (skill.id === 'flame_tracing_feather' && actor) {
          flameTracingTargets(battle, actor).forEach((unit) => targets.add(unit.uid));
          return targets;
        }
        if (requiresBurningTarget(skill.id) && actor && battle) {
          stokeFireTargets(battle, actor, skill.id).forEach((unit) => targets.add(unit.uid));
          return targets;
        }
        const tauntSrc = actor?.statuses.find((s) => s.kind === 'taunt');
        if (tauntSrc?.sourceUid) {
          const src = aliveEnemies.find((u) => u.hp > 0 && u.uid === tauntSrc.sourceUid);
          if (src) {
            targets.add(src.uid);
            return targets;
          }
        }
        // 嗜血嗅觉：攻击目标永远为血量最低的敌人
        const actorPassive = actor ? getPassive(actor.passive) : undefined;
        if (actorPassive?.kind === 'bloodScent') {
          const lowest = aliveEnemies.reduce((min, t) => t.hp < min.hp ? t : min, aliveEnemies[0]);
          if (lowest) {
            targets.add(lowest.uid);
            return targets;
          }
        }
        aliveEnemies.forEach((u) => {
          if (enemyTargetable(skill, u, aliveEnemies)) targets.add(u.uid);
        });
      }
    }
    if (pendingBattleItem) {
      const isDebuff = ['atk_down', 'spd_down', 'hp_down'].includes(pendingBattleItem);
      if (isDebuff) aliveEnemies.forEach((u) => targets.add(u.uid));
    }
    return targets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSkill, pendingBattleItem, battle]);

  const validAllyTargets = useMemo(() => {
    const targets = new Set<string>();
    if (pendingSkill) {
      const skill = getBattleSkill(battle, pendingSkill.skillId);
      if (skill.id === 'furnace_shell') {
        const actor = battle?.playerUnits.find((unit) => unit.uid === pendingSkill.actorUid);
        if (battle && actor) furnaceShellTargets(battle, actor).forEach((unit) => targets.add(unit.uid));
      } else if (skill.target === 'ally' || skill.target === 'allyAll') alivePlayers.forEach((u) => targets.add(u.uid));
    }
    if (swapFrom) alivePlayers.filter((u) => u.uid !== swapFrom).forEach((u) => targets.add(u.uid));
    if (pendingBattleItem) {
      const isBuff = ['atk_up', 'spd_up', 'hp_up'].includes(pendingBattleItem);
      if (isBuff) alivePlayers.forEach((u) => targets.add(u.uid));
    }
    return targets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSkill, swapFrom, pendingBattleItem, battle?.rngCount]);

  function onPlayerClick(uid: string) {
    if (animating) return;
    if (pendingSkill) {
      const skill = getBattleSkill(battle, pendingSkill.skillId);
      if (skill.target === 'ally') {
        if (!validAllyTargets.has(uid)) return;
        dispatch({ type: 'PLAYER_SKILL', actorUid: pendingSkill.actorUid, skillId: pendingSkill.skillId, targetUid: uid });
        setPendingSkill(null);
      }
      return;
    }
    if (swapFrom) {
      dispatch({ type: 'PLAYER_SWAP', actorUid: swapFrom, otherUid: uid });
      setSwapFrom(null);
      return;
    }
    if (pendingTame) return;
    if (pendingBattleItem) {
      const isBuff = ['atk_up', 'spd_up', 'hp_up'].includes(pendingBattleItem);
      if (isBuff) {
        dispatch({ type: 'USE_BATTLE_ITEM', itemId: pendingBattleItem, targetUid: uid });
        setPendingBattleItem(null);
      }
      return;
    }
    if (battle?.rewindChoice) return;
    const u = b.playerUnits.find((x) => x.uid === uid);
    if (u && u.hp > 0) setSelectedUid(selectedUid === uid ? null : uid);
  }

  function onEnemyClick(uid: string) {
    if (animating || logPending || captureLock.current) return;
    if (pendingSkill) {
      const skill = getBattleSkill(battle, pendingSkill.skillId);
      // 治疗等 ally 技能只能点己方单位，点敌方直接忽略（保持待定状态）
      if (skill.target === 'single') {
        dispatch({ type: 'PLAYER_SKILL', actorUid: pendingSkill.actorUid, skillId: pendingSkill.skillId, targetUid: uid });
        setPendingSkill(null);
      }
      return;
    }
    if (pendingBattleItem) {
      const isBuff = ['atk_up', 'spd_up', 'hp_up'].includes(pendingBattleItem);
      if (!isBuff) {
        dispatch({ type: 'USE_BATTLE_ITEM', itemId: pendingBattleItem, targetUid: uid });
        setPendingBattleItem(null);
      }
      return;
    }
    if (pendingTame) {
      const enemy = b.enemyUnits.find((u) => u.uid === uid);
      if (enemy && isTameable(enemy)) {
        captureLock.current = true;
        dispatch({ type: 'PLAYER_TAME', foodId: pendingTame, enemyUid: uid });
        setPendingTame(null);
      }
      return;
    }
  }

  function onSkillClick(skill: SkillDef) {
    if (animating) return;
    if (!selected || selected.hp <= 0) return;
    const isSelected = selectedOrder?.skillId === skill.id;
    // 已选择该技能：再次点击取消选择，恢复待命。
    if (isSelected) {
      setPendingSkill(null);
      if (pendingSkill?.skillId !== skill.id) {
        dispatch({ type: 'PLAYER_CANCEL_ORDER', actorUid: selected.uid });
      }
      return;
    }
    if (skill.target === 'single' || skill.target === 'ally') {
      if (pendingSkill && pendingSkill.skillId === skill.id) {
        setPendingSkill(null);
        return;
      }
      setSwapFrom(null);
      setPendingTame(null);
      setPendingBattleItem(null);
      setInspectEnemy(null);
      setPendingSkill({ actorUid: selected.uid, skillId: skill.id });
      return;
    }
    // allyAll：全体友方，无需选择目标，直接施放
    if (skill.target === 'allyAll') {
      dispatch({ type: 'PLAYER_SKILL', actorUid: selected.uid, skillId: skill.id });
      setPendingSkill(null);
      return;
    }
    setPendingSkill(null);
    dispatch({ type: 'PLAYER_SKILL', actorUid: selected.uid, skillId: skill.id });
  }

  function onFoodClick(foodId: string) {
    if (animating) return;
    if (pendingTame === foodId) {
      setPendingTame(null);
      return;
    }
    setPendingSkill(null);
    setSwapFrom(null);
    setPendingBattleItem(null);
    setInspectEnemy(null);
    setPendingTame(foodId);
  }

  function onBattleItemClick(itemId: string) {
    if (animating) return;
    if (pendingBattleItem === itemId) {
      setPendingBattleItem(null);
      return;
    }
    setPendingSkill(null);
    setSwapFrom(null);
    setPendingTame(null);
    setInspectEnemy(null);
    setPendingBattleItem(itemId);
  }

  function tameTip(u: Unit): string {
    if (!u.tameable) return '不可捕捉';
    if (u.hp / u.maxHp > TAME_THRESHOLD) return `需血量 ≤ ${Math.round(TAME_THRESHOLD * 100)}%`;
    if (!pendingTame) return '';
    return `捕获概率 ${u.hp === 1 || getFood(pendingTame).guaranteed ? 100 : Math.round(tameChance(u, pendingTame, battle?.relics) * 100)}%`;
  }

  // 战斗记录只显示已揭示的条目（随攻击动画逐条出现），最多 6 条
  const logItems = logExpanded
    ? battle.log.slice(0, revealedLogLen)
    : battle.log.slice(Math.max(0, revealedLogLen - 6), revealedLogLen);

  const popOverlay = (uid: string) =>
    pops
      .filter((p) => p.uid === uid)
      .map((p, index) => (
        <span key={`${p.id}-${p.kind ?? index}-${p.statusIcon ?? ''}`} className={`dmg-pop ${p.kind ?? ''} ${p.heavy ? 'heavy' : ''} ${p.heal ? 'heal' : ''} ${p.buff ? 'buff' : ''} ${p.shield ? 'shield' : ''} ${p.debuff ? 'debuff' : ''}`} style={{ '--pop-side': p.id % 2 ? 1 : -1, '--pop-stack': (p.slot ?? 0) % 3 } as CSSProperties}>
          {p.statusIcon && <BuffIcon art={STATUS_ART[p.statusIcon]} />}
          {p.text}
        </span>
      ));

  const orderFeedback = (u: Unit) => {
    if (!canAct || u.hp <= 0) return null;
    const order = selectedUid ? battle.orders?.[selectedUid] : undefined;
    const isTarget = !hasPendingTarget && order?.targetUid === u.uid;
    const pulseOrder = orderPulse ? battle.orders?.[orderPulse.actorUid] : undefined;
    const pulse = orderPulse?.targetUid === u.uid && pulseOrder?.skillId === orderPulse.skillId && pulseOrder?.targetUid === u.uid;
    const tone = battle.playerUnits.some(unit => unit.uid === u.uid) ? 'support' : 'attack';
    return <>
      {isTarget && <span className={`order-target-mark order-feedback-${tone}`} aria-label="当前指令目标" />}
      {pulse && <span key={orderPulse.seq} className={`order-confirm-ring order-feedback-${tone}`} aria-hidden="true" />}
    </>;
  };

  const enemySlot = (u: Unit | undefined, key: string, topRow: boolean) => {
    const extra = `formation-slot ${topRow ? 'slot-front' : 'slot-back'}`;
    if (!u) return <div key={key} className={`${extra} empty`} aria-hidden="true" />;
    const isTarget = validEnemyTargets.has(u.uid) || (pendingTame && isTameable(u));
    const aimClass = choosingEnemyTarget && u.hp > 0 ? (validEnemyTargets.has(u.uid) ? 'attack-target' : 'attack-target-blocked') : '';
    const showTameTip = pendingTame && isTameable(u);
    const fxInfo = fx[u.uid];
    return (
      <div
        key={key}
        data-battle-uid={u.uid}
        data-battle-column={u.column}
        className={`${extra} ${life[u.uid] ? `life-${life[u.uid].kind}` : ''} ${showTameTip ? 'tame-target' : ''} ${capture?.targetUid === u.uid ? `capture-${capture.stage}` : ''} ${isTarget ? 'valid-target targetable' : ''} ${aimClass}`}
        onClick={isTarget ? () => onEnemyClick(u.uid) : undefined}
        onClickCapture={suppressLongPressClick}
        onPointerDown={event => startLongPress(event, u.uid, 'enemy')}
        onPointerMove={moveLongPress}
        onPointerUp={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onContextMenu={(event) => { event.preventDefault(); cancelLongPress(); if (mobile) suppressPressClick.current = true; setInspectEnemy(u.uid); }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            setInspectEnemy(u.uid);
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (isTarget) onEnemyClick(u.uid);
            else setInspectEnemy(u.uid);
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={`${u.name}，右键或按菜单键查看敌人信息${mobile ? '，手机长按查看详情' : ''}`}
        title={pendingTame && !isTameable(u) ? tameTip(u) : mobile ? '长按查看生物详情' : choosingEnemyTarget ? (isTarget ? '点击选择攻击目标，右键查看敌人信息' : '当前技能无法攻击，右键查看敌人信息') : '右键查看敌人信息'}
      >
        <UnitCard key={`fx-${fxInfo?.seq ?? 0}`} unit={shownUnit(u)} battleDisplay battleScene skillEnhancements={u.skillEnhancements} className={`${fxInfo?.cls ?? ''} ${isTarget ? 'valid-target targetable' : ''}`} speedOverride={spdMap?.[u.uid]} stacksOverride={passiveSpdMap?.[u.uid]} rockShellHitsOverride={rockShellHitsMap?.[u.uid]} thornsHitCountOverride={thornRoyalHitsMap?.[u.uid]} />
        <BattleStatusIcons unit={shownUnit(u)} pulses={statusPulses[u.uid]} />
        {orderFeedback(u)}
        {showTameTip && <div className="tame-tip">{tameTip(u)}</div>}
        {(showTameTip || capture?.targetUid === u.uid) && <span className="capture-target-ring" aria-hidden="true" />}
        {popOverlay(u.uid)}
      </div>
    );
  };

  const playerSlot = (u: Unit | undefined, key: string, topRow: boolean) => {
    const extra = `formation-slot ${topRow ? 'slot-front' : 'slot-back'}`;
    if (!u) return <div key={key} className={`${extra} empty`} aria-hidden="true" />;
    const sel = selectedUid === u.uid;
    const clickable = choosingAllyTarget ? validAllyTargets.has(u.uid) : validAllyTargets.has(u.uid) || u.hp > 0;
    const aimClass = choosingAllyTarget ? (validAllyTargets.has(u.uid) ? 'ally-target' : 'ally-target-blocked') : '';
    const fxInfo = fx[u.uid];
    return (
      <div
        key={key}
        data-battle-uid={u.uid}
        data-battle-column={u.column}
        className={`${extra} ${life[u.uid] ? `life-${life[u.uid].kind}` : ''} ${clickable ? 'valid-target targetable' : ''} ${sel ? 'selected' : ''} ${aimClass}`}
        aria-disabled={choosingAllyTarget && !clickable ? true : undefined}
        onClick={clickable ? () => onPlayerClick(u.uid) : undefined}
        onClickCapture={suppressLongPressClick}
        onPointerDown={event => startLongPress(event, u.uid, 'player')}
        onPointerMove={moveLongPress}
        onPointerUp={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onContextMenu={(event) => { event.preventDefault(); cancelLongPress(); if (mobile) suppressPressClick.current = true; setInspectAllySkills(mobile); setInspectAlly(u.uid); }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            setInspectAllySkills(false);
            setInspectAlly(u.uid);
          } else if ((event.key === 'Enter' || event.key === ' ') && clickable) {
            event.preventDefault();
            onPlayerClick(u.uid);
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={`${u.name}，右键或按菜单键查看我方生物 Buff${mobile ? '，手机长按查看详情' : ''}`}
        title={mobile ? '长按查看生物详情' : '右键查看我方生物 Buff'}
      >
        <UnitCard key={`fx-${fxInfo?.seq ?? 0}`} unit={shownUnit(u)} battleDisplay battleScene className={`${fxInfo?.cls ?? ''} ${clickable || (sel && !choosingAllyTarget) ? 'valid-target targetable' : ''}`} speedOverride={spdMap?.[u.uid]} stacksOverride={passiveSpdMap?.[u.uid]} rockShellHitsOverride={rockShellHitsMap?.[u.uid]} thornsHitCountOverride={thornRoyalHitsMap?.[u.uid]} />
        <BattleStatusIcons unit={shownUnit(u)} pulses={statusPulses[u.uid]} />
        {orderFeedback(u)}
        {canAct && u.hp > 0 && battle.orders?.[u.uid] && <span className="battle-order-ready">✓ 已安排</span>}
        {popOverlay(u.uid)}
      </div>
    );
  };

  const visibleEnemyUnits = [...battle.enemyUnits, ...departingEnemies].filter((u) => !u.summoning || revealedSummons.has(u.uid));
  const enemyBack = [visibleEnemyUnits.find((u) => u.row === 'back' && u.column === 0), visibleEnemyUnits.find((u) => u.row === 'back' && u.column === 1), visibleEnemyUnits.find((u) => u.row === 'back' && u.column === 2)];
  const enemyFront = [visibleEnemyUnits.find((u) => u.row === 'front' && u.column === 0), visibleEnemyUnits.find((u) => u.row === 'front' && u.column === 1), visibleEnemyUnits.find((u) => u.row === 'front' && u.column === 2)];
  const playerFront = [battle.playerUnits.find((u) => u.row === 'front' && u.column === 0), battle.playerUnits.find((u) => u.row === 'front' && u.column === 1), battle.playerUnits.find((u) => u.row === 'front' && u.column === 2)];
  const playerBack = [battle.playerUnits.find((u) => u.row === 'back' && u.column === 0), battle.playerUnits.find((u) => u.row === 'back' && u.column === 1), battle.playerUnits.find((u) => u.row === 'back' && u.column === 2)];

  return (
    <div className="screen battle-screen" style={{ '--battle-fx-speed': animSpeed, '--battle-fx-play': effectsPaused ? 'paused' : 'running' } as CSSProperties}>
      {battle.mimicPreviewPending && <MimicPreview units={[...battle.playerUnits, ...battle.enemyUnits, ...(battle.playerBench ?? []), ...(battle.enemyBench ?? [])].filter(unit => unit.hp > 0 && getPassive(unit.passive)?.kind === 'mimic')} onConfirm={() => dispatch({ type: 'ACK_MIMIC_PREVIEW' })} />}
      {collapseWarning && !animating && !logPending && !battle.pendingSwap && <CollapseWarning round={battle.round} onConfirm={acknowledgeCollapse} />}
      {state.testRun && testEditorOpen && canAct && <TestBattleEditor battle={battle} units={[...battle.playerUnits, ...battle.enemyUnits]} dispatch={dispatch} onClose={() => setTestEditorOpen(false)} />}
      <div className="hud">
        <span className="act">{state.runMode === 'proficiency' ? '熟练度远征' : `第${state.act}幕`} · 第{state.currentRow + 1}层</span>
        <span className="battle-hud-round">回合 {battle.round}</span>
        {battle.rewindChoice && <span className="chip battle-rewind-choice" title="回溯额外行动：请选择技能与目标，或休息">回溯额外行动</span>}
        {battleCollapseDamage(battle.round) > 0 && <span className="chip" title="本回合末双方全体直接扣生命，无视护盾、减伤与伤害上限">{mobile ? '回合末扣血 ' : '崩解：回合结束全体扣除 '}{battleCollapseDamage(battle.round)}{mobile ? '' : '生命'}</span>}
        {state.testRun && <button type="button" disabled={!canAct} onClick={() => setTestEditorOpen(true)}>调整数值</button>}
        <button type="button" className="touch-only mobile-log-toggle" onClick={() => setMobileLogOpen(v => !v)}>战斗记录</button>
        {battle.gauntlet && (
          <span className="chip" title="敌方轮换上阵，一只倒下另一只顶替">
            🔥 车轮战 {battle.gauntlet.current}/{battle.gauntlet.total}
          </span>
        )}
        {battle.corruptDebuff && (
          <span className="chip battle-corruption-chip" title="被侵蚀区域的暗影 debuff">
            {mobile ? '' : '🌑 暗影侵蚀：'}{battle.corruptDebuff === 'spd' ? '我方速度 -2' : battle.corruptDebuff === 'dmg' ? '我方受到伤害 +2' : battle.corruptDebuff === 'immune' ? '敌人免疫负面效果' : '我方每回合受到 2 点侵蚀伤害'}
          </span>
        )}
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

      <div className="battle-main">
        <div className="battle-field" ref={fieldRef}>
          <BattleStrikeLayer field={fieldRef} strikes={strikes} capture={capture} />
          <div className="enemy-area">
            <span className="battle-row-label first-row">敌方后排</span>
            <span className="battle-row-label second-row">敌方前排</span>
            <div className="formation-row row-back">
              {enemyBack.map((u, i) => enemySlot(u, `eb${i}`, false))}
            </div>
            <div className="formation-row row-front">
              {enemyFront.map((u, i) => enemySlot(u, `ef${i}`, true))}
            </div>
          </div>
          <div className="battle-divider" />
          <div className="player-area">
            <span className="battle-row-label first-row">我方前排</span>
            <span className="battle-row-label second-row">我方后排</span>
            <div className="formation-row row-front">{playerFront.map((u, i) => playerSlot(u, `pf${i}`, true))}</div>
            <div className="formation-row row-back">{playerBack.map((u, i) => playerSlot(u, `pb${i}`, false))}</div>
          </div>
        </div>

        <div className="battle-sidebar">
          <div className={`log-panel${mobileLogOpen ? ' mobile-log-open' : ''}`}>
            <button type="button" className="touch-only mobile-log-close" onClick={() => setMobileLogOpen(false)}>关闭记录</button>
            <button type="button" className="log-title" onClick={() => setLogExpanded((v) => !v)}>
              <span>战斗记录</span>
              <span className="log-title-toggle"><UiSymbol name={logExpanded ? 'arrow-down' : 'arrow-up'} /></span>
            </button>
            <div className="log-box">
              {logItems.map((l, i) => (
                <div key={i} className={`log-line ${l.side} ${i === logItems.length - 1 ? 'recent' : ''}`}>
                  {renderLogText(l.text, l.spans)}
                </div>
              ))}
            </div>
          </div>

          <div className="skill-drawer">
            {selected && selected.hp > 0 ? (
              <div className="skill-drawer-scroll">
                  <div className="battle-selected-unit">
                    <span className="battle-selected-portrait"><PixelCreature unit={shownUnit(selected)} /></span>
                    <span className="battle-selected-summary">
                      <span className="who">
                        <span className="battle-selected-name">{selected.name}</span>
                        {(() => {
                          const p = selected.passive && getPassive(selected.passive);
                          return p ? (
                            <span className="who-passive" title={`被动「${p.name}」：${p.desc}`}>
                              💠{p.name}
                            </span>
                          ) : null;
                        })()}
                        {selectedOrder || (!selected.acted && getPassive(selected.passive)?.kind === 'mirrorCopy') ? (
                          <span className="order-badge battle-order-summary" role="status">{selectedOrderLabel}</span>
                        ) : selected.acted ? (
                          <span className="order-badge">已行动</span>
                        ) : null}
                      </span>
                      <span className="battle-selected-stats"><span><i className="starter-stat-icon starter-stat-heart" aria-hidden="true" /><BattleHpText hp={shownUnit(selected).hp} maxHp={selected.maxHp} /></span><span><i className="starter-stat-icon starter-stat-speed" aria-hidden="true" />{spdMap?.[selected.uid] ?? getEffectiveSpd(shownUnit(selected))}</span></span>
                    </span>
                  </div>
                  <div className="battle-skill-scroll">
                    <div className="battle-skill-grid">
                    {selectedSkills.map((s, displayIndex) => {
                    const left = skillUsesLeft(selected, s.id, battle);
                    const cd = skillCooldownLeft(selected, s.id, battle);
                    const limited = Number.isFinite(left);
                    const onCooldown = cd > 0;
                    const isCurrent = selectedOrder?.skillId === s.id;
                    const isTargeting = (choosingEnemyTarget || choosingAllyTarget) && pendingSkill?.actorUid === selected.uid && pendingSkill.skillId === s.id;
                    const isActive = isCurrent || isTargeting;
                    const cannotOrder = (selected.acted && !selectedOrder) || (!!battle.rewindChoice && battle.rewindChoice.uid !== selected.uid);
                    const slotIdx = selected.skills.indexOf(s.id);
                    const enhanced = getSkillEnhanceLevel(selected, slotIdx);
                    const enhanceLabel = enhanced >= 3 ? '+++' : enhanced === 2 ? '++' : enhanced === 1 ? '+' : '';
                    const fullDesc = skillFullDesc(s, enhanced);
                    const sealStatus = selected.statuses.find((st) => st.kind === 'skillSeal');
                    const isSealed = !!sealStatus && (sealStatus.sealedSkills ?? []).includes(s.id);
                    const unavailable = !canUnitUseSkill(selected, s.id, battle)
                      || (s.id === 'flame_tracing_feather' && !isActive && flameTracingTargets(battle, selected).length === 0)
                      || (requiresBurningTarget(s.id) && !isActive && stokeFireTargets(battle, selected, s.id).length === 0);
                    return (
                      <button
                        key={displayIndex}
                        className={`skill-btn ${isActive ? 'skill-btn-current' : ''}`}
                        aria-pressed={isActive}
                        onClick={() => onSkillClick(s)}
                        disabled={!canAct || unavailable || cannotOrder}
                        title={`${fullDesc}${limited ? `，剩余 ${left} 次` : ''}${onCooldown ? `，冷却 ${cd} 回合` : ''}${isSealed ? `，被封印` : ''}`}
                      >
                        <span className="battle-skill-copy">
                          <span className="skill-btn-head">
                            {s.name}{enhanceLabel && <span style={{ color: isActive ? '#0c1a2a' : '#9f5900', marginLeft: 2 }}>{enhanceLabel}</span>}
                            <span className="skill-num" style={enhanced > 0 && !isActive ? { color: '#9f5900' } : undefined}>{skillBrief(s, enhanced)}</span>
                          </span>
                          <span className="skill-desc">{fullDesc}</span>
                          {mobile && <span className="mobile-skill-meta">{s.id === 'mirror_copy' ? '行动时判定' : ({ single: '单敌', all: '全敌', random: '随机敌', ally: '友方', allyAll: '全队', self: '自身' })[s.target]}{s.priority === 'first' ? '·先手' : ''}{s.cooldown ? `·冷却${cd || s.cooldown}` : ''}{limited ? `·剩${left}次` : ''}{isSealed ? '·封印' : ''}</span>}
                        </span>
                      </button>
                    );
                  })}
                    <button
                      className={`skill-btn ${selectedOrder?.skillId === REST_SKILL_ID ? 'skill-btn-current' : ''}`}
                      onClick={() => {
                        setPendingSkill(null);
                        setSwapFrom(null);
                        setPendingTame(null);
                        setPendingBattleItem(null);
                        setInspectEnemy(null);
                        dispatch({ type: 'PLAYER_REST', actorUid: selected.uid });
                      }}
                      disabled={
                        !canAct ||
                        (selected.acted && !selectedOrder) ||
                        (selectedOrder !== undefined && selectedOrder.skillId !== 'rest')
                      }
                    >
                      <span className="battle-skill-copy"><span className="skill-btn-head">休息</span><span className="skill-desc">
                        {selectedOrder?.skillId === 'rest' ? '已选择' : '放弃本回合行动'}
                      </span></span>
                    </button>
                  </div>
                  </div>
              </div>
            ) : (
              <div className="empty-hint">
                {battle.phase === 'won' ? '战斗胜利！' : battle.phase === 'lost' ? '全队阵亡…' : animating ? '结算中…' : canAct ? '点击己方宠物查看技能' : '敌方行动中…'}
              </div>
            )}
            <div className="skill-drawer-bottom">
              <div className="battle-utility-row">
                <button data-capture-origin className={`hud-action-btn ${foodOverlayOpen ? 'active' : ''}`} onClick={() => { setFoodOverlayOpen((v) => !v); setItemOverlayOpen(false); }} disabled={!canAct || !!battle.rewindChoice}><BattleActionIcon kind="capture" />捕获</button>
                <button className={`hud-action-btn ${itemOverlayOpen ? 'active' : ''}`} onClick={() => { setItemOverlayOpen((v) => !v); setFoodOverlayOpen(false); }} disabled={!canAct || !!battle.rewindChoice}><BattleActionIcon kind="item" />道具</button>
                <button
                  className="hud-action-btn"
                  onClick={() => {
                    if (!selected) return;
                    setPendingSkill(null);
                    setPendingTame(null);
                    setPendingBattleItem(null);
                    setInspectEnemy(null);
                    setSwapFrom(selected.uid);
                  }}
                  disabled={!selected || alivePlayers.length < 2 || selected.acted || animating || !!battle.rewindChoice}
                  title="与另一只己方宠物交换位置（占用发起者本回合行动）"
                ><BattleActionIcon kind="swap" />换位</button>
              </div>
              <div className="end-row">
                {hasPendingTarget && <button type="button" className="touch-only mobile-cancel-target" onClick={cancelTarget}>取消选择目标</button>}
                <div className="anim-controls">
                  {animating && <button className="anim-skip-btn" onClick={skipAnim} aria-label="跳过动画" title="跳过动画"><UiSymbol name="arrow-right" /></button>}
                  <button
                    className="anim-speed-btn"
                    aria-label={`当前动画速度 ${animSpeed} 倍，点击切换`}
                    onClick={() => setAnimSpeed(animSpeed === 1 ? 2 : animSpeed === 2 ? 4 : 1)}
                  >
                    <UiSymbol name="play" /> {animSpeed}x
                  </button>
                </div>
                <button className="end-turn-btn" onClick={() => dispatch({ type: 'END_TURN' })} disabled={!canAct || !!battle.rewindChoice}>
                  结束回合
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {inspectedEnemy && (
        <div className="battle-overlay-mask" onClick={() => setInspectEnemy(null)}>
          <div className="battle-overlay-panel enemy-inspect-modal" role="dialog" aria-modal="true" aria-labelledby="enemy-inspect-title" onClick={(event) => event.stopPropagation()}>
            <div className="battle-overlay-head">
              <h2 id="enemy-inspect-title" className="battle-overlay-title">敌人信息</h2>
              <button className="battle-overlay-close" onClick={() => setInspectEnemy(null)} aria-label="关闭敌人信息" autoFocus><UiSymbol name="close" /></button>
            </div>
            <BattleUnitInspectPanel battle={battle} unit={shownUnit(inspectedEnemy)} speed={spdMap?.[inspectedEnemy.uid]} side="enemy">
              <BuffDetailPanel unit={shownUnit(inspectedEnemy)} stacksOverride={passiveSpdMap?.[inspectedEnemy.uid]} rockShellHitsOverride={rockShellHitsMap?.[inspectedEnemy.uid]} thornsHitCountOverride={thornRoyalHitsMap?.[inspectedEnemy.uid]} hideTitle />
            </BattleUnitInspectPanel>
          </div>
        </div>
      )}

      {inspectedAlly && (
        <div className="battle-overlay-mask" onClick={() => setInspectAlly(null)}>
          <div className="battle-overlay-panel enemy-inspect-modal" role="dialog" aria-modal="true" aria-labelledby="ally-inspect-title" onClick={(event) => event.stopPropagation()}>
            <div className="battle-overlay-head">
              <h2 id="ally-inspect-title" className="battle-overlay-title">我方生物 Buff</h2>
              <button className="battle-overlay-close" onClick={() => setInspectAlly(null)} aria-label="关闭我方生物 Buff" autoFocus><UiSymbol name="close" /></button>
            </div>
            <BattleUnitInspectPanel battle={battle} unit={shownUnit(inspectedAlly)} speed={spdMap?.[inspectedAlly.uid]} side="player" showSkills={inspectAllySkills}>
              <BuffDetailPanel unit={shownUnit(inspectedAlly)} stacksOverride={passiveSpdMap?.[inspectedAlly.uid]} rockShellHitsOverride={rockShellHitsMap?.[inspectedAlly.uid]} thornsHitCountOverride={thornRoyalHitsMap?.[inspectedAlly.uid]} hideTitle />
            </BattleUnitInspectPanel>
          </div>
        </div>
      )}

      {foodOverlayOpen && (
        <div className="battle-overlay-mask" onClick={() => setFoodOverlayOpen(false)}>
          <div className="battle-overlay-panel" onClick={(e) => e.stopPropagation()}>
            <div className="battle-overlay-head">
              <div className="battle-overlay-title popup-food">捕获食物</div>
              <button className="battle-overlay-close" onClick={() => setFoodOverlayOpen(false)} aria-label="关闭捕获食物"><UiSymbol name="close" /></button>
            </div>
            <div className="battle-overlay-grid">
              {foods.length === 0 ? (
                <div className="overlay-empty">没有食物</div>
              ) : foods.map((f) => {
                const count = state.inventory[f.id] ?? 0;
                return (
                  <button
                    key={f.id}
                    onClick={() => { onFoodClick(f.id); setFoodOverlayOpen(false); }}
                    disabled={count <= 0 || battle.phase !== 'acting' || !aliveEnemies.some((u) => isTameable(u))}
                  >
                    <span className="battle-overlay-item-name"><img className="capture-food-icon" src={`/capture-food-icons/${f.id}.png`} alt="" />{f.name}</span>
                    <span>×{count}</span>
                  </button>
                );
              })}
            </div>
            <p className="battle-overlay-note">选择食物后，再指定可驯服的敌人</p>
          </div>
        </div>
      )}

      {itemOverlayOpen && (
        <div className="battle-overlay-mask" onClick={() => setItemOverlayOpen(false)}>
          <div className="battle-overlay-panel" onClick={(e) => e.stopPropagation()}>
            <div className="battle-overlay-head">
              <div className="battle-overlay-title popup-items">战斗道具</div>
              <button className="battle-overlay-close" onClick={() => setItemOverlayOpen(false)} aria-label="关闭战斗道具"><UiSymbol name="close" /></button>
            </div>
            <div className="battle-overlay-grid">
              {battleItems.length === 0 ? (
                <div className="overlay-empty">没有战斗道具</div>
              ) : battleItems.map((it) => {
                const count = state.inventory[it.id] ?? 0;
                return (
                  <button
                    key={it.id}
                    onClick={() => { onBattleItemClick(it.id); setItemOverlayOpen(false); }}
                    disabled={!canAct}
                  >
                    <span className="battle-overlay-item-name"><img className="battle-item-icon" src={BACKPACK_ITEM_ART[it.id]} alt="" aria-hidden="true" />{it.name}</span>
                    <span>×{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {battle.phase === 'won' && !animating && !logPending && (
        <div className="overlay">
          <div className="overlay-box popup-victory">
            <div className="popup-result-mark" aria-hidden="true" />
            <h2>{isChallenge ? '挑战胜利' : '战斗胜利'}</h2>
            <p className="popup-result-detail">
              {`驯服了 ${battle.pendingTame.length} 只宠物${battleVictoryGold(state) > 0
                ? `，获得 ${battleVictoryGold(state)} 金币`
                : isChallenge ? '，获得挑战奖励' : ''}`}
            </p>
            <button className="primary big-btn" onClick={() => dispatch({ type: 'BATTLE_END_CONFIRM' })}>
              确认收获
            </button>
          </div>
        </div>
      )}

      {battle.phase === 'lost' && !animating && !logPending && !isSimulation && (
        <div className="overlay">
          <div className="overlay-box popup-defeat">
            <div className="popup-result-mark" aria-hidden="true" />
            <h2>{isArena3Challenge || !isChallenge ? '全队阵亡' : '挑战失败'}</h2>
            <p className="popup-result-detail">{isArena3Challenge || !isChallenge ? '阵亡的宠物永久消失，本次远征到此结束' : '没有宠物阵亡，但需要承受挑战失败的代价'}</p>
            <button className="big-btn" onClick={() => dispatch({ type: 'BATTLE_END_CONFIRM' })}>
              {isArena3Challenge || !isChallenge ? '确认' : '确认承受代价'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
