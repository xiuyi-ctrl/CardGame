import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { computeRunRating, emptyMainRating, mapChallengeTarget, type MainRatingStats } from '../src/game/rating';
import { createInitialState, gameReducer, migrateGameState } from '../src/game/state/reducer';
import { canStepTo, generateMap, type GameState, type NodeType } from '../src/game/state/game';
import { detectUnlocks, parseDualSave } from '../src/ui/persistence';

function fresh() {
  return gameReducer(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'lulu', seed: 42 });
}
function finishedRating(challenges = true): MainRatingStats {
  const rating = emptyMainRating();
  for (const act of [1, 2, 3]) {
    rating.acts[act] = { totalRows: 10, completedRows: Array.from({ length: 10 }, (_, i) => i), bossDefeated: true, challengeTarget: 5 };
    for (let i = 0; i < 3; i++) rating.battles[`${act}:${i}`] = {
      act, type: challenges ? 'elite' : 'battle', won: true, rounds: 4, participants: 5, deaths: 0, enemyCount: 2,
    };
  }
  return rating;
}
function rated(rating = finishedRating()) {
  const state = fresh();
  return { ...state, act: 3, screen: 'victory' as const, runStats: { ...state.runStats!, rating } };
}
function terminal(type: NodeType = 'battle', won = true): GameState {
  const state = fresh();
  const node = { id: 'score-test', type, label: '测试节点', col: 1 };
  const battle = createBattle(state.roster.slice(0, 2), [{ speciesId: 'momo' }], 43);
  return { ...state, currentNodeId: node.id, currentRow: 0, screen: 'battle',
    map: { ...state.map, layers: [[node]], encounter: { [node.id]: [{ speciesId: 'momo' }] }, boss: type === 'boss' ? { [node.id]: [{ speciesId: 'momo' }] } : {} },
    battle: { ...battle, phase: won ? 'won' : 'lost', round: 5 } };
}

describe('主模式四维评分', () => {
  it('完整通关、无阵亡、各幕挑战达标且效率合格时100分S', () => {
    const rating = computeRunRating(rated())!;
    expect([rating.score, rating.grade, rating.legacy]).toEqual([100, 'S', false]);
    expect(rating.dimensions.map(d => d.points)).toEqual([50, 25, 15, 10]);
  });

  it('只走普通战也能85分A，不强制捕捉、囤钱或凑满队伍', () => {
    const state = rated(finishedRating(false));
    const rating = computeRunRating(state)!;
    expect([rating.score, rating.grade]).toEqual([85, 'A']);
    const changed = { ...state, roster: [], gold: 0, runStats: { ...state.runStats, rating: state.runStats.rating,
      goldEarned: 9999, goldSpent: 9999, petsTamed: 0, tameAttempts: 999, fusions: 99 } };
    expect(computeRunRating(changed)).toEqual(rating);
    const unlocked = detectUnlocks(state.unlocks!, rating.grade, [], 'normal', state.runStats);
    expect(unlocked.difficulties).toContain('hard');
  });

  it('阵亡按参战人次计，效率逐场封顶，挑战每幕最多5分', () => {
    const ledger = finishedRating();
    ledger.battles = { one: { act: 1, type: 'gauntlet', won: true, rounds: 12, enemyCount: 3, participants: 50, deaths: 2 } };
    const score = computeRunRating(rated(ledger))!;
    expect(score.dimensions.map(d => d.points)).toEqual([50, 20, 3, 10]);
    ledger.battles.one.rounds = 24;
    expect(computeRunRating(rated(ledger))!.dimensions[3].points).toBe(5);
    for (let i = 0; i < 10; i++) ledger.battles[`extra-${i}`] = { ...ledger.battles.one, rounds: 1, deaths: 0 };
    const extra = computeRunRating(rated(ledger))!;
    expect(extra.dimensions[2].points).toBe(5);
    expect(extra.score).toBeLessThanOrEqual(100);
    expect(extra.dimensions.every(d => d.score <= 100 && d.points <= d.weight)).toBe(true);
  });

  it('进入第三幕或布阵本身不加进度；未击败第一幕首领最高C，未通关最高B', () => {
    const empty = fresh();
    expect(computeRunRating({ ...empty, act: 3, currentRow: 99, screen: 'formation' })!.score).toBe(0);
    const ledger = finishedRating();
    ledger.acts['3'].bossDefeated = false;
    ledger.acts['3'].completedRows.pop();
    const lost = computeRunRating({ ...rated(ledger), screen: 'gameover' })!;
    expect(lost.score).toBeGreaterThan(90);
    expect(lost.grade).toBe('B');
    expect(lost.note).toContain('未完整通关');
    ledger.acts['1'].bossDefeated = false;
    expect(computeRunRating(rated(ledger))!.grade).toBe('C');
  });

  it('旧存档不补新统计，保留旧公式、解锁和最高评级', () => {
    const legacy = createInitialState();
    legacy.act = 3;
    legacy.roster = Array.from({ length: 7 }, () => makeUnit('momo', true, 0, false));
    Object.assign(legacy.runStats!, { battlesWon: 10, battlesLost: 0, tameAttempts: 10, petsTamed: 10, goldEarned: 100, goldSpent: 70, turnsPlayed: 90 });
    legacy.unlocks = { ...legacy.unlocks!, bestGrade: 'S', difficulties: ['normal', 'hard'] };
    const loaded = migrateGameState(legacy)!;
    expect(loaded.runStats!.rating).toBeUndefined();
    expect(computeRunRating(loaded)).toMatchObject({ score: 100, grade: 'S', legacy: true, note: '旧存档沿用旧评分' });
    expect(loaded.unlocks).toEqual(legacy.unlocks);
    expect(gameReducer(fresh(), { type: 'LOAD_GAME', state: legacy }).runStats!.rating).toBeUndefined();
  });
});

