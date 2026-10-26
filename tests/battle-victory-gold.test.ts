// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { battleVictoryGold, type GameState, type NodeType } from '../src/game/state/game';
import { BattleScreen } from '../src/ui/BattleScreen';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function victory(type: NodeType, amount: number): GameState {
  const state = createInitialState();
  const node = { id: 'gold-test', type, col: 0, label: '测试战斗', corruptReward: 'gold' as const };
  const roster = [makeUnit('momo', true, 0, false)];
  const encounter = [{ speciesId: 'momo' }];
  const battle = createBattle(roster, encounter, 1);
  battle.phase = 'won'; battle.log = [];
  battle.enemyUnits.forEach(unit => { unit.hp = 0; });
  return { ...state, roster, screen: 'battle', battle, gold: 100, currentRow: 0, currentNodeId: node.id,
    map: { ...state.map, layers: [[node]], encounter: amount === 16 || amount === 32 ? { [node.id]: encounter } : {},
      boss: type === 'boss' ? { [node.id]: encounter } : {} },
    arena3Pending: type === 'arena3' ? { mode: 'challenge' } : undefined };
}

it.each([['battle', 8], ['elite', 16], ['corrupted', 32], ['boss', 30], ['guardian', 16], ['arena3', 50]] as const)(
  '%s胜利显示%d金币，与确认后的实际增量一致', async (type, amount) => {
    const state = victory(type, amount);
    render(createElement(BattleScreen, { state, dispatch: vi.fn() }));
    await waitFor(() => expect(screen.getByText(`驯服了 0 只宠物，获得 ${amount} 金币`)).toBeTruthy());
    const settled = gameReducer(state, { type: 'BATTLE_END_CONFIRM' });
    expect(settled.gold - state.gold).toBe(amount);
  });

it.each([false, true])('事件金币按实际奖励显示，非金币挑战不误报 mobile=%s', async mobile => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const state = { ...victory('event', 0), eventBattle: { enemies: [{ speciesId: 'momo' }], reward: { kind: 'gold' as const, amount: 27 }, penalty: {} } };
  expect(battleVictoryGold(state)).toBe(27);
  render(createElement(BattleScreen, { state, dispatch: vi.fn() }));
  await waitFor(() => expect(screen.getByText('驯服了 0 只宠物，获得 27 金币')).toBeTruthy());
  expect(gameReducer(state, { type: 'BATTLE_END_CONFIRM' }).gold - state.gold).toBe(27);
  expect(battleVictoryGold(victory('arena', 0))).toBe(0);
});
