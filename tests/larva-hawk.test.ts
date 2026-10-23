import { describe, expect, it } from 'vitest';
import { canUnitUseSkill, createBattle, flameTracingTargets, makeUnit, planEnemyLayout, playerEndTurn, playerSkill, skillCooldownLeft } from '../src/game/core/battle';
import { getSkillEnhanceBonus, getNormalSkillPool } from '../src/game/core/growth';
import { getGrowthEncounter, TIER1 } from '../src/game/core/growth-map';
import { getSkill } from '../src/game/data/skills';
import { MAIN_BASE_POOL, MONSTERS, STARTER_GROUP_1, STARTER_GROUP_2 } from '../src/game/data/monsters';
import { generateMap, generateRewards, nextStage } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { parseEvent } from '../src/ui/battleFx';
import { skillFullDesc } from '../src/ui/components';
import type { BattleState } from '../src/game/types';

function calm(speciesId: string, enemies = ['momo']): BattleState {
  const raw = createBattle([makeUnit(speciesId, true, 0, false)], enemies.map(id => ({ speciesId: id })), 19);
  return { ...raw, enemyUnits: raw.enemyUnits.map(unit => ({ ...unit, hp: 500, maxHp: 500, skills: [], acted: true })) };
}

describe('熔壳虫与焚风雏鹰', () => {
  it('两只一阶属性、固定技能、站位和图鉴数据正确，连接二阶且开局不变', () => {
    const larva = makeUnit('molten_larva', true, 0, false);
    const hawk = makeUnit('ember_hawk', true, 1, false);
    expect([larva.maxHp, larva.spd]).toEqual([14, 2]);
    expect([hawk.maxHp, hawk.spd]).toEqual([10, 5]);
    expect(larva.skills).toEqual(['heated_shell_bump', 'molten_self_burn']);
    expect(hawk.skills).toEqual(['flame_tracing_feather', 'fire_feather']);
    for (const id of ['molten_larva', 'ember_hawk']) {
      expect(nextStage(id)).toBe(id === 'molten_larva' ? 'molten_beetle' : 'searing_hawk');
      expect(MONSTERS[id].desc).toBeTruthy();
      expect(MAIN_BASE_POOL).toContain(id);
      expect(TIER1).toContain(id);
    }
    expect(planEnemyLayout([{ speciesId: 'molten_larva' }, { speciesId: 'ember_hawk' }]).map(u => u.row)).toEqual(['front', 'back']);
    expect([...STARTER_GROUP_1, ...STARTER_GROUP_2]).toEqual(['momo', 'lulu', 'fifi', 'kiki', 'mimi', 'pipi']);
  });

  it('自焚不自损，先加4火2盾，再扣2灼烧生命，消耗剩余2层换4盾', () => {
    const b = calm('molten_larva');
    const uid = b.playerUnits[0].uid;
    const after = playerEndTurn(playerSkill(b, uid, 'molten_self_burn'));
    expect(after.playerUnits[0].hp).toBe(12);
    expect(after.playerUnits[0].shield).toBe(6);
    expect(after.playerUnits[0].statuses.some(s => s.kind === 'burn')).toBe(false);
    expect(skillCooldownLeft(after.playerUnits[0], 'molten_self_burn')).toBe(0);
    const cast = after.log.find(e => e.text.includes('使用「熔火自焚」，强化自身'))!;
    const dot = after.log.findIndex(e => e.text.includes('受到灼烧 2 点伤害'));
    const conversion = after.log.findIndex(e => e.text.includes('的「热壳换火」获得'));
    expect(cast.hp?.[uid]).toBe(14);
    expect(cast.shields?.[uid]).toBe(2);
    expect(cast.statuses?.[uid].find(s => s.kind === 'burn')?.value).toBe(4);
    expect(dot).toBeLessThan(conversion);
    expect(parseEvent(after, cast)).toMatchObject({ kind: 'buff', targetUid: uid, addsStatus: ['burn'] });
    expect(parseEvent(after, after.log[conversion])).toMatchObject({ kind: 'buff', targetUid: uid });
    const repeated = playerEndTurn(playerSkill(after, uid, 'molten_self_burn'));
    expect(repeated.log.filter(e => e.text.includes('自身损失 1 点生命'))).toHaveLength(0);
    expect(repeated.playerUnits[0].hp).toBe(10);
    expect(repeated.playerUnits[0].shield).toBe(12);
    expect(skillCooldownLeft(repeated.playerUnits[0], 'molten_self_burn')).toBe(0);
  });

  it('生命1仍能选择和施放自焚，但随后灼烧致死不能转换', () => {
    const b = calm('molten_larva');
    const uid = b.playerUnits[0].uid;
    const low = { ...b, playerUnits: b.playerUnits.map(u => ({ ...u, hp: 1 })) };
    expect(canUnitUseSkill(low.playerUnits[0], 'molten_self_burn')).toBe(true);
    expect(playerSkill(low, uid, 'molten_self_burn').orders?.[uid]?.skillId).toBe('molten_self_burn');
    const ordered = playerSkill(b, uid, 'molten_self_burn');
    const stopped = playerEndTurn({ ...ordered, playerUnits: ordered.playerUnits.map(u => ({ ...u, hp: 1 })) });
    expect(stopped.log.some(e => e.text.includes('自身损失'))).toBe(false);
    expect(stopped.log.some(e => e.text.includes('使用「熔火自焚」，强化自身'))).toBe(true);
    const fatal = playerEndTurn(playerSkill({ ...b, playerUnits: b.playerUnits.map(u => ({ ...u, hp: 2 })) }, uid, 'molten_self_burn'));
    expect(fatal.playerUnits[0].hp).toBe(0);
    expect(fatal.log.some(e => e.text.includes('热壳换火'))).toBe(false);
  });

  it('顶撞正常攻击，无火不换盾，有火立即耗1层换盾抵挡反伤', () => {
    const b = calm('molten_larva');
    const actor = b.playerUnits[0];
    const ordinary = playerEndTurn(playerSkill(b, actor.uid, 'heated_shell_bump', b.enemyUnits[0].uid));
    expect(ordinary.enemyUnits[0].hp).toBe(496);
    expect(ordinary.playerUnits[0].shield).toBe(0);
    const burning: BattleState = { ...b, playerUnits: [{ ...actor, statuses: [{ kind: 'burn', value: 1, turns: 2 }] }] };
    const warm = playerEndTurn(playerSkill(burning, actor.uid, 'heated_shell_bump', b.enemyUnits[0].uid));
    expect(warm.playerUnits[0].hp).toBe(14);
    expect(warm.playerUnits[0].shield).toBe(2);
    expect(warm.playerUnits[0].statuses.some(s => s.kind === 'burn')).toBe(false);
    const countered = { ...burning, playerUnits: [{ ...burning.playerUnits[0], hp: 1 }], enemyUnits: burning.enemyUnits.map(u => ({ ...u, passive: 'spike' })) };
    const guarded = playerEndTurn(playerSkill(countered, actor.uid, 'heated_shell_bump', b.enemyUnits[0].uid));
    expect(guarded.playerUnits[0].hp).toBe(1);
    expect(guarded.playerUnits[0].shield).toBe(0);
    const shieldIndex = guarded.log.findIndex(e => e.text.includes('的「热壳顶撞」获得'));
    const counterIndex = guarded.log.findIndex(e => e.text.includes('反伤'));
    expect(shieldIndex).toBeGreaterThan(-1);
    expect(counterIndex).toBeGreaterThan(shieldIndex);
  });

  it('灼羽先剥2盾再伤害，不把剩余剥盾值变成生命伤害；攻击才点火不触发', () => {
    const b = calm('ember_hawk');
    const actor = b.playerUnits[0];
    const burning: BattleState = { ...b, enemyUnits: b.enemyUnits.map(u => ({ ...u, shield: 4, statuses: [{ kind: 'burn', value: 4, turns: 2 }] })) };
    const after = playerEndTurn(playerSkill(burning, actor.uid, 'flame_tracing_feather', b.enemyUnits[0].uid));
    const attack = after.log.find(e => e.text.includes('使用「循焰飞羽」攻击'))!;
    expect(attack.hp?.[b.enemyUnits[0].uid]).toBe(498);
    expect(attack.shields?.[b.enemyUnits[0].uid]).toBe(0);
    const strip = after.log.find(e => e.text.includes('的「灼羽剥甲」剥除'))!;
    expect(strip.shields?.[b.enemyUnits[0].uid]).toBe(2);
    expect(parseEvent(after, strip)).toMatchObject({ kind: 'buff', targetUid: b.enemyUnits[0].uid, value: 0 });
    const thin = { ...burning, enemyUnits: burning.enemyUnits.map(u => ({ ...u, shield: 1 })) };
    const thinResult = playerEndTurn(playerSkill(thin, actor.uid, 'flame_tracing_feather', b.enemyUnits[0].uid));
    expect(thinResult.log.find(e => e.text.includes('使用「循焰飞羽」攻击'))?.hp?.[b.enemyUnits[0].uid]).toBe(496);
    const fresh = { ...b, enemyUnits: b.enemyUnits.map(u => ({ ...u, shield: 9 })) };
    expect(playerEndTurn(playerSkill(fresh, actor.uid, 'fire_feather', b.enemyUnits[0].uid)).log.some(e => e.text.includes('灼羽剥甲'))).toBe(false);
  });

  it('循焰飞羽命中附加2层灼烧，已有灼烧叠加且强化只提高伤害', () => {
    const skill = getSkill('flame_tracing_feather');
    expect(skill).toMatchObject({ damage: 4, hideEffects: true, effects: [{ kind: 'burn', value: 2 }] });
    for (const level of [0, 1, 2, 3]) {
      expect(getSkillEnhanceBonus(skill.id, level)).toMatchObject({ damageBonus: level * 2, effectBonus: 0 });
      expect(skillFullDesc(skill, level)).toContain(`造成${4 + level * 2}点伤害`);
      expect(skillFullDesc(skill, level)).toContain('灼烧2层');
      for (const burn of [0, 4]) {
        const b = calm('ember_hawk');
        b.playerUnits[0].skillEnhancements = { 0: level };
        b.enemyUnits[0].statuses = burn ? [{ kind: 'burn', value: burn, turns: 2 }] : [];
        const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, skill.id, b.enemyUnits[0].uid));
        const hit = after.log.find(e => e.text.includes('使用「循焰飞羽」攻击'))!;
        expect(hit.hp?.[b.enemyUnits[0].uid]).toBe(500 - 4 - level * 2 - (burn ? 1 : 0));
        expect(hit.statuses?.[b.enemyUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(burn + 2);
        expect(hit.addsStatus).toContain('burn');
        expect(after.log.some(e => e.text.includes('灼羽剥甲'))).toBe(burn > 0);
      }
    }
  });

  it('火羽5伤害加2层火，敌我双方都按先手执行；火花为5伤害', () => {
    expect(getSkill('fire_feather')).toMatchObject({ damage: 5, priority: 'first', effects: [{ kind: 'burn', value: 2 }] });
    expect(getSkill('ember')).toMatchObject({ damage: 5, effects: [{ kind: 'burn', value: 2 }] });
    expect(getNormalSkillPool()).toContain('fire_feather');
    expect(skillFullDesc(getSkill('fire_feather'), 2)).toContain('7点伤害');
    expect(skillFullDesc(getSkill('fire_feather'), 2)).toContain('灼烧4层');
    const b = calm('ember_hawk');
    b.playerUnits[0].spd = 1;
    b.enemyUnits[0] = { ...b.enemyUnits[0], spd: 99, acted: false, skills: ['punch'] };
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'fire_feather', b.enemyUnits[0].uid));
    const attacks = after.log.filter(e => e.text.includes('攻击') && e.text.includes('造成'));
    expect(attacks[0].actorUid).toBe(b.playerUnits[0].uid);
    expect(attacks[0].text).toContain('造成 5 伤害');
    expect(attacks[0].statuses?.[b.enemyUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(2);
    const fast = { ...makeUnit('momo', true, 0, false), hp: 100, maxHp: 100, spd: 99, skills: ['punch'] };
    const enemy = createBattle([fast], [{ speciesId: 'ember_hawk' }], 4);
    enemy.enemyUnits[0].spd = 1;
    enemy.enemyUnits[0].skills = ['fire_feather'];
    const enemyAfter = playerEndTurn(playerSkill(enemy, fast.uid, 'punch', enemy.enemyUnits[0].uid));
    expect(enemyAfter.log.find(e => e.text.includes('攻击') && e.text.includes('造成'))?.actorUid).toBe(enemy.enemyUnits[0].uid);
  });

  it('多段、群攻只剥一次，群攻选最高盾且同值按顺序；存档标记不刷新，新回合重置', () => {
    const b = calm('ember_hawk', ['momo', 'momo', 'momo']);
    const actor = { ...b.playerUnits[0], skills: ['double_hit', 'tail'], burnStripUsed: undefined };
    const burning: BattleState = { ...b, playerUnits: [actor], enemyUnits: b.enemyUnits.map((u, i) => ({ ...u, shield: i ? 20 : 10, statuses: [{ kind: 'burn', value: 4, turns: 2 }] })) };
    const multi = playerEndTurn(playerSkill(burning, actor.uid, 'double_hit', b.enemyUnits[0].uid));
    expect(multi.log.filter(e => e.text.includes('灼羽剥甲'))).toHaveLength(1);
    expect(multi.enemyUnits[0].shield).toBe(4);
    expect(multi.playerUnits[0].burnStripUsed).toBeUndefined();
    const group = playerEndTurn(playerSkill(burning, actor.uid, 'tail'));
    expect(group.log.filter(e => e.text.includes('灼羽剥甲'))).toHaveLength(1);
    expect(group.log.find(e => e.text.includes('灼羽剥甲'))?.targetUid).toBe(b.enemyUnits[1].uid);
    const spent = { ...burning, playerUnits: [{ ...actor, burnStripUsed: true }] };
    expect(playerEndTurn(playerSkill(spent, actor.uid, 'tail')).log.some(e => e.text.includes('灼羽剥甲'))).toBe(false);
    expect(createBattle(spent.playerUnits, [{ speciesId: 'momo' }], 1).playerUnits[0].burnStripUsed).toBeUndefined();
  });

  it('飞羽跨排严格匹配真灼烧、嘲讽与嗜血，目标执行前熄火不自动换目标', () => {
    const b = calm('ember_hawk', ['momo', 'momo', 'momo']);
    const actor = b.playerUnits[0];
    b.enemyUnits[0].row = 'front';
    b.enemyUnits[1].row = b.enemyUnits[2].row = 'back';
    b.enemyUnits[1].statuses = [{ kind: 'burn', value: 2, turns: 2 }];
    expect(flameTracingTargets(b, actor).map(u => u.uid)).toEqual([b.enemyUnits[0].uid, b.enemyUnits[1].uid]);
    expect(playerSkill(b, actor.uid, 'flame_tracing_feather', b.enemyUnits[2].uid)).toBe(b);
    const taunted = { ...actor, statuses: [{ kind: 'taunt' as const, value: 1, turns: 2, sourceUid: b.enemyUnits[0].uid }] };
    expect(flameTracingTargets({ ...b, playerUnits: [taunted] }, taunted).map(u => u.uid)).toEqual([b.enemyUnits[0].uid]);
    const lowest = { ...b, enemyUnits: b.enemyUnits.map((u, i) => ({ ...u, hp: i === 2 ? 1 : 500 })) };
    expect(flameTracingTargets(lowest, { ...actor, passive: 'blood_scent' })).toEqual([]);
    const ordered = playerSkill(b, actor.uid, 'flame_tracing_feather', b.enemyUnits[1].uid);
    const extinguished = playerEndTurn({ ...ordered, enemyUnits: ordered.enemyUnits.map(u => ({ ...u, statuses: [] })) });
    expect(extinguished.log.some(e => e.text.includes('使用「循焰飞羽」攻击'))).toBe(false);
    expect(extinguished.enemyUnits[0].hp).toBe(500);
    const fallback = { ...b, enemyUnits: b.enemyUnits.map((u, i) => ({ ...u, hp: i === 0 ? 0 : u.hp, statuses: [] })) };
    expect(flameTracingTargets(fallback, actor)).toHaveLength(2);
  });

  it('敌方同样会自焚并转换，飞羽可以合法攻击已燃烧后排', () => {
    const larva = createBattle([{ ...makeUnit('momo', true, 0, false), hp: 100, maxHp: 100 }], [{ speciesId: 'molten_larva' }], 3);
    larva.enemyUnits[0].skills = ['molten_self_burn'];
    const result = playerEndTurn(larva);
    expect(result.enemyUnits[0].hp).toBe(12);
    expect(result.enemyUnits[0].shield).toBe(6);
    const players = [makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)];
    const hawk = createBattle(players, [{ speciesId: 'ember_hawk' }], 3);
    hawk.enemyUnits[0].skills = ['flame_tracing_feather'];
    hawk.playerUnits[1] = { ...hawk.playerUnits[1], hp: 1, row: 'back', statuses: [{ kind: 'burn', value: 2, turns: 2 }] };
    const acted = playerEndTurn(hawk);
    expect(acted.log.some(e => e.actorUid === hawk.enemyUnits[0].uid && e.targetUid === hawk.playerUnits[1].uid && e.text.includes('循焰飞羽'))).toBe(true);
  });

  it('熟练度强化只改变规定数值，不改变燃料或剥盾上限', () => {
    const b = calm('molten_larva');
    b.playerUnits[0].skillEnhancements = { 0: 2, 1: 2 };
    const result = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'molten_self_burn'));
    expect(result.playerUnits[0].hp).toBe(12);
    expect(result.playerUnits[0].shield).toBe(10);
    expect(getSkillEnhanceBonus('heated_shell_bump', 2)).toMatchObject({ damageBonus: 2, effectBonus: 2 });
    expect(skillFullDesc(getSkill('heated_shell_bump'), 2)).toContain('6点伤害');
    expect(skillFullDesc(getSkill('heated_shell_bump'), 2)).toContain('4点护盾');
    expect(skillFullDesc(getSkill('molten_self_burn'), 2)).toContain('6点护盾');
    for (const id of ['molten_self_burn', 'heated_shell_bump', 'flame_tracing_feather']) expect(getNormalSkillPool()).toContain(id);
  });

  it('遭遇、战后招募与熟练度商店可获取两只一阶，阶级比例不被扩池改变', () => {
    const found = new Set<string>();
    const recruited = new Set<string>();
    const shop = new Set<string>();
    for (let seed = 0; seed < 150; seed++) {
      Object.values(generateMap(seed, 1).encounter).flat().forEach(u => found.add(u.speciesId));
      const state = { ...createInitialState(), seed, currentRow: 0 };
      generateRewards(state).flatMap(r => r.recruitCandidates ?? []).forEach(id => recruited.add(id));
      const bought = gameReducer({ ...state, screen: 'shop', runMode: 'proficiency', gold: 100, roster: [] }, { type: 'PROF_SHOP_BUY', itemId: 'pet_recruit' });
      bought.roster.forEach(u => shop.add(u.speciesId));
    }
    for (const id of ['molten_larva', 'ember_hawk']) {
      expect(found.has(id)).toBe(true);
      expect(recruited.has(id)).toBe(true);
      expect(shop.has(id)).toBe(true);
    }
    expect(getGrowthEncounter(20, () => 0.599).every(e => TIER1.includes(e.speciesId))).toBe(true);
    expect(getGrowthEncounter(20, () => 0.6).every(e => !TIER1.includes(e.speciesId))).toBe(true);
    expect(getGrowthEncounter(35, () => 0.199).every(e => TIER1.includes(e.speciesId))).toBe(true);
    expect(getGrowthEncounter(35, () => 0.2).every(e => !TIER1.includes(e.speciesId))).toBe(true);
  });
});
