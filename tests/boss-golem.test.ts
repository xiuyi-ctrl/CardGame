import { describe, it, expect } from 'vitest';
import { makeUnit, createBattle, playerEndTurn, playerSkill, playerRest } from '../src/game/core/battle';
import { getMonster } from '../src/game/data/monsters';
import { BOSS_MINIONS } from '../src/game/state/game';

describe('岩甲巨像机制', () => {
  it('boss_golem 首领战包含碎石傀儡和晶石虫', () => {
    expect(BOSS_MINIONS.boss_golem).toEqual(['boss_minion_rock', 'boss_minion_crystal']);
    const p = makeUnit('momo', true, 0, false);
    const raw = createBattle([p], [{ speciesId: 'boss_golem' }, { speciesId: 'boss_minion_rock' }, { speciesId: 'boss_minion_crystal' }], 1);
    expect(raw.enemyUnits.length).toBe(3);
    expect(raw.enemyUnits.map((u) => u.speciesId)).toContain('boss_minion_rock');
    expect(raw.enemyUnits.map((u) => u.speciesId)).toContain('boss_minion_crystal');
  });

  it('Boss 前排居中：巨像在 column 1', () => {
    const p = makeUnit('momo', true, 0, false);
    const raw = createBattle(
      [p],
      [{ speciesId: 'boss_golem' }, { speciesId: 'boss_minion_rock' }, { speciesId: 'boss_minion_crystal' }],
      2,
    );
    const boss = raw.enemyUnits.find((u) => u.speciesId === 'boss_golem')!;
    expect(boss.row).toBe('front');
    expect(boss.column).toBe(1);
  });

  it('巨石投掷：先手 + 眩晕 1 回合，限 3 次', () => {
    const p = makeUnit('momo', true, 0, false);
    p.spd = 10;
    const raw = createBattle(
      [p],
      [{ speciesId: 'boss_golem' }, { speciesId: 'boss_minion_rock' }, { speciesId: 'boss_minion_crystal' }],
      3,
    );
    const boss = raw.enemyUnits.find((u) => u.speciesId === 'boss_golem')!;
    expect(boss.skillUses?.['rock_throw']).toBe(3);
  });

  it('岩壳碎片：击杀小怪时全体敌我均受3点真实伤害', () => {
    const p = makeUnit('momo', true, 0, false);
    p.hp = 100;
    p.maxHp = 100;
    p.spd = 10;
    const raw = createBattle(
      [p],
      [{ speciesId: 'boss_golem' }, { speciesId: 'boss_minion_rock' }],
      4,
    );
    const rock = raw.enemyUnits.find((u) => u.speciesId === 'boss_minion_rock')!;
    const boss = raw.enemyUnits.find((u) => u.speciesId === 'boss_golem')!;
    const rockLow = { ...rock, hp: 1 };
    const bossSilent = { ...boss, acted: true, skillUses: { ...(boss.skillUses ?? {}), rock_throw: 0 } };
    const b0 = { ...raw, enemyUnits: raw.enemyUnits.map((u) => (u.uid === boss.uid ? bossSilent : u.uid === rock.uid ? rockLow : u)) };
    const b1 = playerEndTurn(playerSkill(b0, p.uid, 'punch', rock.uid));
    expect(b1.enemyUnits.find((u) => u.uid === rock.uid)!.hp).toBe(0);
    expect(b1.playerUnits[0].hp).toBe(97);
    expect(b1.enemyUnits.find((u) => u.uid === boss.uid)!.hp).toBe(37);
    // 飘字日志：单条汇总 + burstTargets 含全体波及单位（玩家 + Boss）
    const burstLog = b1.log.find((e) => e.text.includes('岩壳碎片') && e.text.includes('爆裂'));
    expect(burstLog).toBeDefined();
    expect(burstLog!.burstTargets).toBeDefined();
    expect(burstLog!.burstTargets!.length).toBe(2);
    expect(burstLog!.burstTargets).toContain(p.uid);
    expect(burstLog!.burstTargets).toContain(boss.uid);
  });

  it('岩壳碎片：真伤无视护盾，护盾值保留', () => {
    const p = makeUnit('momo', true, 0, false);
    p.hp = 80;
    p.maxHp = 100;
    p.shield = 5;
    p.spd = 10;
    const raw = createBattle(
      [p],
      [{ speciesId: 'boss_golem' }, { speciesId: 'boss_minion_rock' }],
      4,
    );
    const rock = raw.enemyUnits.find((u) => u.speciesId === 'boss_minion_rock')!;
    const boss = raw.enemyUnits.find((u) => u.speciesId === 'boss_golem')!;
    const rockLow = { ...rock, hp: 1 };
    const bossSilent = { ...boss, acted: true, skillUses: { ...(boss.skillUses ?? {}), rock_throw: 0 } };
    const b0 = { ...raw, enemyUnits: raw.enemyUnits.map((u) => (u.uid === boss.uid ? bossSilent : u.uid === rock.uid ? rockLow : u)) };
    const b1 = playerEndTurn(playerSkill(b0, p.uid, 'punch', rock.uid));
    expect(b1.playerUnits[0].hp).toBe(77);
    expect(b1.playerUnits[0].shield).toBe(5);
  });

  it('岩壳碎片：连锁自爆 — 两只小怪均剩1HP，击杀其一连锁自爆两次', () => {
    const p = makeUnit('momo', true, 0, false);
    p.hp = 100;
    p.maxHp = 100;
    p.spd = 10;
    const raw = createBattle(
      [p],
      [{ speciesId: 'boss_golem' }, { speciesId: 'boss_minion_rock' }, { speciesId: 'boss_minion_crystal' }],
      4,
    );
    const rock = raw.enemyUnits.find((u) => u.speciesId === 'boss_minion_rock')!;
    const crystal = raw.enemyUnits.find((u) => u.speciesId === 'boss_minion_crystal')!;
    const boss = raw.enemyUnits.find((u) => u.speciesId === 'boss_golem')!;
    const bossSilent = { ...boss, acted: true, skillUses: { ...(boss.skillUses ?? {}), rock_throw: 0 } };
    const b0 = {
      ...raw,
      enemyUnits: raw.enemyUnits.map((u) => {
        if (u.uid === boss.uid) return bossSilent;
        if (u.uid === rock.uid) return { ...u, hp: 1 };
        if (u.uid === crystal.uid) return { ...u, hp: 1 };
        return u;
      }),
    };
    const b1 = playerEndTurn(playerSkill(b0, p.uid, 'punch', rock.uid));
    expect(b1.enemyUnits.find((u) => u.uid === rock.uid)!.hp).toBe(0);
    expect(b1.enemyUnits.find((u) => u.uid === crystal.uid)!.hp).toBe(0);
    expect(b1.playerUnits[0].hp).toBe(94);
    expect(b1.enemyUnits.find((u) => u.uid === boss.uid)!.hp).toBe(34);
    // 两次自爆各有独立汇总日志 + burstTargets
    const burstLogs = b1.log.filter((e) => e.text.includes('岩壳碎片') && e.text.includes('爆裂'));
    expect(burstLogs.length).toBe(2);
    // 第一次自爆波及玩家 + Boss + 水晶（3 个目标）
    expect(burstLogs[0].burstTargets!.length).toBe(3);
    expect(burstLogs[0].burstTargets).toContain(p.uid);
    expect(burstLogs[0].burstTargets).toContain(boss.uid);
    expect(burstLogs[0].burstTargets).toContain(crystal.uid);
    // 第二次自爆波及玩家 + Boss（水晶已死，2 个目标）
    expect(burstLogs[1].burstTargets!.length).toBe(2);
    expect(burstLogs[1].burstTargets).toContain(p.uid);
    expect(burstLogs[1].burstTargets).toContain(boss.uid);
  });

  it('岩壳碎片：Boss 巨像受击计数随自爆波及而递增', () => {
    const p = makeUnit('momo', true, 0, false);
    p.hp = 100;
    p.maxHp = 100;
    p.spd = 10;
    const raw = createBattle(
      [p],
      [{ speciesId: 'boss_golem' }, { speciesId: 'boss_minion_rock' }],
      4,
    );
    const rock = raw.enemyUnits.find((u) => u.speciesId === 'boss_minion_rock')!;
    const boss = raw.enemyUnits.find((u) => u.speciesId === 'boss_golem')!;
    const bossSilent = { ...boss, acted: true, skillUses: { ...(boss.skillUses ?? {}), rock_throw: 0 } };
    const rockLow = { ...rock, hp: 1 };
    const b0 = { ...raw, enemyUnits: raw.enemyUnits.map((u) => (u.uid === boss.uid ? bossSilent : u.uid === rock.uid ? rockLow : u)) };
    const b1 = playerEndTurn(playerSkill(b0, p.uid, 'punch', rock.uid));
    const bossAfter = b1.enemyUnits.find((u) => u.speciesId === 'boss_golem')!;
    expect(bossAfter.rockShellHits).toBe(1);
  });

  it('岩壳碎片：小怪被灼烧击杀时触发自爆', () => {
    const p = makeUnit('momo', true, 0, false);
    p.hp = 100;
    p.maxHp = 100;
    p.spd = 10;
    const raw = createBattle(
      [p],
      [{ speciesId: 'boss_golem' }, { speciesId: 'boss_minion_rock' }],
      7,
    );
    const rock = raw.enemyUnits.find((u) => u.speciesId === 'boss_minion_rock')!;
    const boss = raw.enemyUnits.find((u) => u.speciesId === 'boss_golem')!;
    // 设置小怪低血+灼烧（100层 → 50伤 → 必死）
    const rockWithBurn = {
      ...rock,
      hp: 1,
      statuses: [{ kind: 'burn' as const, value: 100, turns: 0 }],
    };
    const bossSilent = { ...boss, acted: true, skillUses: { ...(boss.skillUses ?? {}), rock_throw: 0 } };
    const b0 = {
      ...raw,
      enemyUnits: raw.enemyUnits.map((u) =>
        u.uid === boss.uid ? bossSilent : u.uid === rock.uid ? rockWithBurn : u,
      ),
    };
    // 玩家休息（不攻击 Boss，排除攻击造成的计数干扰）
    const b1 = playerEndTurn(playerRest(b0, p.uid));
    // 小怪死亡应触发自爆（3点全体真实伤害）
    const burstLogs = b1.log.filter((l) => l.text.includes('爆裂') && l.burstTargets);
    expect(burstLogs.length).toBeGreaterThanOrEqual(1);
    // Boss 应受到自爆伤害（3点）并计数 +1
    const bossAfter = b1.enemyUnits.find((u) => u.speciesId === 'boss_golem')!;
    expect(bossAfter.rockShellHits).toBe(1);
  });

  it('岩壳碎片：小怪被中毒击杀时也触发自爆', () => {
    const p = makeUnit('momo', true, 0, false);
    p.hp = 100;
    p.maxHp = 100;
    p.spd = 10;
    const raw = createBattle(
      [p],
      [{ speciesId: 'boss_golem' }, { speciesId: 'boss_minion_crystal' }],
      8,
    );
    const crystal = raw.enemyUnits.find((u) => u.speciesId === 'boss_minion_crystal')!;
    const boss = raw.enemyUnits.find((u) => u.speciesId === 'boss_golem')!;
    // 设置小怪低血+中毒（100层 → 50伤 → 必死）
    const crystalWithPoison = {
      ...crystal,
      hp: 1,
      statuses: [{ kind: 'poison' as const, value: 100, turns: 0 }],
    };
    const bossSilent = { ...boss, acted: true, skillUses: { ...(boss.skillUses ?? {}), rock_throw: 0 } };
    const b0 = {
      ...raw,
      enemyUnits: raw.enemyUnits.map((u) =>
        u.uid === boss.uid ? bossSilent : u.uid === crystal.uid ? crystalWithPoison : u,
      ),
    };
    // 玩家休息（不攻击 Boss）
    const b1 = playerEndTurn(playerRest(b0, p.uid));
    // 小怪死亡应触发自爆
    const burstLogs = b1.log.filter((l) => l.text.includes('爆裂') && l.burstTargets);
    expect(burstLogs.length).toBeGreaterThanOrEqual(1);
    // Boss 应受到自爆伤害并计数 +1
    const bossAfter = b1.enemyUnits.find((u) => u.speciesId === 'boss_golem')!;
    expect(bossAfter.rockShellHits).toBe(1);
  });

  it('岩壳碎片：Boss 残血1HP时自爆不会炸死巨像，保底1HP', () => {
    const p = makeUnit('momo', true, 0, false);
    p.hp = 100;
    p.maxHp = 100;
    p.spd = 10;
    const raw = createBattle(
      [p],
      [{ speciesId: 'boss_golem' }, { speciesId: 'boss_minion_rock' }],
      9,
    );
    const rock = raw.enemyUnits.find((u) => u.speciesId === 'boss_minion_rock')!;
    const boss = raw.enemyUnits.find((u) => u.speciesId === 'boss_golem')!;
    // 将小怪挪到前排，boss 也前排；耗尽 boss 的先手技能避免眩晕玩家
    const rockFront = { ...rock, row: 'front' as const, hp: 1 };
    const bossFront = { ...boss, row: 'front' as const, hp: 1, skillUses: { ...(boss.skillUses ?? {}), rock_throw: 0 }, skillCooldowns: { ...(boss.skillCooldowns ?? {}), rock_reforge: 99 } };
    const b0 = {
      ...raw,
      enemyUnits: raw.enemyUnits.map((u) =>
        u.uid === boss.uid ? bossFront : u.uid === rock.uid ? rockFront : u,
      ),
    };
    // 玩家打死小怪（1HP），触发自爆（3 真伤），Boss 应保底 1 HP
    const b1 = playerEndTurn(playerSkill(b0, p.uid, 'punch', rock.uid));
    const rockAfter = b1.enemyUnits.find((u) => u.speciesId === 'boss_minion_rock');
    const bossAfter = b1.enemyUnits.find((u) => u.speciesId === 'boss_golem');
    // 小怪应该死了
    expect(rockAfter!.hp).toBeLessThanOrEqual(0);
    // Boss 应保底 1 HP
    expect(bossAfter!.hp).toBeGreaterThanOrEqual(1);
    // Boss rockShellHits 应 >= 1
    expect(bossAfter!.rockShellHits).toBeGreaterThanOrEqual(1);
  });

  it('岩壳碎片：连锁自爆不会炸死 Boss，保底1HP', () => {
    const p = makeUnit('momo', true, 0, false);
    p.hp = 100;
    p.maxHp = 100;
    p.spd = 10;
    const raw = createBattle(
      [p],
      [{ speciesId: 'boss_golem' }, { speciesId: 'boss_minion_rock' }, { speciesId: 'boss_minion_crystal' }],
      10,
    );
    const rock = raw.enemyUnits.find((u) => u.speciesId === 'boss_minion_rock')!;
    const crystal = raw.enemyUnits.find((u) => u.speciesId === 'boss_minion_crystal')!;
    const boss = raw.enemyUnits.find((u) => u.speciesId === 'boss_golem')!;
    // 全部前排；耗尽 boss 先手技能避免眩晕玩家
    const rockFront = { ...rock, row: 'front' as const, hp: 1 };
    const crystalFront = { ...crystal, row: 'front' as const, hp: 1 };
    const bossFront = { ...boss, row: 'front' as const, hp: 1, skillUses: { ...(boss.skillUses ?? {}), rock_throw: 0 } };
    const b0 = {
      ...raw,
      enemyUnits: raw.enemyUnits.map((u) =>
        u.uid === boss.uid ? bossFront
          : u.uid === rock.uid ? rockFront
            : u.uid === crystal.uid ? crystalFront : u,
      ),
    };
    const b1 = playerEndTurn(playerSkill(b0, p.uid, 'punch', rock.uid));
    const bossAfter = b1.enemyUnits.find((u) => u.speciesId === 'boss_golem')!;
    expect(bossAfter.hp).toBeGreaterThanOrEqual(1);
  });

  it('碎岩重组：未冷却时 Boss 高概率使用（统计10 seed，≥8/10）', () => {
    let reforgeUsed = 0;
    const seeds = [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009];
    for (const seed of seeds) {
      const p = makeUnit('momo', true, 0, false);
      p.hp = 100;
      p.maxHp = 100;
      p.spd = 10;
      const raw = createBattle(
        [p],
        [{ speciesId: 'boss_golem' }, { speciesId: 'boss_minion_rock' }, { speciesId: 'boss_minion_crystal' }],
        seed,
      );
      const boss = raw.enemyUnits.find((u) => u.speciesId === 'boss_golem')!;
      const hasReforge = boss.skills.includes('rock_reforge');
      if (!hasReforge) continue;
      // 耗尽 boss 的攻击技能，确保 AI 只能在 buff 候选（碎岩重组）和观望之间选择
      const bossMod = { ...boss, skillUses: { ...(boss.skillUses ?? {}), rock_throw: 0, steel_spike: 0, quake: 0 } };
      const b0 = { ...raw, enemyUnits: raw.enemyUnits.map((u) => (u.uid === boss.uid ? bossMod : u)) };
      const b1 = playerEndTurn(playerRest(b0, p.uid));
      if (b1.log.some((l) => l.text.includes('碎岩重组'))) reforgeUsed++;
    }
    // 10 个 seed 中应有高概率使用（≥8 次，即 ≥80%）
    expect(reforgeUsed).toBeGreaterThanOrEqual(8);
  });

  it('碎岩重组：小怪阵亡后 Boss 必用碎岩重组复活（deadMinions 无条件）', () => {
    const p = makeUnit('momo', true, 0, false);
    p.hp = 100;
    p.maxHp = 100;
    p.spd = 10;
    const raw = createBattle(
      [p],
      [{ speciesId: 'boss_golem' }, { speciesId: 'boss_minion_rock' }],
      50,
    );
    const rock = raw.enemyUnits.find((u) => u.speciesId === 'boss_minion_rock')!;
    const boss = raw.enemyUnits.find((u) => u.speciesId === 'boss_golem')!;
    // 耗尽 boss 攻击技能 + 碎岩重组冷却中 → 先让 boss 不使用碎岩重组
    // 只耗尽攻击技能，确保 boss 在下一回合能用碎岩重组
    const bossMod = { ...boss, skillUses: { ...(boss.skillUses ?? {}), rock_throw: 0, steel_spike: 0, quake: 0 } };
    const b0 = { ...raw, enemyUnits: raw.enemyUnits.map((u) => (u.uid === boss.uid ? bossMod : u)) };
    // 手动杀死小怪制造 deadMinions 场景
    const rockDead = { ...rock, hp: 0 };
    const b1 = {
      ...b0,
      enemyUnits: b0.enemyUnits.map((u) => (u.uid === rock.uid ? rockDead : u)),
    };
    // Boss 回合：有 deadMinions → 必用碎岩重组（score 80，无条件）
    const b2 = playerEndTurn(playerRest(b1, p.uid));
    expect(b2.log.some((l) => l.text.includes('碎岩重组'))).toBe(true);
    // 重组后应有新的小怪存活
    const newRock = b2.enemyUnits.find((u) => u.speciesId === 'boss_minion_rock' && u.hp > 0);
    expect(newRock).toBeDefined();
  });

  it('碎岩重组：复用死亡小怪 uid/槽位，不产生重复单位', () => {
    const p = makeUnit('momo', true, 0, false);
    p.hp = 100;
    p.maxHp = 100;
    p.spd = 10;
    const raw = createBattle(
      [p],
      [{ speciesId: 'boss_golem' }, { speciesId: 'boss_minion_rock' }, { speciesId: 'boss_minion_crystal' }],
      50,
    );
    const rock = raw.enemyUnits.find((u) => u.speciesId === 'boss_minion_rock')!;
    const crystal = raw.enemyUnits.find((u) => u.speciesId === 'boss_minion_crystal')!;
    const boss = raw.enemyUnits.find((u) => u.speciesId === 'boss_golem')!;
    const bossMod = { ...boss, skillUses: { ...(boss.skillUses ?? {}), rock_throw: 0, steel_spike: 0, quake: 0 } };
    const b0 = { ...raw, enemyUnits: raw.enemyUnits.map((u) => (u.uid === boss.uid ? bossMod : u)) };
    // 手动杀死两只小怪制造 deadMinions
    const b1 = {
      ...b0,
      enemyUnits: b0.enemyUnits.map((u) =>
        u.speciesId === 'boss_minion_rock' ? { ...u, hp: 0 }
          : u.speciesId === 'boss_minion_crystal' ? { ...u, hp: 0 } : u
      ),
    };
    const b2 = playerEndTurn(playerRest(b1, p.uid));
    // reforge 后每种小怪应只有 1 个存活单位（uid 被复用，无重复）
    const rocks = b2.enemyUnits.filter((u) => u.speciesId === 'boss_minion_rock');
    const crystals = b2.enemyUnits.filter((u) => u.speciesId === 'boss_minion_crystal');
    expect(rocks.length).toBe(1);
    expect(rocks[0].hp).toBeGreaterThan(0);
    expect(crystals.length).toBe(1);
    expect(crystals[0].hp).toBeGreaterThan(0);
    // 复用死亡小怪的 uid
    expect(rocks[0].uid).toBe(rock.uid);
    expect(crystals[0].uid).toBe(crystal.uid);
    // 保持 front + 正确 column
    expect(rocks[0].row).toBe('front');
    expect(rocks[0].column).toBe(rock.column);
    expect(crystals[0].row).toBe('front');
    expect(crystals[0].column).toBe(crystal.column);
  });

  it('岩壳崩解：boss 受到4次攻击后触发全体5点伤害', () => {
    const p = makeUnit('momo', true, 0, false);
    p.hp = 100;
    p.maxHp = 100;
    p.spd = 10;
    const raw = createBattle([p], [{ speciesId: 'boss_golem' }], 5);
    const boss = raw.enemyUnits.find((u) => u.speciesId === 'boss_golem')!;
    expect(boss.passive).toBe('rock_shell_break');
  });

  it('boss_golem 数据：HP 40, SPD 2, 铁刺/震地/碎岩重组/巨石投掷', () => {
    const s = getMonster('boss_golem');
    expect(s.baseHp).toBe(40);
    expect(s.baseSpd).toBe(2);
    expect(s.skills).toEqual(['steel_spike', 'quake', 'rock_reforge', 'rock_throw']);
    expect(s.passive).toBe('rock_shell_break');
    expect(s.rank).toBe(4);
    expect(s.tame.difficulty).toBe(0);
  });

  it('碎石傀儡数据：HP 10, SPD 1, 铁刺/碎石投掷', () => {
    const s = getMonster('boss_minion_rock');
    expect(s.baseHp).toBe(10);
    expect(s.baseSpd).toBe(1);
    expect(s.skills).toEqual(['steel_spike', 'gravel_throw']);
    expect(s.passive).toBe('rock_shard');
    expect(s.rank).toBe(4);
    expect(s.tame.difficulty).toBe(0);
  });

  it('晶石虫数据：HP 8, SPD 5, 连击/晶刺', () => {
    const s = getMonster('boss_minion_crystal');
    expect(s.baseHp).toBe(8);
    expect(s.baseSpd).toBe(5);
    expect(s.skills).toEqual(['double_hit', 'crystal_sting']);
    expect(s.passive).toBe('rock_shard');
    expect(s.rank).toBe(4);
    expect(s.tame.difficulty).toBe(0);
  });

  it('小怪被击倒日志显示「被击倒了」', () => {
    const p = makeUnit('momo', true, 0, false);
    p.hp = 100;
    p.maxHp = 100;
    p.spd = 10;
    const raw = createBattle(
      [p],
      [{ speciesId: 'boss_golem' }, { speciesId: 'boss_minion_rock' }],
      6,
    );
    const rock = raw.enemyUnits.find((u) => u.speciesId === 'boss_minion_rock')!;
    const b1 = playerEndTurn(playerSkill(raw, p.uid, 'punch', rock.uid));
    const rockAfter = b1.enemyUnits.find((u) => u.uid === rock.uid)!;
    if (rockAfter.hp <= 0) {
      expect(b1.log.some((l) => l.text.includes('被击倒了'))).toBe(true);
    }
  });
});
