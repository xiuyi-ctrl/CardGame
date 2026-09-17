import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { SkillDef, StatusEffect, Unit } from '../game/types';
import { getSkill } from '../game/data/skills';
import { getPassive } from '../game/data/passives';
import { getSkillEnhanceBonus } from '../game/core/growth';
import { CURSE_CN } from '../game/state/game';

/** 技能数值简述：仅伤害/治疗/buff效果数值，如 "5"、"3×2"、"🛡7" */
export function skillBrief(s: SkillDef, enhanced: number = 0): string {
  const bonus = getSkillEnhanceBonus(s.id, enhanced);
  if (s.kind === 'attack') {
    const dmg = (s.damage ?? 0) + bonus.damageBonus;
    const hits = (s.hits ?? 1) + bonus.hitsBonus;
    return hits > 1 ? `${dmg}×${hits}` : String(dmg);
  }
  if (s.kind === 'heal') return `+${(s.heal ?? 0) + bonus.healBonus}`;
  if (s.kind === 'buff') {
    const shieldEffect = s.effects?.find(e => e.kind === 'shield');
    if (shieldEffect) {
      const val = shieldEffect.value + bonus.effectBonus;
      return `🛡${val}`;
    }
  }
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
  comboBoost: '✖️',
  shadowMark: '🌑',
  sporeShield: '🍄',
  toxicBurstReady: '💀',
  chainLink: '🔗',
  skillSeal: '🔒',
  skillSealPending: '⏳',
  fear: '😱',
};

function effectText(e: StatusEffect): string {
  const turns = e.turns > 0 ? `，持续 ${e.turns} 回合` : '';
  switch (e.kind) {
    case 'burn':
      return `灼烧 ${e.value} 层`;
    case 'poison':
      return `中毒 ${e.value} 层`;
    case 'atkUp':
      return `伤害 +${e.value}${e.turns === 0 ? '（本回合）' : turns}`;
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
    case 'comboBoost':
      return `连击 +${e.value}${turns}`;
    case 'shadowMark':
      return `暗影印记 受伤+${e.value}${turns}`;
    case 'sporeShield':
      return `孢子防护 受伤-${e.value}${turns}`;
    case 'toxicBurstReady':
      return `毒性爆发蓄力中（死亡时触发全体爆发）`;
    case 'chainLink':
      return `锁链连接 传导${e.value}%${turns}`;
    case 'skillSeal':
      if (e.sealedSkills && e.sealedSkills.length > 0) {
        const names = e.sealedSkills.map((s) => getSkill(s)?.name ?? s).join('、');
        return `技能封印：${names}${turns}`;
      }
      return `技能封印 封印${e.value}个技能${turns}`;
    case 'skillSealPending':
      if (e.sealedSkills && e.sealedSkills.length > 0) {
        const names = e.sealedSkills.map((s) => getSkill(s)?.name ?? s).join('、');
        return `封印即将生效：${names}${turns}`;
      }
      return `封印即将生效 封印${e.value}个技能${turns}`;
    case 'fear':
      return `恐惧 ${e.value} 层`;
  }
}

/** 计算效果值的正确加成：buff+shield 技能中非 shield 效果只加 level×1 */
function getDescEffectBonus(s: SkillDef, effectBonus: number, enhanced: number, kind: string): number {
  const isBuffShield = s.kind === 'buff' && s.effects?.some(e => e.kind === 'shield');
  if (isBuffShield && kind !== 'shield') return enhanced; // level×1
  return effectBonus;
}

