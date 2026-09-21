/**
 * 竞技场独立怪物池 — 远征模式专属
 * 按层数分层，精英级敌人（rank 2-3）
 */
import { shuffle } from '../rng';
import { TIER2, LEGENDARY } from '../core/growth-map';

/** 竞技场怪物池：按层数从二阶/传奇中抽取 */
export function getGrowthArenaEncounter(layer: number, rng: () => number): { speciesId: string }[] {
  let pool: string[];
  if (layer <= 20) {
    // 1~20层：全二阶
    pool = [...TIER2];
  } else if (layer <= 40) {
    // 21~40层：二阶60% + 传奇40%
    pool = [...TIER2, ...TIER2, ...LEGENDARY, ...LEGENDARY];
  } else {
    // 41~50层：传奇为主
    pool = [...TIER2, ...LEGENDARY, ...LEGENDARY, ...LEGENDARY];
  }
  const shuffled = shuffle(rng, pool);
  return shuffled.slice(0, 3).map((speciesId) => ({ speciesId }));
}
