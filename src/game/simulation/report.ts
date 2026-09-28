import type {
  BalanceBaseline,
  BalanceReport,
  BalanceVariantSummary,
  NamedMetric,
  SkillMetric,
  SimulationResult,
} from './types';

export const BALANCE_BOT_VERSION = '2.0.0';

export function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits = 4): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function metric(map: Map<string, NamedMetric>, id: string): NamedMetric {
  let item = map.get(id);
  if (!item) {
    item = { id, uses: 0, damage: 0, healing: 0, triggers: 0, appearances: 0, deaths: 0, survivals: 0 };
    map.set(id, item);
  }
  return item;
}

function skillMetric(
  map: Map<string, SkillMetric>,
  run: SimulationResult,
  side: 'player' | 'enemy',
  id: string,
): SkillMetric {
  const key = `${run.config.mode}:${run.config.difficulty}:${side}:${id}`;
  let item = map.get(key);
  if (!item) {
    item = {
      id,
      mode: run.config.mode,
      difficulty: run.config.difficulty,
      side,
      uses: 0,
      damage: 0,
      healing: 0,
      triggers: 0,
      appearances: 0,
      deaths: 0,
      survivals: 0,
      hitTargets: 0,
    };
    map.set(key, item);
  }
  return item;
}

export function buildBalanceReport(
  runs: SimulationResult[],
  options: { codeVersion: string; seedStart: number; seedsPerVariant: number },
): BalanceReport {
  const grouped = new Map<string, SimulationResult[]>();
  const skills = new Map<string, SkillMetric>();
  const monsters = new Map<string, NamedMetric>();
  const passives = new Map<string, NamedMetric>();
  const nodeResults: BalanceReport['nodeResults'] = {};
  const hardFailures: string[] = [];

  for (const run of runs) {
    const key = `${run.config.mode}:${run.config.difficulty}`;
    grouped.set(key, [...(grouped.get(key) ?? []), run]);
    if (run.outcome === 'stuck' || run.outcome === 'error') {
      hardFailures.push(`${key} seed=${run.config.seed}: ${run.detail}`);
    }
    for (const unit of run.finalRoster) metric(monsters, unit.speciesId).survivals += 1;
    for (const battle of run.battles) {
      const nodeKey = `${run.config.mode}:${run.config.difficulty}:${battle.nodeType}`;
      const node = nodeResults[nodeKey] ?? { battles: 0, wins: 0, losses: 0 };
      node.battles += 1;
      node[battle.result === 'won' ? 'wins' : 'losses'] += 1;
      nodeResults[nodeKey] = node;
      const appeared = new Set<string>();
      for (const event of battle.telemetry) {
        if (event.actorSpeciesId) appeared.add(event.actorSpeciesId);
        if (event.targetSpeciesId) appeared.add(event.targetSpeciesId);
        const eventSide = event.side === 'player' || event.side === 'enemy' ? event.side : undefined;
        if (event.kind === 'skill-use' && event.skillId && eventSide) {
          const item = skillMetric(skills, run, eventSide, event.skillId);
          item.uses += 1;
          item.hitTargets += event.targetCount ?? (event.targetUid ? 1 : 0);
        }
        if (event.kind === 'damage' && event.skillId && eventSide) skillMetric(skills, run, eventSide, event.skillId).damage += event.amount ?? 0;
        if (event.kind === 'heal' && event.skillId && eventSide) skillMetric(skills, run, eventSide, event.skillId).healing += event.amount ?? 0;
        if (event.kind === 'passive-trigger' && event.passiveId) metric(passives, event.passiveId).triggers += 1;
        if (event.kind === 'death' && event.targetSpeciesId) metric(monsters, event.targetSpeciesId).deaths += 1;
      }
      for (const speciesId of appeared) metric(monsters, speciesId).appearances += 1;
    }
  }

  const variants: BalanceVariantSummary[] = [...grouped.entries()].map(([key, sample]) => {
    const [mode, difficulty] = key.split(':') as [BalanceVariantSummary['mode'], BalanceVariantSummary['difficulty']];
    const battles = sample.flatMap((run) => run.battles);
    const bosses = battles.filter((battle) => battle.nodeType === 'boss');
    const bossWins = bosses.filter((battle) => battle.result === 'won').length;
    return {
      mode,
      difficulty,
      runs: sample.length,
      victories: sample.filter((run) => run.outcome === 'victory').length,
      gameovers: sample.filter((run) => run.outcome === 'gameover').length,
      stuck: sample.filter((run) => run.outcome === 'stuck').length,
      errors: sample.filter((run) => run.outcome === 'error').length,
      winRate: round(sample.filter((run) => run.outcome === 'victory').length / sample.length),
      bossReachedRate: round(sample.filter((run) => run.battles.some((battle) => battle.nodeType === 'boss')).length / sample.length),
      bossWinRate: bosses.length === 0 ? 0 : round(bossWins / bosses.length),
      battleRoundsP50: percentile(battles.map((battle) => battle.rounds), 0.5),
      battleRoundsP95: percentile(battles.map((battle) => battle.rounds), 0.95),
      fatigueRate: battles.length === 0 ? 0 : round(battles.filter((battle) => battle.fatigueTriggered).length / battles.length),
      averageGoldEarned: round(average(sample.map((run) => run.economy.goldEarned)), 2),
      averageGoldSpent: round(average(sample.map((run) => run.economy.goldSpent)), 2),
      averagePetsLost: round(average(sample.map((run) => run.economy.petsLost)), 2),
      averageGrowthEarned: round(average(sample.map((run) => run.economy.growthPointsEarned)), 2),
      averageGrowthSpent: round(average(sample.map((run) => run.economy.growthPointsSpent)), 2),
      averageMaxLayer: round(average(sample.map((run) => run.maxLayer)), 2),
    };
  });

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    codeVersion: options.codeVersion,
    botVersion: BALANCE_BOT_VERSION,
    seedStart: options.seedStart,
    seedsPerVariant: options.seedsPerVariant,
    variants,
    skills: [...skills.values()].sort((a, b) => a.mode.localeCompare(b.mode) || a.difficulty.localeCompare(b.difficulty) || a.side.localeCompare(b.side) || b.uses - a.uses || a.id.localeCompare(b.id)),
    monsters: [...monsters.values()].sort((a, b) => b.appearances - a.appearances || a.id.localeCompare(b.id)),
    passives: [...passives.values()].sort((a, b) => b.triggers - a.triggers || a.id.localeCompare(b.id)),
    nodeResults,
    warnings: [],
    hardFailures,
    runs,
  };
}

