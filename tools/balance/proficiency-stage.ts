/** 第15层首领与11～20层专项；只读取运行数据，反事实战斗使用独立快照。 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createBattle, resetUidSequenceForSimulation } from '../../src/game/core/battle';
import { applyGrowthChoice, applySkillEnhanceStone, getSkillEnhanceCost, getSkillEnhanceMaxLevel } from '../../src/game/core/growth';
import { getGrowthEncounter, getGrowthEliteEncounter } from '../../src/game/core/growth-map';
import { getMonster } from '../../src/game/data/monsters';
import { getSkill } from '../../src/game/data/skills';
import { createRng } from '../../src/game/rng';
import { ACT_BOSS_POOLS, BOSS_MINIONS, maxFieldForEnemy, type GameState } from '../../src/game/state/game';
import { createInitialState, gameReducer } from '../../src/game/state/reducer';
import { simulateRun, simulationStep } from '../../src/game/simulation/runner';
import { BALANCE_BOT_VERSION } from '../../src/game/simulation/report';
import type { BattleState, Unit } from '../../src/game/types';

const count = Number(process.argv.find(arg => arg.startsWith('--seeds='))?.split('=')[1] ?? 300);
const seedStart = Number(process.argv.find(arg => arg.startsWith('--seed-start='))?.split('=')[1] ?? 2000);
const output = resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'dump/proficiency-stage');
if (!Number.isInteger(count) || count <= 0 || !Number.isInteger(seedStart)) throw Error('种子数量和起点必须为整数，数量必须大于0');
mkdirSync(output, { recursive: true });

function unitSummary(unit: Unit) {
  return { id: unit.speciesId, hp: unit.hp, maxHp: unit.maxHp, spd: unit.spd, gp: unit.growthPoints ?? 0,
    hpBonus: unit.bonusStats?.hp ?? 0, spdBonus: unit.bonusStats?.spd ?? 0,
    skills: unit.skills, enhancement: unit.skillEnhancements ?? {} };
}
type Start = { seed: number; layer: number; kind: string; boss: string; players: ReturnType<typeof unitSummary>[];
  enemies: ReturnType<typeof unitSummary>[]; rosterSize: number; rosterGp: number };
type Row = Start & { result: string; rounds: number; deaths: number; hpLossRatio: number; skippedOrders: number };
function start(state: Readonly<GameState>): Start {
  const battle = state.battle!;
  return { seed: state.seed, layer: state.currentLayer!, kind: state.eventBattle ? `event:${state.eventBattle.growthTrial ?? 'legacy'}`
    : state.arena3Pending ? `arena:${state.arena3Pending.mode}` : battle.nodeType ?? 'unknown',
  boss: battle.enemyUnits.find(unit => ACT_BOSS_POOLS[1].includes(unit.speciesId))?.speciesId ?? '',
  players: battle.playerUnits.map(unitSummary), enemies: battle.enemyUnits.map(unitSummary), rosterSize: state.roster.length,
  rosterGp: state.roster.reduce((sum, unit) => sum + (unit.growthPoints ?? 0), 0) };
}
function finish(initial: Start, battle: BattleState): Row {
  const remaining = battle.playerUnits.filter(unit => unit.hp > 0);
  return { ...initial, result: battle.phase, rounds: battle.round,
    deaths: initial.players.length - remaining.length,
    hpLossRatio: Math.max(0, initial.players.reduce((sum, unit) => sum + unit.hp, 0) - remaining.reduce((sum, unit) => sum + unit.hp, 0))
      / initial.players.reduce((sum, unit) => sum + unit.maxHp, 0),
    skippedOrders: battle.log.filter(entry => entry.side === 'player' && entry.text.includes('选择的目标已死亡或离场')).length };
}

const natural: Row[] = [], snapshots: GameState[] = [];
const runs: { seed: number; outcome: string; maxLayer: number; detail: string }[] = [];
for (let index = 0; index < count; index++) {
  let active: Start | undefined, key = '', captured = false;
  const result = simulateRun({ mode: 'proficiency', seed: seedStart + index, collectTelemetry: false }, state => {
    if (!captured && state.screen === 'formation' && state.currentLayer === 15 && state.formation?.options?.nodeType === 'boss') {
      snapshots.push(structuredClone(state) as GameState); captured = true;
    }
    if (state.screen !== 'battle' || !state.battle || (state.currentLayer ?? 0) > 20) return;
    const currentKey = `${state.currentNodeId}:${state.battle.enemyUnits.map(unit => unit.uid).join(',')}`;
    if (key !== currentKey) { key = currentKey; active = start(state); }
    if (active && state.battle.phase !== 'acting') { natural.push(finish(active, state.battle)); active = undefined; }
  });
  runs.push({ seed: result.config.seed, outcome: result.outcome, maxLayer: result.maxLayer, detail: result.detail });
  if ((index + 1) % 25 === 0) console.log(`自然流程 ${index + 1}/${count}`);
}

/** 独立的分配策略对照：不改变战斗选技，只为首个攻击技能＋1保留实际强化费用。 */
const reserveRows: Row[] = [], reserveRuns: { seed: number; outcome: string }[] = [];
const starters = ['momo', 'lulu', 'fifi', 'kiki', 'mimi', 'pipi'];
for (let index = 0; index < count; index++) {
  const seed = seedStart + index, starterId = starters[seed % starters.length];
  const companions = starters.filter(id => id !== starterId);
  resetUidSequenceForSimulation(seed);
  let state = gameReducer(createInitialState(), { type: 'START_PROFICIENCY_PICKED', seed, starterId,
    companionId: companions[Math.floor(seed / starters.length) % companions.length] });
  let active: Start | undefined, key = '', outcome = 'stuck';
  for (let step = 0; step < 6000; step++) {
    if ((state.currentLayer ?? 1) > 20) { outcome = 'alive-after20'; break; }
    if (state.screen === 'proficiency-result' || state.screen === 'gameover') { outcome = 'gameover'; break; }
    if (state.screen === 'battle' && state.battle) {
      const currentKey = `${state.currentNodeId}:${state.battle.enemyUnits.map(unit => unit.uid).join(',')}`;
      if (key !== currentKey) { key = currentKey; active = start(state); }
      if (active && state.battle.phase !== 'acting') { reserveRows.push(finish(active, state.battle)); active = undefined; }
    }
    if (state.screen === 'growth-menu' && !state.specialPending && !state.growthEncounterPending) {
      let improved = false;
      for (const unit of state.roster) {
        const slot = unit.skills.findIndex((id, slot) => getSkill(id).kind === 'attack'
          && !(unit.skillEnhancements?.[slot]) && getSkillEnhanceMaxLevel(id) > 0);
        // 只为第一个可强化攻击技能保留一次费用；已有任一攻击＋1就不再保留。
        const hasAttackEnhance = unit.skills.some((id, slot) => getSkill(id).kind === 'attack' && (unit.skillEnhancements?.[slot] ?? 0) >= 1);
        const reserve = !hasAttackEnhance && slot >= 0 ? getSkillEnhanceCost(unit, slot) : 0;
        const updatedUnit = applyGrowthChoice(unit, { kind: 'hp', amount: 2 }) ?? applyGrowthChoice(unit, { kind: 'spd', amount: 1 });
        if (updatedUnit && (updatedUnit.growthPoints ?? 0) >= reserve) {
          state = gameReducer(state, { type: 'PROF_GROWTH_APPLY', uid: unit.uid, updatedUnit }); improved = true; break;
        }
      }
      if (!improved) state = gameReducer(state, { type: 'NEXT_NODE' });
    } else state = simulationStep(state, seed);
  }
  reserveRuns.push({ seed, outcome });
  if ((index + 1) % 25 === 0) console.log(`保留强化费策略 ${index + 1}/${count}`);
}

