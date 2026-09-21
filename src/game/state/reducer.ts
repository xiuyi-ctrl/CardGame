import type { GameState, MapNode, RewardChoice, RunMap, RunStats, Difficulty, Unlocks, SpecialRewardKind } from './game';
import { applyCorruptFoodReward, applyCurseToUnit, buildEventByType, buildPunishmentEvent, buildSpecial, canStepTo, currentNode, CUSTOM_PRESETS, DEFAULT_UNLOCKS, DIFFICULTY_CONFIG, EVO2_POOL, FIELD_MAX, fuseUnit, fusionNeedCount, generateChallengeRewards, generateMap, generateRewards, getMaxRoster, hashStr, labelOf, makeCustomUnit, maxFieldForEnemy, nextStage, nodeInfo, removeCurseFromUnit, rollChest, recomputeStats } from './game';
import { useBattleItem, playerCancelOrder, playerEndTurn, playerRest, playerSwap, performGauntletSwap } from '../core/battle';
import { createBattle, makeUnit, playerSkill, playerTame, updateUnitSkills } from '../core/battle';
import type { BattleOptions } from '../core/battle';
import type { BattleState, Unit } from '../types';
import { FOODS } from '../data/foods';
import { getItem, ITEMS } from '../data/items';
import { getMonster } from '../data/monsters';
import { createRng, shuffle } from '../rng';
import { SLOT3_COST, SLOT4_COST, SLOT5_COST, REROLL_COST, getRandomSkillChoices, getRandomLegendarySkillChoices, getMaxSkillSlots, applySkillEnhance, applySkillEnhanceStone, applySkillEnhanceReset } from '../core/growth';
import { generateGrowthMap, getGrowthEncounter, getGrowthEliteEncounter } from '../core/growth-map';
import { getGrowthArenaEncounter } from '../data/growth-arena';
import { buildGrowthEvent } from '../data/growth-events';
import { getGrowthShopStock } from '../data/growth-shop';
import { getGrowthSpecialRewards, GROWTH_SPECIAL_REWARDS } from '../data/growth-special';

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

export type GameAction =
  | { type: 'START_RUN'; starterId: string; companionId: string; seed: number; difficulty?: Difficulty; relic?: string }
  | { type: 'STARTER'; saveSlot?: number; unlocks?: Unlocks }
  | { type: 'LOAD_GAME'; state: GameState }
  | { type: 'DELETE_SAVE'; slot: number }
  | { type: 'MOVE'; nodeId: string }
  | { type: 'EVENT_CHOICE'; choiceId: string }
  | { type: 'EVENT_HATCH_PREVIEW'; choiceId: string; monsterId: string }
  | { type: 'EVENT_HATCH_CONFIRM' }
  | { type: 'EVENT_HATCH_CANCEL' }
  | { type: 'EVENT_BATTLE_START'; enemies: { speciesId: string }[]; reward: { kind: 'gold' | 'food' | 'hp'; amount?: number; foodId?: string }; penalty: { percent?: number; goldLoss?: number; curseTarget?: boolean }; bonusReward?: { kind: 'food'; foodId: string } }
  | { type: 'BATTLE_END_CONFIRM' }
  | { type: 'SPECIAL_CHOICE'; rewardId: string }
  | { type: 'EVOLVE_ONE'; uid: string }
  | { type: 'SPECIAL_TARGET'; uid: string }
  | { type: 'BOOST_STAT'; stat: 'hp' | 'spd' }
  | { type: 'FUSE'; primaryUid: string }
  | { type: 'PICK_CUSTOM'; presetId: string }
  | { type: 'USE_PURIFY'; uid: string }
  | { type: 'USE_SKIP'; nodeId: string; free?: boolean }
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
  | { type: 'TAME_OVERFLOW_JOIN'; tameUid: string }
  | { type: 'FUSE_IN_OVERFLOW'; uid: string }
  | { type: 'PLAYER_SKILL'; actorUid: string; skillId: string; targetUid?: string }
  | { type: 'PLAYER_REST'; actorUid: string }
  | { type: 'PLAYER_CANCEL_ORDER'; actorUid: string }
  | { type: 'PLAYER_SWAP'; actorUid: string; otherUid: string }
  | { type: 'END_TURN' }
  | { type: 'GAUNTLET_SWAP' }
  | { type: 'FORMATION_CONFIRM'; units: Unit[] }
  | { type: 'GAUNTLET_ORDER_CONFIRM'; units: Unit[] }
  | { type: 'PLAYER_TAME'; foodId: string; enemyUid: string }
  | { type: 'BATTLE_END_CONFIRM' }
  | { type: 'PICK_REWARD'; rewardId: string }
  | { type: 'SET_FIELD'; uids: string[] }
  | { type: 'DISCARD'; uid: string }
  | { type: 'SHOP_BUY'; foodId: string }
  | { type: 'SHOP_REST' }
  | { type: 'SHOP_REFRESH' }
  | { type: 'REST_HEAL' }
  | { type: 'NEXT_NODE' }
  | { type: 'BACK_TO_MAP' }
  | { type: 'OPEN_WATCHTOWER'; nodeId?: string }
  | { type: 'CLOSE_WATCHTOWER' }
  | { type: 'DEBUG_JUMP'; act: number; row: number; nodeType: string; seed: number }
  | { type: 'DEBUG_CUSTOM_TEST' }
  | { type: 'TEST_TYPE_PICK'; nodeType: MapNode['type']; corruptDebuff?: 'spd' | 'dmg' | 'burn'; corruptReward?: 'gold' | 'food'; eventType?: string }
  | { type: 'TEST_PICK_PLAYER_CONFIRM'; units: Unit[] }
  | { type: 'TEST_PICK_ENEMY_CONFIRM'; units: Unit[] }
  | { type: 'TEST_ITEMS_CONFIRM'; inventory: Record<string, number>; gold: number; seed: number }
  | { type: 'RETRY'; seed: number }
  | { type: 'INTER_ACT_CONTINUE' }
  | { type: 'CLEAR_TOAST' }
  | { type: 'SHOW_TOAST'; msg: string; kind?: 'info' | 'success' | 'error' | 'warning' }
  | { type: 'TITLE' }
  | { type: 'ACHIEVEMENTS'; unlocks?: Unlocks }
  | { type: 'SELECT_DIFFICULTY' }
  | { type: 'SELECT_DIFFICULTY_BACK' }
  | { type: 'SET_PRERUN_CONFIG'; difficulty: Difficulty; relic?: string }
  | { type: 'START_PROFICIENCY'; seed: number; saveSlot?: number }
  | { type: 'START_PROFICIENCY_PICKED'; seed: number; saveSlot?: number; starterId: string; companionId: string }
  | { type: 'PROF_GROWTH_APPLY'; uid: string; updatedUnit: Unit }
  | { type: 'PROF_GROWTH_MENU' }
  | { type: 'PROF_SLOT_PICK'; skillId: string }
  | { type: 'PROF_SLOT_CANCEL' }
  | { type: 'PROF_SLOT_UNLOCK'; uid: string; slot: 3 | 4 | 5 }
  | { type: 'PROF_SHOP_BUY'; itemId: string }
  | { type: 'PROF_SHOP_REFRESH' }
  | { type: 'PROF_SHOP_EFFECT'; uid: string }
  | { type: 'USE_GROWTH_ITEM'; itemId: string }
  | { type: 'CANCEL_GROWTH_ITEM' }
  | { type: 'PROF_SKILL_REPLACE_START'; uid: string }
  | { type: 'PROF_SKILL_REPLACE_SELECT'; replaceIdx: number }
  | { type: 'PROF_SKILL_ENHANCE'; uid: string; slotIndex: number }
  | { type: 'PROF_SKILL_ENHANCE_RESET'; uid: string; slotIndex: number }
  | { type: 'PROF_SKILL_ENHANCE_STONE'; uid: string; slotIndex: number }
  | { type: 'PROF_TRANSFER_GROWTH'; sourceUid: string; targetUid: string; amount: number }
  | { type: 'REST_FUSION_SET_MAIN'; uid: string }
  | { type: 'REST_FUSION_SET_SUB'; uid: string }
  | { type: 'REST_FUSION_CONFIRM' }
  | { type: 'REST_FUSION_SKILL'; skillId: string; replaceIdx?: number }
  | { type: 'REST_FUSION_SET_LEARN'; skillId: string }
  | { type: 'REST_FUSION_SELECT_REPLACE'; replaceIdx: number }
  | { type: 'REST_FUSION_CANCEL' }
  | { type: 'REST_FUSION_MODE' }
  | { type: 'REVIVE'; uid: string; ratio: number }
  | { type: 'ARENA3_MODE'; mode: 'simulation' | 'challenge' | 'exhibition' }
  | { type: 'ARENA3_SELECT'; uid: string };

export function createInitialState(): GameState {
  const zeroSnap = { battlesWon: 0, battlesLost: 0, goldEarned: 0, goldSpent: 0, petsTamed: 0, petsLost: 0, turnsPlayed: 0, tameAttempts: 0, 圣果Used: 0, fusions: 0, shopVisits: 0 };
  return {
    screen: 'title',
    seed: 0,
    act: 1,
    map: generateMap(0, 1),
    currentRow: 0,
    currentNodeId: '',
    roster: [],
    field: [],
    inventory: { berry: 3, meat: 2 },
    gold: 20,
    rewards: [],
    log: [],
    visitedWatchtowers: [],
    visitedNodeIds: [],
    runStats: { battlesWon: 0, battlesLost: 0, goldEarned: 0, goldSpent: 0, petsTamed: 0, petsLost: 0, turnsPlayed: 0, tameAttempts: 0, 圣果Used: 0, fusions: 0, shopVisits: 0, lastBattleRound: 0, actSnapshot: { ...zeroSnap } },
    difficulty: 'normal',
    unlocks: { ...DEFAULT_UNLOCKS },
  };
}

