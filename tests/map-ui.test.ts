// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { canStepTo, generateMap } from '../src/game/state/game';
import { generateGrowthMap } from '../src/game/core/growth-map';
import { createInitialState } from '../src/game/state/reducer';
import { MapScreen } from '../src/ui/App';
import { getMapRouteEdges } from '../src/ui/mapRoutes';

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

describe('像素地图界面', () => {
  beforeEach(() => vi.stubGlobal('ResizeObserver', ResizeObserverStub));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('路线只连接实际可达的相邻层，不连接同层节点', () => {
    for (const act of [1, 2, 3]) {
      for (const seed of [17, 31, 59]) {
        const map = generateMap(seed, act);
        const edges = getMapRouteEdges(map);
        const expected = map.layers.slice(0, -1).flatMap((row, rowIndex) =>
          row.flatMap((from) => map.layers[rowIndex + 1]
            .filter((to) => canStepTo(rowIndex, from.col, to, map))
            .map((to) => `${from.id}->${to.id}`)),
        );
        expect(edges.map((edge) => `${edge.from}->${edge.to}`)).toEqual(expected);
        for (const edge of edges) {
          const fromRow = map.layers.findIndex((row) => row.some((node) => node.id === edge.from));
          const toRow = map.layers.findIndex((row) => row.some((node) => node.id === edge.to));
          expect(toRow).toBe(fromRow + 1);
        }
        expect(edges.filter((edge) => map.layers[0].some((node) => node.id === edge.from))).toHaveLength(map.layers[1].length);
      }
    }
  });

  it('熟练度远征 50 层只产生 49 条逐层连接', () => {
    const map = generateGrowthMap(23);
    expect(map.layers).toHaveLength(50);
    expect(getMapRouteEdges(map)).toHaveLength(49);
  });

  it('已失效节点不产生可走路线', () => {
    const map = generateMap(17, 1);
    const target = map.layers[2][0];
    const disabled = { ...map, disabled: { [target.id]: true } };
    expect(getMapRouteEdges(disabled).some((edge) => edge.from === target.id || edge.to === target.id)).toBe(false);
  });

  it('已走路线着金色，悬停展示已知信息且不泄露敌人阵容', () => {
    const base = createInitialState();
    const start = base.map.layers[0][0];
    const current = base.map.layers[1][0];
    const state = { ...base, screen: 'map' as const, currentRow: 1, currentNodeId: current.id, visitedNodeIds: [start.id, current.id] };
    const dispatch = vi.fn();
    const { container } = render(createElement(MapScreen, { state, dispatch }));

    const path = container.querySelector(`line[data-from="${start.id}"][data-to="${current.id}"]`);
    expect(path?.getAttribute('data-route-kind')).toBe('path');
    expect(container.querySelectorAll('line[data-route-kind="near"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.map-row')).toHaveLength(base.map.layers.length);
    expect(container.querySelectorAll('.node .nicon .map-node-icon')).toHaveLength(base.map.layers.flat().length);
    expect(container.querySelector('.map-info-icon .map-node-icon')).toBeTruthy();

    const option = base.map.layers[2].find((node) => canStepTo(1, current.col, node, base.map))!;
    const button = container.querySelector(`button[data-node-id="${option.id}"]`)!;
    fireEvent.focus(button);
    expect(screen.getByText('可进入')).toBeTruthy();
    expect(screen.getByText(option.label, { selector: '.map-info-name' })).toBeTruthy();
    expect(container.querySelectorAll('line[data-route-kind="far"]').length).toBeGreaterThan(0);
    expect(container.querySelector('.map-info')?.textContent).not.toContain('敌方阵容');
    fireEvent.click(button);
    expect(dispatch).toHaveBeenCalledWith({ type: 'MOVE', nodeId: option.id });
  });

  it('地图顶部路牌显示实时资源，原有跳关和背包入口保持可用', () => {
    const base = createInitialState();
    const state = { ...base, screen: 'map' as const, gold: 36 };
    const dispatch = vi.fn();
    const { container } = render(createElement(MapScreen, { state, dispatch }));
    const hud = container.querySelector('.map-hud')!;
    expect(hud.textContent).toContain(`第${state.act}幕`);
    expect(hud.querySelector('[aria-label^="出战"]')).toBeTruthy();
    expect(hud.querySelector('[aria-label="金币 36"]')).toBeTruthy();
    expect(hud.querySelectorAll('svg.map-hud-icon')).toHaveLength(6);

    fireEvent.click(screen.getByRole('button', { name: '跳关' }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'USE_SKIP', free: true }));
    fireEvent.click(screen.getByRole('button', { name: '背包' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'OPEN_BACKPACK' });
  });

  it('侦查模式保留任意节点侦查入口，熟练度模式显示首领里程碑', () => {
    const base = createInitialState();
    const state = { ...base, screen: 'map' as const, scoutSelecting: true, runMode: 'proficiency' as const, map: generateGrowthMap(5) };
    const dispatch = vi.fn();
    const { container } = render(createElement(MapScreen, { state, dispatch }));
    expect(container.querySelectorAll('.map-row')).toHaveLength(50);
    expect(container.querySelector('.map-hud-place')?.textContent).toContain('熟练度远征 · 第1/50层');
    expect(screen.getByText('首领层')).toBeTruthy();
    const future = state.map.layers[16][0];
    fireEvent.click(container.querySelector(`button[data-node-id="${future.id}"]`)!);
    expect(dispatch).toHaveBeenCalledWith({ type: 'USE_SCOUT', nodeId: future.id });
  });
});
