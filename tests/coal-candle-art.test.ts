import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { getMonster } from '../src/game/data/monsters';
import { createInitialState, migrateGameState } from '../src/game/state/reducer';
import { PixelCreature, UnitCard } from '../src/ui/components';

describe('煤煤、烛烛立绘接入', () => {
  it.each([
    ['candle', 'candle-pixel-v1'],
    ['coal_guard', 'coal-guard-pixel-v3'], ['lantern_moth', 'lantern-moth-pixel-v3'],
    ['furnace_beast', 'furnace-beast-pixel-v2'],
    ['eternal_moth', 'eternal-moth-pixel-v1'],
    ['light_moss', 'light-moss-pixel-v1'], ['moss_beast', 'moss-beast-pixel-v1'], ['solar_spirit', 'solar-spirit-pixel-v1'],
    ['molten_larva', 'molten-larva-pixel-v1'], ['molten_beetle', 'molten-beetle-pixel-v1'], ['molten_beast', 'molten-beast-pixel-v1'],
    ['ember_hawk', 'ember-hawk-pixel-v1'], ['searing_hawk', 'searing-hawk-pixel-v1'], ['solar_eagle', 'solar-eagle-pixel-v2'],
    ['fire_fox', 'fire-fox-pixel-v1'], ['phantom_tail_fox', 'phantom-tail-fox-pixel-v1'], ['nine_tail_sovereign', 'nine-tail-sovereign-pixel-v1'],
    ['torch_fox', 'torch-fox-pixel-v2'], ['torch_fox_lord', 'torch-fox-lord-pixel-v3'],
    ['time_sand_beast', 'time-sand-beast-pixel-v1'], ['mimic_beast', 'mimic-beast-pixel-v1'],
    ['mirror_beast', 'mirror-beast-pixel-v1'], ['crystal_core_beast', 'crystal-core-beast-pixel-v2'],
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

  it.each([
    ['mimi', 'mimi-pixel-v2', '06'], ['mimi_king', 'mangying-pixel-v4', '06-1'], ['mimi_god', 'abyss-serpent-king-pixel-v1', '06-2'],
    ['pipi', 'cici-pixel-v1', '04'], ['sisi', 'jiwei-pixel-v1', '04-1'], ['sisi_god', 'thorn-king-pixel-v1', '04-2'],
  ])('%s 复用旧路径接入新原稿，基础形态开局素材同步', (species, folder, file) => {
    const path = `/${file}.png`;
    expect(getMonster(species).image).toBe(path);
    const original = readFileSync(`design/creatures/${folder}/${species === 'mimi' || species === 'mimi_king' ? 'sprite-64.png' : 'sprite-original.png'}`);
    expect(readFileSync(`public${path}`).equals(original)).toBe(true);
    expect(readFileSync(`美术素材${path}`).equals(original)).toBe(true);
    if (species === 'mimi' || species === 'pipi') {
      const name = species === 'mimi' ? 'mimi' : 'cici';
      expect(readFileSync(`src/ui/assets/starter-${name}.png`).equals(original)).toBe(true);
      expect(readFileSync(`美术素材/starter-${name}.png`).equals(original)).toBe(true);
    }
    const markup = renderToStaticMarkup(createElement(PixelCreature, { unit: makeUnit(species, true, 0, false) }));
    if (species === 'mimi' || species === 'mimi_king') {
      expect(markup).toContain('unified-creature-art');
      expect(markup).not.toContain('<canvas');
      const formation = renderToStaticMarkup(createElement(UnitCard, { unit: makeUnit(species, true, 0, false), battleDisplay: true, imageOverride: path }));
      expect(formation).toContain('unified-creature-art');
    } else {
      expect(markup).toContain('native-creature-art');
      expect(markup).toContain(`src="${path}"`);
      expect(markup).not.toContain('<canvas');
    }
  });

  it.each([
    ['momo', 'xunxun', ['public/01.png', 'public/battle-momo.png', 'src/ui/assets/home-xunxun.png', '美术素材/01.png', '美术素材/battle-momo.png', '美术素材/home-xunxun.png']],
    ['mimi', 'mimi', ['public/06.png', 'src/ui/assets/starter-mimi.png', '美术素材/06.png', '美术素材/starter-mimi.png']],
    ['coal', 'coal', ['public/coal.png', '美术素材/coal.png']],
  ])('%s 在所有入口使用已确认的64像素统一素材', (species, sample, paths) => {
    const original = readFileSync(species === 'mimi' ? 'design/creatures/mimi-pixel-v2/sprite-64.png' : `design/previews/creature-style-unification-v1/assets/${sample}.png`);
    for (const path of paths) expect(readFileSync(path).equals(original), path).toBe(true);
    expect(original.readUInt32BE(16)).toBe(64);
    expect(original.readUInt32BE(20)).toBe(64);
    const markup = renderToStaticMarkup(createElement(PixelCreature, { unit: makeUnit(species, true, 0, false) }));
    expect(markup).toContain('unified-creature-art');
    expect(markup).not.toContain('<canvas');
  });

  it.each([
    ['coal_guard', 'lantern_moth', 'eternal_moth'],
    ['light_moss', 'moss_beast', 'solar_spirit'],
    ['molten_larva', 'molten_beetle', 'molten_beast'],
    ['ember_hawk', 'searing_hawk', 'solar_eagle'],
    ['fire_fox', 'phantom_tail_fox', 'nine_tail_sovereign'],
    ['fire_fox', 'torch_fox', 'torch_fox_lord'],
    ['time_sand_beast', 'mimic_beast', 'time_sand_beast'],
    ['mirror_beast', 'crystal_core_beast', 'mirror_beast'],
    ['mimi', 'mimi_king', 'mimi_god'],
    ['pipi', 'sisi', 'sisi_god'],
  ])('旧队伍、布阵与战斗补齐%s等立绘，保留原有单位数据且不改输入', (...species) => {
    const units = species.map((id, column) => ({ ...makeUnit(id, true, column as 0 | 1 | 2, false), image: undefined, hp: 4, maxHp: 35, spd: 7 }));
    const battle = createBattle(units, [{ speciesId: 'coal' }], 42);
    battle.enemyUnits[0].image = undefined;
    const state = { ...createInitialState(), roster: units, battle, formation: { units, initialField: units, encounter: [{ speciesId: 'coal' }], nodeId: 'test' } };
    const migrated = migrateGameState(state)!;
    expect(migrated).not.toBeNull();
    for (const list of [migrated.roster, migrated.formation!.units, migrated.formation!.initialField]) {
      list.forEach((unit, i) => expect(unit).toEqual({ ...units[i], image: getMonster(unit.speciesId).image }));
    }
    migrated.battle!.playerUnits.forEach((unit, i) => expect(unit).toEqual({ ...battle.playerUnits[i], image: getMonster(unit.speciesId).image }));
    expect(migrated.battle!.enemyUnits[0].image).toBe('/coal.png');
    expect(state.roster[0].image).toBeUndefined();
    expect(state.battle.enemyUnits[0].image).toBeUndefined();
    expect(migrateGameState(migrated)).toEqual(migrated);
  });
});