describe('评分统计入口', () => {
  it('确认战斗一次性记录真实阵亡，捕获补员不抵消阵亡，读档与重复确认不刷分', () => {
    const state = terminal('elite');
    state.battle!.playerUnits[0].hp = 0;
    state.battle!.pendingTame = [makeUnit('coal', true, 2, false)];
    const settled = gameReducer(state, { type: 'BATTLE_END_CONFIRM' });
    expect(settled.runStats!.rating!.battles['1:score-test']).toMatchObject({ participants: 2, deaths: 1, rounds: 5, won: true });
    expect(settled.runStats!.petsLost).toBe(1);
    expect(settled.runStats!.turnsPlayed).toBe(5);
    expect(settled.runStats!.rating!.acts['1'].completedRows).toEqual([0]);
    expect(gameReducer(settled, { type: 'BATTLE_END_CONFIRM' })).toBe(settled);
    const parsed = parseDualSave(JSON.stringify(settled))!.main!;
    expect(parsed.runStats!.rating).toEqual(settled.runStats!.rating);
  });

  it('车轮战去重参战者、排除未上场替补，失败不给挑战分但保留战斗损失', () => {
    const state = terminal('gauntlet', false);
    const [first, second] = state.battle!.playerUnits;
    state.battle = { ...state.battle!, playerUnits: [{ ...second, hp: 0 }], playerDown: [{ ...first, hp: 0 }],
      playerBench: [makeUnit('coal', true, 2, false)], gauntlet: { total: 4, current: 2 } };
    const settled = gameReducer(state, { type: 'BATTLE_END_CONFIRM' });
    expect(settled.runStats!.rating!.battles['1:score-test']).toMatchObject({ participants: 2, deaths: 2, won: false, enemyCount: 4 });
    expect(settled.runStats!.petsLost).toBe(2);
    expect(computeRunRating(settled)!.dimensions[2].points).toBe(0);
  });

  it('节点胜利才记首领通关；同幕过渡保留账本，首次开局无免费分', () => {
    expect(computeRunRating(fresh())!.score).toBe(0);
    const state = terminal('boss');
    const settled = gameReducer(state, { type: 'BATTLE_END_CONFIRM' });
    expect(settled.runStats!.rating!.acts['1'].bossDefeated).toBe(true);
    const next = gameReducer({ ...settled, screen: 'inter_act' }, { type: 'INTER_ACT_CONTINUE' });
    expect(next.runStats!.rating).toEqual(settled.runStats!.rating);
    expect(next.act).toBe(2);
  });

  it('取消布阵不计进度，合法跳关只加进度、不算挑战胜场', () => {
    const state = fresh();
    const moved = gameReducer(state, { type: 'MOVE', nodeId: state.map.layers[0][0].id });
    const cancelled = gameReducer(moved, { type: 'BACK_TO_MAP' });
    expect(cancelled.runStats!.rating!.acts).toEqual({});
    const target = { id: 'skip-target', type: 'elite' as const, label: '精英', col: 1 };
    const map = { ...state.map, layers: [[target]], encounter: { [target.id]: [{ speciesId: 'momo' }] } };
    const skipped = gameReducer({ ...state, map, inventory: { skip: 1 } }, { type: 'USE_SKIP', nodeId: target.id });
    expect(skipped.screen).toBe('reward');
    expect(skipped.runStats!.rating!.acts['1'].completedRows).toEqual([0]);
    expect(skipped.runStats!.rating!.battles).toEqual({});
  });

  it('下达或取消指令不记回合，实际结束一轮才计一次', () => {
    const state = terminal();
    state.battle = { ...state.battle!, phase: 'acting', round: 1 };
    state.battle.enemyUnits.forEach(unit => { unit.hp = 500; unit.maxHp = 500; unit.skills = []; unit.acted = true; });
    const actor = state.battle.playerUnits[0];
    const skill = actor.skills[0];
    const queued = gameReducer(state, { type: 'PLAYER_SKILL', actorUid: actor.uid, skillId: skill, targetUid: state.battle.enemyUnits[0].uid });
    expect(queued.runStats!.turnsPlayed).toBe(0);
    expect(gameReducer(queued, { type: 'END_TURN' }).runStats!.turnsPlayed).toBe(1);
  });
});

