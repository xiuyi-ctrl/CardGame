import { describe, it, expect } from 'vitest';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import type { GameAction } from '../src/game/state/reducer';
import type { GameState } from '../src/game/state/game';
import { generateMap, type MapNode } from '../src/game/state/game';
import { createBattle, currentPlayerUnit, isTameable, makeUnit, playerEndTurn, playerSkill, playerTame, skillUsesLeft } from '../src/game/core/battle';
import { getSkill } from '../src/game/data/skills';
import type { BattleState } from '../src/game/types';

function dispatch(s: GameState, a: GameAction): GameState {
  return gameReducer(s, a);
}

function autoPlay(b: BattleState, maxTurns = 400): BattleState {
  let nb = b;
  let guard = 0;
  while (nb.phase === 'acting' && guard < maxTurns) {
    const cur = currentPlayerUnit(nb);
    if (!cur) break;
    const target = nb.enemyUnits.filter((u) => u.hp > 0)[0];
    const heal = cur.skills.map(getSkill).find((x) => x.kind === 'heal' && skillUsesLeft(cur, x.id) > 0);
    if (heal && cur.hp / cur.maxHp < 0.5) {
      nb = playerSkill(nb, cur.uid, heal.id, cur.uid);
    } else {
      const best = cur.skills
        .map(getSkill)
        .filter((x) => x.target !== 'self' && skillUsesLeft(cur, x.id) > 0)
        .sort((a, c) => (c.damage ?? 0) - (a.damage ?? 0))[0];
      nb = playerSkill(nb, cur.uid, best ? best.id : cur.skills[0], target?.uid);
    }
    guard += 1;
  }
  return nb;
}

/** 把指定行的第 0 个节点改造成目标类型，并构造「从上一行出发可到达」的状态 */
function stateAtNode(s: GameState, row: number, type: MapNode['type'], encounter: { speciesId: string }[]): GameState {
  const target = s.map.layers[row][0];
  const node: MapNode = { ...target, type, label: type, corruptDebuff: type === 'corrupted' ? 'dmg' : undefined, corruptReward: type === 'corrupted' ? 'gold' : undefined };
  const layers = s.map.layers.map((r, ri) => (ri === row ? r.map((n) => (n.id === target.id ? node : n)) : r));
  return {
    ...s,
    screen: 'map',
    currentRow: row - 1,
    currentNodeId: s.map.layers[row - 1][0].id,
    map: { ...s.map, layers, encounter: { ...s.map.encounter, [node.id]: encounter } },
  };
}

describe('地图生成：新战斗节点', () => {
  it('斗兽场/车轮战/被侵蚀节点生成正确，字段与遭遇完整', () => {
    let sawArena = false;
    let sawGauntlet = false;
    let sawCorrupted = false;
    for (let act = 1; act <= 3; act++) {
      for (let seed = 1; seed <= 30; seed++) {
        const map = generateMap(seed, act);
        for (const n of map.layers.flat()) {
          if (n.type === 'arena') {
            sawArena = true;
            expect(map.encounter[n.id]?.length).toBe(1);
          } else if (n.type === 'gauntlet') {
            sawGauntlet = true;
            expect([2, 3]).toContain(n.gauntletSize);
            expect(map.encounter[n.id]?.length).toBe(n.gauntletSize);
          } else if (n.type === 'corrupted') {
            sawCorrupted = true;
            expect(['spd', 'dmg']).toContain(n.corruptDebuff);
            expect(['gold', 'food']).toContain(n.corruptReward);
            expect(map.encounter[n.id]).toBeDefined();
          }
        }
      }
    }
    expect(sawArena).toBe(true);
    expect(sawGauntlet).toBe(true);
    expect(sawCorrupted).toBe(true);
  });

  it('被侵蚀节点按 3~4 行间隔出现（相邻间距 ≥ 3），且不落在强制战斗行', () => {
    for (let act = 1; act <= 3; act++) {
      for (let seed = 1; seed <= 30; seed++) {
        const map = generateMap(seed, act);
        const rows = map.layers
          .map((row, ri) => ({ row, ri }))
          .filter(({ row }) => row.some((n) => n.type === 'corrupted'))
          .map(({ ri }) => ri);
        for (let i = 1; i < rows.length; i++) {
          expect(rows[i] - rows[i - 1]).toBeGreaterThanOrEqual(3);
        }
        // 不落在 row 1（强制纯战斗行）
        expect(rows.every((ri) => ri !== 1)).toBe(true);
      }
    }
  });
});

