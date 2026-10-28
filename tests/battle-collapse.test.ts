import { describe, expect, it } from 'vitest';
import { battleCollapseDamage, createBattle, makeUnit, playerEndTurn, performGauntletSwap, skillUsesLeft } from '../src/game/core/battle';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { getSkill } from '../src/game/data/skills';
import { parseEvent } from '../src/ui/battleFx';

function quiet(round: number) {
  const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'momo' }], 1);
  b.round = round;
  for (const u of [...b.playerUnits, ...b.enemyUnits]) Object.assign(u, { hp: 100, maxHp: 100, shield: 99, skills: [], acted: true });
  return b;
}

describe('战场崩解与治疗限制', () => {
  it('第15回合末首次5点，随后递增，无视护盾、减伤和伤害上限', () => {
    expect([13, 14, 15, 16, 20].map(battleCollapseDamage)).toEqual([0, 0, 5, 6, 10]);
    for (const round of [14, 15, 16, 31]) {
      const b = quiet(round);
      b.playerUnits[0].passive = 'thick_shell';
      b.enemyUnits[0].passive = 'iron_cap';
      b.roundDmgMap = { [b.enemyUnits[0].uid]: 10 };
      const after = playerEndTurn(b);
      expect(after.playerUnits[0].hp).toBe(100 - battleCollapseDamage(round));
      expect(after.enemyUnits[0].hp).toBe(100 - battleCollapseDamage(round));
      expect(after.playerUnits[0].shield).toBe(99);
      expect(after.enemyUnits[0].shield).toBe(99);
      const log = after.log.find(e => e.text.startsWith('战场崩解'));
      if (round >= 15) expect(parseEvent(after, log!)).toMatchObject({ kind: 'burst', value: battleCollapseDamage(round), burstTargets: [b.playerUnits[0].uid, b.enemyUnits[0].uid] });
    }
  });
  it('双方同时扣血后判定胜负，不因先扣我方而提前结束', () => {
    const b = quiet(15);
    b.playerUnits[0].hp = 5;
    b.enemyUnits[0].hp = 5;
    const after = playerEndTurn(b);
    expect(after.playerUnits[0].hp).toBe(0);
    expect(after.enemyUnits[0].hp).toBe(0);
    expect(after.phase).toBe('won');
    expect(after.round).toBe(15);
  });
  it('车轮战替补不受伤，换人不重置或重复崩解回合', () => {
    const b = quiet(15);
    b.playerUnits[0].hp = 5;
    b.gauntlet = { current: 1, total: 2 };
    b.playerBench = [makeUnit('momo', true, 0, false)];
    const after = playerEndTurn(b);
    expect(after.phase).toBe('acting');
    expect(after.pendingSwap?.player).toBe(true);
    expect(after.playerBench?.[0].hp).toBe(b.playerBench[0].hp);
    const swapped = performGauntletSwap(after);
    expect(swapped.round).toBe(16);
    expect(swapped.log.filter(e => e.text.startsWith('战场崩解'))).toHaveLength(1);
  });
  it('两次预警确认保存，读档不重弹，其他回合不能确认', () => {
    const b = quiet(1);
    let state = { ...createInitialState(), screen: 'battle' as const, battle: b };
    state = gameReducer(state, { type: 'ACK_COLLAPSE_WARNING' }) as typeof state;
    expect(state.battle.collapseWarningSeenRound).toBe(1);
    const loaded = gameReducer(createInitialState(), { type: 'LOAD_GAME', state: JSON.parse(JSON.stringify(state)) });
    expect(loaded.battle?.collapseWarningSeenRound).toBe(1);
    for (const round of [2, 13, 14, 16]) {
      const other = { ...state, battle: { ...state.battle, round } };
      expect(gameReducer(other, { type: 'ACK_COLLAPSE_WARNING' })).toBe(other);
    }
    const started = { ...state, battle: { ...state.battle, round: 15 } };
    expect(gameReducer(started, { type: 'ACK_COLLAPSE_WARNING' }).battle?.collapseWarningSeenRound).toBe(15);
  });
  it('基础回复不限次，强力技能冷却1，保留群体等有限次', () => {
    const legacy = { ...makeUnit('lulu_king', true, 0, false), skillUses: { heal_light: 0, water_bath: 0, shield_skill: 0 } };
    for (const id of ['heal_light', 'water_bath', 'shield_skill']) expect(skillUsesLeft(legacy, id)).toBe(Infinity);
    for (const id of ['water_bath', 'shield_skill', 'light_bath', 'lamp_guard', 'solar_heal', 'ember_transfer']) {
      expect(getSkill(id).uses).toBeUndefined();
      expect(getSkill(id).cooldown ?? 0).toBe(0);
    }
    for (const id of ['heal_light', 'ash_shelter', 'furnace_shell', 'furnace_bastion', 'burn_reversal', 'iron_double', 'tidal_slam', 'spore_shield']) expect(getSkill(id).cooldown).toBe(1);
    expect(getSkill('flame_tail_shield')).toMatchObject({ cooldown: 1, uses: 2 });
    expect(getSkill('heal_light').uses).toBeUndefined();
    expect(getSkill('iron_domain')).toMatchObject({ cooldown: 1, uses: 2 });
    expect(getSkill('seal_furnace')).toMatchObject({ cooldown: 1, uses: 3 });
  });
});
