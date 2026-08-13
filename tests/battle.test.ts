import { describe, it, expect } from 'vitest';
import {
  createBattle,
  currentPlayerUnit,
  getActablePlayerUnits,
  isTameable,
  makeUnit,
  playerCancelOrder,
  playerEndTurn,
  playerHasMove,
  playerRest,
  playerSkill,
  playerSwap,
  playerTame,
  REST_SKILL_ID,
  skillUsesLeft,
  splitDamage,
  tameChance,
  TAME_THRESHOLD,
  getDamageGuard,
  performGauntletSwap,
} from '../src/game/core/battle';
import type { BattleState, StatusEffect } from '../src/game/types';
import { MONSTERS } from '../src/game/data/monsters';
import { SKILLS } from '../src/game/data/skills';

/** 自动玩家：每回合给所有可行动单位下达首技能指令（最残血敌人为目标），随后结算 */
function autoPlay(b: BattleState, maxTurns = 300): BattleState {
  let nb = b;
  let guard = 0;
  while (nb.phase === 'acting' && guard < maxTurns) {
    // 车轮战：场上一方全灭待换人 → 先换人（模拟 UI 在死亡动画播完后自动触发）
    if (nb.pendingSwap?.player || nb.pendingSwap?.enemy) {
      nb = performGauntletSwap(nb);
      continue;
    }
    for (const u of getActablePlayerUnits(nb)) {
      const target = nb.enemyUnits.filter((x) => x.hp > 0)[0];
      if (!target) break;
      nb = playerSkill(nb, u.uid, u.skills[0], target.uid);
    }
    nb = playerEndTurn(nb);
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
    const after = playerEndTurn(playerSkill(b, cur.uid, cur.skills[0], b.enemyUnits[0].uid));
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
      return playerEndTurn(playerSkill(b, cur.uid, cur.skills[0], b.enemyUnits[0].uid));
    };
    const a = build();
    const c = build();
    // log 的 hp 快照以 uid 为 key（uid 含时间戳非确定），比较文本与归属即可
    expect(a.log.map((l) => ({ text: l.text, side: l.side }))).toEqual(c.log.map((l) => ({ text: l.text, side: l.side })));
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
      let trial = createBattle(
        [makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)],
        [{ speciesId: 'kiki' }],
        seed,
      );
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

  it('回合开始 DOT（灼烧）杀死最后一只敌人后立即判定胜利，不再多给一回合', () => {
    let b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'pipi' }], 1);
    b = {
      ...b,
      playerUnits: b.playerUnits.map((u) => ({ ...u, acted: true })),
      enemyUnits: b.enemyUnits.map((u) => ({
        ...u,
        hp: 1,
        acted: true,
        statuses: [{ kind: 'burn', value: 2, turns: 2 }],
      })),
      turnOrder: [b.playerUnits[0].uid],
      turnIndex: 0,
    };
    // 所有单位已行动，结束回合推进：startRound 结算灼烧（2 层 → 1 伤）→ 敌人阵亡 → 应立即 won
    const after = playerEndTurn(b);
    expect(after.phase).toBe('won');
    expect(after.enemyUnits.every((u) => u.hp <= 0)).toBe(true);
  });

  it('已死亡单位不再受到持续伤害（灼烧/中毒）；一个状态致死后续状态不再补刀', () => {
    const players = [makeUnit('momo_god', true, 0, false), makeUnit('lulu', true, 1, false)].map((u) => ({
      ...u,
      hp: 999,
    }));
    let b = createBattle(players, [{ speciesId: 'sisi' }, { speciesId: 'fifi' }], 1);
    b = {
      ...b,
      // sisi 已死亡但残留灼烧+中毒；fifi 存活保证战斗继续，触发 startRound
      enemyUnits: b.enemyUnits.map((u, i) =>
        i === 0
          ? {
              ...u,
              hp: 1,
              statuses: [
                { kind: 'burn', value: 2, turns: 2 },
                { kind: 'poison', value: 2, turns: 2 },
              ],
            }
          : u,
      ),
    };
    const sisiUid = b.enemyUnits[0].uid;
    const after = playerEndTurn(b);
    expect(after.phase).toBe('acting');
    const sisi = after.enemyUnits.find((u) => u.uid === sisiUid)!;
    expect(sisi.hp).toBe(0);
    // 灼烧致死即停，中毒不再补刀，且不产生「已死亡后仍受持续伤害」的日志
    expect(after.log.filter((l) => l.text.includes(`${sisi.name} 受到灼烧`)).length).toBe(1);
    expect(after.log.some((l) => l.text.includes(`${sisi.name} 受到中毒`))).toBe(false);
  });

  it('灼烧日志的血量快照包含本次掉血（飘字与血量条下降同步）', () => {
    let b = createBattle([makeUnit('momo_god', true, 0, false), makeUnit('lulu', true, 1, false)], [{ speciesId: 'pipi' }], 1);
    b = {
      ...b,
      playerUnits: b.playerUnits.map((u) => ({ ...u, acted: true })),
      enemyUnits: b.enemyUnits.map((u) => ({ ...u, statuses: [{ kind: 'burn', value: 2, turns: 2 }] })),
    };
    const e = b.enemyUnits[0];
    const before = e.hp;
    const after = playerEndTurn(b);
    const dotLog = after.log.find((l) => l.text.includes(`${e.name} 受到灼烧`));
    expect(dotLog).toBeDefined();
    // 2 层灼烧每回合结算 ceil(2/2)=1 层 → 掉 1 血
    expect(dotLog!.hp![e.uid]).toBe(before - 1);
    expect(after.enemyUnits[0].hp).toBe(before - 1);
  });

  it('灼烧/中毒可叠加层数：同一目标再次附加则层数相加', () => {
    const a = makeUnit('fifi_god', true, 0, false); // 余烬焚身被动攻击附加灼烧 4 层；技能附加 2 层
    const raw = createBattle([a], [{ speciesId: 'pipi' }], 1);
    const b: BattleState = {
      ...raw,
      enemyUnits: raw.enemyUnits.map((u) => ({
        ...u,
        hp: 100,
        acted: true,
        statuses: [{ kind: 'burn', value: 2, turns: 2 }],
      })),
    };
    // 已带 2 层灼烧的目标再被火花命中：被动 +4 层、技能 +2 层 = 共 8 层；火花 6+2 伤（余烬焚身对已灼烧+2）、灼烧 8 层结算一半 4 伤
    const after = playerEndTurn(playerSkill(b, a.uid, 'ember', b.enemyUnits[0].uid));
    const burn = after.enemyUnits[0].statuses.find((s) => s.kind === 'burn');
    expect(burn).toBeDefined();
    expect(burn!.value).toBe(4);
    expect(after.enemyUnits[0].hp).toBe(100 - 8 - 4);
  });

  it('灼烧按层数结算：每回合掉一半（向上进位）直至清空', () => {
    let b = createBattle([makeUnit('momo_god', true, 0, false)], [{ speciesId: 'pipi' }], 1);
    b = {
      ...b,
      playerUnits: b.playerUnits.map((u) => ({ ...u, acted: true })),
      enemyUnits: b.enemyUnits.map((u) => ({ ...u, acted: true, hp: 100, statuses: [{ kind: 'burn', value: 3, turns: 2 }] })),
    };
    const after1 = playerEndTurn(b);
    // 第一回合：ceil(3/2)=2 → 掉 2 血、剩 1 层
    expect(after1.enemyUnits[0].hp).toBe(98);
    expect(after1.enemyUnits[0].statuses.find((s) => s.kind === 'burn')?.value).toBe(1);
    // 第二回合：ceil(1/2)=1 → 掉 1 血、清空
    const after2 = playerEndTurn(after1);
    expect(after2.enemyUnits[0].hp).toBe(97);
    expect(after2.enemyUnits[0].statuses.some((s) => s.kind === 'burn')).toBe(false);
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

describe('技能使用次数', () => {
  it('有限次技能初始化次数，无限次技能返回 Infinity', () => {
    const u = makeUnit('lulu_king', true, 0, false); // 愈光 uses:2
    expect(u.skillUses?.['heal_light']).toBe(2);
    expect(skillUsesLeft(u, 'heal_light')).toBe(2);
    expect(skillUsesLeft(u, 'water_gun')).toBe(Infinity);
  });

  it('每次使用扣一次次数；耗尽后 playerSkill 拒绝（状态不变）', () => {
    const u = makeUnit('lulu_king', true, 0, false);
    let b = createBattle([u], [{ speciesId: 'kiki' }], 1);
    // 让泡泡将先挨打受伤，再连续使用愈光（每回合下指令后结算）
    b = {
      ...b,
      playerUnits: b.playerUnits.map((x) => (x.uid === u.uid ? { ...x, hp: 5 } : x)),
    };
    let after = playerEndTurn(playerSkill(b, u.uid, 'heal_light', u.uid));
    expect(skillUsesLeft(after.playerUnits[0], 'heal_light')).toBe(1);
    after = playerEndTurn(playerSkill(after, u.uid, 'heal_light', u.uid));
    expect(skillUsesLeft(after.playerUnits[0], 'heal_light')).toBe(0);
    const hpBefore = after.playerUnits[0].hp;
    const rejected = playerSkill(after, u.uid, 'heal_light', u.uid);
    expect(rejected).toBe(after);
    expect(rejected.playerUnits[0].hp).toBe(hpBefore);
  });

  it('全部玩家技能用尽时战斗不会卡死', () => {
    const u = makeUnit('momo_god', true, 0, false); // 迅天无有限次技能
    const b = createBattle([u], [{ speciesId: 'kiki' }], 42);
    let cur = currentPlayerUnit(b)!;
    const ids = cur.skills;
    expect(ids.length).toBeGreaterThan(0);
    // 反复使用技能，逐回合推进不卡死
    let nb = b;
    let guard = 0;
    while (nb.phase === 'acting' && guard < 300) {
      cur = currentPlayerUnit(nb)!;
      if (!cur) break;
      const limited = cur.skills.find((id) => skillUsesLeft(cur, id) > 0 && skillUsesLeft(cur, id) < Infinity);
      const skillId = limited ?? cur.skills[0];
      nb = playerSkill(nb, cur.uid, skillId, skillId === 'roar' ? cur.uid : nb.enemyUnits[0].uid);
      nb = playerEndTurn(nb);
      guard += 1;
    }
    expect(guard).toBeLessThan(300);
    expect(nb.phase).toBe('won');
  });
});

describe('连击（多段命中）', () => {
  it('连击对单个敌人命中 2 次（伤害×2）', () => {
    const p = makeUnit('momo', true, 0, false);
    p.skills = ['double_hit'];
    const b = createBattle([p], [{ speciesId: 'momo' }], 1);
    const enemy = b.enemyUnits[0];
    const hpBefore = enemy.hp;
    const after = playerEndTurn(playerSkill(b, p.uid, 'double_hit', enemy.uid));
    const e2 = after.enemyUnits.find((u) => u.uid === enemy.uid)!;
    expect(hpBefore - e2.hp).toBe(8); // 4×2
  });

  it('连击守卫减伤对每段生效', () => {
    const p = makeUnit('momo', true, 0, false);
    p.skills = ['double_hit'];
    const b = createBattle([p], [{ speciesId: 'kiki' }], 2); // 铁墩 铁壁 -1
    const enemy = b.enemyUnits[0];
    const hpBefore = enemy.hp;
    const after = playerEndTurn(playerSkill(b, p.uid, 'double_hit', enemy.uid));
    const e2 = after.enemyUnits.find((u) => u.uid === enemy.uid)!;
    expect(hpBefore - e2.hp).toBe(6); // (4-1)×2，每段都扣减伤
  });

  it('连击动画：总伤害拆成多段日志，逐段扣血（8 → 两段 4）', () => {
    const p = makeUnit('momo', true, 0, false);
    p.skills = ['double_hit'];
    const b = createBattle([p], [{ speciesId: 'momo' }], 5);
    const enemy = b.enemyUnits[0];
    const hpBefore = enemy.hp;
    const after = playerEndTurn(playerSkill(b, p.uid, 'double_hit', enemy.uid));
    const attackLogs = after.log.filter((l) => l.text.includes('使用「连击」攻击'));
    expect(attackLogs.length).toBe(2);
    expect(attackLogs.map((l) => l.text)).toEqual([
      `${p.name} 使用「连击」攻击 ${enemy.name}，造成 4 伤害`,
      `${p.name} 使用「连击」攻击 ${enemy.name}，造成 4 伤害`,
    ]);
    // 每段日志的血量快照逐段推进：第一段 -4、第二段 -8
    const e2 = after.enemyUnits.find((u) => u.uid === enemy.uid)!;
    expect(hpBefore - e2.hp).toBe(8);
    expect(attackLogs[0].hp?.[enemy.uid]).toBe(hpBefore - 4);
    expect(attackLogs[1].hp?.[enemy.uid]).toBe(hpBefore - 8);
  });

  it('连击受守卫减伤时仍拆段，每段均扣减伤', () => {
    const p = makeUnit('momo', true, 0, false);
    p.skills = ['double_hit'];
    const b = createBattle([p], [{ speciesId: 'kiki' }], 6); // 铁壁 -1
    const enemy = b.enemyUnits[0];
    const after = playerEndTurn(playerSkill(b, p.uid, 'double_hit', enemy.uid));
    const attackLogs = after.log.filter((l) => l.text.includes('使用「连击」攻击'));
    expect(attackLogs.length).toBe(2);
    expect(attackLogs.map((l) => l.text)).toEqual([
      `${p.name} 使用「连击」攻击 ${enemy.name}，造成 3 伤害`,
      `${p.name} 使用「连击」攻击 ${enemy.name}，造成 3 伤害`,
    ]);
  });

  it('普通单体技能 hits 缺省时仍只造成单次伤害', () => {
    const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'momo' }], 3);
    const p = b.playerUnits[0];
    const enemy = b.enemyUnits[0];
    const hpBefore = enemy.hp;
    const after = playerEndTurn(playerSkill(b, p.uid, 'punch', enemy.uid));
    const e2 = after.enemyUnits.find((u) => u.uid === enemy.uid)!;
    expect(hpBefore - e2.hp).toBe(5); // 爪击 5
  });
});