type Variant = 'original' | 'full-health' | 'hp+4' | 'skill+1';
function variantRoster(roster: Unit[], variant: Variant): Unit[] {
  return roster.map(unit => {
    if (variant === 'full-health') return { ...unit, hp: unit.maxHp };
    if (variant === 'hp+4') return { ...unit, hp: unit.hp + 4, maxHp: unit.maxHp + 4 };
    if (variant !== 'skill+1') return unit;
    const slot = unit.skills.findIndex((id, slot) => getSkill(id).kind === 'attack' && (unit.skillEnhancements?.[slot] ?? 0) < getSkillEnhanceMaxLevel(id));
    return slot >= 0 ? applySkillEnhanceStone(unit, slot) ?? unit : unit;
  });
}
function counterfactual(snapshot: GameState, layer: number, kind: 'battle' | 'elite' | 'boss', enemies: { speciesId: string }[], variant: Variant, fieldLimit = maxFieldForEnemy(enemies.length, 'proficiency')): Row {
  resetUidSequenceForSimulation(snapshot.seed);
  const roster = variantRoster(structuredClone(snapshot.roster), variant);
  const units = roster.filter(unit => unit.hp > 0).slice(0, fieldLimit)
    .map((unit, index) => ({ ...unit, row: 'front' as const, column: index as 0 | 1 | 2 }));
  let state: GameState = { ...structuredClone(snapshot), screen: 'battle', formation: undefined, eventBattle: undefined, arena3Pending: undefined,
    currentLayer: layer, currentRow: layer - 1, roster,
    battle: createBattle(units, enemies, snapshot.seed + 14 * 17,
      { act: 1, layer, nodeType: kind, difficulty: 'normal', untameable: true, encounterHpMult: kind === 'boss' ? .95 : 1 }) };
  const initial = start(state);
  for (let step = 0; step < 1200 && state.battle!.phase === 'acting'; step++) state = simulationStep(state, snapshot.seed);
  return finish(initial, state.battle!);
}
const controlled: Record<string, Row[]> = {};
const add = (key: string, row: Row) => { (controlled[key] ??= []).push(row); };
for (const [index, snapshot] of snapshots.entries()) {
  for (const boss of ACT_BOSS_POOLS[1]) {
    const encounter = [{ speciesId: boss }, ...(BOSS_MINIONS[boss] ?? []).slice(0, 1).map(speciesId => ({ speciesId }))];
    for (const variant of ['original', 'full-health', 'hp+4', 'skill+1'] as const)
      add(`${boss}:${variant}`, counterfactual(snapshot, 15, 'boss', encounter, variant));
    // 保持三名出战者，单独移除随从，避免把减少随从与减少我方人数混在一起。
    add(`${boss}:no-minion-same-field`, counterfactual(snapshot, 15, 'boss', [{ speciesId: boss }], 'original', maxFieldForEnemy(encounter.length, 'proficiency')));
  }
  for (const layer of [12, 14, 16, 18, 20]) for (const kind of ['battle', 'elite'] as const) {
    const encounter = (kind === 'elite' ? getGrowthEliteEncounter : getGrowthEncounter)(layer, createRng(snapshot.seed * 7919 + 5039));
    add(`layer${layer}:${kind}`, counterfactual(snapshot, layer, kind, encounter, 'original'));
  }
  if ((index + 1) % 25 === 0) console.log(`同队对照 ${index + 1}/${snapshots.length}`);
}

