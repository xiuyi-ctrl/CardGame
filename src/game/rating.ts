import { canStepTo, type GameState, type RunStats, type RunMap } from './state/game';
import type { BattleState } from './types';

export interface MainRatingStats {
  version: 2;
  acts: Record<string, { totalRows: number; completedRows: number[]; bossDefeated: boolean; challengeTarget: number }>;
  battles: Record<string, { act: number; type: string; won: boolean; rounds: number; participants: number; deaths: number; enemyCount: number }>;
}

export interface RatingDimension {
  key: string;
  name: string;
  weight: number;
  score: number;
  points: number;
  grade: string;
}

export interface RunRating {
  score: number;
  grade: string;
  label: string;
  dimensions: RatingDimension[];
  note?: string;
  legacy: boolean;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const gradeOf = (score: number) => score >= 90 ? 'S' : score >= 75 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : 'D';
const labels: Record<string, string> = { S: '传奇远征者', A: '精锐指挥官', B: '可靠旅人', C: '初生牛犊', D: '幸存者' };
const challengePoints = (type: string) => ['elite', 'corrupted', 'guardian'].includes(type) ? 2 : ['arena', 'gauntlet'].includes(type) ? 3 : 0;

export function emptyMainRating(): MainRatingStats {
  return { version: 2, acts: {}, battles: {} };
}

/** 按无需钥匙的可达路线校准目标，避免地图本身不给足挑战机会。 */
export function mapChallengeTarget(map: RunMap): number {
  let previous: { col?: number; value: number }[] = [];
  for (let row = 0; row < map.layers.length; row++) {
    previous = map.layers[row].filter(node => !map.disabled?.[node.id] && node.type !== 'keydoor').map(node => {
      const parents = row === 0 ? [0] : previous.filter(parent => canStepTo(row - 1, parent.col, node, map)).map(parent => parent.value);
      return { col: node.col, value: parents.length ? Math.max(...parents) + challengePoints(node.type) : -Infinity };
    });
  }
  return clamp(Math.max(0, ...previous.map(node => node.value)), 0, 5);
}

function dimension(key: string, name: string, weight: number, points: number): RatingDimension {
  const bounded = clamp(points, 0, weight);
  const score = Math.round(bounded / weight * 100);
  return { key, name, weight, points: Math.round(bounded * 10) / 10, score, grade: gradeOf(score) };
}

/** 只记录已确认结算的真实战斗；同一幕同一节点不重复得分。 */
function recordBattle(rating: MainRatingStats, state: GameState, battle: BattleState): MainRatingStats {
  const key = `${state.act}:${state.currentNodeId}`;
  if (rating.battles[key]) return rating;
  const units = [...new Map([...battle.playerUnits, ...(battle.playerDown ?? [])].map(unit => [unit.uid, unit])).values()];
  const node = state.map.layers[state.currentRow]?.find(n => n.id === state.currentNodeId);
  const record = {
    act: state.act, type: state.eventBattle ? 'event' : node?.type ?? 'battle',
    won: battle.phase === 'won', rounds: Math.max(1, battle.round),
    participants: units.length, deaths: units.filter(unit => unit.hp <= 0).length,
    enemyCount: battle.gauntlet?.total ?? battle.enemyUnits.length + battle.pendingTame.length,
  };
  return { ...rating, battles: { ...rating.battles, [key]: record } };
}

/** 在状态动作完成后更新评分账本，查看页面、取消布阵和读档均不计进度。 */
export function trackMainRating(state: GameState, next: GameState, action: string): GameState {
  if (next !== state && action === 'DEBUG_JUMP' && next.runStats?.rating) return { ...next, runStats: { ...next.runStats, rating: undefined } };
  if (next === state || state.runMode === 'proficiency' || next.runMode === 'proficiency' || state.testRun || next.testRun
    || !state.runStats?.rating || !next.runStats || ['LOAD_GAME', 'START_RUN', 'RETRY', 'TITLE', 'DEBUG_JUMP', 'DEBUG_CUSTOM_TEST'].includes(action)) return next;
  let rating = state.runStats.rating;
  const key = String(state.act);
  const node = state.map.layers[state.currentRow]?.find(n => n.id === state.currentNodeId);
  const finishedBattle = action === 'BATTLE_END_CONFIRM' && state.battle && ['won', 'lost'].includes(state.battle.phase);
  if (finishedBattle) rating = recordBattle(rating, state, state.battle!);
  const won = finishedBattle && state.battle!.phase === 'won';
  const nonBattle = node && !['battle', 'elite', 'boss', 'corrupted', 'guardian', 'arena', 'gauntlet'].includes(node.type);
  const completed = node && !(action === 'CLOSE_WATCHTOWER' && state.watchtowerReopened)
    && (won || (finishedBattle && next.screen !== 'gameover') || action === 'NEXT_NODE' || (action === 'USE_SKIP' && next.screen === 'reward')
    || (nonBattle && next.screen === 'map' && next.currentNodeId === state.currentNodeId && !['BACK_TO_MAP', 'CLOSE_BACKPACK', 'CANCEL_SKIP', 'CANCEL_SCOUT', 'CLEAR_TOAST', 'SHOW_TOAST', 'OPEN_SKIP', 'OPEN_SCOUT'].includes(action)));
  // 跳关的新节点在next中，其他完成入口在state中。
  const progressState = action === 'USE_SKIP' && next.screen === 'reward' ? next : state;
  const progressNode = progressState.map.layers[progressState.currentRow]?.find(n => n.id === progressState.currentNodeId);
  if (completed || (action === 'USE_SKIP' && next.screen === 'reward' && next !== state)) {
    const previous = rating.acts[key] ?? { totalRows: state.map.layers.length, completedRows: [], bossDefeated: false, challengeTarget: mapChallengeTarget(state.map) };
    const row = progressState.currentRow;
    const completedRows = previous.completedRows.includes(row) ? previous.completedRows : [...previous.completedRows, row];
    rating = { ...rating, acts: { ...rating.acts, [key]: { ...previous, completedRows,
      bossDefeated: previous.bossDefeated || !!(won && progressNode?.type === 'boss') } } };
  }
  const settledRounds = Object.values(rating.battles).reduce((sum, battle) => sum + battle.rounds, 0);
  const liveRounds = next.battle ? Math.max(0, next.battle.round - (next.battle.phase === 'acting' ? 1 : 0)) : 0;
  const turnsPlayed = settledRounds + liveRounds;
  const petsLost = Object.values(rating.battles).reduce((sum, battle) => sum + battle.deaths, 0);
  return rating === state.runStats.rating && turnsPlayed === next.runStats.turnsPlayed && petsLost === next.runStats.petsLost ? next
    : { ...next, runStats: { ...next.runStats, rating, turnsPlayed, petsLost } };
}

/** 旧存档保留原公式；不凭空补齐缺失的战斗表现。 */
function legacyRating(stats: RunStats, rosterSize: number, act: number): RunRating {
  const multiplier = [0.65, 0.82, 1][Math.min(3, Math.max(1, act)) - 1];
  const battles = stats.battlesWon + stats.battlesLost;
  const conqueror = Math.round(Math.min(1, (battles > 0 ? stats.battlesWon / battles : 0.5) / 0.9) * 100);
  const tamer = Math.round(Math.min(1, (stats.tameAttempts > 0 ? stats.petsTamed / stats.tameAttempts : 0.5) / 0.8) * 100);
  const economy = Math.round(Math.min(1, (stats.goldEarned > 0 ? (stats.goldEarned - stats.goldSpent) / stats.goldEarned : 0.5) / 0.3) * 100);
  const efficiency = Math.round(Math.max(0, 1 - (stats.turnsPlayed - 90) / 210) * 100);
  const completeness = Math.round(Math.min(1, rosterSize / 7) * 100);
  const score = Math.round((conqueror * .3 + tamer * .25 + economy * .2 + efficiency * .15 + completeness * .1) * multiplier);
  const grade = gradeOf(score);
  const legacyDimension = (key: string, name: string, weight: number, value: number): RatingDimension => {
    const scaled = Math.round(value * multiplier);
    return { key, name, weight, score: scaled, points: Math.round(scaled * weight / 10) / 10, grade: gradeOf(scaled) };
  };
  return { score, grade, label: labels[grade], legacy: true, note: '旧存档沿用旧评分', dimensions: [
    legacyDimension('conqueror', '征服者', 30, conqueror),
    legacyDimension('tamer', '驯兽师', 25, tamer),
    legacyDimension('economy', '经济大师', 20, economy),
    legacyDimension('efficiency', '战斗效率', 15, efficiency),
    legacyDimension('completeness', '队伍完整性', 10, completeness),
  ] };
}

export function computeRunRating(state: GameState): RunRating | null {
  if (!state.runStats) return null;
  const rating = state.runStats.rating;
  if (!rating || state.runMode === 'proficiency') return legacyRating(state.runStats, state.roster.length, state.act);
  const acts = Object.values(rating.acts);
  const battles = Object.values(rating.battles);
  const progress = acts.reduce((sum, act) => sum + (act.bossDefeated ? 1 : clamp(act.completedRows.length / Math.max(1, act.totalRows))), 0) / 3;
  const participants = battles.reduce((sum, battle) => sum + battle.participants, 0);
  const deaths = battles.reduce((sum, battle) => sum + battle.deaths, 0);
  const survival = participants > 0 ? 25 * clamp(1 - deaths / participants / .2) : 0;
  let challenges = 0;
  for (const act of [1, 2, 3]) {
    const target = rating.acts[String(act)]?.challengeTarget ?? 5;
    const earned = battles.filter(b => b.act === act && b.won).reduce((sum, b) => sum + challengePoints(b.type), 0);
    challenges += target > 0 ? 5 * clamp(earned / target) : rating.acts[String(act)]?.bossDefeated ? 5 : 0;
  }
  const efficiency = battles.length > 0 ? 10 * battles.reduce((sum, battle) => {
    const reference = battle.type === 'boss' ? 10 : battle.type === 'gauntlet' ? Math.max(4, battle.enemyCount * 4)
      : ['elite', 'corrupted', 'guardian', 'arena'].includes(battle.type) ? 6 : 4;
    return sum + Math.min(1, reference / Math.max(1, battle.rounds));
  }, 0) / battles.length : 0;
  const dimensions = [dimension('progress', '远征进度', 50, 50 * progress), dimension('survival', '阵亡控制', 25, survival),
    dimension('challenge', '挑战战绩', 15, challenges), dimension('efficiency', '战斗效率', 10, efficiency)];
  const score = Math.round(clamp(50 * progress + survival + challenges + efficiency, 0, 100));
  const cleared = [1, 2, 3].filter(act => rating.acts[String(act)]?.bossDefeated).length;
  const firstCleared = rating.acts['1']?.bossDefeated;
  const cappedScore = cleared === 3 ? score : Math.min(score, !firstCleared ? 54 : 74);
  const grade = gradeOf(cappedScore);
  return { score, grade, label: labels[grade], dimensions, legacy: false,
    note: cleared === 3 ? undefined : !firstCleared ? '未击败第一幕首领，最高C级' : '未完整通关，最高B级' };
}
