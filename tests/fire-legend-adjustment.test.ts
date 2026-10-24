import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerEndTurn, playerSkill, skillUsesLeft, skillCooldownLeft, getDamageBonus } from '../src/game/core/battle';
import { SKILLS } from '../src/game/data/skills';

function quiet(species: string) {
  const b = createBattle([makeUnit(species, true, 0, false)], [{ speciesId: 'momo' }, { speciesId: 'lulu' }], 8);
  b.enemyUnits = b.enemyUnits.map(unit => ({ ...unit, row: 'front', hp: 200, maxHp: 200, passive: undefined, shield: 0, skills: [], acted: true }));
  return b;
}
describe('灼烧传奇后续调整', () => {
  it.each([['furnace_beast',29,3],['molten_beast',25,4],['solar_eagle',21,7],['nine_tail_sovereign',20,6],['torch_fox_lord',22,6]] as const)('%s生命速度更新', (id,hp,spd) => {
    const unit=makeUnit(id,true,0,false); expect([unit.maxHp,unit.spd]).toEqual([hp,spd]);
  });
  it('只有熔甲兽持盾获得1伤，不影响熔甲虫', () => {
    for(const [id,expected] of [['molten_beast',1],['molten_beetle',0]] as const){
      const unit=makeUnit(id,true,0,false);
      expect(getDamageBonus(unit)).toBe(0); expect(getDamageBonus({...unit,shield:1})).toBe(expected);
    }
  });
  it.each([[1,4],[5,8],[6,9]])('裂壳冲撞原有%d盾，实际造成%d伤害', (shield,damage) => {
    let b=quiet('molten_beast'); b.playerUnits[0].shield=shield;
    b=playerEndTurn(playerSkill(b,b.playerUnits[0].uid,'shell_charge',b.enemyUnits[0].uid));
    const log=b.log.find(entry=>entry.text.includes('使用「裂壳冲撞」攻击'))!;
    expect(log.hp![b.enemyUnits[0].uid]).toBe(200-damage);
  });
  it('余烬迁移最多6层、总层数不变，无冷却可下一回合再用', () => {
    let b=quiet('eternal_moth'); b.enemyUnits[0].statuses=[{kind:'burn',value:10,turns:3}];
    b=playerEndTurn(playerSkill(b,b.playerUnits[0].uid,'ember_transfer',b.enemyUnits[0].uid));
    const log=b.log.find(entry=>entry.text.includes('使用「余烬迁移」'))!;
    expect(log.statuses![b.enemyUnits[0].uid].find(s=>s.kind==='burn')?.value).toBe(4);
    expect(log.statuses![b.enemyUnits[1].uid].find(s=>s.kind==='burn')?.value).toBe(6);
    expect(skillCooldownLeft(b.playerUnits[0],'ember_transfer')).toBe(0);
    expect(playerSkill(b,b.playerUnits[0].uid,'ember_transfer',b.enemyUnits[0].uid)).not.toBe(b);
  });
  it('日华治愈无冷却，连续施放有效', () => {
    let b=quiet('solar_spirit'); b.playerUnits[0].hp=5;
    b.playerUnits[0].skillCooldowns={solar_heal:3,ember_transfer:3};
    expect(skillCooldownLeft(b.playerUnits[0],'ember_transfer')).toBe(0);
    for(let i=0;i<2;i++){
      b.enemyUnits=b.enemyUnits.map(u=>({...u,acted:true}));
      b=playerEndTurn(playerSkill(b,b.playerUnits[0].uid,'solar_heal',b.playerUnits[0].uid));
      expect(skillCooldownLeft(b.playerUnits[0],'solar_heal')).toBe(0);
    }
    expect(b.playerUnits[0].hp).toBe(11);
  });
  it('焰尾护盾每场限2次，第三次拒绝，冷却仍为1', () => {
    let b=quiet('nine_tail_sovereign');
    for(let i=0;i<2;i++){
      b.enemyUnits=b.enemyUnits.map(u=>({...u,acted:true}));
      b.playerUnits[0].skillCooldowns={};
      b=playerEndTurn(playerSkill(b,b.playerUnits[0].uid,'flame_tail_shield'));
      expect(skillUsesLeft(b.playerUnits[0],'flame_tail_shield')).toBe(1-i);
    }
    expect(SKILLS.flame_tail_shield.cooldown).toBe(1);
    b.playerUnits[0].skillCooldowns={};
    expect(playerSkill(b,b.playerUnits[0].uid,'flame_tail_shield')).toBe(b);
  });
});
