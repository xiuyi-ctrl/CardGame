import { describe, it, expect } from 'vitest';
import { makeUnit, createBattle, playerSkill, playerEndTurn } from '../src/game/core/battle';

function attackLogs(
  b: ReturnType<typeof playerEndTurn>,
  actorUid: string,
  skillName: string,
): ReturnType<typeof playerEndTurn>['log'] {
  return b.log.filter((l) => l.actorUid === actorUid && l.text.includes(`使用「${skillName}」攻击`));
}

/** 把唯一敌人血量压低，模拟「连击某段可能把敌人打死」的场景（玩家先手，保证玩家在敌人行动前结算） */
function lowHpEnemy(enemyHp: number) {
  const a = makeUnit('fifi_king', true, 0, false);
  const raw = createBattle([a], [{ speciesId: 'lulu' }], 3);
  const lulu = { ...raw.enemyUnits[0], hp: enemyHp };
  return { a, b0: { ...raw, enemyUnits: [lulu] }, lulu };
}

describe('连击多段：一段之后敌人已死亡则后续段不再命中', () => {
  it('连击一段击杀唯一敌人：只产生一段攻击日志，敌人归零', () => {
    const { a, b0, lulu } = lowHpEnemy(1);
    const b1 = playerEndTurn(playerSkill(b0, a.uid, 'double_hit', lulu.uid));
    const logs = attackLogs(b1, a.uid, '连击');
    expect(logs.length).toBe(1);
    expect(logs[0].text).toContain('造成 4 伤害');
    expect(b1.enemyUnits[0].hp).toBe(0);
  });

  it('状态标记在最后一次命中段：一段击杀时标在该段，补刀两段时标在末段', () => {
    const { a, b0, lulu } = lowHpEnemy(1);
    const b1 = playerEndTurn(playerSkill(b0, a.uid, 'double_hit', lulu.uid));
    const killLogs = attackLogs(b1, a.uid, '连击');
    expect(killLogs.length).toBe(1);
    expect(killLogs[0].addsStatus).toEqual(['burn']);

    const { a: a2, b0: b02 } = lowHpEnemy(5);
    const lulu2 = b02.enemyUnits[0];
    const b2 = playerEndTurn(playerSkill(b02, a2.uid, 'double_hit', lulu2.uid));
    const bothLogs = attackLogs(b2, a2.uid, '连击');
    expect(bothLogs.length).toBe(2);
    expect(bothLogs[0].addsStatus).toBeUndefined();
    expect(bothLogs[1].addsStatus).toEqual(['burn']);
  });

  it('叶针（随机多段打唯一敌人）一段击杀同样截断后续段', () => {
    const a = makeUnit('momo', true, 0, false);
    const raw = createBattle([a], [{ speciesId: 'lulu' }], 3);
    const lulu = { ...raw.enemyUnits[0], hp: 2 };
    const b0 = { ...raw, enemyUnits: [lulu] };
    const b1 = playerEndTurn(playerSkill(b0, a.uid, 'leaf_needle', lulu.uid));
    const logs = attackLogs(b1, a.uid, '叶针');
    expect(logs.length).toBe(1);
    expect(logs[0].text).toContain('造成 3 伤害');
    expect(b1.enemyUnits[0].hp).toBe(0);
  });

  it('满血目标：连击两段全部命中，行为不变', () => {
    const a = makeUnit('fifi_king', true, 0, false);
    const b0 = createBattle([a], [{ speciesId: 'lulu' }], 3);
    const b1 = playerEndTurn(playerSkill(b0, a.uid, 'double_hit', b0.enemyUnits[0].uid));
    const logs = attackLogs(b1, a.uid, '连击');
    expect(logs.length).toBe(2);
    expect(logs[1].addsStatus).toEqual(['burn']);
    // 两段命中后的血量快照：11 - 4 - 4 = 3（后续敌方行动/灼烧/regen 结算不改连击日志本身）
    expect(logs[1].hp?.[b1.enemyUnits[0].uid]).toBe(3);
  });

  it('高减伤（磐岩护甲 -3）：多段每段都扣减伤，每段保底 1', () => {
    const a = makeUnit('fifi_king', true, 0, false);
    const raw = createBattle([a], [{ speciesId: 'boss_golem' }], 9);
    const enemy = raw.enemyUnits[0];
    const b1 = playerEndTurn(playerSkill(raw, a.uid, 'double_hit', enemy.uid));
    const logs = attackLogs(b1, a.uid, '连击');
    expect(logs.length).toBe(2);
    expect(logs.map((l) => l.text)).toEqual([
      `${a.name} 使用「连击」攻击 ${enemy.name}，造成 1 伤害`,
      `${a.name} 使用「连击」攻击 ${enemy.name}，造成 1 伤害`,
    ]);
  });
});