/** 校验读取的存档是否为合法 GameState */
export function isValidGameState(s: unknown): s is GameState {
  if (typeof s !== 'object' || s === null) return false;
  const o = s as Record<string, unknown>;
  const screens = ['title', 'starter', 'map', 'formation', 'gauntlet-order', 'battle', 'reward', 'roster', 'shop', 'rest', 'event', 'special', 'custom', 'boost', 'gameover', 'victory', 'watchtower', 'chest', 'backpack', 'tame-overflow', 'inter_act', 'test-type', 'test-pick', 'test-config', 'achievements', 'difficulty-select', 'skill-pick', 'growth-menu', 'revive-select', 'rest-fusion', 'rest-fusion-skill'];
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

function freshRun(starterId: string, companionId: string, seed: number, difficulty?: Difficulty, relicId?: string, saveSlot?: number, unlocks?: Unlocks): GameState {
  const starter = makeUnit(starterId, true, 0, false);
  const starter2 = makeUnit(starterId, true, 1, false);
  const companion = makeUnit(companionId, true, 2, false);
  const zeroSnap = { battlesWon: 0, battlesLost: 0, goldEarned: 0, goldSpent: 0, petsTamed: 0, petsLost: 0, turnsPlayed: 0, tameAttempts: 0, 圣果Used: 0, fusions: 0, shopVisits: 0 };
  let roster = [starter, starter2, companion];
  let inventory: Record<string, number> = { berry: 3, meat: 2 };
  let gold = 20;
  const relics = relicId ? [relicId] : [];
  // 应用遗物效果
  if (relicId) {
    switch (relicId) {
      case 'traveler_charm': gold += 15; break;
      case 'elite_badge': inventory.scout = (inventory.scout ?? 0) + 1; inventory.skip = (inventory.skip ?? 0) + 1; break;
      case 'legend_seal': inventory.golden_fruit = (inventory.golden_fruit ?? 0) + 1; {
        // 额外1只随机二阶宠物
        if (EVO2_POOL && EVO2_POOL.length > 0) {
          const pick2 = EVO2_POOL[Math.floor(Math.random() * EVO2_POOL.length)];
          if (pick2) roster.push(makeUnit(pick2, true, (roster.length % 3) as 0 | 1 | 2, false));
        }
        break;
      }
      case 'flame_medal': roster.push(makeUnit('chuchu', true, (roster.length % 3) as 0 | 1 | 2, false)); inventory.atk_potion = (inventory.atk_potion ?? 0) + 2; break;
      case 'nature_medal': roster.push(makeUnit('tiedun', true, (roster.length % 3) as 0 | 1 | 2, false)); inventory.hp_potion = (inventory.hp_potion ?? 0) + 2; break;
      case 'shadow_medal': roster.push(makeUnit('mimi', true, (roster.length % 3) as 0 | 1 | 2, false)); inventory.poison_potion = (inventory.poison_potion ?? 0) + 2; break;
    }
  }
  const map = generateMap(seed, 1, difficulty);
  const field = roster.slice(0, 3).map((u) => u.uid);
  return {
    screen: 'map',
    seed,
    act: 1,
    map,
    currentRow: 0,
    currentNodeId: '',
    roster,
    field,
    inventory,
    gold,
    rewards: [],
    log: [],
    visitedWatchtowers: [],
    visitedNodeIds: [],
    runStats: { battlesWon: 0, battlesLost: 0, goldEarned: 0, goldSpent: 0, petsTamed: 0, petsLost: 0, turnsPlayed: 0, tameAttempts: 0, 圣果Used: 0, fusions: 0, shopVisits: 0, lastBattleRound: 0, actSnapshot: { ...zeroSnap } },
    difficulty: difficulty ?? 'normal',
    unlocks: unlocks ?? { ...DEFAULT_UNLOCKS },
    relics,
    saveSlot,
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
  const challenge = node?.type === 'arena' || node?.type === 'gauntlet' || node?.type === 'arena3';
  const bossNode = state.map.boss[state.currentNodeId] !== undefined;
  const eliteNode = state.map.encounter[state.currentNodeId] !== undefined;
  const corruptNode = node?.type === 'corrupted';

  const deadPetsList: Unit[] = [];
  const synced: (Unit | null)[] = state.roster.map((r) => {
    const b = [...battle.playerUnits, ...(battle.playerDown ?? [])].find((u) => u.uid === r.uid);
    if (!b) return r; // 后备宠物未参与本场战斗：原样保留
    if (b.hp <= 0) {
      // 斗兽场/车轮战：阵亡单位不会永久死亡（保留并保底 1 血）；普通战斗阵亡永久移除
      if (challenge) return { ...r, statuses: [], hp: 1 };
      // 存入墓地（保留死亡时的完整状态，不含战斗临时状态）
      deadPetsList.push({ ...r, hp: 0, statuses: [], skillUses: undefined, skillCooldowns: undefined, acted: false });
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

  // 竞技场模拟战：战斗结束后恢复所有宠物至战前HP（不消耗生命）
  if (node?.type === 'arena3' && state.arena3Pending?.mode === 'simulation') {
    roster = state.roster.map((u) => {
      const bUnit = [...battle.playerUnits, ...(battle.playerDown ?? [])].find((bu) => bu.uid === u.uid);
      if (!bUnit) return u;
      // 恢复到战前 HP
      return { ...u, hp: u.hp };
    });
  }

  // 驯服入库：先填满空位，超出的进入溢出队列（等待玩家处理：替换/融合/放弃）
  let overflow: Unit[] = [];
  const cap = getMaxRoster(state.runMode);
  for (const t of battle.pendingTame) {
    if (roster.length < cap) roster.push(t);
    else overflow.push(t);
  }

  const goldGain = node?.type === 'arena3' && state.arena3Pending?.mode === 'challenge'
    ? 50
    : challenge
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
  const prevDead = state.deadPets ?? [];
  const settled: GameState = {
    ...state,
    screen: overflow.length > 0 ? 'tame-overflow' : (state.runMode === 'proficiency' ? 'growth-menu' : 'reward'),
    roster,
    deadPets: [...prevDead, ...deadPetsList],
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
      ...(overflow.length > 0 ? [`队伍已满（${cap} 只），需要处理 ${overflow.length} 只驯服的宠物`] : []),
      ...(roster.length < state.roster.length ? [`战斗中有宠物阵亡，永远失去了它`] : []),
      ...state.log,
    ].slice(0, 20),
  };
  // 战后全体恢复 60%
  const healCfg = DIFFICULTY_CONFIG[state.difficulty ?? 'normal'];
  const healRatio = healCfg.healRatio;
  const healed = settled.roster.map((u) => ({ ...u, hp: Math.min(u.maxHp, u.hp + Math.round(u.maxHp * healRatio)) }));
  let rewards = challenge
    ? generateChallengeRewards({ ...settled, roster: healed }, node!.type as 'arena' | 'gauntlet')
    : generateRewards({ ...settled, roster: healed });
  if (corruptNode && node?.corruptReward === 'food') {
    rewards = applyCorruptFoodReward(rewards, state.seed * 11 + state.currentRow * 7);
  }
  const result: GameState = { ...settled, roster: healed, rewards };
  // 更新局内统计
  const curLost = settled.roster.length < state.roster.length
    ? state.roster.length - settled.roster.length
    : 0;
  const runStats = result.runStats ? {
    ...result.runStats,
    battlesWon: result.runStats.battlesWon + 1,
    goldEarned: result.runStats.goldEarned + goldGain,
    petsTamed: result.runStats.petsTamed + battle.pendingTame.length,
    petsLost: result.runStats.petsLost + curLost,
    tameAttempts: result.runStats.tameAttempts + (battle.tameAttempts ?? 0),
    圣果Used: result.runStats.圣果Used + (battle.圣果Used ?? 0),
  } : result.runStats;
  // 成长点：仅远征模式，参战+2，击杀按敌人等级额外奖励
  let finalRoster = result.roster;
  if (state.runMode === 'proficiency') {
    // 竞技场模拟战：全体存活宠物 +5 成长点
    if (node?.type === 'arena3' && state.arena3Pending?.mode === 'simulation') {
      finalRoster = result.roster.map((u) => {
        const gp = (u.growthPoints ?? 0) + 5;
        return { ...u, growthPoints: gp };
      });
    } else if (node?.type === 'arena3' && state.arena3Pending?.mode === 'challenge') {
      // 竞技场挑战赛：全体存活宠物 +3 成长点
      finalRoster = result.roster.map((u) => {
        const gp = (u.growthPoints ?? 0) + 3;
        return { ...u, growthPoints: gp };
      });
    } else {
      // 计算击杀奖励：所有敌人被击败时按rank给成长点
      let killGp = 0;
      for (const eu of battle.enemyUnits) {
        if (eu.hp > 0) continue; // 未击杀的跳过
        const rank = getMonster(eu.speciesId).rank;
        if (bossNode && rank === 4) {
          // Boss小怪 vs Boss本体：小怪物种id不在boss遭遇列表的第一个即为小怪
          const bossEncounter = state.map.boss[state.currentNodeId];
          const isMainBoss = bossEncounter && bossEncounter.length > 0 && bossEncounter[0].speciesId === eu.speciesId;
          killGp += isMainBoss ? 6 : 2;
        } else if (rank === 2) {
          killGp += 4;
        } else {
          killGp += 2;
        }
      }
      finalRoster = result.roster.map((u) => {
        const inBattle = [...battle.playerUnits, ...(battle.playerDown ?? [])].some((bu) => bu.uid === u.uid);
        const battleGp = inBattle ? 1 + killGp : 0;
        const gp = (u.growthPoints ?? 0) + 1 + battleGp;
        return { ...u, growthPoints: gp };
      });
    }
  }
  const withStats = { ...result, runStats, roster: finalRoster };
  // 最后一幕（act 3）首领战胜利：直接进入通关界面，不再弹出战利品/队伍管理等中间界面
  if (bossNode && state.act >= 3) return { ...withStats, screen: 'victory' };
  return withStats;
}

/** 开启宝箱：普通双生宝箱 3 选 1（金币/食物/全体回血 30%），钥匙门为高级宝箱（金币+食物+概率道具）。结果文本进 chestResult。共用 rollChest 保证与瞭望塔/侦察符预览完全一致。 */
function openChest(base: GameState, node: MapNode, keydoor: boolean): { next: GameState; text: string } {
  const roll = rollChest(base.seed, base.currentRow, node.id, keydoor);
  let next = base;
  if (roll.gold) next = { ...next, gold: next.gold + roll.gold };
  if (roll.foodId) next = { ...next, inventory: { ...next.inventory, [roll.foodId]: (next.inventory[roll.foodId] ?? 0) + 1 } };
  for (const ex of roll.extras) next = { ...next, inventory: { ...next.inventory, [ex.id]: (next.inventory[ex.id] ?? 0) + 1 } };
  if (roll.healRatio) {
    const healed = next.roster.map((u) => ({ ...u, hp: Math.min(u.maxHp, u.hp + Math.round(u.maxHp * roll.healRatio!)) }));
    next = { ...next, roster: healed };
  }
  const text = `开启「${labelOf(node.type, base.currentRow)}」：${roll.text}`;
  return { next, text };
}

/** 进入一个地图节点：根据节点类型进入对应界面（MOVE 与 DEBUG_JUMP 共用） */
function fieldUnits(state: GameState, maxCount?: number): Unit[] {
  const limit = maxCount ?? FIELD_MAX;
  const uids = state.field.length > 0 ? state.field : state.roster.slice(0, limit).map((u) => u.uid);
  return state.roster.filter((u) => uids.includes(u.uid)).slice(0, limit);
}

/** 默认自动布阵：前 3 只站前排 0-2 列，第 4 只起站后排 */
function autoPosition(units: Unit[]): Unit[] {
  return units.map((u, i) =>
    i < 3 ? { ...u, row: 'front' as const, column: i as 0 | 1 | 2 } : { ...u, row: 'back' as const, column: (i - 3) as 0 | 1 | 2 },
  );
}

function enterNode(base: GameState, node: MapNode, prevRow?: number, prevNodeId?: string): GameState {
  // 成长远征模式：专属节点处理
  if (base.runMode === 'proficiency') {
    if (node.type === 'rest') return { ...base, screen: 'rest' };
    if (node.type === 'shop') {
      const rng = createRng(base.seed * 7919 + (base.currentLayer ?? 0) * 104729 + hashStr(node.id));
      const stock = getGrowthShopStock(rng);
      const rs = base.runStats ? { ...base.runStats, shopVisits: base.runStats.shopVisits + 1 } : base.runStats;
      return { ...base, screen: 'shop', shopBought: false, shopBoughtItems: [], shopStock: stock, shopRefreshCount: 0, runStats: rs };
    }
    if (node.type === 'blacksmith') {
      return { ...base, screen: 'blacksmith' };
    }
    if (node.type === 'arena3') {
      return { ...base, screen: 'arena3', arena3Pending: { mode: undefined } };
    }
    if (node.type === 'event') {
      const rng = createRng(base.seed * 3571 + (base.currentLayer ?? 0) * 9973 + hashStr(node.id));
      const event = buildGrowthEvent(rng, undefined, (base.deadPets ?? []).length);
      return { ...base, screen: 'event', map: { ...base.map, events: { ...base.map.events, [node.id]: event } } };
    }
    if (node.type === 'special') {
      const rng = createRng(base.seed * 4919 + (base.currentLayer ?? 0) * 6131 + hashStr(node.id));
      const specialIds = getGrowthSpecialRewards(rng, (base.deadPets ?? []).length);
      const rewards = specialIds.map((id) => {
        const baseReward = { ...GROWTH_SPECIAL_REWARDS[id] };
        const kindMap: Record<string, SpecialRewardKind> = {
          growth_blessing: 'growthPoint',
          stat_blessing: 'boost',
          skill_blessing: 'slotUnlock',
          legend_recruit: 'recruit',
          gold_treasure: 'gold',
          revive: 'revive',
        };
        return { ...baseReward, kind: kindMap[id] ?? 'custom' as const };
      });
      return { ...base, screen: 'special', map: { ...base.map, specials: { ...base.map.specials, [node.id]: { title: '奇遇', desc: '选择一项奖励', rewards } } } };
    }
    if (node.type === 'battle' || node.type === 'elite') {
      if (base.roster.length === 0) return { ...base, screen: 'map' };
      const rng = createRng(base.seed * 2731 + (base.currentLayer ?? 0) * 5039 + hashStr(node.id));
      const encounter = node.type === 'elite' ? getGrowthEliteEncounter(base.currentLayer ?? 1, rng) : getGrowthEncounter(base.currentLayer ?? 1, rng);
      const maxField = maxFieldForEnemy(encounter.length, base.runMode);
      const initial = autoPosition(fieldUnits(base, maxField));
      const options = { act: 1, nodeType: node.type as 'battle' | 'elite', difficulty: base.difficulty, untameable: true, layer: base.currentLayer ?? 1 };
      return { ...base, screen: 'formation', formation: { units: base.roster, initialField: initial, encounter, nodeId: node.id, options, prevRow, prevNodeId } };
    }
    if (node.type === 'boss') {
      if (base.roster.length === 0) return { ...base, screen: 'map' };
      const layerMatch = node.id.match(/^pf_(\d+)$/);
      const layer = layerMatch ? parseInt(layerMatch[1], 10) : (base.currentRow + 1);
      // 从预生成的 map.boss 读取（种子确定→Boss确定）
      const encounter = base.map.boss[node.id];
      if (!encounter || encounter.length === 0) return { ...base, screen: 'map' };
      const maxField = maxFieldForEnemy(encounter.length, base.runMode);
      const initial = autoPosition(fieldUnits(base, maxField));
      const options = { act: 1, nodeType: 'boss' as const, difficulty: base.difficulty, untameable: true, layer };
      return { ...base, screen: 'formation', formation: { units: base.roster, initialField: initial, encounter, nodeId: node.id, options, prevRow, prevNodeId } };
    }
    return { ...base, screen: 'map' };
  }
  // 主模式：原有逻辑
  if (node.type === 'rest') return { ...base, screen: 'rest' };
  if (node.type === 'shop') {
    const rng = createRng(base.seed * 7919 + (base.currentRow) * 104729 + hashStr(node.id));
    const pool = [...Object.keys(FOODS).filter((id) => FOODS[id].shop !== false), ...Object.keys(ITEMS).filter((id) => ITEMS[id].price > 0 && ITEMS[id].shop !== false)];
    const stock = shuffle(rng, pool).slice(0, 4);
    const rs = base.runStats ? { ...base.runStats, shopVisits: base.runStats.shopVisits + 1 } : base.runStats;
    return { ...base, screen: 'shop', shopBought: false, shopBoughtItems: [], shopStock: stock, shopRefreshCount: 0, runStats: rs };
  }
  if (node.type === 'event') return { ...base, screen: 'event' };
  if (node.type === 'special') return { ...base, screen: 'special' };
  if (node.type === 'blacksmith') return { ...base, screen: 'map' };
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
    const maxField = maxFieldForEnemy(encounter.length, base.runMode);
    const initial = autoPosition(fieldUnits(base, maxField));
    const options = { act: base.act, nodeType: 'boss' as const, difficulty: base.difficulty };
    return { ...base, screen: 'formation', formation: { units: base.roster, initialField: initial, encounter, nodeId: node.id, options, prevRow, prevNodeId } };
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
    const maxField = maxFieldForEnemy(encounter.length, base.runMode);
    const initial = autoPosition(fieldUnits(base, maxField));
    return { ...base, screen: 'formation', formation: { units: base.roster, initialField: initial, encounter, nodeId: node.id, options: { untameable: true, act: base.act, nodeType: 'guardian', difficulty: base.difficulty }, prevRow, prevNodeId } };
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
    const maxField = maxFieldForEnemy(encounter.length, base.runMode);
    const units = fieldUnits(base, maxField);
    if (units.length === 0) return { ...base, screen: 'map' };
    return { ...base, screen: 'gauntlet-order', gauntletOrder: units, gauntletSize: encounter.length, gauntletPrevRow: prevRow, gauntletPrevNodeId: prevNodeId };
  }
  // 普通/精英/被侵蚀：先布阵选择站位（棋盘默认放自动出战宠物，列表为全部宠物池）
  const options = {
    ...(node.type === 'corrupted' ? { corruptDebuff: node.corruptDebuff } : {}),
    act: base.act,
    nodeType: node.type,
    difficulty: base.difficulty,
  };
  if (base.roster.length === 0) return { ...base, screen: 'map' };
  const maxField = maxFieldForEnemy(encounter.length, base.runMode);
  const initial = autoPosition(fieldUnits(base, maxField));
  return { ...base, screen: 'formation', formation: { units: base.roster, initialField: initial, encounter, nodeId: node.id, options, prevRow, prevNodeId } };
}

function bossCleared(state: GameState): boolean {
  return state.map.boss[state.currentNodeId] !== undefined;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_RUN': {
      const diff = action.difficulty ?? state.difficulty ?? 'normal';
      const rel = action.relic ?? state.relics?.[0];
      return freshRun(action.starterId, action.companionId, action.seed, diff, rel, state.saveSlot, state.unlocks);
    }

    case 'STARTER':
      return { ...createInitialState(), screen: 'difficulty-select', saveSlot: action.saveSlot, unlocks: action.unlocks ?? { ...DEFAULT_UNLOCKS } };

    case 'LOAD_GAME':
      if (!isValidGameState(action.state)) return { ...createInitialState(), screen: 'title', unlocks: state.unlocks ?? { ...DEFAULT_UNLOCKS } };
      {
  const zeroSnap = { battlesWon: 0, battlesLost: 0, goldEarned: 0, goldSpent: 0, petsTamed: 0, petsLost: 0, turnsPlayed: 0, tameAttempts: 0, 圣果Used: 0, fusions: 0, shopVisits: 0 };
        const saved = action.state.runStats;
        const runStats: RunStats = {
          battlesWon: saved?.battlesWon ?? 0,
          battlesLost: saved?.battlesLost ?? 0,
          goldEarned: saved?.goldEarned ?? 0,
          goldSpent: saved?.goldSpent ?? 0,
          petsTamed: saved?.petsTamed ?? 0,
          petsLost: saved?.petsLost ?? 0,
          turnsPlayed: saved?.turnsPlayed ?? 0,
          tameAttempts: saved?.tameAttempts ?? 0,
          圣果Used: saved?.圣果Used ?? 0,
          fusions: saved?.fusions ?? 0,
          shopVisits: saved?.shopVisits ?? 0,
          lastBattleRound: saved?.lastBattleRound ?? 0,
          actSnapshot: saved?.actSnapshot ?? { ...zeroSnap },
        };
        return {
          ...action.state,
          runStats,
          difficulty: action.state.difficulty ?? 'normal',
          unlocks: action.state.unlocks ?? { ...DEFAULT_UNLOCKS },
          map: { ...action.state.map, events: action.state.map.events ?? {}, specials: action.state.map.specials ?? {} },
          skipSelecting: false,
          scoutSelecting: false,
          scoutResult: undefined,
          saveSlot: action.state.saveSlot,
        };
      }

    case 'MOVE': {
      const isFirst = state.currentNodeId === '';
      const targetRow = isFirst ? state.currentRow : state.currentRow + 1;
      const rowNodes = state.map.layers[targetRow];
      const node = rowNodes?.find((n) => n.id === action.nodeId);
      if (!node) return state;
      // 同层锁定：该层已有已访问节点时，不可改选其他节点
      const visitedInRow = (state.visitedNodeIds ?? []).filter((id) => rowNodes?.some((n) => n.id === id) ?? false);
      if (visitedInRow.length > 0 && !visitedInRow.includes(action.nodeId)) return state;
      // 相邻校验：出发层可直达下一层任意节点；此后只能移动到当前节点列号 col±1（旧存档无 col 时放行）
      if (!isFirst) {
        const cur = state.map.layers[state.currentRow]?.find((n) => n.id === state.currentNodeId);
        if (!canStepTo(state.currentRow, cur?.col, node, state.map)) return state;
      }
      // 钥匙门：未持有对应钥匙不可进入
      if (node.type === 'keydoor' && !hasKeyFor(state, node)) return state;
      const visitedNodeIds = [...(state.visitedNodeIds ?? [])];
      if (!visitedNodeIds.includes(action.nodeId)) visitedNodeIds.push(action.nodeId);
      const prevRow = state.currentRow;
      const prevNodeId = state.currentNodeId;
      const base: GameState = { ...state, currentRow: targetRow, currentNodeId: action.nodeId, shopBought: false, visitedNodeIds, skipSelecting: false, scoutSelecting: false };
      return enterNode(base, node, prevRow, prevNodeId);
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
        makeUnit('momo_god', true, 0, false),
        makeUnit('lulu_god', true, 1, false),
        makeUnit('fifi_god', true, 2, false),
        makeUnit('momo', true, 0, false, 'back'),
        makeUnit('lulu', true, 1, false, 'back'),
        makeUnit('fifi', true, 2, false, 'back'),
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
        skipSelecting: false,
        scoutSelecting: false,
        scoutResult: undefined,
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
      // 所有类型默认携带 3 只最高进化形态 + 3 只基础形态（御三家全系列）
      const starters = [
        makeUnit('momo_god', true, 0, false),
        makeUnit('lulu_god', true, 1, false),
        makeUnit('fifi_god', true, 2, false),
        makeUnit('momo', true, 0, false, 'back'),
        makeUnit('lulu', true, 1, false, 'back'),
        makeUnit('fifi', true, 2, false, 'back'),
      ];
      // 默认携带全部食物与道具各 2 个，供测试各关卡内容
      const testInventory: Record<string, number> = {};
      for (const id of Object.keys(FOODS)) testInventory[id] = 2;
      for (const id of Object.keys(ITEMS)) testInventory[id] = 2;
      const base: GameState = {
        ...state,
        seed: 1,
        act: 1,
        map,
        currentRow: 0,
        currentNodeId: nodeId,
        roster: starters,
        field: starters.map((u) => u.uid),
        inventory: testInventory,
        rewards: [],
        battle: undefined,
        specialPending: undefined,
        shopBought: false,
        testRun: undefined,
        pendingBattle: undefined,
        testPick: needsPets
          ? { side: 'player', nodeType, corruptDebuff: node.corruptDebuff, corruptReward: node.corruptReward }
          : undefined,
        log: [`[自定义测试] ${labelOf(nodeType, 0)}${needsPets ? '：选择我方宠物' : '：默认携带 3 只最高进化形态宠物'}`, ...state.log].slice(0, 20),
      };
      // 非战斗类：预生成事件/奇遇/钥匙，进入对应界面时展示
      if (nodeType === 'event') {
        const eventType = action.eventType || 'spring';
        base.map.events[nodeId] = buildEventByType(createRng(1 * 7 + 3), eventType, base.act);
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
      // 消耗食物类选项若食物不足则视为无效
      if (choice.consumeFood && choice.foodId && (state.inventory[choice.foodId] ?? 0) <= 0) return state;
      let next: GameState = { ...state, gold: state.gold + (choice.goldDelta ?? 0), postBattle: undefined };
      if (choice.kind === 'heal') {
        next = healRoster(next, (choice.amount ?? 0) / 100);
      } else if (choice.kind === 'gold') {
        next = { ...next, gold: Math.max(0, next.gold + (choice.amount ?? 0)) };
        if (choice.curseTarget && next.roster.length > 0) {
          const curseKinds: Array<'hpDown' | 'atkDown' | 'spdDown'> = ['hpDown', 'atkDown', 'spdDown'];
          const rc = curseKinds[Math.floor(Math.random() * curseKinds.length)];
          const ri = Math.floor(Math.random() * next.roster.length);
          next = { ...next, roster: next.roster.map((u, i) => i === ri ? applyCurseToUnit(u, rc) : u) };
        }
      } else if (choice.kind === 'food' && choice.foodId) {
        if (choice.consumeFood) {
          next = { ...next, inventory: { ...next.inventory, [choice.foodId]: Math.max(0, (next.inventory[choice.foodId] ?? 0) - 1) } };
        } else {
          next = { ...next, inventory: { ...next.inventory, [choice.foodId]: (next.inventory[choice.foodId] ?? 0) + 1 } };
        }
        // food 类型也可附带 itemId 奖励（如赠送食物事件）
        if (choice.itemId) {
          next = { ...next, inventory: { ...next.inventory, [choice.itemId]: (next.inventory[choice.itemId] ?? 0) + 1 } };
        }
      } else if (choice.kind === 'item' && choice.itemId) {
        next = { ...next, inventory: { ...next.inventory, [choice.itemId]: (next.inventory[choice.itemId] ?? 0) + 1 } };
      } else if (choice.kind === 'recruit' && choice.monsterId && next.roster.length < getMaxRoster(state.runMode)) {
        next = { ...next, roster: [...next.roster, makeUnit(choice.monsterId, true, 0, false)] };
      } else if (choice.kind === 'damage') {
        next = {
          ...next,
          roster: next.roster.map((u) => ({ ...u, hp: Math.max(1, u.hp - Math.round(u.maxHp * (choice.amount ?? 0) / 100)) })),
        };
      } else if (choice.kind === 'battle' && choice.battleEnemies) {
        // 事件战斗：设置 eventBattle 数据，跳转布阵界面
        const reward = choice.battleReward ?? { kind: 'gold' as const, amount: choice.goldDelta ?? 0 };
        const penalty = choice.battlePenalty ?? { percent: 15 };
        const maxField = maxFieldForEnemy(choice.battleEnemies.length, state.runMode);
        const initial = autoPosition(fieldUnits(next, maxField));
        const options = { untameable: true, act: state.act, nodeType: 'battle' as const, difficulty: state.difficulty };
        return {
          ...next,
          screen: 'formation',
          eventBattle: { enemies: choice.battleEnemies, reward, penalty },
          formation: { units: next.roster, initialField: initial, encounter: choice.battleEnemies, nodeId: '', options },
          log: ['进入事件战斗', ...next.log].slice(0, 20),
        };
      } else if (choice.kind === 'sacrifice' && next.roster.length > 0) {
        // 献祭：随机放生 1 只宠物，全队永久 +N 属性
        const sacrificeIdx = Math.floor(Math.random() * next.roster.length);
        next = {
          ...next,
          roster: next.roster.filter((_, i) => i !== sacrificeIdx).map((u) => {
            const bonus = { ...u.bonusStats };
            if (choice.boostStat === 'hp') {
              bonus.hp = (bonus.hp ?? 0) + (choice.amount ?? 0);
            } else if (choice.boostStat === 'spd') {
              bonus.spd = (bonus.spd ?? 0) + (choice.amount ?? 0);
            }
            return recomputeStats({ ...u, bonusStats: bonus });
          }),
        };
      } else if (choice.kind === 'growthPoint' && next.roster.length > 0) {
        if (choice.targetAll) {
          // 全队获得成长点
          next = {
            ...next,
            roster: next.roster.map((u) => ({ ...u, growthPoints: (u.growthPoints ?? 0) + (choice.amount ?? 1) })),
          };
          next = { ...next, toast: { msg: `全队各获得 ${choice.amount ?? 1} 成长点`, kind: 'success' } };
        } else {
          // 选择1只宠物获得成长点：跳转到选择界面
          // 检查概率（chance 字段）
          if (choice.chance !== undefined && choice.chance < 1) {
            const roll = Math.random();
            if (roll >= choice.chance) {
              return { ...next, screen: 'event', toast: { msg: '祈福失败……无事发生', kind: 'warning' }, log: [`${choice.label}（失败）`, ...next.log].slice(0, 20) };
            }
          }
          return { ...next, screen: 'roster', specialPending: { kind: 'growthPoint', uid: '', amount: choice.amount ?? 1 }, log: [choice.label, ...next.log].slice(0, 20) };
        }
      } else if (choice.kind === 'permanentBoost' && next.roster.length > 0) {
        // 永久属性提升：跳转到选择界面（noCap 由 EventChoice.noCap 传入）
        const boostKind = choice.boostStat === 'spd' ? 'eventBoostSpd' : 'eventBoostHp';
        return { ...next, screen: 'roster', specialPending: { kind: boostKind, uid: '', amount: choice.amount ?? 1 }, log: [choice.label, ...next.log].slice(0, 20) };
      } else if (choice.kind === 'resetGrowthPoints' && next.roster.length > 0) {
        // 重置成长点：跳转到选择界面
        return { ...next, screen: 'roster', specialPending: { kind: 'eventResetGrowth', uid: '' }, log: [choice.label, ...next.log].slice(0, 20) };
      } else if (choice.kind === 'skillReplace' && next.roster.length > 0) {
        // 替换技能：跳转到选择界面
        return { ...next, screen: 'roster', specialPending: { kind: 'eventSkillReplace', uid: '' }, log: [choice.label, ...next.log].slice(0, 20) };
      } else if (choice.kind === 'boost' && next.roster.length > 0) {
        // 永久属性提升：随机 1 只宠物
        const boostIdx = Math.floor(Math.random() * next.roster.length);
        const boostedPet = next.roster[boostIdx];
        next = {
          ...next,
          roster: next.roster.map((u, i) => {
            if (i !== boostIdx) return u;
            const bonus = { ...u.bonusStats };
            if (choice.boostStat === 'hp') {
              bonus.hp = (bonus.hp ?? 0) + (choice.amount ?? 0);
            } else if (choice.boostStat === 'spd') {
              bonus.spd = (bonus.spd ?? 0) + (choice.amount ?? 0);
            }
            return recomputeStats({ ...u, bonusStats: bonus });
          }),
        };
        const statCn = choice.boostStat === 'hp' ? '生命' : '速度';
        if ((choice.amount ?? 0) > 0) {
          next = { ...next, toast: { msg: `${boostedPet.name} 永久 +${choice.amount} ${statCn}`, kind: 'success' } };
        }
      } else if (choice.kind === 'purify') {
        // 清除诅咒：随机 1 只宠物
        const purifyIdx = next.roster.findIndex((u) => u.curse);
        if (purifyIdx >= 0) {
          next = {
            ...next,
            roster: next.roster.map((u, i) => i === purifyIdx ? removeCurseFromUnit(u) : u),
          };
        }
      } else if (choice.kind === 'curse' && next.roster.length > 0) {
        // 附加诅咒：随机 1 只宠物
        const curseIdx = Math.floor(Math.random() * next.roster.length);
        const curseKinds: Array<'hpDown' | 'atkDown' | 'spdDown'> = ['hpDown', 'atkDown', 'spdDown'];
        const randomCurse = curseKinds[Math.floor(Math.random() * curseKinds.length)];
        next = {
          ...next,
          roster: next.roster.map((u, i) => i === curseIdx ? applyCurseToUnit(u, randomCurse) : u),
        };
      } else if (choice.kind === 'status' && choice.statusKind) {
        // 附加状态：全体
        next = {
          ...next,
          roster: next.roster.map((u) => {
            if (choice.statusKind === 'poison') {
              const existing = u.statuses.find((s) => s.kind === 'poison');
              if (existing) {
                return { ...u, statuses: u.statuses.map((s) => s.kind === 'poison' ? { ...s, value: s.value + (choice.statusValue ?? 0) } : s) };
              }
              return { ...u, statuses: [...u.statuses, { kind: 'poison', value: choice.statusValue ?? 0, turns: 99 }] };
            } else if (choice.statusKind === 'burn') {
              const existing = u.statuses.find((s) => s.kind === 'burn');
              if (existing) {
                return { ...u, statuses: u.statuses.map((s) => s.kind === 'burn' ? { ...s, value: s.value + (choice.statusValue ?? 0) } : s) };
              }
              return { ...u, statuses: [...u.statuses, { kind: 'burn', value: choice.statusValue ?? 0, turns: 99 }] };
            }
            return u;
          }),
        };
      } else if (choice.kind === 'revive') {
        const deadPets = next.deadPets ?? [];
        if (deadPets.length > 0) {
          return { ...next, screen: 'revive-select', reviveRatio: choice.reviveRatio ?? 0.5 };
        }
      }
      // 设置 toast 提示
      if (choice.kind === 'gold' && (choice.amount ?? 0) > 0) {
        next = { ...next, toast: { msg: `获得 ${choice.amount} 金币`, kind: 'success' } };
      } else if (choice.kind === 'gold' && (choice.amount ?? 0) < 0) {
        next = { ...next, toast: { msg: `失去 ${Math.abs(choice.amount!)} 金币`, kind: 'error' } };
      } else if (choice.kind === 'gold' && (choice.amount ?? 0) === 0 && (choice.goldDelta ?? 0) < 0) {
        next = { ...next, toast: { msg: '什么也没得到……', kind: 'error' } };
      } else if (choice.kind === 'food' && choice.foodId && !next.toast) {
        // 赠送食物等：先检查 goldDelta 决定输赢
        const gd = choice.goldDelta ?? 0;
        if (gd > 0) {
          next = { ...next, toast: { msg: `获得 ${gd} 金币`, kind: 'success' } };
        } else if (gd < 0) {
          next = { ...next, toast: { msg: `失去 ${Math.abs(gd)} 金币`, kind: 'error' } };
        } else {
          const f = FOODS[choice.foodId];
          next = { ...next, toast: { msg: `${f?.emoji ?? '🍖'} ${f?.name ?? choice.foodId} ×1`, kind: 'success' } };
        }
      } else if (choice.kind === 'item' && choice.itemId) {
        const it = ITEMS[choice.itemId];
        next = { ...next, toast: { msg: `${it?.emoji ?? '🎒'} ${it?.name ?? choice.itemId} ×1`, kind: 'success' } };
      } else if (choice.kind === 'recruit' && choice.monsterId && next.roster.length < getMaxRoster(state.runMode)) {
        const m = getMonster(choice.monsterId);
        next = { ...next, toast: { msg: `招募了 ${m.emoji} ${m.name}！`, kind: 'success' } };
      } else if (choice.kind === 'purify') {
        next = { ...next, toast: { msg: '清除了一只宠物的诅咒', kind: 'success' } };
      } else if (choice.kind === 'heal' && (choice.amount ?? 0) > 0) {
        next = { ...next, toast: { msg: `全体恢复 ${choice.amount}% 生命`, kind: 'info' } };
      } else if (choice.kind === 'damage' && (choice.amount ?? 0) > 0) {
        next = { ...next, toast: { msg: `全体受到 ${choice.amount}% 伤害`, kind: 'error' } };
      } else if (choice.kind === 'curse') {
        next = { ...next, toast: { msg: '随机宠物被诅咒了！', kind: 'error' } };
      } else if (choice.kind === 'status' && choice.statusKind === 'poison') {
        next = { ...next, toast: { msg: `全体中毒 ${choice.statusValue ?? 0} 层！`, kind: 'error' } };
      }
      // 成长远征模式：处理成长点效果
      if (state.runMode === 'proficiency' && next.roster.length > 0) {
        // 目标宠物成长点（boost 类型）
        if (choice.kind === 'boost' && (choice.growthPointGain || choice.resetGrowthPoints)) {
          const boostTarget = next.roster.find((u) => u.hp > 0);
          if (boostTarget) {
            next = {
              ...next,
              roster: next.roster.map((u) => {
                if (u.uid !== boostTarget.uid) return u;
                let result = { ...u };
                if (choice.growthPointGain) {
                  result = { ...result, growthPoints: (result.growthPoints ?? 0) + (choice.growthPointGain as number) };
                }
                if (choice.resetGrowthPoints) {
                  // 重置成长点：返还所有属性加成
                  const hpBonus = result.bonusStats?.hp ?? 0;
                  const spdBonus = result.bonusStats?.spd ?? 0;
                  const returnedPoints = Math.floor(hpBonus / 2) + spdBonus;
                  result = { ...result, growthPoints: (result.growthPoints ?? 0) + returnedPoints, bonusStats: { hp: 0, spd: 0 } };
                  result = { ...result, maxHp: result.maxHp - hpBonus, hp: Math.min(result.hp, result.maxHp), spd: result.spd - spdBonus };
                }
                return result;
              }),
            };
            if (choice.growthPointGain) {
              next = { ...next, toast: { msg: `获得 ${choice.growthPointGain} 成长点`, kind: 'success' } };
            }
            if (choice.resetGrowthPoints) {
              next = { ...next, toast: { msg: '成长点已重置', kind: 'success' } };
            }
          }
        }
      }
      return { ...next, screen: 'map', log: [choice.label, ...next.log].slice(0, 20) };
    }

    case 'EVENT_HATCH_PREVIEW': {
      if (state.screen !== 'event') return state;
      return { ...state, pendingEventHatch: { choiceId: action.choiceId, monsterId: action.monsterId } };
    }

    case 'EVENT_HATCH_CONFIRM': {
      if (state.screen !== 'event' || !state.pendingEventHatch) return state;
      const { choiceId } = state.pendingEventHatch;
      let next: GameState = { ...state, screen: 'map', pendingEventHatch: undefined, postBattle: undefined };
      const ev = state.map.events[state.currentNodeId];
      const choice = ev?.choices.find((x) => x.id === choiceId);
      if (choice && choice.kind === 'recruit' && choice.monsterId) {
        if (next.roster.length < getMaxRoster(state.runMode)) {
          next = { ...next, roster: [...next.roster, makeUnit(choice.monsterId, true, 0, false)] };
        } else {
          const hatched = makeUnit(choice.monsterId, true, 0, false);
          next = {
            ...next,
            screen: 'tame-overflow',
            tameOverflow: [...(state.tameOverflow ?? []), hatched],
            tameOverflowReturn: 'map',
          };
        }
      }
      return { ...next, log: [choice?.label ?? '孵化', ...next.log].slice(0, 20) };
    }

    case 'EVENT_HATCH_CANCEL': {
      if (state.screen !== 'event') return state;
      const hatch = state.pendingEventHatch;
      const goldReward = hatch ? (getMonster(hatch.monsterId).rank === 1 ? 5 : getMonster(hatch.monsterId).rank === 2 ? 10 : getMonster(hatch.monsterId).rank === 3 ? 15 : 20) : 0;
      return { ...state, pendingEventHatch: undefined, screen: 'map', postBattle: undefined, gold: state.gold + goldReward, log: [`放生获得 ${goldReward} 金币`, ...state.log].slice(0, 20) };
    }

    case 'EVENT_BATTLE_START': {
      if (state.screen !== 'event') return state;
      // 设置 eventBattle 数据，跳转布阵界面
      const maxField = maxFieldForEnemy(action.enemies.length, state.runMode);
      const initial = autoPosition(fieldUnits(state, maxField));
      const options = { untameable: true, act: state.act, nodeType: 'battle' as const, difficulty: state.difficulty };
      return {
        ...state,
        screen: 'formation',
        eventBattle: { enemies: action.enemies, reward: action.reward, penalty: action.penalty },
        formation: { units: state.roster, initialField: initial, encounter: action.enemies, nodeId: '', options },
        log: ['进入事件战斗', ...state.log].slice(0, 20),
      };
    }

    case 'SPECIAL_CHOICE': {
      if (state.screen !== 'special') return state;
      const sp = state.map.specials[state.currentNodeId];
      if (!sp) return state;
      const reward = sp.rewards.find((r) => r.id === action.rewardId);
      if (!reward) return state;
      let next: GameState = { ...state };
      switch (reward.kind) {
        case 'gold': {
          // 金币宝藏
          next = { ...next, screen: 'map', postBattle: undefined, gold: next.gold + (reward.amount ?? 0) };
          break;
        }
        case 'item':
          if (reward.itemId) {
            next = { ...next, screen: 'map', postBattle: undefined, inventory: { ...next.inventory, [reward.itemId]: (next.inventory[reward.itemId] ?? 0) + (reward.amount ?? 1) } };
          }
          break;
        case 'evolve':
        case 'superevolve':
          if (!next.roster.some((u) => nextStage(u.speciesId))) return state;
          next = { ...next, screen: 'roster', specialPending: { kind: 'evolve', super: reward.kind === 'superevolve' } };
          break;
        case 'boost':
          if (next.roster.length === 0) return state;
          // 属性之赐：不计入属性提升上限
          next = { ...next, screen: 'roster', specialPending: { kind: 'boost', uid: '' } };
          break;
        case 'growthPoint':
          if (next.roster.length === 0) return state;
          // 成长之赐：全队+5成长点
          if (reward.id === 'growth_blessing') {
            next = {
              ...next,
              screen: 'map',
              postBattle: undefined,
              roster: next.roster.map((u) => ({ ...u, growthPoints: (u.growthPoints ?? 0) + 5 })),
              log: [`奇遇关：${reward.label} - 全队各获得 5 成长点`, ...next.log].slice(0, 20),
            };
            return next;
          }
          next = { ...next, screen: 'roster', specialPending: { kind: 'growthPoint', uid: '', amount: reward.amount ?? 3 } };
          break;
        case 'slotUnlock':
          if (next.roster.length === 0) return state;
          // 技能之赐：解锁所有技能槽
          next = { ...next, screen: 'roster', specialPending: { kind: 'shopSlotUnlock', uid: '', slot: 3, unlockAll: true } as any };
          break;
        case 'recruit':
          // 传奇招募：选择1只宠物，从传奇技能池随机1个技能教给它
          if (next.roster.length === 0) return state;
          next = { ...next, screen: 'growth-menu', specialPending: { kind: 'legendSkill', uid: '' } as any };
          break;
        case 'revive': {
          const deadPets = next.deadPets ?? [];
          if (deadPets.length === 0) return { ...next, screen: 'map', toast: { msg: '没有死亡宠物可复活', kind: 'warning' } };
          return { ...next, screen: 'revive-select' };
        }
        case 'custom':
          if (next.roster.length >= getMaxRoster(state.runMode)) return state;
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
        evolved = applyCurseToUnit(evolved, curses[Math.floor(rng() * 3)]);
      }
      const roster = state.roster.map((u) => (u.uid === action.uid ? evolved! : u));
      const log = state.specialPending.super
        ? [`超进化！${target.name} 进化成了 ${evolved.name}，但付出了代价`, ...state.log]
        : [`${target.name} 进化成了 ${evolved.name}！`, ...state.log];
      return { ...state, screen: 'map', roster, specialPending: undefined, log: log.slice(0, 20) };
    }

    case 'SPECIAL_TARGET': {
      if (state.specialPending?.kind === 'boost') {
        if (!state.roster.some((u) => u.uid === action.uid)) return state;
        return { ...state, specialPending: { kind: 'boost', uid: action.uid }, screen: 'boost' };
      }
      if (state.specialPending?.kind === 'growthPoint') {
        const target = state.roster.find((u) => u.uid === action.uid);
        if (!target) return state;
        const amount = state.specialPending.amount ?? 1;
        const updated = state.roster.map((u) =>
          u.uid === target.uid ? { ...u, growthPoints: (u.growthPoints ?? 0) + amount } : u,
        );
        const prevScreen = state.runMode === 'proficiency' ? 'map' : 'shop';
        return {
          ...state,
          roster: updated,
          specialPending: undefined,
          screen: prevScreen,
          toast: { msg: `${target.name} 获得 ${amount} 成长点`, kind: 'success' },
        };
      }
      if (state.specialPending?.kind === 'eventBoostHp' || state.specialPending?.kind === 'eventBoostSpd') {
        const target = state.roster.find((u) => u.uid === action.uid);
        if (!target) return state;
        const amount = state.specialPending.amount ?? 1;
        const isSpd = state.specialPending.kind === 'eventBoostSpd';
        const updated = state.roster.map((u) => {
          if (u.uid !== target.uid) return u;
          const bonus = { ...u.bonusStats };
          if (isSpd) {
            bonus.spd = (bonus.spd ?? 0) + amount;
          } else {
            bonus.hp = (bonus.hp ?? 0) + amount;
          }
          return recomputeStats({ ...u, bonusStats: bonus });
        });
        const statCn = isSpd ? '速度' : '生命';
        return {
          ...state,
          roster: updated,
          specialPending: undefined,
          screen: 'map',
          toast: { msg: `${target.name} 永久 +${amount} ${statCn}`, kind: 'success' },
        };
      }
      if (state.specialPending?.kind === 'eventResetGrowth') {
        const target = state.roster.find((u) => u.uid === action.uid);
        if (!target) return state;
        const hpBonus = target.bonusStats?.hp ?? 0;
        const spdBonus = target.bonusStats?.spd ?? 0;
        const returnedPoints = Math.floor(hpBonus / 2) + spdBonus;
        if (returnedPoints <= 0) {
          return { ...state, specialPending: undefined, screen: 'map', toast: { msg: '没有可重置的属性加成', kind: 'warning' } };
        }
        const updated = state.roster.map((u) => {
          if (u.uid !== target.uid) return u;
          return recomputeStats({
            ...u,
            growthPoints: (u.growthPoints ?? 0) + returnedPoints,
            bonusStats: { hp: 0, spd: 0 },
          });
        });
        return {
          ...state,
          roster: updated,
          specialPending: undefined,
          screen: 'map',
          toast: { msg: `${target.name} 成长点已重置（+${returnedPoints} 点）`, kind: 'success' },
        };
      }
      if (state.specialPending?.kind === 'eventSkillReplace') {
        const unit = state.roster.find((u) => u.uid === action.uid);
        if (!unit || unit.skills.length === 0) {
          return { ...state, specialPending: undefined, screen: 'map', toast: { msg: '该宠物没有可替换的技能', kind: 'warning' } };
        }
        const rng = createRng(state.seed + hashStr(unit.uid) + 500);
        const choices = getRandomSkillChoices(unit, 3, rng);
        if (choices.length === 0) {
          return { ...state, specialPending: undefined, screen: 'map', toast: { msg: '没有可学习的新技能', kind: 'warning' } };
        }
        return {
          ...state,
          specialPending: undefined,
          screen: 'skill-pick',
          skillReplace: { uid: unit.uid, replaceIdx: -1, choices },
        };
      }
      if (state.specialPending?.kind === 'shopSlotUnlock') {
        const target = state.roster.find((u) => u.uid === action.uid);
        if (!target) return state;
        const extraSlots = target.extraSkillSlots ?? 0;
        const isUnlockAll = !!(state.specialPending as any).unlockAll;
        // unlockAll 模式：一次性解锁所有剩余槽位，逐个选技能
        if (isUnlockAll && extraSlots < 3) {
          const updatedUnit = { ...target, extraSkillSlots: 3 as const };
          const nextSlot = (extraSlots + 3) as 3 | 4 | 5;
          const rng = createRng(state.seed + hashStr(action.uid) + 600 + (nextSlot === 4 ? 1 : nextSlot === 5 ? 2 : 0));
          const choices = getRandomSkillChoices(updatedUnit, 3, rng);
          if (choices.length === 0) {
            return { ...state, roster: state.roster.map((u) => u.uid === action.uid ? updatedUnit : u), specialPending: undefined, screen: 'growth-menu' };
          }
          return {
            ...state,
            roster: state.roster.map((u) => u.uid === action.uid ? updatedUnit : u),
            specialPending: { kind: 'shopSlotUnlock', uid: action.uid, slot: nextSlot, unlockAll: true } as any,
            screen: 'skill-pick',
            skillPick: { uid: action.uid, slot: nextSlot, choices },
          };
        }
        // 单槽解锁模式
        let nextSlot: 3 | 4 | 5;
        if (extraSlots < 1) {
          nextSlot = 3;
        } else if (extraSlots < 2) {
          nextSlot = 4;
        } else if (extraSlots < 3) {
          nextSlot = 5;
        } else {
          return { ...state, gold: state.gold + 50, specialPending: undefined, screen: 'map', toast: { msg: '技能槽已全部解锁，已退还50金币', kind: 'warning' } };
        }
        const updatedUnit = { ...target, extraSkillSlots: extraSlots + 1 };
        const rng = createRng(state.seed + hashStr(action.uid) + 600 + (nextSlot === 4 ? 1 : nextSlot === 5 ? 2 : 0));
        const choices = getRandomSkillChoices(updatedUnit, 3, rng);
        if (choices.length === 0) {
          return { ...state, roster: state.roster.map((u) => u.uid === action.uid ? updatedUnit : u), specialPending: undefined, screen: 'map' };
        }
        return {
          ...state,
          roster: state.roster.map((u) => u.uid === action.uid ? updatedUnit : u),
          specialPending: undefined,
          screen: 'skill-pick',
          skillPick: { uid: action.uid, slot: nextSlot, choices },
        };
      }
      if (state.specialPending?.kind === 'arena') {
        const unit = state.roster.find((u) => u.uid === action.uid);
        if (!unit) return state;
        const node = currentNode(state);
        const encounter = node ? state.map.encounter[node.id] : undefined;
        if (!encounter) return { ...state, screen: 'map', specialPending: undefined };
        const battle = createBattle([unit], encounter, state.seed + state.currentRow * 17, { untameable: true, act: state.act, nodeType: 'arena', difficulty: state.difficulty });
        return {
          ...state,
          screen: 'battle',
          specialPending: undefined,
          battle,
          log: [`${unit.name} 出战斗兽场！`, ...state.log].slice(0, 20),
        };
      }
      if (state.specialPending?.kind === 'arena3Exhibition') {
        const target = state.roster.find((u) => u.uid === action.uid);
        if (!target) return state;
        if (state.gold < 20) return { ...state, toast: { msg: '金币不足（需要20金币）', kind: 'warning' } };
        const updated = { ...target, growthPoints: (target.growthPoints ?? 0) + 5 };
        return {
          ...state,
          gold: state.gold - 20,
          roster: state.roster.map((u) => u.uid === action.uid ? updated : u),
          specialPending: undefined,
          arena3Pending: undefined,
          screen: 'map',
          toast: { msg: `${target.name} 获得 5 成长点`, kind: 'success' },
        };
      }
      if (state.specialPending?.kind === 'shopForget') {
        const target = state.roster.find((u) => u.uid === action.uid);
        if (!target) return state;
        const hpBonus = target.bonusStats?.hp ?? 0;
        const spdBonus = target.bonusStats?.spd ?? 0;
        const returnedPoints = Math.floor(hpBonus / 2) + spdBonus;
        if (returnedPoints <= 0) return { ...state, specialPending: undefined, screen: 'shop', toast: { msg: '没有可重置的属性加成', kind: 'warning' } };
        const updated = { ...target, growthPoints: (target.growthPoints ?? 0) + returnedPoints, bonusStats: { hp: 0, spd: 0 }, maxHp: target.maxHp - hpBonus, hp: Math.min(target.hp, target.maxHp - hpBonus), spd: target.spd - spdBonus };
        return { ...state, roster: state.roster.map((u) => u.uid === action.uid ? updated : u), specialPending: undefined, screen: 'shop', toast: { msg: `${target.name} 重置了成长点（+${returnedPoints} 点）`, kind: 'success' } };
      }
      if (state.specialPending?.kind === 'legendSkill') {
        const target = state.roster.find((u) => u.uid === action.uid);
        if (!target) return state;
        const rngLeg = createRng(state.seed + hashStr(action.uid) + 1000);
        const legChoices = getRandomLegendarySkillChoices(target, 1, rngLeg);
        if (legChoices.length === 0) return { ...state, specialPending: undefined, screen: 'growth-menu', toast: { msg: '没有可用的传奇技能', kind: 'warning' } };
        const skillId = legChoices[0];
        // 进入技能替换界面，让玩家选择替换哪个技能
        return {
          ...state,
          roster: state.roster.map((u) => u.uid === action.uid ? target : u),
          specialPending: { kind: 'legendSkill', uid: action.uid, skillId },
          screen: 'skill-pick',
          skillReplace: { uid: action.uid, replaceIdx: -1, choices: [skillId] },
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
      if (action.stat === 'hp') bonus.hp = (bonus.hp ?? 0) + 5;
      else bonus.spd = (bonus.spd ?? 0) + 2;
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
      if (state.roster.length >= getMaxRoster(state.runMode)) return state;
      if (!CUSTOM_PRESETS.some((p) => p === action.presetId)) return state;
      const rng = createRng(state.seed * 7 + state.act * 13 + state.roster.length * 3 + state.currentRow);
      const unit = makeCustomUnit(action.presetId, rng);
      return {
        ...state,
        screen: 'map',
        postBattle: undefined,
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
      if (state.screen !== 'map') return state;
      if (!action.free && inv <= 0) return state;
      const targetRow = state.currentNodeId === '' ? state.currentRow : state.currentRow + 1;
      const node = state.map.layers[targetRow]?.find((n) => n.id === action.nodeId);
      if (!node) return state;
      // 同层锁定：该层已有已访问节点时，不可改选其他节点
      const visitedInRow = (state.visitedNodeIds ?? []).filter((id) => state.map.layers[targetRow]?.some((n) => n.id === id) ?? false);
      if (visitedInRow.length > 0 && !visitedInRow.includes(action.nodeId)) return state;
      if (state.currentNodeId !== '') {
        const cur = state.map.layers[state.currentRow]?.find((n) => n.id === state.currentNodeId);
        if (!canStepTo(state.currentRow, cur?.col, node, state.map)) return state;
      }
      // 可跳过战斗/精英/斗兽场/车轮战/被侵蚀节点，守卫不可跳过，首领仅 free 跳关可跳
      if (node.type === 'guardian' || (!action.free && node.type === 'boss')) return state;
      const skippable = new Set(['battle', 'elite', 'arena', 'gauntlet', 'corrupted']);
      if (action.free) skippable.add('boss');
      if (!skippable.has(node.type)) return state;
      const base: GameState = {
        ...state,
        currentRow: targetRow,
        currentNodeId: node.id,
        inventory: { ...state.inventory, skip: action.free ? inv : inv - 1 },
      };
      const challenge = node.type === 'arena' || node.type === 'gauntlet';
      const corrupt = node.type === 'corrupted';
      let goldGain = 0;
      let rewards: RewardChoice[];
      if (challenge) {
        // 挑战节点跳关：直接领取 3 选 1 挑战奖励
        rewards = generateChallengeRewards(base, node.type as 'arena' | 'gauntlet');
      } else {
        // 金币：战斗 8 / 精英 16 / 侵蚀金币型翻倍 16（与关卡图鉴「跳关结算 8→16」一致）
        goldGain = node.type === 'elite' ? 16 : corrupt && node.corruptReward === 'gold' ? 16 : 8;
        // 食物翻倍仅在「被侵蚀 + 食物型」时生效，与真实战斗结算对齐（普通/精英节点不翻倍）
        rewards = generateRewards(base);
        if (corrupt && node.corruptReward === 'food') {
          rewards = applyCorruptFoodReward(rewards, base.seed * 11 + base.currentRow * 7);
        }
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
      // 事件战斗：用 eventBattle 的敌人；普通战斗：用 formation 的 encounter
      const enemySpecies = state.eventBattle ? state.eventBattle.enemies : f.encounter;
      const battle = createBattle(action.units, enemySpecies, state.seed + state.currentRow * 17, f.options);
      return { ...state, screen: 'battle', battle, formation: undefined };
    }

    case 'GAUNTLET_ORDER_CONFIRM': {
      if (state.currentNodeId === '' || action.units.length === 0) return state;
      const encounter = state.map.encounter[state.currentNodeId];
      if (!encounter) return state;
      const battle = createBattle(action.units, encounter, state.seed + state.currentRow * 17, { gauntlet: true, untameable: true, act: state.act, nodeType: 'gauntlet', difficulty: state.difficulty });
      return { ...state, screen: 'battle', battle, gauntletOrder: undefined, gauntletSize: undefined };
    }

    case 'PLAYER_SKILL': {
      if (!state.battle || state.battle.phase !== 'acting') return state;
      const battle = playerSkill(state.battle, action.actorUid, action.skillId, action.targetUid);
      let runStats = state.runStats;
      if (runStats) {
        const prevRound = runStats.lastBattleRound;
        const roundIncreased = battle.round > prevRound;
        runStats = {
          ...runStats,
          turnsPlayed: runStats.turnsPlayed + (roundIncreased ? 1 : 0),
          lastBattleRound: battle.round,
        };
      }
      return { ...state, battle, runStats };
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

    case 'GAUNTLET_SWAP': {
      if (!state.battle?.pendingSwap) return state;
      return { ...state, battle: performGauntletSwap(state.battle) };
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
      const battle = createBattle(pb.units, pb.encounter, seed, { ...pb.options, act: state.act });
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
        return { ...createInitialState(), screen: 'title', unlocks: state.unlocks ?? { ...DEFAULT_UNLOCKS } };
      }
      // 事件战斗：胜负确认后返回地图或成长点分配界面
      if (state.eventBattle) {
        const eb = state.eventBattle;
        let next: GameState = { ...state, battle: undefined, eventBattle: undefined, postBattle: undefined };
        // 更新事件战斗统计
        if (next.runStats) {
          const rs = { ...next.runStats, lastBattleRound: 0 };
          if (state.battle.phase === 'won') {
            rs.battlesWon += 1;
            if (eb.reward.kind === 'gold') rs.goldEarned += (eb.reward.amount ?? 0);
          } else {
            rs.battlesLost += 1;
          }
          next = { ...next, runStats: rs };
        }
        if (state.battle.phase === 'won') {
          // 胜利：应用奖励
          if (eb.reward.kind === 'gold') {
            next = { ...next, gold: next.gold + (eb.reward.amount ?? 0) };
          } else if (eb.reward.kind === 'food' && eb.reward.foodId) {
            next = { ...next, inventory: { ...next.inventory, [eb.reward.foodId]: (next.inventory[eb.reward.foodId] ?? 0) + 1 } };
          } else if (eb.reward.kind === 'hp') {
            const hpBonus = eb.reward.amount ?? 0;
            next = { ...next, roster: next.roster.map((u) => ({ ...u, maxHp: u.maxHp + hpBonus, hp: u.hp + hpBonus })) };
          }
          if (eb.bonusReward?.kind === 'food' && eb.bonusReward.foodId) {
            next = { ...next, inventory: { ...next.inventory, [eb.bonusReward.foodId]: (next.inventory[eb.bonusReward.foodId] ?? 0) + 1 } };
          }
          // 事件战斗胜利：同步 roster（HP/SPD/技能），阵亡保底1血不永久删除
          const battle = state.battle;
          const syncedRoster = next.roster.map((r) => {
            const b = [...battle.playerUnits, ...(battle.playerDown ?? [])].find((u) => u.uid === r.uid);
            if (!b) return r;
            if (b.hp <= 0) return { ...r, hp: Math.max(1, r.hp), statuses: [] };
            return { ...r, maxHp: b.maxHp, hp: b.hp, spd: b.spd, skills: b.skills, statuses: [] };
          });
          next = { ...next, roster: syncedRoster };
          // 战后回血 80%
          const healCfg = DIFFICULTY_CONFIG[state.difficulty ?? 'normal'];
          const healedRoster = next.roster.map((u) => ({ ...u, hp: Math.min(u.maxHp, u.hp + Math.round(u.maxHp * healCfg.healRatio)) }));
          next = { ...next, roster: healedRoster };
          // 成长点结算：远征模式事件战斗同样给成长点
          if (state.runMode === 'proficiency') {
            let killGp = 0;
            for (const eu of battle.enemyUnits) {
              if (eu.hp > 0) continue;
              const rank = getMonster(eu.speciesId).rank;
              killGp += rank === 2 ? 4 : 2;
            }
            const finalRoster = next.roster.map((u) => {
              const inBattle = [...battle.playerUnits, ...(battle.playerDown ?? [])].some((bu) => bu.uid === u.uid);
              const battleGp = inBattle ? 1 + killGp : 0;
              const gp = (u.growthPoints ?? 0) + 1 + battleGp;
              return { ...u, growthPoints: gp };
            });
            next = { ...next, roster: finalRoster };
          }
          // 跳转成长点分配界面
          next = { ...next, screen: state.runMode === 'proficiency' ? 'growth-menu' : 'map' };
          // 胜利 toast
          if (eb.reward.kind === 'gold') {
            next = { ...next, toast: { msg: `战斗胜利！获得 ${eb.reward.amount ?? 0} 金币`, kind: 'success' } };
          } else if (eb.reward.kind === 'food') {
            const f = eb.reward.foodId ? FOODS[eb.reward.foodId] : null;
            next = { ...next, toast: { msg: `战斗胜利！获得 ${f?.emoji ?? '🍖'} ${f?.name ?? '食物'}`, kind: 'success' } };
          } else if (eb.reward.kind === 'hp') {
            next = { ...next, toast: { msg: `战斗胜利！全体永久 +${eb.reward.amount ?? 0} 最大 HP`, kind: 'success' } };
          }
          next = { ...next, log: ['事件战斗胜利', ...next.log].slice(0, 20) };
        } else {
          // 失败：按 penalty 处理，返回地图
          next = { ...next, screen: 'map' };
          if (eb.penalty.goldLoss) {
            next = { ...next, gold: Math.max(0, next.gold - eb.penalty.goldLoss) };
          }
          if (eb.penalty.percent) {
            const pct = eb.penalty.percent;
            next = {
              ...next,
              roster: next.roster.map((u) => ({ ...u, hp: Math.max(1, u.hp - Math.round(u.maxHp * pct / 100)) })),
            };
          }
          if (eb.penalty.curseTarget && next.roster.length > 0) {
            const curseKinds: Array<'hpDown' | 'atkDown' | 'spdDown'> = ['hpDown', 'atkDown', 'spdDown'];
            const rc = curseKinds[Math.floor(Math.random() * curseKinds.length)];
            const ri = Math.floor(Math.random() * next.roster.length);
            next = { ...next, roster: next.roster.map((u, i) => i === ri ? applyCurseToUnit(u, rc) : u) };
          }
          // 失败 toast
          if (eb.penalty.goldLoss) {
            next = { ...next, toast: { msg: `战斗失败！失去 ${eb.penalty.goldLoss} 金币`, kind: 'error' } };
          } else if (eb.penalty.percent) {
            next = { ...next, toast: { msg: `战斗失败！全体受到 ${eb.penalty.percent}% 伤害`, kind: 'error' } };
          } else if (eb.penalty.curseTarget) {
            next = { ...next, toast: { msg: '战斗失败！随机宠物被诅咒了', kind: 'error' } };
          }
          next = { ...next, log: ['事件战斗失败', ...next.log].slice(0, 20) };
        }
        return next;
      }
      // 普通战斗：胜利或失败
      if (state.battle.phase === 'won') return resolveBattle(state, state.battle);
      if (state.battle.phase === 'lost') {
        const node = currentNode(state);
        // 斗兽场/车轮战/竞技场：失败不 Game Over，改为随机坏事件惩罚（宠物不会阵亡）
        if (node?.type === 'arena' || node?.type === 'gauntlet' || node?.type === 'arena3') {
          // 模拟战失败无惩罚，直接回地图（标记节点已访问不可重试）
          if (node.type === 'arena3' && state.arena3Pending?.mode === 'simulation') {
            const roster = state.roster.map((u) => ({ ...u, hp: Math.max(1, u.hp) }));
            const runStats = state.runStats ? { ...state.runStats, lastBattleRound: 0, battlesLost: state.runStats.battlesLost + 1 } : state.runStats;
            const visitedNodeIds = [...(state.visitedNodeIds ?? [])];
            if (!visitedNodeIds.includes(state.currentNodeId)) visitedNodeIds.push(state.currentNodeId);
            return { ...state, screen: 'map', battle: undefined, roster, runStats, arena3Pending: undefined, visitedNodeIds, toast: { msg: '模拟战挑战失败，未获得奖励', kind: 'warning' } };
          }
          const rng = createRng(state.seed * 97 + state.act * 29 + state.currentRow * 13 + state.battle.rngCount);
          const event = buildPunishmentEvent(rng);
          const roster = state.roster.map((u) => ({ ...u, hp: Math.max(1, u.hp) }));
          const runStats = state.runStats ? { ...state.runStats, lastBattleRound: 0, battlesLost: state.runStats.battlesLost + 1 } : state.runStats;
          return {
            ...state,
            screen: 'event',
            battle: undefined,
            roster,
            runStats,
            map: { ...state.map, events: { ...state.map.events, [state.currentNodeId]: event } },
            log: [`挑战失败：在「${node.label}」失利，承受代价`, ...state.log].slice(0, 20),
          };
        }
        const rsLoss = state.runStats ? { ...state.runStats, battlesLost: state.runStats.battlesLost + 1 } : state.runStats;
        // 熟练度远征模式：失败进入结算界面
        if (state.runMode === 'proficiency') {
          return { ...state, screen: 'proficiency-result', battle: undefined, runStats: rsLoss, proficiencyResult: 'lost' };
        }
        return { ...state, screen: 'gameover', battle: undefined, runStats: rsLoss };
      }
      return state;
    }

    case 'PICK_REWARD': {
      const reward = state.rewards.find((r) => r.id === action.rewardId);
      if (!reward) return state;
      let next: GameState = { ...state, screen: 'roster', rewards: [], postBattle: true };
      if (reward.kind === 'food' && reward.foodId) {
        const amt = reward.amount ?? 1;
        next = { ...next, inventory: { ...next.inventory, [reward.foodId]: (next.inventory[reward.foodId] ?? 0) + amt } };
        const fname = FOODS[reward.foodId]?.name ?? reward.foodId;
        next = { ...next, toast: { msg: `获得 ${fname} ×${amt}`, kind: 'success' } };
      } else if (reward.kind === 'heal') {
        next = healRoster(next, (reward.amount ?? 30) / 100);
      } else if (reward.kind === 'recruit' && reward.monsterId) {
        if (next.roster.length < getMaxRoster(state.runMode)) {
          const u = makeUnit(reward.monsterId, true, 0, false);
          next = { ...next, roster: [...next.roster, u], toast: { msg: `招募了 ${u.name}！`, kind: 'success' } };
        } else {
          const recruited = makeUnit(reward.monsterId, true, 0, false);
          next = {
            ...next,
            screen: 'tame-overflow',
            tameOverflow: [...(state.tameOverflow ?? []), recruited],
            tameOverflowReturn: 'roster',
          };
        }
      } else if (reward.kind === 'gold') {
        next = { ...next, gold: next.gold + (reward.amount ?? 0) };
      }
      return next;
    }

    case 'SET_FIELD': {
      const isBoss = !!state.map.boss[state.currentNodeId];
      const enemyCount = state.formation?.encounter?.length ?? 1;
      const maxField = isBoss ? (state.runMode === 'proficiency' ? FIELD_MAX : FIELD_MAX) : maxFieldForEnemy(enemyCount, state.runMode);
      const uids = action.uids.filter((uid) => state.roster.some((u) => u.uid === uid)).slice(0, maxField);
      return { ...state, field: uids };
    }

    case 'FUSE': {
      if (state.screen !== 'roster' && state.screen !== 'backpack') return state;
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
      const rs = state.runStats ? { ...state.runStats, fusions: state.runStats.fusions + 1 } : state.runStats;
      return {
        ...state,
        roster,
        field: state.field.filter((uid) => roster.some((u) => u.uid === uid)),
        log: [`融合！${materials.map((m) => m.name).join('+')} 与 ${primary.name} 融合成了 ${evolved.name}！`, ...state.log].slice(0, 20),
        runStats: rs,
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
      return overflow.length === 0 ? { ...next, screen: state.tameOverflowReturn ?? 'reward', tameOverflow: undefined, tameOverflowReturn: undefined } : next;
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
      return overflow.length === 0 ? { ...next, screen: state.tameOverflowReturn ?? 'reward', tameOverflow: undefined, tameOverflowReturn: undefined } : next;
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
      return overflow.length === 0 ? { ...next, screen: state.tameOverflowReturn ?? 'reward', tameOverflow: undefined, tameOverflowReturn: undefined } : next;
    }

    case 'TAME_OVERFLOW_JOIN': {
      const tame = state.tameOverflow?.find((u) => u.uid === action.tameUid);
      if (!tame) return state;
      if (state.roster.length >= getMaxRoster(state.runMode)) return state;
      const overflow = (state.tameOverflow ?? []).filter((u) => u.uid !== tame.uid);
      const next: GameState = {
        ...state,
        roster: [...state.roster, tame],
        tameOverflow: overflow,
        log: [`刚驯服的 ${tame.name} 加入队伍`, ...state.log].slice(0, 20),
      };
      return overflow.length === 0 ? { ...next, screen: state.tameOverflowReturn ?? 'reward', tameOverflow: undefined, tameOverflowReturn: undefined } : next;
    }

    case 'FUSE_IN_OVERFLOW': {
      if (state.screen !== 'tame-overflow') return state;
      const primary = state.roster.find((u) => u.uid === action.uid);
      if (!primary) return state;
      if (!nextStage(primary.speciesId)) return state;
      const need = fusionNeedCount(primary.speciesId);
      const same = state.roster.filter((u) => u.speciesId === primary.speciesId);
      if (same.length < need) return state;
      const evolved = fuseUnit(primary);
      if (!evolved) return state;
      const materials = same.filter((u) => u.uid !== primary.uid).slice(0, need - 1);
      const materialUids = materials.map((u) => u.uid);
      const roster = state.roster
        .filter((u) => !materialUids.includes(u.uid))
        .map((u) => (u.uid === primary.uid ? evolved : u));
      const overflow = (state.tameOverflow ?? []).filter((u) => roster.some((r) => r.uid === u.uid) || u.uid !== primary.uid);
      const rs = state.runStats ? { ...state.runStats, fusions: state.runStats.fusions + 1 } : state.runStats;
      const next: GameState = {
        ...state,
        roster,
        field: state.field.filter((uid) => roster.some((u) => u.uid === uid)),
        log: [`融合！${materials.map((m) => m.name).join('+')} 与 ${primary.name} 融合成了 ${evolved.name}！`, ...state.log].slice(0, 20),
        runStats: rs,
      };
      return overflow.length === 0 ? { ...next, screen: state.tameOverflowReturn ?? 'reward', tameOverflow: undefined, tameOverflowReturn: undefined } : { ...next, tameOverflow: overflow };
    }

    case 'SHOP_BUY': {
      // 支持食物与道具两种商品（价格不同）
      const food = FOODS[action.foodId];
      const item = ITEMS[action.foodId];
      if (!food && !item) return state;
      if (!(state.shopStock ?? []).includes(action.foodId)) return state;
      const rawPrice = food ? food.price : item.price;
      const priceCfg = DIFFICULTY_CONFIG[state.difficulty ?? 'normal'];
      const price = Math.round(rawPrice * priceCfg.shopPriceMult);
      if (state.gold < price) return state;
      if ((state.shopBoughtItems ?? []).includes(action.foodId)) return state;
      const rs = state.runStats ? { ...state.runStats, goldSpent: state.runStats.goldSpent + price } : state.runStats;
      return {
        ...state,
        gold: state.gold - price,
        shopBoughtItems: [...(state.shopBoughtItems ?? []), action.foodId],
        inventory: { ...state.inventory, [action.foodId]: (state.inventory[action.foodId] ?? 0) + 1 },
        runStats: rs,
      };
    }

    case 'SHOP_REST': {
      if (state.screen !== 'shop') return state;
      return {
        ...healRoster(state, 1),
        screen: 'shop',
        toast: { msg: '全队已回满血！', kind: 'success' },
        log: ['立即休整，全队回满血（诅咒未解除）', ...state.log].slice(0, 20),
      };
    }

    case 'SHOP_REFRESH': {
      if (state.screen !== 'shop') return state;
      const count = state.shopRefreshCount ?? 0;
      if (count >= 3) return { ...state, toast: { msg: '刷新次数已用尽', kind: 'error' } };
      const cost = Math.round((5 + count * 5) * (DIFFICULTY_CONFIG[state.difficulty ?? 'normal'].shopPriceMult));
      if (state.gold < cost) return state;
      // 重新生成商店库存
      const currentNode = state.map.layers[state.currentRow]?.find((n) => n.id === state.currentNodeId);
      if (!currentNode) return state;
      const rng = createRng(state.seed * 7919 + state.currentRow * 104729 + hashStr(currentNode.id) + count + 1);
      const pool = [...Object.keys(FOODS).filter((id) => FOODS[id].shop !== false), ...Object.keys(ITEMS).filter((id) => ITEMS[id].price > 0 && ITEMS[id].shop !== false)];
      const newStock = shuffle(rng, pool).slice(0, 4);
      return {
        ...state,
        gold: state.gold - cost,
        shopStock: newStock,
        shopRefreshCount: count + 1,
        shopBoughtItems: [],
        log: [`刷新商店商品（花费 ${cost} 金币）`, ...state.log].slice(0, 20),
      };
    }

    case 'REST_HEAL': {
      const screen = state.runMode === 'proficiency' ? 'map' : 'roster';
      return { ...healRoster(state, 1), screen };
    }

    case 'REST_FUSION_MODE': {
      if (state.screen !== 'rest') return state;
      if (state.roster.length < 2) return { ...state, toast: { msg: '需要至少2只宠物才能融合', kind: 'warning' } };
      return { ...state, screen: 'rest-fusion', fusionMainUid: undefined, fusionSubUid: undefined, fusionSubSkills: undefined, fusionLearnSkill: undefined };
    }

    case 'REST_FUSION_SET_MAIN': {
      if (state.screen !== 'rest-fusion') return state;
      const unit = state.roster.find((u) => u.uid === action.uid);
      if (!unit) return state;
      // 点击已选主宠 → 取消选择
      if (state.fusionMainUid === action.uid) {
        return { ...state, fusionMainUid: undefined, fusionLearnSkill: undefined, fusionReplaceIdx: undefined };
      }
      // 点击已选副宠 → 移到主宠位，副宠清空
      if (state.fusionSubUid === action.uid) {
        return { ...state, fusionMainUid: action.uid, fusionSubUid: undefined, fusionLearnSkill: undefined, fusionReplaceIdx: undefined };
      }
      return { ...state, fusionMainUid: action.uid, fusionLearnSkill: undefined, fusionReplaceIdx: undefined };
    }

    case 'REST_FUSION_SET_SUB': {
      if (state.screen !== 'rest-fusion') return state;
      const unit = state.roster.find((u) => u.uid === action.uid);
      if (!unit) return state;
      // 点击已选副宠 → 取消选择
      if (state.fusionSubUid === action.uid) {
        return { ...state, fusionSubUid: undefined, fusionLearnSkill: undefined, fusionReplaceIdx: undefined };
      }
      // 点击已选主宠 → 移到副宠位，主宠清空
      if (state.fusionMainUid === action.uid) {
        return { ...state, fusionSubUid: action.uid, fusionMainUid: undefined, fusionLearnSkill: undefined, fusionReplaceIdx: undefined };
      }
      return { ...state, fusionSubUid: action.uid, fusionLearnSkill: undefined, fusionReplaceIdx: undefined };
    }

    case 'REST_FUSION_CONFIRM': {
      if (state.screen !== 'rest-fusion') return state;
      const main = state.roster.find((u) => u.uid === state.fusionMainUid);
      const sub = state.roster.find((u) => u.uid === state.fusionSubUid);
      if (!main || !sub || main.uid === sub.uid) return state;
      // 基础属性 50% 继承 + 成长点 30% 继承
      const subBase = getMonster(sub.speciesId);
      const hpGain = Math.round(subBase.baseHp * 0.5);
      const spdGain = Math.round(subBase.baseSpd * 0.5);
      const gpGain = Math.round((sub.growthPoints ?? 0) * 0.3);
      const newMaxHp = main.maxHp + hpGain;
      const updatedMain = {
        ...main,
        maxHp: newMaxHp,
        hp: Math.min(main.hp + hpGain, newMaxHp),
        spd: main.spd + spdGain,
        growthPoints: (main.growthPoints ?? 0) + gpGain,
        bonusStats: { hp: (main.bonusStats?.hp ?? 0) + hpGain, spd: (main.bonusStats?.spd ?? 0) + spdGain },
      };
      // 计算副宠可学技能（排除主宠已学）
      const owned = new Set(updatedMain.skills);
      const subSkills = sub.skills.filter((id) => !owned.has(id));
      // 移除副宠
      const roster = state.roster.filter((u) => u.uid !== sub.uid);
      // 无技能可学 → 直接完成
      if (subSkills.length === 0) {
        return {
          ...state,
          roster: roster.map((u) => (u.uid === main.uid ? updatedMain : u)),
          screen: 'map',
          fusionMainUid: undefined,
          fusionSubUid: undefined,
          fusionSubSkills: undefined,
          fusionLearnSkill: undefined,
          fusionReplaceIdx: undefined,
          toast: { msg: `${main.name} 继承了 ${sub.name} 的基础属性（生命+${hpGain} 速度+${spdGain} 成长点+${gpGain}）`, kind: 'success' },
        };
      }
      return {
        ...state,
        roster: roster.map((u) => (u.uid === main.uid ? updatedMain : u)),
        screen: 'rest-fusion-skill',
        fusionSubSkills: subSkills,
        fusionLearnSkill: undefined,
        fusionReplaceIdx: undefined,
        toast: { msg: `${main.name} 继承了 ${sub.name} 的基础属性（生命+${hpGain} 速度+${spdGain} 成长点+${gpGain}），选择要学习的技能`, kind: 'success' },
      };
    }

    case 'REST_FUSION_SET_LEARN': {
      if (state.screen !== 'rest-fusion-skill') return state;
      // 点击已选技能 → 取消选择
      if (state.fusionLearnSkill === action.skillId) {
        return { ...state, fusionLearnSkill: undefined, fusionReplaceIdx: undefined };
      }
      return { ...state, fusionLearnSkill: action.skillId, fusionReplaceIdx: undefined };
    }

    case 'REST_FUSION_SELECT_REPLACE': {
      if (state.screen !== 'rest-fusion-skill') return state;
      return { ...state, fusionReplaceIdx: action.replaceIdx };
    }

    case 'REST_FUSION_SKILL': {
      if (state.screen !== 'rest-fusion-skill') return state;
      const unit = state.roster.find((u) => u.uid === state.fusionMainUid);
      if (!unit) return state;
      const learnSkill = action.skillId;
      const replaceIdx = action.replaceIdx ?? state.fusionReplaceIdx;
      const maxSlots = getMaxSkillSlots(unit);
      let newSkills: string[];
      let replacedIdx: number | undefined;
      if (replaceIdx !== undefined && replaceIdx < unit.skills.length) {
        // 替换指定位置
        newSkills = [...unit.skills];
        newSkills[replaceIdx] = learnSkill;
        replacedIdx = replaceIdx;
      } else if (unit.skills.length >= maxSlots) {
        // 无空槽且未指定替换 → 追加到末尾（替换最后一个）
        newSkills = [...unit.skills];
        newSkills[newSkills.length - 1] = learnSkill;
        replacedIdx = newSkills.length - 1;
      } else {
        // 有空槽 → 追加
        newSkills = [...unit.skills, learnSkill];
      }
      // 清除被替换技能的强化等级
      let updatedUnit = updateUnitSkills(unit, newSkills);
      if (replacedIdx !== undefined) {
        const { [replacedIdx]: _removed, ...restEnhancements } = unit.skillEnhancements ?? {};
        updatedUnit = { ...updatedUnit, skillEnhancements: Object.keys(restEnhancements).length > 0 ? restEnhancements as Record<number, number> : undefined };
      }
      return {
        ...state,
        roster: state.roster.map((u) => (u.uid === unit.uid ? updatedUnit : u)),
        screen: 'map',
        fusionMainUid: undefined,
        fusionSubUid: undefined,
        fusionSubSkills: undefined,
        fusionLearnSkill: undefined,
        fusionReplaceIdx: undefined,
      };
    }

    case 'REST_FUSION_CANCEL': {
      return {
        ...state,
        screen: 'map',
        fusionMainUid: undefined,
        fusionSubUid: undefined,
        fusionSubSkills: undefined,
        fusionLearnSkill: undefined,
        fusionReplaceIdx: undefined,
      };
    }

    case 'REVIVE': {
      if (state.screen !== 'revive-select') return state;
      const dead = (state.deadPets ?? []).find((u) => u.uid === action.uid);
      if (!dead) return state;
      const ratio = Math.max(0, Math.min(1, action.ratio));
      const revived: Unit = {
        ...dead,
        hp: Math.max(1, Math.round(dead.maxHp * ratio)),
        maxHp: ratio >= 1 ? dead.maxHp : Math.round(dead.maxHp * ratio),
        spd: ratio >= 1 ? dead.spd : Math.max(1, Math.round(dead.spd * ratio)),
        statuses: [],
        skillUses: undefined,
        skillCooldowns: undefined,
        acted: false,
      };
      const roster = [...state.roster, revived];
      const deadPets = (state.deadPets ?? []).filter((u) => u.uid !== action.uid);
      return {
        ...state,
        roster,
        deadPets,
        screen: 'map',
        toast: { msg: `${revived.name} 复活了！（保留 ${Math.round(ratio * 100)}% 属性）`, kind: 'success' },
      };
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
      // 熟练度远征模式：层数递增
      if (state.runMode === 'proficiency') {
        const nextLayer = (state.currentLayer ?? 1) + 1;
        const nextRow = state.currentRow + 1;
        if (nextRow < state.map.layers.length) {
          return { ...state, screen: 'map', currentLayer: nextLayer, chestResult: undefined, gauntletOrder: undefined, gauntletSize: undefined, postBattle: undefined, skipSelecting: false, scoutSelecting: false, scoutResult: undefined };
        }
        return { ...state, screen: 'proficiency-result', proficiencyResult: 'won' };
      }
      if (bossCleared(state)) {
        if (state.act >= 3) return { ...state, screen: 'victory' };
        return { ...state, screen: 'inter_act' };
      }
      const nextRow = state.currentRow + 1;
      if (nextRow < state.map.layers.length) {
        return { ...state, screen: 'map', chestResult: undefined, gauntletOrder: undefined, gauntletSize: undefined, postBattle: undefined, skipSelecting: false, scoutSelecting: false, scoutResult: undefined };
      }
      return { ...state, screen: 'victory' };
    }

    case 'INTER_ACT_CONTINUE': {
      const act = state.act + 1;
      const map = generateMap(state.seed, act, state.difficulty);
      const dep = map.layers[0][0];
      const runStats = state.runStats ? {
        ...state.runStats,
        lastBattleRound: 0,
        actSnapshot: {
          battlesWon: state.runStats.battlesWon,
          battlesLost: state.runStats.battlesLost,
          goldEarned: state.runStats.goldEarned,
          goldSpent: state.runStats.goldSpent,
          petsTamed: state.runStats.petsTamed,
          petsLost: state.runStats.petsLost,
          turnsPlayed: state.runStats.turnsPlayed,
          tameAttempts: state.runStats.tameAttempts,
          圣果Used: state.runStats.圣果Used,
          fusions: state.runStats.fusions,
          shopVisits: state.runStats.shopVisits,
        },
      } : undefined;
      // 通关第 1 幕：解锁熟练度远征模式
      let unlocks = state.unlocks;
      if (state.act === 1 && unlocks && !unlocks.proficiencyUnlocked) {
        unlocks = { ...unlocks, proficiencyUnlocked: true };
      }
      const base: GameState = {
        ...state,
        act,
        map,
        currentRow: 0,
        currentNodeId: dep ? dep.id : '',
        screen: 'map',
        runStats,
        unlocks,
        gauntletOrder: undefined,
        gauntletSize: undefined,
        postBattle: undefined,
        visitedNodeIds: dep ? [dep.id] : [],
        visitedWatchtowers: [],
        skipSelecting: false,
        scoutSelecting: false,
        scoutResult: undefined,
      };
      if (dep) return enterNode(base, dep, 0, '');
      return base;
    }

    case 'BACK_TO_MAP': {
      const prevRow = state.formation?.prevRow ?? state.gauntletPrevRow;
      const prevNodeId = state.formation?.prevNodeId ?? state.gauntletPrevNodeId;
      let nextState: GameState = {
        ...state,
        screen: 'map',
        currentRow: prevRow ?? state.currentRow,
        currentNodeId: prevNodeId ?? state.currentNodeId,
        formation: undefined,
        gauntletOrder: undefined,
        gauntletSize: undefined,
        gauntletPrevRow: undefined,
        gauntletPrevNodeId: undefined,
      };
      if (state.growthItemPending) {
        const itemId = state.growthItemPending;
        nextState = { ...nextState, inventory: { ...nextState.inventory, [itemId]: (nextState.inventory[itemId] ?? 0) + 1 }, growthItemPending: undefined, specialPending: undefined };
      }
      return nextState;
    }

    case 'RETRY':
      return { ...createInitialState(), screen: 'starter', unlocks: state.unlocks ?? { ...DEFAULT_UNLOCKS } };

    case 'CLEAR_TOAST':
      return { ...state, toast: undefined };

    case 'SHOW_TOAST':
      return { ...state, toast: { msg: action.msg, kind: action.kind ?? 'info' } };

    case 'ACHIEVEMENTS':
      return { ...state, screen: 'achievements', unlocks: action.unlocks ?? state.unlocks };

    case 'SELECT_DIFFICULTY':
      return { ...state, screen: 'difficulty-select' };

    case 'SELECT_DIFFICULTY_BACK':
      return { ...state, screen: 'difficulty-select' };

    case 'SET_PRERUN_CONFIG':
      return { ...state, difficulty: action.difficulty, relics: action.relic ? [action.relic] : [], screen: 'starter' };

    case 'START_PROFICIENCY': {
      return { ...state, screen: 'proficiency-select', seed: action.seed, saveSlot: action.saveSlot, runMode: 'proficiency' };
    }

    case 'START_PROFICIENCY_PICKED': {
      const s1 = makeUnit(action.starterId ?? 'momo', true, 0, false);
      const s2 = makeUnit(action.companionId ?? 'lulu', true, 1, false);
      const roster = [s1, s2];
      const map = generateGrowthMap(action.seed);
      const firstNode = map.layers[0]?.[0];
      return {
        screen: 'map',
        seed: action.seed,
        act: 1,
        map,
        currentRow: 0,
        currentNodeId: firstNode?.id ?? '',
        roster,
        field: roster.map((u) => u.uid),
        inventory: {},
        gold: 30,
        rewards: [],
        log: ['进入成长远征模式'],
        visitedWatchtowers: [],
        visitedNodeIds: firstNode ? [firstNode.id] : [],
        runMode: 'proficiency',
        currentLayer: 1,
        proficiencyStats: { totalProficiency: 0, totalGrowthPoints: 0, battlesWon: 0, battlesLost: 0, kills: 0 },
        runStats: { battlesWon: 0, battlesLost: 0, goldEarned: 0, goldSpent: 0, petsTamed: 0, petsLost: 0, turnsPlayed: 0, tameAttempts: 0, 圣果Used: 0, fusions: 0, shopVisits: 0, lastBattleRound: 0, actSnapshot: { battlesWon: 0, battlesLost: 0, goldEarned: 0, goldSpent: 0, petsTamed: 0, petsLost: 0, turnsPlayed: 0, tameAttempts: 0, 圣果Used: 0, fusions: 0, shopVisits: 0 } },
        difficulty: 'normal',
        unlocks: { ...DEFAULT_UNLOCKS },
        relics: [],
        saveSlot: action.saveSlot,
      } as GameState;
    }

    case 'PROF_GROWTH_APPLY': {
      return {
        ...state,
        roster: state.roster.map((u) => (u.uid === action.uid ? action.updatedUnit : u)),
      };
    }

    case 'PROF_GROWTH_MENU': {
      return { ...state, screen: 'growth-menu' };
    }

    case 'PROF_SLOT_PICK': {
      // 替换技能模式：替换指定位置的技能
      if (state.skillReplace && state.skillReplace.replaceIdx >= 0) {
        const unit = state.roster.find((u) => u.uid === state.skillReplace!.uid);
        if (!unit) return state;
        const idx = state.skillReplace.replaceIdx;
        if (idx < 0 || idx >= unit.skills.length) return state;
        const newSkills = [...unit.skills];
        newSkills[idx] = action.skillId;
        // 清除被替换技能的强化等级
        const { [idx]: _removed, ...restEnhancements } = unit.skillEnhancements ?? {};
        const updatedUnit = { ...updateUnitSkills(unit, newSkills), skillEnhancements: Object.keys(restEnhancements).length > 0 ? restEnhancements as Record<number, number> : undefined };
        return {
          ...state,
          roster: state.roster.map((u) => (u.uid === unit.uid ? updatedUnit : u)),
          screen: 'growth-menu',
          skillReplace: undefined,
          skillPick: undefined,
        };
      }
      // 技能槽解锁模式：追加新技能
      if (!state.skillPick) return state;
      const unit = state.roster.find((u) => u.uid === state.skillPick!.uid);
      if (!unit) return state;
      const updatedUnit = { ...unit, skills: [...unit.skills, action.skillId] };
      // unlockAll 模式：检查是否还有剩余槽位需要解锁
      const unlockAllPending = (state.specialPending as any)?.unlockAll && state.specialPending?.kind === 'shopSlotUnlock';
      if (unlockAllPending) {
        const curExtra = updatedUnit.extraSkillSlots ?? 0;
        const curSkillCount = updatedUnit.skills.length;
        // 已解锁3个额外槽位且技能数=2+3=5，全部完成
        if (curExtra >= 3 && curSkillCount >= 5) {
          return {
            ...state,
            roster: state.roster.map((u) => (u.uid === unit.uid ? updatedUnit : u)),
            screen: 'growth-menu',
            skillPick: undefined,
            specialPending: undefined,
          };
        }
        // 下一个槽位
        const nextSlot = (curSkillCount - 2 + 3) as 3 | 4 | 5;
        const rng = createRng(state.seed + hashStr(unit.uid) + 600 + (nextSlot === 4 ? 1 : nextSlot === 5 ? 2 : 0));
        const choices = getRandomSkillChoices(updatedUnit, 3, rng);
        if (choices.length === 0) {
          return {
            ...state,
            roster: state.roster.map((u) => (u.uid === unit.uid ? updatedUnit : u)),
            screen: 'growth-menu',
            skillPick: undefined,
            specialPending: undefined,
          };
        }
        return {
          ...state,
          roster: state.roster.map((u) => (u.uid === unit.uid ? updatedUnit : u)),
          screen: 'skill-pick',
          skillPick: { uid: unit.uid, slot: nextSlot, choices },
        };
      }
      return {
        ...state,
        roster: state.roster.map((u) => (u.uid === unit.uid ? updatedUnit : u)),
        screen: 'growth-menu',
        skillPick: undefined,
      };
    }

    case 'PROF_SLOT_CANCEL': {
      return { ...state, screen: 'growth-menu', skillPick: undefined, skillReplace: undefined };
    }

    case 'PROF_SKILL_REPLACE_START': {
      const unit = state.roster.find((u) => u.uid === action.uid);
      if (!unit) return state;
      const gp = unit.growthPoints ?? 0;
      if (gp < REROLL_COST) return state;
      if (unit.skills.length === 0) return state;
      // 扣除替换技能成本
      const updatedUnit = { ...unit, growthPoints: gp - REROLL_COST };
      // 生成3个随机技能（排除已学）
      const count = state.skillReplaceCount ?? 0;
      const rng = createRng(state.seed + hashStr(unit.uid) + 700 + count * 137);
      const choices = getRandomSkillChoices(updatedUnit, 3, rng);
      if (choices.length === 0) {
        return { ...state, roster: state.roster.map((u) => (u.uid === unit.uid ? updatedUnit : u)), screen: 'growth-menu', skillReplaceCount: count + 1 };
      }
      return {
        ...state,
        roster: state.roster.map((u) => (u.uid === unit.uid ? updatedUnit : u)),
        screen: 'skill-pick',
        skillReplace: { uid: unit.uid, replaceIdx: -1, choices },
        skillPick: undefined,
        skillReplaceCount: count + 1,
      };
    }

    case 'PROF_SKILL_REPLACE_SELECT': {
      if (!state.skillReplace) return state;
      const replaceIdx = action.replaceIdx;
      return {
        ...state,
        skillReplace: { ...state.skillReplace, replaceIdx },
      };
    }

    case 'PROF_SKILL_ENHANCE': {
      const unit = state.roster.find((u) => u.uid === action.uid);
      if (!unit) return state;
      const enhanced = applySkillEnhance(unit, action.slotIndex);
      if (!enhanced) return state;
      return {
        ...state,
        roster: state.roster.map((u) => (u.uid === unit.uid ? enhanced : u)),
      };
    }

    case 'PROF_SKILL_ENHANCE_STONE': {
      const unit = state.roster.find((u) => u.uid === action.uid);
      if (!unit) return state;
      // 检查是否有技能强化石
      const stoneCount = state.inventory['skill_enhance_stone'] ?? 0;
      if (stoneCount <= 0) {
        return { ...state, toast: { msg: '需要「技能强化石」才能强化技能', kind: 'warning' } };
      }
      const enhanced = applySkillEnhanceStone(unit, action.slotIndex);
      if (!enhanced) return state;
      // 消耗技能强化石
      return {
        ...state,
        roster: state.roster.map((u) => (u.uid === unit.uid ? enhanced : u)),
        inventory: { ...state.inventory, skill_enhance_stone: stoneCount - 1 },
      };
    }

    case 'PROF_SKILL_ENHANCE_RESET': {
      const unit = state.roster.find((u) => u.uid === action.uid);
      if (!unit) return state;
      // 检查是否有还原石
      const resetStoneCount = state.inventory['reset_stone'] ?? 0;
      if (resetStoneCount <= 0) {
        return { ...state, toast: { msg: '需要「还原石」才能重置技能强化', kind: 'warning' } };
      }
      const result = applySkillEnhanceReset(unit, action.slotIndex);
      if (!result) return state;
      // 消耗还原石
      return {
        ...state,
        roster: state.roster.map((u) => (u.uid === unit.uid ? result.newUnit : u)),
        inventory: { ...state.inventory, reset_stone: resetStoneCount - 1 },
      };
    }

    case 'PROF_TRANSFER_GROWTH': {
      const source = state.roster.find((u) => u.uid === action.sourceUid);
      const target = state.roster.find((u) => u.uid === action.targetUid);
      if (!source || !target) return state;
      if (action.amount <= 0) return state;
      
      const sourceGp = source.growthPoints ?? 0;
      if (sourceGp < action.amount) {
        return { ...state, toast: { msg: '成长点不足', kind: 'warning' } };
      }
      
      const fee = Math.ceil(action.amount * 0.5); // 50% 手续费，向上取整
      const actualGain = action.amount - fee;
      
      const newSource = { ...source, growthPoints: sourceGp - action.amount };
      const newTarget = { ...target, growthPoints: (target.growthPoints ?? 0) + actualGain };
      
      return {
        ...state,
        roster: state.roster.map((u) => {
          if (u.uid === source.uid) return newSource;
          if (u.uid === target.uid) return newTarget;
          return u;
        }),
        toast: { msg: `成功转移 ${action.amount} 点成长点（手续费 ${fee} 点，目标获得 ${actualGain} 点）`, kind: 'success' },
      };
    }

    case 'PROF_SLOT_UNLOCK': {
      const unit = state.roster.find((u) => u.uid === action.uid);
      if (!unit) return state;
      const gp = unit.growthPoints ?? 0;
      const cost = action.slot === 3 ? SLOT3_COST : action.slot === 4 ? SLOT4_COST : SLOT5_COST;
      if (gp < cost) return state;
      const extraSlots = unit.extraSkillSlots ?? 0;
      if (action.slot === 3 && extraSlots >= 1) return state;
      if (action.slot === 4 && (extraSlots < 1 || extraSlots >= 2)) return state;
      if (action.slot === 5 && (extraSlots < 2 || extraSlots >= 3)) return state;
      // 创建新 unit 对象（不可变更新）
      const updatedUnit = { ...unit, growthPoints: gp - cost, extraSkillSlots: extraSlots + 1 };
      // 生成3个随机技能（使用完整UID哈希确保每只宠物不同）
      const rng = createRng(state.seed + hashStr(unit.uid) + (action.slot === 4 ? 1000 : action.slot === 5 ? 2000 : 0));
      const choices = getRandomSkillChoices(updatedUnit, 3, rng);
      if (choices.length === 0) {
        return { ...state, roster: state.roster.map((u) => (u.uid === unit.uid ? updatedUnit : u)), screen: 'growth-menu' };
      }
      return {
        ...state,
        roster: state.roster.map((u) => (u.uid === unit.uid ? updatedUnit : u)),
        screen: 'skill-pick',
        skillPick: { uid: unit.uid, slot: action.slot, choices },
      };
    }

    case 'PROF_SHOP_BUY': {
      const itemId = action.itemId;
      const shopPrices: Record<string, number> = {
        book_small: 12, book_medium: 22, book_large: 30, slot_unlock: 50,
        forget_stone: 30, pet_recruit: 20, heal_potion: 30,
        reset_stone: 25, skill_enhance_stone: 40,
      };
      const price = shopPrices[itemId] ?? 0;
      if (price <= 0) return state;
      if (state.gold < price) return state;
      let next: GameState = { ...state, gold: state.gold - price, shopBought: true };
      const boughtItems = [...(state.shopBoughtItems ?? []), itemId];
      next = { ...next, shopBoughtItems: boughtItems };
      if (itemId === 'pet_recruit') {
        // 队伍已满时不扣金币
        if (next.roster.length >= getMaxRoster(state.runMode)) {
          return { ...state, toast: { msg: '队伍已满，无法招募', kind: 'warning' } };
        }
        const rng = createRng(state.seed * 1111 + Date.now());
        const pool = ['momo', 'lulu', 'fifi', 'kiki', 'mimi', 'pipi'];
        const pick = pool[Math.floor(rng() * pool.length)];
        next = { ...next, roster: [...next.roster, makeUnit(pick, true, 0, false)], toast: { msg: `招募了 ${getMonster(pick).name}！`, kind: 'success' } };
      } else {
        next = { ...next, inventory: { ...next.inventory, [itemId]: (next.inventory[itemId] ?? 0) + 1 } };
        const itemNames: Record<string, string> = { book_small: '成长之书（小）', book_large: '成长之书（大）', slot_unlock: '技能槽解锁', forget_stone: '遗忘之石', heal_potion: '治疗圣水', reset_stone: '还原石', skill_enhance_stone: '技能强化石' };
        next = { ...next, toast: { msg: `获得了 ${itemNames[itemId] ?? itemId}，请在背包中使用`, kind: 'info' } };
      }
      return next;
    }

    case 'PROF_SHOP_REFRESH': {
      const refreshCount = state.shopRefreshCount ?? 0;
      if (refreshCount >= 3) return state;
      const cost = [5, 10, 15][refreshCount] ?? 15;
      if (state.gold < cost) return state;
      const rng = createRng(state.seed * 7919 + (state.currentRow) * 104729 + refreshCount * 31337);
      const allItems = ['heal_potion', 'book_small', 'book_medium', 'book_large', 'slot_unlock', 'forget_stone', 'pet_recruit', 'reset_stone', 'skill_enhance_stone'];
      const newStock = shuffle(rng, allItems).slice(0, 4);
      return {
        ...state,
        gold: state.gold - cost,
        shopStock: newStock,
        shopRefreshCount: refreshCount + 1,
        shopBoughtItems: [],
        log: [`刷新商店商品（花费 ${cost} 金币）`, ...state.log].slice(0, 20),
      };
    }

    case 'PROF_SHOP_EFFECT': {
      const pending = state.specialPending;
      if (!pending) return state;
      const uid = action.uid;
      const target = state.roster.find((u) => u.uid === uid);
      if (!target) return state;
      if (pending.kind === 'shopGrantGrowthPoint') {
        const updated = state.roster.map((u) => u.uid === uid ? { ...u, growthPoints: (u.growthPoints ?? 0) + pending.amount } : u);
        const returnScreen = state.growthItemPending ? 'backpack' as const : 'shop' as const;
        return { ...state, roster: updated, specialPending: undefined, growthItemPending: undefined, screen: returnScreen, toast: { msg: `${target.name} 获得 ${pending.amount} 成长点`, kind: 'success' } };
      }
      if (pending.kind === 'shopStatBoost') {
        return { ...state, specialPending: { kind: 'boost', uid }, growthItemPending: undefined };
      }
      if (pending.kind === 'shopSlotUnlock') {
        // 技能之赐（unlockAll）：解锁所有槽位
        if ((pending as any).unlockAll) {
          const extraSlots = target.extraSkillSlots ?? 0;
          const slotsToAdd = 3 - extraSlots; // 最多解锁到3个额外槽位
          if (slotsToAdd <= 0) {
            const returnScreen = state.growthItemPending ? 'backpack' as const : 'shop' as const;
            return { ...state, gold: state.gold + 50, specialPending: undefined, growthItemPending: undefined, screen: returnScreen, toast: { msg: '技能槽已全部解锁，已退还50金币', kind: 'warning' } };
          }
          const updated = { ...target, extraSkillSlots: 3 };
          // 为每个新解锁的槽位选技能
          const rng = createRng(state.seed + hashStr(uid) + 800);
          let current = updated;
          for (let i = 0; i < slotsToAdd; i++) {
            const slotNum = (extraSlots + i + 3) as 3 | 4 | 5;
            const choices = getRandomSkillChoices(current, 3, rng);
            if (choices.length > 0) {
              return { ...state, roster: state.roster.map((u) => u.uid === uid ? current : u), specialPending: undefined, growthItemPending: undefined, screen: 'skill-pick', skillPick: { uid, slot: slotNum, choices } };
            }
          }
          const returnScreen = state.growthItemPending ? 'backpack' as const : 'shop' as const;
          return { ...state, roster: state.roster.map((u) => u.uid === uid ? current : u), specialPending: undefined, growthItemPending: undefined, screen: returnScreen, toast: { msg: `已为 ${target.name} 解锁所有技能槽`, kind: 'success' } };
        }
        // 普通解锁：自动检测下一个可用槽位
        const extraSlots = target.extraSkillSlots ?? 0;
        let nextSlot: 3 | 4 | 5;
        if (extraSlots < 1) {
          nextSlot = 3;
        } else if (extraSlots < 2) {
          nextSlot = 4;
        } else if (extraSlots < 3) {
          nextSlot = 5;
        } else {
          const returnScreen = state.growthItemPending ? 'backpack' as const : 'shop' as const;
          return { ...state, gold: state.gold + 50, specialPending: undefined, growthItemPending: undefined, screen: returnScreen, toast: { msg: '技能槽已全部解锁，已退还50金币', kind: 'warning' } };
        }
        const updated = { ...target, extraSkillSlots: extraSlots + 1 };
        const rng = createRng(state.seed + hashStr(uid) + 900 + (nextSlot === 4 ? 1 : nextSlot === 5 ? 2 : 0));
        const choices = getRandomSkillChoices(updated, 3, rng);
        if (choices.length === 0) {
          const returnScreen = state.growthItemPending ? 'backpack' as const : 'shop' as const;
          return { ...state, roster: state.roster.map((u) => u.uid === uid ? updated : u), specialPending: undefined, growthItemPending: undefined, screen: returnScreen };
        }
        return { ...state, roster: state.roster.map((u) => u.uid === uid ? updated : u), specialPending: undefined, growthItemPending: undefined, screen: 'skill-pick', skillPick: { uid, slot: nextSlot, choices } };
      }
      if (pending.kind === 'shopForget') {
        // 重置成长点：返还所有属性加成
        const hpBonus = target.bonusStats?.hp ?? 0;
        const spdBonus = target.bonusStats?.spd ?? 0;
        const returnedPoints = Math.floor(hpBonus / 2) + spdBonus;
        if (returnedPoints <= 0) {
          const returnScreen = state.growthItemPending ? 'backpack' as const : 'shop' as const;
          return { ...state, specialPending: undefined, growthItemPending: undefined, screen: returnScreen, toast: { msg: '没有可重置的属性加成', kind: 'warning' } };
        }
        const updated = { ...target, growthPoints: (target.growthPoints ?? 0) + returnedPoints, bonusStats: { hp: 0, spd: 0 }, maxHp: target.maxHp - hpBonus, hp: Math.min(target.hp, target.maxHp - hpBonus), spd: target.spd - spdBonus };
        const returnScreen = state.growthItemPending ? 'backpack' as const : 'shop' as const;
        return { ...state, roster: state.roster.map((u) => u.uid === uid ? updated : u), specialPending: undefined, growthItemPending: undefined, screen: returnScreen, toast: { msg: `${target.name} 重置了成长点（+${returnedPoints} 点）`, kind: 'success' } };
      }
      if (pending.kind === 'legendSkill') {
        // 传奇招募：从传奇技能池随机1个，进入技能替换界面让玩家选择替换哪个
        const rngLeg = createRng(state.seed + hashStr(uid) + 1000);
        const legChoices = getRandomLegendarySkillChoices(target, 1, rngLeg);
        if (legChoices.length === 0) {
          const returnScreen = state.growthItemPending ? 'backpack' as const : 'growth-menu' as const;
          return { ...state, specialPending: undefined, growthItemPending: undefined, screen: returnScreen, toast: { msg: '没有可用的传奇技能', kind: 'warning' } };
        }
        const skillId = legChoices[0];
        // 跳转 skill-pick 界面，让玩家选择替换哪个技能
        return {
          ...state,
          specialPending: { kind: 'legendSkill', uid, skillId },
          growthItemPending: undefined,
          screen: 'skill-pick',
          skillReplace: { uid, replaceIdx: -1, choices: [skillId] },
        };
      }
      return state;
    }

    case 'USE_GROWTH_ITEM': {
      const itemId = action.itemId;
      const count = state.inventory[itemId] ?? 0;
      if (count <= 0) return state;
      // 技能强化石：不立即扣库存，由 PROF_SKILL_ENHANCE_STONE 确认时才扣
      if (itemId === 'skill_enhance_stone') {
        return { ...state, screen: 'enhance-stone', toast: { msg: '选择一只宠物强化技能', kind: 'info' } };
      }
      let next: GameState = { ...state, inventory: { ...state.inventory, [itemId]: count - 1 }, growthItemPending: itemId };
      if (itemId === 'heal_potion') {
        next = healRoster(next, 0.5);
        return { ...next, growthItemPending: undefined, toast: { msg: '全队回复 50% 生命', kind: 'success' } };
      }
      if (itemId === 'book_small') {
        return { ...next, screen: 'growth-menu', specialPending: { kind: 'shopGrantGrowthPoint' as const, uid: '', amount: 1 }, toast: { msg: '选择一只宠物获得 1 成长点', kind: 'info' } };
      }
      if (itemId === 'book_medium') {
        return { ...next, screen: 'growth-menu', specialPending: { kind: 'shopGrantGrowthPoint' as const, uid: '', amount: 2 }, toast: { msg: '选择一只宠物获得 2 成长点', kind: 'info' } };
      }
      if (itemId === 'book_large') {
        return { ...next, screen: 'growth-menu', specialPending: { kind: 'shopGrantGrowthPoint' as const, uid: '', amount: 3 }, toast: { msg: '选择一只宠物获得 3 成长点', kind: 'info' } };
      }
      if (itemId === 'slot_unlock') {
        return { ...next, screen: 'growth-menu', specialPending: { kind: 'shopSlotUnlock' as const, uid: '', slot: 3 as 3 | 4 | 5 }, toast: { msg: '选择一只宠物解锁技能槽', kind: 'info' } };
      }
      if (itemId === 'forget_stone') {
        return { ...next, screen: 'growth-menu', specialPending: { kind: 'shopForget' as const, uid: '' }, toast: { msg: '选择一只宠物重置成长点', kind: 'info' } };
      }
      if (itemId === 'reset_stone') {
        return { ...state, screen: 'enhance-reset', toast: { msg: '选择一只宠物重置技能强化', kind: 'info' } };
      }
      return next;
    }

    case 'CANCEL_GROWTH_ITEM': {
      const itemId = state.growthItemPending;
      if (!itemId) return state;
      return {
        ...state,
        inventory: { ...state.inventory, [itemId]: (state.inventory[itemId] ?? 0) + 1 },
        specialPending: undefined,
        growthItemPending: undefined,
        screen: 'backpack',
        toast: { msg: '已取消使用', kind: 'info' },
      };
    }

    case 'ARENA3_MODE': {
      const mode = action.mode;
      const node = currentNode(state);
      if (!node) return state;
      if (mode === 'simulation') {
        // 模拟战：镜像战斗，用玩家阵容的克隆作为敌人
        if (state.roster.length === 0) return state;
        // 模拟战：全部宠物强制上场
        const allUnits = state.roster.map((u, i) => ({ ...u, row: (i < 3 ? 'front' : 'back') as 'front' | 'back', column: (i % 3) as 0 | 1 | 2 }));
        const initial = allUnits;
        const options = { act: 1, nodeType: 'arena3' as const, difficulty: state.difficulty, untameable: true, layer: state.currentLayer ?? 1, mirrorUnits: state.roster };
        return { ...state, screen: 'formation', arena3Pending: { mode: 'simulation' }, formation: { units: state.roster, initialField: initial, encounter: [{ speciesId: 'momo' }], nodeId: node.id, options, prevRow: state.currentRow, prevNodeId: state.currentNodeId, forceAllUnits: true } };
      }
      if (mode === 'challenge') {
        // 挑战赛：3精英
        if (state.roster.length === 0) return state;
        const rng = createRng(state.seed * 3331 + (state.currentLayer ?? 0) * 7919);
        const encounter = getGrowthArenaEncounter(state.currentLayer ?? 1, rng);
        const maxField = maxFieldForEnemy(encounter.length, state.runMode);
        const initial = autoPosition(fieldUnits(state, maxField));
        const options = { act: 1, nodeType: 'arena3' as const, difficulty: state.difficulty, untameable: true, layer: state.currentLayer ?? 1 };
        return { ...state, screen: 'formation', arena3Pending: { mode: 'challenge' }, formation: { units: state.roster, initialField: initial, encounter, nodeId: node.id, options, prevRow: state.currentRow, prevNodeId: state.currentNodeId } };
      }
      if (mode === 'exhibition') {
        // 表演赛：选1只宠物+5成长点（需20金币）
        if (state.gold < 20) return { ...state, toast: { msg: '金币不足（需要20金币）', kind: 'warning' } };
        return { ...state, screen: 'roster', specialPending: { kind: 'arena3Exhibition', uid: '' } };
      }
      return state;
    }

    case 'TITLE':
      return { ...createInitialState(), screen: 'title', unlocks: state.unlocks ?? { ...DEFAULT_UNLOCKS } };

    default:
      return state;
  }
}

export function checkBossNode(state: GameState): boolean {
  return state.map.boss[state.currentNodeId] !== undefined;
}
