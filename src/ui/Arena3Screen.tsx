import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { CampHeader } from './CampScreens';
import { FlowPet } from './MainFlowArt';
import { MapNodeIcon } from './MapNodeIcon';
import './proficiency.css';

export function Arena3Screen({ state, dispatch }: { state: GameState; dispatch: (action: GameAction) => void }) {
  const partner = state.roster[0];
  return <div className="flow-screen camp-screen proficiency-arena-screen">
    <CampHeader title="竞技场" subtitle={`选择一种挑战方式 · 当前金币 ${state.gold}`} />
    <main className="proficiency-arena-options camp-scroll">
      <button type="button" className="arena-mode is-simulation" onClick={() => dispatch({ type: 'ARENA3_MODE', mode: 'simulation' })}>
        <h2>模拟战</h2><div className="arena-mode-art arena-mirror" aria-hidden="true">{partner && <FlowPet unit={partner} />}<span className="arena-mirror-glass" />{partner && <FlowPet unit={partner} />}</div>
        <p>与自己的镜像队伍对战</p><p className="arena-safety">不消耗生命，不产生死亡</p><div className="arena-reward">胜利：<br />全体存活生物 <b>+5成长点</b></div><p className="arena-footnote">失败无惩罚</p><span className="arena-mode-action">选择模拟战</span>
      </button>
      <button type="button" className="arena-mode is-challenge" onClick={() => dispatch({ type: 'ARENA3_MODE', mode: 'challenge' })}>
        <h2>挑战赛</h2><div className="arena-mode-art arena-challenge-art" aria-hidden="true"><MapNodeIcon type="elite" /><MapNodeIcon type="battle" /><MapNodeIcon type="elite" /></div>
        <p>对战3只精英级敌人</p><p className="arena-danger">正常战斗规则，可死亡</p><div className="arena-reward">胜利：<br /><b>50金币</b> + 全体<b>3成长点</b></div><p className="arena-danger">失败：远征直接结束</p><span className="arena-mode-action">选择挑战赛</span>
      </button>
      <button type="button" className="arena-mode is-exhibition" disabled={state.gold < 20} onClick={() => dispatch({ type: 'ARENA3_MODE', mode: 'exhibition' })}>
        <h2>表演赛</h2><div className="arena-mode-art arena-stage" aria-hidden="true"><MapNodeIcon type="arena3" /></div>
        <p>花费20金币</p><div className="arena-reward">选择1只宠物，<br />获得<b>5成长点</b></div><p className="arena-footnote">{state.gold < 20 ? '金币不足，需要20金币' : `当前金币 ${state.gold}`}</p><span className="arena-mode-action">选择表演赛</span>
      </button>
    </main>
  </div>;
}
