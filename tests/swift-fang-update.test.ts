import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerSkill, playerEndTurn } from '../src/game/core/battle';
import { getSkillEnhanceBonus, getSkillEnhanceMaxLevel, getNormalSkillPool } from '../src/game/core/growth';
import { getSkill } from '../src/game/data/skills';
import { skillFullDesc } from '../src/ui/components';

describe('迅牙技能调整', () => {
  it('生命15与新固定技能组；旧技能仍保留给其他生物', () => {
    const unit = makeUnit('momo_queen', true, 0, false);
    expect(unit.maxHp).toBe(15);
    expect(unit.skills).toEqual(['swift_needle', 'flying_leaf', 'shockwave']);
    expect(makeUnit('momo', true, 0, false).skills).toContain('leaf_needle');
    expect(getSkill('double_hit').name).toBe('连击');
    expect(getSkill('shockwave').damage).toBe(5);
    expect(getSkill('swift_needle')).toMatchObject({ damage: 3, hits: 3, target: 'random' });
    expect(getSkillEnhanceMaxLevel('swift_needle')).toBe(2);
    expect(getSkillEnhanceBonus('swift_needle', 2).hitsBonus).toBe(2);
    expect(skillFullDesc(getSkill('swift_needle'), 2)).toContain('五次');
    for (const id of ['swift_needle', 'flying_leaf']) expect(getNormalSkillPool()).toContain(id);
  });
  it.each([3, 4, 5])('飞叶比较实际速度，目标速度%s，条件加伤固定3不随强化增长', spd => {
    for (const level of [0, 1, 2, 3]) {
      const actor = { ...makeUnit('momo', true, 0, false), passive: undefined, spd: 4, skills: ['flying_leaf'], skillEnhancements: { 0: level } };
      const b = createBattle([actor], [{ speciesId: 'momo' }], 1);
      b.playerUnits[0].spd = 4;
      b.enemyUnits[0] = { ...b.enemyUnits[0], passive: undefined, spd, hp: 100, maxHp: 100, skills: [], acted: true };
      const after = playerEndTurn(playerSkill(b, actor.uid, 'flying_leaf', b.enemyUnits[0].uid));
      expect(after.enemyUnits[0].hp).toBe(100 - (4 + level * 2 + (4 > spd ? 3 : 0)));
      expect(skillFullDesc(getSkill('flying_leaf'), level)).toContain(`造成${4 + level * 2}点伤害`);
      expect(skillFullDesc(getSkill('flying_leaf'), level)).toContain('额外造成3点伤害');
    }
  });
});
