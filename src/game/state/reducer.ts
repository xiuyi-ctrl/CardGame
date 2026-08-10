import type { GameState, MapNode, RewardChoice, RunMap } from './game';
import { applyCorruptFoodReward, buildEvent, buildPunishmentEvent, buildSpecial, canStepTo, currentNode, CUSTOM_PRESETS, FIELD_MAX, fuseUnit, fusionNeedCount, generateChallengeRewards, generateMap, generateRewards, labelOf, makeCustomUnit, nextStage, nodeInfo, ROSTER_MAX, recomputeStats } from './game';
import { useBattleItem, playerCancelOrder, playerEndTurn, playerRest, playerSwap } from '../core/battle';
import { createBattle, makeUnit, playerSkill, playerTame } from '../core/battle';
import type { BattleOptions } from '../core/battle';
import type { BattleState, Unit } from '../types';
import { getFood, FOODS } from '../data/foods';
import { getItem, ITEMS } from '../data/items';
import { getMonster } from '../data/monsters';
import { createRng, shuffle } from '../rng';

function getFoodSafe(id: string): boolean {
  return FOODS[id] !== undefined;
}

/** 钥匙门节点：是否已持有对应守卫的专用钥匙 */
function hasKeyFor(state: GameState, node: MapNode): boolean {
  if (!node.guardianId) return false;
  return (state.inventory[`key_${node.guardianId}`] ?? 0) > 0;
}

/** 自定义测试：需要选择宠物的战斗类关卡（非战斗类直接进入对应内容） */
const TEST_BATTLE_TYPES: MapNode['type'][] = ['battle', 'elite', 'boss', 'corrupted', 'guardian', 'arena', 'gauntlet'];

/** 字符串简单哈希（用于按节点 id 派生可复现随机） */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export type GameAction =
  | { type: 'START_RUN'; starterId: string; seed: number }
  | { type: 'STARTER' }
  | { type: 'LOAD_GAME'; state: GameState }
  | { type: 'MOVE'; nodeId: string }
  | { type: 'EVENT_CHOICE'; choiceId: string }
  | { type: 'SPECIAL_CHOICE'; rewardId: string }
  | { type: 'EVOLVE_ONE'; uid: string }
  | { type: 'SPECIAL_TARGET'; uid: string }
  | { type: 'BOOST_STAT'; stat: 'hp' | 'spd' }
  | { type: 'FUSE'; primaryUid: string }
  | { type: 'PICK_CUSTOM'; presetId: string }
  | { type: 'USE_PURIFY'; uid: string }
  | { type: 'USE_SKIP'; nodeId: string }
  | { type: 'USE_BATTLE_ITEM'; itemId: string; targetUid: string }
  | { type: 'USE_SCOUT'; nodeId: string }
  | { type: 'OPEN_SCOUT' }
  | { type: 'CANCEL_SCOUT' }
  | { type: 'OPEN_SKIP' }
  | { type: 'CANCEL_SKIP' }
  | { type: 'OPEN_BACKPACK' }
  | { type: 'CLOSE_BACKPACK' }
  | { type: 'TAME_OVERFLOW_REPLACE'; tameUid: string; discardUid: string }
  | { type: 'TAME_OVERFLOW_FUSE'; tameUid: string; primaryUid: string }
  | { type: 'TAME_OVERFLOW_DISCARD'; tameUid: string }
  | { type: 'PLAYER_SKILL'; actorUid: string; skillId: string; targetUid?: string }
  | { type: 'PLAYER_REST'; actorUid: string }
  | { type: 'PLAYER_CANCEL_ORDER'; actorUid: string }
  | { type: 'PLAYER_SWAP'; actorUid: string; otherUid: string }
  | { type: 'END_TURN' }
  | { type: 'FORMATION_CONFIRM'; units: Unit[] }
  | { type: 'GAUNTLET_ORDER_CONFIRM'; units: Unit[] }
  | { type: 'PLAYER_TAME'; foodId: string; enemyUid: string }
  | { type: 'BATTLE_END_CONFIRM' }
  | { type: 'PICK_REWARD'; rewardId: string }
  | { type: 'SET_FIELD'; uids: string[] }
  | { type: 'DISCARD'; uid: string }
  | { type: 'SHOP_BUY'; foodId: string }
  | { type: 'SHOP_REST' }
  | { type: 'REST_HEAL' }
  | { type: 'NEXT_NODE' }
  | { type: 'OPEN_WATCHTOWER'; nodeId?: string }
  | { type: 'CLOSE_WATCHTOWER' }
  | { type: 'DEBUG_JUMP'; act: number; row: number; nodeType: string; seed: number }
  | { type: 'DEBUG_CUSTOM_TEST' }
  | { type: 'TEST_TYPE_PICK'; nodeType: MapNode['type']; corruptDebuff?: 'spd' | 'dmg'; corruptReward?: 'gold' | 'food' }
  | { type: 'TEST_PICK_PLAYER_CONFIRM'; units: Unit[] }
  | { type: 'TEST_PICK_ENEMY_CONFIRM'; units: Unit[] }
  | { type: 'TEST_ITEMS_CONFIRM'; inventory: Record<string, number>; gold: number; seed: number }
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
    visitedWatchtowers: [],
    visitedNodeIds: [],
  };
}

/** 校验读取的存档是否为合法 GameState */
export function isValidGameState(s: unknown): s is GameState {
  if (typeof s !== 'object' || s === null) return false;
  const o = s as Record<string, unknown>;
  const screens = ['title', 'starter', 'map', 'formation', 'gauntlet-order', 'battle', 'reward', 'roster', 'shop', 'rest', 'event', 'special', 'custom', 'boost', 'gameover', 'victory', 'watchtower', 'chest', 'backpack', 'tame-overflow', 'test-type', 'test-pick', 'test-config'];
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
  const starter = makeUnit(starterId, true, 0, false);
  // 开局赠送一只同伴，避免单宠打不过第 1 战
  const rng = createRng(seed);
  const pool = ['momo', 'lulu', 'fifi', 'kiki', 'mimi', 'pipi'].filter((id) => id !== starterId);
  const companionId = pool[Math.floor(rng() * pool.length)];
  const companion = makeUnit(companionId, true, 1, false);
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
    visitedWatchtowers: [],
    visitedNodeIds: [],
  };
}

function healRoster(state: GameState, pct: number): GameState {
  return {
    ...state,
    roster: state.roster.map((u) => ({ ...u, hp: Math.min(u.maxHp, u.hp + Math.round(u.maxHp * pct)) })),
  };
}