/** 技能完整描述：定位标注 + 基础描述 + 具体 buff 效果数值，如 "【前排攻击】攻击单个敌人（灼烧 2/回合，持续 2 回合）" */
export function skillFullDesc(s: SkillDef, enhanced: number = 0): string {
  const bonus = getSkillEnhanceBonus(s.id, enhanced);
  let desc = s.desc;

  // 连击类：替换命中次数（"两次"→"三次"、"两个"→"三个"，不替换"每场限N次"）
  if (bonus.hitsBonus > 0) {
    const hits = (s.hits ?? 1) + bonus.hitsBonus;
    const hitsCn = ['零', '一', '二', '三', '四', '五', '六'][hits] ?? String(hits);
    desc = desc.replace(/([两三四五六七八九])[次个]/g, () => `${hitsCn}次`);
  }

  // 治疗值替换（攻击+治疗混合技能，如潮涌重击、水波冲击）
  if (bonus.healBonus > 0 && s.heal) {
    const newHeal = s.heal + bonus.healBonus;
    desc = desc.replace(new RegExp(`(${s.heal})\\s*点生命`), `${newHeal}点生命`);
    desc = desc.replace(new RegExp(`回复(\\d+)点`), `回复${newHeal}点`);
    desc = desc.replace(new RegExp(`恢复自身(\\d+)点`), `恢复自身${newHeal}点`);
  }
  // 孢子防护回血特殊处理（heal 不在 skill 定义中）
  if (s.id === 'spore_shield' && enhanced > 0) {
    desc = desc.replace(/回复8点/, `回复${8 + enhanced}点`);
  }

  // 效果值替换
  const eff = (kind: string) => getDescEffectBonus(s, bonus.effectBonus, enhanced, kind);
  // 护盾（含"N护盾"无前缀模式，如铸甲）
  const shieldEffect = s.effects?.find(e => e.kind === 'shield');
  if (shieldEffect) {
    const nv = shieldEffect.value + eff('shield');
    desc = desc.replace(/(\d+)\s*层护盾/g, `${nv}层护盾`);
    desc = desc.replace(/(\d+)\s*点护盾/g, `${nv}点护盾`);
    desc = desc.replace(/(\d+)护盾/g, `${nv}护盾`);
  }
  // 灼烧/中毒/恐惧
  const dotEffect = s.effects?.find(e => e.kind === 'burn' || e.kind === 'poison' || e.kind === 'fear');
  if (dotEffect) {
    const nv = dotEffect.value + eff(dotEffect.kind);
    desc = desc.replace(new RegExp(`(${dotEffect.value})\\s*层`, 'g'), `${nv}层`);
  }
  // 降攻/减速
  const debuffEffect = s.effects?.find(e => e.kind === 'atkDown' || e.kind === 'spdDown');
  if (debuffEffect) {
    const nv = debuffEffect.value + eff(debuffEffect.kind);
    desc = desc.replace(new RegExp(`${debuffEffect.value}层`, 'g'), `${nv}层`);
  }
  // 荆棘反伤
  const thornsEffect = s.effects?.find(e => e.kind === 'thorns');
  if (thornsEffect) {
    const nv = thornsEffect.value + eff('thorns');
    desc = desc.replace(new RegExp(`反伤${thornsEffect.value}`), `反伤${nv}`);
  }
  // 盾反击伤
  const shieldCounterEffect = s.effects?.find(e => e.kind === 'shieldCounter');
  if (shieldCounterEffect) {
    const nv = shieldCounterEffect.value + eff('shieldCounter');
    desc = desc.replace(new RegExp(`反击敌人${shieldCounterEffect.value}`), `反击敌人${nv}`);
  }
  // 烈焰护盾灼烧
  const flameShieldEffect = s.effects?.find(e => e.kind === 'flameShield');
  if (flameShieldEffect) {
    const nv = flameShieldEffect.value + eff('flameShield');
    desc = desc.replace(new RegExp(`灼烧攻击者\\s*${flameShieldEffect.value}\\s*层`), `灼烧攻击者 ${nv} 层`);
  }
  // 速度增益
  const windSpdEffect = s.effects?.find(e => e.kind === 'windSpd');
  if (windSpdEffect) {
    const nv = windSpdEffect.value + eff('windSpd');
    desc = desc.replace(new RegExp(`${windSpdEffect.value}\\s*点速度`), `${nv}点速度`);
  }
  // 暗影印记
  const shadowMarkEffect = s.effects?.find(e => e.kind === 'shadowMark');
  if (shadowMarkEffect) {
    const nv = shadowMarkEffect.value + eff('shadowMark');
    desc = desc.replace(new RegExp(`受伤\\+${shadowMarkEffect.value}`), `受伤+${nv}`);
  }
  // 孢子防护减伤
  const sporeShieldEffect = s.effects?.find(e => e.kind === 'sporeShield');
  if (sporeShieldEffect) {
    const nv = sporeShieldEffect.value + eff('sporeShield');
    desc = desc.replace(new RegExp(`伤害-${sporeShieldEffect.value}`), `伤害-${nv}`);
  }
  // 波光环连击段数
  const comboBoostEffect = s.effects?.find(e => e.kind === 'comboBoost');
  if (comboBoostEffect) {
    const nv = comboBoostEffect.value + eff('comboBoost');
    desc = desc.replace(new RegExp(`段数\\+${comboBoostEffect.value}`), `段数+${nv}`);
  }
  // 复仇棘甲怒棘
  const thornSpikesEffect = s.effects?.find(e => e.kind === 'thornSpikes');
  if (thornSpikesEffect) {
    const nv = thornSpikesEffect.value + eff('thornSpikes');
    desc = desc.replace(new RegExp(`攻击\\+${thornSpikesEffect.value}`), `攻击+${nv}`);
    desc = desc.replace(new RegExp(`反伤\\+${thornSpikesEffect.value}`), `反伤+${nv}`);
  }
  // 水幕减伤
  const waterCurtainEffect = s.effects?.find(e => e.kind === 'waterCurtain');
  if (waterCurtainEffect) {
    const nv = waterCurtainEffect.value + eff('waterCurtain');
    desc = desc.replace(new RegExp(`受伤\\s*-${waterCurtainEffect.value}`), `受伤 -${nv}`);
  }

  // hideEffects 技能：直接返回替换后的描述
  if (s.hideEffects) return desc;

  // 非 hideEffects 技能：追加 effects 文本（原有逻辑）
  const effects = (s.effects ?? []).map((e) => {
    const eb = eff(e.kind);
    const adjusted = eb > 0 ? { ...e, value: e.value + eb } : e;
    return effectText(adjusted);
  }).join('，');
  return effects ? `${desc}（${effects}）` : desc;
}

