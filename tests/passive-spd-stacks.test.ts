import { describe, it, expect } from 'vitest';
import { makeUnit, createBattle, playerSkill, playerEndTurn } from '../src/game/core/battle';

/**
 * 受击加速被动：多段攻击命中后 passiveSpdStacks 应逐段递增
 */
describe('passiveSpdStacks：多段攻击后被动速度层数正确累积', () => {
  it('叶针2段命中古树之主(treeSpeedUp)：passiveSpdStacks=2', () => {
    const player = makeUnit('momo', true, 0, false);
    const raw = createBattle([player], [{ speciesId: 'boss_vine' }], 42);
    const boss = raw.enemyUnits[0];
    expect(boss.passive).toBe('tree_speed_up');
    const spdBefore = boss.spd;

    const after = playerEndTurn(playerSkill(raw, player.uid, 'leaf_needle', boss.uid));
    const bossAfter = after.enemyUnits.find((u) => u.uid === boss.uid)!;

    expect(bossAfter.passiveSpdStacks).toBe(2);
    expect(bossAfter.spd).toBe(spdBefore + 2);
  });

  it('连击2段命中受击加速目标：passiveSpdStacks=2', () => {
    const player = makeUnit('fifi_king', true, 0, false);
    const raw = createBattle([player], [{ speciesId: 'boss_vine' }], 99);
    const boss = raw.enemyUnits[0];

    const after = playerEndTurn(playerSkill(raw, player.uid, 'double_hit', boss.uid));
    const bossAfter = after.enemyUnits.find((u) => u.uid === boss.uid)!;

    expect(bossAfter.passiveSpdStacks).toBe(2);
  });

  it('单段攻击命中受击加速目标：passiveSpdStacks=1', () => {
    const player = makeUnit('momo', true, 0, false);
    const raw = createBattle([player], [{ speciesId: 'boss_vine' }], 77);
    const boss = raw.enemyUnits[0];

    const after = playerEndTurn(playerSkill(raw, player.uid, 'vine_whip', boss.uid));
    const bossAfter = after.enemyUnits.find((u) => u.uid === boss.uid)!;

    expect(bossAfter.passiveSpdStacks).toBe(1);
  });

  it('受击加速上限8层：超过8不再增加', () => {
    const player = makeUnit('momo', true, 0, false);
    const raw = createBattle([player], [{ speciesId: 'boss_vine' }], 111);
    const bossOrig = raw.enemyUnits[0];
    // 手动设置已有7层，且标记 acted 跳过 Boss 回合（避免 Boss 先手干扰）
    const boss = { ...bossOrig, passiveSpdStacks: 7, acted: true };
    const b0 = { ...raw, enemyUnits: [boss] };

    const after = playerEndTurn(playerSkill(b0, player.uid, 'leaf_needle', boss.uid));
    const bossAfter = after.enemyUnits.find((u) => u.uid === boss.uid)!;

    // 2段攻击，但上限8，第1段+1到8，第2段不再加
    expect(bossAfter.passiveSpdStacks).toBe(8);
  });
});
