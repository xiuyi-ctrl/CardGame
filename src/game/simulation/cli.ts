import type { Difficulty } from '../state/game';
import type { SimulationMode } from './types';

export interface BalanceCliOptions {
  modes: SimulationMode[];
  difficulties: Difficulty[];
  seeds: number;
  seedStart: number;
  outputDir: string;
  check: boolean;
  updateBaseline: boolean;
  difficultyExplicit: boolean;
}

function valueAfter(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} 缺少参数值`);
  return value;
}

export function parseBalanceArgs(args: string[]): BalanceCliOptions {
  const options: BalanceCliOptions = {
    modes: ['main', 'proficiency'],
    difficulties: ['normal', 'hard', 'nightmare'],
    seeds: 100,
    seedStart: 2000,
    outputDir: 'balance-output/latest',
    check: false,
    updateBaseline: false,
    difficultyExplicit: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--mode') {
      const value = valueAfter(args, i, arg);
      if (!['main', 'proficiency', 'all'].includes(value)) throw new Error(`无效 --mode: ${value}`);
      options.modes = value === 'all' ? ['main', 'proficiency'] : [value as SimulationMode];
      i += 1;
    } else if (arg === '--difficulty') {
      const value = valueAfter(args, i, arg);
      if (!['normal', 'hard', 'nightmare', 'all'].includes(value)) throw new Error(`无效 --difficulty: ${value}`);
      options.difficulties = value === 'all' ? ['normal', 'hard', 'nightmare'] : [value as Difficulty];
      options.difficultyExplicit = true;
      i += 1;
    } else if (arg === '--seeds') {
      options.seeds = Number.parseInt(valueAfter(args, i, arg), 10);
      i += 1;
    } else if (arg === '--seed-start') {
      options.seedStart = Number.parseInt(valueAfter(args, i, arg), 10);
      i += 1;
    } else if (arg === '--out') {
      options.outputDir = valueAfter(args, i, arg);
      i += 1;
    } else if (arg === '--check') {
      options.check = true;
    } else if (arg === '--baseline') {
      options.updateBaseline = true;
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  if (!Number.isInteger(options.seeds) || options.seeds <= 0) throw new Error('--seeds 必须是正整数');
  if (!Number.isInteger(options.seedStart) || options.seedStart < 0) throw new Error('--seed-start 必须是非负整数');
  return options;
}

