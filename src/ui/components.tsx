import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { SkillDef, StatusEffect, Unit } from '../game/types';
import { getSkill } from '../game/data/skills';
import { getPassive } from '../game/data/passives';
import { CURSE_CN } from '../game/state/game';

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
  shield: '🛡️',
  taunt: '🫧',
  spdDown: '🕸️',
  thorns: '🌿',
  shieldCounter: '🛡️',
  thornSpikes: '🔱',
  rageThorn: '🔴',
  waterCurtain: '🌊',
  flameShield: '🔥',
  windSpd: '💨',
};

function effectText(e: StatusEffect): string {
  const turns = e.turns > 0 ? `，持续 ${e.turns} 回合` : '';
  switch (e.kind) {
    case 'burn':
      return `灼烧 ${e.value} 层`;
    case 'poison':
      return `中毒 ${e.value} 层`;
    case 'atkUp':
      return `伤害 +${e.value}${turns}`;
    case 'atkDown':
      return `伤害 -${e.value}${turns}`;
    case 'stun':
      return `眩晕（跳过行动）${turns}`;
    case 'healTick':
      return `每回合回复 ${e.value}${turns}`;
    case 'shield':
      return `护盾 ${e.value}${turns}`;
    case 'taunt':
      return `嘲讽${turns}`;
    case 'spdDown':
      return `速度 -${e.value}${turns}`;
    case 'thorns':
      return `荆棘反伤 ${e.value}${turns}`;
    case 'shieldCounter':
      return `盾反 ${e.value}${turns}`;
    case 'thornSpikes':
      return `复仇棘甲${turns}`;
    case 'rageThorn':
      return `怒棘 攻击+${e.value}${turns}`;
    case 'waterCurtain':
      return `水幕 受伤-${e.value}${turns}`;
    case 'flameShield':
      return `烈焰护盾 灼烧${e.value}层${turns}`;
    case 'windSpd':
      return `速度 +${e.value}${turns}`;
  }
}

/** 技能完整描述：定位标注 + 基础描述 + 具体 buff 效果数值，如 "【前排攻击】攻击单个敌人（灼烧 2/回合，持续 2 回合）" */
export function skillFullDesc(s: SkillDef): string {
  const effects = (s.effects ?? []).map(effectText).join('，');
  const base = s.desc;
  return effects ? `${base}（${effects}）` : base;
}

