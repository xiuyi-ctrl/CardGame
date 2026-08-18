import type { MonsterSpecies } from '../types';

export const MONSTERS: Record<string, MonsterSpecies> = {
  momo: {
    id: 'momo', name: '迅迅', emoji: '🐭',
    baseHp: 10, baseSpd: 3,
    skills: ['punch', 'leaf_needle'],
    desc: '开局御三家之一，均衡型选手，速度与生存兼备。',
    passive: 'quick',
    evolutions: [{ to: 'momo_queen' }],
    tame: { difficulty: 0.75 }, rank: 1,
  },
  lulu: {
    id: 'lulu', name: '泡泡', emoji: '🐸',
    baseHp: 14, baseSpd: 1,
    skills: ['aqua_shot', 'water_bath'],
    desc: '开局御三家之一，血量最高的坦克型，靠持续回复磨血。',
    passive: 'watery_regen',
    evolutions: [{ to: 'lulu_king' }],
    tame: { difficulty: 0.75 }, rank: 1,
  },
  fifi: {
    id: 'fifi', name: '灼灼', emoji: '🔥',
    baseHp: 7, baseSpd: 5,
    skills: ['ember', 'double_hit'],
    desc: '开局御三家之一，全游戏速度最快的先手刺客，但极其脆弱。',
    passive: 'heat',
    evolutions: [{ to: 'fifi_king' }],
    tame: { difficulty: 0.75 }, rank: 1,
  },
  kiki: {
    id: 'kiki', name: '铁墩', emoji: '🛡️',
    baseHp: 12, baseSpd: 2,
    skills: ['steel_spike', 'shield_skill'],
    desc: '血厚的基础宠，皮糙肉厚的盾卫。',
    passive: 'iron_guard',
    evolutions: [{ to: 'gora' }],
    tame: { difficulty: 0.75 }, rank: 1,
  },
  mimi: {
    id: 'mimi', name: '咪咪', emoji: '🐍',
    baseHp: 10, baseSpd: 3,
    skills: ['bite', 'poison_sting'],
    desc: '直接掌握高阶单点技能的影系输出。',
    passive: 'venom_fang',
    evolutions: [{ to: 'mimi_king' }],
    tame: { difficulty: 0.75 }, rank: 1,
  },
  pipi: {
    id: 'pipi', name: '刺刺', emoji: '🦔',
    baseHp: 11, baseSpd: 2,
    skills: ['weaken', 'provoke'],
    desc: '靠中毒持续伤害磨血。',
    passive: 'spike',
    evolutions: [{ to: 'sisi' }],
    tame: { difficulty: 0.75 }, rank: 1,
  },
  momo_queen: {
    id: 'momo_queen', name: '迅牙', emoji: '🐹',
    baseHp: 18, baseSpd: 4,
    skills: ['leaf_needle', 'double_hit', 'shockwave'],
    desc: '迅迅的融合形态，高速多段连击手，先手爆发。',
    passive: 'swift_power',
    evolutions: [{ to: 'momo_god' }],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  lulu_king: {
    id: 'lulu_king', name: '泡泡将', emoji: '🐢',
    baseHp: 22, baseSpd: 2,
    skills: ['water_gun', 'heal_light', 'water_wave'],
    desc: '泡泡的融合形态，高血量的水系坦克，攻击群体并自愈。',
    passive: 'tidal_regen',
    evolutions: [{ to: 'lulu_god' }],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  fifi_king: {
    id: 'fifi_king', name: '灼刃', emoji: '🦊',
    baseHp: 13, baseSpd: 6,
    skills: ['flame_combo', 'roar', 'fire_shock'],
    desc: '灼灼的融合形态，高速度的火焰刺客，多段灼烧爆发。',
    passive: 'blazing',
    evolutions: [{ to: 'fifi_god' }],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  sisi: {
    id: 'sisi', name: '棘尾', emoji: '🦂',
    baseHp: 16, baseSpd: 3,
    skills: ['weaken', 'provoke', 'thorn_skill'],
    desc: '刺刺的融合形态，控制+反伤的肉盾，擅长削弱和限制敌人。',
    passive: 'hard_armor',
    evolutions: [{ to: 'sisi_god' }],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  gora: {
    id: 'gora', name: '铁卫', emoji: '🐊',
    baseHp: 19, baseSpd: 2,
    skills: ['steel_spike', 'shield_skill', 'shield_counter'],
    desc: '铁墩的融合形态，高血铁壁，护盾防御的铁壁坦克。',
    passive: 'thick_shell',
    evolutions: [{ to: 'gora_god' }],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  mimi_king: {
    id: 'mimi_king', name: '蟒影', emoji: '🐍',
    baseHp: 17, baseSpd: 4,
    skills: ['poison_sting', 'shadow_strike', 'shadow_claw'],
    desc: '咪咪的融合形态，毒系影袭刺客，优先猎杀后排。',
    passive: 'venom_power',
    evolutions: [{ to: 'mimi_god' }],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  gora_god: {
    id: 'gora_god', name: '铁壁神', emoji: '🗿',
    baseHp: 30, baseSpd: 3,
    skills: ['steel_spike', 'iron_domain', 'shield_quake', 'iron_double', 'shield_skill'],
    desc: '铁墩的最终形态，每回合伤害上限10点的不朽堡垒，为队友提供护盾保护。',
    passive: 'iron_cap',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  mimi_god: {
    id: 'mimi_god', name: '深渊蛇王', emoji: '👹',
    baseHp: 26, baseSpd: 6,
    skills: ['poison_sting', 'shadow_strike', 'poison_mist', 'toxic_bite'],
    desc: '咪咪的最终形态，蛇狩被动可无视护盾+真实伤害，淬毒噬咬对中毒目标伤害翻倍。',
    passive: 'serpent_hunt',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  sisi_god: {
    id: 'sisi_god', name: '棘刺王', emoji: '🦂',
    baseHp: 30, baseSpd: 4,
    skills: ['thorn_skill', 'steel_spike', 'revenge_thorn', 'group_taunt'],
    desc: '刺刺的最终形态，荆棘反伤坦克，受击越多反伤越痛，控制+反伤的极致肉盾。',
    passive: 'thorn_royal',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  momo_god: {
    id: 'momo_god', name: '迅天', emoji: '🐉',
    baseHp: 30, baseSpd: 6,
    skills: ['wind_flash', 'wind_feather', 'whirlwind', 'swift_strike'],
    desc: '迅迅最终形态，疾风连携越打越快，速度差转伤害，高速刺客。',
    passive: 'gale_combo',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  lulu_god: {
    id: 'lulu_god', name: '泡泡龙神', emoji: '🐳',
    baseHp: 32, baseSpd: 4,
    skills: ['tidal_domain', 'heal_light', 'water_shot', 'wave'],
    desc: '泡泡最终形态，生命之泉每回合回血+大额伤害减免，水幕护盾保护全体。',
    passive: 'life_spring',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  fifi_god: {
    id: 'fifi_god', name: '灼天', emoji: '🐲',
    baseHp: 22, baseSpd: 7,
    skills: ['burn_burst', 'roar', 'flame_shield', 'flame_slash', 'flame_combo'],
    desc: '灼灼最终形态，余烬焚身对灼烧目标伤害叠加上限+5，焚身爆全体爆发。',
    passive: 'ember_body',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  boss_vine: {
    id: 'boss_vine', name: '古树之主', emoji: '🌳',
    baseHp: 28, baseSpd: 2,
    skills: ['leaf_needle', 'roar', 'leaf_quake', 'vine_whip', 'wild_leaf', 'boss_vine_shield'],
    desc: '越挨打越快的站桩树王，小怪会保护它。速度越快，狂叶和叶震波伤害越高。',
    passive: 'tree_speed_up',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_tree_guard: {
    id: 'boss_minion_tree_guard', name: '树精卫士', emoji: '🌿',
    baseHp: 18, baseSpd: 2,
    skills: ['weaken', 'entangle'],
    desc: '古树之主的贴身护卫，削弱敌人保护Boss。',
    passive: 'symbiotic_bark',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_thorn: {
    id: 'boss_minion_thorn', name: '荆棘卫士', emoji: '🌱',
    baseHp: 12, baseSpd: 3,
    skills: ['poison_vine', 'steel_spike'],
    desc: '骚扰型小怪，毒刺+铁刺双debuff削弱敌人。',
    passive: 'thorn_slow',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_shrimp: {
    id: 'boss_minion_shrimp', name: '潮汐虾兵', emoji: '🦐',
    baseHp: 16, baseSpd: 4,
    skills: ['double_hit', 'aqua_shot'],
    desc: '与巨蟹共享爆发节奏，爆发回合双压力。',
    passive: 'tide_echo',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_hermit: {
    id: 'boss_minion_hermit', name: '寄居蟹', emoji: '🐚',
    baseHp: 14, baseSpd: 1,
    skills: ['punch', 'shell_up'],
    desc: '纯肉盾，缩壳拖慢节奏让巨蟹等到爆发回合。',
    passive: 'shell_guard',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_rock: {
    id: 'boss_minion_rock', name: '碎石傀儡', emoji: '🪨',
    baseHp: 10, baseSpd: 1,
    skills: ['steel_spike', 'gravel_throw'],
    desc: '低血量自爆小怪，死亡时对全体敌人造成3点真实伤害并加速巨像岩壳崩解。',
    passive: 'rock_shard',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_crystal: {
    id: 'boss_minion_crystal', name: '晶石虫', emoji: '💎',
    baseHp: 8, baseSpd: 5,
    skills: ['double_hit', 'crystal_sting'],
    desc: '高速多段小怪，连击快速堆叠巨像受击计数器，死亡自爆同样计入巨像计数。',
    passive: 'rock_shard',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_shadow_servant: {
    id: 'boss_minion_shadow_servant', name: '暗影仆从', emoji: '👤',
    baseHp: 14, baseSpd: 5,
    skills: ['shadow_claw', 'snipe'],
    desc: '暗影之王的贴身侍卫，杀人后永久增伤。',
    passive: 'shadow_follow',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_shadow_bat: {
    id: 'boss_minion_shadow_bat', name: '影蝠', emoji: '🦇',
    baseHp: 10, baseSpd: 6,
    skills: ['shadow_claw', 'leech_bite'],
    desc: '残血收割者，与王共同压制低血量目标。',
    passive: 'blood_scent',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_dark: {
    id: 'boss_dark', name: '暗影之王', emoji: '😈',
    baseHp: 36, baseSpd: 5,
    skills: ['dark_shock', 'shadow_flurry', 'roar', 'shadow_rift'],
    desc: '残血收割者，暗影印记+乱舞打出斩杀连段，击杀再动滚雪球。',
    passive: 'shadow_hunter',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_fire: {
    id: 'boss_fire', name: '熔火领主', emoji: '🌋',
    baseHp: 45, baseSpd: 6,
    skills: ['flame_burst', 'double_hit', 'roar', 'inferno'],
    desc: '范围灼烧+强化，需优先压制。',
    passive: 'lava_scorch',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_crab: {
    id: 'boss_crab', name: '潮汐巨蟹', emoji: '🦀',
    baseHp: 36, baseSpd: 3,
    skills: ['double_hit', 'claw_smash', 'wave_aura', 'water_cannon', 'tidal_slam'],
    desc: '多段连击手，每2回合爆发一次，配合波光环强化连击。',
    passive: 'tide_rhythm',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_golem: {
    id: 'boss_golem', name: '岩甲巨像', emoji: '🗻',
    baseHp: 40, baseSpd: 2,
    skills: ['steel_spike', 'quake', 'rock_reforge', 'rock_throw'],
    desc: '受击计数惩罚机制，多段连击反而触发全屏伤害。碎岩重组可主动消灭小怪触发自爆，加速岩壳崩解。',
    passive: 'rock_shell_break',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_moss: {
    id: 'boss_moss', name: '苔藓领主', emoji: '🍄',
    baseHp: 46, baseSpd: 4,
    skills: ['leaf_needle', 'poison_sting', 'roar', 'snipe', 'spore_burst'],
    desc: '全首领最高血量之一，中毒+随机攻击拖长战线。',
    passive: 'spore_venom',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_ghost: {
    id: 'boss_ghost', name: '幽灵船长', emoji: '👻',
    baseHp: 42, baseSpd: 6,
    skills: ['double_hit', 'dark_shock', 'roar', 'snipe', 'soul_rend'],
    desc: '高输出高速，首轮即可压血线。',
    passive: 'ghost_step',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_dragon: {
    id: 'boss_dragon', name: '玄铁渊龙', emoji: '🐉',
    baseHp: 60, baseSpd: 7,
    skills: ['double_hit', 'tail', 'roar', 'shockwave', 'dragon_breath'],
    desc: '最终幕最肉首领，数值怪。',
    passive: 'dragon_thorns',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_demon: {
    id: 'boss_demon', name: '炼狱魔君', emoji: '😈',
    baseHp: 55, baseSpd: 8,
    skills: ['dark_shock', 'double_hit', 'roar', 'pierce_strike', 'hellfire'],
    desc: '全游戏最高攻击与速度，挑战时优先保生存。',
    passive: 'demon_frenzy',
    tame: { difficulty: 0 }, rank: 4,
  },
  // 奇遇关「造物」：自创生物，不出现在战斗池，技能由玩家随机组合
  custom_guardian: {
    id: 'custom_guardian', name: '岩甲兽', emoji: '🗿',
    baseHp: 20, baseSpd: 2,
    skills: ['punch', 'tail', 'steel_spike', 'roar', 'heal_light'],
    desc: '奇遇关「造物」的血厚肉盾模板，可打全体可治疗。',
    passive: 'stone_guard',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  custom_fury: {
    id: 'custom_fury', name: '狂焰兽', emoji: '🐺',
    baseHp: 16, baseSpd: 5,
    skills: ['ember', 'double_hit', 'bite', 'flame_burst', 'roar'],
    desc: '奇遇关「造物」的输出模板，范围灼烧。',
    passive: 'berserk',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  custom_gale: {
    id: 'custom_gale', name: '迅风兽', emoji: '🕊️',
    baseHp: 15, baseSpd: 8,
    skills: ['leaf_needle', 'aqua_shot', 'shadow_claw', 'double_hit', 'poison_sting', 'snipe'],
    desc: '奇遇关「造物」的高速模板，速度全场最高，抢先手压制。',
    passive: 'swift_wind',
    tame: { difficulty: 0.3 }, rank: 3,
  },
};

export const STARTING_CHOICES = ['momo', 'lulu', 'fifi'];

export function getMonster(id: string): MonsterSpecies {
  const m = MONSTERS[id];
  if (!m) throw new Error(`未知怪物: ${id}`);
  return m;
}

/** 融合链深度：沿进化链向上数祖先个数（0=基础形态、1=第一阶、2=第二阶…） */
export function fusionDepth(id: string): number {
  let depth = 0;
  let cur = id;
  for (;;) {
    const parent = Object.values(MONSTERS).find((m) => m.evolutions?.some((e) => e.to === cur));
    if (!parent) break;
    depth += 1;
    cur = parent.id;
  }
  return depth;
}

/** 融合所需的同物种数量：结果形态为第 n 阶时需 n+1 只（基础→1阶需 2 只、1阶→2阶需 3 只…） */
export function fusionNeed(id: string): number {
  return fusionDepth(id) + 2;
}

/** 按进化阶段划分的物种池（用于事件招募） */
export const BASE_POOL = ['momo', 'lulu', 'fifi', 'kiki', 'mimi', 'pipi'];
export const EVO1_POOL = ['momo_queen', 'lulu_king', 'fifi_king', 'sisi', 'gora', 'mimi_king'];
export const EVO2_POOL = ['momo_god', 'lulu_god', 'fifi_god', 'gora_god', 'mimi_god'];