describe('斗兽场（1v1 单挑）', () => {
  it('MOVE 进入后先选择 1 只出战，SPECIAL_TARGET 后进入单挑战斗', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    s = stateAtNode(s, 3, 'arena', [{ speciesId: 'gora' }]);
    const arena = s.map.layers[3].find((n) => n.type === 'arena')!;
    s = dispatch(s, { type: 'MOVE', nodeId: arena.id });
    expect(s.screen).toBe('roster');
    expect(s.specialPending).toEqual({ kind: 'arena', uid: '' });

    const pick = s.roster[0];
    s = dispatch(s, { type: 'SPECIAL_TARGET', uid: pick.uid });
    expect(s.screen).toBe('battle');
    expect(s.battle?.playerUnits.length).toBe(1);
    expect(s.battle?.playerUnits[0].uid).toBe(pick.uid);
    expect(s.battle?.enemyUnits.length).toBe(1);
  });

  it('失败不 Game Over：进入坏事件选择，宠物保留不死', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    s = stateAtNode(s, 3, 'arena', [{ speciesId: 'gora' }]);
    const arena = s.map.layers[3].find((n) => n.type === 'arena')!;
    s = dispatch(s, { type: 'MOVE', nodeId: arena.id });
    const pick = s.roster[0];
    s = dispatch(s, { type: 'SPECIAL_TARGET', uid: pick.uid });
    const u = s.battle!.playerUnits[0];
    u.hp = 0;
    const lostBattle: BattleState = { ...s.battle!, phase: 'lost' };
    s = { ...s, battle: lostBattle };
    s = dispatch(s, { type: 'BATTLE_END_CONFIRM' });
    expect(s.screen).toBe('event');
    // 宠物没有永久消失
    expect(s.roster.some((x) => x.uid === pick.uid)).toBe(true);
    expect(s.roster.find((x) => x.uid === pick.uid)!.hp).toBeGreaterThanOrEqual(1);
    const ev = s.map.events[s.currentNodeId];
    expect(ev).toBeDefined();
    // 惩罚事件不再提供「黯然离开」白嫖选项，仅剩承受伤痛/破财消灾
    expect(ev.choices.some((c) => c.kind === 'none')).toBe(false);
    expect(ev.choices.map((c) => c.kind)).toContain('damage');
    const damage = ev.choices.find((c) => c.kind === 'damage')!;
    const hpBefore = s.roster[0].hp;
    const after = dispatch(s, { type: 'EVENT_CHOICE', choiceId: damage.id });
    expect(after.screen).toBe('roster');
    expect(after.roster[0].hp).toBeGreaterThanOrEqual(1);
    expect(after.roster[0].hp).toBeLessThan(hpBefore);
  });

  it('惩罚事件的金币扣款选项即使金币不足也能选择，且不会扣成负数', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    s = stateAtNode(s, 3, 'arena', [{ speciesId: 'gora' }]);
    const arena = s.map.layers[3].find((n) => n.type === 'arena')!;
    s = dispatch(s, { type: 'MOVE', nodeId: arena.id });
    const pick = s.roster[0];
    s = dispatch(s, { type: 'SPECIAL_TARGET', uid: pick.uid });
    const u = s.battle!.playerUnits[0];
    u.hp = 0;
    s = { ...s, battle: { ...s.battle!, phase: 'lost' }, gold: 5 };
    s = dispatch(s, { type: 'BATTLE_END_CONFIRM' });
    const ev = s.map.events[s.currentNodeId]!;
    const goldChoice = ev.choices.find((c) => c.kind === 'gold' && (c.amount ?? 0) < 0)!;
    const before = s.gold;
    s = dispatch(s, { type: 'EVENT_CHOICE', choiceId: goldChoice.id });
    expect(s.gold).toBeLessThan(before);
    expect(s.gold).toBeGreaterThanOrEqual(0);
    expect(s.screen).toBe('roster');
  });
});

