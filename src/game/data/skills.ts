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
    target: 'single', kind: 'attack', damage: 6,
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
    target: 'ally', kind: 'heal', heal: 5, uses: 5,
  },
  shield_skill: {
    id: 'shield_skill', name: '坚盾', desc: '为指定队友或自身附加5点护盾',
    target: 'ally', kind: 'buff', uses: 5,
    effects: [{ kind: 'shield', value: 5, turns: 0 }],
  },
  weaken: {
    id: 'weaken', name: '弱化', desc: '随机降低目标攻击或速度（2层，2回合）',
    target: 'single', kind: 'attack', damage: 0,
    effects: [{ kind: 'atkDown', value: 2, turns: 2 }],
  },
  provoke: {
    id: 'provoke', name: '挑衅', desc: '攻击目标并使其2回合内只能攻击自己',
    target: 'single', kind: 'attack', damage: 3, uses: 5,
    effects: [{ kind: 'taunt', value: 1, turns: 2 }],
  },

  // —— 一阶进化专属技能 ——
  water_gun: {
    id: 'water_gun', name: '水枪弹', desc: '攻击单个敌人',
    target: 'single', kind: 'attack', damage: 4,
  },
  water_wave: {
    id: 'water_wave', name: '水波冲击', desc: '攻击全体前排敌人，每命中一个回复1点生命',
    target: 'all', kind: 'attack', damage: 2, heal: 1, reach: 'front',
  },
  flame_combo: {
    id: 'flame_combo', name: '火焰连击', desc: '连续两次攻击随机敌人',
    target: 'random', kind: 'attack', damage: 4, hits: 2,
  },
  fire_shock: {
    id: 'fire_shock', name: '火光冲击', desc: '贯穿攻击单个敌人并附加灼烧',
    target: 'single', kind: 'attack', damage: 4, reach: 'pierce',
    effects: [{ kind: 'burn', value: 1, turns: 2 }],
  },
  shield_counter: {
    id: 'shield_counter', name: '盾反', desc: '先手：为自身附加3层护盾，受攻击时反击敌人并降低其伤害（仅当前回合有效，使用后冷却1回合）',
    target: 'self', kind: 'buff', priority: 'first', uses: 5, cooldown: 1,
    effects: [{ kind: 'shield', value: 3, turns: 1 }, { kind: 'shieldCounter', value: 2, turns: 1 }],
  },
  shadow_strike: {
    id: 'shadow_strike', name: '影袭', desc: '跳过前排直接攻击后排敌人',
    target: 'single', kind: 'attack', damage: 7, reach: 'back',
  },
  thorn_skill: {
    id: 'thorn_skill', name: '荆棘', desc: '攻击单个敌人，使其下次攻击时自身受到反伤（触发后消失）',
    kind: 'attack', damage: 3, hits: 1, target: 'single',
    effects: [{ kind: 'thorns', value: 4, turns: 1 }],
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
  revenge_thorn: {
    id: 'revenge_thorn', name: '复仇棘甲', desc: '【先手】本回合内每次受到攻击后获得怒棘（攻击+1，可叠加），每层额外使被动反伤+1（每场限 2 次）',
    target: 'self', kind: 'buff', uses: 2, priority: 'first',
    effects: [{ kind: 'thornSpikes', value: 1, turns: 1 }],
  },
  group_taunt: {
    id: 'group_taunt', name: '群体嘲刺', desc: '攻击所有前排敌人并施加嘲讽（前排空则攻击后排，每场限 2 次）',
    target: 'all', kind: 'attack', damage: 3, uses: 2, reach: 'front',
    effects: [{ kind: 'taunt', value: 1, turns: 2 }],
  },

  // —— 传奇宠物重做技能 ——
  iron_domain: {
    id: 'iron_domain', name: '铁壁领域', desc: '为全体友方附加 6 层护盾',
    kind: 'buff', target: 'allyAll',
    effects: [{ kind: 'shield', value: 6, turns: 99 }],
    uses: 2,
  },
  shield_quake: {
    id: 'shield_quake', name: '盾震', desc: '攻击前排所有敌人',
    kind: 'attack', damage: 3, hits: 1, target: 'all',
    reach: 'front',
  },
  iron_double: {
    id: 'iron_double', name: '铁壁双击', desc: '随机攻击两个敌人，每命中一个自身获得 5 层护盾',
    kind: 'attack', damage: 3, hits: 2, target: 'random',
    effects: [{ kind: 'shield', value: 5, turns: 99 }],
  },
  poison_mist: {
    id: 'poison_mist', name: '毒雾', desc: '使所有敌人中毒 5 层',
    kind: 'attack', damage: 0, hits: 1, target: 'all',
    effects: [{ kind: 'poison', value: 5, turns: 3 }],
    uses: 2,
  },
  toxic_bite: {
    id: 'toxic_bite', name: '淬毒噬咬', desc: '攻击单个敌人，若目标已中毒则伤害翻倍',
    kind: 'attack', damage: 6, hits: 1, target: 'single',
    effects: [{ kind: 'poison', value: 4, turns: 3 }],
    uses: 3,
  },
  wind_flash: {
    id: 'wind_flash', name: '风灵闪', desc: '攻击单个敌人，若自身速度高于目标则额外攻击一次',
    kind: 'attack', damage: 5, hits: 1, target: 'single',
  },
  wind_feather: {
    id: 'wind_feather', name: '风羽', desc: '提升自身 2 点速度（持续 2 回合）',
    kind: 'buff', target: 'self',
    effects: [{ kind: 'windSpd', value: 2, turns: 2 }],
  },
  whirlwind: {
    id: 'whirlwind', name: '旋风斩', desc: '攻击前排所有敌人',
    kind: 'attack', damage: 5, hits: 1, target: 'all',
    reach: 'front',
  },
  swift_strike: {
    id: 'swift_strike', name: '迅击', desc: '先手：贯穿攻击敌人',
    kind: 'attack', damage: 5, hits: 1, target: 'single',
    reach: 'pierce', priority: 'first',
  },
  tidal_domain: {
    id: 'tidal_domain', name: '潮汐领域', desc: '全体友方恢复 4 点生命，并附加水幕（下回合受伤 -2）',
    kind: 'heal', target: 'allyAll',
    heal: 4,
    effects: [{ kind: 'waterCurtain', value: 2, turns: 1 }],
    uses: 2,
  },
  water_shot: {
    id: 'water_shot', name: '水波弹', desc: '攻击单个敌人',
    kind: 'attack', damage: 6, hits: 1, target: 'single',
  },
  wave: {
    id: 'wave', name: '浪潮', desc: '攻击全体敌方前排',
    kind: 'attack', damage: 4, hits: 1, target: 'all',
    reach: 'front',
  },
  burn_burst: {
    id: 'burn_burst', name: '焚身爆', desc: '攻击所有敌人并附加灼烧；使用后自身损失 5 点生命（不可减免）',
    kind: 'attack', damage: 8, hits: 1, target: 'all',
    effects: [{ kind: 'burn', value: 3, turns: 2 }],
    uses: 1,
  },
  flame_shield: {
    id: 'flame_shield', name: '烈焰护盾', desc: '获得 5 层护盾；本回合受攻击则灼烧攻击者 10 层',
    kind: 'buff', target: 'self',
    effects: [{ kind: 'shield', value: 5, turns: 99 }, { kind: 'flameShield', value: 10, turns: 1 }],
    uses: 5,
  },
  flame_slash: {
    id: 'flame_slash', name: '火焰斩击', desc: '重击单个敌人',
    kind: 'attack', damage: 8, hits: 1, target: 'single',
  },

  // —— Boss 专属技能（小怪/首领）——
  wild_leaf: {
    id: 'wild_leaf', name: '狂叶', desc: '攻击全体敌人，伤害随自身速度提高',
    target: 'all', kind: 'attack', damage: 1, spdScaling: 1,
  },
  leaf_quake: {
    id: 'leaf_quake', name: '叶震波', desc: '贯穿攻击前排并波及后排，伤害随自身速度提高',
    target: 'single', kind: 'attack', damage: 2, reach: 'pierce', spdScaling: 1,
  },
  boss_vine_shield: {
    id: 'boss_vine_shield', name: '古树庇护', desc: '全体友方获得5点护盾并回复2点生命',
    target: 'allyAll', kind: 'buff', heal: 2, uses: 2,
    effects: [{ kind: 'shield', value: 5, turns: 99 }],
  },
  poison_vine: {
    id: 'poison_vine', name: '毒刺藤', desc: '攻击单个敌人并施加中毒',
    target: 'single', kind: 'attack', damage: 3,
    effects: [{ kind: 'poison', value: 3, turns: 3 }],
  },
  entangle: {
    id: 'entangle', name: '缠绕', desc: '攻击单个敌人并降低其速度',
    target: 'single', kind: 'attack', damage: 2,
    effects: [{ kind: 'spdDown', value: 2, turns: 2 }],
  },
  claw_smash: {
    id: 'claw_smash', name: '蟹钳重击', desc: '重击单个敌人，目标生命值高于80%时额外造成2点伤害',
    target: 'single', kind: 'attack', damage: 7,
  },
  wave_aura: {
    id: 'wave_aura', name: '波光环', desc: '使自身下回合连击段数+2',
    target: 'self', kind: 'buff',
    effects: [{ kind: 'comboBoost', value: 2, turns: 1 }],
  },
  water_cannon: {
    id: 'water_cannon', name: '水炮射击', desc: '连续三次随机攻击敌人',
    target: 'random', kind: 'attack', damage: 3, hits: 3,
  },
};

export function getSkill(id: string): SkillDef {
  const s = SKILLS[id];
  if (!s) throw new Error(`未知技能: ${id}`);
  return s;
}
