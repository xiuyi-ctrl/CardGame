import { describe, expect, it } from 'vitest';
import { makeUnit } from '../src/game/core/battle';
import { MAIN_REGIONS } from '../src/game/data/regions';
import { getMonster } from '../src/game/data/monsters';
import { GROWTH_SHOP_ITEMS } from '../src/game/data/growth-shop';
import { TIER1 } from '../src/game/core/growth-map';
import { createRng } from '../src/game/rng';
import { buildEventByType, buildSpecial, generateChallengeRewards, generateMap, generateRewards, nodeInfo, type GameState } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { parseDualSave } from '../src/ui/persistence';

const forest = MAIN_REGIONS.emerald_forest;
const allowed = [...forest.basePool, ...forest.evo1Pool, ...forest.evo2Pool];
function rewardState(seed: number, act = 1): GameState {
  const state: GameState = { ...createInitialState(), region: 'emerald_forest', screen: 'reward', seed, act, currentRow: 0 };
  return { ...state, rewards: generateRewards(state) };
}
function eggState(act = 1, full = false): GameState {
  const state = rewardState(42, act);
  return { ...state, screen: 'event', currentNodeId: 'egg', roster: Array.from({ length: full ? 8 : 1 }, () => makeUnit('momo', true, 0, false)),
    map: { ...state.map, events: { egg: buildEventByType(createRng(42), 'egg', act, 'emerald_forest') } },
  };
}

describe('林地战后招募', () => {
  it.each([1, 2, 3])('第%s幕仅地区内两位不同候选，原品阶概率及随机调用节奏不变', act => {
    const seen = new Set<string>();
    let advanced = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const state = rewardState(seed, act);
      const reward = state.rewards.find(reward => reward.kind === 'recruit')!;
      const candidates = reward.recruitCandidates!;
      expect(candidates).toHaveLength(2);
      expect(new Set(candidates).size).toBe(2);
      expect(reward.monsterId).toBeUndefined();
      expect(reward.desc).toBe('从两位候选伙伴中选择一位');
      candidates.forEach(id => { expect([...forest.basePool, ...forest.evo1Pool]).toContain(id); seen.add(id); });
      advanced += candidates.filter(id => getMonster(id).rank === 2).length;
      const mixed = generateRewards({ ...state, region: 'mixed' }).find(reward => reward.kind === 'recruit')!;
      expect(candidates.map(id => getMonster(id).rank)).toEqual(mixed.recruitCandidates!.map(id => getMonster(id).rank));
      const full = { ...state, roster: Array.from({ length: 8 }, () => makeUnit('fire_fox', true, 0, false)) };
      expect(generateRewards(full)).toEqual(state.rewards);
    }
    expect(advanced / 800).toBeCloseTo(act === 1 ? 0 : act === 2 ? 0.3 : 0.6, 1);
    expect([...seen].sort()).toEqual([...(act === 1 ? forest.basePool : [...forest.basePool, ...forest.evo1Pool])].sort());
  });

  it.each(['arena', 'gauntlet'] as const)('%s挑战招募同样使用地区池，候选不在奖励卡提前展示', type => {
    let count = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const state = rewardState(seed, 3);
      const rewards = generateChallengeRewards(state, type);
      const recruit = rewards.find(reward => reward.kind === 'recruit');
      if (!recruit) continue;
      count++;
      expect(recruit.monsterId).toBeUndefined();
      expect(recruit.recruitCandidates).toHaveLength(2);
      recruit.recruitCandidates!.forEach(id => expect([...forest.basePool, ...forest.evo1Pool]).toContain(id));
      expect(generateChallengeRewards(state, type)).toEqual(rewards);
    }
    expect(count).toBeGreaterThan(0);
  });

  it.each([false, true])('锁定、读档及到账保留同一候选，满员处理不重抽 full=%s', full => {
    const state = rewardState(42, 3);
    state.roster = Array.from({ length: full ? 8 : 1 }, () => makeUnit('momo', true, 0, false));
    const reward = state.rewards.find(reward => reward.kind === 'recruit')!;
    const opened = gameReducer(state, { type: 'PICK_REWARD', rewardId: reward.id });
    const loaded = parseDualSave(JSON.stringify(opened))!.main!;
    expect(loaded.rewards).toEqual([reward]);
    expect(loaded.pendingRecruitRewardId).toBe(reward.id);
    expect(gameReducer(loaded, { type: 'PICK_REWARD', rewardId: reward.id, monsterId: 'fifi' })).toBe(loaded);
    const after = gameReducer(loaded, { type: 'PICK_REWARD', rewardId: reward.id, monsterId: reward.recruitCandidates![0] });
    const unit = full ? after.tameOverflow![0] : after.roster.at(-1)!;
    expect(unit.speciesId).toBe(reward.recruitCandidates![0]);
    expect(after.screen).toBe(full ? 'tame-overflow' : 'roster');
    expect(after.rewards).toEqual([]);
    expect(gameReducer(after, { type: 'PICK_REWARD', rewardId: reward.id, monsterId: unit.speciesId })).toBe(after);
    if (full) {
      const discarded = gameReducer(after, { type: 'TAME_OVERFLOW_DISCARD', tameUid: unit.uid });
      expect(discarded.screen).toBe('roster');
      expect(discarded.rewards).toEqual([]);
    }
  });
});

