import { describe, it, expect } from 'vitest';
import { makeUnit, createBattle, playerRest, playerEndTurn } from '../src/game/core/battle';

/** 让玩家休息一回合（不攻击），返回 enemyTurn 后的新回合状态 */
function restRound(b: ReturnType<typeof playerEndTurn>): ReturnType<typeof playerEndTurn> {
  const p = b.playerUnits.find((u) => u.hp > 0);
  if (!p) return b;
  const rested = playerRest(b, p.uid);
  return playerEndTurn(rested);
}

describe('潮汐巨蟹机制', () => {
  it('潮汐节律：每3回合触发（round % 3 === 1），atkUp 仅当回合生效', () => {
    const p = makeUnit('lulu', true, 0, false);
    p.spd = 1;
    p.hp = 100;
    p.maxHp = 100;
    const raw = createBattle([p], [{ speciesId: 'boss_crab' }], 7);

    // 初始（round 1，爆发回合）：createBattle 触发潮汐节律，巨蟹有 atkUp
    const crabInit = raw.enemyUnits.find((u) => u.speciesId === 'boss_crab')!;
    expect(crabInit.statuses.some((s) => s.kind === 'atkUp')).toBe(true);

    // 第1次 restRound → round 2：atkUp 消失（tickStatuses 移除）
    const b2 = restRound(raw);
    const crab2 = b2.enemyUnits.find((u) => u.speciesId === 'boss_crab')!;
    expect(crab2.statuses.some((s) => s.kind === 'atkUp')).toBe(false);

    // 第2次 restRound → round 3：仍无
    const b3 = restRound(b2);
    const crab3 = b3.enemyUnits.find((u) => u.speciesId === 'boss_crab')!;
    expect(crab3.statuses.some((s) => s.kind === 'atkUp')).toBe(false);

    // 第3次 restRound → round 4（爆发回合）：再次触发
    const b4 = restRound(b3);
    const crab4 = b4.enemyUnits.find((u) => u.speciesId === 'boss_crab')!;
    expect(crab4.statuses.some((s) => s.kind === 'atkUp')).toBe(true);

    // 第4次 restRound → round 5：消失
    const b5 = restRound(b4);
    const crab5 = b5.enemyUnits.find((u) => u.speciesId === 'boss_crab')!;
    expect(crab5.statuses.some((s) => s.kind === 'atkUp')).toBe(false);

    // 第5次 restRound → round 6：仍无
    const b6 = restRound(b5);
    const crab6 = b6.enemyUnits.find((u) => u.speciesId === 'boss_crab')!;
    expect(crab6.statuses.some((s) => s.kind === 'atkUp')).toBe(false);

    // 第6次 restRound → round 7（爆发回合）：再次触发
    const b7 = restRound(b6);
    const crab7 = b7.enemyUnits.find((u) => u.speciesId === 'boss_crab')!;
    expect(crab7.statuses.some((s) => s.kind === 'atkUp')).toBe(true);
  });

  it('潮汐共鸣：巨蟹爆发时虾兵同步获得 atkUp', () => {
    const p = makeUnit('lulu', true, 0, false);
    p.spd = 1;
    p.hp = 100;
    p.maxHp = 100;
    const raw = createBattle(
      [p],
      [{ speciesId: 'boss_crab' }, { speciesId: 'boss_minion_shrimp' }],
      13,
    );

    // 初始（round 1，爆发回合）：虾兵有 atkUp
    const shrimpInit = raw.enemyUnits.find((u) => u.speciesId === 'boss_minion_shrimp')!;
    expect(shrimpInit.statuses.some((s) => s.kind === 'atkUp')).toBe(true);

    // 第1次 restRound → round 2：虾兵 atkUp 消失
    const b2 = restRound(raw);
    const shrimp2 = b2.enemyUnits.find((u) => u.speciesId === 'boss_minion_shrimp')!;
    expect(shrimp2.statuses.some((s) => s.kind === 'atkUp')).toBe(false);

    // 第3次 restRound → round 4（爆发回合）：虾兵再次有 atkUp
    const b3 = restRound(b2);
    const b4 = restRound(b3);
    const shrimp4 = b4.enemyUnits.find((u) => u.speciesId === 'boss_minion_shrimp')!;
    const crab4 = b4.enemyUnits.find((u) => u.speciesId === 'boss_crab')!;
    expect(crab4.hp).toBeGreaterThan(0);
    expect(shrimp4.hp).toBeGreaterThan(0);
    expect(shrimp4.statuses.some((s) => s.kind === 'atkUp')).toBe(true);
  });

  it('潮汐共鸣：巨蟹死亡时虾兵不触发', () => {
    const p = makeUnit('lulu', true, 0, false);
    p.spd = 1;
    p.hp = 100;
    p.maxHp = 100;
    const raw = createBattle(
      [p],
      [{ speciesId: 'boss_crab' }, { speciesId: 'boss_minion_shrimp' }],
      20,
    );
    // 击杀巨蟹（round 1 爆发后立即击杀）
    const crab = raw.enemyUnits.find((u) => u.speciesId === 'boss_crab')!;
    const killedCrab = { ...crab, hp: 0 };
    const b0 = {
      ...raw,
      enemyUnits: raw.enemyUnits.map((u) => (u.uid === crab.uid ? killedCrab : u)),
    };
    const b1 = restRound(b0);
    const shrimp = b1.enemyUnits.find((u) => u.speciesId === 'boss_minion_shrimp');
    if (shrimp && shrimp.hp > 0) {
      expect(shrimp.statuses.some((s) => s.kind === 'atkUp')).toBe(false);
    }
  });
});

describe('寄居蟹缩壳', () => {
  it('缩壳：AI 不使用 allyAll buff（需通过 resolveAttack 验证）', () => {
    const p = makeUnit('lulu', true, 0, false);
    p.spd = 1;
    p.hp = 100;
    p.maxHp = 100;
    const raw = createBattle([p], [{ speciesId: 'boss_minion_hermit' }], 50);
    const b1 = playerEndTurn(raw);
    const hermit = b1.enemyUnits.find((u) => u.speciesId === 'boss_minion_hermit')!;
    expect(hermit.shield).toBe(0);
  });
});
