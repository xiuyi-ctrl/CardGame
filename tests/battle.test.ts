import { describe, it, expect } from 'vitest';
import {
  createBattle,
  currentPlayerUnit,
  isTameable,
  makeUnit,
  playerSkill,
  playerTame,
  tameChance,
  TAME_THRESHOLD,
} from '../src/game/core/battle';
import type { BattleState } from '../src/game/types';
import { MONSTERS } from '../src/game/data/monsters';
import { SKILLS } from '../src/game/data/skills';

function autoPlay(b: BattleState, maxTurns = 300): BattleState {
  let nb = b;
  let guard = 0;
  while (nb.phase === 'acting' && guard < maxTurns) {
    const cur = currentPlayerUnit(nb);
    if (!cur) break;
    const target = nb.enemyUnits.filter((u) => u.hp > 0)[0];
    nb = playerSkill(nb, cur.skills[0], target?.uid);
    guard += 1;
  }
  return nb;
}

describe('战斗基础', () => {
  it('攻击会降低敌人生命值', () => {
    const players = [makeUnit('momo', true, 0, false)];
    const b = createBattle(players, [{ speciesId: 'kiki' }], 12345);
    expect(b.phase).toBe('acting');
    const cur = currentPlayerUnit(b)!;
    const hpBefore = b.enemyUnits[0].hp;
    const after = playerSkill(b, cur.skills[0], b.enemyUnits[0].uid);
    expect(after.enemyUnits[0].hp).toBeLessThan(hpBefore);
    expect(after.log.length).toBeGreaterThan(b.log.length);
  });

  it('连续攻击后以胜利结束', () => {
    const players = [makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)];
    const enemies = [{ speciesId: 'kiki' }];
    const end = autoPlay(createBattle(players, enemies, 7));
    expect(end.phase).toBe('won');
  });

  it('速度排序：快单位先行动', () => {
    const fast = makeUnit('fifi', true, 0, false); // spd 4
    const slow = makeUnit('lulu', true, 1, false); // spd 2
    const b = createBattle([fast, slow], [{ speciesId: 'kiki' }], 1);
    expect(b.turnOrder.indexOf(fast.uid)).toBeLessThan(b.turnOrder.indexOf(slow.uid));
    expect(b.turnOrder[0]).toBe(fast.uid);
  });

  it('同一战斗状态 + 相同操作序列是可复现的', () => {
    const build = () => {
      const players = [makeUnit('fifi', true, 0, false)];
      const b = createBattle(players, [{ speciesId: 'momo' }, { speciesId: 'lulu' }], 99);
      const cur = currentPlayerUnit(b)!;
      return playerSkill(b, cur.skills[0], b.enemyUnits[0].uid);
    };
    const a = build();
    const c = build();
    expect(a.log).toEqual(c.log);
    expect(a.enemyUnits[0].hp).toBe(c.enemyUnits[0].hp);
  });
});