describe('林地孵化与事件', () => {
  it('新版神秘蛋三幕均在地区一二阶池内等概率孵化', () => {
    const seen = new Set<string>();
    for (const act of [1, 2, 3]) {
      const pool = [...forest.basePool, ...forest.evo1Pool];
      pool.forEach((id, index) => {
        let first = true;
        const rng = createRng(42);
        const event = buildEventByType(() => first ? (first = false, (index + 0.5) / pool.length) : rng(), 'egg', act, 'emerald_forest');
        expect(event.choices[0].monsterId).toBe(id);
        seen.add(id);
      });
    }
    expect([...seen].sort()).toEqual([...forest.basePool, ...forest.evo1Pool].sort());
  });

  it.each([false, true])('孵化预览绑定已生成物种，读档、确认与满员到账一致 full=%s', full => {
    const state = eggState(3, full);
    const choice = state.map.events.egg.choices[0];
    expect(allowed).toContain(choice.monsterId);
    expect(gameReducer(state, { type: 'EVENT_HATCH_PREVIEW', choiceId: choice.id, monsterId: 'boss_vine' })).toBe(state);
    const preview = gameReducer(state, { type: 'EVENT_HATCH_PREVIEW', choiceId: choice.id, monsterId: choice.monsterId! });
    expect(preview.pendingEventHatch?.monsterId).toBe(choice.monsterId);
    expect(gameReducer(preview, { type: 'EVENT_HATCH_PREVIEW', choiceId: 'other', monsterId: 'fifi' })).toBe(preview);
    const loaded = parseDualSave(JSON.stringify(preview))!.main!;
    expect(loaded.map.events.egg).toEqual(state.map.events.egg);
    expect(loaded.pendingEventHatch).toEqual(preview.pendingEventHatch);
    const result = gameReducer(loaded, { type: 'EVENT_HATCH_CONFIRM' });
    expect((full ? result.tameOverflow![0] : result.roster.at(-1)!).speciesId).toBe(choice.monsterId);
    expect(result.screen).toBe(full ? 'tame-overflow' : 'map');
    expect(gameReducer(result, { type: 'EVENT_HATCH_CONFIRM' })).toBe(result);
  });

  it('放生按预览物种品阶发金币，不发伙伴，不再重抽', () => {
    const state = eggState(3);
    const choice = state.map.events.egg.choices[0];
    const preview = gameReducer(state, { type: 'EVENT_HATCH_PREVIEW', choiceId: choice.id, monsterId: choice.monsterId! });
    const result = gameReducer(preview, { type: 'EVENT_HATCH_CANCEL' });
    expect(result.roster).toEqual(state.roster);
    expect(result.gold).toBe(state.gold + getMonster(choice.monsterId!).rank * 5);
    expect(result.screen).toBe('map');
    expect(result.pendingEventHatch).toBeUndefined();
  });

  it('地图中的事件伙伴均在地区内，情报不提前泄露孵化结果', () => {
    let eggs = 0;
    for (let act = 1; act <= 3; act++) {
      for (let seed = 1; seed <= 40; seed++) {
        const map = generateMap(seed, act, 'normal', 'emerald_forest');
        const state = { ...rewardState(seed, act), map };
        for (const node of map.layers.flat().filter(node => node.type === 'event')) {
          const event = map.events[node.id];
          for (const choice of event.choices) {
            if (choice.kind !== 'recruit' || !choice.monsterId) continue;
            eggs++;
            expect(allowed).toContain(choice.monsterId);
            expect(getMonster(choice.monsterId).rank).toBeLessThanOrEqual(2);
            expect(nodeInfo(state, node).detail).not.toContain(getMonster(choice.monsterId).name);
          }
        }
      }
    }
    expect(eggs).toBeGreaterThan(0);
  });

  it('旧奖励不按新地区重抽；仅奇遇特殊蛋预生成蛋生伙伴', () => {
    const state = rewardState(42);
    state.rewards = [{ id: 'old', label: '旧招募', desc: '', kind: 'recruit', monsterId: 'fifi' }];
    const loaded = parseDualSave(JSON.stringify(state))!.main!;
    expect(gameReducer(loaded, { type: 'PICK_REWARD', rewardId: 'old' }).roster.at(-1)!.speciesId).toBe('fifi');
    const egg = eggState();
    egg.map.events.egg.choices[0].monsterId = 'fifi';
    const restored = parseDualSave(JSON.stringify(egg))!.main!;
    const preview = gameReducer(restored, { type: 'EVENT_HATCH_PREVIEW', choiceId: restored.map.events.egg.choices[0].id, monsterId: 'fifi' });
    expect(gameReducer(preview, { type: 'EVENT_HATCH_CONFIRM' }).roster.at(-1)!.speciesId).toBe('fifi');
    for (let seed = 1; seed <= 30; seed++) {
      for (const reward of buildSpecial(createRng(seed)).rewards) {
        if (reward.kind === 'egg') expect(getMonster(reward.monsterId!).eggBorn).toBe(true);
        else expect(reward.monsterId).toBeUndefined();
      }
    }
  });
});