/** 技能标签：名称 + 效果图标（如 🔥）+ 伤害/治疗数值；desc 模式下追加展示完整描述 */
export function SkillTag({
  skill,
  className = '',
  desc = false,
  usesNote = false,
}: {
  skill: SkillDef;
  className?: string;
  desc?: boolean;
  /** 有次数限制的技能追加「每场限 N 次」标注（图鉴用） */
  usesNote?: boolean;
}) {
  const full = skillFullDesc(skill);
  const icons = (skill.effects ?? []).map((e) => EFFECT_ICON[e.kind]).join('');
  const brief = skillBrief(skill);
  const usesChip = usesNote && skill.uses !== undefined ? (
    <span className="skill-uses-note">每场限 {skill.uses} 次</span>
  ) : null;
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
        {usesChip}
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

const STATUS_ICON: Record<string, { icon: string; label: string }> = {
  burn: { icon: '🔥', label: '灼烧' },
  poison: { icon: '☠️', label: '中毒' },
  atkUp: { icon: '⬆️', label: '攻击提升' },
  atkDown: { icon: '⬇️', label: '攻击降低' },
  stun: { icon: '💫', label: '眩晕' },
  healTick: { icon: '💚', label: '持续治疗' },
  shield: { icon: '🛡️', label: '护盾' },
  taunt: { icon: '🫧', label: '嘲讽' },
  spdDown: { icon: '🕸️', label: '速度降低' },
  thorns: { icon: '🌿', label: '荆棘反伤' },
  shieldCounter: { icon: '🛡️', label: '盾反' },
  thornSpikes: { icon: '🔱', label: '复仇棘甲' },
  rageThorn: { icon: '🔴', label: '怒棘' },
  waterCurtain: { icon: '🌊', label: '水幕' },
  flameShield: { icon: '🟠', label: '烈焰护盾' },
  windSpd: { icon: '💨', label: '风羽' },
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
  const visible = unit.statuses.filter((s) => s.kind !== 'shield');
  if (visible.length === 0) return <span className="statuses" />;
  return (
    <span className="statuses">
      {visible.map((s, i) => {
        // 怒棘：专属红色圆点图标，显示层数
        if (s.kind === 'rageThorn') {
          return (
            <span key={i} title={`怒棘（攻击+${s.value}，反伤+${s.value}，剩余 ${s.turns} 回合）`}>
              🔴×{s.value}
            </span>
          );
        }
        // 水幕：专属水滴图标，显示减伤值
        if (s.kind === 'waterCurtain') {
          return (
            <span key={i} title={`水幕（受伤 -${s.value}，剩余 ${s.turns} 回合）`}>
              🌊-{s.value}
            </span>
          );
        }
        const meta = STATUS_ICON[s.kind];
        if (!meta) return null;
        const tip =
          s.kind === 'burn' || s.kind === 'poison'
            ? `${meta.label}（${s.value} 层，每回合结算一半）`
            : s.kind === 'windSpd'
            ? `${meta.label}（速度 +${s.value}，剩余 ${s.turns} 回合）`
            : `${meta.label}（剩余 ${s.turns} 回合）`;
        return (
          <span key={i} title={tip}>
            {meta.icon}
          </span>
        );
      })}
    </span>
  );
}

const BATTLE_BUFF_ICON: Record<string, { icon: string; label: string }> = {
  atkUp: { icon: '⚔️', label: '伤害 +1' },
  spdUp: { icon: '💨', label: '速度 +1' },
  atkDown: { icon: '🪄', label: '伤害 -1' },
  spdDown: { icon: '🕸️', label: '速度 -1' },
  skillSpd: { icon: '💨', label: '技能速度加成' },
};

export function PassiveBadge({ unit }: { unit: Unit }) {
  const p = getPassive(unit.passive);
  if (!p) return null;
  const stacks = unit.passiveSpdStacks ?? 0;
  const showStacks = stacks > 0 && (p.kind === 'spdOnHit' || p.kind === 'treeSpeedUp' || p.kind === 'spdOnAttack' || p.kind === 'speedBonus');
  return (
    <span className="passive-badge" title={`被动「${p.name}」：${p.desc}`}>
      💠{p.name}{showStacks ? ` ×${stacks}` : ''}
    </span>
  );
}

const CURSE_ICON: Record<string, { icon: string; tip: string }> = {
  hpDown: { icon: '💔', tip: '血脆（生命 -5）' },
  atkDown: { icon: '🪄', tip: '虚弱（伤害 -1）' },
  spdDown: { icon: '🕸️', tip: '迟缓（速度 -1）' },
};

export function CurseBadge({ unit }: { unit: Unit }) {
  if (!unit.curse) return null;
  const meta = CURSE_ICON[unit.curse];
  if (!meta) return null;
  return (
    <span className="curse-badge" title={meta.tip}>
      {meta.icon}{CURSE_CN[unit.curse]}
    </span>
  );
}

export function BattleBuffIcons({ unit }: { unit: Unit }) {
  const buffs = unit.battleBuffs;
  if (!buffs) return null;
  const entries = Object.entries(buffs).filter(([k, v]) => v && BATTLE_BUFF_ICON[k] && k !== 'skillSpd');
  if (entries.length === 0) return null;
  return (
    <span className="battle-buffs">
      {entries.map(([k, v]) => (
        <span key={k} title={k === 'skillSpd' ? `${BATTLE_BUFF_ICON[k].label} +${v}` : `${BATTLE_BUFF_ICON[k].label}（剩余 ${v} 回合）`}>
          {BATTLE_BUFF_ICON[k].icon}
          <sup>{k === 'skillSpd' ? `+${v}` : v}</sup>
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
  /** 动画期间覆盖有效速度（逐段递增，如受击加速每段+1） */
  speedOverride?: number;
}

export function UnitCard({ unit, className = '', onClick, small = false, showSkills = true, showSkillDesc = false, topStats = false, footer, speedOverride }: UnitCardProps) {
  const dead = unit.hp <= 0;
  // 计算有效速度（含临时 buff/debuff/被动）
  // 使用 unit.spd 作为基础（已包含被动/永久修改），再叠加临时 buff/debuff
  const buffSpd = (unit.battleBuffs?.spdUp ? 1 : 0) - (unit.battleBuffs?.spdDown ? 1 : 0);
  const skillSpd = unit.battleBuffs?.skillSpd ?? 0;
  const spdDownStatus = unit.statuses.find((s) => s.kind === 'spdDown');
  const statusSpd = spdDownStatus ? -spdDownStatus.value : 0;
  const windSpdStatus = unit.statuses.find((s) => s.kind === 'windSpd');
  const windSpd = windSpdStatus ? windSpdStatus.value : 0;
  const effectiveSpd = speedOverride ?? Math.max(1, unit.spd + buffSpd + skillSpd + statusSpd + windSpd);
  const totalDelta = buffSpd + skillSpd + statusSpd + windSpd;
  const spdColor = totalDelta > 0 ? 'var(--hp-good)' : totalDelta < 0 ? 'var(--hp-low)' : undefined;
  return (
    <div
      className={`unit-card ${small ? 'small' : ''} ${className} ${dead ? 'dead' : ''} ${onClick ? 'clickable' : ''} ${unit.isPlayer ? 'is-player' : ''}`}
      onClick={onClick}
    >
      <div className={`card-top ${topStats ? 'card-top-stats' : ''}`}>
        <span className="emoji">{unit.emoji}</span>
        {topStats && (
          <div className="card-stats">
            <div className="card-stat" style={spdColor ? { color: spdColor } : undefined}>
              {unit.shield > 0 && <span>🛡️{unit.shield} </span>}⚡{effectiveSpd}
            </div>
          </div>
        )}
      </div>
      {!topStats && (
        <div>
          <div className="card-name">{unit.name}</div>
          <div className="card-sub">
            {unit.shield > 0 && <span>🛡️{unit.shield} </span>}
            <span style={spdColor ? { color: spdColor } : undefined}>⚡{effectiveSpd}</span>
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
        <PassiveBadge unit={unit} />
        <CurseBadge unit={unit} />
        <BattleBuffIcons unit={unit} />
      </div>
      {showSkills && !small && (
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

const STATUS_DESC: Record<string, (v: number) => string> = {
  burn: (v) => `每回合受到 ${Math.ceil(v / 2)} 点灼烧伤害（${v} 层，向上进位）`,
  poison: (v) => `每回合受到 ${Math.ceil(v / 2)} 点中毒伤害（${v} 层，向上进位）`,
  atkUp: (v) => `技能伤害 +${v}`,
  atkDown: (v) => `技能伤害 -${v}`,
  stun: () => '跳过下次行动',
  healTick: (v) => `每回合恢复 ${v} 点生命`,
  shield: (v) => `吸收 ${v} 点伤害`,
  taunt: () => '被迫攻击嘲讽者',
  spdDown: (v) => `速度 -${v}`,
  thorns: (v) => `受击时反伤 ${v} 点`,
  shieldCounter: () => '受击时反击攻击者 + 降低攻击 + 清除护盾',
  thornSpikes: () => '受击时获得怒棘（攻击+1，可叠加）',
  rageThorn: (v) => `攻击 +${v}，荆棘之躯反伤 +${v}`,
  windSpd: () => '速度 +2',
  waterCurtain: (v) => `下回合受到伤害 -${v}`,
  flameShield: (v) => `受攻击时灼烧攻击者 ${v} 层`,
};

export function BuffDetailPanel({ unit }: { unit: Unit }) {
  const passive = getPassive(unit.passive);
  const buffs = unit.battleBuffs;
  const battleBuffEntries = buffs
    ? (Object.entries(buffs) as [string, number][]).filter(([k, v]) => v && k !== 'skillSpd')
    : [];
  const statuses = unit.statuses;
  const hasPassive = !!passive;
  const hasStatuses = statuses.length > 0;
  const hasBattleBuffs = battleBuffEntries.length > 0;

  // 计算被动当前层数/加成
  const passiveStacks = (() => {
    if (!passive) return null;
    if (passive.kind === 'speedBonus') {
      const skillSpd = buffs?.skillSpd ?? 0;
      return `+${skillSpd}`;
    }
    // 效果类被动不显示数值（lifeSpring/guard/regen/thorns/drain/damageCap 的 value 是内部阈值，非叠加层数）
    const noShowValue = ['lifeSpring', 'guard', 'regen', 'thorns', 'drain', 'damageCap', 'poisonBreak', 'ember_body'];
    if (noShowValue.includes(passive.kind)) return null;
    // 其他被动显示固定数值（如 hp+3, spd+1）
    return `${passive.value}`;
  })();

  if (!hasPassive && !hasStatuses && !hasBattleBuffs) return null;

  const battleBuffMeta: Record<string, { icon: string; label: string }> = {
    atkUp: { icon: '⚔️', label: '伤害加成' },
    spdUp: { icon: '💨', label: '速度加成' },
    atkDown: { icon: '🪄', label: '伤害降低' },
    spdDown: { icon: '🕸️', label: '速度降低' },
  };

  return (
    <div className="buff-detail-panel">
      <div className="buff-detail-title">
        {unit.emoji} {unit.name}
      </div>
      {hasPassive && (
        <div className="buff-section">
          <div className="buff-section-label">被动</div>
          <div className="buff-item">
            <span className="buff-icon">💠</span>
            <span className="buff-name">{passive.name}</span>
            <span className="buff-passive-value">{passiveStacks}</span>
          </div>
          <div className="buff-item">
            <span className="buff-desc">{passive.desc}</span>
          </div>
        </div>
      )}
      {hasStatuses && (
        <div className="buff-section">
          <div className="buff-section-label">状态</div>
          {statuses.map((s, i) => {
            const meta = STATUS_ICON[s.kind];
            if (!meta) return null;
            const descFn = STATUS_DESC[s.kind];
            const desc = descFn ? descFn(s.value) : '';
            const stacks = s.kind === 'burn' || s.kind === 'poison' || s.kind === 'rageThorn';
            return (
              <div key={i} className="buff-item">
                <span className="buff-icon">{meta.icon}</span>
                <span className="buff-name">{meta.label}{stacks && s.value > 1 ? ` ×${s.value}` : ''}</span>
                <span className="buff-turns">{s.kind !== 'shield' && s.turns > 0 ? `${s.turns}回合` : ''}</span>
                <span className="buff-desc">{desc}</span>
              </div>
            );
          })}
        </div>
      )}
      {hasBattleBuffs && (
        <div className="buff-section">
          <div className="buff-section-label">药水增益</div>
          {battleBuffEntries.map(([k, v]) => {
            const m = battleBuffMeta[k];
            if (!m) return null;
            return (
              <div key={k} className="buff-item">
                <span className="buff-icon">{m.icon}</span>
                <span className="buff-name">{m.label}</span>
                <span className="buff-turns">{v}回合</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
