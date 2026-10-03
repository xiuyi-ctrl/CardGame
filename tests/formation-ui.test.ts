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
    const dispatch = vi.fn();
    render(createElement(FormationScreen, { state: formationState(), dispatch }));

    expect(screen.getByText('整顿伙伴，迎接新的冒险。')).toBeTruthy();
    expect(screen.getByText('翠绿之径 · 怪物小队')).toBeTruthy();
    expect(document.querySelectorAll('.formation-enemy-portraits canvas')).toHaveLength(2);
    expect(screen.getByLabelText('出战 2/3')).toBeTruthy();
    expect(screen.queryByText(/推荐战力/)).toBeNull();
    expect(screen.getAllByRole('button', { name: /排第 .* 位/ })).toHaveLength(6);
    expect(screen.getByText('前排').classList.contains('formation-row-label')).toBe(true);
    expect(screen.getByText('后排').classList.contains('formation-row-label')).toBe(true);
    expect(document.querySelectorAll('.formation-board .formation-slot.empty')).toHaveLength(4);
    expect(document.querySelectorAll('.formation-board .formation-empty-slot')).toHaveLength(0);
    const deployedSlot = screen.getByRole('button', { name: '前排第 1 位：迅迅' });
    fireEvent.mouseEnter(deployedSlot);
    expect(deployedSlot.classList.contains('selected')).toBe(true);
    fireEvent.mouseLeave(deployedSlot);
    expect(deployedSlot.classList.contains('selected')).toBe(false);
    expect(screen.getByText('待命伙伴')).toBeTruthy();
    expect(document.querySelectorAll('.formation-pet-empty')).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: /灼灼，速度/ }));
    // 点击候选宠物：按 从左到右、从上到下 自动上阵（空位首位 = 前排第 3 位）
    expect(screen.getByRole('button', { name: '前排第 3 位：灼灼' })).toBeTruthy();
    expect(document.querySelector('.formation-detail-head strong')?.textContent).toBe('灼灼');
    expect(screen.getByLabelText('出战 3/3')).toBeTruthy();
    expect(screen.getByRole('button', { name: /确认出战，当前 3 只/ })).toBeTruthy();

    // 点击场上宠物：下阵放回宠物池
    fireEvent.click(screen.getByRole('button', { name: '前排第 3 位：灼灼' }));
    expect(screen.getByRole('button', { name: '前排第 3 位：空位' })).toBeTruthy();
    expect(screen.getByLabelText('出战 2/3')).toBeTruthy();
    expect(screen.getByRole('button', { name: /确认出战，当前 2 只/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '返回地图' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'BACK_TO_MAP' });
  });

  it('模拟战右侧展示只读全员总览，场上宠物不可下阵', () => {
    render(createElement(FormationScreen, { state: formationState(true), dispatch: vi.fn() }));

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('模拟战 · 同我方生物')).toBeTruthy();
    const slot = screen.getByRole('button', { name: '前排第 1 位：迅迅' });
    fireEvent.click(slot);
    expect(screen.getByRole('button', { name: '前排第 1 位：迅迅' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /确认出战，当前 3 只/ })).toBeTruthy();
  });
});
