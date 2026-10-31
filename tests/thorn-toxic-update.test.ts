import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerEndTurn, playerSkill, skillCooldownLeft } from '../src/game/core/battle';
import { getSkill } from '../src/game/data/skills';
import { getSkillEnhanceBonus } from '../src/game/core/growth';

function fixture(skill: string) {
  const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'fifi' }], 42);
  b.playerUnits[0] = { ...b.playerUnits[0], passive: undefined, spd: 99, skills: [skill] };
  b.enemyUnits[0] = { ...b.enemyUnits[0], passive: undefined, skills: [], acted: true, hp: 100, maxHp: 100 };
  return b;
}

describe('荆棘与淬毒噬咬调整', () => {
  it('荆棘冷却1回合，使用后下一回合不可用，再下一回合恢复', () => {
    expect(getSkill('thorn_skill').cooldown).toBe(1);
    const b = fixture('thorn_skill');
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'thorn_skill', b.enemyUnits[0].uid));
    expect(skillCooldownLeft(after.playerUnits[0], 'thorn_skill')).toBe(1);
    const next = playerEndTurn(after);
    expect(skillCooldownLeft(next.playerUnits[0], 'thorn_skill')).toBe(0);
  });
  it.each([false, true])('淬毒噬咬已中毒=%s时主伤害为4或8，中毒与次数规则保留', poisoned => {
    const b = fixture('toxic_bite');
    if (poisoned) b.enemyUnits[0].statuses = [{ kind: 'poison', value: 2, turns: 3 }];
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'toxic_bite', b.enemyUnits[0].uid));
    const hit = after.log.find(entry => entry.text.includes('使用「淬毒噬咬」攻击'))!;
    expect(hit.impacts?.[b.enemyUnits[0].uid].hpLoss).toBe(poisoned ? 8 : 4);
    expect(getSkill('toxic_bite').uses).toBe(3);
    expect(getSkill('toxic_bite').effects).toBeUndefined();
    expect(hit.impacts?.[b.enemyUnits[0].uid].addedStatuses?.poison).toBeUndefined();
  });
  it('淬毒噬咬为纯攻击强化，后三档伤害6、8、10，不再附毒', () => {
    for (const level of [1, 2, 3]) {
      const bonus = getSkillEnhanceBonus('toxic_bite', level);
      expect(getSkill('toxic_bite').damage! + bonus.damageBonus).toBe(4 + level * 2);
      expect(getSkill('toxic_bite').effects).toBeUndefined();
    }
  });
});
