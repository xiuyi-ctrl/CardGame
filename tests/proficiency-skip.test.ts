import { expect, it } from 'vitest';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { makeUnit } from '../src/game/core/battle';
import { getMonster } from '../src/game/data/monsters';

it.each(['battle', 'elite'] as const)('熟练度跳过%s发成长点并进入成长页，不能重复领取', type => {
  let state = gameReducer(createInitialState(), { type: 'START_PROFICIENCY_PICKED', seed: 23, starterId: 'momo', companionId: 'lulu' });
  state = { ...state, roster: [...state.roster, makeUnit('fifi', true, 2, false)], inventory: { skip: 1 },
    map: { ...state.map, layers: state.map.layers.map((row, i) => i === 0 ? [{ ...row[0], type }] : row) } };
  const node = state.map.layers[0][0];
  const actual = gameReducer(state, { type: 'MOVE', nodeId: node.id });
  const killGp = actual.formation!.encounter.reduce((sum, enemy) => sum + (getMonster(enemy.speciesId).rank === 2 ? 4 : 2), 0);
  const participants = actual.formation!.initialField.map(unit => unit.uid);
  const skipped = gameReducer(state, { type: 'USE_SKIP', nodeId: node.id });
  expect(skipped.screen).toBe('growth-menu');
  expect(skipped.rewards).toEqual([]);
  expect(skipped.inventory.skip).toBe(0);
  expect(skipped.gold - state.gold).toBe(type === 'elite' ? 20 : 12);
  for (const unit of skipped.roster) expect(unit.growthPoints).toBe(1 + (participants.includes(unit.uid) ? 1 + killGp : 0));
  expect(skipped.roster.map(unit => unit.hp)).toEqual(state.roster.map(unit => unit.hp));
  expect(gameReducer(skipped, { type: 'USE_SKIP', nodeId: node.id })).toBe(skipped);
  const map = gameReducer(skipped, { type: 'BACK_TO_MAP' });
  expect(map.screen).toBe('map');
  const next = map.map.layers[1][0];
  expect(gameReducer(map, { type: 'MOVE', nodeId: next.id }).currentRow).toBe(1);
});