describe('商店与熟练度边界', () => {
  it('主模式商店不新增招募商品，熟练度原招募池不读取主模式地区', () => {
    const main = { ...rewardState(42), screen: 'shop' as const, gold: 1000, shopStock: ['pet_recruit'] };
    expect(gameReducer(main, { type: 'SHOP_BUY', foodId: 'pet_recruit' })).toBe(main);
    const prof: GameState = { ...main, runMode: 'proficiency', roster: [] };
    const mixed = gameReducer({ ...prof, region: 'mixed' }, { type: 'PROF_SHOP_BUY', itemId: 'pet_recruit' });
    const forestTagged = gameReducer(prof, { type: 'PROF_SHOP_BUY', itemId: 'pet_recruit' });
    expect(forestTagged.roster).toHaveLength(1);
    expect(TIER1).toContain(forestTagged.roster[0].speciesId);
    expect(forestTagged.roster[0].speciesId).toBe(mixed.roster[0].speciesId);
    expect(forestTagged.gold).toBe(prof.gold - GROWTH_SHOP_ITEMS.pet_recruit.price);
    expect(generateRewards(prof)).toEqual(generateRewards({ ...prof, region: 'mixed' }));
    expect(generateChallengeRewards(prof, 'arena')).toEqual(generateChallengeRewards({ ...prof, region: 'mixed' }, 'arena'));
  });
});
