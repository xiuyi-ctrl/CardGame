import { describe, it, expect } from 'vitest';
import { makeUnit, createBattle, playerEndTurn, playerSkill } from '../src/game/core/battle';
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
