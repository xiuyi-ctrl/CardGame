import { useEffect, useRef, useState, type Dispatch } from 'react';
import { MAIN_REGIONS, type MainRegionId } from '../game/data/regions';
import { getMonster } from '../game/data/monsters';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { useBackAction } from './mobile';
import './regions.css';

const REGION_ART = {
  mixed: new URL('./assets/home-handheld-background.png', import.meta.url).href,
  emerald_forest: new URL('./assets/map-act1.png', import.meta.url).href,
};

export const FOREST_ACT_NAMES = ['', '林缘营地', '幽暗密林', '古树遗迹'];

function RegionEcology({ regionId, onClose }: { regionId: MainRegionId; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const region = MAIN_REGIONS[regionId];
  useBackAction(true, onClose, 10);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="region-ecology" aria-labelledby="region-ecology-title" onCancel={onClose}>
    <header><h2 id="region-ecology-title">{region.name} · 生态详情</h2><button type="button" autoFocus onClick={onClose}>关闭</button></header>
    <div className="region-ecology-body">
      <p>{regionId === 'mixed' ? '保留原有全部生物池与首领规则。' : '7条进化链，共21种形态；第一幕不直接投放传奇，击败第一幕首领后开放传奇融合。'}</p>
      <table><thead><tr><th>一阶</th><th>二阶</th><th>传奇</th></tr></thead><tbody>
        {region.basePool.map(id => {
          const second = getMonster(id).evolutions?.find(e => region.evo1Pool.includes(e.to))?.to;
          const third = second && getMonster(second).evolutions?.find(e => region.evo2Pool.includes(e.to))?.to;
          return <tr key={id}>{[id, second, third].map((species, stage) => <td key={stage}>{species ? getMonster(species).name : '—'}</td>)}</tr>;
        })}
      </tbody></table>
      <p>表内展示本地区随机生物池中的进化链形态；“—”表示该形态未列入原有地区池，不修改融合规则。</p>
      <p>开局主力：{region.starters.map(id => getMonster(id).name).join('、')}；同行：{region.companions.map(id => getMonster(id).name).join('、')}。</p>
      {regionId === 'emerald_forest' && <p>三幕：林缘营地 → 幽暗密林 → 古树遗迹。首领依次为古树之主、苔藓领主；第三幕暂从熔火领主、玄铁渊龙、炼狱魔君中等概率选择一位，专属首领待后续替换。</p>}
    </div>
  </dialog>;
}

export function RegionScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const [selected, setSelected] = useState<MainRegionId>(state.region ?? 'mixed');
  const [ecology, setEcology] = useState<MainRegionId | null>(null);
  const back = () => dispatch({ type: 'TITLE' });
  useBackAction(true, back);
  return <div className="region-screen">
    <header className="region-header">
      <div><small>新远征 1/4</small><h1>选择地区</h1></div>
      <button type="button" onClick={back}>返回首页</button>
    </header>
    <main className="region-choices" role="group" aria-label="选择远征地区">
      {(['mixed', 'emerald_forest'] as const).map(id => {
        const region = MAIN_REGIONS[id];
        return <button key={id} type="button" className={`region-card region-${id} ${selected === id ? 'selected' : ''}`}
          aria-pressed={selected === id} onClick={() => setSelected(id)}>
          <img className="region-landscape" src={REGION_ART[id]} alt="" />
          <span className="region-card-copy"><strong>{region.name}</strong>
            <span>{id === 'mixed' ? '原有生态 · 自由组合' : '中毒 · 净化 · 狐火 · 防守'}</span>
            <small>{id === 'mixed' ? '保留现有生物、首领与获取规则' : '7条进化链：迅迅、泡泡、铁墩、刺刺、咪咪、光苔球、火狐'}</small>
          </span>
          <span className="region-card-status">{selected === id ? '✓ 已选择' : '选择地区'}</span>
        </button>;
      })}
    </main>
    <footer className="region-footer">
      <p>{selected === 'mixed' ? '本局地区固定，接下来选择难度与遗物。' : '遭遇、战后招募与孵化均使用林地生态，第三幕首领暂用现有候选。'}</p>
      <button type="button" onClick={() => setEcology(selected)}>查看生态详情</button>
      <button type="button" onClick={() => dispatch({ type: 'SET_REGION', region: selected })}>下一步：难度与遗物</button>
    </footer>
    {ecology && <RegionEcology regionId={ecology} onClose={() => setEcology(null)} />}
  </div>;
}
