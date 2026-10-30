// @vitest-environment jsdom
import { createElement, useReducer } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GrowthEncounterScreen } from '../src/ui/GrowthEncounterScreen';
import { beginGrowthEncounter } from '../src/game/state/growth-encounters';
import { buildGrowthEvent } from '../src/game/data/growth-events';
import { createRng } from '../src/game/rng';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { makeUnit } from '../src/game/core/battle';
import type { GameState } from '../src/game/state/game';

afterEach(() => { cleanup(); document.getElementById('root')?.remove(); vi.unstubAllGlobals(); });
function base(): GameState {
  const initial = createInitialState(), pet = { ...makeUnit('momo', true, 0, false), growthPoints: 20 };
  return { ...initial, runMode: 'proficiency', screen: 'event', currentNodeId: 'e', currentLayer: 20, gold: 100, roster: [pet],
    deadPets: [{ ...makeUnit('lulu', true, 0, false), hp: 0 }], map: { ...initial.map, events: { e: buildGrowthEvent(createRng(1), 'pet_recruit', 1, 20) } } };
}
it.each([false, true])('同行候选详情关闭后保留选择，不显示进化与融合 mobile=%s', mobile => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const state = beginGrowthEncounter(base(), 'companions'), dispatch = vi.fn();
  const { container } = render(createElement(GrowthEncounterScreen, { state, dispatch }));
  expect((screen.getByRole('button', { name: '确认领取' }) as HTMLButtonElement).disabled).toBe(true);
  const options = container.querySelectorAll('.growth-encounter-recruits article');
  expect(options).toHaveLength(2);
  fireEvent.click(options[1].querySelector('button')!);
  fireEvent.click(options[1].querySelectorAll('button')[1]);
  expect(screen.getByRole('dialog')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '关闭详情' }));
  expect(options[1].querySelector('button')!.getAttribute('aria-pressed')).toBe('true');
  expect(container.textContent).not.toMatch(/下一形态|融合/);
  fireEvent.click(screen.getByRole('button', { name: '确认领取' }));
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'GROWTH_ENCOUNTER_CONFIRM', speciesId: state.map.events.e.choices[0].recruitCandidates![1] }));
});
it('墓园显示死亡伙伴、完整养成与半血，不选择存活伙伴', () => {
  const state = beginGrowthEncounter(base(), 'grave'), dispatch = vi.fn();
  render(createElement(GrowthEncounterScreen, { state, dispatch }));
  expect(screen.getByText(/复活生命/).textContent).toContain('保留完整属性');
  fireEvent.click(screen.getByRole('button', { name: '确认领取' }));
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ uid: state.deadPets![0].uid }));
});
it('传奇候选可查看完整说明，确认后新技能为0级', () => {
  const portal = document.createElement('div'); portal.id = 'root'; document.body.append(portal);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const state = beginGrowthEncounter(base(), 'legend');
  function Harness() {
    const [s, dispatch] = useReducer(gameReducer, state);
    return s.growthEncounterPending ? createElement(GrowthEncounterScreen, { state: s, dispatch }) : createElement('output', null, s.roster[0].skillEnhancements?.[0] ?? '0');
  }
  render(createElement(Harness));
  fireEvent.click(document.querySelector('.training-pet')!);
  fireEvent.click(document.querySelector('.camp-learning-cards .camp-skill-card')!);
  fireEvent.click(screen.getAllByRole('button', { name: /完整说明$/ })[0]);
  fireEvent.click(screen.getByRole('button', { name: /关闭.*完整说明/ }));
  const candidates = document.querySelectorAll('.camp-learning-cards .camp-skill-card');
  expect(candidates).toHaveLength(3); fireEvent.click(candidates[0]);
  expect(screen.getByRole('status').textContent).toBe('0');
});
