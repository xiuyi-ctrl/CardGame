import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MAIN_REGIONS, isMainRegionId } from '../src/game/data/regions';
import { MAIN_BASE_POOL, MAIN_EVO1_POOL, MAIN_EVO2_POOL, STARTER_GROUP_1, STARTER_GROUP_2, getMonster } from '../src/game/data/monsters';
import { ACT_BOSS_POOLS, generateMap, generateRewards, generateChallengeRewards, nextStage } from '../src/game/state/game';
import { createInitialState, gameReducer, migrateGameState } from '../src/game/state/reducer';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { CURRENT_SAVE_VERSION, parseDualSave } from '../src/ui/persistence';

describe('主模式地区基础配置', () => {
  it('混合地区使用原池及顺序，未补入原传奇池缺少的棘刺王', () => {
    const mixed = MAIN_REGIONS.mixed;
    expect(mixed.basePool).toBe(MAIN_BASE_POOL);
    expect(mixed.evo1Pool).toBe(MAIN_EVO1_POOL);
    expect(mixed.evo2Pool).toBe(MAIN_EVO2_POOL);
    expect(mixed.evo2Pool).not.toContain('sisi_god');
    expect(mixed.starters).toBe(STARTER_GROUP_1);
    expect(mixed.companions).toBe(STARTER_GROUP_2);
    expect(mixed.bossPools).toBe(ACT_BOSS_POOLS);
    expect(mixed.bossPools).toEqual({
      1: ['boss_vine', 'boss_crab', 'boss_dark'],
      2: ['boss_moss', 'boss_ghost', 'boss_golem'],
      3: ['boss_fire', 'boss_dragon', 'boss_demon'],
    });
    expect(mixed.bossCount).toEqual([2, 3]);
  });

  it('林地7条基础进化链含传火分支共23种形态，未夹带其他地区物种', () => {
    const forest = MAIN_REGIONS.emerald_forest;
    expect(forest.basePool.map(id => getMonster(id).name)).toEqual(['迅迅', '泡泡', '铁墩', '刺刺', '咪咪', '光苔球', '火狐']);
    expect(forest.evo1Pool.map(id => getMonster(id).name)).toEqual(['迅牙', '泡泡将', '铁卫', '棘尾', '蟒影', '光苔兽', '幻尾火狐', '传火狐']);
    expect(forest.evo2Pool.map(id => getMonster(id).name)).toEqual(['迅天', '泡泡龙神', '铁壁神', '棘刺王', '深渊蛇王', '日炎灵', '九尾炎尊', '传火狐尊']);
    expect(new Set([...forest.basePool, ...forest.evo1Pool, ...forest.evo2Pool]).size).toBe(23);
    forest.basePool.forEach((id, index) => {
      expect(nextStage(id)).toBe(forest.evo1Pool[index]);
      expect(nextStage(forest.evo1Pool[index])).toBe(forest.evo2Pool[index]);
      expect(nextStage(forest.evo2Pool[index])).toBeUndefined();
    });
    [forest.basePool, forest.evo1Pool, forest.evo2Pool].forEach((pool, index) => {
      pool.forEach(id => expect(getMonster(id).rank).toBe(index + 1));
    });
  });

  it('林地开局与首领配置符合方案，第三幕仅配置原过渡池', () => {
    const forest = MAIN_REGIONS.emerald_forest;
    expect(forest.starters).toEqual(['momo', 'lulu', 'fire_fox']);
    expect(forest.companions).toEqual(['kiki', 'mimi', 'pipi']);
    [...forest.starters, ...forest.companions].forEach(id => expect(forest.basePool).toContain(id));
    expect(forest.bossPools).toEqual({ 1: ['boss_vine'], 2: ['boss_moss'], 3: ACT_BOSS_POOLS[3] });
    Object.values(forest.bossPools).flat().forEach(id => expect(getMonster(id).rank).toBe(4));
    expect(forest.bossCount).toEqual([1, 1]);
  });

  it('只识别明确配置的地区标识', () => {
    expect(isMainRegionId('mixed')).toBe(true);
    expect(isMainRegionId('emerald_forest')).toBe(true);
    for (const value of [undefined, null, '', 'forest', 'toString', {}, 1]) expect(isMainRegionId(value)).toBe(false);
  });
});

