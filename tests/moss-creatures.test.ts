import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, planEnemyLayout, playerEndTurn, playerSkill, skillCooldownLeft } from '../src/game/core/battle';
import { getNormalSkillPool, LEGENDARY_SKILLS } from '../src/game/core/growth';
import { getSkill } from '../src/game/data/skills';
import { STARTER_GROUP_1, STARTER_GROUP_2, MAIN_BASE_POOL, MAIN_EVO1_POOL } from '../src/game/data/monsters';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { fusionNeedCount, generateMap, nextStage } from '../src/game/state/game';
import { parseEvent } from '../src/ui/battleFx';
import { skillFullDesc, skillBrief } from '../src/ui/components';
import type { BattleState, StatusEffect } from '../src/game/types';

function quiet(species = 'moss_beast'): BattleState {
  const b = createBattle([makeUnit(species, true, 0, false), makeUnit('momo', true, 1, false)], [{ speciesId: 'momo' }], 5);
  return { ...b, playerUnits: b.playerUnits.map((u, i) => ({ ...u, hp: 50, maxHp: 100, spd: 20 - i * 5 })),
    enemyUnits: b.enemyUnits.map(u => ({ ...u, hp: 500, maxHp: 500, skills: [], acted: true })) };
}
function ailments(b: BattleState, burn = 0, poison = 0, index = 1): BattleState {
  const statuses: StatusEffect[] = [];
  if (burn) statuses.push({ kind: 'burn', value: burn, turns: 2 });
  if (poison) statuses.push({ kind: 'poison', value: poison, turns: 2 });
  return { ...b, playerUnits: b.playerUnits.map((u, i) => i === index ? { ...u, statuses } : u) };
}
function cast(b: BattleState, skill = 'burn_reversal', target = 1) {
  return playerEndTurn(playerSkill(b, b.playerUnits[0].uid, skill, b.playerUnits[target].uid));
}
function healing(b: BattleState, skill: string) { return b.log.find(e => e.text.includes(`${skill}」，治愈`))!; }

