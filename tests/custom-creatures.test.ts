import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerEndTurn, playerSkill, getDamageGuard, getEffectiveSpd } from '../src/game/core/battle';
import { makeCustomUnit } from '../src/game/state/game';
import { createRng } from '../src/game/rng';
import { getSkill } from '../src/game/data/skills';
import { getSkillEnhanceBonus, getSkillEnhanceMaxLevel } from '../src/game/core/growth';
import { createInitialState, migrateGameState } from '../src/game/state/reducer';
import { getMonster } from '../src/game/data/monsters';
import { getPassive } from '../src/game/data/passives';
import { skillBrief, skillFullDesc } from '../src/ui/components';
import type { BattleState } from '../src/game/types';

function setup(skill: string, spd = 8): BattleState {
  const player = { ...makeUnit('custom_gale', true, 0, false), skills: [skill], passive: undefined, spd };
  const b = createBattle([player], [{ speciesId: 'momo' }], 99);
  return { ...b, enemyUnits: b.enemyUnits.map(u => ({ ...u, maxHp: 100, hp: 100, spd: 3, passive: undefined, skills: [], statuses: [] })) };
}
function use(b: BattleState, skill: string, self = false) {
  return playerEndTurn(playerSkill(b, b.playerUnits[0].uid, skill, self ? b.playerUnits[0].uid : b.enemyUnits[0].uid));
}

describe('造物模板改版', () => {
  it.each(['custom_guardian', 'custom_gale', 'custom_fury'])('%s 确定性抽取4个不同技能', id => {
    for (let seed = 0; seed < 30; seed++) {
      const unit = makeCustomUnit(id, createRng(seed));
      expect(unit.skills).toHaveLength(4);
      expect(new Set(unit.skills).size).toBe(4);
      expect(makeCustomUnit(id, createRng(seed)).skills).toEqual(unit.skills);
    }
  });
  it('坚韧首次受击不减伤，后续连击段减伤，下一回合重新触发', () => {
    const guardian = { ...makeUnit('custom_guardian', true, 0, false), skills: [], hp: 30 };
    const raw = createBattle([guardian], [{ speciesId: 'momo' }], 1);
    const b = { ...raw, enemyUnits: raw.enemyUnits.map(u => ({ ...u, skills: ['double_hit'], passive: undefined, spd: 10 })) };
    const result = playerEndTurn(b);
    expect(result.playerUnits[0].hp).toBe(28);
    expect(result.playerUnits[0].shield).toBe(2);
    expect(getDamageGuard(result.playerUnits[0], result)).toBe(0);
    expect(result.log.filter(l => l.text.includes('本回合后续伤害-1'))).toHaveLength(1);
    const second = playerEndTurn(result);
    expect(second.log.filter(l => l.text.includes('本回合后续伤害-1'))).toHaveLength(2);
  });
  it('集盾包含自身及队友护盾，不转移队友护盾，回合末清空自身', () => {
    const b = setup('gather_shields');
    const ally = { ...makeUnit('momo', true, 1, false), hp: 10, shield: 7, skills: [] };
    const state = { ...b, playerUnits: [{ ...b.playerUnits[0], shield: 5 }, ally] };
    const result = use(state, 'gather_shields', true);
    const gain = result.log.find(l => l.text.includes('使用「集盾」'))!;
    expect(gain.shields?.[state.playerUnits[0].uid]).toBe(17);
    expect(result.playerUnits[0].shield).toBe(0);
    expect(result.playerUnits[1].shield).toBe(7);
    expect(result.playerUnits[0].skillUses?.gather_shields).toBe(2);
    expect(result.playerUnits[0].skillCooldowns?.gather_shields).toBe(1);
  });
  it('集盾为先手，冷却1回合，每场3次；零护盾仍正常使用', () => {
    expect(getSkill('gather_shields')).toMatchObject({ priority: 'first', cooldown: 1, uses: 3 });
    const result = use(setup('gather_shields'), 'gather_shields', true);
    expect(result.playerUnits[0].shield).toBe(0);
    expect(result.playerUnits[0].skillUses?.gather_shields).toBe(2);
  });
  it('乘风每次本场速度+1，可叠加，新战斗清除', () => {
    let b = use(setup('ride_wind'), 'ride_wind', true);
    expect(getEffectiveSpd(b.playerUnits[0])).toBe(9);
    b = use(b, 'ride_wind', true);
    expect(getEffectiveSpd(b.playerUnits[0])).toBe(10);
    const next = createBattle(b.playerUnits, [{ speciesId: 'momo' }], 4);
    expect(getEffectiveSpd(next.playerUnits[0])).toBe(8);
  });
  it.each([[8, 5], [3, 0], [1, 0]])('风袭自身速度%s时造成%s伤害', (spd, damage) => {
    const result = use(setup('wind_assault', spd), 'wind_assault');
    expect(result.enemyUnits[0].hp).toBe(100 - damage);
  });
  it('狙击与新增技能强化规则一致', () => {
    expect(getSkill('snipe').damage).toBe(7);
    expect(getSkillEnhanceBonus('snipe', 3).damageBonus).toBe(6);
    expect(getSkillEnhanceMaxLevel('gather_shields')).toBe(0);
    expect(getSkillEnhanceMaxLevel('ride_wind')).toBe(2);
    expect(getSkillEnhanceBonus('ride_wind', 2).effectBonus).toBe(2);
    expect(getSkillEnhanceBonus('wind_assault', 3).damageBonus).toBe(6);
  });
});