/** 战斗胜利后：同步存活单位、确认驯服、发放金币与奖励 */
export function resolveBattle(state: GameState, battle: BattleState): GameState {
  const node = currentNode(state);
  const challenge = node?.type === 'arena' || node?.type === 'gauntlet';
  const bossNode = state.map.boss[state.currentNodeId] !== undefined;
  const eliteNode = state.map.encounter[state.currentNodeId] !== undefined;
  const corruptNode = node?.type === 'corrupted';

  const synced: (Unit | null)[] = state.roster.map((r) => {
    const b = [...battle.playerUnits, ...(battle.playerDown ?? [])].find((u) => u.uid === r.uid);
    if (!b) return r; // 后备宠物未参与本场战斗：原样保留
    if (b.hp <= 0) {
      // 斗兽场/车轮战：阵亡单位不会永久死亡（保留并保底 1 血）；普通战斗阵亡永久移除
      if (challenge) return { ...r, statuses: [], hp: 1 };
      return null;
    }
    return {
      ...r,
      maxHp: b.maxHp,
      hp: b.hp,
      spd: b.spd,
      skills: b.skills,
      statuses: [],
    };
  });
  let roster: Unit[] = challenge
    ? synced.filter((u): u is Unit => u !== null).map((u) => ({ ...u, hp: Math.max(1, u.hp) }))
    : synced.filter((u): u is Unit => u !== null);

  // 驯服入库：先填满空位，超出的进入溢出队列（等待玩家处理：替换/融合/放弃）
  let overflow: Unit[] = [];
  for (const t of battle.pendingTame) {
    if (roster.length < ROSTER_MAX) roster.push(t);
    else overflow.push(t);
  }

  const goldGain = challenge
    ? 0
    : bossNode
      ? 30
      : eliteNode
        ? corruptNode && node?.corruptReward === 'gold'
          ? 32
          : 16
        : node?.type === 'guardian'
          ? 16
          : 8;
  // 守卫：击败后发放对应的专用钥匙（守卫不可驯服）
  let inventory = state.inventory;
  const keyLog: string[] = [];
  if (node?.type === 'guardian') {
    const keyId = `key_${node.id}`;
    inventory = { ...inventory, [keyId]: (inventory[keyId] ?? 0) + 1 };
    keyLog.push('击败守卫，获得一把专用钥匙');
  }
  // 本场战斗结束：进入奖励结算
  const settled: GameState = {
    ...state,
    screen: overflow.length > 0 ? 'tame-overflow' : 'reward',
    roster,
    field: state.field.filter((uid) => roster.some((r) => r.uid === uid)),
    gold: state.gold + goldGain,
    inventory,
    battle: undefined,
    tameOverflow: overflow.length > 0 ? overflow : undefined,
    log: [
      `战斗胜利！${goldGain > 0 ? `获得 ${goldGain} 金币` : '赢得挑战奖励'}`,
      ...keyLog,
      ...(corruptNode ? ['被侵蚀区域：奖励已翻倍'] : []),
      ...(battle.pendingTame.length > 0 ? [`驯服了 ${battle.pendingTame.length} 只宠物`] : []),
      ...(overflow.length > 0 ? [`队伍已满（${ROSTER_MAX} 只），需要处理 ${overflow.length} 只驯服的宠物`] : []),
      ...(roster.length < state.roster.length ? [`战斗中有宠物阵亡，永远失去了它`] : []),
      ...state.log,
    ].slice(0, 20),
  };
  // 战后全体恢复 50%，缓解减员滚雪球
  const healed = settled.roster.map((u) => ({ ...u, hp: Math.min(u.maxHp, u.hp + Math.round(u.maxHp * 0.5)) }));
  let rewards = challenge
    ? generateChallengeRewards({ ...settled, roster: healed }, node!.type as 'arena' | 'gauntlet')
    : generateRewards({ ...settled, roster: healed });
  if (corruptNode && node?.corruptReward === 'food') {
    rewards = applyCorruptFoodReward(rewards, state.seed * 11 + state.currentRow * 7);
  }
  const result: GameState = { ...settled, roster: healed, rewards };
  // 最后一幕（act 3）首领战胜利：直接进入通关界面，不再弹出战利品/队伍管理等中间界面
  if (bossNode && state.act >= 3) return { ...result, screen: 'victory' };
  return result;
}

/** 开启宝箱：普通双生宝箱 3 选 1（金币/食物/全体回血 30%），钥匙门为高级宝箱（金币+食物+40% 概率道具，其中净化药水固定 20% 概率单独判定）。结果文本进 chestResult */
function openChest(base: GameState, node: MapNode, keydoor: boolean): { next: GameState; text: string } {
  const rng = createRng(base.seed * 7919 + base.currentRow * 104729 + hashStr(node.id));
  let next = base;
  let text: string;
  const foodPool = Object.keys(FOODS).filter((id) => FOODS[id].shop !== false);
  if (keydoor) {
    const amt = 25 + Math.floor(rng() * 16);
    const foodId = foodPool[Math.floor(rng() * foodPool.length)];
    const food = getFood(foodId);
    let extras: string[] = [];
    // 钥匙门额外奖励：净化药水固定 20% 概率；其余道具（侦察符/双生符/跳关）共 20% 概率，均分
    if (rng() < 0.2) {
      // 净化药水
      next = { ...next, inventory: { ...next.inventory, purify: (next.inventory.purify ?? 0) + 1 } };
      extras.push(`额外获得「${getItem('purify').name}」`);
    } else if (rng() < 0.25) { // 剩余 80% * 25% = 20% 给其他道具
      const pool = ['scout', 'twin', 'skip'];
      const extraId = pool[Math.floor(rng() * pool.length)];
      const it = getItem(extraId);
      next = { ...next, inventory: { ...next.inventory, [extraId]: (next.inventory[extraId] ?? 0) + 1 } };
      extras.push(`额外获得「${it.name}」`);
    }
    // 圣果单独 10% 概率（原逻辑保留）
    if (rng() < 0.1) {
      next = { ...next, inventory: { ...next.inventory, golden_fruit: (next.inventory.golden_fruit ?? 0) + 1 } };
      extras.push(`额外获得「${getFood('golden_fruit').name}」`);
    }
    next = { ...next, gold: next.gold + amt, inventory: { ...next.inventory, [foodId]: (next.inventory[foodId] ?? 0) + 1 } };
    text = `开启「${labelOf(node.type, base.currentRow)}」：获得 ${amt} 金币、1 个${food.name}${extras.length ? '、' + extras.join('、') : ''}`;
  } else {
    const roll = rng();
    if (roll < 0.4) {
      const amt = 12 + Math.floor(rng() * 9);
      next = { ...next, gold: next.gold + amt };
      text = `开启「${labelOf(node.type, base.currentRow)}」：获得 ${amt} 金币`;
    } else if (roll < 0.7) {
      const foodId = foodPool[Math.floor(rng() * foodPool.length)];
      const food = getFood(foodId);
      next = { ...next, inventory: { ...next.inventory, [foodId]: (next.inventory[foodId] ?? 0) + 1 } };
      text = `开启「${labelOf(node.type, base.currentRow)}」：获得 1 个${food.name}`;
    } else {
      const healed = next.roster.map((u) => ({ ...u, hp: Math.min(u.maxHp, u.hp + Math.round(u.maxHp * 0.3)) }));
      next = { ...next, roster: healed };
      text = `开启「${labelOf(node.type, base.currentRow)}」：全体宠物恢复 30% 生命`;
    }
  }
  return { next, text };
}