const average = (rows: Row[], value: (row: Row) => number) => rows.length ? rows.reduce((sum, row) => sum + value(row), 0) / rows.length : 0;
const round = (value: number) => Number(value.toFixed(4));
function summarize(rows: Row[]) {
  const ordered = rows.map(row => row.rounds).sort((a, b) => a - b);
  return { samples: rows.length, wins: rows.filter(row => row.result === 'won').length,
    winRate: round(average(rows, row => Number(row.result === 'won'))),
    meanRounds: round(average(rows, row => row.rounds)), p95Rounds: ordered[Math.max(0, Math.ceil(rows.length * .95) - 1)] ?? 0,
    meanDeaths: round(average(rows, row => row.deaths)), anyDeathRate: round(average(rows, row => Number(row.deaths > 0))),
    netHpLoss: round(average(rows, row => row.hpLossRatio)), meanSkippedOrders: round(average(rows, row => row.skippedOrders)),
    meanField: round(average(rows, row => row.players.length)), meanRoster: round(average(rows, row => row.rosterSize)),
    meanFieldHp: round(average(rows, row => row.players.reduce((sum, unit) => sum + unit.maxHp, 0))),
    meanHpBonus: round(average(rows, row => row.players.reduce((sum, unit) => sum + unit.hpBonus, 0) / row.players.length)),
    meanSpdBonus: round(average(rows, row => row.players.reduce((sum, unit) => sum + unit.spdBonus, 0) / row.players.length)),
    meanSkillLevels: round(average(rows, row => row.players.reduce((sum, unit) => sum + Object.values(unit.enhancement).reduce((a, b) => a + b, 0), 0))),
    meanUnspentGp: round(average(rows, row => row.rosterGp)) };
}
const naturalSummary: Record<string, ReturnType<typeof summarize>> = {};
for (const layer of Array.from({ length: 20 }, (_, i) => i + 1)) for (const kind of ['battle', 'elite', 'boss']) {
  const rows = natural.filter(row => row.layer === layer && row.kind === kind);
  if (rows.length) naturalSummary[`layer${layer}:${kind}`] = summarize(rows);
}
for (const boss of ACT_BOSS_POOLS[1]) naturalSummary[boss] = summarize(natural.filter(row => row.layer === 15 && row.boss === boss));
const controlledSummary = Object.fromEntries(Object.entries(controlled).map(([key, rows]) => [key, summarize(rows)]));
const reserveSummary = Object.fromEntries(['boss_vine', 'boss_crab', 'boss_dark'].map(boss => [boss, summarize(reserveRows.filter(row => row.layer === 15 && row.boss === boss))]));
reserveSummary.firstBoss = summarize(reserveRows.filter(row => row.layer === 15 && row.kind === 'boss'));
const failures = [...runs.filter(run => run.outcome === 'error' || run.outcome === 'stuck'),
  ...reserveRuns.filter(run => run.outcome === 'stuck'),
  ...Object.entries(controlled).flatMap(([key, rows]) => rows.filter(row => row.result === 'acting').map(row => ({ scenario: key, seed: row.seed })))];
