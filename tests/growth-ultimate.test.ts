import { describe, it, expect } from 'vitest';
import { createBattle, makeUnit, playerEndTurn, playerSkill } from '../src/game/core/battle';

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

describe('成长傀儡献祭被动（玩家侧成长之主）', () => {
  it('初始队伍玩家侧成长之主+1傀儡：回合结束傀儡献祭+1（不依赖敌方侧查找）', () => {
    let b = createBattle(
      [makeUnit('growth_master', true, 0, false), makeUnit('growth_puppet', true, 0, false)],
      [makeUnit('momo', false, 0, false)],
      3,
      { enemyExact: true },
    );
    const master = b.playerUnits.find((u) => u.speciesId === 'growth_master')!;
    const puppet = b.playerUnits.find((u) => u.speciesId === 'growth_puppet')!;
    expect(puppet.sacrificeUid).toBe(master.uid);
    b = playerEndTurn(b);
    // 初始5 + 自身被动回合结束+1 + 傀儡献祭+1 = 7
    expect(b.playerUnits.find((u) => u.speciesId === 'growth_master')!.growthValue).toBe(master.growthValue! + 2);
  });
});

describe('敌方AI：被封印的技能不进入候选池', () => {
  it('成长之主的成长冲击被封印时，改为施放成长束缚（不浪费行动）', () => {
    let b = createBattle(
      [makeUnit('momo', true, 0, false), makeUnit('momo', true, 0, false), makeUnit('momo', true, 0, false)],
      [{ speciesId: 'growth_master' }],
      13,
      { enemyExact: true },
    );
    b = { ...b, enemyUnits: b.enemyUnits.slice(0, 1) };
    const boss = getBoss(b);
    b = {
      ...b,
      enemyUnits: [{
        ...boss,
        hp: 200,
        growthValue: 50,
        skills: ['growth_bind', 'growth_impact'],
        acted: false,
        statuses: [{ kind: 'skillSeal', value: 1, turns: 1, sealedSkills: ['growth_impact'] }],
      }],
    };
    b = playerEndTurn(b);
    // AI 应避开被封印的成长冲击，改用成长束缚
    expect(getBoss(b).lastSkillId).toBe('growth_bind');
  });

  it('全部技能被封印时敌方观望（无可用技能），不再尝试被封印技能', () => {
    let b = createBattle(
      [makeUnit('momo', true, 0, false)],
      [{ speciesId: 'growth_master' }],
      17,
      { enemyExact: true },
    );
    b = { ...b, enemyUnits: b.enemyUnits.slice(0, 1) };
    const boss = getBoss(b);
    b = {
      ...b,
      enemyUnits: [{
        ...boss,
        hp: 200,
        skills: ['growth_impact'],
        acted: false,
        statuses: [{ kind: 'skillSeal', value: 1, turns: 1, sealedSkills: ['growth_impact'] }],
      }],
    };
    b = playerEndTurn(b);
    // 唯一技能被封印 → 观望（不施放，不消耗成长值）
    expect(getBoss(b).lastSkillId).toBeUndefined();
    expect(getBoss(b).hp).toBeGreaterThan(0);
  });

  it('泡泡将2个攻击技能被封印后仍有可用技能时，兜底施放剩余技能（不提示无技能可用）', () => {
    let b = createBattle(
      [makeUnit('momo', true, 0, false), makeUnit('momo', true, 0, false)],
      [{ speciesId: 'lulu_king' }],
      23,
      { enemyExact: true },
    );
    b = { ...b, enemyUnits: b.enemyUnits.slice(0, 1) };
    const boss = getBoss(b);
    b = {
      ...b,
      enemyUnits: [{
        ...boss,
        hp: boss.maxHp,
        acted: false,
        // 2个攻击技能（水枪弹/水波冲击）被封印，只剩愈光（治疗）
        statuses: [{ kind: 'skillSeal', value: 2, turns: 1, sealedSkills: ['water_gun', 'water_wave'] }],
      }],
    };
    b = playerEndTurn(b);
    // 满血时治疗不满足候选条件，但兜底应施放剩余技能（愈光），而非观望
    expect(getBoss(b).lastSkillId).toBe('heal_light');
  });

  it('封印技能为真随机洗牌：不同随机状态下封印的攻击技能组合不同（回归：恒定选前 N 个）', () => {
    const combos = new Set<string>();
    for (let off = 0; off < 8; off++) {
      let b = createBattle([makeUnit('growth_master', true, 0, false)], [{ speciesId: 'lulu_king' }], 7, { enemyExact: true });
      b = { ...b, enemyUnits: b.enemyUnits.slice(0, 1) };
      const boss = getBoss(b);
      b = {
        ...b,
        rngCount: (b.rngCount ?? 0) + off * 3 + 1,
        enemyUnits: [{ ...boss, skills: ['water_gun', 'water_wave', 'punch'], hp: 100, maxHp: 100 }],
      };
      b = playerSkill(b, b.playerUnits[0].uid, 'growth_bind', b.enemyUnits[0].uid);
      b = playerEndTurn(b);
      const seal = b.enemyUnits[0].statuses.find((s) => s.kind === 'skillSeal');
      const sealed: string[] = (seal?.sealedSkills ?? []) as string[];
      expect(sealed.length).toBe(2); // growth_bind封印2个技能（现在不限攻击，heal_light治疗也可被封印）
      combos.add([...sealed].sort().join(','));
    }
    // 修复前 sort 用固定 rngCount 永不改变顺序，恒封前 2 个攻击技能 → 只有 1 种组合
    expect(combos.size).toBeGreaterThan(1);
  });
});