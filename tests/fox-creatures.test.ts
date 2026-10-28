import { describe, expect, it } from 'vitest';
import { createBattle, foxFireLayers, makeUnit, playerEndTurn, playerSkill, skillUsesLeft, updateUnitSkills } from '../src/game/core/battle';
import { getNormalSkillPool, getSkillEnhanceMaxLevel } from '../src/game/core/growth';
import { TIER1, TIER2 } from '../src/game/core/growth-map';
import { MAIN_BASE_POOL, MAIN_EVO1_POOL, STARTER_GROUP_1, STARTER_GROUP_2 } from '../src/game/data/monsters';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { fusionNeedCount, generateMap, nextStage } from '../src/game/state/game';
import { parseEvent } from '../src/ui/battleFx';
import type { BattleState } from '../src/game/types';

function quiet(species = 'fire_fox', count = 1): BattleState {
  const b = createBattle([makeUnit(species, true, 0, false)], Array.from({ length: count }, () => ({ speciesId: 'momo' })), 17);
  return { ...b, playerUnits: b.playerUnits.map(u => ({ ...u, hp: 100, maxHp: 100, spd: 99 })),
    enemyUnits: b.enemyUnits.map(u => ({ ...u, hp: 500, maxHp: 500, acted: true, skills: [] })) };
}
function empower(b: BattleState, layers: number): BattleState {
  return { ...b, playerUnits: b.playerUnits.map(u => ({ ...u, statuses: [{ kind: 'foxFire', value: layers, turns: 0 }] })) };
}
function cast(b: BattleState, skill = 'illusory_flame') {
  return playerEndTurn(playerSkill(b, b.playerUnits[0].uid, skill, b.enemyUnits[0].uid));
}

