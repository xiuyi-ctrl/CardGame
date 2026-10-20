import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fusionEncounters, simulateFusionTrial, type FusionTrial } from '../../src/game/simulation/fusion-assessment';

// 状态链起手敏感性：不把一回合前瞻忽略铺毒误判成宠物本身必然弱。
const path = resolve('balance-output/fusion-assessment');
const report = JSON.parse(readFileSync(resolve(path, 'fusion-report.json'), 'utf8')) as { seeds: number; seedStart: number; runs: FusionTrial[] };
const probes: FusionTrial[] = [];
for (const id of ['mimi', 'mimi_king']) for (const wounded of [false, true]) {
  for (const encounter of fusionEncounters(id === 'mimi' ? 1 : 2)) for (let offset = 0; offset < report.seeds; offset++) {
    for (const variant of ['empty', 'damage', 'healer'] as const) probes.push(simulateFusionTrial(id, variant, 'lookahead', wounded, encounter, report.seedStart + offset, id === 'mimi' ? 'poison_sting' : 'poison_mist'));
  }
}
const win = (items: FusionTrial[]) => items.filter(item => item.result === 'won').length / items.length * 100;
const summary = ['mimi', 'mimi_king'].flatMap(speciesId => [false, true].flatMap(wounded => ['empty', 'damage', 'healer'].map(variant => {
  const match = (item: FusionTrial) => item.speciesId === speciesId && item.wounded === wounded && item.variant === variant && item.policy === 'lookahead';
  return { speciesId, wounded, variant, defaultWin: win(report.runs.filter(match)), poisonOpeningWin: win(probes.filter(match)) };
})));
writeFileSync(resolve(path, 'fusion-poison-probe.json'), JSON.stringify({ description: '首回合强制原主宠融合结果施放毒刺/毒雾，其余决策维持一回合前瞻；单体毒刺选择当前合法最低HP目标。非最优毒策略，仅作起手敏感性。', summary, runs: probes }), 'utf8');
console.log(JSON.stringify(summary, null, 2));
