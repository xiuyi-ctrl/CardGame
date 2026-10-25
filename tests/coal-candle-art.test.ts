import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { getMonster } from '../src/game/data/monsters';
import { createInitialState, migrateGameState } from '../src/game/state/reducer';
import { PixelCreature } from '../src/ui/components';

describe('煤煤、烛烛立绘接入', () => {
  it.each([
    ['coal', 'coal-pixel-v1'], ['candle', 'candle-pixel-v1'],
    ['coal_guard', 'coal-guard-pixel-v3'], ['lantern_moth', 'lantern-moth-pixel-v3'],
    ['furnace_beast', 'furnace-beast-pixel-v2'],
    ['eternal_moth', 'eternal-moth-pixel-v1'],
  ])('%s 使用透明原稿，同步素材归档且不经画布降采样', (species, folder) => {
    const path = `/${species}.png`;
    expect(getMonster(species).image).toBe(path);
    const runtime = readFileSync(`public${path}`);
    expect(runtime.equals(readFileSync(`design/creatures/${folder}/sprite-original.png`))).toBe(true);
    expect(runtime.equals(readFileSync(`美术素材${path}`))).toBe(true);
    expect(runtime.subarray(1, 4).toString()).toBe('PNG');
    expect(runtime[25]).toBe(6);
    const markup = renderToStaticMarkup(createElement(PixelCreature, { unit: makeUnit(species, true, 0, false) }));
    expect(markup).toContain('native-creature-art');
    expect(markup).toContain(`src="${path}"`);
    expect(markup).not.toContain('<canvas');
  });

  it('旧队伍、布阵与战斗补齐立绘，保留原有单位数据且不改输入', () => {
    const units = ['coal_guard', 'lantern_moth', 'eternal_moth'].map((id, column) => ({ ...makeUnit(id, true, column as 0 | 1 | 2, false), image: undefined, hp: 4, maxHp: 35, spd: 7 }));
    const battle = createBattle(units, [{ speciesId: 'coal' }], 42);
    battle.enemyUnits[0].image = undefined;
    const state = { ...createInitialState(), roster: units, battle, formation: { units, initialField: units, encounter: [{ speciesId: 'coal' }], nodeId: 'test' } };
    const migrated = migrateGameState(state)!;
    expect(migrated).not.toBeNull();
    for (const list of [migrated.roster, migrated.formation!.units, migrated.formation!.initialField, migrated.battle!.playerUnits]) {
      list.forEach((unit, i) => expect(unit).toEqual({ ...units[i], image: `/${unit.speciesId}.png` }));
    }
    expect(migrated.battle!.enemyUnits[0].image).toBe('/coal.png');
    expect(state.roster[0].image).toBeUndefined();
    expect(state.battle.enemyUnits[0].image).toBeUndefined();
    expect(migrateGameState(migrated)).toEqual(migrated);
  });
});
