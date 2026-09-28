import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerEndTurn, playerSkill } from '../src/game/core/battle';
import { parseBalanceArgs } from '../src/game/simulation/cli';
import { buildBalanceReport, compactRunTelemetry, compareBaseline, percentile, renderMarkdown, toBaseline } from '../src/game/simulation/report';
import { simulateRun, verifyDeterminism } from '../src/game/simulation/runner';

describe('数值平衡工具', () => {
  it('解析 CLI 参数并拒绝非法值', () => {
    expect(parseBalanceArgs(['--mode', 'main', '--difficulty', 'hard', '--seeds', '12', '--seed-start', '9', '--check'])).toMatchObject({
      modes: ['main'], difficulties: ['hard'], seeds: 12, seedStart: 9, check: true,
    });
    expect(() => parseBalanceArgs(['--seeds', '0'])).toThrow('正整数');
    expect(() => parseBalanceArgs(['--mode', 'bad'])).toThrow('无效');
  });

  it('计算百分位并生成 JSON 可序列化、Markdown 可读的报告', () => {
    expect(percentile([9, 1, 5, 3], 0.5)).toBe(3);
    const runs = [simulateRun({ mode: 'main', difficulty: 'normal', seed: 2000 })];
    const report = buildBalanceReport(runs, { codeVersion: 'test', seedStart: 2000, seedsPerVariant: 1 });
    expect(() => JSON.stringify(report)).not.toThrow();
    expect(renderMarkdown(report)).toContain('# 数值平衡报告');
    expect(renderMarkdown(report)).toContain('main');
    expect(report.schemaVersion).toBe(2);
    expect(report.skills.every((item) => item.mode === 'main' && item.difficulty === 'normal')).toBe(true);
    expect(report.skills.every((item) => item.side === 'player' || item.side === 'enemy')).toBe(true);
    expect(report.skills.some((item) => item.hitTargets > 0)).toBe(true);
  });

  it('基线比较只产生告警，不写入硬失败', () => {
    const report = buildBalanceReport([simulateRun({ mode: 'main', difficulty: 'normal', seed: 2000 })], { codeVersion: 'new', seedStart: 2000, seedsPerVariant: 1 });
    const baseline = toBaseline(report);
    baseline.variants[0] = { ...baseline.variants[0], winRate: report.variants[0].winRate === 0 ? 1 : 0 };
    expect(compareBaseline(report, baseline).some((warning) => warning.includes('winRate'))).toBe(true);
    expect(report.hardFailures).toEqual([]);
  });

  it('聚合后可压缩逐事件遥测且保留技能指标', () => {
    const report = buildBalanceReport([simulateRun({ mode: 'main', difficulty: 'normal', seed: 2001 })], { codeVersion: 'test', seedStart: 2001, seedsPerVariant: 1 });
    const uses = report.skills.reduce((sum, item) => sum + item.uses, 0);
    expect(report.runs.some((run) => run.battles.some((battle) => battle.telemetry.length > 0))).toBe(true);
    compactRunTelemetry(report);
    expect(report.runs.every((run) => run.battles.every((battle) => battle.telemetry.length === 0))).toBe(true);
    expect(report.skills.reduce((sum, item) => sum + item.uses, 0)).toBe(uses);
    expect(() => JSON.stringify(report)).not.toThrow();
  });

  it('相同种子和配置可复现', () => {
    expect(verifyDeterminism([
      { mode: 'main', difficulty: 'normal', seed: 2000, maxSteps: 2500, collectTelemetry: true },
      { mode: 'main', difficulty: 'normal', seed: 2007, maxSteps: 2500, collectTelemetry: true },
      { mode: 'proficiency', difficulty: 'normal', seed: 2000, maxSteps: 6000, collectTelemetry: true },
    ])).toEqual([]);
  });

  it('启用遥测不改变战斗结算与 RNG 次序', () => {
    const player = makeUnit('momo', true, 0, false);
    const plain = createBattle([player], [{ speciesId: 'kiki' }], 77);
    const tracked = createBattle([player], [{ speciesId: 'kiki' }], 77, { collectTelemetry: true });
    const playRound = (battle: typeof plain) => {
      const actor = battle.playerUnits[0];
      const enemy = battle.enemyUnits[0];
      return playerEndTurn(playerSkill(battle, actor.uid, actor.skills[0], enemy.uid));
    };
    const plainAfter = playRound(plain);
    const trackedAfter = playRound(tracked);
    expect({ phase: trackedAfter.phase, rngCount: trackedAfter.rngCount, playerHp: trackedAfter.playerUnits.map((unit) => unit.hp), enemyHp: trackedAfter.enemyUnits.map((unit) => unit.hp) })
      .toEqual({ phase: plainAfter.phase, rngCount: plainAfter.rngCount, playerHp: plainAfter.playerUnits.map((unit) => unit.hp), enemyHp: plainAfter.enemyUnits.map((unit) => unit.hp) });
    expect(trackedAfter.telemetry?.some((event) => event.kind === 'skill-use')).toBe(true);
  });
});

