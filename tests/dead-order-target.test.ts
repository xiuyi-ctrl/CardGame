import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerEndTurn, playerSkill } from '../src/game/core/battle';

describe('已指定目标失效时跳过行动', () => {
  it('敌方预选的目标被先行动者击杀后，同样跳过而不改选我方伙伴', () => {
    const battle = createBattle([makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)], [{ speciesId: 'momo' }, { speciesId: 'momo' }], 46);
    battle.playerUnits = battle.playerUnits.map((unit, i) => ({ ...unit, hp: i === 0 ? 1 : 50, maxHp: 50, passive: undefined, skills: [], spd: 1 }));
    battle.enemyUnits = battle.enemyUnits.map((unit, i) => ({ ...unit, skills: ['punch'], passive: 'blood_scent', spd: 99 - i }));
    const second = battle.enemyUnits[1];
    const after = playerEndTurn(battle);
    expect(after.playerUnits[0].hp).toBe(0);
    expect(after.playerUnits[1].hp).toBe(50);
    expect(after.log.some(entry => entry.actorUid === second.uid && entry.text.includes('本次行动跳过'))).toBe(true);
  });
  it('较快伙伴击杀指定敌人后，后续连击不转打其他敌人', () => {
    const battle = createBattle([makeUnit('momo', true, 0, false), makeUnit('fifi_king', true, 1, false)], [{ speciesId: 'lulu' }, { speciesId: 'lulu' }], 42);
    battle.playerUnits = battle.playerUnits.map((unit, i) => ({ ...unit, skills: i === 0 ? ['punch'] : ['flame_combo'], passive: undefined, spd: 99 - i }));
    battle.enemyUnits = battle.enemyUnits.map((unit, i) => ({ ...unit, hp: i === 0 ? 1 : 50, maxHp: 50, skills: [], passive: undefined, acted: true, row: 'front' }));
    const [first, second] = battle.playerUnits, target = battle.enemyUnits[0];
    const queued = playerSkill(playerSkill(battle, first.uid, 'punch', target.uid), second.uid, 'flame_combo', target.uid);
    const after = playerEndTurn(queued);
    expect(after.enemyUnits[0].hp).toBe(0);
    expect(after.enemyUnits[1].hp).toBe(50);
    expect(after.log.some(entry => entry.actorUid === second.uid && entry.text.includes('本次行动跳过'))).toBe(true);
    expect(after.log.some(entry => entry.actorUid === second.uid && entry.text.includes('使用「火焰连击」'))).toBe(false);
  });

  it('友方目标死亡后治疗不自动转给其他伙伴，也不消耗技能次数', () => {
    const battle = createBattle([makeUnit('lulu', true, 0, false), makeUnit('momo', true, 1, false)], [{ speciesId: 'lulu' }], 43);
    const [healer, target] = battle.playerUnits;
    healer.skills = ['heal_light']; healer.skillUses = { heal_light: 2 }; healer.hp = 2;
    battle.enemyUnits[0].skills = []; battle.enemyUnits[0].acted = true;
    const queued = playerSkill(battle, healer.uid, 'heal_light', target.uid);
    queued.playerUnits = queued.playerUnits.map(unit => unit.uid === target.uid ? { ...unit, hp: 0 } : unit);
    const after = playerEndTurn(queued);
    expect(after.playerUnits.find(unit => unit.uid === healer.uid)!.skillUses!.heal_light).toBe(2);
    expect(after.log.some(entry => entry.actorUid === healer.uid && entry.text.includes('本次行动跳过'))).toBe(true);
    expect(after.log.some(entry => entry.text.includes('使用「愈光」'))).toBe(false);
  });

  it('指定目标离场后不重新抽取其他目标', () => {
    const battle = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'lulu' }, { speciesId: 'lulu' }], 44);
    battle.playerUnits[0].skills = ['punch'];
    battle.enemyUnits.forEach(unit => { unit.acted = true; unit.skills = []; });
    const actor = battle.playerUnits[0], target = battle.enemyUnits[0];
    const queued = playerSkill(battle, actor.uid, 'punch', target.uid);
    queued.enemyUnits = queued.enemyUnits.filter(unit => unit.uid !== target.uid);
    const after = playerEndTurn(queued);
    expect(after.log.some(entry => entry.actorUid === actor.uid && entry.text.includes('本次行动跳过'))).toBe(true);
    expect(after.log.some(entry => entry.text.includes('使用「爪击」'))).toBe(false);
  });
});
