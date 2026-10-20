/**
 * 竞技场独立怪物池 — 远征模式专属
 * 按层数分层，精英级敌人（rank 2-3）
 */
import { TIER2, LEGENDARY } from '../core/growth-map';

/** 竞技场怪物池：按层数从二阶/传奇中抽取 */
export function getGrowthArenaEncounter(layer: number, rng: () => number): { speciesId: string }[] {
  let tiers: [string[], number][];
  if (layer <= 20) {
    // 1~20层：全二阶
    tiers = [[TIER2, 1]];
  } else if (layer <= 40) {
    // 保持原代码实际权重：二阶50% + 传奇50%。
    tiers = [[TIER2, 2], [LEGENDARY, 2]];
  } else {
    // 41~50层：传奇为主
    tiers = [[TIER2, 1], [LEGENDARY, 3]];
  }
  const count = layer <= 20 ? 2 : 3;
  // 每个物种保留原有副本上限，以权重归一化消除不同阶级物种数的影响。
  const pool = tiers.flatMap(([species, copies]) => Array.from({ length: copies }, () => species.map(speciesId => ({ speciesId, weight: 1 / species.length }))).flat());
  const enemies: { speciesId: string }[] = [];
  for (let i = 0; i < count; i++) {
    let roll = rng() * pool.reduce((sum, entry) => sum + entry.weight, 0);
    const index = pool.findIndex((entry) => (roll -= entry.weight) < 0);
    const [chosen] = pool.splice(index < 0 ? pool.length - 1 : index, 1);
    enemies.push({ speciesId: chosen.speciesId });
  }
  return enemies;
}
