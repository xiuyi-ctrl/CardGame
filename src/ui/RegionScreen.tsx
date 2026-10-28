import { useEffect, useRef, useState, type Dispatch } from 'react';
import { MAIN_REGIONS, type MainRegionId } from '../game/data/regions';
import { getMonster, SPECIAL_EGG_POOL } from '../game/data/monsters';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { useBackAction } from './mobile';
import './regions.css';
import { PetIcon } from './components';
import { getDecodedImage, preloadImages } from './imageCache';

const REGION_ART = {
  mixed: new URL('./assets/home-handheld-background.png', import.meta.url).href,
  emerald_forest: new URL('./assets/map-act1.png', import.meta.url).href,
};

export const FOREST_ACT_NAMES = ['', '林缘营地', '幽暗密林', '古树遗迹'];

function ecologyImages(regionId: MainRegionId): string[] {
  const region = MAIN_REGIONS[regionId];
  return [...region.basePool, ...region.evo1Pool, ...region.evo2Pool, ...SPECIAL_EGG_POOL].map(id => `/ecology/${id}.png`);
}

function RegionEcology({ regionId, encountered, onClose }: { regionId: MainRegionId; encountered: readonly string[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const region = MAIN_REGIONS[regionId];
  const [ready, setReady] = useState(() => ecologyImages(regionId).every(src => !!getDecodedImage(src)));
  useEffect(() => {
    let active = true;
    void preloadImages(ecologyImages(regionId)).then(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [regionId]);
  useBackAction(true, onClose, 10);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="region-ecology" aria-labelledby="region-ecology-title" onCancel={onClose}>
    <header><h2 id="region-ecology-title">{region.name} · 生态详情</h2><button type="button" autoFocus onClick={onClose}>关闭</button></header>
    <div className={`region-ecology-body${ready ? '' : ' is-loading'}`} aria-busy={!ready}>
      {!ready && <div className="region-ecology-loading" role="status">正在展开生态图鉴…</div>}
      <div className="region-ecology-collection">
      {([['一阶', region.basePool], ['二阶', region.evo1Pool], ['传奇', region.evo2Pool], ['神秘生物', SPECIAL_EGG_POOL]] as const).map(([label, pool]) =>
      <section className={`region-ecology-stage${label === '神秘生物' ? ' region-ecology-eggs' : ''}`} key={label} aria-label={label}>
        <h3>{label}</h3>
        <div className="region-ecology-grid">
        {pool.map(id => {
          const species = getMonster(id);
          const known = encountered.includes(id);
          return <div key={id} className={`region-ecology-creature${known ? '' : ' undiscovered'}`}>
            <span className="region-ecology-portrait"><PetIcon image={`/ecology/${id}.png`} emoji={species.emoji} name={known ? species.name : '未遇见生物'} /></span>
          </div>;
        })}
        </div>
      </section>)}
      </div>
    </div>
  </dialog>;
}

export function RegionScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const [selected, setSelected] = useState<MainRegionId>(state.region ?? 'mixed');
  const [ecology, setEcology] = useState<MainRegionId | null>(null);
  useEffect(() => { void preloadImages(ecologyImages(selected)); }, [selected]);
  const back = () => dispatch({ type: 'TITLE' });
  useBackAction(true, back);
  return <div className="region-screen">
    <header className="region-header">
      <div><h1>选择地区</h1></div>
      <button type="button" onClick={back}>返回首页</button>
    </header>
    <main className="region-choices" role="group" aria-label="选择远征地区">
      {(['mixed', 'emerald_forest'] as const).map(id => {
        const region = MAIN_REGIONS[id];
        return <button key={id} type="button" className={`region-card region-${id} ${selected === id ? 'selected' : ''}`}
          aria-pressed={selected === id} onClick={() => setSelected(id)}>
          <img className="region-landscape" src={REGION_ART[id]} alt="" />
          <span className="region-card-copy"><strong>{region.name}</strong>
            <span>{id === 'mixed' ? '原有生态 · 自由组合' : '神秘林地，多样生态。'}</span>
          </span>
          <span className="region-card-status">{selected === id ? '✓ 已选择' : '选择地区'}</span>
        </button>;
      })}
    </main>
    <footer className="region-footer">
      <button type="button" onClick={() => setEcology(selected)}>查看生态详情</button>
      <button type="button" onClick={() => dispatch({ type: 'SET_REGION', region: selected })}>下一步：难度与遗物</button>
    </footer>
    {ecology && <RegionEcology regionId={ecology} encountered={state.unlocks?.regionEncounters?.[ecology] ?? []} onClose={() => setEcology(null)} />}
  </div>;
}
