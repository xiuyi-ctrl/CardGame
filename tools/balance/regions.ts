import { mkdirSync, writeFileSync } from 'node:fs';
import { simulateRun } from '../../src/game/simulation/runner';
import { getMonster } from '../../src/game/data/monsters';

// 同种子、同自动玩家策略对比；不更新原基线，不调整游戏参数。
const rows: object[] = [];
for (const region of ['mixed', 'emerald_forest'] as const) {
  for (const difficulty of ['normal', 'hard', 'nightmare'] as const) {
    const runs = [];
    const fusionActs = [0, 0, 0, 0];
    let candidates = 0;
    for (let seed = 0; seed < 100; seed++) {
      let previousFusions = 0;
      const seenRewards = new Set<string>();
      let firstLegendAct: number | null = null;
      let legendaryBeforeUnlock = false;
      const result = simulateRun({ mode: 'main', seed, difficulty, region }, state => {
        const count = state.runStats?.fusions ?? 0;
        fusionActs[state.act] += Math.max(0, count - previousFusions);
        previousFusions = count;
        if (firstLegendAct === null && state.roster.some(u => getMonster(u.speciesId).rank === 3)) {
          firstLegendAct = state.act;
          legendaryBeforeUnlock = state.act === 1 && !state.legendEvolutionUnlocked;
        }
        for (const reward of state.rewards ?? []) {
          const key = `${state.act}:${state.currentNodeId}:${reward.id}`;
          if (!seenRewards.has(key)) { seenRewards.add(key); candidates += reward.recruitCandidates?.length ?? 0; }
        }
      });
      runs.push({ seed, outcome: result.outcome, detail: result.detail, maxAct: result.maxAct,
        fusions: result.economy.fusions, petsTamed: result.economy.petsTamed, firstLegendAct, legendaryBeforeUnlock,
        bosses: result.battles.filter(b => b.nodeType === 'boss').map(b => ({ result: b.result, deaths: b.playerDeaths, rounds: b.rounds })) });
    }
    const row = { region, difficulty, runs: runs.length, wins: runs.filter(r => r.outcome === 'victory').length,
      stuck: runs.filter(r => r.outcome === 'stuck' || r.outcome === 'error').length,
      candidates, fusionActs, firstLegendActs: [1, 2, 3].map(act => runs.filter(r => r.firstLegendAct === act).length),
      legendaryBeforeUnlock: runs.filter(r => r.legendaryBeforeUnlock).length,
      bosses: runs.flatMap(r => r.bosses), samples: runs };
    rows.push(row);
    console.log(JSON.stringify({ ...row, samples: undefined, bosses: row.bosses.length }));
  }
}
mkdirSync('balance-output/regions', { recursive: true });
writeFileSync('balance-output/regions/report.json', JSON.stringify(rows, null, 2));
