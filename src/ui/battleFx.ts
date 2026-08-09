import { useEffect, useRef, useState } from 'react';
import type { BattleState, LogEntry } from '../game/types';
import { SKILLS } from '../game/data/skills';

/** 战斗动画事件（由日志文本解析而来，纯 UI 视觉，不影响战斗逻辑） */
interface FxEvent {
  kind: 'attack' | 'heal' | 'dot' | 'thorn' | 'buff';
  actorUid?: string;
  targetUid?: string;
  value: number;
  actorIsPlayer?: boolean;
  /** 该事件发生时的全体血量快照（uid → hp） */
  hp?: Record<string, number>;
  /** dot 事件对应的状态 kind（burn/poison），用于定位状态标签消失时机 */
  statusKind?: string;
  /** buff/治疗事件使用的技能名，用于飘字文案（如战吼→「攻击↑」） */
  skillName?: string;
}

/** 伤害/治疗/buff 飘字 */
export interface PopItem {
  id: number;
  uid: string;
  text: string;
  heal: boolean;
  buff?: boolean;
}

const RE_ATTACK = /^(.+?) 使用「(.+?)」攻击 (.+?)，造成 (\d+) 伤害$/;
const RE_HEAL = /^(.+?) 使用「(.+?)」，治愈 (.+?) (\d+) 点生命$/;
const RE_DOT = /^(.+?) 受到(灼烧|中毒) (\d+) 点伤害$/;
const RE_THORN = /^(.+?) 的「(.+?)」反伤 (.+?) (\d+) 点$/;
const RE_BUFF = /^(.+?) 使用「(.+?)」，强化自身$/;

/** buff 技能飘字：按技能施加的状态显示，如战吼→「攻击↑」；无法识别时兜底「强化」 */
function buffText(skillName: string): string {
  const skill = Object.values(SKILLS).find((s) => s.name === skillName);
  if (skill?.kind === 'buff') {
    const e = skill.effects?.[0];
    if (e?.kind === 'atkUp') return '攻击↑';
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
      actorUid: findUid(b, side, m[1]),
      targetUid: findUid(b, opposite, m[3]),
      value: Number(m[4]),
      actorIsPlayer: side === 'player',
      hp: entry.hp,
    };
  }
  if ((m = text.match(RE_HEAL))) {
    return {
      kind: 'heal',
      actorUid: findUid(b, side, m[1]),
      targetUid: findUid(b, side, m[3]),
      value: Number(m[4]),
      hp: entry.hp,
    };
  }
  if ((m = text.match(RE_BUFF))) {
    const uid = findUid(b, side, m[1]);
    return { kind: 'buff', actorUid: uid, targetUid: uid, value: 0, skillName: m[2], hp: entry.hp };
  }
  if ((m = text.match(RE_DOT))) {
    return {
      kind: 'dot',
      targetUid: findUid(b, side, m[1]),
      value: Number(m[3]),
      statusKind: m[2] === '灼烧' ? 'burn' : 'poison',
      hp: entry.hp,
    };
  }
  if ((m = text.match(RE_THORN))) {
    return { kind: 'thorn', targetUid: findUid(b, opposite, m[3]), value: Number(m[4]), hp: entry.hp };
  }
  return null;
}

const STEP_MS = 800;
const CLEAR_MS = 1300;
let popSeq = 0;

/**
 * 战斗动画：监听 battle.log 增量，把新日志按顺序播放为冲刺/受击/飘字，
 * 并在每个事件播放时同步推进血量显示（hpMap，动画结束后清空恢复真实血量）。
 * 新增的灼烧/中毒等状态标签在攻击动画触发时才显示（hiddenStatuses 先隐藏、事件播放时揭示）；
 * 回合结算中消失的状态（turns 用尽）延迟到其最后一次掉血动画播放时才移除（endingStatuses），
 * 与飘字、血量条下降同步。
 * 返回 fx（uid → 动画 class）、pops（飘字）、hpMap（当前应显示的血量）、
 * hiddenStatuses（uid → 尚未揭示的新增状态）、endingStatuses（uid → 尚未移除的到期状态）、
 * animating（结算动画播放中）。
 */
