import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerEndTurn, playerSkill, radianceLayers, skillUsesLeft, updateUnitSkills } from '../src/game/core/battle';
import { LEGENDARY_SKILLS, getNormalSkillPool } from '../src/game/core/growth';
import { LEGENDARY } from '../src/game/core/growth-map';
import { MAIN_EVO2_POOL } from '../src/game/data/monsters';
import { getSkill } from '../src/game/data/skills';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { fusionNeedCount, generateMap, nextStage } from '../src/game/state/game';
import { skillBrief, skillFullDesc } from '../src/ui/components';
import { parseEvent } from '../src/ui/battleFx';
import type { BattleState } from '../src/game/types';

function quiet(ids = ['solar_spirit', 'momo'], enemies = ['momo']): BattleState {
  const b = createBattle(ids.map((id, i) => makeUnit(id, true, (i % 3) as 0 | 1 | 2, false)), enemies.map(speciesId => ({ speciesId })), 7);
  return { ...b, playerUnits: b.playerUnits.map((u, i) => ({ ...u, hp: 50, maxHp: 100, spd: 30 - i * 2 })),
    enemyUnits: b.enemyUnits.map(u => ({ ...u, hp: 500, maxHp: 500, skills: [], acted: true })) };
}
function burn(b: BattleState, amount = 6, index = 1): BattleState {
  return { ...b, playerUnits: b.playerUnits.map((u, i) => i === index ? { ...u, statuses: [...u.statuses, { kind: 'burn', value: amount, turns: 2 }] } : u) };
}
function radiant(b: BattleState, layers = 2, index = 0): BattleState {
  return { ...b, playerUnits: b.playerUnits.map((u, i) => i === index ? { ...u, statuses: [...u.statuses, { kind: 'sunRadiance', value: layers, turns: 0 }] } : u) };
}
function cast(b: BattleState, skill = 'burn_reversal', target = 1, actor = 0) {
  return playerEndTurn(playerSkill(b, b.playerUnits[actor].uid, skill, b.playerUnits[target].uid));
}

