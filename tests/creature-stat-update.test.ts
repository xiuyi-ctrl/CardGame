import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerSkill, playerEndTurn, skillCooldownLeft, skillUsesLeft } from '../src/game/core/battle';
import { getPassive } from '../src/game/data/passives';
import { getSkill } from '../src/game/data/skills';
import { getSkillEnhanceBonus } from '../src/game/core/growth';

describe('基础伙伴属性与挑衅调整', () => {
  it('泡泡／泡泡将速度、刺刺速度与棘尾生命按新面板生成', () => {
    expect(makeUnit('lulu', true, 0, false).spd).toBe(3);
    expect(makeUnit('lulu_king', true, 0, false).spd).toBe(4);
    expect(makeUnit('pipi', true, 0, false).spd).toBe(1);
    expect(makeUnit('sisi', true, 0, false).maxHp).toBe(18);
  });
  it('咪咪毒牙命中附加2层中毒，毒尾不受影响', () => {
    expect(getPassive('venom_fang')?.value).toBe(2);
    expect(getPassive('venom_tail')?.value).toBe(3);
    const b = createBattle([makeUnit('mimi', true, 0, false)], [{ speciesId: 'lulu' }], 1);
    b.enemyUnits[0] = { ...b.enemyUnits[0], hp: 100, maxHp: 100, skills: [], acted: true };
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'bite', b.enemyUnits[0].uid));
    const hit = after.log.find(e => e.actorUid === b.playerUnits[0].uid && e.text.includes('攻击'))!;
    expect(hit.statuses?.[b.enemyUnits[0].uid].find(s => s.kind === 'poison')?.value).toBe(2);
  });
  it('挑衅无限次，使用后下一回合冷却，隔一回合恢复；强化仅增伤', () => {
    expect(getSkill('provoke')).toMatchObject({ cooldown: 1, damage: 3 });
    expect(getSkill('provoke').uses).toBeUndefined();
    for (const level of [0, 1, 2, 3]) {
      expect(getSkillEnhanceBonus('provoke', level)).toMatchObject({ damageBonus: level, effectBonus: level });
    }
    let b = createBattle([makeUnit('pipi', true, 0, false)], [{ speciesId: 'lulu' }], 1);
    b.enemyUnits[0] = { ...b.enemyUnits[0], hp: 100, maxHp: 100, skills: [], acted: true };
    b = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'provoke', b.enemyUnits[0].uid));
    expect(skillUsesLeft(b.playerUnits[0], 'provoke')).toBe(Infinity);
    expect(skillCooldownLeft(b.playerUnits[0], 'provoke')).toBe(1);
    expect(playerSkill(b, b.playerUnits[0].uid, 'provoke', b.enemyUnits[0].uid)).toBe(b);
    b = playerEndTurn(b);
    expect(skillCooldownLeft(b.playerUnits[0], 'provoke')).toBe(0);
  });
});