function wolfBattle(): BattleState {
  const unit = { ...makeUnit('custom_fury', true, 0, false), hp: 10, spd: 20,
    skills: ['roar', 'flame_combo', 'bloodlust', 'punch', 'tail', 'shield_counter'] };
  const b = createBattle([unit], [{ speciesId: 'momo' }, { speciesId: 'momo' }], 7);
  return { ...b, enemyUnits: b.enemyUnits.map(u => ({ ...u, hp: 200, maxHp: 200, passive: undefined, skills: [], spd: 1, statuses: [] })) };
}

describe('狂狼兽攻守调和与嗜血', () => {
  it('名称、技能池与被动一致；保留25生命5速度', () => {
    const monster = getMonster('custom_fury');
    expect(monster.name).toBe('狂狼兽');
    expect([monster.baseHp, monster.baseSpd]).toEqual([25, 5]);
    expect(monster.skills).toEqual(['roar', 'ember', 'bloodlust', 'flame_combo', 'poison_sting', 'shadow_claw', 'shield_counter']);
    expect(getPassive(monster.passive)?.kind).toBe('harmony');
  });
  it('增益后蓄势，连击只强化第一段，攻击后只获得一次护盾', () => {
    const charged = use(wolfBattle(), 'roar', true);
    expect(charged.playerUnits[0].harmonyCharged).toBe(true);
    const result = use(charged, 'flame_combo');
    const attacks = result.log.filter(l => l.text.includes('使用「火焰连击」攻击'));
    expect(attacks.map(l => l.text.match(/造成 (\d+) 伤害/)?.[1])).toEqual(['7', '5']);
    expect(result.playerUnits[0].harmonyCharged).toBeUndefined();
    expect(result.playerUnits[0].shield).toBe(2);
    expect(result.log.filter(l => l.text.includes('「攻守调和」获得'))).toHaveLength(1);
  });
  it('多次增益不叠加；群攻也仅强化一个目标的首次命中', () => {
    let b = use(wolfBattle(), 'bloodlust', true);
    b = use(b, 'bloodlust', true);
    b = use(b, 'tail');
    const attacks = b.log.filter(l => l.text.includes('使用「尾扫」攻击'));
    expect(attacks.map(l => l.text.match(/造成 (\d+) 伤害/)?.[1])).toEqual(['4', '2']);
    expect(b.playerUnits[0].shield).toBe(2);
  });
  it('同一回合额外行动不重复触发护盾', () => {
    const b = wolfBattle();
    const first = use(b, 'punch');
    const sameRound = { ...first, round: b.round, playerUnits: first.playerUnits.map(u => ({ ...u, acted: false })) };
    const second = use(sameRound, 'punch');
    expect(second.playerUnits[0].shield).toBe(2);
    expect(second.log.filter(l => l.text.includes('「攻守调和」获得'))).toHaveLength(1);
  });
  it('盾反可以蓄势，反击本身不消耗蓄势', () => {
    const result = use(wolfBattle(), 'shield_counter', true);
    expect(result.playerUnits[0].harmonyCharged).toBe(true);
    const next = createBattle(result.playerUnits, [{ speciesId: 'momo' }], 9);
    expect(next.playerUnits[0].harmonyCharged).toBeUndefined();
  });
  it('嗜血每段回复2，持续两个完整回合，到期移除', () => {
    const raw = wolfBattle();
    const b = { ...raw, playerUnits: raw.playerUnits.map(u => ({ ...u, passive: undefined })) };
    const buffed = use(b, 'bloodlust', true);
    expect(buffed.playerUnits[0].statuses.find(s => s.kind === 'bloodDrain')).toMatchObject({ value: 2, turns: 2 });
    const first = use(buffed, 'flame_combo');
    expect(first.playerUnits[0].hp).toBe(14);
    expect(first.playerUnits[0].statuses.find(s => s.kind === 'bloodDrain')?.turns).toBe(1);
    const second = use(first, 'flame_combo');
    expect(second.playerUnits[0].hp).toBe(18);
    expect(second.playerUnits[0].statuses.some(s => s.kind === 'bloodDrain')).toBe(false);
    const expired = use(second, 'punch');
    expect(expired.playerUnits[0].hp).toBe(18);
  });
  it('嗜血重复使用刷新而不叠加，强化值为2/3/4/5', () => {
    let b = use(wolfBattle(), 'bloodlust', true);
    b = use(b, 'punch');
    b = use(b, 'bloodlust', true);
    expect(b.playerUnits[0].statuses.filter(s => s.kind === 'bloodDrain')).toHaveLength(1);
    expect(b.playerUnits[0].statuses.find(s => s.kind === 'bloodDrain')).toMatchObject({ value: 2, turns: 2 });
    expect([0, 1, 2, 3].map(level => 2 + getSkillEnhanceBonus('bloodlust', level).effectBonus)).toEqual([2, 3, 4, 5]);
    expect(skillBrief(getSkill('bloodlust'), 3)).toContain('吸血+5');
    expect(skillFullDesc(getSkill('bloodlust'), 3)).toContain('回复5点生命');
  });
  it('旧存档只更新旧名称，不重抽技能或重算属性', () => {
    const unit = { ...makeUnit('custom_fury', true, 0, false), name: '狂焰兽', hp: 12, maxHp: 18, skills: ['bite'] };
    const next = migrateGameState({ ...createInitialState(), roster: [unit] })!;
    expect(next.roster[0]).toMatchObject({ name: '狂狼兽', hp: 12, maxHp: 18, skills: ['bite'] });
  });
});
