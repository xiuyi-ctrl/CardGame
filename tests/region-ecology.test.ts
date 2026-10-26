import { describe, expect, it } from 'vitest';
import { makeUnit } from '../src/game/core/battle';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { getSlotUnlocks, parseDualSave } from '../src/ui/persistence';
import type { GameState } from '../src/game/state/game';
import { readFileSync } from 'node:fs';
import { MAIN_REGIONS } from '../src/game/data/regions';

function formation(): GameState {
  const state = createInitialState();
  const unit = makeUnit('momo', true, 0, false);
  return { ...state, region: 'emerald_forest', screen: 'formation', roster: [unit],
    formation: { units: [unit], initialField: [unit], encounter: [{ speciesId: 'torch_fox' }], nodeId: '' } };
}

describe('地区生态发现', () => {
  it('所有地区候选都具有不超过128像素的小图，避免弹窗加载原始大立绘', () => {
    const ids = new Set(Object.values(MAIN_REGIONS).flatMap(region => [...region.basePool, ...region.evo1Pool, ...region.evo2Pool]));
    for (const id of ids) {
      const png = readFileSync(`public/ecology/${id}.png`);
      expect(png.readUInt32BE(16)).toBeLessThanOrEqual(128);
      expect(png.readUInt32BE(20)).toBeLessThanOrEqual(128);
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
