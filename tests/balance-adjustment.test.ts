import { describe, expect, it } from 'vitest';
import { createBattle, getProficiencyEnemyScaling, makeUnit, performGauntletSwap } from '../src/game/core/battle';
import { generateGrowthMap, getGrowthEliteEncounter } from '../src/game/core/growth-map';
import { getGrowthArenaEncounter } from '../src/game/data/growth-arena';
import { getMonster } from '../src/game/data/monsters';
import { createRng } from '../src/game/rng';
import { DIFFICULTY_CONFIG } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { simulateRun } from '../src/game/simulation/runner';

describe('统一数值调整', () => {
  it('三档难度使用新的属性、经济、回复与幕间配置', () => {
    expect(DIFFICULTY_CONFIG.normal).toMatchObject({ enemyHpMult: 1, enemySpdBonus: 0, shopPriceMult: 1, healRatio: 0.65, eliteBoost: 0, interActMinHpRatio: 0.8 });
    expect(DIFFICULTY_CONFIG.hard).toMatchObject({ enemyHpMult: 1.15, enemySpdBonus: 1, shopPriceMult: 1.1, healRatio: 0.65, eliteBoost: 0.05, interActMinHpRatio: 0.65 });
    expect(DIFFICULTY_CONFIG.nightmare).toMatchObject({ enemyHpMult: 1.35, enemySpdBonus: 2, shopPriceMult: 1.25, healRatio: 0.5, eliteBoost: 0.1, interActMinHpRatio: 0.5 });
  });

  it('熟练度生命分段成长、速度每10层离散增加', () => {
    expect(getProficiencyEnemyScaling(1)).toEqual({ hpMult: 1, spdBonus: 0 });
    expect(getProficiencyEnemyScaling(15)).toEqual({ hpMult: 1.56, spdBonus: 1 });
    expect(getProficiencyEnemyScaling(30)).toEqual({ hpMult: 2.46, spdBonus: 2 });
    expect(getProficiencyEnemyScaling(50).hpMult).toBeCloseTo(4.06);
    expect(getProficiencyEnemyScaling(50).spdBonus).toBe(4);

    const base = makeUnit('momo', false, 0, false);
    const layer15 = createBattle([makeUnit('momo_god', true, 0, false)], [{ speciesId: 'momo' }], 1, { layer: 15 });
    expect(layer15.enemyUnits[0].maxHp).toBe(Math.round(base.maxHp * 1.56));
    expect(layer15.enemyUnits[0].spd).toBe(base.spd + 1);
  });

  it('特殊遭遇生命倍率只缩放生命', () => {
    const player = makeUnit('momo', true, 0, false);
    const plain = createBattle([player], [{ speciesId: 'kiki' }], 1);
    const tuned = createBattle([player], [{ speciesId: 'kiki' }], 1, { encounterHpMult: 0.85 });
    expect(tuned.enemyUnits[0].maxHp).toBe(Math.round(plain.enemyUnits[0].maxHp * 0.85));
    expect(tuned.enemyUnits[0].spd).toBe(plain.enemyUnits[0].spd);
  });

  it('熟练度精英池和竞技场人数按阶段平滑增长', () => {
    const early = getGrowthEliteEncounter(8, createRng(1));
    const beforeBoss = getGrowthEliteEncounter(15, createRng(2));
    const mid = Array.from({ length: 100 }, (_, seed) => getGrowthEliteEncounter(20, createRng(seed))).flat();
    expect(early).toHaveLength(1);
    expect(beforeBoss).toHaveLength(2);
    expect(beforeBoss.every((enemy) => getMonster(enemy.speciesId).rank === 2)).toBe(true);
    expect(mid.every((enemy) => [2, 3].includes(getMonster(enemy.speciesId).rank))).toBe(true);
    expect(getGrowthArenaEncounter(20, createRng(3))).toHaveLength(2);
    expect(getGrowthArenaEncounter(21, createRng(3))).toHaveLength(3);
  });

  it('14、29层固定休整，第一Boss最多携带一只小怪', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const map = generateGrowthMap(seed);
      expect(map.layers[13][0].type).toBe('rest');
      expect(map.layers[28][0].type).toBe('rest');
      expect(map.boss.pf_15.length).toBeLessThanOrEqual(2);
    }
  });

  it('幕间恢复至难度规定的最低生命线', () => {
    let state = gameReducer(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'lulu', seed: 7, difficulty: 'hard' });
    state = { ...state, screen: 'inter_act', roster: state.roster.map((unit) => ({ ...unit, hp: 1 })) };
    const next = gameReducer(state, { type: 'INTER_ACT_CONTINUE' });
    expect(next.roster.every((unit) => unit.hp >= Math.ceil(unit.maxHp * 0.65))).toBe(true);
  });

  it('车轮战击败一轮后恢复20%并清理临时状态', () => {
    const player = { ...makeUnit('momo', true, 0, false), hp: 2, statuses: [{ kind: 'burn' as const, value: 2, turns: 2 }], shield: 4 };
    const battle = createBattle([player], [{ speciesId: 'kiki' }, { speciesId: 'mimi' }], 9, { gauntlet: true });
    const swapped = performGauntletSwap({
      ...battle,
      enemyUnits: battle.enemyUnits.map((unit) => ({ ...unit, hp: 0 })),
      pendingSwap: { player: false, enemy: true },
    });
    expect(swapped.playerUnits[0].hp).toBe(Math.min(player.maxHp, 2 + Math.round(player.maxHp * 0.2)));
    expect(swapped.playerUnits[0].statuses).toEqual([]);
    expect(swapped.playerUnits[0].shield).toBe(0);
  });

  it('熟练度购买与刷新都会计入金币支出', () => {
    let state = gameReducer(createInitialState(), { type: 'START_PROFICIENCY_PICKED', seed: 5, starterId: 'momo', companionId: 'lulu' });
    state = { ...state, gold: 100, screen: 'shop' };
    state = gameReducer(state, { type: 'PROF_SHOP_BUY', itemId: 'book_small' });
    expect(state.runStats?.goldSpent).toBe(12);
    state = gameReducer(state, { type: 'PROF_SHOP_REFRESH' });
    expect(state.runStats?.goldSpent).toBe(17);
  });

  it('空队伍进入节点时立即收束到对应失败结算', () => {
    let main = gameReducer(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'lulu', seed: 9, difficulty: 'normal' });
    main = { ...main, roster: [], field: [], currentNodeId: '' };
    expect(gameReducer(main, { type: 'MOVE', nodeId: main.map.layers[0][0].id }).screen).toBe('gameover');

    let proficiency = gameReducer(createInitialState(), { type: 'START_PROFICIENCY_PICKED', seed: 9, starterId: 'momo', companionId: 'lulu' });
    proficiency = { ...proficiency, roster: [], field: [], currentNodeId: '' };
    const failed = gameReducer(proficiency, { type: 'MOVE', nodeId: proficiency.map.layers[0][0].id });
    expect(failed.screen).toBe('proficiency-result');
    expect(failed.proficiencyResult).toBe('lost');
  });

  it('深度模拟发现的空队伍种子不再卡死', () => {
    const configs = [
      { mode: 'main' as const, difficulty: 'nightmare' as const, seed: 2397 },
      ...[2117, 2600, 2676, 2786].map((seed) => ({ mode: 'proficiency' as const, difficulty: 'normal' as const, seed })),
    ];
    for (const config of configs) expect(simulateRun(config).outcome).not.toBe('stuck');
  });
});
