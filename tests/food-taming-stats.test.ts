import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerTame, tameChance } from '../src/game/core/battle';
import { FOODS } from '../src/game/data/foods';

const foodIds = ['berry', 'meat', 'gem', 'golden_fruit'];

describe('食物只影响驯服，不增加生命', () => {
  it.each(foodIds)('%s 驯服成功后使用正常满血属性，不影响已有伙伴强化', foodId => {
    for (const speciesId of ['momo', 'kiki', 'momo_queen']) {
      const ally = { ...makeUnit('momo', true, 0, false), maxHp: 30, hp: 25, bonusStats: { hp: 20 } };
      const battle = createBattle([ally], [{ speciesId }], 42);
      battle.enemyUnits[0].hp = 1;
      const after = playerTame(battle, foodId, battle.enemyUnits[0].uid);
      expect(after.pendingTame).toHaveLength(1);
      const expected = makeUnit(speciesId, true, 2, false);
      expect(after.pendingTame[0]).toMatchObject({ maxHp: expected.maxHp, hp: expected.maxHp, spd: expected.spd });
      expect(after.playerUnits).toEqual(battle.playerUnits);
    }
  });

  it('食物数据不再包含生命加成，基础驯服概率和圣果保证不变', () => {
    expect(foodIds.map(id => FOODS[id].baseTame)).toEqual([0.7, 0.85, 0.95, 1]);
    for (const food of Object.values(FOODS)) {
      expect(food).not.toHaveProperty('hpBonus');
      expect(food.desc).not.toMatch(/提升生命|生命加成/);
    }
    const battle = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 42);
    const enemy = battle.enemyUnits[0];
    enemy.hp = 2;
    expect(tameChance(enemy, 'golden_fruit')).toBeGreaterThan(tameChance(enemy, 'gem'));
    const after = playerTame(battle, 'golden_fruit', enemy.uid);
    expect(after.pendingTame).toHaveLength(1);
    expect(after.pendingTame[0].maxHp).toBe(makeUnit('kiki', true, 2, false).maxHp);
  });
});