/** 技能标签：名称 + 效果图标（如 🔥）+ 伤害/治疗数值；desc 模式下追加展示完整描述 */
export function SkillTag({
  skill,
  className = '',
  desc = false,
  usesNote = false,
  enhanced = 0,
}: {
  skill: SkillDef;
  className?: string;
  desc?: boolean;
  /** 有次数限制的技能追加「每场限 N 次」标注（图鉴用） */
  usesNote?: boolean;
  /** 强化等级 0-3，>=1 时技能名右侧显示金色加号 */
  enhanced?: number;
}) {
  const full = skillFullDesc(skill, enhanced);
  const icons = (skill.effects ?? []).map((e) => EFFECT_ICON[e.kind]).join('');
  const brief = skillBrief(skill, enhanced);
  const usesChip = usesNote && skill.uses !== undefined ? (
    <span className="skill-uses-note">每场限 {skill.uses} 次</span>
  ) : null;
  const enhanceLabel = enhanced >= 3 ? '+++' : enhanced === 2 ? '++' : enhanced === 1 ? '+' : '';
  const head = (
    <span className="skill-head">
      <span className="skill-name">{skill.name}{enhanceLabel && <span style={{ color: '#e8c26a', marginLeft: 2 }}>{enhanceLabel}</span>}</span>
      <span className="skill-right">
        {icons && <span className="skill-icons">{icons}</span>}
        {brief && <span className="skill-num" style={enhanced > 0 ? { color: '#e8c26a' } : undefined}>{brief}</span>}
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
  comboBoost: { icon: '✖️', label: '连击段数' },
  shadowMark: { icon: '🌑', label: '暗影印记' },
  sporeShield: { icon: '🍄', label: '孢子防护' },
  toxicBurstReady: { icon: '💀', label: '毒性爆发蓄力' },
  chainLink: { icon: '🔗', label: '锁链连接' },
  skillSealPending: { icon: '⏳', label: '封印即将生效' },
  fear: { icon: '😱', label: '恐惧' },
};

/** 内联宠物图标：有 image 时显示小图，否则显示 emoji */
export function PetIcon({ image, emoji, name, className = '' }: { image?: string; emoji: string; name: string; className?: string }) {
  return image
    ? <img src={image} className={`pet-icon-inline ${className}`} alt={name} />
    : <>{emoji}</>;
}

export function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
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
            : s.kind === 'fear'
            ? `${meta.label}（${s.value} 层，≥3层受伤+1，≥6层震慑）`
            : s.kind === 'windSpd'
            ? `${meta.label}（速度 +${s.value}，剩余 ${s.turns} 回合）`
            : `${meta.label}（剩余 ${s.turns} 回合）`;
        return (
          <span key={i} title={tip}>
            {meta.icon}{s.kind === 'fear' && s.value > 1 ? <sup>×{s.value}</sup> : null}
          </span>
        );
      })}
    </span>
  );
}

