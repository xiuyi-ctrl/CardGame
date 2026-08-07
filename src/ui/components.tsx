import type { Unit } from '../game/types';

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
}

export function UnitCard({ unit, className = '', onClick }: UnitCardProps) {
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
    </div>
  );
}