describe('光苔球与光苔兽', () => {
  it('固定技能、融合继承正确，二阶连接日炎灵，其他生物的护灯不变', () => {
    const first = makeUnit('light_moss', true, 0, false);
    expect([first.maxHp, first.spd, first.passive, first.skills]).toEqual([12, 3, 'heat_moss', ['aqua_shot', 'light_bath']]);
    first.bonusStats = { hp: 5, spd: 2 };
    first.curse = 'atkDown';
    const state = { ...createInitialState(), screen: 'roster' as const, roster: [first, makeUnit('light_moss', true, 1, false), makeUnit('light_moss', true, 2, false)] };
    const after = gameReducer(state, { type: 'FUSE', primaryUid: first.uid });
    expect(after.roster).toHaveLength(1);
    expect(after.roster[0]).toMatchObject({ speciesId: 'moss_beast', maxHp: 23, hp: 23, spd: 6, passive: 'clean_moss', curse: 'atkDown', skills: ['light_bath', 'burn_reversal', 'purifying_orb'] });
    expect(fusionNeedCount('light_moss')).toBe(3);
    expect(nextStage('light_moss')).toBe('moss_beast');
    expect(nextStage('moss_beast')).toBe('solar_spirit');
    expect(planEnemyLayout([{ speciesId: 'kiki' }, { speciesId: 'moss_beast' }])[1].row).toBe('back');
    expect([...STARTER_GROUP_1, ...STARTER_GROUP_2]).not.toContain('light_moss');
    expect(getSkill('lamp_guard').heal).toBe(5);
  });

  it.each(['light_moss', 'moss_beast'])('%s光浴清两层火但不清毒，二阶对灼烧目标多治疗2点', species => {
    const b = ailments(quiet(species), 3, 4);
    const after = cast(b, 'light_bath');
    const heal = healing(after, '光浴');
    const clean = after.log.find(e => /的「(?:吸热苔|净苔)」移除/.test(e.text))!;
    expect(heal.hp?.[b.playerUnits[1].uid]).toBe(species === 'light_moss' ? 53 : 55);
    expect(heal.statuses?.[b.playerUnits[1].uid].find(s => s.kind === 'burn')?.value).toBe(3);
    expect(clean.statuses?.[b.playerUnits[1].uid].find(s => s.kind === 'burn')?.value).toBe(1);
    expect(clean.statuses?.[b.playerUnits[1].uid].find(s => s.kind === 'poison')?.value).toBe(4);
    expect(parseEvent(after, clean)).toMatchObject({ kind: 'buff', targetUid: b.playerUnits[1].uid });
  });

  it.each(['light_moss', 'moss_beast'])('%s满血和不足两层也净化，无火不清毒且无额外治疗', species => {
    const b = ailments(quiet(species), 1, 4);
    b.playerUnits[1].hp = 100;
    const after = cast(b, 'light_bath');
    const clean = after.log.find(e => /的「(?:吸热苔|净苔)」移除/.test(e.text))!;
    expect(clean.text).toContain('1 层灼烧');
    expect(clean.hp?.[b.playerUnits[1].uid]).toBe(100);
    const poisonOnly = ailments(quiet(species), 0, 4);
    const result = cast(poisonOnly, 'light_bath');
    expect(healing(result, '光浴').hp?.[poisonOnly.playerUnits[1].uid]).toBe(53);
    expect(result.log.some(e => /的「(?:吸热苔|净苔)」移除/.test(e.text))).toBe(false);
  });

  it('没有每回合上限，旧存档已用标记不阻挡再次净化', () => {
    const b = ailments(quiet(), 8);
    b.playerUnits[0] = { ...b.playerUnits[0], ...{ healCleanseUsed: true } };
    const first = cast(b, 'light_bath');
    expect(first.log.filter(e => e.text.includes('净苔」移除'))).toHaveLength(1);
    const again = ailments(first, 8);
    again.round = b.round;
    const second = cast(again, 'light_bath');
    expect(second.log.filter(e => e.text.includes('净苔」移除'))).toHaveLength(2);
  });

  it('群体治疗逐目标加成清火，主动自疗可以触发', () => {
    const b = ailments(ailments(quiet(), 4, 0, 0), 3, 4);
    b.playerUnits[0].skills = ['tidal_domain', 'light_bath'];
    const group = cast(b, 'tidal_domain');
    const heals = group.log.filter(e => e.text.includes('潮汐领域」，治愈'));
    expect(heals).toHaveLength(2);
    for (const entry of heals) expect(entry.text).toContain(`${(getSkill('tidal_domain').heal ?? 0) + 2} 点生命`);
    expect(group.log.filter(e => e.text.includes('净苔」移除'))).toHaveLength(2);
    expect(healing(cast(b, 'light_bath', 0), '光浴').hp?.[b.playerUnits[0].uid]).toBe(55);
  });

  it('被动恢复不触发净化，攻击技能附带自疗可以加成清火', () => {
    const b = ailments(quiet('light_moss'), 4, 0, 0);
    b.playerUnits[1].passive = 'eternal_light';
    b.enemyUnits[0].statuses = [{ kind: 'burn', value: 4, turns: 2 }];
    const passive = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'aqua_shot', b.enemyUnits[0].uid));
    expect(passive.log.some(e => e.text.includes('长明之光」治愈'))).toBe(true);
    expect(passive.log.some(e => e.text.includes('吸热苔」移除'))).toBe(false);
    const attack = ailments(quiet(), 4, 0, 0);
    attack.playerUnits[0].skills = ['water_wave'];
    const result = playerEndTurn(playerSkill(attack, attack.playerUnits[0].uid, 'water_wave', attack.enemyUnits[0].uid));
    expect(result.log.some(e => e.text.includes('恢复 3 点生命'))).toBe(true);
    expect(result.log.some(e => e.text.includes('净苔」移除'))).toBe(true);
  });

  it('增益技能附带治疗逐目标加成清火，基础护盾效果不变', () => {
    const b = ailments(ailments(quiet(), 3, 0, 0), 4);
    b.playerUnits[0].skills = ['boss_vine_shield'];
    const result = cast(b, 'boss_vine_shield');
    const healed = result.log.filter(e => e.text.includes('古树庇护」，强化'));
    expect(healed).toHaveLength(2);
    for (const entry of healed) expect(entry.text).toContain('回复 4 点生命');
    expect(result.playerUnits.map(u => u.shield)).toEqual([5, 5]);
    expect(result.log.filter(e => e.text.includes('净苔」移除'))).toHaveLength(2);
  });

  it.each([0, 1, 3, 5, 7])('反转最多清5火，按清火前%s层判断+2治疗，再由被动清最多两层，不移除毒', burn => {
    const b = ailments(quiet(), burn, 4);
    const after = cast(b);
    const heal = healing(after, '灼烧反转');
    expect(heal.hp?.[b.playerUnits[1].uid]).toBe(52 + Math.min(5, burn) + (burn ? 2 : 0));
    expect(heal.statuses?.[b.playerUnits[1].uid].find(s => s.kind === 'burn')?.value ?? 0).toBe(Math.max(0, burn - 5));
    expect(heal.statuses?.[b.playerUnits[1].uid].find(s => s.kind === 'poison')?.value).toBe(4);
    expect(skillCooldownLeft(after.playerUnits[0], 'burn_reversal')).toBe(1);
    expect(after.playerUnits[1].statuses.some(s => s.kind === 'burn')).toBe(false);
  });

  it('非本系反转无净苔，强化只增加基础治疗和基础伤害', () => {
    const other = ailments(quiet('momo'), 5);
    other.playerUnits[0].skills = ['burn_reversal'];
    expect(healing(cast(other), '灼烧反转').hp?.[other.playerUnits[1].uid]).toBe(57);
    const b = ailments(quiet(), 5);
    b.playerUnits[0].skillEnhancements = { 1: 2 };
    expect(healing(cast(b), '灼烧反转').hp?.[b.playerUnits[1].uid]).toBe(63);
    expect(skillFullDesc(getSkill('burn_reversal'), 2)).toContain('最多11点');
    expect(skillFullDesc(getSkill('burn_reversal'), 2)).toContain('回复6加');
    expect(skillBrief(getSkill('burn_reversal'), 2)).toBe('+6+移除层数');
    expect(skillFullDesc(getSkill('purifying_orb'), 2)).toContain('7点伤害');
    expect(skillFullDesc(getSkill('purifying_orb'), 2)).toContain('额外造成2点');
  });

  it.each([false, true])('净光球仅对攻击前灼烧目标额外2伤害 burn=%s', burn => {
    const b = quiet();
    if (burn) b.enemyUnits[0].statuses = [{ kind: 'burn', value: 4, turns: 2 }];
    const result = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'purifying_orb', b.enemyUnits[0].uid));
    const hit = result.log.find(e => e.text.includes('净光球」攻击'))!;
    expect(hit.hp?.[b.enemyUnits[0].uid]).toBe(burn ? 495 : 497);
    expect(hit.addsStatus?.includes('burn')).not.toBe(true);
  });

  it('执行前目标阵亡不回退自疗，非法敌方目标不能下令', () => {
    const b = quiet();
    expect(playerSkill(b, b.playerUnits[0].uid, 'burn_reversal', b.enemyUnits[0].uid)).toBe(b);
    const ordered = playerSkill(b, b.playerUnits[0].uid, 'burn_reversal', b.playerUnits[1].uid);
    const dead = { ...ordered, playerUnits: ordered.playerUnits.map((u, i) => i === 1 ? { ...u, hp: 0 } : u) };
    expect(cast(dead).log.some(e => e.text.includes('灼烧反转」，治愈'))).toBe(false);
  });

  it('敌方同样获得净苔加成和2层清火', () => {
    const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'moss_beast' }], 21);
    b.enemyUnits[0].hp = 5;
    b.enemyUnits[0].skills = ['burn_reversal'];
    b.enemyUnits[0].statuses = [{ kind: 'burn', value: 5, turns: 2 }];
    const after = playerEndTurn(b);
    expect(healing(after, '灼烧反转').hp?.[b.enemyUnits[0].uid]).toBe(14);
    expect(after.log.some(e => e.text.includes('净苔」移除'))).toBe(false);
  });

  it('新技能属于普通学习池，获取池、开局和阶级权重不变', () => {
    for (const id of ['light_bath', 'purifying_orb', 'burn_reversal']) {
      expect(getNormalSkillPool()).toContain(id);
      expect(LEGENDARY_SKILLS.has(id)).toBe(false);
    }
    expect(MAIN_BASE_POOL).toContain('light_moss');
    expect(MAIN_EVO1_POOL).toContain('moss_beast');
    const found = new Set<string>();
    for (let seed = 0; seed < 120; seed++) for (const act of [1, 2, 3]) Object.values(generateMap(seed, act).encounter).flat().forEach(e => found.add(e.speciesId));
    expect(found.has('light_moss')).toBe(true);
    expect(found.has('moss_beast')).toBe(true);
  });
});