describe('splitDamage（连击拆段）', () => {
  it('拆分求和等于总量，且段数为 hits', () => {
    expect(splitDamage(8, 2)).toEqual([4, 4]);
    expect(splitDamage(7, 2)).toEqual([4, 3]);
    expect(splitDamage(6, 3)).toEqual([2, 2, 2]);
    expect(splitDamage(5, 3)).toEqual([2, 2, 1]);
    expect(splitDamage(4, 1)).toEqual([4]);
    expect(splitDamage(2, 3).reduce((s, v) => s + v, 0)).toBe(2);
  });
});

describe('休息（本回合不行动）', () => {
  it('休息写入特殊指令、标记已行动、不消耗行动点', () => {
    const b = createBattle(
      [makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)],
      [{ speciesId: 'kiki' }, { speciesId: 'mimi' }],
      1,
    );
    const actor = b.playerUnits[0];
    const apBefore = b.playerAp;
    const after = playerRest(b, actor.uid);
    expect(after.playerAp).toBe(apBefore);
    expect(after.playerUnits[0].acted).toBe(true);
    expect(after.orders?.[actor.uid]).toEqual({ skillId: REST_SKILL_ID });
  });

  it('已选择休息后再次点击取消（不消耗行动点、恢复未行动）', () => {
    const b = createBattle(
      [makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)],
      [{ speciesId: 'kiki' }, { speciesId: 'mimi' }],
      1,
    );
    const actor = b.playerUnits[0];
    const rested = playerRest(b, actor.uid);
    const after = playerRest(rested, actor.uid);
    expect(after.playerAp).toBe(b.playerAp);
    expect(after.playerUnits[0].acted).toBe(false);
    expect(after.orders?.[actor.uid]).toBeUndefined();
  });

  it('休息后改点技能需重新扣 1 行动点（防免费改指令）', () => {
    const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 2);
    const actor = b.playerUnits[0];
    const rested = playerRest(b, actor.uid);
    const apBefore = rested.playerAp;
    const after = playerSkill(rested, actor.uid, actor.skills[0], b.enemyUnits[0].uid);
    expect(after.playerAp).toBe(apBefore - 1);
    expect(after.orders?.[actor.uid]?.skillId).toBe(actor.skills[0]);
  });

  it('技能指令与休息互斥：已有技能指令时不能点休息', () => {
    const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 2);
    const actor = b.playerUnits[0];
    const acted = playerSkill(b, actor.uid, actor.skills[0], b.enemyUnits[0].uid);
    expect(playerRest(acted, actor.uid)).toBe(acted);
  });

  it('已行动/死亡/眩晕单位不能休息', () => {
    const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 2);
    const acted = playerSkill(b, b.playerUnits[0].uid, b.playerUnits[0].skills[0], b.enemyUnits[0].uid);
    expect(playerRest(acted, b.playerUnits[0].uid)).toBe(acted);
    const dead = { ...b, playerUnits: [{ ...b.playerUnits[0], hp: 0 }] };
    expect(playerRest(dead, b.playerUnits[0].uid)).toBe(dead);
    const stun: StatusEffect = { kind: 'stun', value: 0, turns: 1 };
    const stunned = { ...b, playerUnits: [{ ...b.playerUnits[0], statuses: [stun] }] };
    expect(playerRest(stunned, b.playerUnits[0].uid)).toBe(stunned);
  });

  it('结算时休息单位不出手；未选休息的其他单位正常出手', () => {
    const p1 = makeUnit('momo', true, 0, false);
    const p2 = makeUnit('lulu', true, 1, false);
    p1.skills = ['punch'];
    const b = createBattle([p1, p2], [{ speciesId: 'momo' }, { speciesId: 'mimi' }], 3);
    const enemy0 = b.enemyUnits[0];
    const hp0 = enemy0.hp;
    const ordered = playerSkill(b, p1.uid, 'punch', enemy0.uid);
    const rested = playerRest(ordered, p2.uid);
    const after = playerEndTurn(rested);
    // p1 出手、p2 休息不出手 → 敌方 0 号仅掉 5 血（爪击）
    const e0 = after.enemyUnits.find((u) => u.uid === enemy0.uid)!;
    expect(hp0 - e0.hp).toBe(5);
    expect(after.round).toBe(2);
    expect(after.playerUnits.every((u) => !u.acted)).toBe(true);
  });

  it('全体休息后本回合我方无单位出手，下一回合恢复行动', () => {
    const b = createBattle(
      [makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)],
      [{ speciesId: 'kiki' }, { speciesId: 'mimi' }],
      3,
    );
    const enemyHp0 = b.enemyUnits.map((u) => u.hp);
    let nb = b;
    for (const u of [...nb.playerUnits]) nb = playerRest(nb, u.uid);
    // 休息不自动结束回合，玩家仍手动执行指令结算
    const after = playerEndTurn(nb);
    expect(after.enemyUnits.map((u) => u.hp)).toEqual(enemyHp0);
    expect(after.round).toBe(2);
    expect(after.playerUnits.every((u) => !u.acted)).toBe(true);
  });
});

