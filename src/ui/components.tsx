import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { SkillDef, StatusEffect, Unit } from '../game/types';
import { getSkill } from '../game/data/skills';

/** 技能数值简述：仅伤害/治疗数值，如 "5"、"3×2"（buff 效果数值不放这里，见 skillFullDesc） */
export function skillBrief(s: SkillDef): string {
  if (s.kind === 'attack') {
    return s.hits && s.hits > 1 ? `${s.damage}×${s.hits}` : String(s.damage);
  }
  if (s.kind === 'heal') return `+${s.heal}`;
  return '';
}

const EFFECT_ICON: Record<StatusEffect['kind'], string> = {
  burn: '🔥',
  poison: '☠️',
  atkUp: '⬆️',
  atkDown: '⬇️',
  stun: '💫',
  healTick: '✚',
};

function effectText(e: StatusEffect): string {
  const turns = e.turns > 0 ? `，持续 ${e.turns} 回合` : '';
  switch (e.kind) {
    case 'burn':
      return `灼烧 ${e.value}/回合${turns}`;
    case 'poison':
      return `中毒 ${e.value}/回合${turns}`;
    case 'atkUp':
      return `伤害 +${e.value}${turns}`;
    case 'atkDown':
      return `伤害 -${e.value}${turns}`;
    case 'stun':
      return `眩晕（跳过行动）${turns}`;
    case 'healTick':
      return `每回合回复 ${e.value}${turns}`;
  }
}

/** 技能完整描述：基础描述 + 具体 buff 效果数值，如 "攻击单个敌人，附加灼烧（灼烧 2/回合，持续 2 回合）" */
export function skillFullDesc(s: SkillDef): string {
  const effects = (s.effects ?? []).map(effectText).join('，');
  return effects ? `${s.desc}（${effects}）` : s.desc;
}

/** 技能标签：名称 + 效果图标（如 🔥）+ 伤害/治疗数值；desc 模式下追加展示完整描述 */
export function SkillTag({ skill, className = '', desc = false }: { skill: SkillDef; className?: string; desc?: boolean }) {
  const full = skillFullDesc(skill);
  const icons = (skill.effects ?? []).map((e) => EFFECT_ICON[e.kind]).join('');
  const brief = skillBrief(skill);
  const head = (
    <span className="skill-head">
      <span className="skill-name">{skill.name}</span>
      <span className="skill-right">
        {icons && <span className="skill-icons">{icons}</span>}
        {brief && <span className="skill-num">{brief}</span>}
      </span>
    </span>
  );
  if (desc) {
    return (
      <span className={`skill-line ${className}`} title={full}>
        {head}
        <span className="skill-desc">{full}</span>
      </span>
    );
  }
  return (
    <span className={`chip skill-tag ${className}`} title={full}>
      {head}
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
  /** 是否在卡片上展示每个技能的完整描述（队伍管理界面用） */
  showSkillDesc?: boolean;
  /** 是否把速度与生命值显示在图标和名字同行的最右侧（队伍管理界面用） */
  topStats?: boolean;
  /** 渲染在卡片底部的操作区（如队伍管理里的融合/释放按钮） */
  footer?: ReactNode;
}

export function UnitCard({ unit, className = '', onClick, showSkills = true, showSkillDesc = false, topStats = false, footer }: UnitCardProps) {
  const dead = unit.hp <= 0;
  return (
    <div
      className={`unit-card ${className} ${dead ? 'dead' : ''} ${onClick ? 'clickable' : ''} ${unit.isPlayer ? 'is-player' : ''}`}
      onClick={onClick}
    >
      <div className={`card-top ${topStats ? 'card-top-stats' : ''}`}>
        <span className="emoji">{unit.emoji}</span>
        {topStats && (
          <div className="card-stats">
            <div className="card-stat">⚡{unit.spd}</div>
          </div>
        )}
      </div>
      {!topStats && (
        <div>
          <div className="card-name">{unit.name}</div>
          <div className="card-sub">
            <span>⚡{unit.spd}</span>
          </div>
        </div>
      )}
      {topStats && (
        <div className="card-name-row">
          <div className="card-name">{unit.name}</div>
          <div className="card-hp">❤️ {unit.hp}/{unit.maxHp}</div>
        </div>
      )}
      <HpBar hp={unit.hp} maxHp={unit.maxHp} />
      <div className="card-sub">
        {!topStats && <span>{unit.hp}/{unit.maxHp}</span>}
        <StatusIcons unit={unit} />
        <BattleBuffIcons unit={unit} />
      </div>
      {showSkills && (
        <div className="skill-list">
          {unit.skills.map((sid) => (
            <SkillTag key={sid} skill={getSkill(sid)} desc={showSkillDesc} />
          ))}
        </div>
      )}
      {footer && <div className="unit-card-footer">{footer}</div>}
    </div>
  );
}

/** 单行横向拖拽滚动容器：内容超出时鼠标按住左右拖动，不换行 */
export function useDragScroll() {
  const ref = useRef<HTMLDivElement | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let down = false;
    let startX = 0;
    let startScroll = 0;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      down = true;
      suppressClick.current = false;
      startX = e.clientX;
      startScroll = el.scrollLeft;
      el.style.cursor = 'grabbing';
      el.style.userSelect = 'none';
    };
    const onMove = (e: MouseEvent) => {
      if (!down) return;
      el.scrollLeft = startScroll - (e.clientX - startX);
      if (el.scrollLeft !== startScroll) suppressClick.current = true;
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      el.style.cursor = '';
      el.style.userSelect = '';
    };
    const onClickCapture = (e: MouseEvent) => {
      if (suppressClick.current) {
        e.preventDefault();
        e.stopPropagation();
        suppressClick.current = false;
      }
    };
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    el.addEventListener('click', onClickCapture, true);
    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, []);
  return ref;
}

export function DragScrollRow({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useDragScroll();
  return (
    <div ref={ref} className={`drag-row ${className}`} style={style}>
      {children}
    </div>
  );
}
