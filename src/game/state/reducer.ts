import type { GameState } from './game';
import { FIELD_MAX, generateMap, generateRewards, gainExp, ROSTER_MAX, settleEvolutions } from './game';
import { createBattle, makeUnit, playerSkill, playerTame } from '../core/battle';
import type { BattleState, Unit } from '../types';
import { getFood } from '../data/foods';
import { createRng } from '../rng';

export type GameAction =
  | { type: 'START_RUN'; starterId: string; seed: number }
  | { type: 'STARTER' }
  | { type: 'LOAD_GAME'; state: GameState }
  | { type: 'MOVE'; nodeId: string }
  | { type: 'EVENT_CHOICE'; choiceId: string }
  | { type: 'PLAYER_SKILL'; skillId: string; targetUid?: string }
  | { type: 'PLAYER_TAME'; foodId: string; enemyUid: string }
  | { type: 'BATTLE_END_CONFIRM' }
  | { type: 'PICK_REWARD'; rewardId: string }
  | { type: 'SET_FIELD'; uids: string[] }
  | { type: 'DISCARD'; uid: string }
  | { type: 'SHOP_BUY'; foodId: string }
  | { type: 'REST_HEAL' }
  | { type: 'NEXT_NODE' }
  | { type: 'RETRY'; seed: number }
  | { type: 'TITLE' };

export function createInitialState(): GameState {
  return {
    screen: 'title',
    seed: 0,
    act: 1,
    map: generateMap(0, 1),
    currentRow: 0,
    currentNodeId: '',
    roster: [],
    field: [],
    inventory: { berry: 3, meat: 1 },
    gold: 12,
    rewards: [],
    log: [],
  };
}

/** 校验读取的存档是否为合法 GameState */
export function isValidGameState(s: unknown): s is GameState {
  if (typeof s !== 'object' || s === null) return false;
  const o = s as Record<string, unknown>;
  const screens = ['title', 'starter', 'map', 'battle', 'reward', 'roster', 'shop', 'rest', 'event', 'gameover', 'victory'];
  return (
    typeof o.seed === 'number' &&
    typeof o.act === 'number' &&
    typeof o.currentRow === 'number' &&
    typeof o.currentNodeId === 'string' &&
    Array.isArray(o.roster) &&
    Array.isArray(o.field) &&
    typeof o.inventory === 'object' &&
    o.inventory !== null &&
    typeof o.gold === 'number' &&
    Array.isArray(o.rewards) &&
    Array.isArray(o.log) &&
    typeof o.map === 'object' &&
    o.map !== null &&
    typeof o.screen === 'string' &&
    screens.includes(o.screen)
  );
}

export function newSeed(): number {
  return Math.floor(Math.random() * 1000000000);
}

function freshRun(starterId: string, seed: number): GameState {
  const starter = makeUnit(starterId, 1, true, 0, false);
  // 开局赠送一只同伴，避免单宠打不过第 1 战
  const rng = createRng(seed);
  const pool = ['momo', 'lulu', 'fifi', 'kiki', 'mimi', 'pipi'].filter((id) => id !== starterId);
  const companionId = pool[Math.floor(rng() * pool.length)];
  const companion = makeUnit(companionId, 1, true, 1, false);
  return {
    screen: 'map',
    seed,
    act: 1,
    map: generateMap(seed, 1),
    currentRow: 0,
    currentNodeId: '',
    roster: [starter, companion],
    field: [starter.uid, companion.uid],
    inventory: { berry: 3, meat: 1 },
    gold: 12,
    rewards: [],
    log: [],
  };
}

function healRoster(state: GameState, pct: number): GameState {
  return {
    ...state,
    roster: state.roster.map((u) => ({ ...u, hp: Math.min(u.maxHp, u.hp + Math.round(u.maxHp * pct)) })),
  };
}

