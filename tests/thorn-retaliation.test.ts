import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerEndTurn, playerSkill } from '../src/game/core/battle';
import { MONSTERS } from '../src/game/data/monsters';
import { getSkill } from '../src/game/data/skills';
import { getSkillEnhanceBonus } from '../src/game/core/growth';
import { skillFullDesc } from '../src/ui/components';

function setup(first = false, side = 'player') {
  const b = createBattle([makeUnit('pipi', true, 0, false)], [{ speciesId: 'pipi' }], 17);
  for (const u of [...b.playerUnits, ...b.enemyUnits]) Object.assign(u, { hp: 100, maxHp: 100, statuses: [], shield: 0, passive: undefined });
  const actor = side === 'player' ? b.playerUnits[0] : b.enemyUnits[0];
  const other = side === 'player' ? b.enemyUnits[0] : b.playerUnits[0];
  Object.assign(actor, { skills: ['thorn_retaliation'], passive: 'spike', spd: first ? 99 : 1 });
  Object.assign(other, { skills: ['punch'], spd: first ? 1 : 99 });
  return { b, actor, other };
}
function hits(b: ReturnType<typeof createBattle>) {
  return b.log.filter(e => e.text.includes('使用「刺反」攻击')).map(e => Number(e.text.match(/造成 (\d+) 伤害/)![1]));
}

describe('刺刺刺反', () => {
  it('只替换刺刺的固定技能和说明，其他生物的挑衅保留', () => {
    expect(MONSTERS.pipi.skills).toEqual(['weaken', 'thorn_retaliation']);
    expect(MONSTERS.pipi.desc).toBe('速度缓慢，受击反伤');
    expect(MONSTERS.sisi.skills).toContain('provoke');
    expect(getSkill('thorn_retaliation')).toMatchObject({ damage: 2, target: 'single', kind: 'attack' });
    expect(getSkill('thorn_retaliation').cooldown).toBeUndefined();
    expect(getSkill('thorn_retaliation').uses).toBeUndefined();
  });
  it('先出手时为2，后出手且自身已反伤时为3，敌我双方一致', () => {
    for (const first of [true, false]) for (const side of ['player', 'enemy']) {
      const { b, actor, other } = setup(first, side);
      const p = b.playerUnits[0], e = b.enemyUnits[0];
      const result = playerEndTurn(playerSkill(b, p.uid, p.skills[0], e.uid));
      expect(hits(result)).toEqual([first ? 2 : 3]);
      expect([...result.playerUnits, ...result.enemyUnits].find(u => u.uid === actor.uid)?.counterTriggeredRound).toBe(1);
      expect([...result.playerUnits, ...result.enemyUnits].find(u => u.uid === other.uid)?.counterTriggeredRound).toBeUndefined();
    }
  });
  it('上回合反伤不沿用；下场战斗清空标记', () => {
    const { b, actor, other } = setup();
    const next = playerEndTurn(playerSkill(b, actor.uid, 'thorn_retaliation', other.uid));
    next.testEnemyInactive = true;
    const after = playerEndTurn(playerSkill(next, actor.uid, 'thorn_retaliation', other.uid));
    expect(hits(after)).toEqual([3, 2]);
    expect(createBattle(after.playerUnits, [{ speciesId: 'pipi' }], 18).playerUnits[0].counterTriggeredRound).toBeUndefined();
  });
  it.each([0, 1, 2, 3, 4])('强化%s级基础伤害和条件伤害均正确，条件额外1不放大', level => {
    const { b, actor, other } = setup();
    actor.skillEnhancements = { 0: level };
    const result = playerEndTurn(playerSkill(b, actor.uid, 'thorn_retaliation', other.uid));
    expect(hits(result)).toEqual([3 + level * 2]);
    expect(getSkillEnhanceBonus('thorn_retaliation', level).damageBonus).toBe(level * 2);
    const desc = skillFullDesc(getSkill('thorn_retaliation'), level);
    expect(desc).toContain(`造成${2 + level * 2}点伤害`);
    expect(desc).toContain(`改为${3 + level * 2}点伤害`);
  });
});
