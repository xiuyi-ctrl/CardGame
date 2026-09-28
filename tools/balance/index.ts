import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseBalanceArgs, type BalanceCliOptions } from '../../src/game/simulation/cli';
import { buildBalanceReport, compareBaseline, renderMarkdown, toBaseline } from '../../src/game/simulation/report';
import { DEFAULT_SIMULATION_STEPS, simulateRun, verifyDeterminism } from '../../src/game/simulation/runner';
import type { BalanceBaseline, SimulationConfig } from '../../src/game/simulation/types';

function getCodeVersion(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function readBaseline(path: string): BalanceBaseline | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as BalanceBaseline;
  } catch {
    return undefined;
  }
}

function configurations(options: BalanceCliOptions): SimulationConfig[] {
  const configs: SimulationConfig[] = [];
  for (const mode of options.modes) {
    // 熟练度当前规则固定普通难度，避免重复三份完全相同的样本。
    const difficulties = mode === 'proficiency' && !options.difficultyExplicit ? ['normal'] as const : options.difficulties;
    for (const difficulty of difficulties) {
      for (let offset = 0; offset < options.seeds; offset += 1) {
        configs.push({ mode, difficulty, seed: options.seedStart + offset, maxSteps: DEFAULT_SIMULATION_STEPS[mode], collectTelemetry: true });
      }
    }
  }
  return configs;
}

export function runCli(args = process.argv.slice(2)): number {
  const options = parseBalanceArgs(args);
  const configs = configurations(options);
  if (configs.length === 0) throw new Error('没有可运行的模式/难度组合');
  const runs = configs.map((config, index) => {
    const result = simulateRun(config);
    if ((index + 1) % 25 === 0 || index + 1 === configs.length) process.stdout.write(`\r已完成 ${index + 1}/${configs.length}`);
    return result;
  });
  process.stdout.write('\n');
  const report = buildBalanceReport(runs, { codeVersion: getCodeVersion(), seedStart: options.seedStart, seedsPerVariant: options.seeds });
  const baselinePath = resolve('tools/balance/baseline.json');
  report.warnings = compareBaseline(report, readBaseline(baselinePath));
  if (options.check) {
    const determinismConfigs = configs.filter((config) => config.seed < options.seedStart + Math.min(10, options.seeds));
    report.hardFailures.push(...verifyDeterminism(determinismConfigs));
  }
  const outputDir = resolve(options.outputDir);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, 'balance-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(resolve(outputDir, 'balance-report.md'), renderMarkdown(report), 'utf8');
  if (options.updateBaseline) {
    mkdirSync(dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, `${JSON.stringify(toBaseline(report), null, 2)}\n`, 'utf8');
  }
  console.log(`报告：${resolve(outputDir, 'balance-report.md')}`);
  for (const warning of report.warnings) console.warn(`警告：${warning}`);
  for (const failure of report.hardFailures) console.error(`失败：${failure}`);
  return report.hardFailures.length > 0 ? 1 : 0;
}

try {
  process.exitCode = runCli();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

