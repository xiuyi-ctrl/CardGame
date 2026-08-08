import { useEffect, useRef, useState } from 'react';
import type { BattleState, LogEntry } from '../game/types';

/** 战斗动画事件（由日志文本解析而来，纯 UI 视觉，不影响战斗逻辑） */
interface FxEvent {
  kind: 'attack' | 'heal' | 'dot' | 'thorn';
  actorUid?: string;
  targetUid?: string;
  value: number;
  actorIsPlayer?: boolean;
  /** 该事件发生时的全体血量快照（uid → hp） */
  hp?: Record<string, number>;
}

/** 伤害/治疗飘字 */
export interface PopItem {
  id: number;
  uid: string;
  text: string;
  heal: boolean;
}

const RE_ATTACK = /^(.+?) 使用「(.+?)」攻击 (.+?)，造成 (\d+) 伤害$/;
const RE_HEAL = /^(.+?) 使用「(.+?)」，治愈 (.+?) (\d+) 点生命$/;
const RE_DOT = /^(.+?) 受到(灼烧|中毒) (\d+) 点伤害$/;
const RE_THORN = /^(.+?) 的「(.+?)」反伤 (.+?) (\d+) 点$/;

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
    return { kind: 'heal', targetUid: findUid(b, side, m[3]), value: Number(m[4]), hp: entry.hp };
  }
  if ((m = text.match(RE_DOT))) {
    return { kind: 'dot', targetUid: findUid(b, side, m[1]), value: Number(m[3]), hp: entry.hp };
  }
  if ((m = text.match(RE_THORN))) {
    return { kind: 'thorn', targetUid: findUid(b, opposite, m[3]), value: Number(m[4]), hp: entry.hp };
  }
  return null;
}

const STEP_MS = 560;
const CLEAR_MS = 880;
let popSeq = 0;

/**
 * 战斗动画：监听 battle.log 增量，把新日志按顺序播放为冲刺/受击/飘字，
 * 并在每个事件播放时同步推进血量显示（hpMap，动画结束后清空恢复真实血量）。
 * 返回 fx（uid → 动画 class）、pops（飘字）、hpMap（当前应显示的血量）、animating（结算动画播放中）。
 */
export function useBattleFx(battle: BattleState | null | undefined) {
  const [fx, setFx] = useState<Record<string, string>>({});
  const [pops, setPops] = useState<PopItem[]>([]);
  const [hpMap, setHpMap] = useState<Record<string, number> | null>(null);
  const [animating, setAnimating] = useState(false);
  const prevLen = useRef(0);
  const prevBattle = useRef<BattleState | null | undefined>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (!battle) return;
    const prevBattleBefore = prevBattle.current;
    prevBattle.current = battle;
    const newEntries = battle.log.slice(prevLen.current);
    prevLen.current = battle.log.length;
    if (newEntries.length === 0) return;

    const events: FxEvent[] = [];
    for (const e of newEntries) {
      const ev = parseEvent(battle, e);
      if (ev) events.push(ev);
    }
    const prevHp = prevBattleBefore ? hpOfUnits(prevBattleBefore) : hpOfUnits(battle);

    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setFx({});
    setPops([]);

    // 无血量变化事件（如纯状态/换位）则不进入动画
    if (events.length === 0) {
      setAnimating(false);
      setHpMap(null);
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
          if (ev.kind === 'attack') {
            if (actorUid) setFx((p) => ({ ...p, [actorUid]: ev.actorIsPlayer ? 'fx-attack-up' : 'fx-attack-down' }));
            if (targetUid) {
              setFx((p) => ({ ...p, [targetUid]: 'fx-hit' }));
              setPops((p) => [...p, { id: popId, uid: targetUid, text: `-${ev.value}`, heal: false }]);
            }
          } else if (ev.kind === 'heal') {
            if (targetUid) {
              setFx((p) => ({ ...p, [targetUid]: 'fx-heal' }));
              setPops((p) => [...p, { id: popId, uid: targetUid, text: `+${ev.value}`, heal: true }]);
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
      },
      events.length * STEP_MS + CLEAR_MS,
    );
    timers.current.push(done);
  }, [battle?.log.length]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  return { fx, pops, hpMap, animating };
}
