import { describe, expect, it } from 'vitest';
import { FOODS } from '../src/game/data/foods';
import { ITEMS } from '../src/game/data/items';
import { RELIC_DEFS, RELIC_ORDER } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { detectUnlocks } from '../src/ui/persistence';

function startWithRelic(relic: string) {
  return gameReducer(createInitialState(), {
    type: 'START_RUN',
    starterId: 'momo',
    companionId: 'lulu',
    seed: 42,
    relic,
  });
}

describe('遗物改版', () => {
  it('只保留三件指定遗物', () => {
    expect(RELIC_ORDER).toEqual(['traveler_charm', 'elite_badge', 'beast_master']);
    expect(Object.keys(RELIC_DEFS)).toEqual(RELIC_ORDER);
  });

  it('旅者护符使开局金币增加 30', () => {
    expect(startWithRelic('traveler_charm').gold).toBe(50);
  });

  it('精锐之证赠送每种主模式道具各一个', () => {
    const state = startWithRelic('elite_badge');
    const mainItemIds = Object.keys(ITEMS).filter((id) => ITEMS[id].shop !== false);
    for (const id of mainItemIds) expect(state.inventory[id]).toBe(1);
    for (const id of Object.keys(ITEMS).filter((itemId) => ITEMS[itemId].shop === false)) {
      expect(state.inventory[id] ?? 0).toBe(0);
    }
  });

  it('驯兽大师赠送每种捕获物各一个', () => {
    const state = startWithRelic('beast_master');
    expect(state.inventory.berry).toBe(4);
    expect(state.inventory.meat).toBe(3);
    expect(state.inventory.gem).toBe(1);
    expect(state.inventory.golden_fruit).toBe(1);
    expect(state.inventory.heal_potion ?? 0).toBe(0);
    expect(Object.keys(FOODS).filter((id) => FOODS[id].baseTame > 0)).toEqual(['berry', 'meat', 'gem', 'golden_fruit']);
  });

  it('按单局道具使用和捕捉数量解锁新遗物', () => {
    const base = createInitialState().unlocks!;
    expect(detectUnlocks(base, 'D', [], 'normal', { itemsUsed: 19, petsTamed: 14 }).relics).toEqual([]);
    expect(detectUnlocks(base, 'D', [], 'normal', { itemsUsed: 20, petsTamed: 14 }).relics).toEqual(['elite_badge']);
    expect(detectUnlocks(base, 'D', [], 'normal', { itemsUsed: 19, petsTamed: 15 }).relics).toEqual(['beast_master']);
    expect(detectUnlocks(base, 'D', [], 'normal', { itemsUsed: 20, petsTamed: 15 }).relics).toEqual(['elite_badge', 'beast_master']);
  });

  it('旅者护符仍由 B 级通关解锁，旧遗物不会继续保留', () => {
    const legacy = { ...createInitialState().unlocks!, relics: ['legend_seal', 'flame_medal'] };
    const next = detectUnlocks(legacy, 'B', [], 'normal', { itemsUsed: 0, petsTamed: 0 });
    expect(next.relics).toEqual(['traveler_charm']);
  });
});
