import { describe, it, expect } from 'vitest';
import { makeUnit, createBattle, playerSkill, playerEndTurn } from '../src/game/core/battle';
import { getSkill } from '../src/game/data/skills';

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
  it.each(['double_hit', 'flame_combo'])('%s 连续命中指定的单个敌人，击杀后不转移剩余段数', skillId => {
    const skill = getSkill(skillId);
    expect(skill.target).toBe('single');
    for (const seed of [3, 17, 42]) {
      const battle = createBattle([makeUnit('fifi_king', true, 0, false)], [{ speciesId: 'lulu' }, { speciesId: 'lulu' }], seed);
      battle.playerUnits[0] = { ...battle.playerUnits[0], skills: [skillId], passive: undefined, spd: 99 };
      battle.enemyUnits = battle.enemyUnits.map(unit => ({ ...unit, hp: 50, maxHp: 50, passive: undefined, skills: [], acted: true, row: 'front' }));
      const actor = battle.playerUnits[0], target = battle.enemyUnits[1];
      const after = playerEndTurn(playerSkill(battle, actor.uid, skillId, target.uid));
      const logs = attackLogs(after, actor.uid, skill.name);
      expect(logs).toHaveLength(2);
      expect(logs.every(log => log.targetUid === target.uid)).toBe(true);
      expect(logs[0].hp?.[target.uid]).toBe(50 - skill.damage!);
      expect(logs[1].hp?.[target.uid]).toBe(50 - skill.damage! * 2);
      expect(logs[1].hp?.[battle.enemyUnits[0].uid]).toBe(50);

      target.hp = 1;
      const killed = playerEndTurn(playerSkill(battle, actor.uid, skillId, target.uid));
      expect(attackLogs(killed, actor.uid, skill.name)).toHaveLength(1);
      expect(killed.enemyUnits[0].hp).toBe(50);
    }
  });
  it('连击一段击杀唯一敌人：只产生一段攻击日志，敌人归零', () => {
    const { a, b0, lulu } = lowHpEnemy(1);
    const b1 = playerEndTurn(playerSkill(b0, a.uid, 'double_hit', lulu.uid));
    const logs = attackLogs(b1, a.uid, '连击');
    expect(logs.length).toBe(1);
    expect(logs[0].text).toContain('造成 2 伤害');
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
    // 两段命中后的血量快照：14 - 2 - 2 = 10（后续敌方行动/灼烧/regen 结算不改连击日志本身）
    expect(logs[1].hp?.[b1.enemyUnits[0].uid]).toBe(10);
    // 灼焰每段触发：第一段 3 层，第二段叠加到 6 层
    expect(logs[0].statuses?.[b1.enemyUnits[0].uid].find((s) => s.kind === 'burn')?.value).toBe(3);
    expect(logs[1].statuses?.[b1.enemyUnits[0].uid].find((s) => s.kind === 'burn')?.value).toBe(6);
  });

  it('灼灼/灼刃的连击与火焰连击每段触发灼烧被动', () => {
    const fifi = makeUnit('fifi', true, 0, false);
    const b1 = createBattle([fifi], [{ speciesId: 'lulu' }], 3);
    const after1 = playerEndTurn(playerSkill(b1, fifi.uid, 'double_hit', b1.enemyUnits[0].uid));
    const logs1 = attackLogs(after1, fifi.uid, '连击');
    expect(logs1[1].statuses?.[b1.enemyUnits[0].uid].find((s) => s.kind === 'burn')?.value).toBe(4);

    const fifiKing = makeUnit('fifi_king', true, 0, false);
    const b2 = createBattle([fifiKing], [{ speciesId: 'lulu' }], 3);
    const after2 = playerEndTurn(playerSkill(b2, fifiKing.uid, 'double_hit', b2.enemyUnits[0].uid));
    const logs2 = attackLogs(after2, fifiKing.uid, '连击');
    expect(logs2[1].statuses?.[b2.enemyUnits[0].uid].find((s) => s.kind === 'burn')?.value).toBe(6);

    const b3 = createBattle([makeUnit('fifi_king', true, 0, false)], [{ speciesId: 'lulu' }], 3);
    const after3 = playerEndTurn(playerSkill(b3, b3.playerUnits[0].uid, 'flame_combo', b3.enemyUnits[0].uid));
    const logs3 = attackLogs(after3, b3.playerUnits[0].uid, '火焰连击');
    expect(logs3[1].statuses?.[b3.enemyUnits[0].uid].find((s) => s.kind === 'burn')?.value).toBe(10);
  });

  it('高减伤（厚壳 -2）：多段每段都扣减伤，每段保底 1', () => {
    const a = makeUnit('fifi_king', true, 0, false);
    const raw = createBattle([a], [{ speciesId: 'gora' }], 9);
    const enemy = raw.enemyUnits[0];
    const b1 = playerEndTurn(playerSkill(raw, a.uid, 'double_hit', enemy.uid));
    const logs = attackLogs(b1, a.uid, '连击');
    expect(logs.length).toBe(2);
    expect(logs.map((l) => l.text)).toEqual([
      `${a.name} 使用「连击」攻击 ${enemy.name}，造成 1 伤害`,
      `${a.name} 使用「连击」攻击 ${enemy.name}，造成 1 伤害`,
    ]);
  });

  it('尖刺反伤对多段每段都触发（连击 2 段反 2 次）', () => {
    const a = makeUnit('fifi_king', true, 0, false);
    const b0 = createBattle([a], [{ speciesId: 'pipi' }], 3); // 刺刺 尖刺反伤 1
    const b1 = playerEndTurn(playerSkill(b0, a.uid, 'double_hit', b0.enemyUnits[0].uid));
    const attackLogsArr = attackLogs(b1, a.uid, '连击');
    const thornLogs = b1.log.filter((l) => l.text.includes('「尖刺」反伤'));
    expect(attackLogsArr.length).toBe(2);
    expect(thornLogs.length).toBe(2);
    // 每次反伤日志时的血量快照：每段攻击后玩家被反 2（第一段后 -2、第二段后 -4）
    expect(thornLogs[0].hp?.[a.uid]).toBe(a.maxHp - 2);
    expect(thornLogs[1].hp?.[a.uid]).toBe(a.maxHp - 4);
  });

  it('潮汐吸噬吸血对多段每段都触发（连击 2 段吸 2 次）', () => {
    // 用自创生物+drain被动模拟潮汐吸噬多段吸血
    const a = makeUnit('lulu', true, 0, false);
    a.passive = 'tide_drain';
    a.hp = 10;
    a.skills = ['double_hit'];
    const b0 = createBattle([a], [{ speciesId: 'lulu' }], 3);
    const b1 = playerEndTurn(playerSkill(b0, a.uid, 'double_hit', b0.enemyUnits[0].uid));
    // 攻击日志快照在吸血前：第一段日志玩家仍 10；第二段日志已含第一段吸血（12）
    const attackLogsArr = attackLogs(b1, a.uid, '连击');
    expect(attackLogsArr.length).toBe(2);
    expect(attackLogsArr[0].hp?.[a.uid]).toBe(10);
    expect(attackLogsArr[1].hp?.[a.uid]).toBe(12);
    // 两段吸血全部完成后玩家为 14（10 + 2×2）：敌方反击日志快照（扣血后）= 14 - 本次反击伤害
    const luluAtk = b1.log.find((l) => l.actorUid === b0.enemyUnits[0].uid && l.text.includes('使用「'))!;
    const luluDmg = Number(/造成 (\d+) 伤害/.exec(luluAtk.text)?.[1] ?? 0);
    expect(luluAtk.hp?.[a.uid]).toBe(14 - luluDmg);
  });

  it('侵蚀「伤害加深」对多段每段生效（连击 2 段各 +2）', () => {
    const p = makeUnit('lulu', true, 0, false);
    p.spd = 1; // 让敌方先手
    const raw = createBattle([p], [{ speciesId: 'boss_crab' }], 5, { corruptDebuff: 'dmg' });
    // 移除 createBattle 自动触发的潮汐节律 atkUp，确保伤害为基础 2 + 侵蚀 2 = 4
    const enemy = { ...raw.enemyUnits[0], skills: ['double_hit'], statuses: raw.enemyUnits[0].statuses.filter((s) => s.kind !== 'atkUp') };
    const b0 = { ...raw, enemyUnits: [enemy] };
    const b1 = playerEndTurn(b0);
    const logs = b1.log.filter((l) => l.text.includes('使用「连击」攻击'));
    expect(logs.map((l) => l.text)).toEqual([
      `${enemy.name} 使用「连击」攻击 ${p.name}，造成 4 伤害`,
      `${enemy.name} 使用「连击」攻击 ${p.name}，造成 4 伤害`,
    ]);
  });
});