describe('地区存档兼容', () => {
  it('当前默认状态为混合地区，林地新局保留所选地区并生成对应地图', () => {
    expect(createInitialState().region).toBe('mixed');
    const state = gameReducer({ ...createInitialState(), region: 'emerald_forest' }, {
      type: 'START_RUN', starterId: 'momo', companionId: 'kiki', seed: 42,
    });
    expect(state.region).toBe('emerald_forest');
    expect(state.map).toEqual(generateMap(42, 1, 'normal', 'emerald_forest'));
  });

  it('旧存档缺失地区补为混合，不重生成地图、战斗、奖励及锁定招募候选', () => {
    const initial = createInitialState();
    const unit = makeUnit('momo', true, 0, false);
    const state = {
      ...initial, screen: 'reward' as const, seed: 42, act: 2, region: undefined,
      map: generateMap(42, 2), roster: [unit], lastFormation: { [unit.uid]: { row: 'front' as const, column: 2 as const } },
      battle: createBattle([unit], [{ speciesId: 'kiki' }], 42),
      rewards: [{ id: 'recruit', label: '招募', desc: '已锁定', kind: 'recruit' as const, recruitCandidates: ['fire_fox', 'light_moss'] }],
      pendingRecruitRewardId: 'recruit',
    };
    const original = JSON.parse(JSON.stringify(state));
    const parsed = parseDualSave(JSON.stringify(state))!.main!;
    expect(parsed.region).toBe('mixed');
    for (const key of ['map', 'battle', 'rewards', 'roster', 'lastFormation', 'unlocks'] as const) expect(parsed[key]).toEqual(original[key]);
    expect(parsed.pendingRecruitRewardId).toBe('recruit');
    expect(parsed.seed).toBe(42);
    expect(parsed.act).toBe(2);
    expect(state.region).toBeUndefined();
  });

  it.each(['mixed', 'emerald_forest'] as const)('地区 %s 经双模式存档及LOAD_GAME保留，不重抽奖励', region => {
    const state = { ...createInitialState(), region };
    state.rewards = generateRewards(state);
    const parsed = parseDualSave(JSON.stringify({ saveVersion: CURRENT_SAVE_VERSION, main: state, proficiency: null }));
    const loaded = gameReducer(createInitialState(), { type: 'LOAD_GAME', state: parsed!.main! });
    expect(loaded.region).toBe(region);
    expect(loaded.map).toEqual(state.map);
    expect(loaded.rewards).toEqual(state.rewards);
    expect(migrateGameState(loaded)).toEqual(loaded);
  });

  it('未知地区拒绝载入，不静默重置生态', () => {
    expect(migrateGameState({ ...createInitialState(), region: 'unknown' })).toBeNull();
    expect(migrateGameState({ ...createInitialState(), region: null })).toBeNull();
  });

  it('熟练度开局和旧存档迁移不启用主模式地区', () => {
    const select = gameReducer({ ...createInitialState(), region: 'emerald_forest' }, { type: 'START_PROFICIENCY', seed: 42 });
    expect(select.region).toBeUndefined();
    const started = gameReducer(select, { type: 'START_PROFICIENCY_PICKED', seed: 42, starterId: 'momo', companionId: 'lulu' });
    expect(started.region).toBeUndefined();
    const parsed = parseDualSave(JSON.stringify({ ...started, region: undefined }));
    expect(parsed!.proficiency!.runMode).toBe('proficiency');
    expect(parsed!.proficiency!.region).toBeUndefined();
  });
});

describe('混合地区确定性基线', () => {
  it('27组地图、战后奖励和挑战奖励符合品阶与人数进度改版后的确定性快照', () => {
    const results = [];
    for (const difficulty of ['normal', 'hard', 'nightmare'] as const) {
      for (const act of [1, 2, 3]) {
        for (const seed of [1, 42, 20261022]) {
          const map = generateMap(seed, act, difficulty);
          const state = { ...createInitialState(), seed, act, difficulty, map };
          results.push({ map, rewards: generateRewards(state), challenge: generateChallengeRewards(state, 'gauntlet') });
        }
      }
    }
    // 含2026-10-27十类事件、七项奇遇及第四种侵蚀；旧存档中的地图不会重生成。
    expect(createHash('sha256').update(JSON.stringify(results)).digest('hex')).toBe('a216f1bc8c945070a82a08a381670bbcd95027648efad5bd91065f2f0481cb81');
  });
});
