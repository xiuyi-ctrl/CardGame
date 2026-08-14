import { useEffect, useMemo, useRef, useState } from 'react';
import type { BattleState, LogEntry, StatusEffect } from '../game/types';
import { SKILLS } from '../game/data/skills';

/** 战斗动画事件（由日志文本解析而来，纯 UI 视觉，不影响战斗逻辑） */
interface FxEvent {
  kind: 'attack' | 'heal' | 'dot' | 'thorn' | 'buff' | 'speed';
  actorUid?: string;
  targetUid?: string;
  value: number;
  actorIsPlayer?: boolean;
  /** 该事件发生时的全体血量快照（uid → hp） */
  hp?: Record<string, number>;
  /** 该事件发生时的全员状态快照（uid → 状态数组），用于按事件回放状态层数（如灼烧 5 层→dot 后 2 层） */
  statuses?: Record<string, StatusEffect[]>;
  /** 该事件发生时的全员护盾快照（uid → shield），用于按事件回放护盾值 */
  shields?: Record<string, number>;
  /** dot 事件对应的状态 kind（burn/poison），用于定位状态标签消失时机 */
  statusKind?: string;
  /** buff/治疗事件使用的技能名，用于飘字文案（如战吼→「攻击↑」） */
  skillName?: string;
  /** 攻击事件：本次攻击附加给 target 的状态 kind（来自日志 addsStatus），用于在该攻击动画播放时揭示 */
  addsStatus?: string[];
}

/** 伤害/治疗/buff 飘字 */
export interface PopItem {
  id: number;
  uid: string;
  text: string;
  heal: boolean;
  buff?: boolean;
  shield?: boolean;
}

/** 揭示目标：事件 i 播放时揭示 uid 上的指定状态 kind */
export interface RevealEntry {
  uid: string;
  kinds: string[];
}

/** 计算每个新增状态的揭示时机：绑定到「附加它的那次行动动画」，而非目标被攻击的首个事件。
 *  攻击类状态（灼烧/中毒/减防/眩晕）标记在对应攻击日志上（addsStatus），按其攻击顺序依次揭示——
 *  每只宠物攻击动画播放时立即显示它附加的状态；连击多段时标记在最后一段（状态在全部段后才生效）。
 *  仅匹配攻击事件——同一轮结算里攻击日志后紧跟的 dot（灼烧/中毒掉血）日志 targetUid 相同，若也参与匹配，
 *  灼烧会被推迟到 dot 动画才显示，而非「我方攻击、敌人扣血动画」同时出现。
 *  buff 类状态（战吼附加的 atkUp 等）由该单位施放 buff 技能产生，随该单位施法动画揭示——
 *  精确匹配 kind==='buff' 且 actorUid===该单位，避免被更早的 dot 掉血/其他「目标事件」提前。
 *  仍匹配不到归属（如治疗/药水产生）时，归入该单位作为目标的第一个事件（随施法/治疗动画揭示）；
 *  目标从未出现在事件中才兜底第一个事件，保证不迟于动画开始显示 */