describe('日炎灵与日华', () => {
  it('第一幕传奇锁定，首领后两只光苔兽融合为26/5日炎灵与四项固定技能', () => {
    const primary = makeUnit('moss_beast', true, 0, false);
    const state = { ...createInitialState(), screen: 'roster' as const, roster: [primary, makeUnit('moss_beast', true, 1, false)] };
    expect(gameReducer(state, { type: 'FUSE', primaryUid: primary.uid })).toBe(state);
    const after = gameReducer({ ...state, legendEvolutionUnlocked: true }, { type: 'FUSE', primaryUid: primary.uid });
    expect(after.roster).toHaveLength(1);
    expect(after.roster[0]).toMatchObject({ speciesId: 'solar_spirit', maxHp: 26, spd: 5, passive: 'clear_flame', skills: ['burn_reversal', 'solar_strike', 'clean_flame_care', 'solar_heal'] });
    expect(fusionNeedCount('moss_beast')).toBe(2);
    expect(nextStage('moss_beast')).toBe('solar_spirit');
    expect(nextStage('solar_spirit')).toBeUndefined();
  });

  it('反转先清3火，澄焰再清3火，日华每回合只获得一次', () => {
    const b = burn(quiet(), 8);
    const after = cast(b);
    expect(radianceLayers(after.playerUnits[0])).toBe(1);
    const clean = after.log.find(e => e.text.includes('澄焰」移除'))!;
    expect(clean.text).toContain('3 层灼烧');
    expect(clean.statuses?.[b.playerUnits[1].uid].find(s => s.kind === 'burn')?.value).toBe(2);
    expect(after.log.filter(e => e.text.includes('日华」充能'))).toHaveLength(1);
    expect(parseEvent(after, after.log.find(e => e.text.includes('日华」充能'))!)).toMatchObject({ kind: 'buff', skillName: '日华' });
  });

  it('其他伙伴技能/被动清火也充能，多个持有者各获得一层，不因同轮重复清火叠层', () => {
    const b = burn(burn(quiet(['solar_spirit', 'solar_spirit', 'moss_beast', 'momo']), 5, 3), 5, 2);
    b.playerUnits[3].skills = ['light_bath'];
    const ordered = playerSkill(playerSkill(b, b.playerUnits[2].uid, 'light_bath', b.playerUnits[3].uid), b.playerUnits[3].uid, 'light_bath', b.playerUnits[2].uid);
    const after = playerEndTurn(ordered);
    expect(after.playerUnits.slice(0, 2).map(radianceLayers)).toEqual([1, 1]);
    expect(after.log.filter(e => e.text.includes('日华」充能'))).toHaveLength(2);
  });

  it('自然灼烧结算不充能，无充能回合衰减一层且不低于零', () => {
    const b = radiant(burn(quiet(), 1));
    const first = playerEndTurn(b);
    expect(radianceLayers(first.playerUnits[0])).toBe(1);
    expect(first.log.some(e => e.text.includes('日华」充能'))).toBe(false);
    const second = playerEndTurn(first);
    expect(radianceLayers(second.playerUnits[0])).toBe(0);
    expect(second.playerUnits[0].statuses.some(s => s.kind === 'sunRadiance')).toBe(false);
    expect(radianceLayers(playerEndTurn(second).playerUnits[0])).toBe(0);
  });

  it('最多3层，满层仍满足充能则不衰减；下一无充能回合才降至2', () => {
    const b = radiant(burn(quiet(), 6), 3);
    const after = cast(b);
    expect(radianceLayers(after.playerUnits[0])).toBe(3);
    expect(radianceLayers(playerEndTurn(after).playerUnits[0])).toBe(2);
  });

  it('回合开始的熔甲换盾属于新回合清火机会，上一回合先正常衰减', () => {
    const b = radiant(burn(quiet(['solar_spirit', 'molten_beetle']), 4), 2);
    const after = playerEndTurn(b);
    expect(radianceLayers(after.playerUnits[0])).toBe(2);
    expect(after.playerUnits[0].radianceGainedThisRound).toBe(true);
    const logs = after.log.filter(e => e.text.includes('日华」'));
    expect(logs.map(e => e.text)).toEqual([expect.stringContaining('衰减'), expect.stringContaining('充能')]);
  });

  it('自燃顶撞消耗燃料属于被动/技能清火，但清除敌方灼烧不为我方充能', () => {
    const b = burn(quiet(['solar_spirit', 'molten_larva']), 1);
    const after = playerEndTurn(playerSkill(b, b.playerUnits[1].uid, 'heated_shell_bump', b.enemyUnits[0].uid));
    expect(radianceLayers(after.playerUnits[0])).toBe(1);
    const other = quiet(['solar_spirit', 'eternal_moth'], ['momo', 'momo', 'solar_spirit']);
    other.enemyUnits[0].statuses = [{ kind: 'burn', value: 4, turns: 2 }];
    const moved = playerEndTurn(playerSkill(other, other.playerUnits[1].uid, 'ember_transfer', other.enemyUnits[0].uid));
    expect(radianceLayers(moved.playerUnits[0])).toBe(0);
    expect(radianceLayers(moved.enemyUnits[2])).toBe(1);
  });

  it.each([0, 1, 2, 3])('日华灼击按施放时%s层造成3＋2N伤害，不消耗日华，已燃烧才附火', layers => {
    const b = layers ? radiant(quiet(), layers) : quiet();
    b.enemyUnits[0].statuses = [{ kind: 'burn', value: 4, turns: 2 }];
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'solar_strike', b.enemyUnits[0].uid));
    const hit = after.log.find(e => e.text.includes('日华灼击」攻击'))!;
    expect(hit.hp?.[b.enemyUnits[0].uid]).toBe(497 - layers * 2);
    expect(hit.statuses?.[b.enemyUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(6);
    expect(radianceLayers(after.playerUnits[0])).toBe(Math.max(0, layers - 1));
    const cold = quiet();
    const noBurn = playerEndTurn(playerSkill(cold, cold.playerUnits[0].uid, 'solar_strike', cold.enemyUnits[0].uid));
    expect(noBurn.enemyUnits[0].statuses.some(s => s.kind === 'burn')).toBe(false);
  });

  it('日华治愈按治疗前层数计算，随后清火获得的新层数不追溯增加本次治疗，自疗不覆盖新日华', () => {
    const b = radiant(burn(quiet(), 1, 0), 2);
    const after = cast(b, 'solar_heal', 0);
    const heal = after.log.find(e => e.text.includes('日华治愈」，治愈'))!;
    expect(heal.hp?.[b.playerUnits[0].uid]).toBe(55);
    expect(radianceLayers(after.playerUnits[0])).toBe(3);
    const self = cast(burn(quiet(), 6, 0), 'burn_reversal', 0);
    expect(radianceLayers(self.playerUnits[0])).toBe(1);
    expect(self.playerUnits[0].hp).toBe(55);
  });

  it.each([0, 1, 6])('净焰照护6治疗＋技能清2＋被动清3，有清火只追加2治疗且不递归 burn=%s', layers => {
    const b = layers ? burn(quiet(), layers) : quiet();
    const after = cast(b, 'clean_flame_care');
    const heals = after.log.filter(e => e.text.includes('净焰照护」，治愈'));
    expect(heals).toHaveLength(layers ? 2 : 1);
    expect(heals[0].text).toContain('6 点生命');
    if (layers) expect(heals[1].text).toContain('2 点生命');
    expect(after.log.filter(e => e.text.includes('澄焰」移除')).length).toBe(layers > 2 ? 1 : 0);
    expect(radianceLayers(after.playerUnits[0])).toBe(layers ? 1 : 0);
    expect(skillUsesLeft(after.playerUnits[0], 'clean_flame_care')).toBe(2);
  });

  it('其他物种学习照护仍可清2火并追加2治疗，最多用3次；强化不增加清火与追加量', () => {
    let b = burn(quiet(['momo', 'momo']), 3);
    b.playerUnits[0] = updateUnitSkills(b.playerUnits[0], ['clean_flame_care']);
    b.playerUnits[0].skillEnhancements = { 0: 2 };
    b = cast(b, 'clean_flame_care');
    expect(b.log.find(e => e.text.includes('净焰照护」，治愈'))?.text).toContain('10 点生命');
    expect(b.log.filter(e => e.text.includes('净焰照护」，治愈'))[1].text).toContain('2 点生命');
    b = cast(cast(b, 'clean_flame_care'), 'clean_flame_care');
    expect(skillUsesLeft(b.playerUnits[0], 'clean_flame_care')).toBe(0);
    expect(playerSkill(b, b.playerUnits[0].uid, 'clean_flame_care', b.playerUnits[1].uid)).toBe(b);
  });

  it('战斗存档保留日华和已充能标记，新战斗清空；日华不是中毒或虚火净化', () => {
    const raw = radiant(burn(quiet(), 4));
    raw.playerUnits[0].radianceGainedThisRound = true;
    const saved = JSON.parse(JSON.stringify(raw)) as BattleState;
    const after = cast(saved);
    expect(after.log.some(e => e.text.includes('日华」充能'))).toBe(false);
    expect(radianceLayers(after.playerUnits[0])).toBe(2);
    const fresh = createBattle(after.playerUnits, [{ speciesId: 'momo' }], 8);
    expect(radianceLayers(fresh.playerUnits[0])).toBe(0);
    expect(fresh.playerUnits[0].radianceGainedThisRound).toBeUndefined();
  });

  it('新增传奇与技能按现有池投放，第一幕无传奇，普通学习池不混入传奇技能', () => {
    expect(LEGENDARY).toContain('solar_spirit');
    expect(MAIN_EVO2_POOL).toContain('solar_spirit');
    for (const id of ['solar_strike', 'clean_flame_care', 'solar_heal']) {
      expect(LEGENDARY_SKILLS.has(id)).toBe(true);
      expect(getNormalSkillPool()).not.toContain(id);
    }
    expect(getNormalSkillPool()).toContain('burn_reversal');
    expect(skillFullDesc(getSkill('solar_strike'), 2)).toContain('造成7加');
    expect(skillFullDesc(getSkill('solar_heal'), 2)).toContain('回复7加');
    expect(skillBrief(getSkill('solar_strike'))).toBe('3+日华×2');
    const seen = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      expect(Object.values(generateMap(seed, 1).encounter).flat().some(e => e.speciesId === 'solar_spirit')).toBe(false);
      for (const act of [2, 3]) Object.values(generateMap(seed, act).encounter).flat().forEach(e => seen.add(e.speciesId));
    }
    expect(seen.has('solar_spirit')).toBe(true);
  });
});
