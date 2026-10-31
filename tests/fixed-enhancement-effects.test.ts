import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerEndTurn, playerSkill } from '../src/game/core/battle';
import { getSkillEnhanceBonus, getSkillEffectEnhanceBonus, getSkillEnhanceMaxLevel, canMasterEnhance } from '../src/game/core/growth';
import { getSkill } from '../src/game/data/skills';
import { skillFullDesc } from '../src/ui/components';

function cast(id: string, level: number, enemyActor = false) {
  const actor = { ...makeUnit('momo', !enemyActor, 0, false), name: '施法者', skills: [id, 'punch'], spd: 99, hp: 20, maxHp: 100, passive: undefined, skillEnhancements: { 0: level } };
  const victim = { ...makeUnit('momo', enemyActor, 0, false), hp: 100, maxHp: 100, passive: undefined, skills: ['punch', 'tail', 'bite', 'ember', 'shadow_claw', 'steel_spike'] };
  if (enemyActor) {
    // 敌方施法走相同技能结算；只保留该技能，使AI必定使用。
    actor.skills = [id];
    const b = createBattle([victim], [], 23, { mirrorUnits: [actor] });
    b.playerUnits[0].acted = true;
    return playerEndTurn(b);
  }
  const b = createBattle([actor], [], 23, { mirrorUnits: [victim] });
  b.enemyUnits[0].acted = true;
  return playerEndTurn(playerSkill(b, b.playerUnits[0].uid, id, getSkill(id).kind === 'heal' ? b.playerUnits[0].uid : b.enemyUnits[0].uid));
}

describe('控制、印记、封印与水幕不随强化放大', () => {
  it.each(['provoke', 'group_taunt', 'quake', 'rock_throw', 'shadow_rift', 'growth_bind', 'puppet_bind', 'tidal_domain'])('%s从0到4级固定附加效果，保留伤害或治疗成长', id => {
    const skill = getSkill(id), effect = skill.effects![0];
    const original = cast(id, 0);
    const target = skill.target === 'allyAll' ? original.playerUnits[0] : original.enemyUnits[0];
    const status = original.log.flatMap(entry => entry.statuses?.[target.uid] ?? []).find(s => s.kind === effect.kind || effect.kind === 'skillSeal' && s.kind === 'skillSealPending');
    expect(status).toBeDefined();
    for (let level = 1; level <= 4; level++) {
      expect(getSkillEffectEnhanceBonus(id, level, effect.kind)).toBe(0);
      expect(getSkillEnhanceBonus(id, level).effectBonus).toBe(0);
      const battle = cast(id, level), unit = skill.target === 'allyAll' ? battle.playerUnits[0] : battle.enemyUnits[0];
      const actual = battle.log.flatMap(entry => entry.statuses?.[unit.uid] ?? []).find(s => s.kind === status!.kind);
      expect(actual).toMatchObject({ value: status!.value, turns: status!.turns });
      if (effect.kind === 'skillSeal') expect(actual!.sealedSkills).toHaveLength(effect.value);
      if (skill.damage) expect(battle.enemyUnits[0].hp).toBe(target.hp - level);
      if (skill.heal) expect(battle.playerUnits[0].hp).toBe(target.hp + level * 2);
    }
  });
  it('暗影印记后续受伤始终加2，敌方强化同样保持基础效果', () => {
    for (const level of [0, 3, 4]) {
      let b = cast('shadow_rift', level), hp = b.enemyUnits[0].hp;
      b.enemyUnits[0].acted = true;
      b = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid));
      expect(hp - b.enemyUnits[0].hp).toBe(7);
      expect(cast('shadow_rift', level, true).playerUnits[0].statuses.find(s => s.kind === 'shadowMark')?.value).toBe(2);
    }
  });
  it('描述显示固定数值，普通增益、灼烧与护盾仍可强化', () => {
    expect(skillFullDesc(getSkill('shadow_rift'), 4)).toContain('受伤+2');
    expect(skillFullDesc(getSkill('tidal_domain'), 4)).toContain('受伤 -2');
    expect(skillFullDesc(getSkill('growth_bind'), 4)).toContain('2个随机技能1回合');
    expect(getSkillEffectEnhanceBonus('ember', 4, 'burn')).toBe(4);
    expect(getSkillEffectEnhanceBonus('shield_skill', 4, 'shield')).toBe(8);
    expect(getSkillEffectEnhanceBonus('roar', 4, 'atkUp')).toBe(4);
    expect(getSkillEnhanceMaxLevel('despair_gaze')).toBe(0);
    expect(canMasterEnhance({ ...makeUnit('momo', true, 0, false), skills: ['despair_gaze'] }, 0)).toBe(false);
  });
});