export function computeRevealAt(
  events: readonly { targetUid?: string; kind?: string; addsStatus?: string[]; actorUid?: string }[],
  newStatuses: Record<string, string[]>,
): Record<number, RevealEntry[]> {
  const revealAt: Record<number, RevealEntry[]> = {};
  const add = (i: number, uid: string, kinds: string[]) => {
    if (kinds.length === 0) return;
    const existing = revealAt[i]?.find((e) => e.uid === uid);
    if (existing) existing.kinds.push(...kinds);
    else (revealAt[i] ??= []).push({ uid, kinds: [...kinds] });
  };
  for (const uid of Object.keys(newStatuses)) {
    const kinds = [...newStatuses[uid]];
    const assigned = new Array<boolean>(kinds.length).fill(false);
    // 1) 精确匹配：该 kind 由某次攻击附加，随那次攻击动画揭示
    for (let k = 0; k < kinds.length; k++) {
      const i = events.findIndex(
        (ev) => ev.targetUid === uid && ev.kind === 'attack' && (ev.addsStatus ?? []).includes(kinds[k]),
      );
      if (i >= 0) {
        add(i, uid, [kinds[k]]);
        assigned[k] = true;
      }
    }
    // 2) buff 施法归属：buff 状态（如战吼附加的 atkUp）随该单位施放 buff 技能的施法动画揭示
    for (let k = 0; k < kinds.length; k++) {
      if (assigned[k]) continue;
      const i = events.findIndex((ev) => ev.kind === 'buff' && ev.actorUid === uid);
      if (i >= 0) {
        add(i, uid, [kinds[k]]);
        assigned[k] = true;
      }
    }
    // 3) 兜底：未归属状态归入该单位作为目标的第一个事件（buff 施法/治疗等），保证随对应动画出现
    const rest = kinds.filter((_, k) => !assigned[k]);
    if (rest.length > 0) {
      const j = events.findIndex((ev) => ev.targetUid === uid);
      if (j >= 0) add(j, uid, rest);
      else if (events.length > 0) add(0, uid, rest);
    }
  }
  return revealAt;
}

/** 把新增状态全部标记为已揭示（用于无动画事件 / 动画全部播放完的场合） */
export function allRevealed(newStatuses: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const uid of Object.keys(newStatuses)) out[uid] = [...newStatuses[uid]];
  return out;
}

const RE_ATTACK = /^(.+?) 使用「(.+?)」攻击 (.+?)，造成 (\d+) 伤害$/;
const RE_HEAL = /^(.+?) 使用「(.+?)」(?:，治愈|恢复) (.+?) (\d+) 点生命$/;
const RE_PASSIVE_HEAL = /^(.+?) 的「(.+?)」(?:恢复|治愈) (\d+) 点生命$/;
const RE_DOT = /^(.+?) 受到(灼烧|中毒) (\d+) 点伤害$/;
const RE_THORN = /^(.+?) 的「(.+?)」反伤 (.+?) (\d+) 点$/;
const RE_BUFF = /^(.+?) 使用「(.+?)」，强化(.+)$/;
const RE_SPD_UP = /^(.+?) 的「(.+?)」速度 \+(\d+)$/;

/** buff 技能飘字：按技能施加的状态显示，如战吼→「攻击↑」；无法识别时兜底「强化」 */
function buffText(skillName: string): string {
  const skill = Object.values(SKILLS).find((s) => s.name === skillName);
  if (skill?.kind === 'buff') {
    const e = skill.effects?.[0];
    if (e?.kind === 'atkUp') return '攻击↑';
    if (e?.kind === 'shield') return '🛡️护盾';
  }
  return '强化';
}

function unitsOf(b: BattleState, side: 'player' | 'enemy') {
  return side === 'player' ? b.playerUnits : b.enemyUnits;
}

function findUid(b: BattleState, side: 'player' | 'enemy', name: string): string | undefined {
  return unitsOf(b, side).find((u) => u.name === name)?.uid;
}

function hpOfUnits(b: BattleState): Record<string, number> {
  const hp: Record<string, number> = {};
  for (const u of [...b.playerUnits, ...b.enemyUnits]) hp[u.uid] = u.hp;
  return hp;
}

function statusesOfUnits(b: BattleState): Record<string, StatusEffect[]> {
  const out: Record<string, StatusEffect[]> = {};
  for (const u of [...b.playerUnits, ...b.enemyUnits]) out[u.uid] = u.statuses.map((s) => ({ ...s }));
  return out;
}

function shieldsOfUnits(b: BattleState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const u of [...b.playerUnits, ...b.enemyUnits]) out[u.uid] = u.shield;
  return out;
}

