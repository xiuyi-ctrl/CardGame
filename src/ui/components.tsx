import type { CSSProperties } from 'react';
import type { ElementType, Unit } from '../game/types';
import { ELEMENT_ORDER } from '../game/core/battle';

export const ELEMENT_COLOR: Record<ElementType, string> = {
  fire: 'var(--fire)',
  nature: 'var(--nature)',
  water: 'var(--water)',
  shadow: 'var(--shadow)',
  metal: 'var(--metal)',
};

export const ELEMENT_CN: Record<ElementType, string> = {
  fire: '火',
  nature: '木',
  water: '水',
  shadow: '暗',
  metal: '金',
};

export function elementStyle(e: ElementType): CSSProperties {
  return { borderColor: ELEMENT_COLOR[e], color: ELEMENT_COLOR[e] };
}

const STATUS_ICON: Record<string, string> = {
  burn: '🔥',
  poison: '☠️',
  atkUp: '⬆️',
  atkDown: '⬇️',
  stun: '💫',
  healTick: '✚',
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

export interface UnitCardProps {
  unit: Unit;
  className?: string;
  onClick?: () => void;
  small?: boolean;
}

export function UnitCard({ unit, className = '', onClick }: UnitCardProps) {
  const dead = unit.hp <= 0;
  const st = elementStyle(unit.element);
  return (
    <div
      className={`unit-card ${className} ${dead ? 'dead' : ''} ${onClick ? 'clickable' : ''} ${unit.isPlayer ? 'is-player' : ''}`}
      style={dead ? undefined : st}
      onClick={onClick}
    >
      <div className="card-top">
        <span className="emoji">{unit.emoji}</span>
        <span className="elem" style={st}>
          {ELEMENT_CN[unit.element]}
        </span>
      </div>
      <div>
        <div className="card-name">{unit.name}</div>
        <div className="card-sub">
          <span>Lv.{unit.level}</span>
          <span>⚔{unit.atk}</span>
          <span>⚡{Math.round(unit.spd * 10) / 10}</span>
        </div>
      </div>
      <HpBar hp={unit.hp} maxHp={unit.maxHp} />
      <div className="card-sub">
        <span>
          {unit.hp}/{unit.maxHp}
        </span>
        <StatusIcons unit={unit} />
      </div>
    </div>
  );
}

export function elementWheel() {
  return ELEMENT_ORDER.map((e) => `${ELEMENT_CN[e]}`).join(' › ');
}
