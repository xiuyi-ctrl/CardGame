import type { ReactNode } from 'react';
import type { NodeType } from '../game/state/game';

const sword = (
  <>
    <path d="M3 2h3l12 12-3 3L3 5z" fill="#d7e6df" stroke="#25394a" strokeWidth="2" />
    <path d="M3 2h3l8 8-2 2z" fill="#fff5db" />
    <path d="m15 15 4 4m-5-1 4-4" stroke="#d69e52" strokeWidth="2.5" />
  </>
);

const ICON_ART: Record<NodeType, ReactNode> = {
  battle: <g>{sword}<g transform="translate(24 0) scale(-1 1)">{sword}</g></g>,
  elite: <>
    <path d="M4 4 8 7 12 4l4 3 4-3-1 7 2 4-3 5H6l-3-5 2-4z" fill="#a93f43" stroke="#361d2c" strokeWidth="2" />
    <path d="M7 10h3v3H7zm7 0h3v3h-3z" fill="#ffcb79" />
    <path d="m9 17 3-2 3 2" stroke="#2a1b25" strokeWidth="2" />
  </>,
  rest: <>
    <path d="m4 20 15-5m1 5L5 15" stroke="#65452f" strokeWidth="3" />
    <path d="M12 3c4 4 1 6 5 8 2 2 1 7-5 8-6-1-7-6-4-9 1-2 2-4 4-7z" fill="#f1a53e" stroke="#77352d" strokeWidth="2" />
    <path d="M12 10c2 2 3 4 2 6-1 2-4 2-5 0-1-2 1-4 3-6z" fill="#fff1a0" />
  </>,
  shop: <>
    <path d="M8 4h8l-2 4 4 4 2 8H4l2-8 4-4z" fill="#c48038" stroke="#452e2d" strokeWidth="2" />
    <path d="M8 8h8M9 4l3 3 3-3" stroke="#f3c669" strokeWidth="2" />
    <circle cx="12" cy="15" r="3" fill="#f7df80" /><path d="M12 12v6" stroke="#ae7938" />
  </>,
  event: <>
    <path d="M8 7V4h8v2h3v5l-5 3v2h-4v-4l5-3V8h-4v2H8z" fill="#79c6ec" stroke="#294867" strokeWidth="2" />
    <path d="M10 18h4v4h-4z" fill="#9edcff" stroke="#294867" strokeWidth="2" />
  </>,
  special: <>
    <path d="M3 10h18v11H3z" fill="#805132" stroke="#322936" strokeWidth="2" />
    <path d="M4 6h16l2 5H2z" fill="#d69c45" stroke="#433037" strokeWidth="2" />
    <path d="M10 10h4v8h-4z" fill="#ffe089" />
  </>,
  boss: <>
    <path d="m3 7 5 4 4-7 4 7 5-4-2 12H5z" fill="#d5a747" stroke="#473234" strokeWidth="2" />
    <path d="M6 17h12v3H6z" fill="#f4df88" /><path d="M10 12h4v3h-4z" fill="#bc4e52" />
  </>,
  arena: <>
    <path d="M5 3h4l7 12-3 2L6 6z" fill="#cbd9dc" stroke="#39435a" strokeWidth="2" />
    <path d="M13 3h4l-7 12-3-2 7-10z" fill="#dce7e3" stroke="#39435a" strokeWidth="2" />
    <path d="m4 18 6-4m4 0 6 4" stroke="#e4a75e" strokeWidth="3" />
  </>,
  gauntlet: <>
    <path d="M4 9h5V4h5v5h5v5h-5v6H9v-6H4z" fill="#d16144" stroke="#452b37" strokeWidth="2" />
    <path d="M10 9h4v6h-4z" fill="#f5c975" />
  </>,
  corrupted: <>
    <path d="M12 2 5 6l-2 8 5 7 8 1 5-7-2-8z" fill="#623d60" stroke="#251d35" strokeWidth="2" />
    <path d="m13 5-5 7 4 2-2 5 7-9-4-1z" fill="#d47b91" />
  </>,
  watchtower: <>
    <path d="M7 5h10v15H7z" fill="#879ca0" stroke="#273943" strokeWidth="2" />
    <path d="M5 3h14v5H5z" fill="#aeb9aa" stroke="#273943" strokeWidth="2" />
    <path d="M10 11h4v5h-4z" fill="#e7c474" /><path d="M4 20h16v2H4z" fill="#665747" />
  </>,
  sync: <>
    <path d="M2 10h9v10H2zm11 0h9v10h-9z" fill="#9c683c" stroke="#3c2d31" strokeWidth="2" />
    <path d="M2 7h9v4H2zm11 0h9v4h-9z" fill="#e6b65e" stroke="#3c2d31" strokeWidth="2" />
    <path d="M5 10v10m12-10v10" stroke="#f8df91" strokeWidth="2" />
  </>,
  guardian: <>
    <path d="M12 2 20 6v7c0 5-4 8-8 9-4-1-8-4-8-9V6z" fill="#9cb7b5" stroke="#33434d" strokeWidth="2" />
    <path d="M12 6 16 8v5c0 2-2 4-4 5-2-1-4-3-4-5V8z" fill="#70d8bd" />
  </>,
  keydoor: <>
    <path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="#c5ced0" strokeWidth="3" />
    <path d="M5 10h14v12H5z" fill="#9aafab" stroke="#34424a" strokeWidth="2" />
    <path d="M11 14h2v5h-2z" fill="#e8c26a" />
  </>,
  blacksmith: <>
    <path d="M4 4h13v5h-5l7 8-3 3-8-8v-3H4z" fill="#b8c6c1" stroke="#35424c" strokeWidth="2" />
    <path d="M4 20h16v2H4z" fill="#ca8643" />
  </>,
  arena3: <>
    <path d="M4 4h3v17H4zm6 0h3v17h-3zm6 0h3v17h-3z" fill="#aab9bc" />
    <path d="M3 3h18v3H3zm-1 17h20v3H2z" fill="#e3bd69" />
  </>,
};

export function MapNodeIcon({ type }: { type: NodeType }) {
  return (
    <svg className="map-node-icon" viewBox="0 0 24 24" aria-hidden="true" shapeRendering="crispEdges">
      {ICON_ART[type]}
    </svg>
  );
}