function relativeDelta(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : Infinity;
  return Math.abs(current - previous) / Math.abs(previous);
}

export function compareBaseline(report: BalanceReport, baseline?: BalanceBaseline): string[] {
  if (!baseline) return ['未找到基线文件，仅生成当前报告。'];
  const warnings: string[] = [];
  for (const current of report.variants) {
    const previous = baseline.variants.find((item) => item.mode === current.mode && item.difficulty === current.difficulty);
    if (!previous) {
      warnings.push(`${current.mode}/${current.difficulty} 没有对应基线。`);
      continue;
    }
    for (const field of ['winRate', 'bossReachedRate', 'bossWinRate'] as const) {
      if (Math.abs(current[field] - previous[field]) > 0.1) warnings.push(`${current.mode}/${current.difficulty} ${field} 变化超过 10 个百分点。`);
    }
    for (const field of ['battleRoundsP50', 'battleRoundsP95', 'averageGoldEarned', 'averageGoldSpent', 'averagePetsLost', 'averageGrowthEarned', 'averageGrowthSpent', 'averageMaxLayer'] as const) {
      if (relativeDelta(current[field], previous[field]) > 0.2) warnings.push(`${current.mode}/${current.difficulty} ${field} 相对变化超过 20%。`);
    }
  }
  const variantKey = (item: { mode: string; difficulty: string }) => `${item.mode}:${item.difficulty}`;
  const currentVariants = report.variants.map(variantKey).sort().join(',');
  const baselineVariants = baseline.variants.map(variantKey).sort().join(',');
  if (currentVariants !== baselineVariants || report.seedsPerVariant !== baseline.seedsPerVariant || report.seedStart !== baseline.seedStart) {
    warnings.push('当前运行范围与基线不同，跳过技能、生物和被动的总量差异比较。');
    return warnings;
  }
  for (const group of ['skills', 'monsters', 'passives'] as const) {
    for (const current of report[group]) {
      const previous = baseline[group].find((item) => {
        if (item.id !== current.id) return false;
        if (group !== 'skills') return true;
        const scopedCurrent = current as SkillMetric;
        const scopedPrevious = item as SkillMetric;
        return scopedPrevious.mode === scopedCurrent.mode && scopedPrevious.difficulty === scopedCurrent.difficulty && scopedPrevious.side === scopedCurrent.side;
      });
      const sample = group === 'skills' ? current.uses : group === 'monsters' ? current.appearances : current.triggers;
      if (!previous || sample < 30) continue;
      const fields: Array<keyof NamedMetric> = group === 'skills' ? ['uses', 'damage', 'healing'] : group === 'monsters' ? ['appearances', 'deaths', 'survivals'] : ['triggers'];
      for (const field of fields) {
        const now = current[field] as number;
        const before = previous[field] as number;
        if (relativeDelta(now, before) > 0.25) {
          const scope = group === 'skills' ? `${(current as SkillMetric).mode}/${(current as SkillMetric).difficulty}/${(current as SkillMetric).side}/` : '';
          warnings.push(`${group}/${scope}${current.id} 的 ${field} 变化超过 25%。`);
        }
      }
    }
  }
  return warnings;
}

