import { describe, it, expect } from 'vitest';
import {
  createBattle,
  currentPlayerUnit,
  elementMultiplier,
  ELEMENT_ORDER,
  isTameable,
  makeUnit,
  playerSkill,
  playerTame,
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

describe('元素克制', () => {
  it('克制循环为 1.5，被克制为 0.75', () => {
    for (let i = 0; i < ELEMENT_ORDER.length; i++) {
      const a = ELEMENT_ORDER[i];
      const b = ELEMENT_ORDER[(i + 1) % ELEMENT_ORDER.length];
      const c = ELEMENT_ORDER[(i + 2) % ELEMENT_ORDER.length];
      expect(elementMultiplier(a, b)).toBe(1.5);
      expect(elementMultiplier(a, c)).toBe(0.75);
      expect(elementMultiplier(a, a)).toBe(1);
    }
  });
});

describe('战斗基础', () => {
  it('攻击会降低敌人生命值', () => {
    const players = [makeUnit('momo', 1, true, 0, false)];
    const b = createBattle(players, [{ speciesId: 'kiki', level: 1 }], 12345);
    expect(b.phase).toBe('acting');
    const cur = currentPlayerUnit(b)!;
    const hpBefore = b.enemyUnits[0].hp;
    const after = playerSkill(b, cur.skills[0], b.enemyUnits[0].uid);
    expect(after.enemyUnits[0].hp).toBeLessThan(hpBefore);
    expect(after.log.length).toBeGreaterThan(b.log.length);
  });

  it('连续攻击后以胜利结束', () => {
    const players = [makeUnit('momo', 5, true, 0, false)];
    const enemies = [{ speciesId: 'kiki', level: 1 }, { speciesId: 'pipi', level: 1 }];
    const end = autoPlay(createBattle(players, enemies, 7));
    expect(end.phase).toBe('won');
  });

  it('速度排序：快单位先行动', () => {
    const fast = makeUnit('fifi', 1, true, 0, false); // spd 4
    const slow = makeUnit('lulu', 1, true, 1, false); // spd 2
    const b = createBattle([fast, slow], [{ speciesId: 'kiki', level: 1 }], 1);
    expect(b.turnOrder.indexOf(fast.uid)).toBeLessThan(b.turnOrder.indexOf(slow.uid));
    expect(b.turnOrder[0]).toBe(fast.uid);
  });

  it('同一战斗状态 + 相同操作序列是可复现的', () => {
    const build = () => {
      const players = [makeUnit('fifi', 3, true, 0, false)];
      const b = createBattle(players, [{ speciesId: 'momo', level: 2 }, { speciesId: 'lulu', level: 1 }], 99);
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
    const players = [makeUnit('momo', 1, true, 0, false)];
    const b = createBattle(players, [{ speciesId: 'kiki', level: 1 }], 5);
    const rc0 = b.rngCount;
    const after = playerTame(b, 'berry', b.enemyUnits[0].uid);
    expect(after.rngCount).toBe(rc0);
    expect(after.enemyUnits.length).toBe(1);
  });

  it('低血量喂食：要么驯服成功（敌人移除+预备役），要么失败但消耗食物', () => {
    const players = [makeUnit('momo', 1, true, 0, false)];
    const b = createBattle(players, [{ speciesId: 'kiki', level: 1 }], 42);
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
    const u = makeUnit('kiki', 1, false, 0, true);
    u.hp = Math.floor(u.maxHp * 0.3);
    expect(isTameable(u)).toBe(true);
    u.hp = Math.ceil(u.maxHp * TAME_THRESHOLD + 1);
    expect(isTameable(u)).toBe(false);
    const boss = makeUnit('boss_vine', 4, false, 0, false);
    boss.hp = 1;
    expect(isTameable(boss)).toBe(false);
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
          expect(ev.level).toBeGreaterThan(1);
        }
      }
    }
  });

  it('怪物与技能数据为正数且合理', () => {
    for (const sp of Object.values(MONSTERS)) {
      expect(sp.baseHp).toBeGreaterThan(0);
      expect(sp.baseAtk).toBeGreaterThan(0);
      expect(sp.tame.difficulty).toBeGreaterThanOrEqual(0);
      expect(sp.tame.difficulty).toBeLessThanOrEqual(1);
    }
    for (const sk of Object.values(SKILLS)) {
      expect(sk.power).toBeGreaterThanOrEqual(0);
    }
  });
});
