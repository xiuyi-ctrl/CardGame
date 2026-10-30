import { describe, expect, it } from 'vitest';
import { growthDuelEnemy } from '../src/game/data/growth-encounters';
import { getMonster } from '../src/game/data/monsters';
import { createRng } from '../src/game/rng';
import { getProficiencyEnemyScaling, makeUnit } from '../src/game/core/battle';
import { getEnemySkillTier } from '../src/game/core/enemy-progression';
import { buildGrowthEvent } from '../src/game/data/growth-events';
import { beginGrowthEncounter } from '../src/game/state/growth-encounters';
import { createInitialState, gameReducer, migrateGameState } from '../src/game/state/reducer';

const withoutUid = (units: ReturnType<typeof makeUnit>[]) => units.map(({ uid: _uid, ...unit }) => unit);

describe('单人考核的平滑敌人投放', () => {
  it.each([
    [5, 0, 0], [10, .2, 0], [14, .55, 0], [16, .55, 0], [20, .9, 0],
    [24, 1, 0], [31, 1, 0], [32, .9625, .0375], [35, .85, .15], [40, .6, .4], [45, .2, .8], [50, 0, 1],
  ])('第%s层二阶、传奇概率符合新成长锚点', (layer, tier2, legendary) => {
    const counts = [0, 0, 0, 0];
    for (let seed = 0; seed < 4000; seed++) {
      const team = growthDuelEnemy(layer, createRng(seed));
      expect(team).toHaveLength(1);
      counts[getMonster(team[0].speciesId).rank]++;
    }
    expect(counts[2] / 4000).toBeCloseTo(tier2, 1);
    expect(counts[3] / 4000).toBeCloseTo(legendary, 1);
  });

  it('50层全部候选均为合法单体，首领后不跳品阶，不出现辅助或特殊生物', () => {
    const excluded = new Set(['lulu', 'lulu_king', 'lulu_god', 'kiki', 'gora', 'gora_god', 'candle', 'lantern_moth', 'eternal_moth', 'light_moss', 'moss_beast', 'solar_spirit', 'torch_fox', 'torch_fox_lord']);
    const seen = new Set<string>();
    for (let layer = 1; layer <= 50; layer++) for (let seed = 0; seed < 200; seed++) {
      const enemy = growthDuelEnemy(layer, createRng(seed));
      expect(growthDuelEnemy(layer, createRng(seed))).toEqual(enemy);
      const species = getMonster(enemy[0].speciesId);
      expect(species.rank).toBeLessThan(4);
      expect(species.eggBorn).not.toBe(true);
      expect(excluded.has(species.id)).toBe(false);
      if (layer <= 31) expect(species.rank).toBeLessThan(3);
      seen.add(species.id);
    }
    for (const id of ['coal', 'coal_guard', 'furnace_beast', 'pipi', 'sisi', 'sisi_god']) expect(seen.has(id)).toBe(true);
    for (let seed = 0; seed < 100; seed++) {
      expect(growthDuelEnemy(14, createRng(seed))).toEqual(growthDuelEnemy(16, createRng(seed)));
      expect(growthDuelEnemy(29, createRng(seed))).toEqual(growthDuelEnemy(31, createRng(seed)));
    }
  });

  it('预览、取消再打开、读档和实际敌人一致，维持单人出战及原技能成长', () => {
    for (const layer of [8, 16, 23, 32, 47]) {
      const base = gameReducer(createInitialState(), { type: 'START_PROFICIENCY_PICKED', seed: 3011, starterId: 'momo', companionId: 'lulu' });
      const id = `pf_${layer}`, event = buildGrowthEvent(createRng(3011), 'battle_master', 0, layer);
      const state = { ...base, currentLayer: layer, currentRow: layer - 1, currentNodeId: id, screen: 'event' as const,
        map: { ...base.map, events: { [id]: event } } };
      const preview = beginGrowthEncounter(state, 'duel');
      const enemy = preview.growthEncounterPending!.enemies![0];
      const reopened = beginGrowthEncounter(gameReducer(preview, { type: 'GROWTH_ENCOUNTER_CANCEL' }), 'duel');
      expect(withoutUid(reopened.growthEncounterPending!.enemies!)).toEqual(withoutUid(preview.growthEncounterPending!.enemies!));
      const restored = migrateGameState(JSON.parse(JSON.stringify(reopened)))!;
      const battle = gameReducer(restored, { type: 'GROWTH_ENCOUNTER_CONFIRM', uid: restored.roster[1].uid }).battle!;
      expect(battle.playerUnits).toHaveLength(1);
      expect(battle.playerUnits[0].uid).toBe(restored.roster[1].uid);
      expect(withoutUid(battle.enemyUnits)).toEqual(withoutUid(preview.growthEncounterPending!.enemies!));
      const baseEnemy = makeUnit(enemy.speciesId, false, 0, false);
      expect(enemy.maxHp).toBe(Math.round(baseEnemy.maxHp * getProficiencyEnemyScaling(layer).hpMult));
      expect(enemy.spd).toBe(baseEnemy.spd + getProficiencyEnemyScaling(layer).spdBonus);
      expect(Object.values(enemy.skillEnhancements ?? {}).every(level => level <= getEnemySkillTier(layer).enhanceLevel)).toBe(true);
    }
  });

  it('旧事件已保存敌人不按新池重抽，包括旧版提前生成的传奇', () => {
    const base = gameReducer(createInitialState(), { type: 'START_PROFICIENCY_PICKED', seed: 18, starterId: 'momo', companionId: 'lulu' });
    const event = buildGrowthEvent(createRng(18), 'battle_master', 0, 20);
    event.choices[0].battleEnemies = [{ speciesId: 'fifi_god' }];
    const restored = migrateGameState(JSON.parse(JSON.stringify({ ...base, screen: 'event', currentLayer: 20, currentNodeId: 'legacy', map: { ...base.map, events: { legacy: event } } })))!;
    const preview = beginGrowthEncounter(restored, 'duel');
    expect(preview.growthEncounterPending!.enemies![0].speciesId).toBe('fifi_god');
    const result = gameReducer(preview, { type: 'GROWTH_ENCOUNTER_CONFIRM', uid: restored.roster[0].uid });
    expect(result.battle!.enemyUnits[0].speciesId).toBe('fifi_god');
  });
});
