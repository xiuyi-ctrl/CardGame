import { describe, expect, it } from 'vitest';
import { getMonster } from '../src/game/data/monsters';
import { MAIN_REGIONS } from '../src/game/data/regions';
import { createRng } from '../src/game/rng';
import { buildEventByType, FOREST_ENCOUNTER_TABLES, generateMap, MIXED_ENCOUNTER_TABLES } from '../src/game/state/game';
import { createInitialState, migrateGameState } from '../src/game/state/reducer';

type Entry = readonly [string, number] | { species: string | string[]; weight: number } | { sequence: string[]; weight: number };
function ids(e: Entry): readonly string[] {
  if ('sequence' in e) return e.sequence;
  if ('species' in e) return typeof e.species === 'string' ? [e.species] : e.species;
  return [e[0]];
}
const soloBlocked = new Set(['torch_fox', 'torch_fox_lord', 'lulu', 'kiki', 'light_moss', 'candle', 'lulu_king', 'gora', 'moss_beast', 'lantern_moth', 'lulu_god', 'gora_god', 'solar_spirit', 'eternal_moth']);
const healers = new Set(['lulu', 'light_moss', 'candle', 'lulu_king', 'moss_beast', 'lantern_moth', 'lulu_god', 'solar_spirit', 'eternal_moth']);

describe('主模式遭遇职责', () => {
  it.each([['mixed', MIXED_ENCOUNTER_TABLES], ['emerald_forest', FOREST_ENCOUNTER_TABLES]] as const)('%s 单体和每只车轮战敌人均能独立作战，组合有威胁且不堆治疗', (region, tables) => {
    const ecology = MAIN_REGIONS[region];
    const allowed = new Set([...ecology.basePool, ...ecology.evo1Pool, ...ecology.evo2Pool, 'sisi_god']);
    for (const [name, rows] of Object.entries(tables)) {
      expect(rows.length, name).toBeGreaterThanOrEqual(3);
      for (const entry of rows) {
        const team = ids(entry);
        team.forEach(id => expect(allowed.has(id), `${name}:${id}`).toBe(true));
        if (team.length === 1 || name.includes('GAUNTLET')) {
          team.forEach(id => expect(soloBlocked.has(id), `${name}:${id}`).toBe(false));
        } else {
          expect(team.some(id => !soloBlocked.has(id)), name).toBe(true);
          expect(team.filter(id => healers.has(id)).length, `${name}:${team}`).toBeLessThanOrEqual(1);
        }
        if (name === 'ACT3_ENCOUNTERS_3V3') expect(team.filter(id => getMonster(id).rank === 3).length).toBeLessThanOrEqual(1);
        if (name === 'ACT3_ENCOUNTERS_4V4') expect(team.filter(id => getMonster(id).rank === 3).length).toBeLessThanOrEqual(2);
      }
    }
  });

  it('煤煤与刺刺完整进化链保留对应幕次单体资格，林地仍不投放煤煤链', () => {
    for (const [table, wanted] of [
      [MIXED_ENCOUNTER_TABLES.ACT1_ENCOUNTERS_1V1, ['coal', 'pipi']],
      [MIXED_ENCOUNTER_TABLES.ACT2_ENCOUNTERS_1V1, ['coal_guard', 'sisi']],
      [MIXED_ENCOUNTER_TABLES.ACT3_ENCOUNTERS_1V1, ['furnace_beast', 'sisi_god']],
      [MIXED_ENCOUNTER_TABLES.ACT1_ELITE_ENCOUNTERS, ['coal_guard', 'sisi']],
      [MIXED_ENCOUNTER_TABLES.ACT2_ELITE_ENCOUNTERS, ['furnace_beast', 'sisi_god']],
      [MIXED_ENCOUNTER_TABLES.ACT3_GUARDIAN_1V1, ['furnace_beast', 'sisi_god']],
    ] as const) expect(table.flatMap(ids)).toEqual(expect.arrayContaining([...wanted]));
    for (const rows of Object.values(FOREST_ENCOUNTER_TABLES)) expect(rows.flatMap(ids).some(id => ['coal', 'coal_guard', 'furnace_beast'].includes(id))).toBe(false);
  });

  it.each(['mixed', 'emerald_forest'] as const)('%s 支援生物在组合遭遇中仍可获取，未从生态中删除', region => {
    const tables = region === 'mixed' ? MIXED_ENCOUNTER_TABLES : FOREST_ENCOUNTER_TABLES;
    const ecology = MAIN_REGIONS[region];
    const seen = new Set(Object.entries(tables).filter(([name]) => !name.includes('GAUNTLET')).flatMap(([, rows]) => rows.flatMap(ids)));
    for (const id of [...ecology.basePool, ...ecology.evo1Pool, ...ecology.evo2Pool]) expect(seen.has(id), id).toBe(true);
  });

  it.each(['mixed', 'emerald_forest'] as const)('%s 三幕两类事件的人数、品阶、搭配和后续随机节奏正确', region => {
    for (let act = 1; act <= 3; act++) for (const type of ['精灵', '训练']) for (let seed = 0; seed < 80; seed++) {
      const rng = createRng(seed);
      const event = buildEventByType(rng, type, act, region);
      const enemies = event.choices.find(c => c.kind === 'battle')!.battleEnemies!;
      const team = enemies.map(u => u.speciesId);
      expect(team.length).toBeGreaterThanOrEqual(type === '精灵' ? 1 : 2);
      expect(team.length).toBeLessThanOrEqual(type === '精灵' ? 2 : 3);
      team.forEach(id => expect(getMonster(id).rank).toBe(act));
      if (team.length === 1) expect(soloBlocked.has(team[0])).toBe(false);
      else {
        expect(team.some(id => !soloBlocked.has(id))).toBe(true);
        expect(team.filter(id => healers.has(id)).length).toBeLessThanOrEqual(1);
      }
      // 模拟旧实现消耗的规模抽签、每只敌人抽签及后续奖励随机数。
      const legacyRng = createRng(seed);
      const expectedCount = type === '精灵' ? legacyRng() < 0.6 ? 1 : 2 : 2 + Math.floor(legacyRng() * 2);
      for (let i = 0; i < expectedCount; i++) legacyRng();
      if (type === '精灵') { legacyRng(); legacyRng(); if (event.choices[1].itemId) legacyRng(); }
      expect(rng()).toBe(legacyRng());
      expect(buildEventByType(createRng(seed), type, act, region)).toEqual(event);
    }
  });

  it('存档不重建已生成的旧单体遭遇', () => {
    const state = createInitialState();
    state.map = generateMap(17, 1);
    const nodeId = Object.keys(state.map.encounter)[0];
    state.map.encounter[nodeId] = [{ speciesId: 'light_moss' }];
    const loaded = migrateGameState(JSON.parse(JSON.stringify(state)))!;
    expect(loaded.map.encounter[nodeId]).toEqual([{ speciesId: 'light_moss' }]);
  });
});
