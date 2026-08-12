import type { SkillDef } from '../types';

export const SKILLS: Record<string, SkillDef> = {
  punch: {
    id: 'punch', name: '爪击', desc: '攻击单个敌人',
    target: 'single', kind: 'attack', damage: 5,
  },
  tail: {
    id: 'tail', name: '尾扫', desc: '攻击所有敌人，伤害较低',
    target: 'all', kind: 'attack', damage: 2,
  },
  bite: {
    id: 'bite', name: '撕咬', desc: '重击单个敌人',
    target: 'single', kind: 'attack', damage: 7,
  },
  ember: {
    id: 'ember', name: '火花', desc: '攻击单个敌人，附加灼烧',
    target: 'single', kind: 'attack', damage: 6,
    effects: [{ kind: 'burn', value: 2, turns: 2 }],
  },
  aqua_shot: {
    id: 'aqua_shot', name: '水弹', desc: '攻击单个敌人',
    target: 'single', kind: 'attack', damage: 3,
  },
  leaf_needle: {
    id: 'leaf_needle', name: '叶针', desc: '连续两次攻击随机敌人',
    target: 'random', kind: 'attack', damage: 3, hits: 2,
  },
  shadow_claw: {
    id: 'shadow_claw', name: '暗爪', desc: '重击单个敌人',
    target: 'single', kind: 'attack', damage: 7,
  },
  steel_spike: {
    id: 'steel_spike', name: '铁刺', desc: '攻击单个敌人，降低其伤害',
    target: 'single', kind: 'attack', damage: 3,
    effects: [{ kind: 'atkDown', value: 1, turns: 2 }],
  },
  heal_light: {
    id: 'heal_light', name: '愈光', desc: '治疗一个队友',
    target: 'ally', kind: 'heal', heal: 8, uses: 2,
  },
  roar: {
    id: 'roar', name: '战吼', desc: '提升自身伤害',
    target: 'self', kind: 'buff', uses: 2,
    effects: [{ kind: 'atkUp', value: 2, turns: 2 }],
  },
  double_hit: {
    id: 'double_hit', name: '连击', desc: '连续两次攻击单个敌人',
    target: 'single', kind: 'attack', damage: 4, hits: 2,
  },
  poison_sting: {
    id: 'poison_sting', name: '毒刺', desc: '攻击并施加中毒',
    target: 'single', kind: 'attack', damage: 4,
    effects: [{ kind: 'poison', value: 2, turns: 3 }],
  },
  flame_burst: {
    id: 'flame_burst', name: '烈焰爆发', desc: '攻击所有敌人并附加灼烧',
    target: 'all', kind: 'attack', damage: 5,
    effects: [{ kind: 'burn', value: 2, turns: 2 }],
  },
  dark_shock: {
    id: 'dark_shock', name: '暗影冲击', desc: '重击单个敌人',
    target: 'single', kind: 'attack', damage: 9,
  },
  shockwave: {
    id: 'shockwave', name: '冲击波', desc: '贯穿攻击前排敌人并波及对应位置后排',
    target: 'single', kind: 'attack', damage: 4, reach: 'pierce',
  },
  snipe: {
    id: 'snipe', name: '狙击', desc: '跳过前排，直接攻击后排敌人',
    target: 'single', kind: 'attack', damage: 8, reach: 'back',
  },
  pierce_strike: {
    id: 'pierce_strike', name: '穿刺', desc: '无视前后排，指定攻击任意位置敌人',
    target: 'single', kind: 'attack', damage: 6, reach: 'direct',
  },

  // —— 初始宠物专属技能 ——
  water_bath: {
    id: 'water_bath', name: '水浴', desc: '恢复指定队友生命值',
    target: 'ally', kind: 'heal', heal: 5, uses: 2,
  },
  shield_skill: {
    id: 'shield_skill', name: '坚盾', desc: '为指定队友或自身附加5点护盾',
    target: 'ally', kind: 'buff', uses: 2,
    effects: [{ kind: 'shield', value: 5, turns: 0 }],
  },
  weaken: {
    id: 'weaken', name: '弱化', desc: '随机降低目标攻击或速度（2层，2回合）',
    target: 'single', kind: 'attack', damage: 0,
    effects: [{ kind: 'atkDown', value: 2, turns: 2 }],
  },
  provoke: {
    id: 'provoke', name: '挑衅', desc: '攻击目标并使其2回合内只能攻击自己',
    target: 'single', kind: 'attack', damage: 3,
    effects: [{ kind: 'taunt', value: 1, turns: 2 }],
  },

  // —— Boss 专属技能 ——
  vine_whip: {
    id: 'vine_whip', name: '藤鞭缠绕', desc: '攻击全体敌人并降低其伤害',
    target: 'all', kind: 'attack', damage: 3,
    effects: [{ kind: 'atkDown', value: 1, turns: 2 }],
  },
  shadow_flurry: {
    id: 'shadow_flurry', name: '暗影乱舞', desc: '连续三次攻击单个敌人，每段附加中毒',
    target: 'single', kind: 'attack', damage: 3, hits: 3,
    effects: [{ kind: 'poison', value: 2, turns: 3 }],
  },
  inferno: {
    id: 'inferno', name: '炼狱烈焰', desc: '连续两次攻击全体敌人并附加灼烧',
    target: 'all', kind: 'attack', damage: 5, hits: 2,
    effects: [{ kind: 'burn', value: 2, turns: 2 }],
  },
  tidal_slam: {
    id: 'tidal_slam', name: '潮涌重击', desc: '攻击全体敌人并恢复自身生命',
    target: 'all', kind: 'attack', damage: 4, heal: 3,
  },
  quake: {
    id: 'quake', name: '震地', desc: '攻击全体敌人并使其眩晕',
    target: 'all', kind: 'attack', damage: 3,
    effects: [{ kind: 'stun', value: 1, turns: 1 }],
  },
  spore_burst: {
    id: 'spore_burst', name: '孢子爆裂', desc: '攻击全体敌人并施加中毒',
    target: 'all', kind: 'attack', damage: 3,
    effects: [{ kind: 'poison', value: 3, turns: 3 }],
  },
  soul_rend: {
    id: 'soul_rend', name: '噬魂斩', desc: '重击单个敌人（每场限 2 次）',
    target: 'single', kind: 'attack', damage: 12, uses: 2,
  },
  dragon_breath: {
    id: 'dragon_breath', name: '龙息', desc: '连续两次攻击全体敌人并附加灼烧',
    target: 'all', kind: 'attack', damage: 4, hits: 2,
    effects: [{ kind: 'burn', value: 2, turns: 2 }],
  },
  hellfire: {
    id: 'hellfire', name: '地狱火', desc: '攻击全体敌人并附加灼烧',
    target: 'all', kind: 'attack', damage: 6,
    effects: [{ kind: 'burn', value: 3, turns: 2 }],
  },
};

export function getSkill(id: string): SkillDef {
  const s = SKILLS[id];
  if (!s) throw new Error(`未知技能: ${id}`);
  return s;
}
