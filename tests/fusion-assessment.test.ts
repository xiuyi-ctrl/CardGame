import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { BASE_POOL, EVO1_POOL } from '../src/game/data/monsters';
import { fusionEncounters, fusionStatBudget, fusionTeam, measureFusionBattle, planFusionRound, simulateFusionTrial } from '../src/game/simulation/fusion-assessment';

describe('融合专项评估工具', () => {
  it('对照与实验仅改变融合和替补，保留角色站位并分开一次性回血', () => {
    const before = fusionTeam('momo', 'before', true);
    const empty = fusionTeam('momo', 'empty', true);
    const spare = fusionTeam('momo', 'damage', true);
    expect(before.map(unit => unit.speciesId)).toEqual(['momo', 'momo', 'kiki']);
    expect(empty.map(unit => unit.speciesId)).toEqual(['momo_queen', 'kiki']);
    expect(spare.map(unit => unit.speciesId)).toEqual(['momo_queen', 'momo', 'kiki']);
    expect(empty[0].hp).toBe(empty[0].maxHp);
    expect(before[0].hp).toBe(5);
    expect(empty[0].row).toBe(before[0].row);
    expect(empty[1].hp).toBe(before[2].hp);
    expect(fusionStatBudget('momo').hpRatio).toBe(0.75);
  });

  it('基于实际HP快照，剔除过量伤害，不把护盾获得量写成吸收量', () => {
    const start = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'fifi' }], 42);
    const p = start.playerUnits[0], e = start.enemyUnits[0];
    const end = { ...start, log: [
      { text: '', side: 'player' as const, hp: { [p.uid]: p.hp - 3, [e.uid]: -30 }, shields: { [p.uid]: 5 } },
      { text: '', side: 'player' as const, hp: { [p.uid]: p.hp - 1, [e.uid]: -30 }, shields: { [p.uid]: 0 } },
    ] };
    expect(measureFusionBattle(start, end)).toMatchObject({ damage: e.hp, taken: 3, healing: 2, shielding: 5 });
  });

  it('前瞻不修改输入状态，复跑结果一致', () => {
    const encounter = fusionEncounters(1)[0];
    const b = createBattle(fusionTeam('momo', 'empty', false), encounter.enemies.map(speciesId => ({ speciesId })), 2000);
    const snapshot = JSON.stringify(b);
    planFusionRound(b, 'lookahead');
    expect(JSON.stringify(b)).toBe(snapshot);
    const a = simulateFusionTrial('momo', 'empty', 'lookahead', false, encounter, 2000);
    expect(simulateFusionTrial('momo', 'empty', 'lookahead', false, encounter, 2000)).toEqual(a);
    expect(a.result).not.toBe('timeout');
  });

  it('首领使用实际小怪，二阶进化预算仍按两只材料评估', () => {
    expect(fusionEncounters(2).at(-1)?.enemies).toEqual(['boss_golem', 'boss_minion_rock', 'boss_minion_crystal']);
    expect(fusionStatBudget('momo_queen')).toMatchObject({ pairHp: 30, fusedHp: 30, beforeActions: 2, afterActions: 1 });
  });

  it('六条链两个阶段在首领压力下两种策略均可复现', () => {
    for (const id of [...BASE_POOL, ...EVO1_POOL]) for (const policy of ['greedy', 'lookahead'] as const) {
      const encounter = fusionEncounters(EVO1_POOL.includes(id) ? 2 : 1).at(-1)!;
      const result = simulateFusionTrial(id, 'empty', policy, true, encounter, 2001);
      expect(simulateFusionTrial(id, 'empty', policy, true, encounter, 2001)).toEqual(result);
      expect(result.result).not.toBe('timeout');
    }
  });

  it('毒系起手对照真实使用该技能，拒绝不属于该形态的起手', () => {
    const encounter = fusionEncounters(1)[0];
    const result = simulateFusionTrial('mimi', 'empty', 'lookahead', false, encounter, 2000, 'poison_sting');
    expect(result.focusSkillUses.poison_sting).toBeGreaterThan(0);
    expect(result.openingSkill).toBe('poison_sting');
    expect(() => simulateFusionTrial('momo', 'empty', 'lookahead', false, encounter, 2000, 'poison_mist')).toThrow('无效起手技能');
  });
});