const BATTLE_BUFF_ICON: Record<string, { icon: string; label: string }> = {
  atkUp: { icon: '⚔️', label: '伤害 +2' },
  spdUp: { icon: '💨', label: '速度 +2' },
  atkDown: { icon: '🪄', label: '伤害 -2' },
  spdDown: { icon: '🕸️', label: '速度 -2' },
  skillSpd: { icon: '💨', label: '技能速度加成' },
};

export function PassiveBadge({ unit, stacksOverride, rockShellHitsOverride, thornsHitCountOverride }: { unit: Unit; stacksOverride?: number; rockShellHitsOverride?: number; thornsHitCountOverride?: number }) {
  const p = getPassive(unit.passive);
  if (!p) return null;
  const stacks = stacksOverride ?? unit.passiveSpdStacks ?? 0;
  const showStacks = stacks > 0 && (p.kind === 'spdOnHit' || p.kind === 'treeSpeedUp' || p.kind === 'spdOnAttack' || p.kind === 'speedBonus');
  const followStacks = p.kind === 'shadowFollow' ? (unit.passiveDmgBonus ?? 0) : 0;
  const soulStacks = p.kind === 'soulSiphon' ? (unit.soul ?? 0) : 0;
  const rockHits = p.kind === 'rockShellBreak' ? (rockShellHitsOverride ?? unit.rockShellHits ?? 0) : undefined;
  const thornHits = p.kind === 'thornRoyal' ? (thornsHitCountOverride ?? unit.thornsHitCount ?? 0) : undefined;
  const formLabel = unit.altPassive ? (unit.passive === unit.altPassive ? '【爆发】' : '【熔岩】') : '';
  return (
    <span className="passive-badge" title={`被动「${p.name}」：${p.desc}`}>
      💠{p.name}{formLabel}{showStacks ? ` ×${stacks}` : ''}{followStacks > 0 ? ` ×${followStacks}` : ''}{soulStacks > 0 ? ` 💀×${soulStacks}` : ''}
      {rockHits !== undefined && p.value !== undefined ? ` ${rockHits}/${p.value}` : ''}
      {thornHits !== undefined && p.value !== undefined ? ` ${thornHits % p.value}/${p.value}` : ''}
    </span>
  );
}

const CURSE_ICON: Record<string, { icon: string; tip: string }> = {
  hpDown: { icon: '💔', tip: '血脆（生命 -5）' },
  atkDown: { icon: '🪄', tip: '虚弱（伤害 -2）' },
  spdDown: { icon: '🕸️', tip: '迟缓（速度 -2）' },
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
  /** 动画期间覆盖被动速度叠加层数（逐段递增） */
  stacksOverride?: number;
  /** 动画期间覆盖岩壳崩解受击计数（逐段递增） */
  rockShellHitsOverride?: number;
  /** 动画期间覆盖荆棘之躯受击计数（逐段递增） */
  thornsHitCountOverride?: number;
  /** 技能强化等级映射（slotIndex → level），用于显示强化标记 */
  skillEnhancements?: Record<number, number>;
}

