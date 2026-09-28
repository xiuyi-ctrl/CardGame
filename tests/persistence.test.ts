import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/state/reducer';
import { CURRENT_SAVE_VERSION, loadSlotMode, parseDualSave } from '../src/ui/persistence';

function legacyState(mode: 'main' | 'proficiency' = 'main'): Record<string, unknown> {
  const state = createInitialState() as unknown as Record<string, unknown>;
  const map = state.map as Record<string, unknown>;
  delete state.runStats;
  delete state.difficulty;
  delete state.unlocks;
  delete state.relics;
  delete state.visitedWatchtowers;
  delete state.visitedNodeIds;
  state.map = { ...map, events: undefined, specials: undefined };
  if (mode === 'proficiency') state.runMode = 'proficiency';
  return state;
}

describe('存档版本迁移', () => {
  it('迁移旧版单模式存档并补齐当前必需字段', () => {
    const parsed = parseDualSave(JSON.stringify(legacyState()));

    expect(parsed?.saveVersion).toBe(CURRENT_SAVE_VERSION);
    expect(parsed?.main?.difficulty).toBe('normal');
    expect(parsed?.main?.runStats?.battlesWon).toBe(0);
    expect(parsed?.main?.unlocks?.difficulties).toEqual(['normal']);
    expect(parsed?.main?.map.events).toEqual({});
    expect(parsed?.main?.map.specials).toEqual({});
    expect(parsed?.proficiency).toBeNull();
  });

  it('迁移无版本号的双模式存档且保留两个分支', () => {
    const parsed = parseDualSave(JSON.stringify({
      main: legacyState('main'),
      proficiency: legacyState('proficiency'),
    }));

    expect(parsed?.saveVersion).toBe(CURRENT_SAVE_VERSION);
    expect(parsed?.main?.runMode).not.toBe('proficiency');
    expect(parsed?.proficiency?.runMode).toBe('proficiency');
  });

  it('当前版本存档可重复加载且按模式读取', () => {
    const main = createInitialState();
    const parsed = parseDualSave(JSON.stringify({ saveVersion: CURRENT_SAVE_VERSION, main, proficiency: null }));

    expect(loadSlotMode(parsed, 'main')?.seed).toBe(main.seed);
    expect(loadSlotMode(parsed, 'proficiency')).toBeNull();
  });

  it('拒绝损坏 JSON 与高于当前程序版本的存档', () => {
    expect(parseDualSave('{bad json')).toBeNull();
    expect(parseDualSave(JSON.stringify({
      saveVersion: CURRENT_SAVE_VERSION + 1,
      main: createInitialState(),
    }))).toBeNull();
  });
});
