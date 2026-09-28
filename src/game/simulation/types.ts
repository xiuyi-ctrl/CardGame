import type { BattleTelemetryEvent } from '../types';
import type { Difficulty, MapNode } from '../state/game';

export type SimulationMode = 'main' | 'proficiency';
export type SimulationOutcome = 'victory' | 'gameover' | 'stuck' | 'error';

export interface SimulationConfig {
  mode: SimulationMode;
  difficulty: Difficulty;
  seed: number;
  maxSteps: number;
  collectTelemetry: boolean;
}

export interface BattleSimulationSummary {
  nodeType: MapNode['type'] | 'unknown';
  result: 'won' | 'lost';
  rounds: number;
  fatigueTriggered: boolean;
  playerDeaths: number;
  enemyDeaths: number;
  telemetry: BattleTelemetryEvent[];
}

export interface SimulationResult {
  config: SimulationConfig;
  outcome: SimulationOutcome;
  detail: string;
  steps: number;
  elapsedMs: number;
  maxAct: number;
  maxLayer: number;
  specials: number;
  finalSignature: string;
  battles: BattleSimulationSummary[];
  economy: {
    goldEarned: number;
    goldSpent: number;
    shopVisits: number;
    fusions: number;
    petsTamed: number;
    petsLost: number;
    growthPointsEarned: number;
    growthPointsSpent: number;
    skillEnhancements: number;
    arenaResults: Record<string, number>;
  };
  finalRoster: Array<{ speciesId: string; hp: number; maxHp: number; growthPoints: number }>;
}

export interface NamedMetric {
  id: string;
  uses: number;
  damage: number;
  healing: number;
  triggers: number;
  appearances: number;
  deaths: number;
  survivals: number;
}

export interface SkillMetric extends NamedMetric {
  mode: SimulationMode;
  difficulty: Difficulty;
  side: 'player' | 'enemy';
  /** 所有 skill-use 事件解析出的目标数之和。 */
  hitTargets: number;
}

export interface BalanceVariantSummary {
  mode: SimulationMode;
  difficulty: Difficulty;
  runs: number;
  victories: number;
  gameovers: number;
  stuck: number;
  errors: number;
  winRate: number;
  bossReachedRate: number;
  bossWinRate: number;
  battleRoundsP50: number;
  battleRoundsP95: number;
  fatigueRate: number;
  averageGoldEarned: number;
  averageGoldSpent: number;
  averagePetsLost: number;
  averageGrowthEarned: number;
  averageGrowthSpent: number;
  averageMaxLayer: number;
}

export interface BalanceReport {
  schemaVersion: 2;
  generatedAt: string;
  codeVersion: string;
  botVersion: string;
  seedStart: number;
  seedsPerVariant: number;
  variants: BalanceVariantSummary[];
  skills: SkillMetric[];
  monsters: NamedMetric[];
  passives: NamedMetric[];
  nodeResults: Record<string, { battles: number; wins: number; losses: number }>;
  warnings: string[];
  hardFailures: string[];
  runs: SimulationResult[];
}

export type BalanceBaseline = Omit<BalanceReport, 'generatedAt' | 'runs' | 'warnings' | 'hardFailures'>;