/** 战斗胜利后：同步存活单位、发放经验、确认驯服、结算进化、结算金币与奖励 */
export function resolveBattle(state: GameState, battle: BattleState): GameState {
  const bossNode = state.map.boss[state.currentNodeId] !== undefined;
  const eliteNode = state.map.encounter[state.currentNodeId] !== undefined;

  const synced: (Unit | null)[] = state.roster.map((r) => {
    const b = battle.playerUnits.find((u) => u.uid === r.uid);
    if (!b || b.hp <= 0) return null;
    return {
      ...r,
      level: b.level,
      maxHp: b.maxHp,
      hp: b.hp,
      atk: b.atk,
      spd: b.spd,
      def: b.def,
      exp: b.exp,
      expToLevel: b.expToLevel,
      skills: b.skills,
      statuses: [],
    };
  });
  let roster: Unit[] = synced.filter((u): u is Unit => u !== null);

  const totalExp = battle.enemyUnits.reduce((s, u) => s + u.expValue, 0);
  const survivors = roster.filter((u) => state.field.includes(u.uid));
  if (survivors.length > 0) {
    const per = Math.max(1, Math.round(totalExp / survivors.length));
    const gained = new Map(survivors.map((u) => [u.uid, gainExp(u, per)]));
    roster = roster.map((u) => gained.get(u.uid) ?? u);
  }

  for (const t of battle.pendingTame) {
    if (roster.length < ROSTER_MAX) roster.push(t);
  }

  const goldGain = bossNode ? 30 : eliteNode ? 16 : 8;
  // 本场战斗结束：达到进化等级的宠物立即自动进化
  const settled = settleEvolutions({
    ...state,
    screen: 'reward',
    roster,
    field: state.field.filter((uid) => roster.some((r) => r.uid === uid)),
    gold: state.gold + goldGain,
    battle: undefined,
    log: [
      `战斗胜利！获得 ${goldGain} 金币`,
      ...(battle.pendingTame.length > 0 ? [`驯服了 ${battle.pendingTame.length} 只宠物`] : []),
      ...(roster.length < state.roster.length ? [`战斗中有宠物阵亡，永远失去了它`] : []),
      ...state.log,
    ].slice(0, 20),
  });
  // 战后全体恢复 50%，缓解减员滚雪球
  const healed = settled.roster.map((u) => ({ ...u, hp: Math.min(u.maxHp, u.hp + Math.round(u.maxHp * 0.5)) }));
  const rewards = generateRewards({ ...settled, roster: healed });
  return { ...settled, roster: healed, rewards };
}

