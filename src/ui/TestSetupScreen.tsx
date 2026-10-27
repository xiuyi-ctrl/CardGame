import { useState, type Dispatch, type ReactNode } from 'react';
import { EVENT_TYPE_LABELS, SPECIAL_REWARDS, type GameState, type NodeType, type TestScenario } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { GROWTH_EVENT_NAMES, GROWTH_EVENT_TYPES } from '../game/data/growth-events';
import { GROWTH_SPECIAL_REWARDS } from '../game/data/growth-special';
import { MAIN_REGIONS } from '../game/data/regions';
import { MONSTERS } from '../game/data/monsters';
import { useBackAction } from './mobile';
import './testTools.css';

const MAIN_TYPES: [NodeType, string][] = [['battle', '普通战斗'], ['elite', '精英战斗'], ['boss', '首领'], ['corrupted', '侵蚀'],
  ['guardian', '守卫'], ['arena', '斗兽场'], ['gauntlet', '车轮战'], ['shop', '商店'], ['rest', '休息'], ['event', '事件'],
  ['special', '奇遇'], ['watchtower', '瞭望塔'], ['sync', '双生宝箱'], ['keydoor', '钥匙门']];
const PROF_TYPES: [NodeType, string][] = [['battle', '普通战斗'], ['elite', '精英战斗'], ['boss', '首领'], ['shop', '商店'],
  ['rest', '营火'], ['event', '事件'], ['special', '奇遇'], ['blacksmith', '铁匠铺'], ['arena3', '竞技场三模式']];

