import { canStepTo, type RunMap } from '../game/state/game';

export interface MapRouteEdge {
  from: string;
  to: string;
}

/** Only adjacent map rows can be connected; row zero keeps its special all-branches rule. */
export function getMapRouteEdges(map: RunMap): MapRouteEdge[] {
  const edges: MapRouteEdge[] = [];
  for (let row = 0; row < map.layers.length - 1; row++) {
    for (const from of map.layers[row]) {
      if (map.disabled?.[from.id]) continue;
      for (const to of map.layers[row + 1]) {
        if (canStepTo(row, from.col, to, map)) edges.push({ from: from.id, to: to.id });
      }
    }
  }
  return edges;
}