export function UnitCard({ unit, className = '', onClick, small = false, showSkills = true, showSkillDesc = false, topStats = false, footer, speedOverride, stacksOverride, rockShellHitsOverride, thornsHitCountOverride, skillEnhancements }: UnitCardProps) {
  const dead = unit.hp <= 0;
  // 计算有效速度（含临时 buff/debuff/被动）
  // 使用 unit.spd 作为基础（已包含被动/永久修改），再叠加临时 buff/debuff
  const buffSpd = (unit.battleBuffs?.spdUp ? 2 : 0) - (unit.battleBuffs?.spdDown ? 2 : 0);
  const skillSpd = unit.battleBuffs?.skillSpd ?? 0;
  const spdDownStatus = unit.statuses.find((s) => s.kind === 'spdDown');
  const statusSpd = spdDownStatus ? -spdDownStatus.value : 0;
  const windSpdStatus = unit.statuses.find((s) => s.kind === 'windSpd');
  const windSpd = windSpdStatus ? windSpdStatus.value : 0;
  const effectiveSpd = speedOverride ?? Math.max(1, unit.spd + buffSpd + skillSpd + statusSpd + windSpd);
  const passiveSpd = unit.passiveSpdBonus ?? 0;
  const totalDelta = passiveSpd + buffSpd + skillSpd + statusSpd + windSpd;
  const spdColor = totalDelta > 0 ? 'var(--hp-good)' : totalDelta < 0 ? 'var(--hp-low)' : undefined;
  return (
    <div
      className={`unit-card ${small ? 'small' : ''} ${className} ${dead ? 'dead' : ''} ${onClick ? 'clickable' : ''} ${unit.isPlayer ? 'is-player' : ''}`}
      onClick={onClick}
    >
      <div className={`card-top ${topStats ? 'card-top-stats' : ''}`}>
        <span className="emoji">{unit.image ? <img src={unit.image} className="pet-image" alt={unit.name} /> : unit.emoji}</span>
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
      <div className="card-bottom">
        <div className="card-sub">
          {!topStats && <span>{unit.hp}/{unit.maxHp}</span>}
          <StatusIcons unit={unit} />
          <PassiveBadge unit={unit} stacksOverride={stacksOverride} rockShellHitsOverride={rockShellHitsOverride} thornsHitCountOverride={thornsHitCountOverride} />
          <CurseBadge unit={unit} />
        </div>
        <BattleBuffIcons unit={unit} />
      </div>
      {showSkills && !small && (
        <div className="skill-list">
          {unit.skills.map((sid, idx) => (
            <SkillTag key={sid} skill={getSkill(sid)} desc={showSkillDesc} enhanced={skillEnhancements?.[idx] ?? 0} />
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
  comboBoost: (v) => `连击段数 +${v}`,
  sporeShield: (v) => `受到伤害 -${v}，回合结束恢复 8 点生命`,
  toxicBurstReady: () => '死亡时对全体敌人造成 4 伤害 + 中毒 3 层',
};

export function BuffDetailPanel({ unit, stacksOverride, rockShellHitsOverride, thornsHitCountOverride }: { unit: Unit; stacksOverride?: number; rockShellHitsOverride?: number; thornsHitCountOverride?: number }) {
  const passive = getPassive(unit.passive);
  const buffs = unit.battleBuffs;
  const battleBuffEntries = buffs
    ? (Object.entries(buffs) as [string, number][]).filter(([k, v]) => v && k !== 'skillSpd')
    : [];
  const statuses = unit.statuses;
  const hasPassive = !!passive;
  const hasStatuses = statuses.length > 0;
  const hasBattleBuffs = battleBuffEntries.length > 0;

  // 计算被动当前层数/加成（仅动态计数显示数字，固定效果数值在描述文字中）
  const passiveStacks = (() => {
    if (!passive) return null;
    // 速度叠加类被动：显示战斗中累计层数（被动层数随攻击/受击逐段递增）
    if (passive.kind === 'speedBonus' || passive.kind === 'spdOnHit' || passive.kind === 'treeSpeedUp' || passive.kind === 'spdOnAttack') {
      const stacks = stacksOverride ?? unit.passiveSpdStacks ?? 0;
      return stacks > 0 ? `×${stacks}` : null;
    }
    // 岩壳崩解：显示当前受击计数（每受击 +1，达到阈值触发 AOE 后重置为 0）
    if (passive.kind === 'rockShellBreak') {
      return `${rockShellHitsOverride ?? unit.rockShellHits ?? 0}/${passive.value}`;
    }
    // 荆棘之躯：显示当前受击计数（每受击 +1，每 3 次触发爆发反伤 + 回血）
    if (passive.kind === 'thornRoyal') {
      return `${(thornsHitCountOverride ?? unit.thornsHitCount ?? 0) % passive.value}/${passive.value}`;
    }
    // 暗影追随：显示永久伤害加成层数
    if (passive.kind === 'shadowFollow') {
      const stacks = unit.passiveDmgBonus ?? 0;
      return stacks > 0 ? `×${stacks}` : null;
    }
    // 灵魂汲取：显示灵魂数
    if (passive.kind === 'soulSiphon') {
      const souls = unit.soul ?? 0;
      return souls > 0 ? `💀×${souls}` : null;
    }
    // 成长值：显示当前成长值
    if (passive.kind === 'growthValue') {
      const gv = unit.growthValue ?? 0;
      return `🌱×${gv}`;
    }
    // 非叠加型被动不显示数值（与卡片 PassiveBadge 规则统一）
    return null;
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
        <PetIcon image={unit.image} emoji={unit.emoji} name={unit.name} /> {unit.name}
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