/** 进入一个地图节点：根据节点类型进入对应界面（MOVE 与 DEBUG_JUMP 共用） */
function fieldUnits(state: GameState): Unit[] {
  const uids = state.field.length > 0 ? state.field : state.roster.slice(0, FIELD_MAX).map((u) => u.uid);
  return state.roster.filter((u) => uids.includes(u.uid)).slice(0, FIELD_MAX);
}

/** 默认自动布阵：前 3 只站前排 0-2 列，第 4 只起站后排 */
function autoPosition(units: Unit[]): Unit[] {
  return units.map((u, i) =>
    i < 3 ? { ...u, row: 'front' as const, column: i as 0 | 1 | 2 } : { ...u, row: 'back' as const, column: (i - 3) as 0 | 1 | 2 },
  );
}

function enterNode(base: GameState, node: MapNode): GameState {
  if (node.type === 'rest') return { ...base, screen: 'rest' };
  if (node.type === 'shop') {
    const rng = createRng(base.seed * 7919 + base.currentRow * 104729 + hashStr(node.id));
    const pool = [...Object.keys(FOODS).filter((id) => FOODS[id].shop !== false), ...Object.keys(ITEMS).filter((id) => ITEMS[id].price > 0)];
    const stock = shuffle(rng, pool).slice(0, 4);
    return { ...base, screen: 'shop', shopBought: false, shopBoughtItems: [], shopStock: stock };
  }
  if (node.type === 'event') return { ...base, screen: 'event' };
  if (node.type === 'special') return { ...base, screen: 'special' };
  if (node.type === 'watchtower') {
    const visited = base.visitedWatchtowers ?? [];
    if (!visited.includes(node.id)) {
      return { ...base, screen: 'map', visitedWatchtowers: [...visited, node.id] };
    }
    return { ...base, screen: 'map' };
  }
  if (node.type === 'boss') {
    const encounter = base.map.boss[node.id];
    if (!encounter || base.roster.length === 0) return { ...base, screen: 'map' };
    const initial = autoPosition(fieldUnits(base));
    return { ...base, screen: 'formation', formation: { units: base.roster, initialField: initial, encounter, nodeId: node.id } };
  }
  // 同步双节点（双生宝箱）：抵达开箱；持有双生符（加速道具）时消耗 1 个、同时开启两个宝箱（侦察符只用于查看情报，不双开）
  if (node.type === 'sync') {
    const paired = node.pairedId ? base.map.layers[base.currentRow]?.find((n) => n.id === node.pairedId) : undefined;
    const hasTwin = (base.inventory.twin ?? 0) > 0;
    const double = hasTwin;
    let inventory = base.inventory;
    if (hasTwin) inventory = { ...inventory, twin: inventory.twin! - 1 };
    let next: GameState = { ...base, inventory };
    const opened: string[] = [];
    if (double && paired) {
      const r1 = openChest(next, node, false);
      next = r1.next;
      opened.push(r1.text);
      const r2 = openChest({ ...next, currentNodeId: paired.id }, paired, false);
      next = r2.next;
      opened.push(r2.text);
    } else {
      const r1 = openChest(next, node, false);
      next = r1.next;
      opened.push(r1.text);
    }
    const disabled = { ...(next.map.disabled ?? {}), [node.id]: true };
    if (paired) disabled[paired.id] = true;
    return { ...next, map: { ...next.map, disabled }, screen: 'chest', chestResult: opened, currentNodeId: node.id };
  }
  // 守卫：强力怪物战（不可驯服），击败获得专用钥匙；先布阵
  if (node.type === 'guardian') {
    const encounter = base.map.encounter[node.id];
    if (!encounter) return { ...base, screen: 'map' };
    if (base.roster.length === 0) return { ...base, screen: 'map' };
    const initial = autoPosition(fieldUnits(base));
    return { ...base, screen: 'formation', formation: { units: base.roster, initialField: initial, encounter, nodeId: node.id, options: { untameable: true } } };
  }
  // 钥匙门：无对应钥匙不可进入；进入时消耗钥匙并开启高级宝箱
  if (node.type === 'keydoor') {
    if (!node.guardianId || !hasKeyFor(base, node)) return { ...base, screen: 'map' };
    const keyId = `key_${node.guardianId}`;
    const inventory = { ...base.inventory, [keyId]: base.inventory[keyId] - 1 };
    const r = openChest({ ...base, inventory }, node, true);
    const disabled = { ...(r.next.map.disabled ?? {}), [node.id]: true };
    return { ...r.next, map: { ...r.next.map, disabled }, screen: 'chest', chestResult: [r.text] };
  }
  const encounter = base.map.encounter[node.id];
  if (!encounter) return { ...base, screen: 'map' };
  // 斗兽场：1v1 单挑，先让玩家选择出战宠物
  if (node.type === 'arena') {
    if (base.roster.length === 0) return { ...base, screen: 'map' };
    return { ...base, screen: 'roster', specialPending: { kind: 'arena', uid: '' } };
  }
  // 车轮战：一次上一只，先让玩家选择出战顺序（n v n，只选 n 只）
  if (node.type === 'gauntlet') {
    const units = fieldUnits(base);
    if (units.length === 0) return { ...base, screen: 'map' };
    return { ...base, screen: 'gauntlet-order', gauntletOrder: units, gauntletSize: encounter.length };
  }
  // 普通/精英/被侵蚀：先布阵选择站位（棋盘默认放自动出战宠物，列表为全部宠物池）
  const options = node.type === 'corrupted' ? { corruptDebuff: node.corruptDebuff } : undefined;
  if (base.roster.length === 0) return { ...base, screen: 'map' };
  const initial = autoPosition(fieldUnits(base));
  return { ...base, screen: 'formation', formation: { units: base.roster, initialField: initial, encounter, nodeId: node.id, options } };
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
        map: { ...action.state.map, events: action.state.map.events ?? {}, specials: action.state.map.specials ?? {} },
      };

    case 'MOVE': {
      const isFirst = state.currentNodeId === '';
      const targetRow = isFirst ? state.currentRow : state.currentRow + 1;
      const rowNodes = state.map.layers[targetRow];
      const node = rowNodes?.find((n) => n.id === action.nodeId);
      if (!node) return state;
      // 相邻校验：出发层可直达下一层任意节点；此后只能移动到当前节点列号 col±1（旧存档无 col 时放行）
      if (!isFirst) {
        const cur = state.map.layers[state.currentRow]?.find((n) => n.id === state.currentNodeId);
        if (!canStepTo(state.currentRow, cur?.col, node, state.map)) return state;
      }
      // 钥匙门：未持有对应钥匙不可进入
      if (node.type === 'keydoor' && !hasKeyFor(state, node)) return state;
      const visitedNodeIds = [...(state.visitedNodeIds ?? [])];
      if (!visitedNodeIds.includes(action.nodeId)) visitedNodeIds.push(action.nodeId);
      const base: GameState = { ...state, currentRow: targetRow, currentNodeId: action.nodeId, shopBought: false, visitedNodeIds };
      return enterNode(base, node);
    }

    case 'DEBUG_JUMP': {
      const act = Math.max(1, Math.min(3, action.act));
      const seed = action.seed > 0 ? action.seed : 1;
      const map = generateMap(seed, act);
      const row = Math.max(0, Math.min(action.row, map.layers.length - 1));
      let node: MapNode | undefined;
      if (action.nodeType && action.nodeType !== 'all') {
        node = map.layers[row].find((n) => n.type === action.nodeType);
      }
      if (!node) node = map.layers[row][0];
      // 调试专用强队 + 物资，保证能顺利体验各关卡机制
      const debugRoster = [
        makeUnit('momo_queen', true, 0, false),
        makeUnit('lulu_king', true, 1, false),
        makeUnit('fifi_king', true, 2, false),
      ];
      const base: GameState = {
        ...state,
        seed,
        act,
        map,
        currentRow: row,
        currentNodeId: node.id,
        roster: debugRoster,
        field: debugRoster.map((u) => u.uid),
        gold: 500,
        inventory: { berry: 5, meat: 5, skip: 3, scout: 2, twin: 2 },
        rewards: [],
        battle: undefined,
        specialPending: undefined,
        shopBought: false,
        log: [`[调试] 第 ${act} 幕 第 ${row} 层 → ${node.label}`, ...state.log].slice(0, 20),
      };
      return enterNode(base, node);
    }

    case 'DEBUG_CUSTOM_TEST': {
      // 点「⚙ 自定义测试」：先进入关卡类型选择界面
      return { ...state, screen: 'test-type', testRun: undefined, testPick: undefined, pendingBattle: undefined, formation: undefined };
    }

    case 'TEST_TYPE_PICK': {
      const nodeType = action.nodeType;
      const nodeId = 'custom_test';
      const node: MapNode = { id: nodeId, type: nodeType, label: labelOf(nodeType, 0), col: 0 };
      if (nodeType === 'corrupted') {
        node.corruptDebuff = action.corruptDebuff ?? 'spd';
        node.corruptReward = action.corruptReward ?? 'gold';
      }
      const map: RunMap = { layers: [[node]], encounter: {}, boss: {}, events: {}, specials: {} };
      const needsPets = TEST_BATTLE_TYPES.includes(nodeType);
      // 非战斗类：默认携带 3 只初始宠物（御三家），供进化之光/属性强化等选择类内容使用
      const starters = needsPets ? [] : ['momo', 'lulu', 'fifi'].map((id, i) => makeUnit(id, true, i as 0 | 1 | 2, false));
      const base: GameState = {
        ...state,
        seed: 1,
        act: 1,
        map,
        currentRow: 0,
        currentNodeId: nodeId,
        roster: starters,
        field: starters.map((u) => u.uid),
        rewards: [],
        battle: undefined,
        specialPending: undefined,
        shopBought: false,
        testRun: undefined,
        pendingBattle: undefined,
        testPick: needsPets
          ? { side: 'player', nodeType, corruptDebuff: node.corruptDebuff, corruptReward: node.corruptReward }
          : undefined,
        log: [`[自定义测试] ${labelOf(nodeType, 0)}${needsPets ? '：选择我方宠物' : '：默认携带 3 只初始宠物'}`, ...state.log].slice(0, 20),
      };
      // 非战斗类：预生成事件/奇遇/钥匙，进入对应界面时展示
      if (nodeType === 'event') {
        base.map.events[nodeId] = buildEvent(createRng(1 * 7 + 3));
      } else if (nodeType === 'special') {
        base.map.specials[nodeId] = buildSpecial(createRng(1 * 7 + 3));
      } else if (nodeType === 'keydoor') {
        // 钥匙门：自动配发对应钥匙，进入即开启高级宝箱
        node.guardianId = nodeId;
        base.inventory = { ...base.inventory, [`key_${nodeId}`]: 1 };
      }
      // 不需要宠物的关卡：跳过选宠，直接进入对应内容
      if (!needsPets) return enterNode(base, node);
      return { ...base, screen: 'test-pick' };
    }

    case 'TEST_PICK_PLAYER_CONFIRM': {
      const tp = state.testPick;
      if (!tp || tp.side !== 'player' || action.units.length === 0) return state;
      return {
        ...state,
        testPick: { ...tp, side: 'enemy', playerUnits: action.units },
        log: [`[自定义测试] 我方 ${action.units.map((u) => u.name).join('、')}，选择敌方宠物`, ...state.log].slice(0, 20),
      };
    }

    case 'TEST_PICK_ENEMY_CONFIRM': {
      const tp = state.testPick;
      if (!tp || tp.side !== 'enemy' || !tp.playerUnits || action.units.length === 0) return state;
      const encounter = action.units.map((u) => ({ speciesId: u.speciesId }));
      const map: RunMap = { ...state.map };
      if (tp.nodeType === 'boss') {
        map.boss = { ...map.boss, [state.currentNodeId]: encounter };
      } else {
        map.encounter = { ...map.encounter, [state.currentNodeId]: encounter };
      }
      // 战斗参数按节点类型生成
      let units = tp.playerUnits;
      let options: BattleOptions = { enemyExact: true };
      if (tp.nodeType === 'corrupted') options.corruptDebuff = tp.corruptDebuff;
      if (tp.nodeType === 'guardian') options.untameable = true;
      if (tp.nodeType === 'arena') {
        // 斗兽场：1v1 单挑，只取第 1 只上阵
        units = tp.playerUnits.slice(0, 1);
        options = { untameable: true };
      } else if (tp.nodeType === 'gauntlet') {
        // 车轮战：按棋盘槽位顺序轮换
        options = { gauntlet: true, untameable: true };
      }
      return {
        ...state,
        map,
        testPick: undefined,
        screen: 'test-config',
        testRun: true,
        pendingBattle: { units, encounter, seed: 1, options, nodeType: tp.nodeType },
        log: [
          `[自定义测试] ${labelOf(tp.nodeType, 0)}：${units.map((u) => u.name).join('、')} vs ${encounter.map((e) => getMonster(e.speciesId).name).join('、')}`,
          ...state.log,
        ].slice(0, 20),
      };
    }

    case 'EVENT_CHOICE': {
      if (state.screen !== 'event') return state;
      const ev = state.map.events[state.currentNodeId];
      if (!ev) return state;
      const choice = ev.choices.find((x) => x.id === action.choiceId);
      if (!choice) return state;
      // 花费类选项若金币不足则视为无效选择（kind='gold' 的负数扣款选项除外，可直接为负扣款）
      if (choice.kind !== 'gold' && state.gold + (choice.goldDelta ?? 0) < 0) return state;
      let next: GameState = { ...state, screen: 'roster', gold: state.gold + (choice.goldDelta ?? 0) };
      if (choice.kind === 'heal') {
        next = healRoster(next, (choice.amount ?? 0) / 100);
      } else if (choice.kind === 'gold') {
        next = { ...next, gold: Math.max(0, next.gold + (choice.amount ?? 0)) };
      } else if (choice.kind === 'food' && choice.foodId) {
        next = { ...next, inventory: { ...next.inventory, [choice.foodId]: (next.inventory[choice.foodId] ?? 0) + 1 } };
      } else if (choice.kind === 'item' && choice.itemId) {
        next = { ...next, inventory: { ...next.inventory, [choice.itemId]: (next.inventory[choice.itemId] ?? 0) + 1 } };
      } else if (choice.kind === 'recruit' && choice.monsterId && next.roster.length < ROSTER_MAX) {
        next = { ...next, roster: [...next.roster, makeUnit(choice.monsterId, true, 0, false)] };
      } else if (choice.kind === 'damage') {
        next = {
          ...next,
          roster: next.roster.map((u) => ({ ...u, hp: Math.max(1, u.hp - Math.round(u.maxHp * (choice.amount ?? 0) / 100)) })),
        };
      }
      return { ...next, log: [choice.label, ...next.log].slice(0, 20) };
    }

    case 'SPECIAL_CHOICE': {
      if (state.screen !== 'special') return state;
      const sp = state.map.specials[state.currentNodeId];
      if (!sp) return state;
      const reward = sp.rewards.find((r) => r.id === action.rewardId);
      if (!reward) return state;
      let next: GameState = { ...state, screen: 'roster' };
      switch (reward.kind) {
        case 'gold':
          next = { ...next, gold: next.gold + (reward.amount ?? 0) };
          break;
        case 'item':
          if (reward.itemId) {
            next = { ...next, inventory: { ...next.inventory, [reward.itemId]: (next.inventory[reward.itemId] ?? 0) + 1 } };
          }
          break;
        case 'evolve':
        case 'superevolve':
          if (!next.roster.some((u) => nextStage(u.speciesId))) return state;
          next = { ...next, specialPending: { kind: 'evolve', super: reward.kind === 'superevolve' } };
          break;
        case 'boost':
          if (next.roster.length === 0) return state;
          next = { ...next, specialPending: { kind: 'boost', uid: '' } };
          break;
        case 'custom':
          if (next.roster.length >= ROSTER_MAX) return state;
          next = { ...next, screen: 'custom' };
          break;
      }
      return { ...next, log: [`奇遇关：${reward.label}`, ...next.log].slice(0, 20) };
    }

    case 'EVOLVE_ONE': {
      if (state.specialPending?.kind !== 'evolve') return state;
      const target = state.roster.find((u) => u.uid === action.uid);
      if (!target || !nextStage(target.speciesId)) return state;
      let evolved = fuseUnit(target);
      if (!evolved) return state;
      if (state.specialPending.super) {
        const rng = createRng(state.seed * 33 + state.act * 11 + state.roster.length * 7);
        const curses = ['hpDown', 'atkDown', 'spdDown'] as const;
        evolved = { ...evolved, curse: curses[Math.floor(rng() * 3)] };
      }
      const roster = state.roster.map((u) => (u.uid === action.uid ? evolved! : u));
      const log = state.specialPending.super
        ? [`超进化！${target.name} 进化成了 ${evolved.name}，但付出了代价`, ...state.log]
        : [`${target.name} 进化成了 ${evolved.name}！`, ...state.log];
      return { ...state, roster, specialPending: undefined, log: log.slice(0, 20) };
    }

    case 'SPECIAL_TARGET': {
      if (state.specialPending?.kind === 'boost') {
        if (!state.roster.some((u) => u.uid === action.uid)) return state;
        return { ...state, specialPending: { kind: 'boost', uid: action.uid }, screen: 'boost' };
      }
      if (state.specialPending?.kind === 'arena') {
        const unit = state.roster.find((u) => u.uid === action.uid);
        if (!unit) return state;
        const node = currentNode(state);
        const encounter = node ? state.map.encounter[node.id] : undefined;
        if (!encounter) return { ...state, screen: 'map', specialPending: undefined };
        const battle = createBattle([unit], encounter, state.seed + state.currentRow * 17, { untameable: true });
        return {
          ...state,
          screen: 'battle',
          specialPending: undefined,
          battle,
          log: [`${unit.name} 出战斗兽场！`, ...state.log].slice(0, 20),
        };
      }
      return state;
    }

    case 'BOOST_STAT': {
      const pendingBoost = state.specialPending;
      if (pendingBoost?.kind !== 'boost') return state;
      if (!pendingBoost.uid) return state;
      const target = state.roster.find((u) => u.uid === pendingBoost.uid);
      if (!target) return state;
      const bonus = { ...target.bonusStats };
      const statCn = { hp: '生命', spd: '速度' }[action.stat];
      if (action.stat === 'hp') bonus.hp = (bonus.hp ?? 0) + 3;
      else bonus.spd = (bonus.spd ?? 0) + 1;
      const roster = state.roster.map((u) => (u.uid === target.uid ? recomputeStats({ ...u, bonusStats: bonus }) : u));
      return {
        ...state,
        screen: 'roster',
        roster,
        specialPending: undefined,
        log: [`属性强化！${target.name} 的${statCn}永久提升`, ...state.log].slice(0, 20),
      };
    }

    case 'PICK_CUSTOM': {
      if (state.screen !== 'custom') return state;
      if (state.roster.length >= ROSTER_MAX) return state;
      if (!CUSTOM_PRESETS.some((p) => p === action.presetId)) return state;
      const rng = createRng(state.seed * 7 + state.act * 13 + state.roster.length * 3 + state.currentRow);
      const unit = makeCustomUnit(action.presetId, rng);
      return {
        ...state,
        screen: 'roster',
        roster: [...state.roster, unit],
        log: [`造物：${unit.name} 加入了队伍`, ...state.log].slice(0, 20),
      };
    }

    case 'USE_PURIFY': {
      const inv = state.inventory.purify ?? 0;
      if (inv <= 0) return state;
      const target = state.roster.find((u) => u.uid === action.uid);
      if (!target || !target.curse) return state;
      const roster = state.roster.map((u) => (u.uid === action.uid ? recomputeStats({ ...u, curse: undefined }) : u));
      return {
        ...state,
        roster,
        inventory: { ...state.inventory, purify: inv - 1 },
        log: [`净化药水清除了 ${target.name} 的诅咒`, ...state.log].slice(0, 20),
      };
    }

    case 'OPEN_BACKPACK': {
      if (state.screen !== 'map') return state;
      return { ...state, screen: 'backpack', backpackFrom: state.screen, scoutResult: undefined, skipSelecting: false };
    }

    case 'CLOSE_BACKPACK': {
      if (state.screen !== 'backpack') return state;
      const back = state.backpackFrom ?? 'map';
      return { ...state, screen: back, backpackFrom: undefined, scoutResult: undefined, skipSelecting: false };
    }

    case 'USE_SCOUT': {
      const inv = state.inventory.scout ?? 0;
      if (inv <= 0 || state.screen !== 'map') return state;
      const node = state.map.layers.flat().find((n) => n.id === action.nodeId);
      if (!node) return state;
      const info = nodeInfo(state, node);
      return {
        ...state,
        screen: 'map',
        scoutSelecting: false,
        inventory: { ...state.inventory, scout: inv - 1 },
        scoutResult: { nodeId: node.id, title: info.title, detail: info.detail },
        log: [`侦查：查看了「${node.label}」的情报`, ...state.log].slice(0, 20),
      };
    }

    case 'OPEN_SCOUT': {
      const inv = state.inventory.scout ?? 0;
      if (inv <= 0 || state.screen !== 'backpack') return state;
      return { ...state, screen: 'map', scoutSelecting: true, skipSelecting: false, scoutResult: undefined };
    }

    case 'CANCEL_SCOUT': {
      return { ...state, scoutSelecting: false, scoutResult: undefined };
    }

    case 'OPEN_SKIP': {
      const inv = state.inventory.skip ?? 0;
      if (inv <= 0 || state.screen !== 'backpack') return state;
      return { ...state, screen: 'map', skipSelecting: true, scoutSelecting: false, scoutResult: undefined };
    }

    case 'CANCEL_SKIP': {
      return { ...state, skipSelecting: false };
    }

    case 'USE_SKIP': {
      const inv = state.inventory.skip ?? 0;
      if (inv <= 0 || state.screen !== 'map') return state;
      const targetRow = state.currentNodeId === '' ? state.currentRow : state.currentRow + 1;
      const node = state.map.layers[targetRow]?.find((n) => n.id === action.nodeId);
      if (!node) return state;
      // 与 MOVE 相同的相邻校验
      if (state.currentNodeId !== '') {
        const cur = state.map.layers[state.currentRow]?.find((n) => n.id === state.currentNodeId);
        if (!canStepTo(state.currentRow, cur?.col, node, state.map)) return state;
      }
      // 可跳过战斗/精英/斗兽场/车轮战/被侵蚀节点，首领与守卫不可跳过，钥匙门/双生宝箱不是战斗
      if (node.type === 'boss' || node.type === 'guardian') return state;
      if (node.type !== 'battle' && node.type !== 'elite' && node.type !== 'arena' && node.type !== 'gauntlet' && node.type !== 'corrupted')
        return state;
      const base: GameState = {
        ...state,
        currentRow: targetRow,
        currentNodeId: node.id,
        inventory: { ...state.inventory, skip: inv - 1 },
      };
      const challenge = node.type === 'arena' || node.type === 'gauntlet';
      const corrupt = node.type === 'corrupted';
      let goldGain = 0;
      let rewards: RewardChoice[];
      if (challenge) {
        // 挑战节点跳关：直接领取 3 选 1 挑战奖励
        rewards = generateChallengeRewards(base, node.type as 'arena' | 'gauntlet');
      } else {
        goldGain = node.type === 'elite' ? 16 : corrupt && node.corruptReward === 'gold' ? 16 : 8;
        rewards = applyCorruptFoodReward(generateRewards(base), base.seed * 11 + base.currentRow * 7);
      }
      const withRewards: GameState = { ...base, screen: 'reward', gold: base.gold + goldGain, rewards };
      return {
        ...withRewards,
        skipSelecting: false,
        log: [`使用跳关道具，跳过「${node.label}」获得奖励`, ...state.log].slice(0, 20),
      };
    }

    case 'FORMATION_CONFIRM': {
      const f = state.formation;
      if (!f || action.units.length === 0) return state;
      const battle = createBattle(action.units, f.encounter, state.seed + state.currentRow * 17, f.options);
      return { ...state, screen: 'battle', battle, formation: undefined };
    }

    case 'GAUNTLET_ORDER_CONFIRM': {
      if (state.currentNodeId === '' || action.units.length === 0) return state;
      const encounter = state.map.encounter[state.currentNodeId];
      if (!encounter) return state;
      const battle = createBattle(action.units, encounter, state.seed + state.currentRow * 17, { gauntlet: true, untameable: true });
      return { ...state, screen: 'battle', battle, gauntletOrder: undefined, gauntletSize: undefined };
    }

    case 'PLAYER_SKILL': {
      if (!state.battle || state.battle.phase !== 'acting') return state;
      const battle = playerSkill(state.battle, action.actorUid, action.skillId, action.targetUid);
      return { ...state, battle };
    }

    case 'PLAYER_REST': {
      if (!state.battle || state.battle.phase !== 'acting') return state;
      return { ...state, battle: playerRest(state.battle, action.actorUid) };
    }

    case 'PLAYER_CANCEL_ORDER': {
      if (!state.battle || state.battle.phase !== 'acting') return state;
      return { ...state, battle: playerCancelOrder(state.battle, action.actorUid) };
    }

    case 'PLAYER_SWAP': {
      if (!state.battle || state.battle.phase !== 'acting') return state;
      const battle = playerSwap(state.battle, action.actorUid, action.otherUid);
      return { ...state, battle };
    }

    case 'END_TURN': {
      if (!state.battle || state.battle.phase !== 'acting') return state;
      return { ...state, battle: playerEndTurn(state.battle) };
    }

    case 'PLAYER_TAME': {
      if (!state.battle || state.battle.phase !== 'acting') return state;
      if (!getFoodSafe(action.foodId)) return state;
      const inv = state.inventory[action.foodId] ?? 0;
      if (inv <= 0) return state;
      const battle = playerTame(state.battle, action.foodId, action.enemyUid);
      if (battle.rngCount !== state.battle.rngCount) {
        const inventory = { ...state.inventory, [action.foodId]: inv - 1 };
        return { ...state, battle, inventory };
      }
      return { ...state, battle };
    }

    case 'USE_BATTLE_ITEM': {
      if (!state.battle || state.battle.phase !== 'acting') return state;
      const item = getItem(action.itemId);
      if (!item.usableInBattle || !item.needsTarget) return state;
      const inv = state.inventory[action.itemId] ?? 0;
      if (inv <= 0) return state;
      if (!action.targetUid) return state;
      const battle = useBattleItem(state.battle, action.itemId, action.targetUid);
      if (battle.rngCount !== state.battle.rngCount) {
        const inventory = { ...state.inventory, [action.itemId]: inv - 1 };
        return { ...state, battle, inventory };
      }
      return { ...state, battle };
    }

    case 'TEST_ITEMS_CONFIRM': {
      if (!state.testRun || !state.pendingBattle) return state;
      const pb = state.pendingBattle;
      const seed = action.seed > 0 ? Math.floor(action.seed) : 1;
      const battle = createBattle(pb.units, pb.encounter, seed, pb.options);
      const inventory: Record<string, number> = {};
      for (const [k, v] of Object.entries(action.inventory)) {
        const n = Math.floor(v);
        if (n > 0) inventory[k] = n;
      }
      return {
        ...state,
        screen: 'battle',
        battle,
        inventory,
        gold: Math.max(0, Math.floor(action.gold) || 0),
        pendingBattle: undefined,
        formation: undefined,
        specialPending: undefined,
        gauntletOrder: undefined,
        gauntletSize: undefined,
        log: [
          `[自定义测试] 战斗开始：${pb.units.map((u) => u.name).join('、')} vs ${pb.encounter.map((e) => getMonster(e.speciesId).name).join('、')}`,
          ...state.log,
        ].slice(0, 20),
      };
    }

    case 'BATTLE_END_CONFIRM': {
      if (!state.battle) return state;
      // 自定义测试：胜负确认后直接回首页，不进入正常结算流程
      if (state.testRun) {
        return { ...createInitialState(), screen: 'title' };
      }
      if (state.battle.phase === 'won') return resolveBattle(state, state.battle);
      if (state.battle.phase === 'lost') {
        const node = currentNode(state);
        // 斗兽场/车轮战：失败不 Game Over，改为随机坏事件惩罚（宠物不会阵亡）
        if (node?.type === 'arena' || node?.type === 'gauntlet') {
          const rng = createRng(state.seed * 97 + state.act * 29 + state.currentRow * 13 + state.battle.rngCount);
          const event = buildPunishmentEvent(rng);
          const roster = state.roster.map((u) => ({ ...u, hp: Math.max(1, u.hp) }));
          return {
            ...state,
            screen: 'event',
            battle: undefined,
            roster,
            map: { ...state.map, events: { ...state.map.events, [state.currentNodeId]: event } },
            log: [`挑战失败：在「${node.label}」失利，承受代价`, ...state.log].slice(0, 20),
          };
        }
        return { ...state, screen: 'gameover', battle: undefined };
      }
      return state;
    }

    case 'PICK_REWARD': {
      const reward = state.rewards.find((r) => r.id === action.rewardId);
      if (!reward) return state;
      let next: GameState = { ...state, screen: 'roster', rewards: [] };
      if (reward.kind === 'food' && reward.foodId) {
        next = { ...next, inventory: { ...next.inventory, [reward.foodId]: (next.inventory[reward.foodId] ?? 0) + (reward.amount ?? 1) } };
      } else if (reward.kind === 'heal') {
        next = healRoster(next, (reward.amount ?? 30) / 100);
      } else if (reward.kind === 'recruit' && reward.monsterId) {
        if (next.roster.length < ROSTER_MAX) {
          const u = makeUnit(reward.monsterId, true, 0, false);
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

    case 'FUSE': {
      if (state.screen !== 'roster') return state;
      const primary = state.roster.find((u) => u.uid === action.primaryUid);
      if (!primary) return state;
      if (!nextStage(primary.speciesId)) return state;
      const need = fusionNeedCount(primary.speciesId);
      const same = state.roster.filter((u) => u.speciesId === primary.speciesId);
      if (same.length < need) return state;
      const evolved = fuseUnit(primary);
      if (!evolved) return state;
      // 主宠保留原 uid；其余同物种材料（need-1 只）从队伍移除
      const materials = same.filter((u) => u.uid !== primary.uid).slice(0, need - 1);
      const materialUids = materials.map((u) => u.uid);
      const roster = state.roster
        .filter((u) => !materialUids.includes(u.uid))
        .map((u) => (u.uid === primary.uid ? evolved : u));
      return {
        ...state,
        roster,
        field: state.field.filter((uid) => roster.some((u) => u.uid === uid)),
        log: [`融合！${materials.map((m) => m.name).join('+')} 与 ${primary.name} 融合成了 ${evolved.name}！`, ...state.log].slice(0, 20),
      };
    }

    case 'DISCARD': {
      if (state.roster.length <= 1) return state; // 至少保留一只宠物
      const unit = state.roster.find((u) => u.uid === action.uid);
      let goldGain = 0;
      if (unit) {
        const monster = getMonster(unit.speciesId);
        // 释放奖励：基础 5 金 × 品阶
        goldGain = 5 * monster.rank;
      }
      return {
        ...state,
        gold: state.gold + goldGain,
        roster: state.roster.filter((u) => u.uid !== action.uid),
        field: state.field.filter((uid) => uid !== action.uid),
        log: goldGain > 0 ? [`释放 ${unit?.name}，获得 ${goldGain} 金币`, ...state.log].slice(0, 20) : state.log,
      };
    }

    case 'TAME_OVERFLOW_REPLACE': {
      const tame = state.tameOverflow?.find((u) => u.uid === action.tameUid);
      if (!tame) return state;
      const discard = state.roster.find((u) => u.uid === action.discardUid);
      if (!discard) return state;
      if (state.roster.length <= 0) return state;
      const goldGain = 5 * getMonster(discard.speciesId).rank;
      const roster = [...state.roster.filter((u) => u.uid !== discard.uid), tame];
      const overflow = (state.tameOverflow ?? []).filter((u) => u.uid !== tame.uid);
      const next: GameState = {
        ...state,
        roster,
        field: state.field.filter((uid) => uid !== discard.uid),
        gold: state.gold + goldGain,
        tameOverflow: overflow,
        log: [`释放 ${discard.name}（+${goldGain}💰），刚驯服的 ${tame.name} 加入队伍`, ...state.log].slice(0, 20),
      };
      return overflow.length === 0 ? { ...next, screen: 'reward', tameOverflow: undefined } : next;
    }

    case 'TAME_OVERFLOW_FUSE': {
      const tame = state.tameOverflow?.find((u) => u.uid === action.tameUid);
      if (!tame) return state;
      const primary = state.roster.find((u) => u.uid === action.primaryUid);
      if (!primary || primary.speciesId !== tame.speciesId) return state;
      if (!nextStage(primary.speciesId)) return state;
      const need = fusionNeedCount(primary.speciesId);
      // 同物种（现有队伍中，不含刚驯服的这只）数量 + 刚驯服的这只 = 总数，需 >= need
      const same = state.roster.filter((u) => u.speciesId === primary.speciesId);
      if (same.length + 1 < need) return state;
      // 材料：现有同物种中除主宠外取 need-2 只，再加上刚驯服的这只，共 need-1 只
      const useExisting = same.filter((u) => u.uid !== primary.uid).slice(0, need - 2);
      const evolved = fuseUnit(primary);
      if (!evolved) return state;
      const roster = state.roster
        .filter((u) => !useExisting.some((m) => m.uid === u.uid))
        .map((u) => (u.uid === primary.uid ? evolved : u));
      const overflow = (state.tameOverflow ?? []).filter((u) => u.uid !== tame.uid);
      const materialNames = [...useExisting.map((m) => m.name), tame.name].join('、');
      const next: GameState = {
        ...state,
        roster,
        field: state.field.filter((uid) => roster.some((u) => u.uid === uid)),
        tameOverflow: overflow,
        log: [`融合！${materialNames} 与 ${primary.name} 融合成了 ${evolved.name}！`, ...state.log].slice(0, 20),
      };
      return overflow.length === 0 ? { ...next, screen: 'reward', tameOverflow: undefined } : next;
    }

    case 'TAME_OVERFLOW_DISCARD': {
      const tame = state.tameOverflow?.find((u) => u.uid === action.tameUid);
      if (!tame) return state;
      const overflow = (state.tameOverflow ?? []).filter((u) => u.uid !== tame.uid);
      const next: GameState = {
        ...state,
        tameOverflow: overflow,
        log: [`放生了刚驯服的 ${tame.name}`, ...state.log].slice(0, 20),
      };
      return overflow.length === 0 ? { ...next, screen: 'reward', tameOverflow: undefined } : next;
    }

    case 'SHOP_BUY': {
      // 支持食物与道具两种商品（价格不同）
      const food = FOODS[action.foodId];
      const item = ITEMS[action.foodId];
      if (!food && !item) return state;
      if (!(state.shopStock ?? []).includes(action.foodId)) return state;
      const price = food ? food.price : item.price;
      if (state.gold < price) return state;
      if ((state.shopBoughtItems ?? []).includes(action.foodId)) return state;
      return {
        ...state,
        gold: state.gold - price,
        shopBought: true,
        shopBoughtItems: [...(state.shopBoughtItems ?? []), action.foodId],
        inventory: { ...state.inventory, [action.foodId]: (state.inventory[action.foodId] ?? 0) + 1 },
      };
    }

    case 'SHOP_REST': {
      if (state.screen !== 'shop' || state.shopBought === true || state.gold < 5) return state;
      return {
        ...healRoster(state, 1),
        screen: 'roster',
        gold: state.gold - 5,
        shopBought: false,
        log: ['花 5 金币立即休整，全队回满血（诅咒未解除）', ...state.log].slice(0, 20),
      };
    }

    case 'REST_HEAL': {
      return { ...healRoster(state, 1), screen: 'roster' };
    }

    case 'OPEN_WATCHTOWER': {
      // 打开已访问的瞭望塔：支持指定 nodeId（点击地图上历史瞭望塔节点），或回退到当前节点
      const targetId = action.nodeId ?? state.currentNodeId;
      const targetNode = state.map.layers.flat().find((n) => n.id === targetId);
      if (!targetNode || targetNode.type !== 'watchtower') return state;
      const visited = state.visitedWatchtowers ?? [];
      if (!visited.includes(targetId)) return state;
      return { ...state, screen: 'watchtower', watchtowerPreviewNodeId: targetId };
    }

    case 'CLOSE_WATCHTOWER': {
      if (state.screen !== 'watchtower') return state;
      return { ...state, screen: 'map', watchtowerPreviewNodeId: undefined };
    }

    case 'NEXT_NODE': {
      if (bossCleared(state)) {
        if (state.act >= 3) return { ...state, screen: 'victory' };
        const act = state.act + 1;
        return {
          ...state,
          act,
          map: generateMap(state.seed, act),
          currentRow: 0,
          currentNodeId: '',
          screen: 'map',
          gauntletOrder: undefined,
          gauntletSize: undefined,
        };
      }
      const nextRow = state.currentRow + 1;
      if (nextRow < state.map.layers.length) {
        return { ...state, screen: 'map', chestResult: undefined, gauntletOrder: undefined, gauntletSize: undefined };
      }
      return { ...state, screen: 'victory' };
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
