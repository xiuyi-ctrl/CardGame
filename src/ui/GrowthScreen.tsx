import { useState } from 'react';
import type { Dispatch } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import type { Unit } from '../game/types';
import { getAllGrowthChoices, growthChoiceCost, applyGrowthChoice, getTransferFee, type GrowthChoice } from '../game/core/growth';
import { CampHeader } from './CampScreens';
import { FlowPet, FlowPetStats } from './MainFlowArt';
import { TrainingRoster } from './ProficiencyArt';
import { UiSymbol } from './UiSymbol';

export function GrowthScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTargetUid, setTransferTargetUid] = useState<string | null>(null);
  const [transferAmount, setTransferAmount] = useState(0);
  const [transferConfirm, setTransferConfirm] = useState(false);
  const selectedUnit = state.roster.find(unit => unit.uid === selectedUid);
  const pending = state.specialPending;
  const isShopPending = pending?.kind === 'shopGrantGrowthPoint' || pending?.kind === 'shopStatBoost' || pending?.kind === 'shopSlotUnlock' || pending?.kind === 'shopForget' || pending?.kind === 'legendSkill';
  const isBossNode = state.map.boss[state.currentNodeId] !== undefined;
  const available = selectedUnit?.growthPoints ?? 0;
  const fee = transferAmount > 0 ? getTransferFee(transferAmount) : 0;
  const target = state.roster.find(unit => unit.uid === transferTargetUid && unit.uid !== selectedUnit?.uid);
  const canTransfer = transferAmount > 0 && !!target && available >= transferAmount;
  const closeTransfer = () => { setShowTransfer(false); setTransferTargetUid(null); setTransferAmount(0); setTransferConfirm(false); };
  const handleGrowthChoice = (unit: Unit, choice: GrowthChoice) => {
    if (choice.kind === 'slot3' || choice.kind === 'slot4' || choice.kind === 'slot5') {
      dispatch({ type: 'PROF_SLOT_UNLOCK', uid: unit.uid, slot: choice.kind === 'slot3' ? 3 : choice.kind === 'slot4' ? 4 : 5 }); return;
    }
    if (choice.kind === 'reroll') { dispatch({ type: 'PROF_SKILL_REPLACE_START', uid: unit.uid }); return; }
    const updatedUnit = applyGrowthChoice(unit, choice);
    if (updatedUnit) {
      const label = choice.kind === 'hp' ? `生命 +${choice.amount}` : choice.kind === 'spd' ? `速度 +${choice.amount}` : '';
      setMessage(`${unit.name}：${label}`);
      dispatch({ type: 'PROF_GROWTH_APPLY', uid: unit.uid, updatedUnit });
      dispatch({ type: 'SHOW_TOAST', msg: `${unit.name} 获得 ${label}`, kind: 'success' });
    }
  };
  const hint = pending?.kind === 'shopGrantGrowthPoint' ? `选择一只宠物获得 ${pending.amount} 成长点`
    : pending?.kind === 'shopStatBoost' ? '选择一只宠物永久 +5 生命 或 +2 速度'
    : pending?.kind === 'shopSlotUnlock' ? '选择一只宠物解锁技能槽'
    : pending?.kind === 'shopForget' ? '选择一只宠物重置成长点'
    : pending?.kind === 'legendSkill' ? '选择一只宠物学习传奇技能'
    : '选择伙伴，消耗成长点提升能力';
  return <div className="flow-screen camp-screen training-growth-screen">
    <CampHeader title="成长点分配" subtitle={showTransfer ? '成长点转移 · 手续费50%，向上取整' : hint}
      onBack={!showTransfer && !isShopPending && !isBossNode ? () => dispatch({ type: 'BACK_TO_MAP' }) : undefined} />
    <main className={`training-growth-layout ${showTransfer ? 'has-transfer' : ''}`}>
      <TrainingRoster units={state.roster} selectedUid={selectedUid} disabled={showTransfer} onSelect={unit => {
        if (isShopPending) dispatch({ type: 'PROF_SHOP_EFFECT', uid: unit.uid }); else setSelectedUid(unit.uid);
      }} />
      <section className="flow-frame training-growth-detail"><h2>{selectedUnit ? `${selectedUnit.name} · 可用${available}点` : '选择成长伙伴'}</h2>
        <div className="camp-scroll training-growth-body">{selectedUnit ? <><FlowPet unit={selectedUnit} /><FlowPetStats unit={selectedUnit} />
          {message && <p className="training-growth-message" role="status">{message}</p>}
          {!isShopPending && <div className="training-growth-options">{getAllGrowthChoices(selectedUnit).map(choice => {
            const cost = growthChoiceCost(choice, selectedUnit.bonusStats?.hp ?? 0, selectedUnit.bonusStats?.spd ?? 0);
            const label = choice.kind === 'hp' ? `生命 +${choice.amount}` : choice.kind === 'spd' ? `速度 +${choice.amount}`
              : choice.kind === 'slot3' ? '解锁第3技能槽' : choice.kind === 'slot4' ? '解锁第4技能槽' : choice.kind === 'slot5' ? '解锁第5技能槽' : '替换技能';
            return <button type="button" key={choice.kind} disabled={showTransfer || available < cost} onClick={() => handleGrowthChoice(selectedUnit, choice)}>
              {choice.kind === 'hp' || choice.kind === 'spd' ? <i className={`starter-stat-icon ${choice.kind === 'hp' ? 'starter-stat-heart' : 'starter-stat-speed'}`} aria-hidden="true" /> : null}<strong>{label}</strong><span>消耗 {cost} 成长点</span>
            </button>;
          })}</div>}
        </> : <p>点击左侧伙伴查看成长选项</p>}</div>
        {selectedUnit && !isShopPending && <button type="button" disabled={showTransfer} onClick={() => setShowTransfer(true)}>成长点转移</button>}
      </section>
      {showTransfer && selectedUnit && <aside className="flow-frame training-transfer"><h2>成长点转移</h2><div className="camp-scroll training-transfer-body">
        <p>来源：{selectedUnit.name} · 可用 {available} 点</p><h3>选择接收伙伴</h3>
        <div className="training-transfer-targets">{state.roster.filter(unit => unit.uid !== selectedUnit.uid).map(unit => <button type="button" className={target?.uid === unit.uid ? 'is-selected' : ''} key={unit.uid} aria-pressed={target?.uid === unit.uid} onClick={() => setTransferTargetUid(unit.uid)}><FlowPet unit={unit} /><strong>{unit.name}</strong><span>当前 {unit.growthPoints ?? 0} 点</span></button>)}</div>
        {state.roster.length < 2 && <p>没有其他伙伴可接收成长点</p>}
        <label className="training-transfer-quantity">转移数量 <output>{transferAmount}</output><input aria-label="转移数量" type="range" min="0" max={Math.max(0, available)} disabled={available <= 0} value={transferAmount} onChange={event => setTransferAmount(Number(event.target.value))} /></label>
        <dl className="training-transfer-calc"><div><dt>来源扣除</dt><dd>{transferAmount} 点</dd></div><div><dt>手续费</dt><dd>{fee} 点</dd></div><div><dt>{target?.name ?? '目标'}获得</dt><dd>{transferAmount - fee} 点</dd></div></dl>
        <p>手续费50%，向上取整，已包含在来源扣除中</p>
      </div><footer><button type="button" className="flow-primary" disabled={!canTransfer} onClick={() => setTransferConfirm(true)}>确认转移</button><button type="button" onClick={closeTransfer}>返回</button></footer></aside>}
    </main>
    <footer className="flow-frame training-growth-footer">{showTransfer ? <p>转移过程中不能更换来源伙伴或分配成长点</p> : isShopPending
      ? <button type="button" onClick={() => dispatch({ type: 'CANCEL_GROWTH_ITEM' })}>取消使用</button>
      : isBossNode ? <button type="button" className="flow-primary" onClick={() => dispatch({ type: 'NEXT_NODE' })}>继续前进 <UiSymbol name="arrow-right" /></button>
      : <p>每位伙伴独立持有成长点</p>}</footer>
    {transferConfirm && selectedUnit && target && <div className="growth-modal-overlay" onClick={() => setTransferConfirm(false)}><div className="growth-modal" onClick={event => event.stopPropagation()}>
      <h3>确认转移</h3><div className="growth-modal-content"><p>从 {selectedUnit.name} 转移 {transferAmount} 点成长点</p><p>手续费：{fee} 点</p><p>{target.name} 实际获得：{transferAmount - fee} 点</p></div><div className="growth-modal-actions">
        <button type="button" className="primary btn" onClick={() => { dispatch({ type: 'PROF_TRANSFER_GROWTH', sourceUid: selectedUnit.uid, targetUid: target.uid, amount: transferAmount }); closeTransfer(); }}>确认</button>
        <button type="button" className="btn" onClick={() => setTransferConfirm(false)}>取消</button>
      </div></div></div>}
  </div>;
}
