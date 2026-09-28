import { describe, it, expect } from 'vitest';
import {
  applyEnemySkillProgression,
  getEnemySkillTier,
  ENEMY_SKILL_TIERS,
  SKILL_UPGRADES,
} from '../src/game/core/enemy-progression';
import { createBattle, makeUnit } from '../src/game/core/battle';

function enemyUnit(speciesId = 'momo') {
  return makeUnit(speciesId, false, 0, false);
}

describe('敌人技能强化与替换分档表', () => {
  it('每 10 层一档，层数取档正确', () => {
    expect(ENEMY_SKILL_TIERS.map((t) => t.minLayer)).toEqual([1, 11, 21, 31, 41]);
    expect(getEnemySkillTier(5)).toMatchObject({ enhanceCount: 0, enhanceLevel: 0, replaceCount: 0 });
    expect(getEnemySkillTier(15)).toMatchObject({ enhanceCount: 1, enhanceLevel: 1, replaceCount: 0 });
    expect(getEnemySkillTier(25)).toMatchObject({ enhanceCount: 1, enhanceLevel: 2, replaceCount: 1 });
    expect(getEnemySkillTier(35)).toMatchObject({ enhanceCount: 2, enhanceLevel: 2, replaceCount: 1 });
    expect(getEnemySkillTier(45)).toMatchObject({ enhanceCount: 2, enhanceLevel: 3, replaceCount: 2 });
    expect(getEnemySkillTier(999)).toMatchObject({ minLayer: 41 });
  });

  it('映射表源/目标技能均存在', async () => {
    const { SKILLS } = await import('../src/game/data/skills');
    for (const [from, to] of Object.entries(SKILL_UPGRADES)) {
      expect(SKILLS[from], `源技能 ${from}`).toBeDefined();
      expect(SKILLS[to], `目标技能 ${to}`).toBeDefined();
    }
  });
});

describe('applyEnemySkillProgression', () => {
  it('1~10 层：普通敌人完全不变', () => {
    const u = enemyUnit();
    const next = applyEnemySkillProgression(u, 5);
    expect(next).toBe(u);
    expect(next.skillEnhancements).toBeUndefined();
    expect(next.skills).toEqual(u.skills);
  });

  it('11~20 层：1 技能 +1，不替换', () => {
    const u = enemyUnit('momo');
    const next = applyEnemySkillProgression(u, 15);
    expect(next.skillEnhancements).toEqual({ 0: 1 });
    expect(next.skills).toEqual(['punch', 'leaf_needle']);
  });

  it('21~30 层：slot0 替换为高阶技能并强化 +2', () => {
    const u = enemyUnit('momo');
    const next = applyEnemySkillProgression(u, 25);
    expect(next.skills[0]).toBe('claw_smash');
    expect(next.skillEnhancements).toEqual({ 0: 2 });
  });

  it('41~50 层：2 技能强化 +3（连击类封顶 2）、2 技能替换', () => {
    // 迅迅：punch→claw_smash 有映射；leaf_needle 无映射则跳过继续找（仅 2 个技能，实际替换 1 个）
    const u = enemyUnit('momo');
    const next = applyEnemySkillProgression(u, 45);
    expect(next.skills).toEqual(['claw_smash', 'leaf_needle']);
    expect(next.skillEnhancements).toEqual({ 0: 3, 1: 2 }); // leaf_needle 为连击，封顶 2
  });

  it('41~50 层：前 2 个存在映射的技能都被替换', () => {
    // 灼灼：ember→burn_burst、double_hit→shadow_flurry，两个映射都命中
    const u = enemyUnit('fifi');
    const next = applyEnemySkillProgression(u, 45);
    expect(next.skills[0]).toBe('burn_burst'); // ember→burn_burst（slot0 有映射先替换）
    expect(next.skills[1]).toBe('shadow_flurry'); // double_hit→shadow_flurry
    expect(next.skillEnhancements).toEqual({ 0: 3, 1: 2 }); // shadow_flurry 连击封顶 2
  });

  it('精英：强化技能数 +1、强化等级 +1', () => {
    const normal = applyEnemySkillProgression(enemyUnit('momo'), 15);
    const elite = applyEnemySkillProgression(enemyUnit('momo'), 15, true);
    expect(normal.skillEnhancements).toEqual({ 0: 1 });
    expect(elite.skillEnhancements).toEqual({ 0: 2, 1: 2 });
    // 教学期精英（档1）：0+1 技能、0+1 等级
    const earlyElite = applyEnemySkillProgression(enemyUnit('momo'), 8, true);
    expect(earlyElite.skillEnhancements).toEqual({ 0: 1 });
  });

  it('重复调用结果一致（确定性）', () => {
    const a = applyEnemySkillProgression(enemyUnit('gora'), 45, true);
    const b = applyEnemySkillProgression(enemyUnit('gora'), 45, true);
    expect(a.skills).toEqual(b.skills);
    expect(a.skillEnhancements).toEqual(b.skillEnhancements);
  });
});

describe('createBattle 集成', () => {
  const player = () => [makeUnit('momo_god', true, 0, false)];

  it('无 layer（主幕模式）：敌人不带强化', () => {
    const b = createBattle(player(), [{ speciesId: 'momo' }], 42, {});
    for (const e of b.enemyUnits) expect(e.skillEnhancements).toBeUndefined();
  });

  it('远征 layer：敌人带强化', () => {
    const b = createBattle(player(), [{ speciesId: 'momo' }], 42, { layer: 35 });
    expect(b.enemyUnits[0].skillEnhancements).toEqual({ 0: 2, 1: 2 });
    expect(b.enemyUnits[0].skills[0]).toBe('claw_smash');
  });

  it('精英节点：额外 +1/+1', () => {
    const b = createBattle(player(), [{ speciesId: 'momo' }], 42, { layer: 15, nodeType: 'elite' });
    expect(b.enemyUnits[0].skillEnhancements).toEqual({ 0: 2, 1: 2 });
  });

  it('Boss 本体与小怪（rank 4）完全不参与', () => {
    const b = createBattle(player(), [{ speciesId: 'boss_vine' }, { speciesId: 'boss_minion_tree_guard' }], 42, { layer: 45 });
    for (const e of b.enemyUnits) {
      expect(e.skillEnhancements).toBeUndefined();
      expect(e.skills.length).toBeGreaterThan(0);
    }
  });
});