export function useBattleFx(battle: BattleState | null | undefined) {
  const [fx, setFx] = useState<Record<string, string>>({});
  const [pops, setPops] = useState<PopItem[]>([]);
  const [hpMap, setHpMap] = useState<Record<string, number> | null>(null);
  const [hiddenStatuses, setHiddenStatuses] = useState<Record<string, string[]>>({});
  const [endingStatuses, setEndingStatuses] = useState<Record<string, string[]>>({});
  const [animating, setAnimating] = useState(false);
  const prevLen = useRef(0);
  const prevBattle = useRef<BattleState | null | undefined>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (!battle) {
      // 战斗被清空（如返回首页）：立即停止动画并重置基线，避免残留 timer/animating
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
      prevBattle.current = null;
      prevLen.current = 0;
      setAnimating(false);
      setHpMap(null);
      setFx({});
      setPops([]);
      setHiddenStatuses({});
      setEndingStatuses({});
      return;
    }
    const prevBattleBefore = prevBattle.current;
    prevBattle.current = battle;
    // 首次遇到该战斗（含从存档/继续游戏恢复的中途战斗）：只初始化基线、不重播既有日志。
    // 否则会把整场战斗的日志全部当作新事件重播，动画长时间停在「战斗结算中」。
    if (prevBattleBefore === null) {
      prevLen.current = battle.log.length;
      setAnimating(false);
      return;
    }
    const newEntries = battle.log.slice(prevLen.current);
    prevLen.current = battle.log.length;
    if (newEntries.length === 0) return;

    const events: FxEvent[] = [];
    for (const e of newEntries) {
      const ev = parseEvent(battle, e);
      if (ev) events.push(ev);
    }
    const prevHp = prevBattleBefore ? hpOfUnits(prevBattleBefore) : hpOfUnits(battle);

    // 新增状态：结算后相比上一快照新出现的灼烧/中毒等，动画播放前先隐藏
    const newStatuses: Record<string, string[]> = {};
    if (prevBattleBefore) {
      const prevKinds = new Map<string, Set<string>>();
      for (const u of [...prevBattleBefore.playerUnits, ...prevBattleBefore.enemyUnits]) {
        prevKinds.set(u.uid, new Set(u.statuses.map((s) => s.kind)));
      }
      for (const u of [...battle.playerUnits, ...battle.enemyUnits]) {
        const pk = prevKinds.get(u.uid);
        if (!pk) continue;
        const added = u.statuses.filter((s) => !pk.has(s.kind)).map((s) => s.kind);
        if (added.length > 0) newStatuses[u.uid] = added;
      }
    }
    setHiddenStatuses(newStatuses);

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

    // 每个单位的新状态在攻击它的最后一个动画事件触发时揭示（连击时状态在所有段命中后才附加）
    const revealAt: Record<number, string[]> = {};
    for (const uid of Object.keys(newStatuses)) {
      let i = -1;
      for (let k = events.length - 1; k >= 0; k--) {
        if (events[k].targetUid === uid) {
          i = k;
          break;
        }
      }
      if (i >= 0) (revealAt[i] ??= []).push(uid);
    }

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

    // 无血量变化事件（如纯状态/换位）则不进入动画，状态立即显示
    if (events.length === 0) {
      setAnimating(false);
      setHpMap(null);
      setHiddenStatuses({});
      setEndingStatuses({});
      return;
    }

    // 动画开始：先显示结算前的血量，随后按事件逐个推进到对应快照
    setAnimating(true);
    setHpMap(prevHp);
    events.forEach((ev, i) => {
      const t = window.setTimeout(
        () => {
          const popId = ++popSeq;
          const actorUid = ev.actorUid;
          const targetUid = ev.targetUid;
          // 该事件的动画触发后揭示目标的新增状态标签
          if (revealAt[i]) {
            setHiddenStatuses((p) => {
              const next = { ...p };
              let changed = false;
              for (const uid of revealAt[i]) {
                if (next[uid]) {
                  delete next[uid];
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
          if (ev.kind === 'attack') {
            if (actorUid) setFx((p) => ({ ...p, [actorUid]: ev.actorIsPlayer ? 'fx-attack-up' : 'fx-attack-down' }));
            if (targetUid) {
              setFx((p) => ({ ...p, [targetUid]: 'fx-hit' }));
              setPops((p) => [...p, { id: popId, uid: targetUid, text: `-${ev.value}`, heal: false }]);
            }
          } else if (ev.kind === 'heal') {
            if (actorUid) setFx((p) => ({ ...p, [actorUid]: 'fx-cast' }));
            if (targetUid) {
              setFx((p) => ({ ...p, [targetUid]: 'fx-heal' }));
              setPops((p) => [...p, { id: popId, uid: targetUid, text: `+${ev.value}`, heal: true }]);
            }
          } else if (ev.kind === 'buff') {
            if (actorUid) setFx((p) => ({ ...p, [actorUid]: 'fx-cast' }));
            if (targetUid) {
              setFx((p) => ({ ...p, [targetUid]: 'fx-buff' }));
              setPops((p) => [...p, { id: popId, uid: targetUid, text: buffText(ev.skillName ?? ''), heal: false, buff: true }]);
            }
          } else if (targetUid) {
            setFx((p) => ({ ...p, [targetUid]: 'fx-hit' }));
            setPops((p) => [...p, { id: popId, uid: targetUid, text: `-${ev.value}`, heal: false }]);
          }
          if (ev.hp) setHpMap(ev.hp);

          const clear = window.setTimeout(
            () => {
              setFx((p) => {
                const next = { ...p };
                if (actorUid) delete next[actorUid];
                if (targetUid) delete next[targetUid];
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
        setHiddenStatuses({});
        setEndingStatuses({});
      },
      events.length * STEP_MS + CLEAR_MS,
    );
    timers.current.push(done);
  }, [battle?.log.length]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  return { fx, pops, hpMap, hiddenStatuses, endingStatuses, animating };
}