/** 计算每个单位的有效速度（与 UnitCard 同步） */
function spdOfUnits(b: BattleState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const u of [...b.playerUnits, ...b.enemyUnits]) {
    const buffSpd = (u.battleBuffs?.spdUp ? 1 : 0) - (u.battleBuffs?.spdDown ? 1 : 0);
    const skillSpd = u.battleBuffs?.skillSpd ?? 0;
    const spdDownSt = u.statuses.find((s) => s.kind === 'spdDown');
    const statusSpd = spdDownSt ? -spdDownSt.value : 0;
    const windSpdSt = u.statuses.find((s) => s.kind === 'windSpd');
    const windSpd = windSpdSt ? windSpdSt.value : 0;
    out[u.uid] = Math.max(1, u.spd + buffSpd + skillSpd + statusSpd + windSpd);
  }
  return out;
}

/** 解析一条战斗日志为动画事件；无法识别或名字找不到目标时返回 null */
function parseEvent(b: BattleState, entry: LogEntry): FxEvent | null {
  const text = entry.text;
  const side = entry.side;
  if (side === 'info') return null;
  const opposite: 'player' | 'enemy' = side === 'player' ? 'enemy' : 'player';

  let m: RegExpMatchArray | null;
  if ((m = text.match(RE_ATTACK))) {
    return {
      kind: 'attack',
      actorUid: entry.actorUid ?? findUid(b, side, m[1]),
      targetUid: entry.targetUid ?? findUid(b, opposite, m[3]),
      value: Number(m[4]),
      actorIsPlayer: side === 'player',
      addsStatus: entry.addsStatus,
      hp: entry.hp,
      statuses: entry.statuses,
      shields: entry.shields,
    };
  }
  if ((m = text.match(RE_HEAL))) {
    return {
      kind: 'heal',
      actorUid: entry.actorUid ?? findUid(b, side, m[1]),
      targetUid: entry.targetUid ?? findUid(b, side, m[3]),
      value: Number(m[4]),
      hp: entry.hp,
      statuses: entry.statuses,
      shields: entry.shields,
    };
  }
  if ((m = text.match(RE_PASSIVE_HEAL))) {
    const uid = entry.actorUid ?? entry.targetUid ?? findUid(b, side, m[1]);
    return { kind: 'heal', actorUid: uid, targetUid: uid, value: Number(m[3]), hp: entry.hp, statuses: entry.statuses, shields: entry.shields };
  }
  if ((m = text.match(RE_BUFF))) {
    const actorUid = entry.actorUid ?? findUid(b, side, m[1]);
    const targetName = m[3];
    const targetUid = entry.targetUid ?? (targetName === '自身' ? actorUid : findUid(b, side, targetName));
    return { kind: 'buff', actorUid, targetUid, value: 0, skillName: m[2], hp: entry.hp, statuses: entry.statuses, shields: entry.shields };
  }
  if ((m = text.match(RE_DOT))) {
    return {
      kind: 'dot',
      targetUid: entry.targetUid ?? findUid(b, side, m[1]),
      value: Number(m[3]),
      statusKind: m[2] === '灼烧' ? 'burn' : 'poison',
      hp: entry.hp,
      statuses: entry.statuses,
      shields: entry.shields,
    };
  }
  if ((m = text.match(RE_THORN))) {
    return {
      kind: 'thorn',
      actorUid: entry.actorUid ?? findUid(b, side, m[1]),
      targetUid: entry.targetUid ?? findUid(b, opposite, m[3]),
      value: Number(m[4]),
      hp: entry.hp,
      statuses: entry.statuses,
      shields: entry.shields,
    };
  }
  if ((m = text.match(RE_SPD_UP))) {
    const uid = entry.actorUid ?? entry.targetUid ?? findUid(b, side, m[1]);
    return {
      kind: 'speed',
      actorUid: uid,
      targetUid: uid,
      value: Number(m[3]),
      skillName: m[2],
      hp: entry.hp,
      statuses: entry.statuses,
      shields: entry.shields,
    };
  }
  return null;
}

const STEP_MS = 800;
const CLEAR_MS = 1300;
let popSeq = 0;
/** 动画序号：每次触发动画自增，作为 UnitCard 的 key 强制重挂载，保证连续命中（连击/随机多段）每次动画都重新播放 */
let fxSeq = 0;

