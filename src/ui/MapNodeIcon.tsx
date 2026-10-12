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

const SILHOUETTES: Partial<Record<NodeType, string>> = {
  event: 'M5 3h13v3h3v6l-7 5v1h-4v-4l6-5V7H9v3H5zM10 20h4v4h-4z',
  shop: 'M2 9 12 1l10 8v14H2zm5 3v11h10V12zm3 3h4v8h-4z',
  rest: 'M12 1l4 7 4-2v7l3 4-3 6H4l-3-6 5-8v5l4-3zm0 12-4 5 2 3h4l2-3z',
  elite: 'M1 2h5v5l6 3 6-3V2h5v8l-5 4v7l-6 3-6-3v-7l-5-4zm6 10v4h3v-4zm7 0v4h3v-4z',
  guardian: 'M2 2h20v11l-3 5-7 6-7-6-3-5zm5 4 5 8 5-8h-4l-1 3-1-3z',
  boss: 'M1 3h5l3 5h6l3-5h5v7l-4 3v10H5V13l-4-3zm6 9v4h3v-4zm7 0v4h3v-4z',
  special: 'M4 3h16v3h3v5H1V6h3zM1 13h8v4h6v-4h8v10H1zM11 11h2v4h-2z',
  sync: 'M1 5h9v4H1zM14 5h9v4h-9zM1 11h9v11H1zm3 2v4h3v-4zM14 11h9v11h-9zm3 2v4h3v-4z',
  corrupted: 'M7 1h4L8 9h3l5-8h4l-5 11h3l3-6h3l-3 13-7 5H6l-5-6 1-8h4l-1 6h3z',
  watchtower: 'M3 1h4v4h3V1h4v4h3V1h4v8h-4v12h4v3H3v-3h4V9H3zm7 11v6h4v-6z',
  keydoor: 'M5 2h14v22H5zm3 3v16h8V5zm4 8h2v3h-2z',
  blacksmith: 'M2 2h14v6h-5v3l11 9-3 4L8 12H2z',
  gauntlet: 'M3 1h5v4h4v5H8v4H3v-4H0V5h3zM16 10h5v4h3v5h-3v5h-5v-5h-4v-5h4z',
  arena: 'M2 3h20v5H2zM4 10h4v10H4zM10 10h4v10h-4zM16 10h4v10h-4zM1 21h22v3H1z',
  arena3: 'M2 3h20v5H2zM4 10h4v10H4zM10 10h4v10h-4zM16 10h4v10h-4zM1 21h22v3H1z',
};

export function MapNodeIcon({ type, silhouette = false }: { type: NodeType; silhouette?: boolean }) {
  return (
    <svg className="map-node-icon" viewBox="0 0 24 24" aria-hidden="true" shapeRendering="crispEdges">
      {silhouette && type === 'battle' ? <g fill="currentColor">
        <path d="M2 2h5l14 14-5 5L2 7zM13 19l6-6 3 3-6 6zM17 21l4-4 3 3-4 4z" />
        <path d="M17 2h5v5L8 21l-5-5zM2 16l3-3 6 6-3 3zM0 20l3-3 4 4-3 3z" />
      </g> : silhouette && SILHOUETTES[type] ? <path d={SILHOUETTES[type]} fill="currentColor" fillRule="evenodd" /> : ICON_ART[type]}
    </svg>
  );
}