describe('挑战分机会检查', () => {
  it('两地区各幕600张地图的挑战目标不高于合法路线提供的机会', () => {
    for (const region of ['mixed', 'emerald_forest'] as const) for (const act of [1, 2, 3]) for (let seed = 1; seed <= 100; seed++) {
      const map = generateMap(seed, act, 'normal', region);
      let previous = map.layers[0].map(node => ({ node, value: 0 }));
      for (let row = 1; row < map.layers.length; row++) previous = map.layers[row].filter(node => node.type !== 'keydoor' && !map.disabled?.[node.id]).map(node => {
        const parents = previous.filter(parent => canStepTo(row - 1, parent.node.col, node, map));
        const points = ['elite', 'corrupted', 'guardian'].includes(node.type) ? 2 : ['arena', 'gauntlet'].includes(node.type) ? 3 : 0;
        return { node, value: parents.length ? Math.max(...parents.map(p => p.value)) + points : -100 };
      });
      const available = Math.max(...previous.map(p => p.value));
      expect(mapChallengeTarget(map), `${region} act${act} seed${seed}`).toBe(Math.min(5, Math.max(0, available)));
    }
  });
  it('挑战机会不足时按可达上限折算；没有挑战节点时击败首领后才给该幕满分', () => {
    const ledger = finishedRating(false);
    ledger.acts['1'].challengeTarget = 4;
    ledger.battles = { a: { act: 1, type: 'elite', won: true, rounds: 4, participants: 2, deaths: 0, enemyCount: 2 },
      b: { act: 1, type: 'elite', won: true, rounds: 4, participants: 2, deaths: 0, enemyCount: 2 } };
    expect(computeRunRating(rated(ledger))!.dimensions[2].points).toBe(5);
    ledger.acts['2'].challengeTarget = 0;
    expect(computeRunRating(rated(ledger))!.dimensions[2].points).toBe(10);
    ledger.acts['2'].bossDefeated = false;
    expect(computeRunRating(rated(ledger))!.dimensions[2].points).toBe(5);
  });
});
