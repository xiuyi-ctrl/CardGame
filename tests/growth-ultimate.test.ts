import { describe, it, expect } from 'vitest';
import { createBattle, makeUnit, playerEndTurn } from '../src/game/core/battle';

function getBoss(b: ReturnType<typeof createBattle>) {
  return b.enemyUnits[0];
}

function atkUpValue(b: ReturnType<typeof createBattle>): number {
  return getBoss(b).statuses.find((s) => s.kind === 'atkUp')?.value ?? 0;
}

/** 构造一个成长之主：只剩终焉成长可用，且血量始终低于 45%（放大 maxHp），保证 AI 连续 3 次施放 */
function makeBossBattleWithOnlyUltimate() {
  let b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'growth_master' }], 1, { enemyExact: true });
  b = { ...b, enemyUnits: b.enemyUnits.slice(0, 1) };
  const boss = getBoss(b);
  b = {
    ...b,
    enemyUnits: [{
      ...boss,
      maxHp: 2000,
      hp: 50,
      growthValue: 40,
      ultimateUsesLeft: 3,
      skills: ['growth_ultimate'],
      acted: false,
    }],
  };
  return b;
}

describe('终焉成长：永久+1伤害每次使用累加', () => {
  it('连续3次使用后 atkUp 分别累加为 +1/+2/+3', () => {
    let b = makeBossBattleWithOnlyUltimate();
    expect(atkUpValue(b)).toBe(0);
    for (let i = 0; i < 3; i++) {
      b = playerEndTurn(b);
      expect(b.phase).toBe('acting');
      expect(atkUpValue(b)).toBe(i + 1);
      expect(getBoss(b).hp).toBeGreaterThan(0);
    }
  });

  it('消耗成长值：3次使用共消耗30成长值（40 - 30 + 每回合结束被动+1×3 = 13）', () => {
    let b = makeBossBattleWithOnlyUltimate();
    for (let i = 0; i < 3; i++) {
      b = playerEndTurn(b);
    }
    expect(getBoss(b).growthValue).toBe(13);
  });
});

describe('成长之主被动：主动攻击命中+2，与成长值消耗互相独立', () => {
  it('成长冲击攻击命中后：消耗3 + 被动命中+2 + 回合结束+1 = 净 0（20→20）', () => {
    let b = createBattle(
      [makeUnit('momo', true, 0, false), makeUnit('momo', true, 0, false), makeUnit('momo', true, 0, false)],
      [{ speciesId: 'growth_master' }],
      7,
      { enemyExact: true },
    );
    b = { ...b, enemyUnits: b.enemyUnits.slice(0, 1) };
    const boss = getBoss(b);
    b = {
      ...b,
      enemyUnits: [{
        ...boss,
        growthValue: 20,
        hp: 200,
        ultimateUsesLeft: 3,
        skills: ['growth_impact'],
        acted: false,
      }],
    };
    expect(getBoss(b).growthValue).toBe(20);
    b = playerEndTurn(b);
    // 攻击命中对面且成长之主存活：20 - 3(消耗) + 2(命中被动) + 1(回合结束被动) = 20
    expect(getBoss(b).growthValue).toBe(20);
    expect(getBoss(b).hp).toBeGreaterThan(0);
  });

  it('成长之主使用终焉成长（heal）不触发攻击命中+2（无攻击命中）', () => {
    let b = makeBossBattleWithOnlyUltimate();
    // 替换为仅有终焉成长，直接施放一次：消耗10 + 回合结束被动+1
    const boss = getBoss(b);
    b = { ...b, enemyUnits: [{ ...boss, growthValue: 20 }] };
    expect(getBoss(b).growthValue).toBe(20);
    b = playerEndTurn(b);
    expect(getBoss(b).growthValue).toBe(11); // 20 - 10 + 1
  });
});