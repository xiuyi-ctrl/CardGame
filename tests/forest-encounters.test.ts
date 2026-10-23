import { describe, expect, it } from 'vitest';
import { MAIN_REGIONS } from '../src/game/data/regions';
import { getMonster } from '../src/game/data/monsters';
import { createRng } from '../src/game/rng';
import { BOSS_MINIONS, FOREST_ENCOUNTER_TABLES, MIXED_ENCOUNTER_TABLES, buildEventByType, canStepTo, generateMap, nodeInfo } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { parseDualSave } from '../src/ui/persistence';
import { getMapRouteEdges } from '../src/ui/mapRoutes';

type Entry = readonly [string, number] | { species: string | string[]; weight: number } | { sequence: string[]; weight: number };
function ids(entry: Entry): readonly string[] {
  if ('sequence' in entry) return entry.sequence;
  if ('species' in entry) return typeof entry.species === 'string' ? [entry.species] : entry.species;
  return [entry[0]];
}
const forest = MAIN_REGIONS.emerald_forest;
const allowed = new Set([...forest.basePool, ...forest.evo1Pool, ...forest.evo2Pool]);

describe('林地固定遭遇表', () => {
  it('23张表均为原表完整条目的合法子集，顺序和权重不变且非空', () => {
    expect(Object.keys(FOREST_ENCOUNTER_TABLES)).toHaveLength(23);
    for (const name of Object.keys(MIXED_ENCOUNTER_TABLES) as (keyof typeof MIXED_ENCOUNTER_TABLES)[]) {
      const original: readonly Entry[] = MIXED_ENCOUNTER_TABLES[name];
      const expected = original.filter(entry => ids(entry).every(id => allowed.has(id)));
      expect(expected.length, name).toBeGreaterThan(0);
      expect(FOREST_ENCOUNTER_TABLES[name], name).toEqual(expected);
      FOREST_ENCOUNTER_TABLES[name].forEach(entry => expect(original).toContain(entry));
    }
  });

  it('保留原幕次与规模：第一幕普通为一阶，精英为二阶，车轮战轮数不变', () => {
    for (const [name, entries] of Object.entries(FOREST_ENCOUNTER_TABLES)) {
      for (const entry of entries) {
        const species = ids(entry);
        const size = name.match(/_([1234])V[1234]$/)?.[1] ?? name.match(/_GAUNTLET_([23])$/)?.[1];
        if (size) expect(species.length, name).toBe(Number(size));
        if (name.startsWith('ACT1_ENCOUNTERS')) species.forEach(id => expect(getMonster(id).rank).toBe(1));
        if (name === 'ACT1_ELITE_ENCOUNTERS') species.forEach(id => expect(getMonster(id).rank).toBe(2));
        if (name.startsWith('ACT1_')) species.forEach(id => expect(getMonster(id).rank).toBeLessThan(3));
      }
    }
  });
});

