import { describe, it, expect } from 'vitest';
import { makeUnit, createBattle, playerSkill, playerEndTurn } from '../src/game/core/battle';

/** 取某单位最后一次攻击日志的 addsStatus（状态标在最后一段攻击日志上） */
function lastAttackAdds(
  b: ReturnType<typeof playerEndTurn>,
  actorUid: string,
  skillName: string,
): string[] | undefined {
  const logs = b.log.filter((l) => l.actorUid === actorUid && l.text.includes(`使用「${skillName}」攻击`));
  if (logs.length === 0) return undefined;
  return logs[logs.length - 1].addsStatus;
}

describe('攻击日志携带 addsStatus（动画按「附加它的攻击」揭示新增状态）', () => {
  it('毒刺（附加中毒）：攻击日志 addsStatus 为 [poison]', () => {
    const a = makeUnit('pipi', true, 0, false);
    const b0 = createBattle([a], [{ speciesId: 'lulu' }], 3);
    const b1 = playerEndTurn(playerSkill(b0, a.uid, 'poison_sting', b0.enemyUnits[0].uid));
    expect(lastAttackAdds(b1, a.uid, '毒刺')).toEqual(['poison']);
  });

  it('铁刺（附加减防）：攻击日志 addsStatus 为 [atkDown]', () => {
    const a = makeUnit('kiki', true, 0, false);
    const b0 = createBattle([a], [{ speciesId: 'lulu' }], 3);
    const b1 = playerEndTurn(playerSkill(b0, a.uid, 'steel_spike', b0.enemyUnits[0].uid));
    expect(lastAttackAdds(b1, a.uid, '铁刺')).toEqual(['atkDown']);
  });

  it('火花（炽热被动+技能均附加灼烧）：addsStatus 汇总两处来源为 [burn, burn]', () => {
    const a = makeUnit('fifi', true, 0, false);
    const b0 = createBattle([a], [{ speciesId: 'lulu' }], 3);
    const b1 = playerEndTurn(playerSkill(b0, a.uid, 'ember', b0.enemyUnits[0].uid));
    expect(lastAttackAdds(b1, a.uid, '火花')).toEqual(['burn', 'burn']);
  });

  it('爪击（无附加状态）：addsStatus 为 undefined', () => {
    const a = makeUnit('kiki', true, 0, false);
    const b0 = createBattle([a], [{ speciesId: 'lulu' }], 3);
    const b1 = playerEndTurn(playerSkill(b0, a.uid, 'punch', b0.enemyUnits[0].uid));
    expect(lastAttackAdds(b1, a.uid, '爪击')).toBeUndefined();
  });

  it('连击（多段）：状态只在最后一段攻击日志携带，前段为 undefined', () => {
    const a = makeUnit('fifi_king', true, 0, false);
    const b0 = createBattle([a], [{ speciesId: 'lulu' }], 3);
    const b1 = playerEndTurn(playerSkill(b0, a.uid, 'double_hit', b0.enemyUnits[0].uid));
    const logs = b1.log.filter((l) => l.actorUid === a.uid && l.text.includes('使用「连击」攻击'));
    expect(logs.length).toBe(2);
    expect(logs[0].addsStatus).toBeUndefined();
    expect(logs[1].addsStatus).toEqual(['burn']);
  });
});
