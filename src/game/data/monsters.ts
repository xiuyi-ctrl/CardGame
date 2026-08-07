import type { MonsterSpecies } from '../types';

export const MONSTERS: Record<string, MonsterSpecies> = {
  momo: {
    id: 'momo', name: '毛毛', emoji: '🐭', element: 'nature',
    baseHp: 10, baseAtk: 3, baseSpd: 3, def: 0,
    hpGrow: 2, atkGrow: 1, spdGrow: 0.3,
    skills: ['punch', 'leaf_needle'],
    evolutions: [{ to: 'momo_queen', level: 3 }],
    tame: { difficulty: 0.75 }, rank: 1,
  },
  lulu: {
    id: 'lulu', name: '露露', emoji: '🐸', element: 'water',
    baseHp: 11, baseAtk: 2, baseSpd: 2, def: 0,
    hpGrow: 2, atkGrow: 1, spdGrow: 0.3,
    skills: ['punch', 'aqua_shot'],
    evolutions: [{ to: 'lulu_king', level: 3 }],
    tame: { difficulty: 0.75 }, rank: 1,
  },
  fifi: {
    id: 'fifi', name: '菲菲', emoji: '🔥', element: 'fire',
    baseHp: 9, baseAtk: 4, baseSpd: 4, def: 0,
    hpGrow: 2, atkGrow: 1, spdGrow: 0.3,
    skills: ['punch', 'ember'],
    evolutions: [{ to: 'fifi_king', level: 3 }],
    tame: { difficulty: 0.75 }, rank: 1,
  },
  kiki: {
    id: 'kiki', name: '基基', emoji: '🛡️', element: 'metal',
    baseHp: 12, baseAtk: 3, baseSpd: 2, def: 1,
    hpGrow: 2, atkGrow: 1, spdGrow: 0.3,
    skills: ['punch', 'steel_spike'],
    evolutions: [{ to: 'gora', level: 3 }],
    tame: { difficulty: 0.7 }, rank: 1,
  },
  mimi: {
    id: 'mimi', name: '咪咪', emoji: '🐍', element: 'shadow',
    baseHp: 10, baseAtk: 3, baseSpd: 3, def: 0,
    hpGrow: 2, atkGrow: 1, spdGrow: 0.3,
    skills: ['bite', 'shadow_claw'],
    tame: { difficulty: 0.7 }, rank: 1,
  },
  pipi: {
    id: 'pipi', name: '皮皮', emoji: '🦔', element: 'nature',
    baseHp: 11, baseAtk: 3, baseSpd: 2, def: 0,
    hpGrow: 2, atkGrow: 1, spdGrow: 0.3,
    skills: ['punch', 'poison_sting'],
    evolutions: [{ to: 'sisi', level: 3 }],
    tame: { difficulty: 0.7 }, rank: 1,
  },
  momo_queen: {
    id: 'momo_queen', name: '毛毛王后', emoji: '🐹', element: 'nature',
    baseHp: 18, baseAtk: 5, baseSpd: 4, def: 1,
    hpGrow: 3, atkGrow: 1, spdGrow: 0.3,
    skills: ['bite', 'leaf_needle', 'heal_light'],
    evolutions: [{ to: 'momo_god', level: 5 }],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  lulu_king: {
    id: 'lulu_king', name: '露露王', emoji: '🐢', element: 'water',
    baseHp: 20, baseAtk: 4, baseSpd: 3, def: 1,
    hpGrow: 3, atkGrow: 1, spdGrow: 0.3,
    skills: ['aqua_shot', 'roar', 'heal_light'],
    evolutions: [{ to: 'lulu_god', level: 5 }],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  fifi_king: {
    id: 'fifi_king', name: '菲菲王', emoji: '🐲', element: 'fire',
    baseHp: 15, baseAtk: 6, baseSpd: 5, def: 0,
    hpGrow: 3, atkGrow: 1, spdGrow: 0.3,
    skills: ['ember', 'double_hit', 'roar'],
    evolutions: [{ to: 'fifi_god', level: 5 }],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  sisi: {
    id: 'sisi', name: '思思', emoji: '🦂', element: 'nature',
    baseHp: 16, baseAtk: 5, baseSpd: 3, def: 1,
    hpGrow: 3, atkGrow: 1, spdGrow: 0.3,
    skills: ['leaf_needle', 'poison_sting', 'roar'],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  gora: {
    id: 'gora', name: '甲兽', emoji: '🐊', element: 'metal',
    baseHp: 19, baseAtk: 4, baseSpd: 2, def: 2,
    hpGrow: 3, atkGrow: 1, spdGrow: 0.3,
    skills: ['steel_spike', 'roar', 'tail'],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  momo_god: {
    id: 'momo_god', name: '毛毛神', emoji: '🐉', element: 'nature',
    baseHp: 30, baseAtk: 8, baseSpd: 6, def: 1,
    hpGrow: 4, atkGrow: 1, spdGrow: 0.4,
    skills: ['bite', 'leaf_needle', 'heal_light', 'roar'],
    tame: { difficulty: 0.3 }, rank: 3,
  },
  lulu_god: {
    id: 'lulu_god', name: '露露神', emoji: '🐳', element: 'water',
    baseHp: 28, baseAtk: 7, baseSpd: 5, def: 1,
    hpGrow: 4, atkGrow: 1, spdGrow: 0.4,
    skills: ['aqua_shot', 'roar', 'heal_light', 'tail'],
    tame: { difficulty: 0.3 }, rank: 3,
  },
  fifi_god: {
    id: 'fifi_god', name: '菲菲神', emoji: '🐉', element: 'fire',
    baseHp: 26, baseAtk: 8, baseSpd: 6, def: 0,
    hpGrow: 4, atkGrow: 1, spdGrow: 0.4,
    skills: ['ember', 'double_hit', 'roar', 'flame_burst'],
    tame: { difficulty: 0.3 }, rank: 3,
  },
  boss_vine: {
    id: 'boss_vine', name: '古树之主', emoji: '🌳', element: 'nature',
    baseHp: 34, baseAtk: 6, baseSpd: 4, def: 1,
    hpGrow: 0, atkGrow: 0, spdGrow: 0,
    skills: ['tail', 'leaf_needle', 'heal_light', 'roar'],
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_dark: {
    id: 'boss_dark', name: '暗影之王', emoji: '😈', element: 'shadow',
    baseHp: 38, baseAtk: 7, baseSpd: 5, def: 1,
    hpGrow: 0, atkGrow: 0, spdGrow: 0,
    skills: ['shadow_claw', 'double_hit', 'poison_sting'],
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_fire: {
    id: 'boss_fire', name: '熔火领主', emoji: '🌋', element: 'fire',
    baseHp: 45, baseAtk: 8, baseSpd: 6, def: 1,
    hpGrow: 0, atkGrow: 0, spdGrow: 0,
    skills: ['flame_burst', 'double_hit', 'roar', 'tail'],
    tame: { difficulty: 0 }, rank: 4,
  },
  // 奇遇关「造物」：自创生物，不出现在战斗池，技能由玩家随机组合
  custom_guardian: {
    id: 'custom_guardian', name: '岩甲兽', emoji: '🗿', element: 'metal',
    baseHp: 20, baseAtk: 4, baseSpd: 2, def: 2,
    hpGrow: 3, atkGrow: 1, spdGrow: 0.3,
    skills: ['punch', 'tail', 'steel_spike', 'roar', 'heal_light'],
    tame: { difficulty: 0.3 }, rank: 3,
  },
  custom_fury: {
    id: 'custom_fury', name: '狂焰兽', emoji: '🐺', element: 'fire',
    baseHp: 16, baseAtk: 7, baseSpd: 5, def: 0,
    hpGrow: 3, atkGrow: 1, spdGrow: 0.4,
    skills: ['ember', 'double_hit', 'bite', 'flame_burst', 'roar'],
    tame: { difficulty: 0.3 }, rank: 3,
  },
  custom_gale: {
    id: 'custom_gale', name: '迅风兽', emoji: '🕊️', element: 'nature',
    baseHp: 15, baseAtk: 5, baseSpd: 8, def: 0,
    hpGrow: 3, atkGrow: 1, spdGrow: 0.4,
    skills: ['leaf_needle', 'aqua_shot', 'shadow_claw', 'double_hit', 'poison_sting'],
    tame: { difficulty: 0.3 }, rank: 3,
  },
};

export const STARTING_CHOICES = ['momo', 'lulu', 'fifi'];

export function getMonster(id: string): MonsterSpecies {
  const m = MONSTERS[id];
  if (!m) throw new Error(`未知怪物: ${id}`);
  return m;
}

export function getEvolution(id: string): string | undefined {
  return MONSTERS[id]?.evolutions?.[0]?.to;
}

export function getEvolveLevel(id: string): number | undefined {
  return MONSTERS[id]?.evolutions?.[0]?.level;
}