describe('取消已选指令', () => {
  it('取消技能指令：清空指令、恢复未行动、退还 1 行动点', () => {
    const b = createBattle(
      [makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)],
      [{ speciesId: 'kiki' }],
      2,
    );
    const actor = b.playerUnits[0];
    const ordered = playerSkill(b, actor.uid, actor.skills[0], b.enemyUnits[0].uid);
    expect(ordered.playerAp).toBe(1);
    const after = playerCancelOrder(ordered, actor.uid);
    expect(after.playerAp).toBe(2);
    expect(after.playerUnits[0].acted).toBe(false);
    expect(after.orders?.[actor.uid]).toBeUndefined();
    expect(after.phase).toBe('acting');
  });

  it('取消后可重新下达技能指令（再次正常扣行动点）', () => {
    const b = createBattle(
      [makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)],
      [{ speciesId: 'kiki' }],
      2,
    );
    const actor = b.playerUnits[0];
    const after = playerSkill(playerCancelOrder(playerSkill(b, actor.uid, actor.skills[0], b.enemyUnits[0].uid), actor.uid), actor.uid, actor.skills[1], b.enemyUnits[0].uid);
    expect(after.playerAp).toBe(1);
    expect(after.orders?.[actor.uid]?.skillId).toBe(actor.skills[1]);
    expect(after.playerUnits[0].acted).toBe(true);
  });

  it('取消指令不影响其他单位的指令', () => {
    const b = createBattle(
      [makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)],
      [{ speciesId: 'kiki' }],
      2,
    );
    const first = b.playerUnits[0];
    const second = b.playerUnits[1];
    const nb = playerSkill(playerSkill(b, first.uid, first.skills[0], b.enemyUnits[0].uid), second.uid, second.skills[0], b.enemyUnits[0].uid);
    const after = playerCancelOrder(nb, second.uid);
    expect(after.orders?.[first.uid]).toBeDefined();
    expect(after.orders?.[second.uid]).toBeUndefined();
    expect(after.playerAp).toBe(1);
    expect(after.playerUnits.find((u) => u.uid === second.uid)!.acted).toBe(false);
  });

  it('休息指令不能用取消技能取消（用 playerRest 取消），无指令时取消无效', () => {
    const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 2);
    const actor = b.playerUnits[0];
    const rested = playerRest(b, actor.uid);
    expect(playerCancelOrder(rested, actor.uid)).toBe(rested);
    expect(playerRest(playerCancelOrder(rested, actor.uid), actor.uid).orders?.[actor.uid]).toBeUndefined();
    expect(playerCancelOrder(b, actor.uid)).toBe(b);
  });
});