export function toBaseline(report: BalanceReport): BalanceBaseline {
  const { generatedAt: _generatedAt, runs: _runs, warnings: _warnings, hardFailures: _hardFailures, ...baseline } = report;
  return JSON.parse(JSON.stringify(baseline)) as BalanceBaseline;
}

/** 聚合完成后移除逐事件遥测，避免 1000 种子报告超过 Node 单字符串上限。 */
export function compactRunTelemetry(report: BalanceReport): void {
  for (const run of report.runs) {
    for (const battle of run.battles) battle.telemetry = [];
  }
}

export function renderMarkdown(report: BalanceReport): string {
  const lines = [
    '# 数值平衡报告',
    '',
    `- 生成时间：${report.generatedAt}`,
    `- 代码版本：${report.codeVersion}`,
    `- 自动玩家版本：${report.botVersion}`,
    `- 种子：${report.seedStart} 起，每个配置 ${report.seedsPerVariant} 个`,
    '',
    '## 模式汇总',
    '',
    '| 模式 | 难度 | 局数 | 胜率 | 卡死/异常 | Boss到达/胜率 | 轮数P50/P95 | 疲劳率 | 平均金币收/支 | 平均成长获/用 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const item of report.variants) {
    lines.push(`| ${item.mode} | ${item.difficulty} | ${item.runs} | ${(item.winRate * 100).toFixed(1)}% | ${item.stuck}/${item.errors} | ${(item.bossReachedRate * 100).toFixed(1)}% / ${(item.bossWinRate * 100).toFixed(1)}% | ${item.battleRoundsP50}/${item.battleRoundsP95} | ${(item.fatigueRate * 100).toFixed(1)}% | ${item.averageGoldEarned}/${item.averageGoldSpent} | ${item.averageGrowthEarned}/${item.averageGrowthSpent} |`);
  }
  lines.push('', '## 节点战斗', '', '| 配置与节点 | 战斗 | 胜 | 负 |', '|---|---:|---:|---:|');
  for (const [id, item] of Object.entries(report.nodeResults).sort(([a], [b]) => a.localeCompare(b))) lines.push(`| ${id} | ${item.battles} | ${item.wins} | ${item.losses} |`);
  const renderMetrics = (title: string, items: NamedMetric[]) => {
    lines.push('', `## ${title}`, '', '| ID | 使用/触发 | 伤害 | 治疗 | 登场 | 死亡 | 最终存活 |', '|---|---:|---:|---:|---:|---:|---:|');
    for (const item of items.slice(0, 30)) lines.push(`| ${item.id} | ${item.uses || item.triggers} | ${item.damage} | ${item.healing} | ${item.appearances} | ${item.deaths} | ${item.survivals} |`);
  };
  lines.push('', '## 技能排行', '', '| 模式 | 难度 | 阵营 | ID | 使用 | 目标数 | 伤害 | 治疗 |', '|---|---|---|---|---:|---:|---:|---:|');
  for (const item of report.skills.slice(0, 60)) lines.push(`| ${item.mode} | ${item.difficulty} | ${item.side} | ${item.id} | ${item.uses} | ${item.hitTargets} | ${item.damage} | ${item.healing} |`);
  renderMetrics('生物排行', report.monsters);
  renderMetrics('被动排行', report.passives);
  lines.push('', '## 告警', '');
  lines.push(...(report.warnings.length ? report.warnings.map((warning) => `- ${warning}`) : ['- 无']));
  lines.push('', '## 硬失败', '');
  lines.push(...(report.hardFailures.length ? report.hardFailures.map((failure) => `- ${failure}`) : ['- 无']));
  return `${lines.join('\n')}\n`;
}

