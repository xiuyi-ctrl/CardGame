import { useState, type Dispatch } from 'react';
import type { Unit } from '../game/types';
import type { GameAction } from '../game/state/reducer';
import { useBackAction } from './mobile';
import './testBattleEditor.css';

export function TestBattleEditor({ units, dispatch, onClose }: { units: Unit[]; dispatch: Dispatch<GameAction>; onClose: () => void }) {
  const [uid, setUid] = useState(units.find(unit => unit.hp > 0)?.uid ?? '');
  const unit = units.find(candidate => candidate.uid === uid);
  useBackAction(true, onClose, 100);
  return <div className="mobile-system-overlay test-battle-overlay" onClick={onClose}>
    <section className="test-battle-dialog" role="dialog" aria-modal="true" aria-label="调整测试生物数值" onClick={event => event.stopPropagation()}>
      <header><h2>调整测试生物数值</h2><button onClick={onClose}>关闭</button></header>
      <div className="test-battle-body"><div className="test-battle-units" role="group" aria-label="选择调整对象">{units.filter(pet => pet.hp > 0).map(pet =>
        <button key={pet.uid} aria-pressed={uid === pet.uid} onClick={() => setUid(pet.uid)}>{pet.isPlayer ? '我方' : '敌方'} · {pet.name}<small>{pet.row === 'front' ? '前排' : '后排'}{pet.column + 1} · {pet.hp}/{pet.maxHp}</small></button>)}</div>
        {unit && <TestBattleForm key={unit.uid} unit={unit} dispatch={dispatch} onClose={onClose} />}
      </div>
    </section>
  </div>;
}

function TestBattleForm({ unit, dispatch, onClose }: { unit: Unit; dispatch: Dispatch<GameAction>; onClose: () => void }) {
  const [values, setValues] = useState({ hp: String(unit.hp), maxHp: String(unit.maxHp), spd: String(unit.spd), shield: String(unit.shield) });
  const stats = { hp: Number(values.hp), maxHp: Number(values.maxHp), spd: Number(values.spd), shield: Number(values.shield) };
  const valid = Object.values(values).every(value => value.trim() !== '') && Object.values(stats).every(Number.isSafeInteger)
    && stats.hp >= 1 && stats.maxHp >= stats.hp && stats.spd >= 1 && stats.shield >= 0;
  return <form className="test-battle-form" onSubmit={event => { event.preventDefault(); if (!valid) return;
    dispatch({ type: 'TEST_BATTLE_EDIT_UNIT', uid: unit.uid, ...stats }); onClose(); }}>
    <div className="test-battle-fields">{([['hp', '当前生命'], ['maxHp', '最大生命'], ['spd', '基础速度'], ['shield', '护盾']] as const).map(([key, label]) =>
      <label key={key}>{label}<input type="number" inputMode="numeric" min={key === 'shield' ? 0 : 1} step={1} value={values[key]} onChange={event => setValues({ ...values, [key]: event.target.value })} /></label>)}</div>
    <p>仅修改当前测试战斗，不消耗行动。生命、速度须为正整数，护盾可为0，当前生命不能超过最大生命。</p>
    <footer><button type="button" onClick={onClose}>取消</button><button type="submit" disabled={!valid}>应用修改</button></footer>
  </form>;
}