describe('专属被动', () => {
  it('makeUnit 应用速度/生命被动加成并记录被动', () => {
    const quick = makeUnit('momo', true, 0, false); // 迅捷：速度+2
    expect(quick.passive).toBe('quick');
    expect(quick.spd).toBe(MONSTERS.momo.baseSpd + 2);
    const water = makeUnit('lulu', true, 1, false);
    expect(water.passive).toBe('watery_regen');
    expect(water.spd).toBe(MONSTERS.lulu.baseSpd);
  });

  it('铁壁/厚壳等减伤被动降低受到伤害', () => {
    const kiki = makeUnit('kiki', true, 0, false); // 铁壁：-1
    expect(getDamageGuard(kiki)).toBe(1);
    const boss = makeUnit('boss_golem', false, 0, false); // 磐岩护甲：-3
    expect(getDamageGuard(boss)).toBe(3);
    const none = makeUnit('momo', true, 0, false);
    expect(getDamageGuard(none)).toBe(0);
  });

  it('再生被动：每回合开始恢复生命', () => {
    // 露露有水愈（每回合恢复 1）；被迅迅攻击后进入下一回合会触发再生
    const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'lulu' }], 7);
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid));
    expect(after.enemyUnits[0].hp).toBeGreaterThan(0);
    expect(after.log.some((e) => e.text.includes('「水愈」恢复'))).toBe(true);
  });

  it('尖刺反伤：受击反伤攻击者', () => {
    const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'pipi' }], 3);
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid));
    expect(after.log.some((e) => e.text.includes('「尖刺」反伤'))).toBe(true);
    expect(after.playerUnits[0].hp).toBeLessThan(b.playerUnits[0].hp);
  });

  it('毒牙：攻击命中附加中毒', () => {
    const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'mimi' }], 3);
    // 先让敌方行动（咪咪攻击迅迅）→ 触发毒牙
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid));
    expect(after.playerUnits[0].statuses.some((s) => s.kind === 'poison')).toBe(true);
  });

  it('所有怪物都配置了被动', () => {
    for (const sp of Object.values(MONSTERS)) {
      expect(sp.passive, `${sp.name} 缺少被动`).toBeDefined();
    }
  });
});

