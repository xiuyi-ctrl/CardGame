import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerEndTurn, playerSkill, skillUsesLeft } from '../src/game/core/battle';
import { MONSTERS } from '../src/game/data/monsters';
import { SKILLS } from '../src/game/data/skills';
import { getSkillEnhanceBonus } from '../src/game/core/growth';
import { skillFullDesc } from '../src/ui/components';

describe('六条原生传奇数值更新', () => {
  it.each([
    ['lulu_god', 30, 5], ['sisi_god', 26, 4], ['gora_god', 26, 4],
    ['mimi_god', 22, 6], ['momo_god', 22, 5], ['fifi_god', 20, 7],
  ] as const)('%s固定属性为%d生命、%d速度', (id, hp, spd) => {
    expect([MONSTERS[id].baseHp, MONSTERS[id].baseSpd]).toEqual([hp, spd]);
    const unit = makeUnit(id, true, 0, false);
    expect([unit.maxHp, unit.hp, unit.spd]).toEqual([hp, hp, spd]);
  });
  it.each([[0, 3], [2, 5], [10, 6]])('余烬焚身目标原有%d灼烧时，3基础伤害变为%d', (burn, damage) => {
    const actor = { ...makeUnit('fifi_god', true, 0, false), skills: ['claw_attack'] };
    let b = createBattle([actor], [{ speciesId: 'momo' }], 41);
    b.enemyUnits[0] = { ...b.enemyUnits[0], hp: 100, maxHp: 100, passive: undefined, shield: 0, acted: true,
      statuses: burn ? [{ kind: 'burn', value: burn, turns: 3 }] : [] };
    b = playerEndTurn(playerSkill(b, actor.uid, 'claw_attack', b.enemyUnits[0].uid));
    const log = b.log.find(entry => entry.text.includes('使用「爪击」攻击'))!;
    expect(log.hp![b.enemyUnits[0].uid]).toBe(100 - damage);
    expect(log.statuses![b.enemyUnits[0].uid].find(status => status.kind === 'burn')?.value).toBe(burn + 3);
  });
  it('旧存档残余战吼次数为0也不限制使用，可连续三回合施放', () => {
    const unit = { ...makeUnit('fifi_king', true, 0, false), skillUses: { roar: 0 } };
    let b = createBattle([unit], [{ speciesId: 'momo' }], 2);
    for (let round = 0; round < 3; round++) {
      b.enemyUnits[0] = { ...b.enemyUnits[0], skills: [], acted: true };
      b = playerEndTurn(playerSkill(b, unit.uid, 'roar', unit.uid));
      expect(skillUsesLeft(b.playerUnits[0], 'roar')).toBe(Infinity);
    }
    expect(b.log.filter(entry => entry.text.includes('使用「战吼」'))).toHaveLength(3);
  });
  it('烈焰护盾实际反灼烧5层，保留5盾、5次及1回合冷却', () => {
    const unit = { ...makeUnit('momo', true, 0, false), passive: undefined, skills: ['flame_shield'] };
    let b = createBattle([unit], [{ speciesId: 'momo' }], 1);
    b.enemyUnits[0] = { ...b.enemyUnits[0], passive: undefined, skills: ['claw_attack'], hp: 100, maxHp: 100 };
    b = playerEndTurn(playerSkill(b, unit.uid, 'flame_shield', unit.uid));
    const log = b.log.find(entry => entry.text.includes('的「烈焰护盾」灼烧'))!;
    expect(log.text).toContain('5 层');
    expect(SKILLS.flame_shield).toMatchObject({ uses: 5, cooldown: 1 });
    expect(SKILLS.flame_shield.effects?.[0].value).toBe(5);
  });
  it('焚身爆技能附灼烧2层，强化后3/4/5层；烈焰护盾反灼烧5/6/7/8层', () => {
    expect(SKILLS.burn_burst.effects?.[0].value).toBe(2);
    expect(SKILLS.burn_burst.uses).toBe(1);
    for (let level = 0; level <= 3; level++) {
      const bonus = getSkillEnhanceBonus('burn_burst', level);
      expect(2 + bonus.effectBonus).toBe(2 + level);
      expect(skillFullDesc(SKILLS.burn_burst, level)).toContain(`灼烧${2 + level}层`);
      expect(skillFullDesc(SKILLS.flame_shield, level)).toContain(`灼烧攻击者 ${5 + level} 层`);
    }
  });
});