describe('车轮战（轮换上阵）', () => {
  it('创建战斗时只上第 1 只，其余在替补席；逐一击倒后胜利', () => {
    const players = [makeUnit('momo_god', true, 0, false), makeUnit('lulu_god', true, 1, false), makeUnit('fifi_god', true, 2, false)];
    const enemies = [
      { speciesId: 'kiki' },
      { speciesId: 'pipi' },
      { speciesId: 'mimi' },
    ];
    const b = createBattle(players, enemies, 5, { gauntlet: true });
    expect(b.gauntlet).toEqual({ total: 3, current: 1 });
    expect(b.enemyUnits.length).toBe(1);
    expect(b.enemyBench?.length).toBe(2);
    expect(b.playerUnits.length).toBe(1);
    expect(b.playerBench?.length).toBe(2);
    const end = autoPlay(b);
    expect(end.phase).toBe('won');
    expect(end.enemyUnits.filter((u) => u.hp > 0).length).toBe(0);
    expect(end.enemyBench?.length).toBe(0);
    expect(end.gauntlet?.current).toBe(3);
  });

  it('我方也一次只上一只：替补按序顶替，战败单位退出战场（不再显示）', () => {
    const p1 = makeUnit('momo_queen', true, 0, false);
    const p2 = makeUnit('momo_god', true, 1, false);
    const enemies = [
      { speciesId: 'kiki' },
      { speciesId: 'pipi' },
      { speciesId: 'mimi' },
    ];
    const b = createBattle([p1, p2], enemies, 6, { gauntlet: true });
    // 只有第 1 只上场，第 2 只进入我方替补席
    expect(b.playerUnits.length).toBe(1);
    expect(b.playerUnits[0].uid).toBe(p1.uid);
    expect(b.playerBench?.length).toBe(1);
    expect(b.playerBench?.[0].uid).toBe(p2.uid);
    // 让第 1 只直接战败 → 结束回合触发换人 → 自动换第 2 只上场
    const killed: BattleState = {
      ...b,
      playerUnits: b.playerUnits.map((u) => ({ ...u, hp: 0 })),
    };
    const swapped = autoPlay(playerEndTurn(killed), 400);
    expect(swapped.phase).toBe('won');
    // 战败单位已退场（不在上场列表，也不在替补席），当前场上为第 2 只
    expect(swapped.playerUnits.some((u) => u.uid === p1.uid)).toBe(false);
    expect(swapped.playerUnits.some((u) => u.uid === p2.uid)).toBe(true);
    expect(swapped.playerBench?.length ?? 0).toBe(0);
    expect(swapped.playerDown?.some((u) => u.uid === p1.uid)).toBe(true);
    expect(swapped.gauntlet?.current).toBe(3);
  });

  it('失败不 Game Over：进入坏事件惩罚，全队保留', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    s = stateAtNode(s, 4, 'gauntlet', [
      { speciesId: 'kiki' },
      { speciesId: 'pipi' },
    ]);
    const g = s.map.layers[4].find((n) => n.type === 'gauntlet')!;
    s = dispatch(s, { type: 'MOVE', nodeId: g.id });
    expect(s.screen).toBe('gauntlet-order');
    s = dispatch(s, { type: 'GAUNTLET_ORDER_CONFIRM', units: s.gauntletOrder! });
    expect(s.screen).toBe('battle');
    expect(s.battle?.gauntlet).toBeDefined();
    // 全部玩家阵亡 → lost
    s = { ...s, battle: { ...s.battle!, playerUnits: s.battle!.playerUnits.map((x) => ({ ...x, hp: 0 })), phase: 'lost' } };
    const before = s.roster.length;
    s = dispatch(s, { type: 'BATTLE_END_CONFIRM' });
    expect(s.screen).toBe('event');
    expect(s.roster.length).toBe(before);
  });

  it('胜利结算为挑战奖励（3 选 1）且不加固定金币', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    s = stateAtNode(s, 4, 'gauntlet', [
      { speciesId: 'kiki' },
      { speciesId: 'pipi' },
    ]);
    const g = s.map.layers[4].find((n) => n.type === 'gauntlet')!;
    s = dispatch(s, { type: 'MOVE', nodeId: g.id });
    s = dispatch(s, { type: 'GAUNTLET_ORDER_CONFIRM', units: s.gauntletOrder! });
    const gold0 = s.gold;
    s = { ...s, battle: { ...s.battle!, phase: 'won' } };
    s = dispatch(s, { type: 'BATTLE_END_CONFIRM' });
    expect(s.screen).toBe('reward');
    expect(s.rewards.length).toBe(3);
    expect(s.gold).toBe(gold0);
  });

  it('车轮战胜利时替补席与阵亡单位全部保留（保底 1 血）', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    s = stateAtNode(s, 4, 'gauntlet', [
      { speciesId: 'kiki' },
      { speciesId: 'pipi' },
    ]);
    const g = s.map.layers[4].find((n) => n.type === 'gauntlet')!;
    s = dispatch(s, { type: 'MOVE', nodeId: g.id });
    s = dispatch(s, { type: 'GAUNTLET_ORDER_CONFIRM', units: s.gauntletOrder! });
    // 当前场上第 1 只，替补席 1 只
    expect(s.battle!.playerBench?.length).toBe(1);
    const fieldUid = s.battle!.playerUnits[0].uid;
    const benchUid = s.battle!.playerBench![0].uid;
    // 模拟：场上这只被击杀 → 退场进入 playerDown；替补顶上但直接获胜
    const killed: BattleState = {
      ...s.battle!,
      playerUnits: s.battle!.playerUnits.map((u) => ({ ...u, hp: 0 })),
    };
    // 手工构造胜利结算：场上单位存活、替补未上场、阵亡单位在 playerDown
    const won: BattleState = {
      ...killed,
      phase: 'won',
      playerUnits: killed.playerUnits.map((u) => ({ ...u, hp: 1 })),
      playerDown: [...(killed.playerDown ?? []), ...killed.playerUnits.map((u) => ({ ...u, hp: 0 }))],
    };
    s = { ...s, battle: won };
    s = dispatch(s, { type: 'BATTLE_END_CONFIRM' });
    expect(s.screen).toBe('reward');
    // 替补席与阵亡单位都不得被永久删除
    expect(s.roster.some((u) => u.uid === fieldUid)).toBe(true);
    expect(s.roster.some((u) => u.uid === benchUid)).toBe(true);
    s.roster.forEach((u) => expect(u.hp).toBeGreaterThanOrEqual(1));
  });
});

