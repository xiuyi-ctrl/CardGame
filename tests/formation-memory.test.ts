import { describe, expect, it } from 'vitest';
import { makeUnit } from '../src/game/core/battle';
import { restoreFormation } from '../src/game/state/formation';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import type { GameState, NodeType } from '../src/game/state/game';

function ready(type: NodeType = 'battle', runMode: GameState['runMode'] = 'main'): GameState {
  const base = createInitialState();
  const roster = ['momo', 'lulu', 'fifi'].map((id, i) => makeUnit(id, true, i as 0 | 1 | 2, false));
  const node = { ...base.map.layers[0][0], type };
  const encounter = [{ speciesId: 'momo' }, { speciesId: 'momo' }, { speciesId: 'momo' }];
  return { ...base, screen: 'map', runMode, roster, field: roster.map(u => u.uid),
    map: { ...base.map, layers: [[node]], encounter: { [node.id]: encounter }, boss: { [node.id]: encounter } } };
}

function enter(state: GameState): GameState {
  return gameReducer(state, { type: 'MOVE', nodeId: state.map.layers[0][0].id });
}

describe('布阵记忆', () => {
  it.each(['battle', 'elite', 'boss', 'corrupted', 'guardian'] as const)('%s恢复上次站位和留空，不按队伍顺序重排', type => {
    let state = enter(ready(type));
    const [a, b] = state.roster;
    const units = [{ ...a, row: 'back' as const, column: 2 as const }, { ...b, row: 'front' as const, column: 1 as const }];
    state = gameReducer(state, { type: 'FORMATION_CONFIRM', units });
    state = { ...gameReducer(state, { type: 'BACK_TO_MAP' }), currentNodeId: '' };
    const next = enter(state);
    expect(next.formation?.initialField).toEqual(units);
    expect(next.formation?.units).toHaveLength(3);
  });

  it('生物消失或死亡时原位留空，新伙伴不补位；同uid成长使用当前信息', () => {
    const state = ready();
    const [a, b, c] = state.roster;
    const newUnit = makeUnit('momo', true, 0, false);
    state.lastFormation = { [a.uid]: { row: 'back', column: 2 }, [b.uid]: { row: 'front', column: 1 }, [c.uid]: { row: 'front', column: 0 } };
    state.roster = [{ ...b, name: '成长后的伙伴', hp: 20, maxHp: 30 }, { ...c, hp: 0 }, newUnit];
    expect(enter(state).formation?.initialField).toEqual([{ ...state.roster[0], row: 'front', column: 1 }]);
  });

  it('点击拖动产生的更新即刻记录，返回地图后恢复；全空也不自动补位', () => {
    let state = enter(ready());
    const uid = state.roster[0].uid;
    state = gameReducer(state, { type: 'FORMATION_UPDATE', positions: { [uid]: { row: 'back', column: 1 } } });
    state = enter(gameReducer(state, { type: 'BACK_TO_MAP' }));
    expect(state.formation?.initialField).toEqual([{ ...state.roster[0], row: 'back', column: 1 }]);
    state = gameReducer(state, { type: 'FORMATION_UPDATE', positions: {} });
    state = enter(gameReducer(state, { type: 'BACK_TO_MAP' }));
    expect(state.formation?.initialField).toEqual([]);
  });

  it('首次布阵沿用默认站位，未改动就返回也保存；新远征不沿用旧记忆', () => {
    let state = enter(ready());
    const first = state.formation!.initialField;
    expect(first.map(u => [u.row, u.column])).toEqual([['front', 0], ['front', 1], ['front', 2]]);
    state = gameReducer(state, { type: 'BACK_TO_MAP' });
    expect(Object.keys(state.lastFormation!)).toEqual(first.map(u => u.uid));
    const fresh = gameReducer(state, { type: 'START_RUN', starterId: 'momo', companionId: 'lulu', seed: 1 });
    expect(fresh.lastFormation).toBeUndefined();
  });

  it('存档读写保留站位，不依赖战斗中交换后的站位或队伍顺序', () => {
    const state = ready();
    const [a, b] = state.roster;
    state.lastFormation = { [a.uid]: { row: 'back', column: 2 }, [b.uid]: { row: 'front', column: 1 } };
    state.roster = state.roster.reverse().map(u => ({ ...u, row: 'front', column: 0 }));
    const loaded = gameReducer(createInitialState(), { type: 'LOAD_GAME', state: JSON.parse(JSON.stringify(state)) });
    expect(enter(loaded).formation?.initialField.map(u => [u.uid, u.row, u.column])).toEqual([
      [a.uid, 'back', 2], [b.uid, 'front', 1],
    ]);
  });

  it('事件战与熟练度普通战共用记忆，模拟战不覆盖普通站位', () => {
    const state = ready('battle', 'proficiency');
    const uid = state.roster[0].uid;
    state.lastFormation = { [uid]: { row: 'back', column: 1 } };
    expect(enter(state).formation?.initialField.map(u => [u.uid, u.row, u.column])).toEqual([[uid, 'back', 1]]);
    const event = gameReducer({ ...state, screen: 'event' }, { type: 'EVENT_BATTLE_START', enemies: [{ speciesId: 'momo' }], reward: { kind: 'gold', amount: 1 }, penalty: { percent: 0 } });
    expect(event.formation?.initialField.map(u => [u.uid, u.row, u.column])).toEqual([[uid, 'back', 1]]);
    const arena = ready('arena3', 'proficiency');
    arena.lastFormation = state.lastFormation;
    arena.currentNodeId = arena.map.layers[0][0].id;
    const forced = gameReducer(arena, { type: 'ARENA3_MODE', mode: 'simulation' });
    expect(forced.formation?.initialField).toHaveLength(3);
    const updated = gameReducer(forced, { type: 'FORMATION_UPDATE', positions: {} });
    expect(updated.lastFormation).toEqual(state.lastFormation);
    const confirmed = gameReducer(forced, { type: 'FORMATION_CONFIRM', units: forced.formation!.initialField });
    expect(confirmed.lastFormation).toEqual(state.lastFormation);
  });

  it('恢复时仍遵守出战上限，非法或重复格子不占位', () => {
    const { roster } = ready();
    const positions = Object.fromEntries(roster.map((u, i) => [u.uid, { row: 'back' as const, column: i as 0 | 1 | 2 }]));
    expect(restoreFormation(roster, positions, 2)).toHaveLength(2);
    positions[roster[1].uid] = positions[roster[0].uid];
    expect(restoreFormation(roster, positions, 5).map(u => u.uid)).toEqual([roster[0].uid, roster[2].uid]);
  });
});
