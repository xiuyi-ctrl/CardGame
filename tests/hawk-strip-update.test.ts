import { describe, expect, it } from 'vitest';
import { canUnitUseSkill, createBattle, makeUnit, playerEndTurn, playerSkill, skillUsesLeft } from '../src/game/core/battle';
import { getSkill } from '../src/game/data/skills';

function setup(speciesId = 'ember_hawk', skillId = 'punch', count = 1) {
  const b = createBattle([makeUnit(speciesId, true, 0, false)], Array.from({ length: count }, () => ({ speciesId: 'momo' })), 17);
  b.playerUnits = b.playerUnits.map(u => ({ ...u, skills: [skillId], hp: 500, maxHp: 500, spd: 99 }));
  b.enemyUnits = b.enemyUnits.map(u => ({ ...u, row: 'front', hp: 500, maxHp: 500, skills: [], passive: undefined, acted: true }));
  return b;
}

describe('灼烧剥甲改版', () => {
  it.each([['ember_hawk', 1], ['searing_hawk', 2], ['solar_eagle', 2]] as const)('%s 对攻击前已燃烧无盾目标加伤%s，剥光护盾不追补加伤', (species, bonus) => {
    for (const shield of [0, 1]) {
      const b = setup(species);
      b.enemyUnits[0].shield = shield;
      b.enemyUnits[0].statuses = [{ kind: 'burn', value: 4, turns: 2 }];
      const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid));
      const hit = after.log.find(e => e.actorUid === b.playerUnits[0].uid && e.text.includes('使用「爪击」攻击'))!;
      expect(hit.hp?.[b.enemyUnits[0].uid]).toBe(500 - getSkill('punch').damage! - (shield ? 0 : bonus));
    }
  });

  it.each([1, 4, 5, 20])('烈日销甲按攻击前%s层灼烧移除min(3+层数,8)护盾', burn => {
    const b = setup('solar_eagle');
    b.enemyUnits[0].shield = 30;
    b.enemyUnits[0].statuses = [{ kind: 'burn', value: burn, turns: 2 }];
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid));
    const strip = after.log.find(e => e.text.includes('烈日销甲」剥除'))!;
    expect(strip.shields?.[b.enemyUnits[0].uid]).toBe(30 - Math.min(3 + burn, 8));
  });

  it('多段只对第一段加伤，群攻只对一名目标加伤；已用标记不会刷新', () => {
    const b = setup('searing_hawk', 'double_hit');
    b.enemyUnits[0].statuses = [{ kind: 'burn', value: 8, turns: 2 }];
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'double_hit', b.enemyUnits[0].uid));
    const hits = after.log.filter(e => e.actorUid === b.playerUnits[0].uid && e.text.includes('攻击') && e.text.includes('造成'));
    const base = getSkill('double_hit').damage!;
    expect(hits).toHaveLength(2);
    expect(hits[0].hp?.[b.enemyUnits[0].uid]).toBe(500 - base - 2);
    expect(hits[1].hp?.[b.enemyUnits[0].uid]).toBe(500 - base * 2 - 2);
    const group = setup('searing_hawk', 'tail', 3);
    group.enemyUnits.forEach(u => { u.statuses = [{ kind: 'burn', value: 8, turns: 2 }]; });
    const result = playerEndTurn(playerSkill(group, group.playerUnits[0].uid, 'tail'));
    const attacks = result.log.filter(e => e.actorUid === group.playerUnits[0].uid && e.text.includes('攻击') && e.text.includes('造成'));
    expect(attacks.map(e => 500 - e.hp![e.targetUid!])).toEqual([getSkill('tail').damage! + 2, getSkill('tail').damage!, getSkill('tail').damage!]);
    b.playerUnits[0].burnStripUsed = true;
    const spent = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'double_hit', b.enemyUnits[0].uid));
    expect(spent.log.some(e => e.text.includes('本次伤害增加'))).toBe(false);
  });

  it.each(['sun_sunder', 'nine_tail_wildfire'])('%s 敌我每场只能使用三次，仍保留一回合冷却', skillId => {
    let b = setup('momo', skillId);
    for (let i = 0; i < 3; i++) {
      b = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, skillId, b.enemyUnits[0].uid));
      expect(skillUsesLeft(b.playerUnits[0], skillId)).toBe(2 - i);
      expect(canUnitUseSkill(b.playerUnits[0], skillId)).toBe(false);
      b = playerEndTurn(b);
    }
    expect(playerSkill(b, b.playerUnits[0].uid, skillId, b.enemyUnits[0].uid)).toBe(b);
    let enemy = setup();
    enemy.playerUnits[0].passive = undefined;
    enemy.enemyUnits[0] = { ...enemy.enemyUnits[0], acted: false, skills: [skillId] };
    for (let i = 0; i < 6; i++) enemy = playerEndTurn(enemy);
    expect(skillUsesLeft(enemy.enemyUnits[0], skillId)).toBe(0);
    expect(enemy.log.filter(e => e.actorUid === enemy.enemyUnits[0].uid && e.text.includes('攻击') && e.text.includes('造成'))).toHaveLength(3);
  });
});