describe('被侵蚀（暗影 debuff + 奖励翻倍）', () => {
  it('spd debuff：我方全体速度 -1', () => {
    const u = makeUnit('momo', true, 0, false);
    const b = createBattle([u], [{ speciesId: 'kiki' }], 1, { corruptDebuff: 'spd' });
    expect(b.playerUnits[0].spd).toBe(Math.max(1, u.spd - 1));
  });

  it('dmg debuff：我方受到伤害更大（同种子同操作，总损失 ≥ 普通战斗）', () => {
    const build = (dmg: boolean) => {
      const u = makeUnit('lulu', true, 0, false);
      u.spd = 1; // 让敌方先手
      const b = createBattle([u], [{ speciesId: 'fifi' }], 77, dmg ? { corruptDebuff: 'dmg' } : undefined);
      const end = autoPlay(b, 200);
      return end.playerUnits[0];
    };
    const normal = build(false);
    const dmg = build(true);
    const lossNormal = normal.maxHp - normal.hp;
    const lossDmg = dmg.maxHp - dmg.hp;
    expect(lossDmg).toBeGreaterThanOrEqual(lossNormal);
  });

  it('MOVE 进入被侵蚀节点会携带 debuff 进入战斗', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    s = stateAtNode(s, 3, 'corrupted', [{ speciesId: 'kiki' }]);
    const corrupted = s.map.layers[3].find((n) => n.type === 'corrupted')!;
    s = dispatch(s, { type: 'MOVE', nodeId: corrupted.id });
    expect(s.screen).toBe('formation');
    const units = s.formation!.units;
    s = dispatch(s, { type: 'FORMATION_CONFIRM', units });
    expect(s.screen).toBe('battle');
    expect(s.battle?.corruptDebuff).toBe('dmg');
  });

  it('胜利后金币翻倍（corruptReward=gold）', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    s = stateAtNode(s, 3, 'corrupted', [{ speciesId: 'kiki' }]);
    const corrupted = s.map.layers[3].find((n) => n.type === 'corrupted')!;
    s = dispatch(s, { type: 'MOVE', nodeId: corrupted.id });
    s = dispatch(s, { type: 'FORMATION_CONFIRM', units: s.formation!.units });
    const gold0 = s.gold;
    s = { ...s, battle: { ...s.battle!, phase: 'won' } };
    s = dispatch(s, { type: 'BATTLE_END_CONFIRM' });
    expect(s.gold).toBe(gold0 + 32); // 16 * 2
  });

  it('胜利后食物奖励翻倍（corruptReward=food）', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    s = stateAtNode(s, 3, 'corrupted', [{ speciesId: 'kiki' }]);
    const node = s.map.layers[3].find((n) => n.type === 'corrupted')!;
    node.corruptReward = 'food';
    s = dispatch(s, { type: 'MOVE', nodeId: node.id });
    s = dispatch(s, { type: 'FORMATION_CONFIRM', units: s.formation!.units });
    const gold0 = s.gold;
    s = { ...s, battle: { ...s.battle!, phase: 'won' } };
    s = dispatch(s, { type: 'BATTLE_END_CONFIRM' });
    // 金币不翻倍
    expect(s.gold).toBe(gold0 + 16);
    // 奖励池必含食物且数量为 2
    const foodReward = s.rewards.find((r) => r.kind === 'food');
    expect(foodReward).toBeDefined();
    expect(foodReward!.amount).toBe(2);
  });
});

