import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerTame, tameChance } from '../src/game/core/battle';

describe('按品阶、食物与生命计算捕捉概率', () => {
  it.each([
    ['momo', 0.5, 0.85], ['momo_queen', 0.4, 0.75], ['momo_god', 0.3, 0.65],
  ] as const)('%s 使用品阶基础率、残血加成和上限', (species, base, cap) => {
    const unit = { ...makeUnit(species, false, 0, true), hp: 40, maxHp: 100 };
    for (const [food, bonus] of [['berry', 0], ['meat', 0.1], ['gem', 0.2]] as const) {
      for (const [hp, hpBonus] of [[40, 0], [20, 0.075], [10, 0.1125]] as const) {
        expect(tameChance({ ...unit, hp }, food)).toBeCloseTo(base + bonus + hpBonus);
      }
      expect(tameChance({ ...unit, hp: 2, tameFails: 100 }, food)).toBeLessThanOrEqual(cap);
    }
    expect(tameChance({ ...unit, hp: 2, tameFails: 2 }, 'gem')).toBeCloseTo(cap);
    expect(tameChance({ ...unit, tameFails: 1 }, 'berry')).toBeCloseTo(base + 0.05);
    expect(tameChance({ ...unit, tameFails: 2 }, 'berry')).toBeCloseTo(base + 0.1);
    expect(tameChance({ ...unit, tameFails: 100 }, 'berry')).toBeCloseTo(base + 0.1);
    expect(tameChance({ ...unit, hp: 80, maxHp: 200 }, 'meat')).toBeCloseTo(base + 0.1);
  });

  it('同品阶不再被原物种驯服难度乘低', () => {
    const units = ['momo', 'coal', 'candle'].map(id => ({ ...makeUnit(id, false, 0, true), hp: 20, maxHp: 100 }));
    units.forEach(unit => expect(tameChance(unit, 'berry')).toBeCloseTo(0.575));
  });

  it('所有品阶、普通食物、血量与失败补偿组合均比旧公式低10个百分点', () => {
    for (const id of ['momo', 'momo_queen', 'momo_god']) {
      const unit = makeUnit(id, false, 0, true);
      const oldBase = id === 'momo' ? .6 : id === 'momo_queen' ? .5 : .4;
      for (const [food, bonus] of [['berry', 0], ['meat', .1], ['gem', .2]] as const)
        for (const hp of [40, 20, 2]) for (const tameFails of [0, 1, 2, 10]) {
          const oldChance = Math.min(oldBase + .35, oldBase + bonus + .15 * (1 - hp / 100 / .4) + .05 * Math.min(tameFails, 2));
          expect(tameChance({ ...unit, hp, maxHp: 100, tameFails }, food)).toBeCloseTo(oldChance - .1);
        }
    }
  });

  it('26点最大生命的传奇棘刺王剩2血时，三种食物提示约42/52/62%', () => {
    const unit = { ...makeUnit('sisi_god', false, 0, true), hp: 2, maxHp: 26 };
    expect(['berry', 'meat', 'gem'].map(food => Math.round(tameChance(unit, food) * 100))).toEqual([42, 52, 62]);
  });

  it('保留1血和圣果必捕，不绕过40%生命与不可捕捉限制', () => {
    for (const [food, hp] of [['berry', 1], ['golden_fruit', 40]] as const) {
      const battle = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'momo_god' }], 42);
      battle.enemyUnits[0] = { ...battle.enemyUnits[0], hp, maxHp: 100 };
      const target = battle.enemyUnits[0];
      expect(playerTame(battle, food, target.uid).pendingTame).toHaveLength(1);
      expect(playerTame({ ...battle, enemyUnits: [{ ...target, hp: 41 }] }, food, target.uid).pendingTame).toHaveLength(0);
      expect(playerTame({ ...battle, enemyUnits: [{ ...target, tameable: false }] }, food, target.uid).pendingTame).toHaveLength(0);
    }
  });
});
