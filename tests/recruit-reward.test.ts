import { describe, expect, it } from 'vitest';
import { generateChallengeRewards, generateRewards, type GameState } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { BASE_POOL, EVO1_POOL } from '../src/game/data/monsters';
import { makeUnit } from '../src/game/core/battle';

function rewardState(seed = 42, act = 1): GameState {
  const state = { ...createInitialState(), screen: 'reward' as const, seed, act, currentRow: 0 };
  return { ...state, rewards: generateRewards(state) };
}

describe('主模式战后招募二选一', () => {
  it('预生成两个不同候选，第一幕只有一阶，文案不泄露物种', () => {
    for (let seed = 0; seed < 100; seed++) {
      const state = rewardState(seed);
      const reward = state.rewards.find((item) => item.kind === 'recruit')!;
      expect(reward.monsterId).toBeUndefined();
      expect(reward.recruitCandidates).toHaveLength(2);
      expect(new Set(reward.recruitCandidates).size).toBe(2);
      expect(reward.recruitCandidates!.every((id) => BASE_POOL.includes(id))).toBe(true);
      expect(reward.desc).toBe('从两位候选伙伴中选择一位');
      expect(generateRewards(state)).toEqual(state.rewards);
    }
  });

  it('后两幕开放二阶，候选不受现有队伍影响，满员仍可招募', () => {
    for (const act of [2, 3]) {
      let advanced = 0;
      for (let seed = 0; seed < 200; seed++) {
        const state = rewardState(seed, act);
        const candidates = state.rewards.find((item) => item.kind === 'recruit')!.recruitCandidates!;
        expect(candidates.every((id) => [...BASE_POOL, ...EVO1_POOL].includes(id))).toBe(true);
        advanced += candidates.filter((id) => EVO1_POOL.includes(id)).length;
        const full = { ...state, roster: Array.from({ length: 8 }, () => makeUnit('momo', true, 0, false)) };
        expect(generateRewards(full)).toEqual(state.rewards);
      }
      const expected = act === 2 ? 0.3 : 0.6;
      expect(advanced / 400).toBeGreaterThan(expected - 0.1);
      expect(advanced / 400).toBeLessThan(expected + 0.1);
    }
  });

  it('需先揭晓才能确认，读档保持锁定候选，确认只领取一个', () => {
    const state = rewardState();
    const reward = state.rewards.find((item) => item.kind === 'recruit')!;
    const monsterId = reward.recruitCandidates![0];
    expect(gameReducer(state, { type: 'PICK_REWARD', rewardId: reward.id, monsterId })).toBe(state);
    const opened = gameReducer(state, { type: 'PICK_REWARD', rewardId: reward.id });
    expect(opened.roster).toEqual(state.roster);
    expect(opened.rewards).toEqual([reward]);
    const loaded = gameReducer(createInitialState(), { type: 'LOAD_GAME', state: JSON.parse(JSON.stringify(opened)) });
    expect(loaded.rewards).toEqual([reward]);
    expect(loaded.pendingRecruitRewardId).toBe(reward.id);
    expect(gameReducer(loaded, { type: 'PICK_REWARD', rewardId: reward.id, monsterId: 'boss_vine' })).toBe(loaded);
    const after = gameReducer(loaded, { type: 'PICK_REWARD', rewardId: reward.id, monsterId });
    expect(after.roster).toHaveLength(state.roster.length + 1);
    expect(after.roster.at(-1)?.speciesId).toBe(monsterId);
    expect(after.screen).toBe('roster');
    expect(after.postBattle).toBe(true);
    expect(after.rewards).toEqual([]);
    expect(gameReducer(after, { type: 'PICK_REWARD', rewardId: reward.id, monsterId })).toBe(after);
  });

  it('揭晓招募后不能改领其他奖励，旧版候选存档也锁定领取', () => {
    const state = rewardState();
    const reward = state.rewards.find((item) => item.kind === 'recruit')!;
    const other = state.rewards.find((item) => item.kind !== 'recruit')!;
    const opened = gameReducer(state, { type: 'PICK_REWARD', rewardId: reward.id });
    expect(gameReducer(opened, { type: 'PICK_REWARD', rewardId: other.id })).toBe(opened);
    const legacy = { ...state, pendingRecruitRewardId: reward.id };
    expect(gameReducer(legacy, { type: 'PICK_REWARD', rewardId: other.id })).toBe(legacy);
  });

  it('满员确认后可放生并返回休整，不返还奖励', () => {
    const state = rewardState();
    state.roster = Array.from({ length: 8 }, () => makeUnit('kiki', true, 0, false));
    const reward = state.rewards.find((item) => item.kind === 'recruit')!;
    const opened = gameReducer(state, { type: 'PICK_REWARD', rewardId: reward.id });
    const after = gameReducer(opened, { type: 'PICK_REWARD', rewardId: reward.id, monsterId: reward.recruitCandidates![0] });
    expect(after.screen).toBe('tame-overflow');
    expect(after.roster).toHaveLength(8);
    expect(after.tameOverflow).toHaveLength(1);
    const discarded = gameReducer(after, { type: 'TAME_OVERFLOW_DISCARD', tameUid: after.tameOverflow![0].uid });
    expect(discarded.screen).toBe('roster');
    expect(discarded.rewards).toEqual([]);
  });

  it('旧单宠奖励和熟练度奖励不改为双候选', () => {
    const state = rewardState();
    state.rewards = [{ id: 'old', label: '招募', desc: '', kind: 'recruit', monsterId: 'momo' }];
    expect(gameReducer(state, { type: 'PICK_REWARD', rewardId: 'old' }).roster.at(-1)?.speciesId).toBe('momo');
    const rewards = generateRewards({ ...state, runMode: 'proficiency' });
    expect(rewards.every((reward) => !reward.recruitCandidates)).toBe(true);
  });

  it('斗兽场和车轮战招募同样支持双候选与满员处理', () => {
    for (const type of ['arena', 'gauntlet'] as const) {
      let count = 0;
      for (let seed = 0; seed < 20; seed++) {
        const state = rewardState(seed, 2);
        state.roster = Array.from({ length: 8 }, () => makeUnit('momo', true, 0, false));
        const reward = generateChallengeRewards(state, type).find((item) => item.kind === 'recruit');
        if (!reward) continue;
        count++;
        expect(reward.recruitCandidates).toHaveLength(2);
        expect(reward.monsterId).toBeUndefined();
      }
      expect(count).toBeGreaterThan(0);
    }
  });
});