describe('跳关道具：可跳过 3 种新战斗节点', () => {
  it('跳过斗兽场：直接领取 3 选 1 挑战奖励，不加固定金币', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    s = { ...stateAtNode(s, 3, 'arena', [{ speciesId: 'gora' }]), inventory: { ...s.inventory, skip: 1 } };
    const arena = s.map.layers[3].find((n) => n.type === 'arena')!;
    const gold0 = s.gold;
    s = dispatch(s, { type: 'USE_SKIP', nodeId: arena.id });
    expect(s.screen).toBe('reward');
    expect(s.rewards.length).toBe(3);
    expect(s.gold).toBe(gold0);
    expect(s.inventory.skip).toBe(0);
  });

  it('跳过车轮战：直接领取 3 选 1 挑战奖励', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    s = {
      ...stateAtNode(s, 4, 'gauntlet', [
        { speciesId: 'kiki' },
        { speciesId: 'pipi' },
      ]),
      inventory: { ...s.inventory, skip: 1 },
    };
    const g = s.map.layers[4].find((n) => n.type === 'gauntlet')!;
    s = dispatch(s, { type: 'USE_SKIP', nodeId: g.id });
    expect(s.screen).toBe('reward');
    expect(s.rewards.length).toBe(3);
  });

  it('跳过被侵蚀（corruptReward=gold）：金币翻倍 16', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    s = { ...stateAtNode(s, 3, 'corrupted', [{ speciesId: 'kiki' }]), inventory: { ...s.inventory, skip: 1 } };
    const c = s.map.layers[3].find((n) => n.type === 'corrupted')!;
    const gold0 = s.gold;
    s = dispatch(s, { type: 'USE_SKIP', nodeId: c.id });
    expect(s.screen).toBe('reward');
    expect(s.gold).toBe(gold0 + 16);
  });

  it('跳过被侵蚀（corruptReward=food）：奖励池必含双份食物', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    s = { ...stateAtNode(s, 3, 'corrupted', [{ speciesId: 'kiki' }]), inventory: { ...s.inventory, skip: 1 } };
    const c = s.map.layers[3].find((n) => n.type === 'corrupted')!;
    c.corruptReward = 'food';
    s = dispatch(s, { type: 'USE_SKIP', nodeId: c.id });
    const foodReward = s.rewards.find((r) => r.kind === 'food');
    expect(foodReward).toBeDefined();
    expect(foodReward!.amount).toBe(2);
  });
});

