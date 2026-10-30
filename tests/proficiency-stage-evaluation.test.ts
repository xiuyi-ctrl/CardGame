import { describe, expect, it } from 'vitest';
import { simulationStep, simulateRun } from '../src/game/simulation/runner';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { maxFieldForEnemy, type GameState } from '../src/game/state/game';

function formation(enemies: number, mirror = false): GameState {
  const base = gameReducer(createInitialState(), { type: 'START_PROFICIENCY_PICKED', seed: 27, starterId: 'momo', companionId: 'lulu' });
  const roster = ['momo', 'lulu', 'mimi', 'fifi', 'kiki'].map(id => makeUnit(id, true, 0, false));
  const options = { layer: 12, untameable: true, ...(mirror ? { mirrorUnits: roster } : {}) };
  return { ...base, screen: 'formation', roster, formation: {
    units: roster, initialField: roster.slice(0, 2), encounter: Array.from({ length: enemies }, () => ({ speciesId: 'coal' })),
    nodeId: 'pf_12', options, forceAllUnits: mirror,
  } };
}

describe('熟练度专项评估采用合法布阵', () => {
  it.each([1, 2, 3])('%s名敌人时，模拟不能绕过人数和站位上限', enemies => {
    const state = formation(enemies);
    const next = simulationStep(state, 27);
    expect(next.battle?.playerUnits).toHaveLength(maxFieldForEnemy(enemies, 'proficiency'));
    expect(new Set(next.battle?.playerUnits.map(unit => `${unit.row}:${unit.column}`)).size).toBe(next.battle?.playerUnits.length);
    expect(state.formation?.units).toHaveLength(5);
  });

  it('镜像模拟战保留强制全队上场的原规则', () => {
    const next = simulationStep(formation(1, true), 27);
    expect(next.battle?.playerUnits).toHaveLength(5);
    expect(next.battle?.enemyUnits).toHaveLength(5);
  });

  it('没有灼烧目标时跳过添薪，有灼烧目标时准确指定目标', () => {
    const base = formation(1);
    const actor = { ...base.roster[0], skills: ['stoke_fire', 'water_bath'] };
    const battle = createBattle([actor], [{ speciesId: 'coal' }], 7, { layer: 12 });
    const state: GameState = { ...base, screen: 'battle', battle };
    expect(simulationStep(state, 7).battle?.orders?.[actor.uid].skillId).toBe('water_bath');
    const burning = { ...battle, enemyUnits: battle.enemyUnits.map(unit => ({ ...unit, statuses: [{ kind: 'burn' as const, value: 2, turns: 2 }] })) };
    const next = simulationStep({ ...state, battle: burning }, 7);
    expect(next.battle?.orders?.[actor.uid]).toEqual({ skillId: 'stoke_fire', targetUid: burning.enemyUnits[0].uid });
  });

  it('战后成长页不能绕过铁匠铺直接强化技能', () => {
    const base = formation(1);
    const roster = [{ ...base.roster[0], growthPoints: 8 }];
    const growth = simulationStep({ ...base, screen: 'growth-menu', roster }, 27);
    expect(growth.roster[0].skillEnhancements).toBeUndefined();
    expect(growth.roster[0].maxHp).toBe(roster[0].maxHp + 2);
    const blacksmith = simulationStep({ ...base, screen: 'blacksmith', roster }, 27);
    expect(blacksmith.roster[0].skillEnhancements).toEqual({ 0: 1 });
    expect(blacksmith.roster[0].growthPoints).toBe(0);
  });

  it('真实远征普通战、精英和首领始终按合法人数，且可确定性复跑', () => {
    let checked = 0;
    const config = { mode: 'proficiency' as const, seed: 2033, collectTelemetry: false };
    const first = simulateRun(config, state => {
      if (state.screen !== 'battle' || !state.battle || state.eventBattle || state.arena3Pending?.mode === 'simulation') return;
      expect(state.battle.playerUnits.length).toBeLessThanOrEqual(maxFieldForEnemy(state.battle.enemyUnits.length, 'proficiency'));
      checked++;
    });
    expect(checked).toBeGreaterThan(0);
    expect(first.outcome).not.toBe('stuck');
    expect(first.outcome).not.toBe('error');
    expect(simulateRun(config).finalSignature).toBe(first.finalSignature);
  });
});
