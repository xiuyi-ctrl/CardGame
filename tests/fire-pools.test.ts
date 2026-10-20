import { describe, expect, it } from 'vitest';
import { MAIN_BASE_POOL, MAIN_EVO1_POOL, MAIN_EVO2_POOL, STARTER_GROUP_1, STARTER_GROUP_2 } from '../src/game/data/monsters';
import { generateMap } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { makeUnit } from '../src/game/core/battle';
import { createRng } from '../src/game/rng';
import { getGrowthEncounter, getGrowthEliteEncounter, TIER1, TIER2, LEGENDARY } from '../src/game/core/growth-map';
import { getGrowthArenaEncounter } from '../src/game/data/growth-arena';
import { getNormalSkillPool, getRandomSkillChoices, getRandomLegendarySkillChoices, LEGENDARY_SKILLS } from '../src/game/core/growth';
import { applyEnemySkillProgression } from '../src/game/core/enemy-progression';

const base = ['coal', 'candle'];
const tier2 = ['coal_guard', 'lantern_moth'];
const legends = ['furnace_beast', 'eternal_moth'];
const ordinarySkills = ['coal_claw', 'furnace_shell', 'ash_shelter', 'candle_flame', 'stoke_fire', 'lamp_guard'];
const legendarySkills = ['molten_claw', 'furnace_bastion', 'seal_furnace', 'eternal_flame', 'blazing_fuel', 'ember_transfer'];

describe('灼烧新生物与技能完整投放', () => {
  it('主模式对应阶级池完整，开局仍为原六种', () => {
    expect(MAIN_BASE_POOL).toEqual(expect.arrayContaining(base));
    expect(MAIN_EVO1_POOL).toEqual(expect.arrayContaining(tier2));
    expect(MAIN_EVO2_POOL).toEqual(expect.arrayContaining(legends));
    expect([...STARTER_GROUP_1, ...STARTER_GROUP_2]).toEqual(['momo', 'lulu', 'fifi', 'kiki', 'mimi', 'pipi']);
  });

  it.each([1, 2, 3])('第%d幕各类遭遇均可抽中新生物，规模与首领规则不变', (act) => {
    const seen = new Map<string, Set<string>>();
    for (let seed = 0; seed < 500; seed++) {
      const map = generateMap(seed, act);
      for (const node of map.layers.flat()) {
        const enemies = map.encounter[node.id];
        if (!enemies) continue;
        const key = `${node.type}:${enemies.length}`;
        const species = seen.get(key) ?? new Set<string>();
        enemies.forEach(e => species.add(e.speciesId));
        seen.set(key, species);
        if (act === 1) expect(enemies.every(e => !legends.includes(e.speciesId))).toBe(true);
      }
      for (const enemies of Object.values(map.boss)) {
        expect(enemies.every(e => ![...base, ...tier2, ...legends].includes(e.speciesId))).toBe(true);
      }
    }
    const normal = act === 1 ? base : act === 2 ? tier2 : legends;
    const special = act === 1 ? tier2 : legends;
    for (const count of act === 3 ? [1, 2, 3, 4] : [1, 2, 3]) {
      for (const id of normal) expect(seen.get(`battle:${count}`)?.has(id), `幕${act} battle:${count} ${id}`).toBe(true);
    }
    for (const type of ['elite', 'arena', 'guardian']) {
      const all = new Set([...seen].filter(([key]) => key.startsWith(`${type}:`)).flatMap(([, ids]) => [...ids]));
      for (const id of special) expect(all.has(id), `幕${act} ${type} ${id}`).toBe(true);
    }
    for (const count of act === 3 ? [2, 3] : [2]) {
      for (const id of normal) expect(seen.get(`gauntlet:${count}`)?.has(id), `幕${act} gauntlet:${count} ${id}`).toBe(true);
    }
    expect(generateMap(47, act)).toEqual(generateMap(47, act));
  });

  it('熟练度阶级池、普通战、精英与竞技场按原层数规则加入', () => {
    expect(TIER1).toEqual(expect.arrayContaining(base));
    expect(TIER2).toEqual(expect.arrayContaining(tier2));
    expect(LEGENDARY).toEqual(expect.arrayContaining(legends));
    for (const [layer, wanted] of [[5, base], [20, [...base, ...tier2]], [35, [...base, ...tier2]], [45, [...tier2, ...legends]]] as const) {
      const found = new Set<string>();
      for (let seed = 0; seed < 200; seed++) {
        getGrowthEncounter(layer, createRng(seed)).forEach(e => found.add(e.speciesId));
      }
      for (const id of wanted) expect(found.has(id)).toBe(true);
      if (layer <= 40) expect(legends.some(id => found.has(id))).toBe(false);
    }
    for (const getEncounter of [getGrowthEliteEncounter, getGrowthArenaEncounter]) {
      for (const [layer, wanted] of [[5, tier2], [45, legends]] as const) {
        const found = new Set<string>();
        for (let seed = 0; seed < 200; seed++) getEncounter(layer, createRng(seed)).forEach(e => found.add(e.speciesId));
        for (const id of wanted) expect(found.has(id)).toBe(true);
        if (layer === 5) expect(legends.some(id => found.has(id))).toBe(false);
      }
    }
  });

  it('熟练度商店招募包含两只新一阶，仍只招募一阶', () => {
    const found = new Set<string>();
    for (let seed = 0; seed < 150; seed++) {
      const initial = { ...createInitialState(), runMode: 'proficiency' as const, screen: 'shop' as const, seed, gold: 100, roster: [] };
      const result = gameReducer(initial, { type: 'PROF_SHOP_BUY', itemId: 'pet_recruit' });
      expect(result.roster).toHaveLength(1);
      expect(TIER1).toContain(result.roster[0].speciesId);
      found.add(result.roster[0].speciesId);
    }
    for (const id of base) expect(found.has(id)).toBe(true);
  });

  it('普通与传奇学习池互斥，抽取排除已学且可复现', () => {
    const unit = makeUnit('momo', true, 0, false);
    const normal = getNormalSkillPool();
    expect(normal).toEqual(expect.arrayContaining(ordinarySkills));
    for (const id of legendarySkills) {
      expect(LEGENDARY_SKILLS.has(id)).toBe(true);
      expect(normal).not.toContain(id);
    }
    expect(LEGENDARY_SKILLS.size).toBe(37);
    expect(getRandomSkillChoices(unit, normal.length, createRng(1))).toEqual(expect.arrayContaining(ordinarySkills));
    expect(getRandomLegendarySkillChoices(unit, 100, createRng(1))).toEqual(expect.arrayContaining(legendarySkills));
    const learned = { ...unit, skills: [...ordinarySkills, ...legendarySkills] };
    expect(getRandomSkillChoices(learned, 100, createRng(1)).some(id => learned.skills.includes(id))).toBe(false);
    expect(getRandomLegendarySkillChoices(learned, 100, createRng(1)).some(id => learned.skills.includes(id))).toBe(false);
    expect(getRandomLegendarySkillChoices(unit, 3, createRng(17))).toEqual(getRandomLegendarySkillChoices(unit, 3, createRng(17)));
  });

  it('高层新敌人沿用技能替换和强化规则', () => {
    expect(applyEnemySkillProgression(makeUnit('coal', false, 0, false), 45).skills).toEqual(['molten_claw', 'furnace_shell']);
    const moth = applyEnemySkillProgression(makeUnit('candle', false, 0, false), 45);
    expect(moth.skills).toEqual(['eternal_flame', 'blazing_fuel']);
    expect(moth.skillEnhancements).toEqual({ 0: 3, 1: 3 });
  });
});
