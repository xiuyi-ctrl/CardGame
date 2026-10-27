import { describe, expect, it } from 'vitest';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { DEFAULT_UNLOCKS, type GameState } from '../src/game/state/game';
import { parseDualSave } from '../src/ui/persistence';

export function compassRun(relic = true): GameState {
  const base = gameReducer(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'lulu', seed: 42 });
  return { ...base, screen: 'map', relics: relic ? ['explorer_compass'] : [], map: { ...base.map,
    layers: Array.from({ length: 7 }, (_, row) => [{ id: `t${row}`, type: 'watchtower' as const, label: '瞭望塔', col: 0 }]),
    encounter: {}, boss: {} } };
}

describe('探险家罗盘', () => {
  it('可远程查看未访问、不可达和过去的瞭望塔，不移动、不记访问、不推进蛋', () => {
    const state: GameState = { ...compassRun(), carriedEggs: [{ id: 'egg', remaining: 3, monsterId: 'momo', special: false, passedNodeIds: [] }] };
    for (const id of ['t0', 't3', 't6']) {
      const viewed = gameReducer(state, { type: 'OPEN_WATCHTOWER', nodeId: id });
      expect(viewed.screen).toBe('watchtower'); expect(viewed.watchtowerPreviewNodeId).toBe(id);
      expect(viewed.currentRow).toBe(state.currentRow); expect(viewed.currentNodeId).toBe(state.currentNodeId);
      expect(viewed.visitedWatchtowers).toEqual([]); expect(viewed.runStats?.watchtowerVisits ?? 0).toBe(0);
      expect(viewed.visitedNodeIds).toEqual(state.visitedNodeIds);
      const closed = gameReducer(viewed, { type: 'CLOSE_WATCHTOWER' });
      expect(closed.carriedEggs).toEqual(state.carriedEggs); expect(closed.screen).toBe('map');
    }
    const past = { ...state, currentRow: 4, currentNodeId: 't4' };
    const reopened = gameReducer(past, { type: 'OPEN_WATCHTOWER', nodeId: 't1' });
    expect(reopened.screen).toBe('watchtower');
    const closedPast = gameReducer(reopened, { type: 'CLOSE_WATCHTOWER' });
    expect(closedPast.runStats!.rating).toEqual(state.runStats!.rating);
  });
  it('无罗盘、熟练度或非地图界面不能远程查看未访问的塔，已访问塔保留原功能', () => {
    const base = compassRun(false);
    expect(gameReducer(base, { type: 'OPEN_WATCHTOWER', nodeId: 't3' }).screen).toBe('map');
    expect(gameReducer({ ...base, visitedWatchtowers: ['t3'] }, { type: 'OPEN_WATCHTOWER', nodeId: 't3' }).screen).toBe('watchtower');
    expect(gameReducer({ ...compassRun(), runMode: 'proficiency' }, { type: 'OPEN_WATCHTOWER', nodeId: 't3' }).screen).toBe('map');
    expect(gameReducer({ ...compassRun(), screen: 'battle' }, { type: 'OPEN_WATCHTOWER', nodeId: 't3' }).screen).toBe('battle');
    const nonTower = compassRun(); nonTower.map.layers[3][0].type = 'battle';
    expect(gameReducer(nonTower, { type: 'OPEN_WATCHTOWER', nodeId: 't3' }).screen).toBe('map');
  });
  it('实际走入五个不同塔即时解锁，远程看和重复打开不能刷次数', () => {
    let state = compassRun(false);
    for (let i = 0; i < 5; i++) {
      state = gameReducer(state, { type: 'MOVE', nodeId: `t${i}` });
      expect(state.runStats!.watchtowerVisits).toBe(i + 1);
      expect(state.unlocks!.relics.includes('explorer_compass')).toBe(i === 4);
      state = gameReducer(state, { type: 'CLOSE_WATCHTOWER' });
      const reopened = gameReducer(state, { type: 'OPEN_WATCHTOWER', nodeId: `t${i}` });
      expect(reopened.runStats!.watchtowerVisits).toBe(i + 1);
      state = gameReducer(reopened, { type: 'CLOSE_WATCHTOWER' });
    }
    expect(state.toast?.msg).toContain('探险家罗盘');
    expect(parseDualSave(JSON.stringify(state))!.main!.unlocks!.relics).toContain('explorer_compass');
  });
  it('从远程预览实际走入可达塔，正常记一次访问与推进路线', () => {
    const preview = gameReducer(compassRun(), { type: 'OPEN_WATCHTOWER', nodeId: 't0' });
    const entered = gameReducer(preview, { type: 'MOVE', nodeId: 't0' });
    expect(entered.watchtowerReopened).toBe(false); expect(entered.visitedWatchtowers).toEqual(['t0']);
    expect(entered.currentNodeId).toBe('t0'); expect(entered.runStats!.watchtowerVisits).toBe(1);
  });
  it('跨幕累计、读档保留，新局清零但保留解锁', () => {
    let state = compassRun(false);
    for (let i = 0; i < 3; i++) {
      state = gameReducer(state, { type: 'MOVE', nodeId: `t${i}` });
      state = gameReducer(state, { type: 'CLOSE_WATCHTOWER' });
    }
    const nextAct = gameReducer({ ...state, screen: 'inter_act' }, { type: 'INTER_ACT_CONTINUE' });
    expect(nextAct.runStats!.watchtowerVisits).toBe(3); expect(nextAct.visitedWatchtowers).toEqual([]);
    const loaded = parseDualSave(JSON.stringify(nextAct))!.main!;
    expect(loaded.runStats!.watchtowerVisits).toBe(3);
    const second: GameState = { ...loaded, map: compassRun().map };
    let entered = gameReducer(second, { type: 'MOVE', nodeId: 't0' });
    entered = gameReducer(entered, { type: 'CLOSE_WATCHTOWER' });
    entered = gameReducer(entered, { type: 'MOVE', nodeId: 't1' });
    expect(entered.runStats!.watchtowerVisits).toBe(5); expect(entered.unlocks!.relics).toContain('explorer_compass');
    const fresh = gameReducer(entered, { type: 'START_RUN', starterId: 'momo', companionId: 'lulu', seed: 2 });
    expect(fresh.runStats!.watchtowerVisits ?? 0).toBe(0); expect(fresh.unlocks!.relics).toContain('explorer_compass');
  });
  it('旧档只从仍可证实的本幕已访问塔迁移，不伪造以前幕次的次数', () => {
    const old = { ...compassRun(false), visitedWatchtowers: ['t0', 't1', 't1'] };
    const loaded = parseDualSave(JSON.stringify(old))!.main!;
    expect(loaded.runStats!.watchtowerVisits).toBe(2);
    expect(parseDualSave(JSON.stringify({ ...old, visitedWatchtowers: [] }))!.main!.runStats!.watchtowerVisits).toBe(0);
  });
  it('测试局不会解锁；新遗物不会改变默认开局', () => {
    let state: GameState = { ...compassRun(false), testRun: true, runStats: { ...compassRun(false).runStats!, watchtowerVisits: 4 } };
    state = gameReducer(state, { type: 'MOVE', nodeId: 't0' });
    expect(state.unlocks!.relics).not.toContain('explorer_compass');
    expect(compassRun(false).unlocks).toEqual({ ...DEFAULT_UNLOCKS });
  });
});