describe('驯服', () => {
  it('生命值过高时无法驯服，不消耗食物', () => {
    const players = [makeUnit('momo', true, 0, false)];
    const b = createBattle(players, [{ speciesId: 'kiki' }], 5);
    const rc0 = b.rngCount;
    const after = playerTame(b, 'berry', b.enemyUnits[0].uid);
    expect(after.rngCount).toBe(rc0);
    expect(after.enemyUnits.length).toBe(1);
  });

  it('低血量喂食：要么驯服成功（敌人移除+预备役），要么失败但消耗食物', () => {
    const players = [makeUnit('momo', true, 0, false)];
    const b = createBattle(players, [{ speciesId: 'kiki' }], 42);
    const enemy = b.enemyUnits[0];
    enemy.hp = Math.max(1, Math.floor(enemy.maxHp * 0.2));
    const rc0 = b.rngCount;
    const after = playerTame(b, 'berry', enemy.uid);
    expect(after.rngCount).toBeGreaterThan(rc0); // 食物已消耗
    expect(after.enemyUnits.length + after.pendingTame.length).toBe(1);
    if (after.pendingTame.length > 0) {
      expect(after.pendingTame[0].isPlayer).toBe(true);
    }
  });

  it('isTameable 只在血量低于阈值且可驯服时成立', () => {
    const u = makeUnit('kiki', false, 0, true);
    u.hp = Math.floor(u.maxHp * 0.3);
    expect(isTameable(u)).toBe(true);
    u.hp = Math.ceil(u.maxHp * TAME_THRESHOLD + 1);
    expect(isTameable(u)).toBe(false);
    const boss = makeUnit('boss_vine', false, 0, false);
    boss.hp = 1;
    expect(isTameable(boss)).toBe(false);
  });

  it('敌人 1 血时必定捕捉（可捕捉生物）', () => {
    let b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 1);
    const u = b.enemyUnits[0];
    b = { ...b, enemyUnits: [{ ...u, hp: 1 }] };
    b = playerTame(b, 'berry', b.enemyUnits[0].uid);
    expect(b.pendingTame.length).toBe(1);
    expect(b.enemyUnits.length).toBe(0);
  });

  it('不可捕捉的敌人即使 1 血也不会被捕捉', () => {
    let b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 1, {
      untameable: true,
    });
    b = { ...b, enemyUnits: [{ ...b.enemyUnits[0], hp: 1 }] };
    b = playerTame(b, 'berry', b.enemyUnits[0].uid);
    expect(b.pendingTame.length).toBe(0);
    expect(b.enemyUnits.length).toBe(1);
  });

  it('驯服失败会累计 tameFails（每次失败提高后续捕捉概率）', () => {
    let b: BattleState | null = null;
    let enemyId = '';
    // 搜索一个首次喂食失败的种子，验证失败次数被记录
    for (let seed = 0; seed < 500; seed++) {
      let trial = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], seed);
      const u = trial.enemyUnits[0];
      trial = { ...trial, enemyUnits: [{ ...u, hp: Math.max(1, Math.floor(u.maxHp * TAME_THRESHOLD)) }] };
      const id = trial.enemyUnits[0].uid;
      const after = playerTame(trial, 'berry', id);
      if (after.enemyUnits.length === 1 && after.enemyUnits[0].tameFails === 1) {
        b = after;
        enemyId = id;
        break;
      }
    }
    expect(b).not.toBeNull();
    // 继续喂食直到成功，验证失败加成机制不破坏流程且确实经历多次尝试
    let attempts = 1;
    let guard = 0;
    while (b!.enemyUnits.length === 1 && guard < 200) {
      b = playerTame(b!, 'berry', enemyId);
      attempts += 1;
      guard += 1;
    }
    expect(b!.pendingTame.length).toBe(1);
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  it('tameChance 随失败次数递增且上限 100%', () => {
    const u = makeUnit('kiki', false, 0, true);
    u.hp = Math.floor(u.maxHp * 0.4);
    const c0 = tameChance(u, 'berry');
    expect(c0).toBeGreaterThan(0);
    u.tameFails = 1;
    expect(tameChance(u, 'berry')).toBeGreaterThan(c0);
    u.tameFails = 100;
    expect(tameChance(u, 'berry')).toBe(1);
  });

  it('tameChance 血量越低概率越高', () => {
    const a = makeUnit('kiki', false, 0, true);
    a.hp = Math.floor(a.maxHp * 0.4);
    const b = makeUnit('kiki', false, 0, true);
    b.hp = 1;
    expect(tameChance(b, 'berry')).toBeGreaterThan(tameChance(a, 'berry'));
  });
});

describe('数据完整性', () => {
  it('所有怪物引用的技能都存在', () => {
    for (const sp of Object.values(MONSTERS)) {
      for (const s of sp.skills) {
        expect(SKILLS[s], `怪物 ${sp.name} 引用了不存在的技能 ${s}`).toBeDefined();
      }
      if (sp.evolutions) {
        for (const ev of sp.evolutions) {
          expect(MONSTERS[ev.to], `${sp.name} 的进化目标不存在`).toBeDefined();
        }
      }
    }
  });

  it('怪物与技能数据为正数且合理', () => {
    for (const sp of Object.values(MONSTERS)) {
      expect(sp.baseHp).toBeGreaterThan(0);
      expect(sp.baseSpd).toBeGreaterThan(0);
      expect(sp.tame.difficulty).toBeGreaterThanOrEqual(0);
      expect(sp.tame.difficulty).toBeLessThanOrEqual(1);
    }
    for (const sk of Object.values(SKILLS)) {
      expect(sk.damage ?? sk.heal ?? 0).toBeGreaterThanOrEqual(0);
    }
  });
});
