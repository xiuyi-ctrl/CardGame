import type { MonsterSpecies } from '../types';

export const MONSTERS: Record<string, MonsterSpecies> = {
  momo: {
    id: 'momo', name: '毛毛', emoji: '🐭',
    baseHp: 10, baseSpd: 3,
    skills: ['punch', 'leaf_needle'],
    passive: 'quick',
    evolutions: [{ to: 'momo_queen' }],
    tame: { difficulty: 0.75 }, rank: 1,
  },
  lulu: {
    id: 'lulu', name: '露露', emoji: '🐸',
    baseHp: 11, baseSpd: 2,
    skills: ['punch', 'aqua_shot'],
    passive: 'watery_regen',
    evolutions: [{ to: 'lulu_king' }],
    tame: { difficulty: 0.75 }, rank: 1,
  },
  fifi: {
    id: 'fifi', name: '菲菲', emoji: '🔥',
    baseHp: 9, baseSpd: 4,
    skills: ['punch', 'ember'],
    passive: 'heat',
    evolutions: [{ to: 'fifi_king' }],
    tame: { difficulty: 0.75 }, rank: 1,
  },
  kiki: {
    id: 'kiki', name: '基基', emoji: '🛡️',
    baseHp: 12, baseSpd: 2,
    skills: ['punch', 'steel_spike'],
    passive: 'iron_guard',
    evolutions: [{ to: 'gora' }],
    tame: { difficulty: 0.7 }, rank: 1,
  },
  mimi: {
    id: 'mimi', name: '咪咪', emoji: '🐍',
    baseHp: 10, baseSpd: 3,
    skills: ['bite', 'shadow_claw'],
    passive: 'venom_fang',
    tame: { difficulty: 0.7 }, rank: 1,
  },
  pipi: {
    id: 'pipi', name: '皮皮', emoji: '🦔',
    baseHp: 11, baseSpd: 2,
    skills: ['punch', 'poison_sting'],
    passive: 'spike',
    evolutions: [{ to: 'sisi' }],
    tame: { difficulty: 0.7 }, rank: 1,
  },
  momo_queen: {
    id: 'momo_queen', name: '毛毛王后', emoji: '🐹',
    baseHp: 18, baseSpd: 4,
    skills: ['bite', 'leaf_needle', 'heal_light'],
    passive: 'brute',
    evolutions: [{ to: 'momo_god' }],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  lulu_king: {
    id: 'lulu_king', name: '露露王', emoji: '🐢',
    baseHp: 20, baseSpd: 3,
    skills: ['aqua_shot', 'roar', 'heal_light'],
    passive: 'thick_shell',
    evolutions: [{ to: 'lulu_god' }],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  fifi_king: {
    id: 'fifi_king', name: '菲菲王', emoji: '🐲',
    baseHp: 15, baseSpd: 5,
    skills: ['ember', 'double_hit', 'roar'],
    passive: 'hot_flame',
    evolutions: [{ to: 'fifi_god' }],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  sisi: {
    id: 'sisi', name: '思思', emoji: '🦂',
    baseHp: 16, baseSpd: 3,
    skills: ['leaf_needle', 'poison_sting', 'roar'],
    passive: 'venom_tail',
    tame: { difficulty: 0.4 }, rank: 2,
  },
  gora: {
    id: 'gora', name: '甲兽', emoji: '🐊',
    baseHp: 19, baseSpd: 2,
    skills: ['steel_spike', 'roar', 'tail'],
    passive: 'hard_armor',
    tame: { difficulty: 0.4 }, rank: 2,
  },
  momo_god: {
    id: 'momo_god', name: '毛毛神', emoji: '🐉',
    baseHp: 30, baseSpd: 6,
    skills: ['bite', 'leaf_needle', 'heal_light', 'roar'],
    passive: 'fury',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  lulu_god: {
    id: 'lulu_god', name: '露露神', emoji: '🐳',
    baseHp: 28, baseSpd: 5,
    skills: ['aqua_shot', 'roar', 'heal_light', 'tail'],
    passive: 'deep_regen',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  fifi_god: {
    id: 'fifi_god', name: '菲菲神', emoji: '🐉',
    baseHp: 26, baseSpd: 6,
    skills: ['ember', 'double_hit', 'roar', 'flame_burst'],
    passive: 'dragon_power',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  boss_vine: {
    id: 'boss_vine', name: '古树之主', emoji: '🌳',
    baseHp: 34, baseSpd: 4,
    skills: ['tail', 'leaf_needle', 'heal_light', 'roar'],
    passive: 'tree_regen',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_dark: {
    id: 'boss_dark', name: '暗影之王', emoji: '😈',
    baseHp: 38, baseSpd: 5,
    skills: ['shadow_claw', 'double_hit', 'poison_sting'],
    passive: 'shadow_power',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_fire: {
    id: 'boss_fire', name: '熔火领主', emoji: '🌋',
    baseHp: 45, baseSpd: 6,
    skills: ['flame_burst', 'double_hit', 'roar', 'tail'],
    passive: 'lava_scorch',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_crab: {
    id: 'boss_crab', name: '潮汐巨蟹', emoji: '🦀',
    baseHp: 38, baseSpd: 3,
    skills: ['aqua_shot', 'double_hit', 'tail', 'roar'],
    passive: 'tide_drain',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_golem: {
    id: 'boss_golem', name: '岩甲巨像', emoji: '🗻',
    baseHp: 42, baseSpd: 2,
    skills: ['steel_spike', 'tail', 'roar', 'double_hit'],
    passive: 'rock_guard',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_moss: {
    id: 'boss_moss', name: '苔藓领主', emoji: '🍄',
    baseHp: 46, baseSpd: 4,
    skills: ['leaf_needle', 'poison_sting', 'tail', 'roar'],
    passive: 'spore_venom',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_ghost: {
    id: 'boss_ghost', name: '幽灵船长', emoji: '👻',
    baseHp: 42, baseSpd: 6,
    skills: ['aqua_shot', 'double_hit', 'dark_shock', 'roar'],
    passive: 'ghost_step',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_dragon: {
    id: 'boss_dragon', name: '玄铁渊龙', emoji: '🐉',
    baseHp: 60, baseSpd: 7,
    skills: ['steel_spike', 'double_hit', 'tail', 'roar'],
    passive: 'dragon_thorns',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_demon: {
    id: 'boss_demon', name: '炼狱魔君', emoji: '😈',
    baseHp: 55, baseSpd: 8,
    skills: ['shadow_claw', 'dark_shock', 'double_hit', 'roar'],
    passive: 'demon_frenzy',
    tame: { difficulty: 0 }, rank: 4,
  },
  // 奇遇关「造物」：自创生物，不出现在战斗池，技能由玩家随机组合
  custom_guardian: {
    id: 'custom_guardian', name: '岩甲兽', emoji: '🗿',
    baseHp: 20, baseSpd: 2,
    skills: ['punch', 'tail', 'steel_spike', 'roar', 'heal_light'],
    passive: 'stone_guard',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  custom_fury: {
    id: 'custom_fury', name: '狂焰兽', emoji: '🐺',
    baseHp: 16, baseSpd: 5,
    skills: ['ember', 'double_hit', 'bite', 'flame_burst', 'roar'],
    passive: 'berserk',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  custom_gale: {
    id: 'custom_gale', name: '迅风兽', emoji: '🕊️',
    baseHp: 15, baseSpd: 8,
    skills: ['leaf_needle', 'aqua_shot', 'shadow_claw', 'double_hit', 'poison_sting'],
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
