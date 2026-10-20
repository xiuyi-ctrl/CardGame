import { describe, expect, it } from 'vitest';
import { canUnitUseSkill, createBattle, makeUnit, playerEndTurn, playerSkill, skillCooldownLeft } from '../src/game/core/battle';
import { LEGENDARY } from '../src/game/core/growth-map';
import { getNormalSkillPool, LEGENDARY_SKILLS } from '../src/game/core/growth';
import { getSkill } from '../src/game/data/skills';
import { MAIN_EVO2_POOL } from '../src/game/data/monsters';
import { fusionNeedCount, generateMap, nextStage } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { parseEvent } from '../src/ui/battleFx';
import { skillFullDesc } from '../src/ui/components';

function quiet(species = 'solar_eagle', count = 1) {
  const b = createBattle([{ ...makeUnit(species, true, 0, false), hp: 100, maxHp: 100, spd: 20 }],
    Array.from({ length: count }, () => ({ speciesId: 'momo' })), 11);
  return { ...b, enemyUnits: b.enemyUnits.map(u => ({ ...u, hp: 500, maxHp: 500, skills: [], acted: true })) };
}

describe('熔甲兽与烈日神鹰', () => {
  it.each([
    ['molten_beetle', 'molten_beast', 30, 4, ['heated_shell_bump', 'molten_self_burn', 'shell_charge', 'molten_quake']],
    ['searing_hawk', 'solar_eagle', 27, 7, ['flame_tracing_feather', 'fire_feather', 'burn_brand', 'sun_sunder']],
  ] as const)('%s首领后两只融合为%s，保留主宠强化和固定技能', (base, id, hp, spd, skills) => {
    const primary = { ...makeUnit(base, true, 0, false), bonusStats: { hp: 5, spd: 2 }, curse: 'atkDown' as const };
    const material = { ...makeUnit(base, true, 1, false), skills: ['heal_light'] };
    const s = { ...createInitialState(), screen: 'roster' as const, roster: [primary, material] };
    expect(gameReducer(s, { type: 'FUSE', primaryUid: primary.uid })).toBe(s);
    const after = gameReducer({ ...s, legendEvolutionUnlocked: true }, { type: 'FUSE', primaryUid: primary.uid });
    expect(after.roster).toHaveLength(1);
    expect(after.roster[0]).toMatchObject({ speciesId: id, hp: hp + 5, maxHp: hp + 5, spd: spd + 2, curse: 'atkDown', skills: [...skills] });
    expect(fusionNeedCount(base)).toBe(2);
    expect(nextStage(base)).toBe(id);
    expect(nextStage(id)).toBeUndefined();
    expect(LEGENDARY).toContain(id);
    expect(MAIN_EVO2_POOL).toContain(id);
  });

  it('赤甲炼火先承受灼烧，再以两层余火换6盾', () => {
    const b = quiet('molten_beast');
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'molten_self_burn'));
    expect(after.playerUnits[0].hp).toBe(97);
    expect(after.playerUnits[0].shield).toBe(8);
    expect(after.playerUnits[0].statuses.some(s => s.kind === 'burn')).toBe(false);
    const log = after.log.find(e => e.text.includes('赤甲炼火」获得 6'))!;
    expect(parseEvent(after, log)).toMatchObject({ kind: 'buff', skillName: '赤甲炼火' });
  });

  it('震荡群攻只扣一次3盾，所有敌人附火，冷却1回合', () => {
    const b = quiet('molten_beast', 3);
    b.playerUnits[0].shield = 7;
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'molten_quake'));
    expect(after.playerUnits[0].shield).toBe(4);
    expect(after.enemyUnits.map(u => u.hp)).toEqual([496, 496, 496]);
    expect(after.log.filter(e => e.text.includes('熔甲震荡」消耗'))).toHaveLength(1);
    expect(after.log.filter(e => e.text.includes('熔甲震荡」攻击')).every(e => e.addsStatus?.includes('burn'))).toBe(true);
    expect(skillCooldownLeft(after.playerUnits[0], 'molten_quake')).toBe(1);
    expect(parseEvent(after, after.log.find(e => e.text.includes('熔甲震荡」消耗'))!)).toMatchObject({ kind: 'buff', skillName: '熔甲震荡' });
  });

  it('震荡盾不足不能选择，执行前失盾不施放；强化不增加扣盾', () => {
    const b = quiet('molten_beast');
    b.playerUnits[0].shield = 2;
    expect(canUnitUseSkill(b.playerUnits[0], 'molten_quake')).toBe(false);
    b.playerUnits[0].shield = 3;
    b.playerUnits[0].skillEnhancements = { 3: 2 };
    const ordered = playerSkill(b, b.playerUnits[0].uid, 'molten_quake');
    const stopped = playerEndTurn({ ...ordered, playerUnits: ordered.playerUnits.map(u => ({ ...u, shield: 2 })) });
    expect(stopped.enemyUnits[0].hp).toBe(500);
    expect(stopped.playerUnits[0].shield).toBe(2);
    const after = playerEndTurn(ordered);
    expect(after.playerUnits[0].shield).toBe(0);
    expect(after.enemyUnits[0].hp).toBe(493);
    expect(skillFullDesc(getSkill('molten_quake'), 2)).toContain('造成5点伤害');
    expect(skillFullDesc(getSkill('molten_quake'), 2)).toContain('灼烧3层');
  });

  it.each([0, 1, 2, 3, 4, 8])('掠日破盾按实际盾量%s转火，无盾仍造成基础伤害', shield => {
    const b = quiet();
    b.enemyUnits[0].shield = shield;
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'sun_sunder', b.enemyUnits[0].uid));
    const hit = after.log.find(e => e.text.includes('掠日破盾」攻击'))!;
    const burn = hit.statuses?.[b.enemyUnits[0].uid].find(s => s.kind === 'burn')?.value ?? 0;
    expect(burn).toBe(Math.floor(Math.min(4, shield) / 2));
    expect(hit.hp?.[b.enemyUnits[0].uid]).toBe(500 - Math.max(0, 4 - Math.max(0, shield - 4)));
    expect(skillCooldownLeft(after.playerUnits[0], 'sun_sunder')).toBe(1);
  });

  it('被动先剥4盾且不计入技能转火，强化只增加基础伤害', () => {
    const b = quiet();
    b.enemyUnits[0].shield = 6;
    b.enemyUnits[0].statuses = [{ kind: 'burn', value: 4, turns: 2 }];
    b.playerUnits[0].skillEnhancements = { 3: 2 };
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'sun_sunder', b.enemyUnits[0].uid));
    const strips = after.log.filter(e => e.text.includes('剥除'));
    expect(strips.map(e => e.text)).toEqual([
      expect.stringContaining('烈日销甲」剥除'), expect.stringContaining('掠日破盾」剥除'),
    ]);
    const hit = after.log.find(e => e.text.includes('掠日破盾」攻击'))!;
    expect(hit.hp?.[b.enemyUnits[0].uid]).toBe(492);
    expect(hit.statuses?.[b.enemyUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(5);
    expect(parseEvent(after, strips[0])).toMatchObject({ kind: 'buff', skillName: '烈日销甲' });
    expect(skillFullDesc(getSkill('sun_sunder'), 2)).toContain('造成8点伤害');
    expect(skillFullDesc(getSkill('sun_sunder'), 2)).toContain('最多2层');
  });

  it('新技能只在传奇学习池，两只传奇不出现在第一幕，可在后续遭遇出现', () => {
    for (const id of ['molten_quake', 'sun_sunder']) {
      expect(LEGENDARY_SKILLS.has(id)).toBe(true);
      expect(getNormalSkillPool()).not.toContain(id);
    }
    const found = new Set<string>();
    for (let seed = 0; seed < 80; seed++) {
      expect(Object.values(generateMap(seed, 1).encounter).flat().some(e => ['molten_beast', 'solar_eagle'].includes(e.speciesId))).toBe(false);
      for (const act of [2, 3]) Object.values(generateMap(seed, act).encounter).flat().forEach(e => found.add(e.speciesId));
    }
    expect(found.has('molten_beast')).toBe(true);
    expect(found.has('solar_eagle')).toBe(true);
  });

  it.each(['molten_quake', 'sun_sunder'])('%s新附加的灼烧参与烙印引爆，且只引爆一次', skill => {
    const b = quiet(skill === 'molten_quake' ? 'molten_beast' : 'solar_eagle');
    b.playerUnits[0].skills = [skill];
    b.playerUnits[0].shield = 3;
    b.enemyUnits[0].shield = 8;
    b.enemyUnits[0].statuses = [
      { kind: 'burn', value: 4, turns: 2 },
      { kind: 'burnBrand', value: 1, turns: 2, sourceSide: 'player' },
    ];
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, skill, b.enemyUnits[0].uid));
    const explosion = after.log.filter(e => e.text.includes('灼烧烙印」引爆'));
    expect(explosion).toHaveLength(1);
    expect(explosion[0].text).toContain(skill === 'molten_quake' ? '引爆 5 层' : '引爆 6 层');
    expect(after.enemyUnits[0].statuses.some(s => s.kind === 'burn' || s.kind === 'burnBrand')).toBe(false);
  });
});