describe('林地地图与首领路线', () => {
  it.each(['normal', 'hard', 'nightmare'] as const)('%s 三幕40种子无地区外普通敌人，路线可达且首领配置正确', difficulty => {
    const thirdBosses = new Set<string>();
    const seenTypes = new Set<string>();
    for (let act = 1; act <= 3; act++) {
      for (let seed = 1; seed <= 40; seed++) {
        const map = generateMap(seed, act, difficulty, 'emerald_forest');
        const bosses = map.layers.at(-1)!;
        expect(bosses).toHaveLength(1);
        const bossNode = bosses[0];
        expect(bossNode.col).toBe(1);
        const bossId = map.boss[bossNode.id][0].speciesId;
        expect(forest.bossPools[act]).toContain(bossId);
        if (act === 3) thirdBosses.add(bossId);
        expect(map.boss[bossNode.id].map(unit => unit.speciesId)).toEqual([bossId, ...(BOSS_MINIONS[bossId] ?? [])]);
        const incoming = getMapRouteEdges(map).filter(edge => edge.to === bossNode.id);
        expect(incoming.length).toBe(map.layers.at(-2)!.length);
        const reachable = new Set(map.layers[0].map(node => node.id));
        for (let row = 1; row < map.layers.length; row++) {
          for (const node of map.layers[row]) {
            expect(map.layers[row - 1].some(parent => reachable.has(parent.id) && canStepTo(row - 1, parent.col, node, map)), node.id).toBe(true);
            reachable.add(node.id);
          }
          if (row < map.layers.length - 1) {
            for (const node of map.layers[row]) expect(map.layers[row + 1].some(next => canStepTo(row, node.col, next, map))).toBe(true);
          }
        }
        for (const node of map.layers.flat()) {
          const encounter = map.encounter[node.id];
          if (!encounter) continue;
          seenTypes.add(node.type);
          expect(encounter.length).toBeGreaterThan(0);
          encounter.forEach(unit => expect(allowed.has(unit.speciesId), unit.speciesId).toBe(true));
          if (act === 1) encounter.forEach(unit => expect(getMonster(unit.speciesId).rank).toBeLessThan(3));
          if (node.type === 'gauntlet') expect(encounter).toHaveLength(node.gauntletSize!);
        }
        for (const event of Object.values(map.events)) {
          event.choices.forEach(choice => choice.battleEnemies?.forEach(unit => expect(allowed.has(unit.speciesId)).toBe(true)));
        }
      }
    }
    expect([...thirdBosses].sort()).toEqual([...forest.bossPools[3]].sort());
    for (const type of ['battle', 'elite', 'arena', 'gauntlet', 'corrupted', 'guardian']) expect(seenTypes.has(type), type).toBe(true);
  });

  it('同种子重建一致，显式mixed与旧调用完全相同', () => {
    for (let act = 1; act <= 3; act++) {
      expect(generateMap(42, act, 'hard', 'emerald_forest')).toEqual(generateMap(42, act, 'hard', 'emerald_forest'));
      expect(generateMap(42, act, 'hard', 'mixed')).toEqual(generateMap(42, act, 'hard'));
    }
  });

  it('新局及幕间沿用地区，进入下一幕先到地图；读档不重建旧地图', () => {
    let state = gameReducer({ ...createInitialState(), region: 'emerald_forest' }, {
      type: 'START_RUN', starterId: 'fire_fox', companionId: 'kiki', seed: 42,
    });
    expect(state.map).toEqual(generateMap(42, 1, 'normal', 'emerald_forest'));
    for (const act of [2, 3]) {
      state = gameReducer({ ...state, screen: 'inter_act' }, { type: 'INTER_ACT_CONTINUE' });
      expect(state.region).toBe('emerald_forest');
      expect(state.screen).toBe('map');
      expect(state.currentNodeId).toBe('');
      expect(state.formation).toBeUndefined();
      expect(state.map).toEqual(generateMap(42, act, 'normal', 'emerald_forest'));
    }
    const legacy = { ...state, map: generateMap(42, 3) };
    expect(parseDualSave(JSON.stringify(legacy))!.main!.map).toEqual(legacy.map);
  });

  it('流浪精灵、训练场挑战的敌人也来自林地，但不改事件奖励', () => {
    for (const type of ['精灵', '训练']) {
      for (let act = 1; act <= 3; act++) {
        for (let seed = 1; seed <= 20; seed++) {
          const event = buildEventByType(createRng(seed), type, act, 'emerald_forest');
          const battle = event.choices.find(choice => choice.kind === 'battle')!;
          expect(battle.battleEnemies!.length).toBeGreaterThan(0);
          battle.battleEnemies!.forEach(unit => {
            expect(allowed.has(unit.speciesId)).toBe(true);
            expect(getMonster(unit.speciesId).rank).toBe(act);
          });
          const mixed = buildEventByType(createRng(seed), type, act);
          expect(battle.battleReward).toEqual(mixed.choices.find(choice => choice.kind === 'battle')!.battleReward);
        }
      }
    }
  });

  it('侦查首领与实际入场名单一致，所有前一层节点能进入同一首领', () => {
    for (let act = 1; act <= 3; act++) {
      const map = generateMap(42, act, 'normal', 'emerald_forest');
      const boss = map.layers.at(-1)![0];
      const base = { ...createInitialState(), region: 'emerald_forest' as const, act, seed: 42, map,
        roster: [gameReducer(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'kiki', seed: 42 }).roster[0]],
      };
      expect(nodeInfo(base, boss).detail).toContain(getMonster(map.boss[boss.id][0].speciesId).name);
      for (const parent of map.layers.at(-2)!) {
        const entered = gameReducer({ ...base, screen: 'map', currentRow: map.layers.length - 2, currentNodeId: parent.id }, { type: 'MOVE', nodeId: boss.id });
        expect(entered.currentNodeId).toBe(boss.id);
        expect(entered.screen).toBe('formation');
        expect(entered.formation!.encounter).toEqual(map.boss[boss.id]);
      }
    }
  });
});
