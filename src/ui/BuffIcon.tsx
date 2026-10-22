import type { StatusEffect, Unit } from '../game/types';

export type IconArt = readonly [label: string, file: string];

export const STATUS_ART: Record<StatusEffect['kind'], IconArt> = {
  burn: ['灼烧', 'burn'],
  burnBrand: ['灼烧烙印', 'shadow-mark'],
  sunRadiance: ['日华', 'heal-tick'],
  foxFire: ['狐火', 'fox-fire'],
  foxTailGuard: ['焰尾护盾', 'shield'],
  poison: ['中毒', 'poison'],
  atkDown: ['攻击降低', 'atk-down'],
  stun: ['眩晕', 'stun'],
  taunt: ['嘲讽', 'taunt'],
  spdDown: ['速度降低', 'spd-down'],
  shadowMark: ['暗影印记', 'shadow-mark'],
  fear: ['恐惧', 'fear'],
  atkUp: ['攻击提升', 'atk-up'],
  healTick: ['持续治疗', 'heal-tick'],
  shield: ['护盾', 'shield'],
  thorns: ['荆棘反伤', 'thorns'],
  shieldCounter: ['盾反', 'shield-counter'],
  thornSpikes: ['复仇棘甲', 'thorn-spikes'],
  rageThorn: ['怒棘', 'rage-thorn'],
  windSpd: ['风羽', 'wind-spd'],
  waterCurtain: ['水幕', 'water-curtain'],
  flameShield: ['烈焰护盾', 'flame-shield'],
  comboBoost: ['连击增幅', 'combo-boost'],
  sporeShield: ['孢子防护', 'spore-shield'],
  toxicBurstReady: ['毒性爆发蓄力', 'toxic-burst-ready'],
  chainLink: ['锁链连接', 'chain-link'],
  skillSeal: ['技能封印', 'skill-seal'],
  skillSealPending: ['封印即将生效', 'skill-seal-pending'],
};

export const BATTLE_BUFF_ART: Record<keyof NonNullable<Unit['battleBuffs']>, IconArt> = {
  atkUp: ['药水·伤害提升', 'potion-atk-up'],
  spdUp: ['药水·速度提升', 'potion-spd-up'],
  atkDown: ['药水·伤害降低', 'potion-atk-down'],
  spdDown: ['药水·速度降低', 'potion-spd-down'],
  skillSpd: ['技能速度加成', 'potion-skill-spd'],
};

export const CURSE_ART: Record<NonNullable<Unit['curse']>, IconArt> = {
  hpDown: ['血脆诅咒', 'curse-hp-down'],
  atkDown: ['虚弱诅咒', 'curse-atk-down'],
  spdDown: ['迟缓诅咒', 'curse-spd-down'],
};

export const BATTLE_BUFF_ICON_IMAGES = [...Object.values(STATUS_ART), ...Object.values(BATTLE_BUFF_ART), ...Object.values(CURSE_ART)]
  .map(([, file]) => `/buff-icons/${file}.png`);

export function BuffIcon({ art }: { art: IconArt }) {
  return <img className="buff-art-icon" src={`/buff-icons/${art[1]}.png`} alt="" aria-hidden="true" draggable={false} />;
}
