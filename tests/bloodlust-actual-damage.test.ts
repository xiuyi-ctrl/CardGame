import { expect, it } from 'vitest';
import { createBattle, makeUnit, playerEndTurn, playerSkill } from '../src/game/core/battle';

function attack(hp: number, shield = 0, skill = 'punch', actorHp = 1, drain = 5) {
  const actor = { ...makeUnit('momo', true, 0, false), skills: [skill], hp: actorHp, maxHp: 30, passive: undefined, spd: 99 };
  const victim = { ...makeUnit('momo', false, 0, false), hp, maxHp: 100, shield, passive: undefined, skills: [] };
  const b = createBattle([actor], [], 3, { mirrorUnits: [victim] });
  b.playerUnits[0].statuses = [{ kind: 'bloodDrain', value: drain, turns: 2 }];
  b.enemyUnits[0].acted = true;
  return playerEndTurn(playerSkill(b, b.playerUnits[0].uid, skill, b.enemyUnits[0].uid));
}
it('吸血5，目标只剩4血，击杀只能回复4血', () => {
  const b = attack(4);
  expect(b.playerUnits[0].hp).toBe(5);
  expect(b.log.find(log => log.text.includes('「嗜血」恢复'))?.text).toContain('恢复 4 点生命');
});
it.each([[1, 0, 1], [100, 0, 5], [1, 1, 2], [100, 1, 5], [1, 2, 3]])('生命%d、盾%d时实际伤害限制回复%d', (hp, shield, healing) => {
  expect(attack(hp, shield).playerUnits[0].hp).toBe(1 + healing);
});
it('保留护盾受损触发规则，且回血不超过自身缺血', () => {
  expect(attack(100, 100).playerUnits[0].hp).toBe(6);
  expect(attack(4, 0, 'punch', 29).playerUnits[0].hp).toBe(30);
});
it('连击逐段限制，目标4血只回复合计4血', () => {
  const b = attack(4, 0, 'double_hit');
  expect(b.playerUnits[0].hp).toBe(5);
  expect(b.log.filter(log => log.text.includes('「嗜血」恢复')).map(log => log.text.match(/恢复 (\d+)/)?.[1])).toEqual(['2', '2']);
});
it('高强化吸血同样不能从击杀溢出中多回血', () => {
  expect(attack(4, 0, 'punch', 1, 6).playerUnits[0].hp).toBe(5);
});
