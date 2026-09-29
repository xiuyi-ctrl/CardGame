// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { makeUnit } from '../src/game/core/battle';
import { createInitialState } from '../src/game/state/reducer';
import { FormationScreen } from '../src/ui/FormationScreen';

afterEach(cleanup);

function formationState(forceAllUnits = false) {
  const units = [
    makeUnit('momo', true, 0, false),
    makeUnit('lulu', true, 1, false),
    makeUnit('fifi', true, 2, false),
  ];
  const initialField = forceAllUnits ? units : units.slice(0, 2);
  const state = {
    ...createInitialState(),
    screen: 'formation' as const,
    roster: units,
    formation: {
      units,
      initialField,
      encounter: [{ speciesId: 'momo' }, { speciesId: 'lulu' }],
      nodeId: '',
      forceAllUnits,
    },
  };
  return state;
}

describe('战前布阵界面', () => {
  it('始终显示六个站位，候选宠物可点选上场', () => {
    render(createElement(FormationScreen, { state: formationState(), dispatch: vi.fn() }));

    expect(screen.getAllByRole('button', { name: /排第 .* 位/ })).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: /灼灼，速度/ }));
    fireEvent.click(screen.getByRole('button', { name: '后排第 1 位：空位' }));

    expect(screen.getByRole('button', { name: '后排第 1 位：灼灼' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /确认出战（3 只）/ })).toBeTruthy();
  });

  it('模拟战右侧展示只读全员总览，场上宠物不可下阵', () => {
    render(createElement(FormationScreen, { state: formationState(true), dispatch: vi.fn() }));

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    const slot = screen.getByRole('button', { name: '前排第 1 位：迅迅' });
    fireEvent.click(slot);
    expect(screen.getByRole('button', { name: '前排第 1 位：迅迅' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /确认出战（3 只）/ })).toBeTruthy();
  });
});