export function TestSetupScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const [config, setConfig] = useState<TestScenario>(() => state.testScenario ?? { mode: 'main', region: 'mixed', difficulty: 'normal',
    act: 1, layer: 5, seed: 1, gold: 500, itemCount: 2, hpPercent: 60, deadCount: 1, customParty: false, nodeType: 'battle' });
  const set = (patch: Partial<TestScenario>) => setConfig(old => ({ ...old, ...patch }));
  useBackAction(true, () => dispatch({ type: 'TITLE' }));
  const prof = config.mode === 'proficiency';
  const types = prof ? PROF_TYPES : MAIN_TYPES;
  const events = prof ? Object.entries(GROWTH_EVENT_NAMES) : Object.entries(EVENT_TYPE_LABELS);
  const specials = prof ? Object.values(GROWTH_SPECIAL_REWARDS) : SPECIAL_REWARDS;
  const numberField = (label: string, key: 'seed' | 'layer' | 'gold' | 'itemCount' | 'hpPercent' | 'deadCount' | 'partySize', min: number, max: number) =>
    <label>{label}<input type="number" min={min} max={max} value={config[key]} onChange={event => set({ [key]: Number(event.target.value) })} /></label>;
  return <div className="test-setup">
    <header><h1>关卡测试</h1><span>独立测试局 · 不写入存档</span><button onClick={() => dispatch({ type: 'TITLE' })}>返回首页</button></header>
    <div className="test-setup-body">
      <section className="test-setup-types" aria-label="关卡类型">
        {types.map(([id, label]) => <button key={id} aria-pressed={config.nodeType === id} onClick={() => set({ nodeType: id })}>{label}</button>)}
      </section>
      <section className="test-setup-config" aria-label="测试配置">
        <div className="test-setup-fields">
          <label>模式<select value={config.mode} onChange={event => {
            const mode = event.target.value as TestScenario['mode'];
            set({ mode, partySize: mode === 'main' ? 6 : 3, nodeType: 'battle', eventType: undefined, specialId: undefined, bossId: undefined });
          }}><option value="main">主模式</option><option value="proficiency">熟练度远征</option></select></label>
          {!prof && <label>地区<select value={config.region} onChange={event => set({ region: event.target.value as TestScenario['region'] })}>
            {Object.values(MAIN_REGIONS).map(region => <option key={region.id} value={region.id}>{region.name}</option>)}
          </select></label>}
          <label>难度<select value={config.difficulty} onChange={event => set({ difficulty: event.target.value as TestScenario['difficulty'] })}>
            <option value="normal">普通</option><option value="hard">困难</option><option value="nightmare">地狱</option>
          </select></label>
          {!prof && <label>幕次<select value={config.act} onChange={event => set({ act: Number(event.target.value) })}>
            {[1, 2, 3].map(act => <option key={act} value={act}>第{act}幕</option>)}
          </select></label>}
          {numberField(prof ? '层数（1～50）' : '层数（超出时取幕末）', 'layer', 1, 50)}
          {numberField('随机种子', 'seed', 1, 2147483647)}
          {config.nodeType === 'event' && <label className="wide">具体事件<select value={config.eventType ?? (prof ? GROWTH_EVENT_TYPES[0] : 'spring')} onChange={event => set({ eventType: event.target.value })}>
            {events.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select></label>}
          {config.nodeType === 'special' && <label className="wide">具体奇遇<select value={config.specialId ?? ''} onChange={event => set({ specialId: event.target.value })}>
            <option value="">按种子随机三选一</option>{specials.map(reward => <option key={reward.id} value={reward.id}>{reward.label}</option>)}
          </select></label>}
          {config.nodeType === 'boss' && <label className="wide">首领<select value={config.bossId ?? ''} onChange={event => set({ bossId: event.target.value })}>
            <option value="">按幕次／层数生成</option>{Object.values(MONSTERS).filter(monster => monster.rank === 4 && !monster.id.startsWith('boss_minion')).map(monster => <option key={monster.id} value={monster.id}>{monster.name}</option>)}
          </select></label>}
          {config.nodeType === 'corrupted' && <><label>侵蚀效果<select value={config.corruptDebuff ?? 'spd'} onChange={event => set({ corruptDebuff: event.target.value as TestScenario['corruptDebuff'] })}>
            <option value="spd">速度-2</option><option value="dmg">受伤+2</option><option value="burn">每回合-2生命</option><option value="immune">敌人免疫负面效果</option></select></label>
            <label>侵蚀奖励<select value={config.corruptReward ?? 'gold'} onChange={event => set({ corruptReward: event.target.value as TestScenario['corruptReward'] })}><option value="gold">金币翻倍</option><option value="food">食物翻倍</option></select></label></>}
          {numberField('金币', 'gold', 0, 99999)}{numberField('每种食物／道具数量', 'itemCount', 0, 99)}
          {numberField('伙伴当前生命%', 'hpPercent', 1, 100)}{numberField('墓地伙伴数量', 'deadCount', 0, 3)}
          <label>队伍人数<input type="number" min={1} max={prof ? 5 : 8} value={config.partySize ?? (prof ? 3 : 6)} onChange={event => set({ partySize: Number(event.target.value) })} /></label>
        </div>
        <label className="test-setup-party"><input type="checkbox" checked={config.customParty} onChange={event => set({ customParty: event.target.checked })} />自选伙伴／敌人（战斗类可配置双方）</label>
        <p>同种子可复现随机结果；非战斗关也能自选伙伴。熟练度伙伴预置100成长点，可测试学习、强化与转移。</p>
      </section>
    </div>
    <footer><span>进入后可重置本关、重新选测试或退出。</span><button className="primary" onClick={() => dispatch({ type: 'TEST_TYPE_PICK', nodeType: config.nodeType,
      scenario: { ...config, eventType: config.nodeType === 'event' ? config.eventType ?? (prof ? GROWTH_EVENT_TYPES[0] : 'spring') : undefined } })}>
      {config.customParty ? '下一步：选择伙伴' : '进入测试'}
    </button></footer>
  </div>;
}

export function TestSessionFrame({ state, dispatch, children }: { state: GameState; dispatch: Dispatch<GameAction>; children: ReactNode }) {
  if (!state.testRun || state.screen.startsWith('test-') || state.screen === 'title') return <>{children}</>;
  return <div className="test-session-frame"><nav className="test-session-tools" aria-label="测试工具">
    <span>测试局 · 不保存</span><button disabled={!state.testSnapshot} onClick={() => dispatch({ type: 'TEST_REPLAY' })}>重置本关</button>
    <button onClick={() => dispatch({ type: 'DEBUG_CUSTOM_TEST' })}>重选测试</button><button onClick={() => dispatch({ type: 'TITLE' })}>退出测试</button>
  </nav><div className="test-session-content">{children}</div></div>;
}