const report = { generatedAt: new Date().toISOString(), botVersion: BALANCE_BOT_VERSION, seeds: count, seedStart,
  snapshots: snapshots.length, reachedFirstBossRate: snapshots.length / count, failures,
  naturalSummary, controlledSummary, reserveSummary, reserveRuns, reserveRows, runs, natural, controlled };
writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
function table(summary: Record<string, ReturnType<typeof summarize>>) {
  return ['| 场景 | 样本 | 胜率 | 平均回合 | P95回合 | 平均阵亡 | 净血损 |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...Object.entries(summary).map(([key, row]) => `| ${key.replace(/boss_\w+/g, id => getMonster(id).name)} | ${row.samples} | ${(row.winRate * 100).toFixed(1)}% | ${row.meanRounds.toFixed(2)} | ${row.p95Rounds} | ${row.meanDeaths.toFixed(2)} | ${(row.netHpLoss * 100).toFixed(1)}% |`)].join('\n');
}
writeFileSync(resolve(output, 'metrics.md'), `# 熟练度第15层专项原始指标\n\n自动玩家${BALANCE_BOT_VERSION}，种子${seedStart}～${seedStart + count - 1}；首领前快照${snapshots.length}份。\n\n## 自然流程\n\n${table(naturalSummary)}\n\n## 同队对照\n\n${table(controlledSummary)}\n\n## 保留强化费策略\n\n${table(reserveSummary)}\n`);
console.log(`完成：${snapshots.length}份快照，${failures.length}项异常；${output}`);
if (failures.length) process.exitCode = 1;
