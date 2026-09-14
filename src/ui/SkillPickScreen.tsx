/**
 * 技能选择界面
 * - 解锁技能槽模式：从3个新技能中选1个追加
 * - 替换技能模式：先选要替换的技能，再从3个新技能中选1个替换
 */
import type { Dispatch } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { getSkill } from '../game/data/skills';
import { SkillTag } from './components';

interface Props {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}

export function SkillPickScreen({ state, dispatch }: Props) {
  const { skillPick, skillReplace } = state;

  // 替换技能模式
  if (skillReplace) {
    const unit = state.roster.find((u) => u.uid === skillReplace.uid);
    if (!unit) return null;
    const replaceIdx = skillReplace.replaceIdx;

    // 第一步：选择要替换的技能（replaceIdx === -1）
    if (replaceIdx === -1) {
      return (
        <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 24 }}>
          <h2>🔄 替换技能 — 为 {unit.name} 选择要替换的技能</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>点击选择要替换的技能（替换后不可撤销）：</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            {unit.skills.map((skillId, idx) => {
              const sk = getSkill(skillId);
              return (
                <div
                  key={`${skillId}-${idx}`}
                  className="unit-card clickable"
                  style={{ minWidth: 140, cursor: 'pointer', textAlign: 'center', padding: 12 }}
                  onClick={() => dispatch({ type: 'PROF_SKILL_REPLACE_SELECT', replaceIdx: idx })}
                >
                  <div style={{ fontSize: 16, marginBottom: 4, fontWeight: 'bold' }}>{sk.name}</div>
                  <SkillTag skill={sk} />
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{sk.desc}</div>
                </div>
              );
            })}
          </div>
          <button className="btn" onClick={() => dispatch({ type: 'PROF_SLOT_CANCEL' })}>
            取消
          </button>
        </div>
      );
    }

    // 第二步：从新技能中选1个替换
    return (
      <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 24 }}>
        <h2>🔄 替换技能 — 选择新技能</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          将「{getSkill(unit.skills[replaceIdx])?.name}」替换为以下技能之一：
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          {skillReplace.choices.map((skillId) => {
            const sk = getSkill(skillId);
            return (
              <div
                key={skillId}
                className="unit-card clickable"
                style={{ minWidth: 160, cursor: 'pointer', textAlign: 'center', padding: 12 }}
                onClick={() => dispatch({ type: 'PROF_SLOT_PICK', skillId })}
              >
                <div style={{ fontSize: 18, marginBottom: 4, fontWeight: 'bold' }}>{sk.name}</div>
                <SkillTag skill={sk} />
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{sk.desc}</div>
              </div>
            );
          })}
        </div>
        <button className="btn" onClick={() => dispatch({ type: 'PROF_SLOT_CANCEL' })}>
          取消
        </button>
      </div>
    );
  }

  // 技能槽解锁模式（原有逻辑）
  if (!skillPick) return null;
  const unit = state.roster.find((u) => u.uid === skillPick.uid);
  if (!unit) return null;

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 24 }}>
      <h2>🔓 解锁技能槽 — 为 {unit.name} 选择新技能</h2>
      <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>解锁了第 {skillPick.slot} 技能槽，从以下 3 个技能中选择 1 个：</p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        {skillPick.choices.map((skillId) => {
          const sk = getSkill(skillId);
          return (
            <div
              key={skillId}
              className="unit-card clickable"
              style={{ minWidth: 160, cursor: 'pointer', textAlign: 'center', padding: 12 }}
              onClick={() => dispatch({ type: 'PROF_SLOT_PICK', skillId })}
            >
              <div style={{ fontSize: 18, marginBottom: 4, fontWeight: 'bold' }}>{sk.name}</div>
              <SkillTag skill={sk} />
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{sk.desc}</div>
            </div>
          );
        })}
      </div>
      <button className="btn" onClick={() => dispatch({ type: 'PROF_SLOT_CANCEL' })}>
        取消（不解锁）
      </button>
    </div>
  );
}