describe('行动点与前后排', () => {
  it('初始行动点 = 存活出战数；每回合重置', () => {
    const players = [makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)];
    const b = createBattle(players, [{ speciesId: 'kiki' }, { speciesId: 'pipi' }], 1);
    expect(b.playerAp).toBe(2);
    expect(b.enemyAp).toBe(2);
    expect(playerHasMove(b)).toBe(true);
  });

  it('下指令消耗 1 AP；结束回合结算后进入新回合重置 AP', () => {
    const players = [makeUnit('momo', true, 0, false)];
    const b = createBattle(players, [{ speciesId: 'kiki' }], 1);
    expect(b.playerAp).toBe(1);
    const ordered = playerSkill(b, b.playerUnits[0].uid, b.playerUnits[0].skills[0], b.enemyUnits[0].uid);
    // 1 AP 用完 → 指令已下达，等待结算
    expect(ordered.playerAp).toBe(0);
    expect(ordered.playerUnits[0].acted).toBe(true);
    const after = playerEndTurn(ordered);
    // 结算完成 → 敌方行动 + 新回合，AP 重置
    expect(after.phase).toBe('acting');
    expect(after.playerAp).toBe(1);
    expect(after.playerUnits[0].acted).toBe(false);
  });

  it('每只宠物每回合最多占用一次行动；重复下达仅修改指令', () => {
    const players = [makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)];
    const b = createBattle(players, [{ speciesId: 'kiki' }], 1);
    const first = b.playerUnits[0];
    const second = b.playerUnits[1];
    let nb = playerSkill(b, first.uid, first.skills[0], b.enemyUnits[0].uid);
    expect(nb.playerAp).toBe(1);
    expect(nb.orders?.[first.uid]).toBeDefined();
    // 同一宠物再次下达技能 = 修改指令，不重复扣 AP/不重复占用行动
    const modified = playerSkill(nb, first.uid, first.skills[0], b.enemyUnits[0].uid);
    expect(modified.playerAp).toBe(1);
    expect(modified.playerUnits.find((u) => u.uid === first.uid)!.acted).toBe(true);
    // 另一只宠物可以下指令
    nb = playerSkill(nb, second.uid, second.skills[0], b.enemyUnits[0].uid);
    expect(nb.playerAp).toBe(0);
    expect(nb.phase).toBe('acting');
  });

  it('敌方 4 只时第 4 只站后排', () => {
    const players = [makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false), makeUnit('fifi', true, 2, false), makeUnit('gora', true, 0, false)];
    const b = createBattle(players, [{ speciesId: 'kiki' }, { speciesId: 'pipi' }, { speciesId: 'mimi' }, { speciesId: 'sisi' }], 1);
    expect(b.enemyUnits.length).toBe(4);
    expect(b.enemyUnits.filter((u) => u.row === 'front').length).toBe(3);
    expect(b.enemyUnits.filter((u) => u.row === 'back').length).toBe(1);
  });

  it('默认单体技能只能打前排；前排全灭后才能打后排', () => {
    const players = [
      makeUnit('momo', true, 0, false),
      makeUnit('lulu', true, 1, false),
      makeUnit('fifi', true, 2, false),
      makeUnit('gora', true, 0, false),
    ];
    const b = createBattle(players, [{ speciesId: 'kiki' }, { speciesId: 'pipi' }, { speciesId: 'mimi' }, { speciesId: 'sisi' }], 1);
    // 我方全体高血保证结算中指令都能执行；移除铁卫「硬甲」被动避免反伤后排干扰断言
    const strong = {
      ...b,
      playerUnits: b.playerUnits.map((u) =>
        u.speciesId === 'gora' ? { ...u, hp: 999, passive: undefined } : { ...u, hp: 999 },
      ),
    };
    const front = strong.enemyUnits.filter((u) => u.row === 'front');
    const back = strong.enemyUnits.filter((u) => u.row === 'back')[0];
    const frontHps = front.map((u) => u.hp);
    // 前排存活时：攻击后排的显式目标会被重定向到前排（随机一只）
    const after = playerEndTurn(playerSkill(strong, strong.playerUnits[0].uid, 'punch', back.uid));
    const afterFrontHps = after.enemyUnits.filter((u) => u.row === 'front').map((u) => u.hp);
    expect(afterFrontHps.some((hp, i) => hp < frontHps[i])).toBe(true);
    expect(after.enemyUnits.find((u) => u.uid === back.uid)!.hp).toBe(back.hp);
  });

  it('direct 定位技能可无视前排直击后排', () => {
    const players = [
      makeUnit('momo', true, 0, false),
      makeUnit('lulu', true, 1, false),
      makeUnit('fifi', true, 2, false),
      makeUnit('gora', true, 0, false),
    ];
    const b = createBattle(players, [{ speciesId: 'kiki' }, { speciesId: 'pipi' }, { speciesId: 'mimi' }, { speciesId: 'sisi' }], 2);
    const strong = { ...b, playerUnits: b.playerUnits.map((u) => ({ ...u, hp: 999 })) };
    const back = strong.enemyUnits.filter((u) => u.row === 'back')[0];
    const backHp = back.hp;
    const after = playerEndTurn(playerSkill(strong, strong.playerUnits[0].uid, 'pierce_strike', back.uid));
    expect(after.enemyUnits.find((u) => u.uid === back.uid)!.hp).toBeLessThan(backHp);
  });

  it('pierce 贯穿：命中前排并波及对应列后排', () => {
    const players = [
      makeUnit('momo', true, 0, false),
      makeUnit('lulu', true, 1, false),
      makeUnit('fifi', true, 2, false),
      makeUnit('gora', true, 0, false),
    ];
    const b = createBattle(players, [{ speciesId: 'kiki' }, { speciesId: 'pipi' }, { speciesId: 'mimi' }, { speciesId: 'sisi' }], 3);
    const strong = { ...b, playerUnits: b.playerUnits.map((u) => ({ ...u, hp: 999 })) };
    const back = strong.enemyUnits.filter((u) => u.row === 'back')[0];
    const frontSameCol = strong.enemyUnits.find((u) => u.row === 'front' && u.column === back.column)!;
    const after = playerEndTurn(playerSkill(strong, strong.playerUnits[0].uid, 'shockwave', frontSameCol.uid));
    expect(after.enemyUnits.find((u) => u.uid === frontSameCol.uid)!.hp).toBeLessThan(frontSameCol.hp);
    expect(after.enemyUnits.find((u) => u.uid === back.uid)!.hp).toBeLessThan(back.hp);
  });

  it('back 定位技能跳过前排直击后排', () => {
    const players = [
      makeUnit('momo', true, 0, false),
      makeUnit('lulu', true, 1, false),
      makeUnit('fifi', true, 2, false),
      makeUnit('gora', true, 0, false),
    ];
    const b = createBattle(players, [{ speciesId: 'kiki' }, { speciesId: 'pipi' }, { speciesId: 'mimi' }, { speciesId: 'sisi' }], 4);
    const strong = { ...b, playerUnits: b.playerUnits.map((u) => ({ ...u, hp: 999 })) };
    const back = strong.enemyUnits.filter((u) => u.row === 'back')[0];
    const backHp = back.hp;
    const after = playerEndTurn(playerSkill(strong, strong.playerUnits[0].uid, 'snipe', back.uid));
    expect(after.enemyUnits.find((u) => u.uid === back.uid)!.hp).toBeLessThan(backHp);
  });

  it('换位：消耗 1 AP 交换两只己方宠物位置', () => {
    const players = [
      makeUnit('momo', true, 0, false),
      makeUnit('lulu', true, 1, false),
      makeUnit('fifi', true, 2, false),
      makeUnit('gora', true, 0, false, 'back'),
    ];
    const b = createBattle(players, [{ speciesId: 'kiki' }], 1);
    // momo 在前排，第四只 gora 在后排
    const a = b.playerUnits[0];
    const d = b.playerUnits[3];
    expect(a.row).toBe('front');
    expect(d.row).toBe('back');
    const after = playerSwap(b, a.uid, d.uid);
    const aAfter = after.playerUnits.find((u) => u.uid === a.uid)!;
    const dAfter = after.playerUnits.find((u) => u.uid === d.uid)!;
    expect(aAfter.row).toBe('back');
    expect(dAfter.row).toBe('front');
    expect(aAfter.column).toBe(d.column);
    expect(dAfter.column).toBe(a.column);
    expect(after.playerAp).toBe(b.playerAp - 1);
    expect(after.playerUnits.find((u) => u.uid === a.uid)!.acted).toBe(true);
  });

  it('换位：换位后的宠物无法再行动（占行动），其余宠物正常', () => {
    const players = [makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)];
    const b = createBattle(players, [{ speciesId: 'kiki' }], 1);
    const a = b.playerUnits[0];
    const c = b.playerUnits[1];
    let nb = playerSwap(b, a.uid, c.uid);
    expect(getActablePlayerUnits(nb).map((u) => u.uid)).not.toContain(a.uid);
    // 另一只仍可下达指令（指令阶段不立即结算）
    nb = playerSkill(nb, c.uid, c.skills[0], nb.enemyUnits[0].uid);
    expect(nb.phase).toBe('acting');
  });

  it('统一结算：玩家执行指令，敌方行动后进入新回合', () => {
    const players = [makeUnit('momo_god', true, 0, false)];
    const b = createBattle(players, [{ speciesId: 'sisi' }, { speciesId: 'fifi' }], 1);
    const r0 = b.round;
    // 玩家结束指令阶段 → 结算（我方指令+敌方行动）→ 新回合
    const after = playerEndTurn(b);
    expect(after.round).toBeGreaterThan(r0);
    expect(after.enemyAp).toBeGreaterThanOrEqual(0);
  });

  it('斗兽场/车轮战以外的战斗：敌方数量 = 玩家数量（clamp 2~4，单敌遭遇保持 1）', () => {
    const two = createBattle(
      [makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)],
      [{ speciesId: 'kiki' }, { speciesId: 'pipi' }],
      1,
    );
    expect(two.enemyUnits.length).toBe(2);
    const one = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 1);
    expect(one.enemyUnits.length).toBe(1);
  });
});

