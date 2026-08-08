import { describe, it, expect } from 'vitest';
import {
  createBattle,
  currentPlayerUnit,
  decrementBattleBuffs,
  getDamageBonus,
  getEffectiveSpd,
  makeUnit,
  useBattleItem,
} from '../src/game/core/battle';
import { gameReducer, type GameAction } from '../src/game/state/reducer';
import type { GameState } from '../src/game/state/game';
import { createInitialState } from '../src/game/state/reducer';

function makeBattleState() {
  const players = [makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)];
  return createBattle(players, [{ speciesId: 'kiki' }, { speciesId: 'pipi' }], 12345);
}

describe('战斗药水：增益', () => {
  it('atk_up 给目标写入 atkUp=3 并提升固定伤害', () => {
    const b = makeBattleState();
    const target = b.playerUnits[0];
    const rc0 = b.rngCount;
    const after = useBattleItem(b, 'atk_up', target.uid);
    expect(after.rngCount).toBe(rc0 + 1); // 消耗随机数
    expect(after.playerUnits[0].battleBuffs?.atkUp).toBe(3);
    expect(getDamageBonus(after.playerUnits[0])).toBe(1);
    expect(after.log[after.log.length - 1].text).toContain('伤害 +1');
  });

  it('spd_up 提升有效速度', () => {
    const b = makeBattleState();
    const target = b.playerUnits[0];
    const after = useBattleItem(b, 'spd_up', target.uid);
    expect(after.playerUnits[0].battleBuffs?.spdUp).toBe(3);
    expect(getEffectiveSpd(after.playerUnits[0])).toBe(target.spd + 1);
  });

  it('buff 回合递减，3 回合后清除', () => {
    const b = makeBattleState();
    const after = useBattleItem(b, 'atk_up', b.playerUnits[0].uid);
    const r2 = decrementBattleBuffs(after);
    expect(r2.playerUnits[0].battleBuffs?.atkUp).toBe(2);
    const r3 = decrementBattleBuffs(r2);
    expect(r3.playerUnits[0].battleBuffs?.atkUp).toBe(1);
    const r4 = decrementBattleBuffs(r3);
    expect(r4.playerUnits[0].battleBuffs).toBeUndefined();
    expect(getDamageBonus(r4.playerUnits[0])).toBe(0);
  });

  it('buff 只能用于我方单位，攻击敌方被拒', () => {
    const b = makeBattleState();
    const enemy = b.enemyUnits[0];
    const rc0 = b.rngCount;
    const after = useBattleItem(b, 'atk_up', enemy.uid);
    expect(after.rngCount).toBe(rc0);
    expect(after.enemyUnits[0].battleBuffs).toBeUndefined();
  });
});

describe('战斗药水：即时效果', () => {
  it('hp_up 即时回复 50% 生命，不写入持续 buff', () => {
    const b = makeBattleState();
    const t = b.playerUnits[0];
    const damaged = { ...b, playerUnits: [{ ...t, hp: Math.round(t.maxHp * 0.5) }] };
    const after = useBattleItem(damaged, 'hp_up', t.uid);
    expect(after.playerUnits[0].hp).toBe(Math.round(t.maxHp * 0.5) + Math.round(t.maxHp * 0.5));
    expect(after.playerUnits[0].battleBuffs).toBeUndefined();
  });

  it('hp_down 即时扣除当前生命 30%，不写入持续 buff', () => {
    const b = makeBattleState();
    const enemy = b.enemyUnits[0];
    const before = enemy.hp;
    const after = useBattleItem(b, 'hp_down', enemy.uid);
    expect(after.enemyUnits[0].hp).toBe(Math.max(1, Math.round(before * 0.7)));
    expect(after.enemyUnits[0].battleBuffs).toBeUndefined();
  });

  it('hp_down 对 1 血目标至少保留 1 血', () => {
    const b = makeBattleState();
    const enemy = b.enemyUnits[0];
    const damaged = { ...b, enemyUnits: [{ ...enemy, hp: 1 }] };
    const after = useBattleItem(damaged, 'hp_down', enemy.uid);
    expect(after.enemyUnits[0].hp).toBe(1);
  });

  it('减益只能用于敌方单位，对己方使用被拒', () => {
    const b = makeBattleState();
    const ally = b.playerUnits[0];
    const rc0 = b.rngCount;
    const after = useBattleItem(b, 'hp_down', ally.uid);
    expect(after.rngCount).toBe(rc0);
    expect(after.playerUnits[0].battleBuffs).toBeUndefined();
  });
});

