import { describe, expect, it } from 'vitest';
import { makeUnit } from '../src/game/core/battle';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { getSlotUnlocks, parseDualSave } from '../src/ui/persistence';
import type { GameState } from '../src/game/state/game';
import { readFileSync } from 'node:fs';
import { SPECIAL_EGG_POOL } from '../src/game/data/monsters';
import { MAIN_REGIONS } from '../src/game/data/regions';
import { getCreatureImage } from '../src/game/data/creature-art';

function formation(): GameState {
  const state = createInitialState();
  const unit = makeUnit('momo', true, 0, false);
  return { ...state, region: 'emerald_forest', screen: 'formation', roster: [unit],
    formation: { units: [unit], initialField: [unit], encounter: [{ speciesId: 'torch_fox' }], nodeId: '' } };
}

describe('地区生态发现', () => {
  it('所有地区候选使用统一立绘来源，不再依赖可能过期的独立生态缩略图', () => {
    const ids = new Set(Object.values(MAIN_REGIONS).flatMap(region => [...region.basePool, ...region.evo1Pool, ...region.evo2Pool, ...SPECIAL_EGG_POOL]));
    for (const id of ids) {
      const image = getCreatureImage(id);
      expect(image).toBeTruthy();
      const png = readFileSync(`public${image}`);
      expect(png.subarray(1, 4).toString()).toBe('PNG');
    }
  });
  it('布阵预览不解锁，实际开战记录双方形态；按地区隔离并持久化到同槽新局', () => {
    const preview = gameReducer(formation(), { type: 'FORMATION_UPDATE', positions: {} });
    expect(preview.unlocks?.regionEncounters).toBeUndefined();
    const battle = gameReducer(preview, { type: 'FORMATION_CONFIRM', units: preview.roster });
    expect(battle.unlocks?.regionEncounters?.emerald_forest).toEqual(['momo', 'torch_fox']);
    expect(battle.unlocks?.regionEncounters?.mixed).toBeUndefined();
    const loaded = parseDualSave(JSON.stringify(battle))!.main!;
    expect(loaded.unlocks?.regionEncounters).toEqual(battle.unlocks?.regionEncounters);
    const start = gameReducer(createInitialState(), { type: 'STARTER', unlocks: getSlotUnlocks({ main: loaded, proficiency: null }) });
    const selected = gameReducer(start, { type: 'SET_REGION', region: 'mixed' });
    const run = gameReducer(selected, { type: 'START_RUN', starterId: 'momo', companionId: 'kiki', seed: 4 });
    expect(run.unlocks?.regionEncounters).toEqual(battle.unlocks?.regionEncounters);
  });

  it('熟练度战斗不解锁主模式生态，旧存档不推测地图中未见过的敌人', () => {
    const state = formation();
    const proficiency = gameReducer({ ...state, runMode: 'proficiency' }, { type: 'FORMATION_CONFIRM', units: state.roster });
    expect(proficiency.unlocks?.regionEncounters).toBeUndefined();
    const loaded = parseDualSave(JSON.stringify({ ...state, screen: 'map', formation: undefined }))!.main!;
    expect(loaded.unlocks?.regionEncounters?.emerald_forest).toBeUndefined();
  });
});


describe('蛋生生态轮廓解锁', () => {
  it.each(['mixed', 'emerald_forest'] as const)('%s 实际开战也能记录四只蛋生生物', region => {
    const state = formation();
    const units = SPECIAL_EGG_POOL.map(id => makeUnit(id, true, 0, false));
    const next = gameReducer({ ...state, region, roster: units,
      formation: { ...state.formation!, units, initialField: units } }, { type: 'FORMATION_CONFIRM', units });
    expect(next.unlocks?.regionEncounters?.[region]).toEqual(expect.arrayContaining(SPECIAL_EGG_POOL));
  });
  for (const region of ['mixed', 'emerald_forest'] as const) {
    for (const monsterId of SPECIAL_EGG_POOL) {
      it.each([false, true])(`${region} ${monsterId} 真正孵化时解锁，满员=%s`, full => {
        const initial = formation();
        const roster = full ? Array.from({ length: 10 }, () => makeUnit('momo', true, 0, false)) : initial.roster;
        const state: GameState = { ...initial, region, screen: 'event', currentNodeId: 'hatch', roster,
          carriedEggs: [{ id: 'special-egg', monsterId, special: true, remaining: 1, passedNodeIds: [] }],
          map: { ...initial.map, events: { hatch: { title: '过关', desc: '', choices: [{ id: 'done', label: '完成', desc: '', kind: 'none' }] } } } };
        expect(state.unlocks?.regionEncounters).toBeUndefined();
        const next = gameReducer(state, { type: 'EVENT_CHOICE', choiceId: 'done' });
        expect(next.screen).toBe(full ? 'tame-overflow' : 'map');
        expect(next.unlocks?.regionEncounters?.[region]).toEqual([monsterId]);
        expect(next.unlocks?.regionEncounters?.[region === 'mixed' ? 'emerald_forest' : 'mixed']).toBeUndefined();
        expect(parseDualSave(JSON.stringify(next))!.main!.unlocks?.regionEncounters).toEqual(next.unlocks?.regionEncounters);
      });
    }
  }
});
