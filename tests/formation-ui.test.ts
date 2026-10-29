// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, useReducer } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { makeUnit } from '../src/game/core/battle';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { FormationScreen } from '../src/ui/FormationScreen';
import { FORMATION_SPRITES } from '../src/ui/formationSprites';

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
  it('拖动、下阵后返回地图再进入，保留原位及主动空位', () => {
    const initial = formationState();
    function Harness() {
      const [state, dispatch] = useReducer(gameReducer, initial);
      return state.screen === 'formation'
        ? createElement(FormationScreen, { state, dispatch })
        : createElement('button', { onClick: () => dispatch({ type: 'MOVE', nodeId: state.map.layers[0][0].id }) }, '再次布阵');
    }
    render(createElement(Harness));
    const destination = screen.getByRole('button', { name: '我方后排第 3 位：空位' });
    fireEvent.drop(destination, { dataTransfer: { getData: () => initial.roster[1].uid } });
    fireEvent.click(screen.getByRole('button', { name: '我方前排第 1 位：迅迅' }));
    fireEvent.click(screen.getByRole('button', { name: '返回地图' }));
    fireEvent.click(screen.getByRole('button', { name: '再次布阵' }));
    expect(screen.getByRole('button', { name: '我方前排第 1 位：空位' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '我方后排第 3 位：泡泡' })).toBeTruthy();
    expect(document.querySelectorAll('.formation-slot:not(.empty)')).toHaveLength(1);
  });

  it('六只初始生物在队伍、场上、详情和敌方情报中使用新立绘', () => {
    const species = ['momo', 'lulu', 'fifi', 'kiki', 'mimi', 'pipi'];
    const units = species.map((id, index) => makeUnit(id, true, (index % 3) as 0 | 1 | 2, false));
    const base = formationState();
    const state = {
      ...base,
      roster: units,
      formation: { ...base.formation, units, initialField: units.slice(0, 2), encounter: species.map((speciesId) => ({ speciesId })) },
    };
    render(createElement(FormationScreen, { state, dispatch: vi.fn() }));

    const portraits = document.querySelectorAll<HTMLImageElement>('.formation-pet-portrait img');
    expect(portraits).toHaveLength(6);
    portraits.forEach((portrait, index) => expect(portrait.getAttribute('src')).toBe(FORMATION_SPRITES[species[index]]));
    expect(document.querySelectorAll('.formation-board .battle-sprite img')).toHaveLength(2);
    expect(document.querySelectorAll('.formation-enemy-portrait img')).toHaveLength(6);
    expect(document.querySelector('.formation-detail-portrait img')).toBeTruthy();
  });

  it('始终显示六个站位，候选宠物可点选上场', () => {
    const dispatch = vi.fn();
    render(createElement(FormationScreen, { state: formationState(), dispatch }));

    expect(screen.getByText('整顿伙伴，迎接新的冒险。')).toBeTruthy();
    expect(document.querySelector<HTMLImageElement>('.formation-hud-icon')?.getAttribute('src')).toBe('/formation-art/formation-title-pines-v1.png');
    expect(screen.getByText('翠绿之径 · 怪物小队')).toBeTruthy();
    expect(document.querySelectorAll('.formation-enemy-portraits img')).toHaveLength(2);
    expect(screen.getByLabelText('出战 2/3')).toBeTruthy();
    expect(screen.queryByText(/推荐战力/)).toBeNull();
    expect(screen.getAllByRole('button', { name: /排第 .* 位/ })).toHaveLength(6);
    expect(screen.getByText('我方前排').classList.contains('formation-row-label')).toBe(true);
    expect(screen.getByText('我方后排').classList.contains('formation-row-label')).toBe(true);
    expect(document.querySelectorAll('.formation-board .formation-slot.empty')).toHaveLength(4);
    expect(document.querySelectorAll('.formation-board .formation-empty-slot')).toHaveLength(0);
    const deployedSlot = screen.getByRole('button', { name: '我方前排第 1 位：迅迅' });
    fireEvent.mouseEnter(deployedSlot);
    expect(deployedSlot.classList.contains('selected')).toBe(true);
    fireEvent.mouseLeave(deployedSlot);
    expect(deployedSlot.classList.contains('selected')).toBe(false);
    expect(screen.getByText('队伍伙伴')).toBeTruthy();
    expect(document.querySelectorAll('.formation-pet-empty')).toHaveLength(7);
    expect(document.querySelectorAll('.formation-pet-tile, .formation-pet-empty')).toHaveLength(10);
    expect(document.querySelectorAll('.formation-pet-tile .formation-pet-info')).toHaveLength(0);
    expect(document.querySelector('.formation-tip')).toBeNull();
    expect(document.querySelectorAll('.formation-detail-ability').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.formation-detail-stat-icon')).toHaveLength(2);
    const xunxunTile = screen.getByRole('button', { name: /迅迅，速度/ });
    expect(xunxunTile.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(xunxunTile);
    expect(screen.getByRole('button', { name: '我方前排第 1 位：空位' })).toBeTruthy();
    expect(xunxunTile.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(xunxunTile);
    expect(screen.getByRole('button', { name: '我方前排第 1 位：迅迅' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /灼灼，速度/ }));
    // 点击候选宠物：按 从左到右、从上到下 自动上阵（空位首位 = 前排第 3 位）
    expect(screen.getByRole('button', { name: '我方前排第 3 位：灼灼' })).toBeTruthy();
    expect(document.querySelector('.formation-detail-head strong')?.textContent).toBe('灼灼');
    expect(screen.getByLabelText('出战 3/3')).toBeTruthy();
    expect(screen.getByRole('button', { name: /确认出战，当前 3 只/ })).toBeTruthy();

    // 满员时也可点击右侧已上场伙伴下阵，再点击重新上场。
    const zhuozhuoTile = screen.getByRole('button', { name: /灼灼，速度/ });
    fireEvent.click(zhuozhuoTile);
    expect(screen.getByRole('button', { name: '我方前排第 3 位：空位' })).toBeTruthy();
    expect(zhuozhuoTile.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(zhuozhuoTile);
    expect(screen.getByRole('button', { name: '我方前排第 3 位：灼灼' })).toBeTruthy();

    // 点击场上宠物也可下阵。
    fireEvent.click(screen.getByRole('button', { name: '我方前排第 3 位：灼灼' }));
    expect(screen.getByRole('button', { name: '我方前排第 3 位：空位' })).toBeTruthy();
    expect(screen.getByLabelText('出战 2/3')).toBeTruthy();
    expect(screen.getByRole('button', { name: /确认出战，当前 2 只/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '返回地图' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'BACK_TO_MAP' });
  });

  it('模拟战右侧展示只读全员总览，场上宠物不可下阵', () => {
    render(createElement(FormationScreen, { state: formationState(true), dispatch: vi.fn() }));

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('模拟战 · 同我方生物')).toBeTruthy();
    const slot = screen.getByRole('button', { name: '我方前排第 1 位：迅迅' });
    fireEvent.click(slot);
    expect(screen.getByRole('button', { name: '我方前排第 1 位：迅迅' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /确认出战，当前 3 只/ })).toBeTruthy();
  });

  it('详情中的普通技能只显示名称，最多五个技能均保留', () => {
    const state = formationState();
    state.formation.units[2].skills = ['punch', 'tail', 'bite', 'ember', 'aqua_shot'];
    render(createElement(FormationScreen, { state, dispatch: vi.fn() }));

    expect(document.querySelectorAll('.formation-skill-tag')).toHaveLength(5);
    expect(document.querySelectorAll('.formation-detail-skills p')).toHaveLength(0);
    expect(document.querySelectorAll('.formation-pet-tile strong')).toHaveLength(0);
  });
});