function bossCleared(state: GameState): boolean {
  return state.map.boss[state.currentNodeId] !== undefined;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_RUN':
      return freshRun(action.starterId, action.seed);

    case 'STARTER':
      return { ...createInitialState(), screen: 'starter' };

    case 'LOAD_GAME':
      if (!isValidGameState(action.state)) return { ...createInitialState(), screen: 'title' };
      return {
        ...action.state,
        map: { ...action.state.map, events: action.state.map.events ?? {} },
      };

    case 'MOVE': {
      const isFirst = state.currentNodeId === '';
      const targetRow = isFirst ? state.currentRow : state.currentRow + 1;
      const rowNodes = state.map.layers[targetRow];
      const node = rowNodes?.find((n) => n.id === action.nodeId);
      if (!node) return state;
      // 相邻校验：只能移动到当前节点列号 col±1（出发节点可直达第一层任意节点；旧存档无 col 时放行）
      if (!isFirst) {
        const cur = state.map.layers[state.currentRow]?.find((n) => n.id === state.currentNodeId);
        const curCol = cur?.col;
        const atStart = state.currentRow === 0;
        if (
          !atStart &&
          typeof curCol === 'number' &&
          typeof node.col === 'number' &&
          Math.abs(node.col - curCol) > 1
        ) {
          return state;
        }
      }
      const base: GameState = { ...state, currentRow: targetRow, currentNodeId: action.nodeId };
      if (node.type === 'rest') return { ...base, screen: 'rest' };
      if (node.type === 'shop') return { ...base, screen: 'shop' };
      if (node.type === 'event') return { ...base, screen: 'event' };
      if (node.type === 'boss') {
        const encounter = state.map.boss[node.id];
        const battle = createBattle(
          state.roster.filter((u) => state.field.includes(u.uid)),
          encounter,
          state.seed + targetRow * 17,
        );
        return { ...base, screen: 'battle', battle };
      }
      const encounter = state.map.encounter[node.id];
      if (!encounter) return { ...base, screen: 'map' };
      const battle = createBattle(
        state.roster.filter((u) => state.field.includes(u.uid)),
        encounter,
        state.seed + targetRow * 17,
      );
      return { ...base, screen: 'battle', battle };
    }

    case 'EVENT_CHOICE': {
      if (state.screen !== 'event') return state;
      const ev = state.map.events[state.currentNodeId];
      if (!ev) return state;
      const choice = ev.choices.find((x) => x.id === action.choiceId);
      if (!choice) return state;
      // 花费类选项若金币不足则视为无效选择
      if (state.gold + (choice.goldDelta ?? 0) < 0) return state;
      let next: GameState = { ...state, screen: 'roster', gold: state.gold + (choice.goldDelta ?? 0) };
      if (choice.kind === 'heal') {
        next = healRoster(next, (choice.amount ?? 0) / 100);
      } else if (choice.kind === 'gold') {
        next = { ...next, gold: next.gold + (choice.amount ?? 0) };
      } else if (choice.kind === 'food' && choice.foodId) {
        next = { ...next, inventory: { ...next.inventory, [choice.foodId]: (next.inventory[choice.foodId] ?? 0) + 1 } };
      } else if (choice.kind === 'recruit' && choice.monsterId && next.roster.length < ROSTER_MAX) {
        next = { ...next, roster: [...next.roster, makeUnit(choice.monsterId, 1 + (next.act - 1), true, 0, false)] };
      } else if (choice.kind === 'damage') {
        next = {
          ...next,
          roster: next.roster.map((u) => ({ ...u, hp: Math.max(1, u.hp - Math.round(u.maxHp * (choice.amount ?? 0) / 100)) })),
        };
      } else if (choice.kind === 'exp') {
        next = { ...next, roster: next.roster.map((u) => gainExp(u, choice.amount ?? 0)) };
      }
      return { ...next, log: [choice.label, ...next.log].slice(0, 20) };
    }

    case 'PLAYER_SKILL': {
      if (!state.battle || state.battle.phase !== 'acting') return state;
      const battle = playerSkill(state.battle, action.skillId, action.targetUid);
      return { ...state, battle };
    }

    case 'PLAYER_TAME': {
      if (!state.battle || state.battle.phase !== 'acting') return state;
      const inv = state.inventory[action.foodId] ?? 0;
      if (inv <= 0) return state;
      const battle = playerTame(state.battle, action.foodId, action.enemyUid);
      if (battle.rngCount !== state.battle.rngCount) {
        const inventory = { ...state.inventory, [action.foodId]: inv - 1 };
        return { ...state, battle, inventory };
      }
      return { ...state, battle };
    }

    case 'BATTLE_END_CONFIRM': {
      if (!state.battle) return state;
      if (state.battle.phase === 'won') return resolveBattle(state, state.battle);
      if (state.battle.phase === 'lost') {
        return settleEvolutions({ ...state, screen: 'gameover', battle: undefined });
      }
      return state;
    }

    case 'PICK_REWARD': {
      const reward = state.rewards.find((r) => r.id === action.rewardId);
      if (!reward) return state;
      let next: GameState = { ...state, screen: 'roster', rewards: [] };
      if (reward.kind === 'food' && reward.foodId) {
        next = { ...next, inventory: { ...next.inventory, [reward.foodId]: (next.inventory[reward.foodId] ?? 0) + 1 } };
      } else if (reward.kind === 'heal') {
        next = healRoster(next, (reward.amount ?? 30) / 100);
      } else if (reward.kind === 'recruit' && reward.monsterId) {
        if (next.roster.length < ROSTER_MAX) {
          const level = 1 + (next.act - 1);
          const u = makeUnit(reward.monsterId, level, true, 0, false);
          next = { ...next, roster: [...next.roster, u] };
        }
      } else if (reward.kind === 'gold') {
        next = { ...next, gold: next.gold + (reward.amount ?? 0) };
      }
      return next;
    }

    case 'SET_FIELD': {
      const uids = action.uids.filter((uid) => state.roster.some((u) => u.uid === uid)).slice(0, FIELD_MAX);
      return { ...state, field: uids };
    }

    case 'DISCARD': {
      return {
        ...state,
        roster: state.roster.filter((u) => u.uid !== action.uid),
        field: state.field.filter((uid) => uid !== action.uid),
      };
    }

    case 'SHOP_BUY': {
      const food = getFood(action.foodId);
      if (state.gold < food.price) return state;
      return {
        ...state,
        gold: state.gold - food.price,
        inventory: { ...state.inventory, [food.id]: (state.inventory[food.id] ?? 0) + 1 },
      };
    }

    case 'REST_HEAL': {
      return { ...healRoster(state, 1), screen: 'roster' };
    }

    case 'NEXT_NODE': {
      if (bossCleared(state)) {
        if (state.act >= 3) return settleEvolutions({ ...state, screen: 'victory' });
        const act = state.act + 1;
        return {
          ...state,
          act,
          map: generateMap(state.seed, act),
          currentRow: 0,
          currentNodeId: '',
          screen: 'map',
        };
      }
      const nextRow = state.currentRow + 1;
      if (nextRow < state.map.layers.length) {
        return { ...state, screen: 'map' };
      }
      return settleEvolutions({ ...state, screen: 'victory' });
    }

    case 'RETRY':
      return freshRun('momo', action.seed);

    case 'TITLE':
      return { ...createInitialState(), screen: 'title' };

    default:
      return state;
  }
}

export function checkBossNode(state: GameState): boolean {
  return state.map.boss[state.currentNodeId] !== undefined;
}
