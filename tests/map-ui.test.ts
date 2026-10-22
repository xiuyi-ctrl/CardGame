// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { canStepTo, generateMap, type GameState } from '../src/game/state/game';
import { generateGrowthMap } from '../src/game/core/growth-map';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
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

  it.each([false, true])('双生宝箱开启后保留已走路线及出口，配对宝箱仍失效（双生符：%s）', (hasTwin) => {
    const base = gameReducer(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'kiki', seed: 17 });
    const before: GameState = {
      ...base, screen: 'map', currentRow: 1, currentNodeId: 'route-before', visitedNodeIds: ['route-start', 'route-before'],
      inventory: { ...base.inventory, twin: hasTwin ? 1 : 0 },
      map: { ...base.map, disabled: {}, layers: [
        [{ id: 'route-start', type: 'rest', label: '出发', col: 0 }],
        [{ id: 'route-before', type: 'shop', label: '商店', col: 0 }],
        [{ id: 'route-chest', type: 'sync', label: '双生宝箱', col: 0, pairedId: 'route-paired' },
          { id: 'route-paired', type: 'sync', label: '双生宝箱', col: 1, pairedId: 'route-chest' }],
        [{ id: 'route-after', type: 'rest', label: '营火', col: 0 }],
        [{ id: 'route-future', type: 'rest', label: '营火', col: 0 }],
      ] },
    };
    const opened = gameReducer(before, { type: 'MOVE', nodeId: 'route-chest' });
    expect(opened.screen).toBe('chest');
    expect(opened.map.disabled?.['route-chest']).toBe(true);
    expect(opened.map.disabled?.['route-paired']).toBe(true);
    expect(opened.visitedNodeIds).toEqual(['route-start', 'route-before', 'route-chest']);
    const onMap = gameReducer(opened, { type: 'NEXT_NODE' });
    const edges = getMapRouteEdges(onMap.map, onMap.visitedNodeIds);
    expect(edges).toContainEqual({ from: 'route-before', to: 'route-chest' });
    expect(edges).toContainEqual({ from: 'route-chest', to: 'route-after' });
    expect(edges.some(edge => edge.from === 'route-paired' || edge.to === 'route-paired')).toBe(false);
    expect(canStepTo(1, 0, onMap.map.layers[2][0], onMap.map)).toBe(false);
    const { container, rerender } = render(createElement(MapScreen, { state: onMap, dispatch: vi.fn() }));
    const lineKind = (from: string, to: string) => container.querySelector(`line[data-from="${from}"][data-to="${to}"]`)?.getAttribute('data-route-kind');
    expect(lineKind('route-before', 'route-chest')).toBe('path');
    expect(lineKind('route-chest', 'route-after')).toBe('near');
    expect(container.querySelector('[data-node-id="route-chest"]')?.classList.contains('node-off')).toBe(false);
    expect(container.querySelector('[data-node-id="route-paired"]')?.classList.contains('node-off')).toBe(true);
    const moved = gameReducer(onMap, { type: 'MOVE', nodeId: 'route-after' });
    expect(moved.currentNodeId).toBe('route-after');
    const after = gameReducer(gameReducer(moved, { type: 'REST_HEAL' }), { type: 'NEXT_NODE' });
    rerender(createElement(MapScreen, { state: after, dispatch: vi.fn() }));
    expect(lineKind('route-before', 'route-chest')).toBe('path');
    expect(lineKind('route-chest', 'route-after')).toBe('path');
    expect(container.querySelector('[data-node-id="route-chest"]')?.classList.contains('node-off')).toBe(false);
  });

  it.each([false, true])('跳关记录连续路线，继续前进和读档后仍高亮（免费：%s）', free => {
    const base = gameReducer(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'kiki', seed: 7 });
    const before: GameState = {
      ...base, screen: 'map', currentRow: 1, currentNodeId: 'skip-before', visitedNodeIds: ['skip-start', 'skip-before'],
      inventory: { ...base.inventory, skip: 1 },
      map: { ...base.map, layers: [
        [{ id: 'skip-start', type: 'rest', label: '出发', col: 0 }],
        [{ id: 'skip-before', type: 'shop', label: '商店', col: 0 }],
        [{ id: 'skip-target', type: 'battle', label: '战斗', col: 0 }],
        [{ id: 'skip-after', type: 'rest', label: '营火', col: 0 }],
        [{ id: 'skip-future', type: 'rest', label: '营火', col: 0 }],
      ] },
    };
    const skipped = gameReducer(before, { type: 'USE_SKIP', nodeId: 'skip-target', free });
    expect(skipped.screen).toBe('reward');
    expect(skipped.visitedNodeIds).toEqual(['skip-start', 'skip-before', 'skip-target']);
    expect(before.visitedNodeIds).toEqual(['skip-start', 'skip-before']);
    expect(skipped.inventory.skip).toBe(free ? 1 : 0);
    const onMap = gameReducer(skipped, { type: 'NEXT_NODE' });
    const { container, rerender } = render(createElement(MapScreen, { state: onMap, dispatch: vi.fn() }));
    const lineKind = (from: string, to: string) => container.querySelector(`line[data-from="${from}"][data-to="${to}"]`)?.getAttribute('data-route-kind');
    expect(lineKind('skip-before', 'skip-target')).toBe('path');
    expect(lineKind('skip-target', 'skip-after')).toBe('near');
    const moved = gameReducer(onMap, { type: 'MOVE', nodeId: 'skip-after' });
    const returned = gameReducer(moved, { type: 'NEXT_NODE' });
    const loaded = gameReducer(createInitialState(), { type: 'LOAD_GAME', state: JSON.parse(JSON.stringify(returned)) });
    expect(loaded.visitedNodeIds).toEqual(['skip-start', 'skip-before', 'skip-target', 'skip-after']);
    rerender(createElement(MapScreen, { state: loaded, dispatch: vi.fn() }));
    expect(lineKind('skip-before', 'skip-target')).toBe('path');
    expect(lineKind('skip-target', 'skip-after')).toBe('path');
    expect(container.querySelector('line[data-from="skip-before"][data-to="skip-after"]')).toBeNull();
  });

  it('历史路线不会绕过列相邻限制', () => {
    const map = generateMap(17, 1);
    const from = map.layers[1][0];
    const to = { ...map.layers[2][0], col: 4 };
    const changed = { ...map, layers: map.layers.map((row, index) => index === 2 ? [to] : row), disabled: { [to.id]: true } };
    expect(getMapRouteEdges(changed, [from.id, to.id])).not.toContainEqual({ from: from.id, to: to.id });
  });

  it('已走路线着金色，右侧只展示标题、图标、可达状态和简要描述', () => {
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

    const option = base.map.layers[2].find((node) => canStepTo(1, current.col, node, base.map))!;
    const button = container.querySelector(`button[data-node-id="${option.id}"]`)!;
    fireEvent.focus(button);
    expect(screen.getByText(option.label, { selector: '.map-info-name' })).toBeTruthy();
    expect(screen.getByText('可进入', { selector: '.map-info-status' })).toBeTruthy();
    expect(container.querySelector('.map-info p')?.textContent).toBeTruthy();
    expect(container.querySelector('.map-info-icon .map-node-icon')).toBeTruthy();
    expect(container.querySelector('.map-info-heading')).toBeNull();
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
    expect(hud.querySelector('[aria-label="当前第 1 层"]')).toBeTruthy();
    expect(hud.querySelectorAll('img.map-hud-icon')).toHaveLength(7);

    fireEvent.click(screen.getByRole('button', { name: '跳关' }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'USE_SKIP', free: true }));
    fireEvent.click(screen.getByRole('button', { name: '背包' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'OPEN_BACKPACK' });
  });

  it('侦查模式保留任意节点侦查入口', () => {
    const base = createInitialState();
    const state = { ...base, screen: 'map' as const, scoutSelecting: true, runMode: 'proficiency' as const, map: generateGrowthMap(5) };
    const dispatch = vi.fn();
    const { container } = render(createElement(MapScreen, { state, dispatch }));
    expect(container.querySelectorAll('.map-row')).toHaveLength(50);
    expect(container.querySelector('.map-hud-place')?.textContent).toContain('熟练度远征 · 第1/50层');
    expect(container.querySelector('.map-milestones')).toBeNull();
    const future = state.map.layers[16][0];
    fireEvent.click(container.querySelector(`button[data-node-id="${future.id}"]`)!);
    expect(dispatch).toHaveBeenCalledWith({ type: 'USE_SCOUT', nodeId: future.id });
  });
});
