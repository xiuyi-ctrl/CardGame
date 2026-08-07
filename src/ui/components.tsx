import type { SkillDef, Unit } from '../game/types';
import { getSkill } from '../game/data/skills';

/** 技能数值简述：伤害/治疗 + 附加效果，如 "5"、"3×2"、"6 · 🔥2/2R" */
export function skillBrief(s: SkillDef): string {
  const parts: string[] = [];
  if (s.kind === 'attack') {
    parts.push(s.hits && s.hits > 1 ? `${s.damage}×${s.hits}` : String(s.damage));
  } else if (s.kind === 'heal') {
    parts.push(`+${s.heal}`);
  }
  for (const e of s.effects ?? []) {
    const turns = e.turns > 0 ? `/${e.turns}R` : '';
    switch (e.kind) {
      case 'burn':
        parts.push(`🔥${e.value}${turns}`);
        break;
      case 'poison':
        parts.push(`☠️${e.value}${turns}`);
        break;
      case 'atkUp':
        parts.push(`⬆️+${e.value}${turns}`);
        break;
      case 'atkDown':
        parts.push(`⬇️-${e.value}${turns}`);
        break;
      case 'stun':
        parts.push(`💫${turns}`);
        break;
      case 'healTick':
        parts.push(`✚${e.value}${turns}`);
        break;
    }
  }
  return parts.join(' · ');
}

/** 技能标签：名称 + 伤害/效果，悬停显示完整描述 */
export function SkillTag({ skill, className = '' }: { skill: SkillDef; className?: string }) {
  const brief = skillBrief(skill);
  return (
    <span className={`chip skill-tag ${className}`} title={`${skill.desc}${brief ? `（${brief}）` : ''}`}>
      {skill.name}
      {brief && <span className="skill-num">{brief}</span>}
    </span>
  );
}

const STATUS_ICON: Record<string, string> = {
  burn: '🔥',
  poison: '☠️',
  atkUp: '⬆️',
  atkDown: '⬇️',
  stun: '💫',
};

export function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const cls = pct <= 25 ? 'low' : pct <= 60 ? 'mid' : '';
  return (
    <div className="hp-bar">
      <div className={`fill ${cls}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StatusIcons({ unit }: { unit: Unit }) {
  if (unit.statuses.length === 0) return <span className="statuses" />;
  return (
    <span className="statuses">
      {unit.statuses.map((s, i) => (
        <span key={i} title={s.kind}>
          {STATUS_ICON[s.kind]}
        </span>
      ))}
    </span>
  );
}

const BATTLE_BUFF_ICON: Record<string, { icon: string; label: string }> = {
  atkUp: { icon: '⚔️', label: '伤害 +1' },
  spdUp: { icon: '💨', label: '速度 +1' },
  atkDown: { icon: '🪄', label: '伤害 -1' },
  spdDown: { icon: '🕸️', label: '速度 -1' },
};

export function BattleBuffIcons({ unit }: { unit: Unit }) {
  const buffs = unit.battleBuffs;
  if (!buffs) return null;
  const entries = Object.entries(buffs).filter(([k, v]) => v && BATTLE_BUFF_ICON[k]);
  if (entries.length === 0) return null;
  return (
    <span className="battle-buffs">
      {entries.map(([k, v]) => (
        <span key={k} title={`${BATTLE_BUFF_ICON[k].label}（剩余 ${v} 回合）`}>
          {BATTLE_BUFF_ICON[k].icon}
          <sup>{v}</sup>
        </span>
      ))}
    </span>
  );
}

export interface UnitCardProps {
  unit: Unit;
  className?: string;
  onClick?: () => void;
  small?: boolean;
  /** 是否在卡片上列出技能（出阵的我方卡隐藏，见底部技能面板） */
  showSkills?: boolean;
}

export function UnitCard({ unit, className = '', onClick, showSkills = true }: UnitCardProps) {
  const dead = unit.hp <= 0;
  return (
    <div
      className={`unit-card ${className} ${dead ? 'dead' : ''} ${onClick ? 'clickable' : ''} ${unit.isPlayer ? 'is-player' : ''}`}
      onClick={onClick}
    >
      <div className="card-top">
        <span className="emoji">{unit.emoji}</span>
      </div>
      <div>
        <div className="card-name">{unit.name}</div>
        <div className="card-sub">
          <span>⚡{unit.spd}</span>
        </div>
      </div>
      <HpBar hp={unit.hp} maxHp={unit.maxHp} />
      <div className="card-sub">
        <span>
          {unit.hp}/{unit.maxHp}
        </span>
        <StatusIcons unit={unit} />
        <BattleBuffIcons unit={unit} />
      </div>
      {showSkills && (
        <div className="skill-list">
          {unit.skills.map((sid) => (
            <SkillTag key={sid} skill={getSkill(sid)} />
          ))}
        </div>
      )}
    </div>
  );
}