describe('DEBUG_JUMP（测试关卡直达）', () => {
  it('跳到指定幕/层，配备调试强队与物资并直接进入节点', () => {
    const s = dispatch(createInitialState(), { type: 'DEBUG_JUMP', act: 2, row: 6, nodeType: 'all', seed: 42 });
    expect(s.act).toBe(2);
    expect(s.currentRow).toBe(6);
    expect(s.roster.length).toBe(3);
    expect(s.roster.map((u) => u.speciesId)).toEqual(['momo_queen', 'lulu_king', 'fifi_king']);
    expect(s.gold).toBe(500);
    expect(s.inventory.skip).toBe(3);
    expect(['battle', 'roster', 'event', 'shop', 'special', 'rest']).toContain(s.screen);
  });

  it('可直接跳到首领层开战', () => {
    const s = dispatch(createInitialState(), { type: 'DEBUG_JUMP', act: 3, row: 9, nodeType: 'boss', seed: 7 });
    expect(s.screen).toBe('battle');
    expect(s.map.boss[s.currentNodeId]).toBeDefined();
  });

  it('超出范围自动 clamp（act=5→3，row=99→末层）', () => {
    const s = dispatch(createInitialState(), { type: 'DEBUG_JUMP', act: 5, row: 99, nodeType: 'battle', seed: 7 });
    expect(s.act).toBe(3);
    expect(s.currentRow).toBe(s.map.layers.length - 1);
  });
});

describe('斗兽场/车轮战：敌方不可驯服', () => {
  it('普通战斗敌人默认可驯服', () => {
    const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 1);
    expect(b.enemyUnits[0].tameable).toBe(true);
  });

  it('斗兽场（untameable）敌人不可驯服，且 playerTame 会拒绝', () => {
    const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'gora' }], 1, {
      untameable: true,
    });
    expect(b.enemyUnits[0].tameable).toBe(false);
    expect(isTameable(b.enemyUnits[0])).toBe(false);
    const low = { ...b, enemyUnits: b.enemyUnits.map((u) => ({ ...u, hp: 1 })) };
    const after = playerTame(low, 'berry', low.enemyUnits[0].uid);
    expect(after.enemyUnits[0].hp).toBe(1);
    expect(after.pendingTame.length).toBe(0);
  });

  it('车轮战（gauntlet+untameable）场上与替补席都不可驯服', () => {
    const b = createBattle(
      [makeUnit('momo', true, 0, false)],
      [
        { speciesId: 'kiki' },
        { speciesId: 'pipi' },
        { speciesId: 'mimi' },
      ],
      1,
      { gauntlet: true, untameable: true },
    );
    expect(b.enemyUnits.every((u) => !u.tameable)).toBe(true);
    expect(b.enemyBench?.every((u) => !u.tameable)).toBe(true);
  });

  it('经 reducer 进入斗兽场/车轮战：敌方 tameable=false', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    s = stateAtNode(s, 3, 'arena', [{ speciesId: 'gora' }]);
    const arena = s.map.layers[3].find((n) => n.type === 'arena')!;
    s = dispatch(s, { type: 'MOVE', nodeId: arena.id });
    s = dispatch(s, { type: 'SPECIAL_TARGET', uid: s.roster[0].uid });
    expect(s.battle?.enemyUnits.every((u) => !u.tameable)).toBe(true);

    s = stateAtNode(s, 4, 'gauntlet', [
      { speciesId: 'kiki' },
      { speciesId: 'pipi' },
    ]);
    const g = s.map.layers[4].find((n) => n.type === 'gauntlet')!;
    s = dispatch(s, { type: 'MOVE', nodeId: g.id });
    s = dispatch(s, { type: 'GAUNTLET_ORDER_CONFIRM', units: s.gauntletOrder! });
    expect(s.battle?.enemyUnits.every((u) => !u.tameable)).toBe(true);
    expect(s.battle?.enemyBench?.every((u) => !u.tameable)).toBe(true);
  });
});
