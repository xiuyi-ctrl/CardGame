import { useState, type Dispatch } from 'react';
import type { BattleState, TestSkillOverride, Unit } from '../game/types';
import { getSkill } from '../game/data/skills';
import { getBattleSkill, testSkillEditable, testEffectTurnsEditable, testEffectValueEditable, validTestSkillOverride } from '../game/data/test-skill-overrides';
import { STATUS_ART } from './BuffIcon';
import type { GameAction } from '../game/state/reducer';
import { useBackAction } from './mobile';
import './testBattleEditor.css';

export function TestBattleEditor({ units, battle, dispatch, onClose }: { units: Unit[]; battle?: BattleState; dispatch: Dispatch<GameAction>; onClose: () => void }) {
  const [uid, setUid] = useState(units.find(unit => unit.hp > 0)?.uid ?? '');
  const [mode, setMode] = useState<'unit' | 'skill'>('unit');
  const skillIds = [...new Set([...units, ...(battle?.playerBench ?? []), ...(battle?.enemyBench ?? [])].flatMap(unit => unit.skills))].filter(id => id !== 'mirror_copy');
  const [skillId, setSkillId] = useState(skillIds[0] ?? '');
  const unit = units.find(candidate => candidate.uid === uid);
  const title = mode === 'unit' ? '调整测试生物数值' : '调整测试技能数值';
  useBackAction(true, onClose, 100);
  return <div className="mobile-system-overlay test-battle-overlay" onClick={onClose}>
    <section className="test-battle-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}>
      <header><h2>{title}</h2><nav className="test-battle-tabs" aria-label="调整类型"><button aria-pressed={mode === 'unit'} onClick={() => setMode('unit')}>生物数值</button><button aria-pressed={mode === 'skill'} onClick={() => setMode('skill')}>技能数值</button></nav><button onClick={onClose}>关闭</button></header>
      <div className="test-battle-body"><div className="test-battle-units" role="group" aria-label={mode === 'unit' ? '选择调整对象' : '选择调整技能'}>{mode === 'unit' ? units.filter(pet => pet.hp > 0).map(pet =>
        <button key={pet.uid} aria-pressed={uid === pet.uid} onClick={() => setUid(pet.uid)}>{pet.isPlayer ? '我方' : '敌方'} · {pet.name}<small>{pet.row === 'front' ? '前排' : '后排'}{pet.column + 1} · {pet.hp}/{pet.maxHp}</small></button>) : skillIds.map(id => <button key={id} aria-pressed={skillId === id} onClick={() => setSkillId(id)}>{getSkill(id).name}<small>{battle?.testSkillOverrides?.[id] ? '已调整 · 本场全部同名技能' : '本场全部同名技能'}</small></button>)}</div>
        {mode === 'unit' && unit && <TestBattleForm key={unit.uid} unit={unit} dispatch={dispatch} onClose={onClose} />}
        {mode === 'skill' && skillId && <TestSkillForm key={skillId} skillId={skillId} battle={battle} dispatch={dispatch} onClose={onClose} />}
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


function TestSkillForm({ skillId, battle, dispatch, onClose }: { skillId: string; battle?: BattleState; dispatch: Dispatch<GameAction>; onClose: () => void }) {
  const base = getSkill(skillId), skill = getBattleSkill(battle, skillId), editable = testSkillEditable(base);
  const [values, setValues] = useState({ damage: String(skill.damage ?? 0), heal: String(skill.heal ?? 0), hits: String(skill.hits ?? 1), cooldown: String(skill.cooldown ?? 0), uses: String(skill.uses ?? 0) });
  const [effects, setEffects] = useState((skill.effects ?? []).map(effect => ({ kind: effect.kind, value: String(effect.value), turns: String(effect.turns) })));
  const fields = ([['damage', '基础伤害', 1, 999], ['heal', '基础治疗', 1, 999], ['hits', '基础段数', 1, 20], ['cooldown', '冷却回合', 0, 99], ['uses', '每场次数（0为不限）', 0, 99]] as const).filter(([key]) => editable[key]);
  const patch: TestSkillOverride = {};
  for (const [key] of fields) {
    const original = base[key] ?? (key === 'hits' ? 1 : 0);
    if (Number(values[key]) !== original) patch[key] = Number(values[key]);
  }
  if (editable.effects && effects.some((effect, i) => Number(effect.value) !== base.effects![i].value || Number(effect.turns) !== base.effects![i].turns)) {
    patch.effects = effects.map(effect => ({ kind: effect.kind, value: Number(effect.value), turns: Number(effect.turns) }));
  }
  const valid = (fields.length > 0 || editable.effects) && fields.every(([key, , min, max]) => values[key].trim() !== '' && Number.isSafeInteger(Number(values[key])) && Number(values[key]) >= min && Number(values[key]) <= max)
    && (!editable.effects || effects.every(effect => effect.value.trim() !== '' && effect.turns.trim() !== ''))
    && (!Object.keys(patch).length || validTestSkillOverride(base, patch));
  const submit = (values: TestSkillOverride | null) => { dispatch({ type: 'TEST_BATTLE_EDIT_SKILL', skillId, values }); onClose(); };
  return <form className="test-battle-form test-skill-form" aria-label="技能测试数值" onSubmit={event => { event.preventDefault(); if (valid) submit(Object.keys(patch).length ? patch : null); }}>
    <div className="test-skill-content">
      <p className="test-skill-name">{skill.name} · 修改基础值，原强化及条件加成继续生效</p>
      {!fields.length && !editable.effects && <p>该技能的专属机制暂未接入数值编辑。</p>}
      <div className="test-battle-fields">{fields.map(([key, label, min, max]) => <label key={key}>{label}<input type="number" inputMode="numeric" min={min} max={max} step={1} value={values[key]} onChange={event => setValues({ ...values, [key]: event.target.value })} /></label>)}
        {editable.effects && effects.flatMap((effect, i) => ([['value', '效果值', testEffectValueEditable(effect.kind)], ['turns', '持续回合', testEffectTurnsEditable(effect.kind)]] as const).filter(([, , allowed]) => allowed).map(([key, label]) =>
          <label key={`${i}-${key}`}>{STATUS_ART[effect.kind][0]}{label}<input type="number" inputMode="numeric" min={key === 'value' ? 1 : 0} max={99} step={1} value={effect[key]} onChange={event => setEffects(effects.map((entry, index) => index === i ? { ...entry, [key]: event.target.value } : entry))} /></label>))}
      </div>
      <p>仅本场测试生效，敌我同名技能一起修改。修改次数会重置本场该技能的剩余次数；修改冷却会清除当前冷却。已施加状态不追溯改变。</p>
      <p>只显示已接入的参数。特殊机制常量、目标范围、状态种类与原有叠层上限保持原规则；灼烧／中毒按层数衰减，护盾不设置持续回合。</p>
      <details><summary>查看原技能机制</summary><p>{base.desc}</p></details>
    </div>
    <footer><button type="button" onClick={() => submit(null)} disabled={!battle?.testSkillOverrides?.[skillId]}>恢复原值</button><button type="button" onClick={onClose}>取消</button><button type="submit" disabled={!valid}>应用修改</button></footer>
  </form>;
}