describe('火狐与幻尾火狐', () => {
  it('面板、两只同形态融合和固定技能正确，传奇链接不影响开局', () => {
    const primary = makeUnit('fire_fox', true, 0, false);
    expect([primary.maxHp, primary.spd, primary.skills]).toEqual([11, 4, ['sealed_style_foxfire', 'illusory_flame']]);
    primary.bonusStats = { hp: 5, spd: 2 };
    const state = { ...createInitialState(), screen: 'roster' as const, roster: [primary, makeUnit('fire_fox', true, 1, false), makeUnit('fire_fox', true, 2, false)] };
    const after = gameReducer(state, { type: 'FUSE', primaryUid: primary.uid });
    expect(after.roster).toHaveLength(1);
    expect(after.roster[0]).toMatchObject({ speciesId: 'phantom_tail_fox', hp: 21, maxHp: 21, spd: 7, skills: ['twin_tail_flames', 'illusory_flame', 'burn_tail'] });
    expect(fusionNeedCount('fire_fox')).toBe(3);
    expect(nextStage('fire_fox')).toBe('phantom_tail_fox');
    expect(nextStage('phantom_tail_fox')).toBe('nine_tail_sovereign');
    expect([...STARTER_GROUP_1, ...STARTER_GROUP_2]).not.toContain('fire_fox');
  });

  it.each([0, 2, 3])('幻身用施放前%s层狐火增强敌方附火，自燃只固定2层且只增长一层', layers => {
    const b = layers ? empower(quiet(), layers) : quiet();
    const after = cast(b);
    const logs = after.log.filter(e => e.text.includes('使用「虚火幻身」'));
    expect(logs).toHaveLength(2);
    expect(logs[0].statuses?.[b.playerUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(2);
    expect(logs[1].statuses?.[b.enemyUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(2 + layers);
    expect(foxFireLayers(after.playerUnits[0])).toBe(Math.min(3, layers + 1));
    expect(after.playerUnits[0].hp).toBe(100);
    expect(logs[0].addsStatus).toContain('foxFire');
    expect(after.playerUnits[0].statuses.find(s => s.kind === 'burn')?.value).toBe(1);
  });

  it.each(['fire_fox', 'phantom_tail_fox'])('%s被附加五次灼烧按次数增加，原有烧层不减少次数，分别封顶3/5', species => {
    const players = Array.from({ length: 5 }, (_, i) => ({ ...makeUnit('momo', true, (i % 3) as 0 | 1 | 2, false), skills: ['ember'], spd: 99 }));
    const b = createBattle(players, [{ speciesId: species }], 12);
    b.enemyUnits[0] = { ...b.enemyUnits[0], hp: 500, maxHp: 500, skills: [], acted: true };
    let ordered = b;
    for (const u of b.playerUnits) ordered = playerSkill(ordered, u.uid, 'ember', b.enemyUnits[0].uid);
    const after = playerEndTurn(ordered);
    expect(foxFireLayers(after.enemyUnits[0])).toBe(species === 'fire_fox' ? 3 : 5);
    expect(after.enemyUnits[0].hp).toBe(475);
    expect(after.log.filter(e => e.text.includes('火花」攻击'))).toHaveLength(5);
  });

  it('只免疫灼烧伤害，中毒与攻击照常；自然消耗和光苔清火都不减少狐火或凭空增长', () => {
    const b = empower(quiet(), 2);
    b.playerUnits[0].statuses.push({ kind: 'burn', value: 4, turns: 2 }, { kind: 'poison', value: 4, turns: 2 });
    const after = playerEndTurn(b);
    expect(after.playerUnits[0].hp).toBe(98);
    expect(foxFireLayers(after.playerUnits[0])).toBe(2);
    expect(after.playerUnits[0].statuses.find(s => s.kind === 'burn')?.value).toBe(2);
    expect(parseEvent(after, after.log.find(e => e.text.includes('免疫灼烧伤害'))!)).toMatchObject({ kind: 'buff', value: 0 });
    const healer = { ...makeUnit('moss_beast', true, 1, false), spd: 99 };
    const raw = { ...after, playerUnits: [...after.playerUnits, healer] };
    const cleared = playerEndTurn(playerSkill(raw, healer.uid, 'light_bath', raw.playerUnits[0].uid));
    expect(foxFireLayers(cleared.playerUnits[0])).toBe(2);
    expect(cleared.playerUnits[0].statuses.some(s => s.kind === 'burn')).toBe(false);
  });

  it('烙印引爆为灼烧伤害，火狐免疫但仍清空灼烧和烙印', () => {
    const b = quiet();
    b.playerUnits[0].statuses = [{ kind: 'burn', value: 20, turns: 2 }, { kind: 'burnBrand', value: 1, turns: 2, sourceSide: 'enemy' }];
    b.enemyUnits[0].skills = ['punch'];
    b.enemyUnits[0].acted = false;
    const after = playerEndTurn(b);
    expect(after.playerUnits[0].hp).toBe(95);
    expect(after.log.find(e => e.text.includes('灼烧烙印」引爆'))?.text).toContain('受到 0 点');
    expect(after.playerUnits[0].statuses.some(s => s.kind === 'burn' || s.kind === 'burnBrand')).toBe(false);
  });

  it('破式狐火3伤害和1＋狐火层数灼烧；不因反灼烧在同次攻击中追溯增加', () => {
    const b = empower(quiet(), 2);
    b.enemyUnits[0].passive = 'coal_furnace';
    const after = cast(b, 'sealed_style_foxfire');
    const hit = after.log.find(e => e.text.includes('破式狐火」攻击'))!;
    expect(hit.hp?.[b.enemyUnits[0].uid]).toBe(497);
    expect(hit.statuses?.[b.enemyUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(3);
    expect(foxFireLayers(after.playerUnits[0])).toBe(3);
  });

  it.each([1, 2, 4])('双尾扫焰在%s名敌人中选不同目标，单敌不重复，跨前后排可随机', count => {
    const b = empower(quiet('phantom_tail_fox', count), 5);
    const after = cast(b, 'twin_tail_flames');
    const hits = after.log.filter(e => e.text.includes('双尾扫焰」攻击'));
    expect(hits).toHaveLength(Math.min(2, count));
    expect(new Set(hits.map(e => e.targetUid)).size).toBe(hits.length);
    for (const hit of hits) {
      expect(hit.hp?.[hit.targetUid!]).toBe(497);
      expect(hit.statuses?.[hit.targetUid!].find(s => s.kind === 'burn')?.value).toBe(6);
    }
    expect(cast(b, 'twin_tail_flames')).toEqual(after);
  });

  it('双尾尊重嘲讽，只击中强制目标一次；强化不增加目标数，自身附火不随强化增加', () => {
    const b = empower(quiet('phantom_tail_fox', 3), 2);
    b.playerUnits[0].statuses.push({ kind: 'taunt', value: 1, turns: 2, sourceUid: b.enemyUnits[1].uid });
    b.playerUnits[0].skillEnhancements = { 0: 2, 1: 2 };
    const after = cast(b, 'twin_tail_flames');
    const hits = after.log.filter(e => e.text.includes('双尾扫焰」攻击'));
    expect(hits).toHaveLength(1);
    expect(hits[0].targetUid).toBe(b.enemyUnits[1].uid);
    expect(hits[0].hp?.[b.enemyUnits[1].uid]).toBe(495);
    expect(hits[0].statuses?.[b.enemyUnits[1].uid].find(s => s.kind === 'burn')?.value).toBe(5);
    const illusion = cast(b);
    const logs = illusion.log.filter(e => e.text.includes('使用「虚火幻身」'));
    expect(logs[0].statuses?.[b.playerUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(2);
    expect(logs[1].text).toContain('灼烧 6 层');
  });

  it('焚尾只用一次，占用基础行动、受上限限制且不能强化，非火狐学习者不获得免疫', () => {
    const b = empower(quiet('phantom_tail_fox'), 4);
    const ordered = playerSkill(b, b.playerUnits[0].uid, 'burn_tail');
    expect(ordered.playerUnits[0].acted).toBe(true);
    const after = playerEndTurn(ordered);
    expect(foxFireLayers(after.playerUnits[0])).toBe(5);
    expect(skillUsesLeft(after.playerUnits[0], 'burn_tail')).toBe(0);
    expect(playerSkill(after, after.playerUnits[0].uid, 'burn_tail')).toBe(after);
    expect(getSkillEnhanceMaxLevel('burn_tail')).toBe(0);
    const other = quiet('momo');
    other.playerUnits[0] = updateUnitSkills(other.playerUnits[0], ['burn_tail', 'illusory_flame']);
    const charged = cast(other, 'burn_tail');
    expect(foxFireLayers(charged.playerUnits[0])).toBe(2);
    const burned = cast(charged);
    expect(burned.playerUnits[0].hp).toBe(99);
    expect(foxFireLayers(burned.playerUnits[0])).toBe(2);
  });

  it('狐火增强学习到的技能附火，不放大被动附火；战斗保存保留，新战斗清空', () => {
    const b = empower(quiet(), 3);
    b.playerUnits[0].skills = ['burn_brand'];
    const after = cast(b, 'burn_brand');
    const castLog = after.log.find(e => e.text.includes('使用「灼烧烙印」'))!;
    expect(castLog.statuses?.[b.enemyUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(5);
    expect(foxFireLayers(JSON.parse(JSON.stringify(after)).playerUnits[0])).toBe(3);
    expect(foxFireLayers(createBattle(after.playerUnits, [{ speciesId: 'momo' }], 9).playerUnits[0])).toBe(0);
  });

  it('四个新技能在普通池，主模式与熟练度池可获取，开局与阶级不改变', () => {
    for (const id of ['sealed_style_foxfire', 'illusory_flame', 'twin_tail_flames', 'burn_tail']) expect(getNormalSkillPool()).toContain(id);
    expect(MAIN_BASE_POOL).toContain('fire_fox');
    expect(MAIN_EVO1_POOL).toContain('phantom_tail_fox');
    expect(TIER1).toContain('fire_fox');
    expect(TIER2).toContain('phantom_tail_fox');
    const seen = new Set<string>();
    for (let seed = 0; seed < 100; seed++) for (const act of [1, 2, 3]) Object.values(generateMap(seed, act).encounter).flat().forEach(e => seen.add(e.speciesId));
    expect(seen.has('fire_fox')).toBe(true);
    expect(seen.has('phantom_tail_fox')).toBe(true);
  });
});
