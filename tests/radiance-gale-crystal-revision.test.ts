import { expect, it } from 'vitest';
import { createBattle, makeUnit, playerEndTurn, playerSkill, skillCooldownLeft, radianceLayers } from '../src/game/core/battle';
import { getPassive } from '../src/game/data/passives';
import { getSkill } from '../src/game/data/skills';
import { getSkillEnhanceBonus } from '../src/game/core/growth';
import { skillBrief, skillFullDesc } from '../src/ui/components';

function quiet(id = 'solar_spirit', skill = 'solar_heal') {
  const b = createBattle([makeUnit(id, true, 0, false)], [{ speciesId: 'momo' }, { speciesId: 'lulu' }], 21);
  Object.assign(b.playerUnits[0], { skills: [skill], hp: 20, maxHp: 100, spd: 99 });
  b.enemyUnits.forEach((u, i) => Object.assign(u, { hp: 100, maxHp: 100, passive: undefined, skills: [], row: i === 0 ? 'front' : 'back', column: 0, spd: 5 }));
  return b;
}

it.each([0, 1, 2, 3])('日华%s层跨空回合不减少，日华治愈按3＋2N治疗', layers => {
  const b = quiet();
  b.playerUnits[0].statuses = layers ? [{ kind: 'sunRadiance', value: layers, turns: 0 }] : [];
  const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'solar_heal', b.playerUnits[0].uid));
  const heal = after.log.find(e => e.text.includes('日华治愈」，治愈'))!;
  expect(heal.impacts?.[b.playerUnits[0].uid].healing).toBe(3 + layers * 2);
  expect(radianceLayers(playerEndTurn(after).playerUnits[0])).toBe(layers);
  expect(after.log.some(e => e.text.includes('日华」衰减'))).toBe(false);
  expect(skillBrief(getSkill('solar_heal'))).toBe('+3+日华×2');
});

it('日华灼击对未灼烧目标直接附加2层，沿用每级基础伤害+2及固定灼烧2', () => {
  for (const level of [0, 1, 2, 3, 4]) {
    const b = quiet('solar_spirit', 'solar_strike');
    b.playerUnits[0].skillEnhancements = { 0: level };
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'solar_strike', b.enemyUnits[0].uid));
    const hit = after.log.find(e => e.text.includes('日华灼击」攻击'))!;
    expect(hit.impacts?.[b.enemyUnits[0].uid]).toMatchObject({ hpLoss: 3 + level * 2, addedStatuses: { burn: 2 } });
  }
});

it.each([false, true])('迅风对更慢目标固定+2，同速和更快目标不触发，不再吸血，敌方=%s', enemyActor => {
  for (const targetSpeed of [4, 7, 8, 9]) {
    const gale = { ...makeUnit('custom_gale', !enemyActor, 0, false), skills: ['punch'], hp: 10, spd: 8 };
    const target = { ...makeUnit('momo', enemyActor, 0, false), passive: undefined, skills: [], hp: 100, maxHp: 100, spd: targetSpeed };
    const b = enemyActor ? createBattle([target], [], 21, { mirrorUnits: [gale] }) : createBattle([gale], [], 21, { mirrorUnits: [target] });
    const actor = (enemyActor ? b.enemyUnits : b.playerUnits)[0], victim = (enemyActor ? b.playerUnits : b.enemyUnits)[0];
    const after = playerEndTurn(enemyActor ? b : playerSkill(b, actor.uid, 'punch', victim.uid));
    const hit = after.log.find(e => e.actorUid === actor.uid && e.text.includes('使用「爪击」攻击'))!;
    expect(hit.impacts?.[victim.uid].hpLoss).toBe(getSkill('punch').damage! + (targetSpeed < 8 ? 2 : 0));
    expect((enemyActor ? after.enemyUnits : after.playerUnits)[0].hp).toBe(10);
  }
  expect(getPassive('swift_wind')).toMatchObject({ kind: 'fasterDamage', value: 2 });
  expect(getPassive('swift_wind')?.desc).not.toContain('恢复');
});

it('砂盾连续回合可用，忽略旧冷却计数，强化与回溯加盾保留', () => {
  let b = quiet('time_sand_beast', 'sand_shield');
  b.playerUnits[0].skillCooldowns = { sand_shield: 9 };
  expect(skillCooldownLeft(b.playerUnits[0], 'sand_shield')).toBe(0);
  for (let i = 0; i < 2; i++) b = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'sand_shield'));
  expect(b.playerUnits[0].shield).toBe(8);
  expect(getSkillEnhanceBonus('sand_shield', 3).effectBonus).toBe(6);
});

it.each(['core_crystal_spike', 'core_crystal_burst'])('%s前排存活时不能直接命中后排，前排清空后可攻击后排', id => {
  const b = quiet('crystal_core_beast', id);
  b.playerUnits[0].passive = undefined;
  b.playerUnits[0].shield = 3;
  const back = b.enemyUnits[1];
  const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, id, back.uid));
  expect(after.enemyUnits[1].hp).toBe(100);
  expect(after.enemyUnits[0].hp).toBeLessThan(100);
  expect(getSkill(id).reach).toBe('front');
  const open = quiet('crystal_core_beast', id);
  open.playerUnits[0].passive = undefined;
  open.enemyUnits[0].hp = 0;
  const result = playerEndTurn(playerSkill(open, open.playerUnits[0].uid, id, open.enemyUnits[1].uid));
  expect(result.enemyUnits[1].hp).toBeLessThan(100);
});

it('晶刺有盾时固定额外3，强化不放大条件加伤', () => {
  for (const level of [0, 1, 2, 3, 4]) {
    const b = quiet('crystal_core_beast', 'core_crystal_spike');
    Object.assign(b.playerUnits[0], { passive: undefined, shield: 1, skillEnhancements: { 0: level } });
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'core_crystal_spike', b.enemyUnits[0].uid));
    const hit = after.log.find(e => e.text.includes('使用「晶刺」攻击'))!;
    expect(hit.impacts?.[b.enemyUnits[0].uid].hpLoss).toBe(6 + level * 2);
    expect(skillBrief(getSkill('core_crystal_spike'), level)).toContain('有盾+3');
    expect(skillFullDesc(getSkill('core_crystal_spike'), level)).toContain('额外造成3点伤害');
  }
});
