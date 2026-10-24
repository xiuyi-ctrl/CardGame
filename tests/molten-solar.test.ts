import { describe, expect, it } from 'vitest';
import { canUnitUseSkill, createBattle, makeUnit, playerEndTurn, playerSkill, skillCooldownLeft, skillUsesLeft } from '../src/game/core/battle';
import { LEGENDARY } from '../src/game/core/growth-map';
import { getNormalSkillPool, LEGENDARY_SKILLS } from '../src/game/core/growth';
import { getSkill } from '../src/game/data/skills';
import { MAIN_EVO2_POOL } from '../src/game/data/monsters';
import { fusionNeedCount, generateMap, nextStage } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { parseEvent } from '../src/ui/battleFx';
import { skillFullDesc } from '../src/ui/components';
import type { BattleState } from '../src/game/types';

function quiet(species = 'solar_eagle', count = 1): BattleState {
  const b = createBattle([{ ...makeUnit(species, true, 0, false), hp: 100, maxHp: 100, spd: 20 }],
    Array.from({ length: count }, () => ({ speciesId: 'momo' })), 11);
  return { ...b, enemyUnits: b.enemyUnits.map(u => ({ ...u, hp: 500, maxHp: 500, skills: [], acted: true })) };
}

describe('熔甲兽与烈日神鹰', () => {
  it.each([
    ['molten_beetle', 'molten_beast', 25, 4, ['heated_shell_bump', 'molten_self_burn', 'shell_charge', 'molten_quake']],
    ['searing_hawk', 'solar_eagle', 21, 7, ['flame_tracing_feather', 'fire_feather', 'burn_brand', 'sun_sunder']],
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
    expect(after.playerUnits[0].hp).toBe(98);
    expect(after.playerUnits[0].shield).toBe(8);
    expect(after.playerUnits[0].statuses.some(s => s.kind === 'burn')).toBe(false);
    const log = after.log.find(e => e.text.includes('赤甲炼火」获得 6'))!;
    expect(parseEvent(after, log)).toMatchObject({ kind: 'buff', skillName: '赤甲炼火' });
  });

  it('震荡群攻只为自身附火一次，不扣盾，所有敌人附火，冷却1回合', () => {
    const b = quiet('molten_beast', 3);
    b.playerUnits[0].shield = 7;
    b.playerUnits[0].passive = undefined;
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'molten_quake'));
    expect(after.playerUnits[0].shield).toBe(7);
    expect(after.playerUnits[0].hp).toBe(98);
    expect(after.enemyUnits.map(u => u.hp)).toEqual([496, 496, 496]);
    const selfBurn = after.log.filter(e => e.text.includes('熔甲震荡」，'));
    expect(selfBurn).toHaveLength(1);
    expect(selfBurn[0].statuses?.[b.playerUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(3);
    expect(after.log.filter(e => e.text.includes('熔甲震荡」攻击')).every(e => e.addsStatus?.includes('burn'))).toBe(true);
    expect(skillCooldownLeft(after.playerUnits[0], 'molten_quake')).toBe(1);
    expect(skillUsesLeft(after.playerUnits[0], 'molten_quake')).toBe(4);
    expect(parseEvent(after, selfBurn[0])).toMatchObject({ kind: 'buff', skillName: '熔甲震荡' });
  });

  it('震荡无盾仍可使用，执行前失盾不影响施放；强化不增加自身灼烧', () => {
    const b = quiet('molten_beast');
    b.playerUnits[0].passive = undefined;
    expect(canUnitUseSkill(b.playerUnits[0], 'molten_quake')).toBe(true);
    b.playerUnits[0].skillEnhancements = { 3: 2 };
    const ordered = playerSkill(b, b.playerUnits[0].uid, 'molten_quake');
    const after = playerEndTurn({ ...ordered, playerUnits: ordered.playerUnits.map(u => ({ ...u, shield: 0 })) });
    expect(after.playerUnits[0].shield).toBe(0);
    expect(after.enemyUnits[0].hp).toBe(493);
    expect(after.log.find(e => e.text.includes('熔甲震荡」，'))?.statuses?.[b.playerUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(3);
    expect(skillFullDesc(getSkill('molten_quake'), 2)).toContain('造成5点伤害');
    expect(skillFullDesc(getSkill('molten_quake'), 2)).toContain('自身施加3层灼烧');
    expect(skillFullDesc(getSkill('molten_quake'), 2)).toContain('附加灼烧3层');
    expect(skillFullDesc(getSkill('molten_quake'), 2)).toContain('每场限5次');
  });

  it('震荡每场最多5次，冷却回合不能选择，耗尽后不能再次施放', () => {
    let b = quiet('molten_beast');
    b.playerUnits[0].passive = undefined;
    const uid = b.playerUnits[0].uid;
    for (let i = 0; i < 5; i++) {
      b = playerEndTurn(playerSkill(b, uid, 'molten_quake'));
      expect(skillUsesLeft(b.playerUnits[0], 'molten_quake')).toBe(4 - i);
      expect(canUnitUseSkill(b.playerUnits[0], 'molten_quake')).toBe(false);
      if (i < 4) b = playerEndTurn(b);
    }
    b = playerEndTurn(b);
    expect(skillCooldownLeft(b.playerUnits[0], 'molten_quake')).toBe(0);
    expect(canUnitUseSkill(b.playerUnits[0], 'molten_quake')).toBe(false);
    expect(playerSkill(b, uid, 'molten_quake')).toBe(b);
    expect(b.log.filter(e => e.text.includes('熔甲震荡」，'))).toHaveLength(5);
  });

  it('旧单位未记录震荡次数时，首次施放仍从5次扣减', () => {
    const b = quiet('molten_beast');
    b.playerUnits[0].skillUses = {};
    expect(skillUsesLeft(b.playerUnits[0], 'molten_quake')).toBe(5);
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'molten_quake'));
    expect(skillUsesLeft(after.playerUnits[0], 'molten_quake')).toBe(4);
  });

  it('敌方无盾也能使用震荡，自身附火且扣减次数', () => {
    const b = createBattle([{ ...makeUnit('momo', true, 0, false), hp: 100, maxHp: 100 }], [{ speciesId: 'molten_beast' }], 3);
    b.enemyUnits[0].skills = ['molten_quake'];
    b.enemyUnits[0].passive = undefined;
    const uid = b.enemyUnits[0].uid;
    const after = playerEndTurn(b);
    expect(after.playerUnits[0].hp).toBe(96);
    expect(after.log.find(e => e.actorUid === uid && e.text.includes('熔甲震荡」，'))?.statuses?.[uid].find(s => s.kind === 'burn')?.value).toBe(3);
    expect(skillUsesLeft(after.enemyUnits[0], 'molten_quake')).toBe(4);
    expect(skillCooldownLeft(after.enemyUnits[0], 'molten_quake')).toBe(1);
  });

  it.each([0, 1, 2, 3, 4, 8, 99])('掠日破盾清空%s盾，有盾固定附火5层，无盾仍造成基础伤害', shield => {
    const b = quiet();
    b.enemyUnits[0].shield = shield;
    if (shield > 0) b.enemyUnits[0].statuses = [{ kind: 'shield', value: shield, turns: 2 }];
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'sun_sunder', b.enemyUnits[0].uid));
    const hit = after.log.find(e => e.text.includes('掠日破盾」攻击'))!;
    const burn = hit.statuses?.[b.enemyUnits[0].uid].find(s => s.kind === 'burn')?.value ?? 0;
    expect(burn).toBe(shield > 0 ? 5 : 0);
    expect(hit.hp?.[b.enemyUnits[0].uid]).toBe(496);
    expect(hit.shields?.[b.enemyUnits[0].uid]).toBe(0);
    expect(hit.statuses?.[b.enemyUnits[0].uid].some(s => s.kind === 'shield')).toBe(false);
    expect(skillCooldownLeft(after.playerUnits[0], 'sun_sunder')).toBe(1);
  });

  it.each([1, 5, 6, 99])('被动剥除计入附火条件：%s盾，强化只增加基础伤害', shield => {
    const b = quiet();
    b.enemyUnits[0].shield = shield;
    b.enemyUnits[0].statuses = [{ kind: 'burn', value: 4, turns: 2 }];
    b.playerUnits[0].skillEnhancements = { 3: 2 };
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'sun_sunder', b.enemyUnits[0].uid));
    const strips = after.log.filter(e => e.text.includes('剥除'));
    expect(strips.map(e => e.text)).toEqual(shield > 7 ? [
      expect.stringContaining('烈日销甲」剥除'), expect.stringContaining('掠日破盾」剥除'),
    ] : [expect.stringContaining('烈日销甲」剥除')]);
    const hit = after.log.find(e => e.text.includes('掠日破盾」攻击'))!;
    expect(hit.hp?.[b.enemyUnits[0].uid]).toBe(492);
    expect(hit.statuses?.[b.enemyUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(9);
    expect(parseEvent(after, strips[0])).toMatchObject({ kind: 'buff', skillName: '烈日销甲' });
    expect(skillFullDesc(getSkill('sun_sunder'), 2)).toContain('造成8点伤害');
    expect(skillFullDesc(getSkill('sun_sunder'), 2)).toContain('附加5层灼烧');
    expect(hit.shields?.[b.enemyUnits[0].uid]).toBe(0);
  });

  it.each([0, 9])('被动本回合已触发时，只按此次实际移除%s盾判定，不追溯之前剥盾', shield => {
    const b = quiet();
    b.playerUnits[0].burnStripUsed = true;
    b.enemyUnits[0].shield = shield;
    b.enemyUnits[0].statuses = [{ kind: 'burn', value: 4, turns: 2 }];
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'sun_sunder', b.enemyUnits[0].uid));
    const hit = after.log.find(e => e.text.includes('掠日破盾」攻击'))!;
    expect(hit.statuses?.[b.enemyUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(shield > 0 ? 9 : 4);
    expect(after.log.some(e => e.text.includes('烈日销甲」剥除'))).toBe(false);
  });

  it('非本系学习者和敌方同样清除全部护盾并附火5层', () => {
    const b = quiet('momo');
    b.playerUnits[0].skills = ['sun_sunder'];
    b.enemyUnits[0].shield = 40;
    const learned = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'sun_sunder', b.enemyUnits[0].uid));
    const hit = learned.log.find(e => e.text.includes('掠日破盾」攻击'))!;
    expect(hit.shields?.[b.enemyUnits[0].uid]).toBe(0);
    expect(hit.statuses?.[b.enemyUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(5);
    const enemy = createBattle([{ ...makeUnit('momo', true, 0, false), hp: 100, maxHp: 100 }], [{ speciesId: 'solar_eagle' }], 3);
    enemy.playerUnits[0].shield = 40;
    enemy.enemyUnits[0].skills = ['sun_sunder'];
    const acted = playerEndTurn(enemy);
    const enemyHit = acted.log.find(e => e.text.includes('掠日破盾」攻击'))!;
    expect(enemyHit.shields?.[enemy.playerUnits[0].uid]).toBe(0);
    expect(enemyHit.hp?.[enemy.playerUnits[0].uid]).toBe(96);
    expect(enemyHit.statuses?.[enemy.playerUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(5);
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
    expect(explosion[0].text).toContain(skill === 'sun_sunder' ? '引爆 9 层' : '引爆 5 层');
    expect(after.enemyUnits[0].statuses.some(s => s.kind === 'burn' || s.kind === 'burnBrand')).toBe(false);
  });
});
