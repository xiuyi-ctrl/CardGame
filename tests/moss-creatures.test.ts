import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, planEnemyLayout, playerEndTurn, playerSkill, skillCooldownLeft, skillUsesLeft } from '../src/game/core/battle';
import { TIER1, TIER2, getGrowthEncounter, getGrowthEliteEncounter } from '../src/game/core/growth-map';
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
  return { ...b,
    playerUnits: b.playerUnits.map((u, i) => ({ ...u, hp: 50, maxHp: 100, spd: 20 - i * 5 })),
    enemyUnits: b.enemyUnits.map(u => ({ ...u, hp: 500, maxHp: 500, skills: [], acted: true })),
  };
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

describe('光苔球与光苔兽', () => {
  it('基础面板、两只融合、主宠继承与固定技能正确，未开放日炎灵', () => {
    const first = makeUnit('light_moss', true, 0, false);
    expect([first.maxHp, first.spd, first.passive, first.skills]).toEqual([12, 3, 'heat_moss', ['aqua_shot', 'lamp_guard']]);
    first.bonusStats = { hp: 5, spd: 2 };
    first.curse = 'atkDown';
    const state = { ...createInitialState(), screen: 'roster' as const, roster: [first, makeUnit('light_moss', true, 1, false)] };
    const after = gameReducer(state, { type: 'FUSE', primaryUid: first.uid });
    expect(after.roster).toHaveLength(1);
    expect(after.roster[0]).toMatchObject({ speciesId: 'moss_beast', maxHp: 23, hp: 23, spd: 6, passive: 'clean_moss', curse: 'atkDown', skills: ['aqua_shot', 'heal_light', 'burn_reversal'] });
    expect(fusionNeedCount('light_moss')).toBe(2);
    expect(nextStage('light_moss')).toBe('moss_beast');
    expect(nextStage('moss_beast')).toBeUndefined();
    expect(planEnemyLayout([{ speciesId: 'kiki' }, { speciesId: 'moss_beast' }])[1].row).toBe('back');
    expect([...STARTER_GROUP_1, ...STARTER_GROUP_2]).not.toContain('light_moss');
  });

  it('吸热苔只移除一层灼烧，不移除中毒，治疗日志和净化动画分开', () => {
    const b = ailments(quiet('light_moss'), 1, 4);
    const after = cast(b, 'lamp_guard');
    const heal = after.log.find(e => e.text.includes('护灯」，治愈'))!;
    const clean = after.log.find(e => e.text.includes('吸热苔」移除'))!;
    expect(heal.hp?.[b.playerUnits[1].uid]).toBe(53);
    expect(heal.statuses?.[b.playerUnits[1].uid].find(s => s.kind === 'burn')?.value).toBe(1);
    expect(clean.statuses?.[b.playerUnits[1].uid]).toEqual([{ kind: 'poison', value: 4, turns: 2 }]);
    expect(parseEvent(after, clean)).toMatchObject({ kind: 'buff', targetUid: b.playerUnits[1].uid, skillName: '吸热苔' });
  });

  it.each([[2, 4, '灼烧', 1, 4], [0, 4, '中毒', 0, 3]] as const)('净苔优先灼烧且只处理一种：burn=%s poison=%s', (burn, poison, name, remainingBurn, remainingPoison) => {
    const b = ailments(quiet(), burn, poison);
    const after = cast(b, 'heal_light');
    const clean = after.log.find(e => e.text.includes('净苔」移除'))!;
    expect(clean.text).toContain(`1 层${name}`);
    expect(clean.statuses?.[b.playerUnits[1].uid].find(s => s.kind === 'burn')?.value ?? 0).toBe(remainingBurn);
    expect(clean.statuses?.[b.playerUnits[1].uid].find(s => s.kind === 'poison')?.value ?? 0).toBe(remainingPoison);
    expect(skillUsesLeft(after.playerUnits[0], 'heal_light')).toBe(1);
  });

  it('无异常与过量治疗也消耗本轮机会，战斗存档保存标记，新战斗清空', () => {
    const b = quiet('light_moss');
    b.playerUnits[1].hp = 100;
    b.enemyUnits[0].hp = 1;
    const ordered = playerSkill(playerSkill(b, b.playerUnits[0].uid, 'lamp_guard', b.playerUnits[1].uid), b.playerUnits[1].uid, 'punch', b.enemyUnits[0].uid);
    const won = playerEndTurn(ordered);
    expect(won.phase).toBe('won');
    expect(won.playerUnits[0].healCleanseUsed).toBe(true);
    const saved = JSON.parse(JSON.stringify(won)) as BattleState;
    expect(saved.playerUnits[0].healCleanseUsed).toBe(true);
    const fresh = createBattle(saved.playerUnits, [{ speciesId: 'momo' }], 6);
    expect(fresh.playerUnits[0].healCleanseUsed).toBeUndefined();
  });

  it('本轮已使用机会不再净化，新回合恢复；每只持有者独立', () => {
    const b = ailments(quiet(), 8);
    b.playerUnits[0].healCleanseUsed = true;
    const first = cast(b, 'heal_light');
    expect(first.log.some(e => e.text.includes('净苔」移除'))).toBe(false);
    expect(first.playerUnits[0].healCleanseUsed).toBeUndefined();
    const second = cast(first, 'heal_light');
    expect(second.log.filter(e => e.text.includes('净苔」移除'))).toHaveLength(1);
    const duo = ailments(quiet(), 8);
    duo.playerUnits[1].passive = 'clean_moss';
    duo.playerUnits[1].skills = ['lamp_guard'];
    const ordered = playerSkill(playerSkill(duo, duo.playerUnits[0].uid, 'heal_light', duo.playerUnits[1].uid), duo.playerUnits[1].uid, 'lamp_guard', duo.playerUnits[1].uid);
    const after = playerEndTurn(ordered);
    expect(after.log.filter(e => e.text.includes('净苔」移除'))).toHaveLength(2);
  });

  it('被动治疗和群体治疗不触发净化，主动自疗可以触发', () => {
    const b = ailments(quiet('light_moss'), 4, 0, 0);
    b.playerUnits[0].skills = ['tidal_domain', 'lamp_guard'];
    const group = cast(b, 'tidal_domain', 0);
    expect(group.log.some(e => e.text.includes('吸热苔」移除'))).toBe(false);
    const self = cast(b, 'lamp_guard', 0);
    expect(self.log.some(e => e.text.includes('吸热苔」移除'))).toBe(true);
    const passive = ailments(quiet('light_moss'), 4, 0, 0);
    passive.playerUnits[1].passive = 'eternal_light';
    passive.enemyUnits[0].statuses = [{ kind: 'burn', value: 4, turns: 2 }];
    const after = playerEndTurn(playerSkill(passive, passive.playerUnits[0].uid, 'aqua_shot', passive.enemyUnits[0].uid));
    expect(after.log.some(e => e.text.includes('长明之光」治愈'))).toBe(true);
    expect(after.log.some(e => e.text.includes('吸热苔」移除'))).toBe(false);
  });

  it.each([0, 1, 3, 5])('灼烧反转按实际移除%s层计价，被动清除量不增加治疗', burn => {
    const b = ailments(quiet(), burn);
    const after = cast(b);
    const heal = after.log.find(e => e.text.includes('灼烧反转」，治愈'))!;
    expect(heal.hp?.[b.playerUnits[1].uid]).toBe(52 + Math.min(3, burn));
    expect(heal.statuses?.[b.playerUnits[1].uid].find(s => s.kind === 'burn')?.value ?? 0).toBe(Math.max(0, burn - 3));
    expect(skillCooldownLeft(after.playerUnits[0], 'burn_reversal')).toBe(1);
    if (burn === 5) {
      const clean = after.log.find(e => e.text.includes('净苔」移除'))!;
      expect(clean.statuses?.[b.playerUnits[1].uid].find(s => s.kind === 'burn')?.value).toBe(1);
    }
  });

  it('反转清完灼烧后净苔可清一层中毒，非本系学习者无额外净化', () => {
    const b = ailments(quiet(), 2, 4);
    const after = cast(b);
    expect(after.log.find(e => e.text.includes('净苔」移除'))?.text).toContain('中毒');
    const other = ailments(quiet('momo'), 5, 4);
    other.playerUnits[0].skills = ['burn_reversal'];
    const learned = cast(other);
    expect(learned.log.some(e => e.text.includes('净苔」'))).toBe(false);
    expect(learned.log.find(e => e.text.includes('灼烧反转」，治愈'))?.hp?.[other.playerUnits[1].uid]).toBe(55);
  });

  it('反转强化只增加基础治疗，描述一致；普通学习池包含且传奇池排除', () => {
    const b = ailments(quiet(), 5);
    b.playerUnits[0].skillEnhancements = { 2: 2 };
    const after = cast(b);
    const heal = after.log.find(e => e.text.includes('灼烧反转」，治愈'))!;
    expect(heal.hp?.[b.playerUnits[1].uid]).toBe(59);
    expect(heal.statuses?.[b.playerUnits[1].uid].find(s => s.kind === 'burn')?.value).toBe(2);
    expect(skillFullDesc(getSkill('burn_reversal'), 2)).toContain('回复6加');
    expect(skillFullDesc(getSkill('burn_reversal'), 2)).toContain('最多9点');
    expect(skillBrief(getSkill('burn_reversal'), 2)).toBe('+6+移除层数');
    expect(getNormalSkillPool()).toContain('burn_reversal');
    expect(LEGENDARY_SKILLS.has('burn_reversal')).toBe(false);
  });

  it('执行前目标阵亡不转为治疗自己，非法敌方目标不能下令', () => {
    const b = quiet();
    expect(playerSkill(b, b.playerUnits[0].uid, 'burn_reversal', b.enemyUnits[0].uid)).toBe(b);
    const ordered = playerSkill(b, b.playerUnits[0].uid, 'burn_reversal', b.playerUnits[1].uid);
    const dead = { ...ordered, playerUnits: ordered.playerUnits.map((u, i) => i === 1 ? { ...u, hp: 0 } : u) };
    const after = playerEndTurn(dead);
    expect(after.log.some(e => e.text.includes('灼烧反转」，治愈'))).toBe(false);
    expect(after.playerUnits[0].hp).toBe(50);
  });

  it('敌方能反转灼烧并触发自己的净苔', () => {
    const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'moss_beast' }], 21);
    b.enemyUnits[0].hp = 5;
    b.enemyUnits[0].skills = ['burn_reversal'];
    b.enemyUnits[0].statuses = [{ kind: 'burn', value: 5, turns: 2 }];
    const after = playerEndTurn(b);
    expect(after.log.find(e => e.text.includes('灼烧反转」，治愈'))?.side).toBe('enemy');
    expect(after.log.some(e => e.text.includes('净苔」移除'))).toBe(true);
  });

  it('两种生物进入对应获取池，熟练度阶级权重不因扩池变化', () => {
    expect(MAIN_BASE_POOL).toContain('light_moss');
    expect(MAIN_EVO1_POOL).toContain('moss_beast');
    expect(TIER1).toContain('light_moss');
    expect(TIER2).toContain('moss_beast');
    const found = new Set<string>();
    for (let seed = 0; seed < 120; seed++) for (const act of [1, 2, 3]) {
      Object.values(generateMap(seed, act).encounter).flat().forEach(e => found.add(e.speciesId));
    }
    expect(found.has('light_moss')).toBe(true);
    expect(found.has('moss_beast')).toBe(true);
    expect(getGrowthEncounter(20, () => 0.599).every(e => TIER1.includes(e.speciesId))).toBe(true);
    expect(getGrowthEncounter(20, () => 0.6).every(e => TIER2.includes(e.speciesId))).toBe(true);
    expect(getGrowthEliteEncounter(20, () => 0.799).every(e => TIER2.includes(e.speciesId))).toBe(true);
  });
});
