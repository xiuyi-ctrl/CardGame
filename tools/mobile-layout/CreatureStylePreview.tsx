import { useState } from 'react';
import { makeUnit } from '../../src/game/core/battle';
import { PixelCreature, UnitCard } from '../../src/ui/components';
import xunxun64 from '../../src/ui/assets/home-xunxun.png';
import unifiedXunxun from '../../design/previews/creature-style-unification-v1/assets/xunxun.png';
import mimi64 from '../../design/creatures/mimi-pixel-v2/sprite-64.png';
import coal64 from '../../design/previews/creature-style-unification-v1/assets/coal.png';
import './creature-style-preview.css';

const samples = [
  { unit: makeUnit('momo', true, 0, false), image: unifiedXunxun },
  { unit: makeUnit('mimi', true, 1, false), image: mimi64 },
  { unit: makeUnit('coal', true, 2, false), image: coal64 },
];
export const CREATURE_STYLE_IMAGES = [xunxun64, unifiedXunxun, mimi64, coal64];

/** 只在独立验收入口中展示，用实际战场卡片比较；不修改游戏资源或存档。 */
export function CreatureStylePreview() {
  const [scene, setScene] = useState<'plain' | 'battle' | 'formation'>('plain');
  return <main className="creature-style-preview">
    <header><h1>生物像素统一 · 三只对照</h1><span>迅迅 / 咪咪 / 煤煤</span></header>
    <div className="style-panels">{[false, true].map(unified => <section key={String(unified)} className={unified ? 'style-after' : 'style-before'}>
      <h2>{unified ? '统一样例' : '当前显示'}<small>{unified ? '同一64像素网格 · 同一落点 · 无额外投影' : '保留现有画布、原图及投影差异'}</small></h2>
      <div className={`style-stage ${scene === 'plain' ? '' : scene === 'battle' ? 'battle-field' : 'formation-board'}`}>
        {samples.map(({ unit, image }) => <figure key={unit.speciesId}>
          <div className="style-creature-slot">{scene === 'plain'
            ? unified ? <img src={image} alt={unit.name} /> : <PixelCreature unit={unit} />
            : <UnitCard unit={unit} battleDisplay imageOverride={unified ? image : scene === 'formation' && unit.speciesId === 'momo' ? xunxun64 : undefined} />}</div>
          <figcaption>{unit.name}</figcaption>
        </figure>)}
      </div>
    </section>)}</div>
    <footer><span>原稿保留 · 仅供对照验收</span><div>{(['plain', 'battle', 'formation'] as const).map((mode, index) => <button key={mode} aria-pressed={mode === scene} onClick={() => setScene(mode)}>{['浅色底', '战场卡片', '布阵卡片'][index]}</button>)}</div></footer>
  </main>;
}
