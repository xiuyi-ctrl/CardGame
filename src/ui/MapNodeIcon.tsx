import type { NodeType } from '../game/state/game';

export function MapNodeIcon({ type }: { type: NodeType }) {
  return <img className="map-node-icon" src={`/map-node-icons/${type}.png`} alt="" aria-hidden="true" draggable={false} />;
}
