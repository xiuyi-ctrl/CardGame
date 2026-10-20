import { describe, expect, it } from 'vitest';
import { getSkill } from '../src/game/data/skills';
import { skillFullDesc } from '../src/ui/components';

describe('技能描述护盾数值', () => {
  it('灰烬庇护保留额外2点护盾，不被基础护盾数值覆盖', () => {
    expect(skillFullDesc(getSkill('ash_shelter'))).toContain('获得4点护盾');
    expect(skillFullDesc(getSkill('ash_shelter'))).toContain('额外获得2点护盾');
  });

  it('强化只更新基础护盾，不改变条件额外护盾', () => {
    const desc = skillFullDesc(getSkill('ash_shelter'), 1);
    expect(desc).not.toContain('伙伴获得4点护盾');
    expect(desc).toContain('额外获得2点护盾');
  });
});
