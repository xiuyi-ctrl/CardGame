import { canStepTo, type RunMap } from '../game/state/game';

export interface MapRouteEdge {
  from: string;
  to: string;
}

/** 相邻路线遵循移动规则；已消耗节点仍保留真实行进历史和向前的出口。 */
export function getMapRouteEdges(map: RunMap, visitedNodeIds: string[] = []): MapRouteEdge[] {
  const edges: MapRouteEdge[] = [];
  const visited = new Set(visitedNodeIds);
  const visitedNext = new Map(visitedNodeIds.slice(1).map((id, index) => [visitedNodeIds[index], id]));
  for (let row = 0; row < map.layers.length - 1; row++) {
    for (const from of map.layers[row]) {
      if (map.disabled?.[from.id] && !visited.has(from.id)) continue;
      for (const to of map.layers[row + 1]) {
        // disabled 禁止再次进入宝箱，但不应抹除已走过的连线；仍校验层与列的相邻关系。
        const walked = visitedNext.get(from.id) === to.id;
        if (canStepTo(row, from.col, to, map) || (walked && canStepTo(row, from.col, to))) {
          edges.push({ from: from.id, to: to.id });
        }
      }
    }
  }
  return edges;
}