describe('战斗日志与动画时序', () => {
  it('反伤日志在攻击日志之后，且攻击快照不含反伤扣血', () => {
    const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'pipi' }], 3);
    const momoUid = b.playerUnits[0].uid;
    const momoHp0 = b.playerUnits[0].hp;
    const after = playerEndTurn(playerSkill(b, momoUid, 'punch', b.enemyUnits[0].uid));
    const attackIdx = after.log.findIndex((l) => l.text.includes('攻击 刺刺'));
    const thornIdx = after.log.findIndex((l) => l.text.includes('「尖刺」反伤'));
    expect(attackIdx).toBeGreaterThanOrEqual(0);
    expect(thornIdx).toBeGreaterThan(attackIdx);
    expect(after.log[attackIdx].hp?.[momoUid]).toBe(momoHp0);
    expect(after.log[thornIdx].hp?.[momoUid]).toBe(momoHp0 - 2);
  });

  it('敌方治疗次数用尽后不再治疗（即使带治疗技能且残血）', () => {
    let b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'momo_queen' }], 3);
    b = { ...b, enemyHealsLeft: 0, enemyUnits: [{ ...b.enemyUnits[0], hp: 6 }] };
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid));
    expect(after.log.some((l) => l.text.includes('愈光'))).toBe(false);
    expect(after.log.some((l) => l.text.includes('施展失败'))).toBe(false);
  });

  it('敌方治疗次数用尽且仅剩治疗技能时观望', () => {
    let b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'lulu_king' }], 3);
    b = { ...b, enemyHealsLeft: 0, enemyUnits: [{ ...b.enemyUnits[0], hp: 6, skills: ['heal_light'] }] };
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid));
    expect(after.log.some((l) => l.text.includes('无技能可用，只能观望'))).toBe(true);
  });

  it('眩晕敌方行动时产生「被眩晕」日志', () => {
    const stun: StatusEffect = { kind: 'stun', value: 0, turns: 1 };
    let b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 3);
    b = { ...b, enemyUnits: b.enemyUnits.map((u) => ({ ...u, statuses: [stun] })) };
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid));
    expect(after.log.some((l) => l.text.includes('被眩晕'))).toBe(true);
  });

  it('治疗等 ally 技能指向敌方会被拒绝（不扣 AP、不下指令）', () => {
    const b = createBattle([makeUnit('momo_queen', true, 0, false)], [{ speciesId: 'kiki' }], 3);
    const actor = b.playerUnits[0];
    const after = playerSkill(b, actor.uid, 'heal_light', b.enemyUnits[0].uid);
    expect(after).toBe(b);
    expect(after.playerAp).toBe(b.playerAp);
    expect(after.orders?.[actor.uid]).toBeUndefined();
    // 合法目标（指向自己）正常下达
    const ok = playerSkill(b, actor.uid, 'heal_light', actor.uid);
    expect(ok.playerAp).toBe(b.playerAp - 1);
    expect(ok.orders?.[actor.uid]).toBeDefined();
  });

  it('随机多段技能打单体时所有段命中同一目标（叶针 2 段全结算）', () => {
    const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'pipi' }], 3);
    const hp0 = b.enemyUnits[0].hp;
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'leaf_needle', b.enemyUnits[0].uid));
    expect(after.enemyUnits[0].hp).toBe(hp0 - 6);
  });

  it('随机多段技能打多个目标时每段命中不同目标', () => {
    const b = createBattle([makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)], [{ speciesId: 'mimi' }, { speciesId: 'fifi' }], 3);
    const before = b.enemyUnits.map((u) => u.hp);
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'leaf_needle', undefined));
    const afterHps = after.enemyUnits.map((u) => u.hp);
    expect(afterHps[0]).toBe(before[0] - 3);
    expect(afterHps[1]).toBe(before[1] - 3);
  });

  it('叶针命中同名敌人时，日志按 uid 区分目标（动画飘字不串位）', () => {
    const b = createBattle([makeUnit('momo', true, 0, false), makeUnit('lulu', true, 1, false)], [{ speciesId: 'momo' }, { speciesId: 'momo' }], 3);
    const p = b.playerUnits[0];
    const before = b.enemyUnits.map((u) => u.hp);
    const after = playerEndTurn(playerSkill(b, p.uid, 'leaf_needle', undefined));
    const enemyA = after.enemyUnits[0].uid;
    const enemyB = after.enemyUnits[1].uid;
    // 两段都命中（不同目标，各自掉 3 点）；限定 actorUid 排除敌方同名怪的反击日志
    const attackLogs = after.log.filter((l) => l.text.includes('使用「叶针」攻击') && l.actorUid === p.uid);
    expect(attackLogs).toHaveLength(2);
    expect(attackLogs[0].actorUid).toBe(p.uid);
    expect(attackLogs[1].actorUid).toBe(p.uid);
    // 文本相同（同名敌人），但 targetUid 各自指向不同敌人，动画据此在正确敌人上播放
    expect(new Set(attackLogs.map((l) => l.targetUid))).toEqual(new Set([enemyA, enemyB]));
    expect(after.enemyUnits[0].hp).toBe(before[0] - 3);
    expect(after.enemyUnits[1].hp).toBe(before[1] - 3);
  });
});
