import type { PassiveDef } from '../types';

export const PASSIVES: Record<string, PassiveDef> = {
  // —— 基础（御三家/常见野怪）——
  quick: { id: 'quick', name: '迅捷', desc: '战斗开始速度 +2', kind: 'spd', value: 2 },
  watery_regen: { id: 'watery_regen', name: '水愈', desc: '每回合开始恢复 2 点生命', kind: 'regen', value: 2 },
  heat: { id: 'heat', name: '炽热', desc: '攻击命中附加灼烧 3 层', kind: 'scorch', value: 3 },
  iron_guard: { id: 'iron_guard', name: '铁壁', desc: '受到的所有伤害 -1', kind: 'guard', value: 1 },
  venom_fang: { id: 'venom_fang', name: '毒牙', desc: '攻击命中附加中毒 3 层', kind: 'venom', value: 3 },
  spike: { id: 'spike', name: '尖刺', desc: '受到攻击时反伤 2 点', kind: 'thorns', value: 2 },

  // —— 第一阶进化 ——
  brute: { id: 'brute', name: '蛮力', desc: '所有技能伤害 +1', kind: 'power', value: 1 },
  thick_shell: { id: 'thick_shell', name: '厚壳', desc: '受到的所有伤害 -2', kind: 'guard', value: 2 },
  hot_flame: { id: 'hot_flame', name: '烈焰', desc: '攻击命中附加灼烧 3 层', kind: 'scorch', value: 3 },
  venom_tail: { id: 'venom_tail', name: '毒尾', desc: '攻击命中附加中毒 3 层', kind: 'venom', value: 3 },
  hard_armor: { id: 'hard_armor', name: '硬甲', desc: '受到攻击时反伤 3 点', kind: 'thorns', value: 3 },

  // —— 第二阶进化 ——
  fury: { id: 'fury', name: '狂怒', desc: '生命低于 50% 时伤害 +3', kind: 'frenzy', value: 3 },
  deep_regen: { id: 'deep_regen', name: '深海再生', desc: '每回合开始恢复 4 点生命', kind: 'regen', value: 4 },
  dragon_power: { id: 'dragon_power', name: '龙力', desc: '所有技能伤害 +2', kind: 'power', value: 2 },

  // —— Boss ——
  tree_regen: { id: 'tree_regen', name: '古树再生', desc: '每回合开始恢复 3 点生命', kind: 'regen', value: 3 },
  shadow_power: { id: 'shadow_power', name: '暗影之力', desc: '所有技能伤害 +3', kind: 'power', value: 3 },
  lava_scorch: { id: 'lava_scorch', name: '熔火灼烧', desc: '攻击命中附加灼烧 3 层', kind: 'scorch', value: 3 },
  tide_drain: { id: 'tide_drain', name: '潮汐吸噬', desc: '造成伤害时恢复 2 点生命', kind: 'drain', value: 2 },
  rock_guard: { id: 'rock_guard', name: '磐岩护甲', desc: '受到的所有伤害 -3', kind: 'guard', value: 3 },
  spore_venom: { id: 'spore_venom', name: '剧毒孢子', desc: '攻击命中附加中毒 3 层', kind: 'venom', value: 3 },
  ghost_step: { id: 'ghost_step', name: '幽灵疾步', desc: '战斗开始速度 +3', kind: 'spd', value: 3 },
  dragon_thorns: { id: 'dragon_thorns', name: '玄铁反甲', desc: '受到攻击时反伤 3 点', kind: 'thorns', value: 3 },
  demon_frenzy: { id: 'demon_frenzy', name: '炼狱狂暴', desc: '生命低于 50% 时伤害 +3', kind: 'frenzy', value: 3 },

  // —— 奇遇自创生物 ——
  stone_guard: { id: 'stone_guard', name: '磐岩之力', desc: '受到的所有伤害 -2', kind: 'guard', value: 2 },
  berserk: { id: 'berserk', name: '狂战', desc: '生命低于 50% 时伤害 +2', kind: 'frenzy', value: 2 },
  swift_wind: { id: 'swift_wind', name: '迅风', desc: '造成伤害时恢复 1 点生命', kind: 'drain', value: 1 },

  // —— 初级一阶进化专属 ——
  swift_power: { id: 'swift_power', name: '迅力', desc: '战斗开始速度 +3', kind: 'spd', value: 3 },
  tidal_regen: { id: 'tidal_regen', name: '潮汐再生', desc: '每回合开始恢复 3 点生命', kind: 'regen', value: 3 },
  blazing: { id: 'blazing', name: '灼焰', desc: '攻击命中附加灼烧 4 层', kind: 'scorch', value: 4 },
  venom_power: { id: 'venom_power', name: '蟒影', desc: '对中毒目标伤害 +3', kind: 'venomPower', value: 3 },

  // —— 刺刺二阶进化专属 ——
  thorn_royal: { id: 'thorn_royal', name: '荆棘之躯', desc: '受到攻击时反伤 3 点；每受到第 3 次攻击，反伤 5 点并恢复 2 点生命', kind: 'thornRoyal', value: 3 },

  // —— 传奇宠物重做被动 ——
  iron_cap: { id: 'iron_cap', name: '铁壁上限', desc: '每回合最多累计受到 10 点伤害，超出部分无效', kind: 'damageCap', value: 10 },
  serpent_hunt: { id: 'serpent_hunt', name: '蛇狩', desc: '攻击中毒目标时，无视其 8 点护盾/减伤效果，并额外造成 5 点伤害', kind: 'poisonBreak', value: 5 },
  gale_combo: { id: 'gale_combo', name: '疾风连携', desc: '每次使用攻击技能后，自身速度 +1（可叠加）；速度每高于目标 1 点，伤害 +1，上限 +5', kind: 'speedBonus', value: 5 },
  life_spring: { id: 'life_spring', name: '生命之泉', desc: '每回合开始恢复 3 点生命；每次受到伤害超过 6 点时，伤害减少 2 点', kind: 'lifeSpring', value: 6 },
  ember_body: { id: 'ember_body', name: '余烬焚身', desc: '攻击命中附加灼烧 4 层；对已灼烧的目标，每层灼烧使该次伤害 +1，上限 +5', kind: 'scorchPlus', value: 4 },
};

export function getPassive(id?: string): PassiveDef | undefined {
  if (!id) return undefined;
  const p = PASSIVES[id];
  return p;
}