/** 单个单位当前播放的动画：cls 为 CSS class，seq 供 UI 用 key 强制重启动画 */
export interface FxAnim {
  cls: string;
  seq: number;
}

/**
 * 战斗动画：监听 battle.log 增量，把新日志按顺序播放为冲刺/受击/飘字，
 * 并在每个事件播放时同步推进血量与状态层数显示（hpMap/statusMap，动画结束后清空恢复真实值）。
 * 新增的灼烧/中毒等状态标签在攻击动画触发时才显示（渲染期派生 hiddenStatuses 先隐藏，
 * 事件播放时通过 revealedKinds 标记揭示，不触发多余重渲染）；
 * 回合结算中消失的状态（turns 用尽）延迟到其最后一次掉血动画播放时才移除（endingStatuses），
 * 与飘字、血量条下降同步。
 * 返回 fx（uid → 动画 class）、pops（飘字）、hpMap（当前应显示的血量）、
 * statusMap（当前应显示的状态快照，随事件推进，如攻击时灼烧 5 层、dot 后 2 层）、
 * hiddenStatuses（uid → 尚未揭示的新增状态）、endingStatuses（uid → 尚未移除的到期状态）、
 * animating（结算动画播放中）、logPending（日志中还有未播放的动画事件）。
 */
export function useBattleFx(battle: BattleState | null | undefined) {
  const [fx, setFx] = useState<Record<string, FxAnim>>({});
  const [pops, setPops] = useState<PopItem[]>([]);
  const [hpMap, setHpMap] = useState<Record<string, number> | null>(null);
  const [shieldMap, setShieldMap] = useState<Record<string, number> | null>(null);
  const [spdMap, setSpdMap] = useState<Record<string, number> | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, StatusEffect[]> | null>(null);
  const [revealedKinds, setRevealedKinds] = useState<Record<string, string[]>>({});
  const [endingStatuses, setEndingStatuses] = useState<Record<string, string[]>>({});
  const [animating, setAnimating] = useState(false);
  const [revealedLogLen, setRevealedLogLen] = useState(0);
  const prevLen = useRef(0);
  const prevBattle = useRef<BattleState | null | undefined>(null);
  const prevStatusRef = useRef<BattleState | null | undefined>(null);
  const timers = useRef<number[]>([]);

  // 渲染期同步派生：日志里还有尚未播放的动画事件（prevLen 在 effect 中才推进）。
  // 用于结算帧兜底——phase 已变 won/lost 但动画 effect 尚未运行（animating 仍为 false）的那一帧，
  // 用本值拦截「弹窗提前闪出又消失」：结算帧 logPending=true 不弹，动画播完 prevLen 已推进才弹。
  const logPending = battle ? battle.log.length > prevLen.current : false;

  // 每次渲染后把当前 battle 记入 ref；渲染期读取到的是「上一快照」，用于计算新增状态。
  // 必须在 useEffect 里更新（而非 useMemo 工厂内），否则 StrictMode 双调用 useMemo 时
  // 第二次会读到已被污染的 prev===当前 battle，差集为空导致新增状态不隐藏、动画前就显示。
  useEffect(() => {
    prevStatusRef.current = battle;
  });
  // 渲染期计算：相比上一快照新增的状态（结算后新挂上的灼烧/中毒等），用于动画播放前隐藏
  const newStatuses = useMemo(() => {
    const prev = prevStatusRef.current;
    if (!battle || !prev) return {};
    const prevKinds = new Map<string, Set<string>>();
    for (const u of [...prev.playerUnits, ...prev.enemyUnits]) {
      prevKinds.set(u.uid, new Set(u.statuses.map((s) => s.kind)));
    }
    const result: Record<string, string[]> = {};
    for (const u of [...battle.playerUnits, ...battle.enemyUnits]) {
      const pk = prevKinds.get(u.uid);
      if (!pk) continue;
      const added = u.statuses.filter((s) => !pk.has(s.kind)).map((s) => s.kind);
      if (added.length > 0) result[u.uid] = added;
    }
    return result;
  }, [battle]);

  // 尚未揭示的新增状态：动画触发揭示（写入 revealedKinds）后从派生值中消失
  const hiddenStatuses = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const uid of Object.keys(newStatuses)) {
      const revealed = revealedKinds[uid];
      const hidden = newStatuses[uid].filter((k) => !revealed || !revealed.includes(k));
      if (hidden.length > 0) result[uid] = hidden;
    }
    return result;
  }, [newStatuses, revealedKinds]);

  useEffect(() => {
    if (!battle) {
      // 战斗被清空（如返回首页）：立即停止动画并重置基线，避免残留 timer/animating
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
      prevBattle.current = null;
      prevLen.current = 0;
      setAnimating(false);
      setRevealedLogLen(0);
      setHpMap(null);
      setSpdMap(null);
      setStatusMap(null);
      setFx({});
      setPops([]);
      setRevealedKinds({});
      setEndingStatuses({});
      return;
    }
    const prevBattleBefore = prevBattle.current;
    prevBattle.current = battle;
    // 首次遇到该战斗（含从存档/继续游戏恢复的中途战斗）：只初始化基线、不重播既有日志。
    // 否则会把整场战斗的日志全部当作新事件重播，动画长时间停在「战斗结算中」。
    if (prevBattleBefore === null) {
      prevLen.current = battle.log.length;
      setRevealedLogLen(battle.log.length);
      setAnimating(false);
      setShieldMap(shieldsOfUnits(battle));
      return;
    }
    const startLen = prevLen.current;
    const newEntries = battle.log.slice(startLen);
    prevLen.current = battle.log.length;
    if (newEntries.length === 0) return;

    const events: FxEvent[] = [];
    const eventSrcIdx: number[] = [];
    newEntries.forEach((e, idx) => {
      const ev = parseEvent(battle, e);
      if (ev) {
        events.push(ev);
        eventSrcIdx.push(idx);
      }
    });
    const prevHp = prevBattleBefore ? hpOfUnits(prevBattleBefore) : hpOfUnits(battle);
    const prevShields = prevBattleBefore ? shieldsOfUnits(prevBattleBefore) : shieldsOfUnits(battle);
    const prevSpd = prevBattleBefore ? spdOfUnits(prevBattleBefore) : spdOfUnits(battle);
    const prevStatuses = prevBattleBefore ? statusesOfUnits(prevBattleBefore) : statusesOfUnits(battle);
    // 仅当日志带状态快照（真实战斗 pushLog 均会写入）时才启用状态回放；
    // 测试手搓的日志无 statuses 字段时保持原有「直接读最终状态」行为
    const hasStatusSnapshots = newEntries.some((e) => e.statuses !== undefined);

    // 到期消失的状态：上一快照存活单位有、当前没有的状态 kind，动画播放期间先继续显示
    const endingStatuses: Record<string, string[]> = {};
    if (prevBattleBefore) {
      const curKinds = new Map<string, Set<string>>();
      for (const u of [...battle.playerUnits, ...battle.enemyUnits]) {
        curKinds.set(u.uid, new Set(u.statuses.map((s) => s.kind)));
      }
      for (const u of [...prevBattleBefore.playerUnits, ...prevBattleBefore.enemyUnits]) {
        if (u.hp <= 0) continue;
        const ck = curKinds.get(u.uid);
        const removed = u.statuses.filter((s) => !ck || !ck.has(s.kind)).map((s) => s.kind);
        if (removed.length > 0) endingStatuses[u.uid] = removed;
      }
    }
    setEndingStatuses(endingStatuses);

    // 每个单位的新状态在「附加它的那次攻击动画」播放时揭示（攻击日志 addsStatus 标记归属；
    // 同一目标被多只宠物先后附加不同状态时按攻击顺序依次揭示，连击等状态标在最后一段）；
    // 匹配不到归属（buff 施法/治疗产生）时归入该单位作为目标的第一个事件，目标从未出现才兜底第一个事件
    const revealAt = computeRevealAt(events, newStatuses);

    // 到期状态在其最后一次对应 dot 掉血动画播放时移除（与飘字/血条下降同步）；无对应事件则随动画结束移除
    const hideAt: Record<number, Record<string, string[]>> = {};
    for (const uid of Object.keys(endingStatuses)) {
      for (const kind of endingStatuses[uid]) {
        const i = events.findIndex((ev) => ev.targetUid === uid && ev.statusKind === kind);
        if (i >= 0) (hideAt[i] ??= {})[uid] = [...((hideAt[i] ?? {})[uid] ?? []), kind];
      }
    }

    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setFx({});
    setPops([]);

    // 无血量变化事件（如纯状态/换位）则不进入动画，新增状态立即全部显示
    if (events.length === 0) {
      setAnimating(false);
      setHpMap(null);
      setSpdMap(null);
      setShieldMap(shieldsOfUnits(battle));
      setStatusMap(null);
      setRevealedKinds(allRevealed(newStatuses));
      setEndingStatuses({});
      setRevealedLogLen(battle.log.length);
      return;
    }

    // 动画开始：先显示结算前的血量与状态，随后按事件逐个推进到对应快照；
    // 战斗记录同步逐条揭示——事件 i 播放时显示到对应日志（含其前的无事件日志，如系统提示）
    setAnimating(true);
    setHpMap(prevHp);
    setShieldMap(prevShields);
    setSpdMap(prevSpd);
    if (hasStatusSnapshots) setStatusMap(prevStatuses);
    setRevealedLogLen(startLen);
    events.forEach((ev, i) => {
      const t = window.setTimeout(
        () => {
          setRevealedLogLen((cur) => Math.max(cur, startLen + eventSrcIdx[i] + 1));
          const popId = ++popSeq;
          const actorUid = ev.actorUid;
          const targetUid = ev.targetUid;
          // 该事件的动画触发后揭示它附加给目标的新增状态标签（按 kind 增量写入 revealedKinds，
          // 同一目标不同攻击附加的状态可分别在各自的攻击动画时依次显示）
          if (revealAt[i]) {
            setRevealedKinds((p) => {
              const next = { ...p };
              let changed = false;
              for (const { uid, kinds } of revealAt[i]) {
                const cur = next[uid] ?? [];
                const missing = kinds.filter((k) => !cur.includes(k));
                if (missing.length > 0) {
                  next[uid] = [...cur, ...missing];
                  changed = true;
                }
              }
              return changed ? next : p;
            });
          }
          // 该事件的动画触发时同步移除对应的到期状态标签（灼烧/中毒 turns 用尽）
          const hide = hideAt[i];
          if (hide) {
            setEndingStatuses((p) => {
              const next = { ...p };
              let changed = false;
              for (const uid of Object.keys(hide)) {
                if (!next[uid]) continue;
                const left = next[uid].filter((k) => !hide[uid].includes(k));
                if (left.length > 0) next[uid] = left;
                else delete next[uid];
                changed = true;
              }
              return changed ? next : p;
            });
          }
          // 每个 setFx 立即捕获当时的 seq，供 clear 超时精确比对，
          // 避免多次 ++fxSeq 后统一捕获导致 actorSeq/targetSeq 与实际 seq 不匹配
          let capturedActorSeq = 0;
          let capturedTargetSeq = 0;
          if (ev.kind === 'attack') {
            if (actorUid) { ++fxSeq; capturedActorSeq = fxSeq; setFx((p) => ({ ...p, [actorUid]: { cls: ev.actorIsPlayer ? 'fx-attack-up' : 'fx-attack-down', seq: capturedActorSeq } })); }
            if (targetUid) {
              ++fxSeq; capturedTargetSeq = fxSeq; setFx((p) => ({ ...p, [targetUid]: { cls: 'fx-hit', seq: capturedTargetSeq } }));
              setPops((p) => [...p, { id: popId, uid: targetUid, text: `-${ev.value}`, heal: false }]);
            }
          } else if (ev.kind === 'heal') {
            if (actorUid) { ++fxSeq; capturedActorSeq = fxSeq; setFx((p) => ({ ...p, [actorUid]: { cls: 'fx-cast', seq: capturedActorSeq } })); }
            if (targetUid) {
              ++fxSeq; capturedTargetSeq = fxSeq;
              setFx((p) => ({ ...p, [targetUid]: { cls: 'fx-heal', seq: capturedTargetSeq } }));
              setPops((p) => [...p, { id: popId, uid: targetUid, text: `+${ev.value}`, heal: true }]);
            }
          } else if (ev.kind === 'buff') {
            if (actorUid) { ++fxSeq; capturedActorSeq = fxSeq; setFx((p) => ({ ...p, [actorUid]: { cls: 'fx-cast', seq: capturedActorSeq } })); }
            if (targetUid) {
              const sk = ev.skillName ? Object.values(SKILLS).find((s) => s.name === ev.skillName) : undefined;
              const isShield = sk?.effects?.[0]?.kind === 'shield';
              const buffCls = isShield ? 'fx-shield' : 'fx-buff';
              ++fxSeq; capturedTargetSeq = fxSeq;
              setFx((p) => ({ ...p, [targetUid]: { cls: buffCls, seq: capturedTargetSeq } }));
              setPops((p) => [...p, { id: popId, uid: targetUid, text: buffText(ev.skillName ?? ''), heal: false, buff: !isShield, shield: isShield }]);
            }
          } else if (ev.kind === 'speed') {
            if (targetUid) {
              ++fxSeq; capturedTargetSeq = fxSeq;
              setFx((p) => ({ ...p, [targetUid]: { cls: 'fx-buff', seq: capturedTargetSeq } }));
              setPops((p) => [...p, { id: popId, uid: targetUid, text: `速度+${ev.value}`, heal: false, buff: true }]);
              setSpdMap((p) => p ? { ...p, [targetUid]: (p[targetUid] ?? 0) + ev.value } : p);
            }
          } else if (targetUid) {
            ++fxSeq; capturedTargetSeq = fxSeq; setFx((p) => ({ ...p, [targetUid]: { cls: 'fx-hit', seq: capturedTargetSeq } }));
            setPops((p) => [...p, { id: popId, uid: targetUid, text: `-${ev.value}`, heal: false }]);
          }
          if (ev.hp) setHpMap(ev.hp);
          if (ev.shields) setShieldMap(ev.shields);
          if (ev.statuses) setStatusMap(ev.statuses);

          // 用各自捕获的 seq 做 clear 比对，仅当该 unit 的 fx 仍是本事件设置的才清除
          const clear = window.setTimeout(
            () => {
              setFx((p) => {
                const next = { ...p };
                if (actorUid && next[actorUid]?.seq === capturedActorSeq) delete next[actorUid];
                if (targetUid && next[targetUid]?.seq === capturedTargetSeq) delete next[targetUid];
                return next;
              });
              setPops((p) => p.filter((x) => x.id !== popId));
            },
            CLEAR_MS,
          );
          timers.current.push(clear);
        },
        i * STEP_MS,
      );
      timers.current.push(t);
    });

    // 全部事件播放完后结束动画，恢复显示真实血量（此时若已分出胜负，UI 再展示结算弹窗）
    const done = window.setTimeout(
      () => {
        setAnimating(false);
        setHpMap(null);
        setSpdMap(null);
        // 不清理 shieldMap，保留最后事件快照，防止新动画启动时 prevShields 与真实值的跳变导致盾图标闪烁
        setStatusMap(null);
        setRevealedKinds(allRevealed(newStatuses));
        setEndingStatuses({});
        setRevealedLogLen(battle.log.length);
      },
      events.length * STEP_MS + CLEAR_MS,
    );
    timers.current.push(done);
  }, [battle?.log.length]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  return { fx, pops, hpMap, shieldMap, spdMap, statusMap, hiddenStatuses, endingStatuses, animating, logPending, revealedLogLen };
}