describe('USE_BATTLE_ITEM reducer', () => {
  function withBattle(): { state: GameState; dispatch: (a: GameAction) => GameState } {
    const battle = makeBattleState();
    const base: GameState = {
      ...createInitialState(),
      screen: 'battle',
      battle,
      inventory: { atk_up: 2, hp_up: 1, hp_down: 1 },
    };
    return {
      state: base,
      dispatch: (a) => gameReducer(base, a),
    };
  }

  it('使用后扣减库存并应用 buff', () => {
    const { state, dispatch } = withBattle();
    const uid = state.battle!.playerUnits[0].uid;
    const next = dispatch({ type: 'USE_BATTLE_ITEM', itemId: 'atk_up', targetUid: uid });
    expect(next.inventory.atk_up).toBe(1);
    expect(next.battle!.playerUnits[0].battleBuffs?.atkUp).toBe(3);
  });

  it('库存不足时不生效', () => {
    const { state, dispatch } = withBattle();
    const uid = state.battle!.playerUnits[0].uid;
    const next = dispatch({ type: 'USE_BATTLE_ITEM', itemId: 'spd_up', targetUid: uid });
    expect(next).toBe(state);
  });

  it('非战斗阶段不生效', () => {
    const { state } = withBattle();
    const s2 = { ...state, battle: undefined };
    const next = gameReducer(s2, { type: 'USE_BATTLE_ITEM', itemId: 'atk_up', targetUid: 'x' });
    expect(next).toBe(s2);
  });

  it('buff 打敌方 / 减益打己方被 reducer 拒绝', () => {
    const { state, dispatch } = withBattle();
    const enemyUid = state.battle!.enemyUnits[0].uid;
    const allyUid = state.battle!.playerUnits[0].uid;
    const r1 = dispatch({ type: 'USE_BATTLE_ITEM', itemId: 'atk_up', targetUid: enemyUid });
    expect(r1.inventory.atk_up).toBe(2);
    const r2 = dispatch({ type: 'USE_BATTLE_ITEM', itemId: 'hp_down', targetUid: allyUid });
    expect(r2.inventory.hp_down).toBe(1);
  });

  it('战斗中 buff 在真实回合推进后仍存在', () => {
    const battle = createBattle(
      [makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)],
      [{ speciesId: 'kiki' }],
      12345,
    );
    const withInv: GameState = {
      ...createInitialState(),
      screen: 'battle',
      battle,
      inventory: { atk_up: 5 },
    };
    const s = gameReducer(withInv, { type: 'USE_BATTLE_ITEM', itemId: 'atk_up', targetUid: battle.playerUnits[0].uid });
    expect(s.battle!.playerUnits[0].battleBuffs?.atkUp).toBe(3);
    const cur = currentPlayerUnit(s.battle!);
    if (cur) {
      const s2 = gameReducer(s, {
        type: 'PLAYER_SKILL',
        actorUid: cur.uid,
        skillId: cur.skills[0],
        targetUid: s.battle!.enemyUnits[0].uid,
      });
      // 玩家行动后敌人行动、开启新回合，buff 递减 1（仍应存在）
      expect(s2.battle!.playerUnits[0].battleBuffs?.atkUp).toBe(2);
    }
  });
});
