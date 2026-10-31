import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerSkill, playerEndTurn } from '../src/game/core/battle';
import { skillFullDesc } from '../src/ui/components';
import { getSkill } from '../src/game/data/skills';

describe('蟒影、暗爪与铁卫调整', () => {
  it('生成新面板，蟒影命中附毒且不再对中毒目标额外加伤', () => {
    expect(makeUnit('mimi_king', true, 0, false)).toMatchObject({ maxHp: 14, spd: 5 });
    expect(makeUnit('gora', true, 0, false).spd).toBe(3);
    for (const poison of [0, 2]) {
      const b = createBattle([makeUnit('mimi_king', true, 0, false)], [{ speciesId: 'momo' }], 1);
      b.enemyUnits[0] = { ...b.enemyUnits[0], hp: 100, maxHp: 100, shield: 99, acted: true, skills: [], statuses: poison ? [{ kind: 'poison', value: poison, turns: 2 }] : [] };
      const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'shadow_claw', b.enemyUnits[0].uid));
      const hit = after.log.find(e => e.text.includes('使用「暗爪」攻击'))!;
      expect(hit.hp?.[b.enemyUnits[0].uid]).toBe(94);
      expect(hit.shields?.[b.enemyUnits[0].uid]).toBe(99);
      expect(hit.statuses?.[b.enemyUnits[0].uid].find(s => s.kind === 'poison')?.value).toBe(poison + 3);
    }
  });
  it('暗爪各档无视护盾但保留减伤，描述同步强化值', () => {
    for (const level of [0, 1, 2, 3]) {
      const actor = { ...makeUnit('momo', true, 0, false), skills: ['shadow_claw'], skillEnhancements: { 0: level } };
      const b = createBattle([actor], [{ speciesId: 'kiki' }], 1);
      b.enemyUnits[0] = { ...b.enemyUnits[0], hp: 100, maxHp: 100, shield: 99, acted: true, skills: [] };
      const after = playerEndTurn(playerSkill(b, actor.uid, 'shadow_claw', b.enemyUnits[0].uid));
      expect(after.enemyUnits[0].hp).toBe(100 - (6 + 2 * level - 1));
      expect(after.enemyUnits[0].shield).toBe(99);
      expect(skillFullDesc(getSkill('shadow_claw'), level)).toContain(`造成${6 + 2 * level}点伤害`);
    }
  });
});
