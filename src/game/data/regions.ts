import { MAIN_BASE_POOL, MAIN_EVO1_POOL, MAIN_EVO2_POOL, STARTER_GROUP_1, STARTER_GROUP_2 } from './monsters';

export type MainRegionId = 'mixed' | 'emerald_forest';

export interface MainRegionDef {
  id: MainRegionId;
  name: string;
  basePool: readonly string[];
  evo1Pool: readonly string[];
  evo2Pool: readonly string[];
  starters: readonly string[];
  companions: readonly string[];
  bossPools: Readonly<Record<number, readonly string[]>>;
  bossCount: readonly [number, number];
}

/** 保留原混合地区首领池的顺序；现有地图仍直接使用此池。 */
export const MIXED_ACT_BOSS_POOLS: Record<number, string[]> = {
  1: ['boss_vine', 'boss_crab', 'boss_dark'],
  2: ['boss_moss', 'boss_ghost', 'boss_golem'],
  3: ['boss_fire', 'boss_dragon', 'boss_demon'],
};

/** 主模式地区的开局、地图遭遇及随机伙伴来源共用配置。 */
export const MAIN_REGIONS: Record<MainRegionId, MainRegionDef> = {
  mixed: {
    id: 'mixed', name: '混合地区',
    basePool: MAIN_BASE_POOL,
    evo1Pool: MAIN_EVO1_POOL,
    evo2Pool: MAIN_EVO2_POOL,
    starters: STARTER_GROUP_1,
    companions: STARTER_GROUP_2,
    bossPools: MIXED_ACT_BOSS_POOLS,
    bossCount: [2, 3],
  },
  emerald_forest: {
    id: 'emerald_forest', name: '翠影林地',
    basePool: ['momo', 'lulu', 'kiki', 'pipi', 'mimi', 'light_moss', 'fire_fox'],
    evo1Pool: ['momo_queen', 'lulu_king', 'gora', 'sisi', 'mimi_king', 'moss_beast', 'phantom_tail_fox', 'torch_fox'],
    evo2Pool: ['momo_god', 'lulu_god', 'gora_god', 'sisi_god', 'mimi_god', 'solar_spirit', 'nine_tail_sovereign', 'torch_fox_lord'],
    starters: ['momo', 'lulu', 'fire_fox'],
    companions: ['kiki', 'mimi', 'pipi'],
    bossPools: {
      1: ['boss_vine'],
      2: ['boss_moss'],
      3: MIXED_ACT_BOSS_POOLS[3],
    },
    bossCount: [1, 1],
  },
};

export function isMainRegionId(value: unknown): value is MainRegionId {
  return value === 'mixed' || value === 'emerald_forest';
}
