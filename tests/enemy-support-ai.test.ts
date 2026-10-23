import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerEndTurn, selectEnemyAction } from '../src/game/core/battle';
import type { BattleState, Unit } from '../src/game/types';

function setup(skills = ['water_bath', 'claw_attack']): BattleState {
  const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'lulu' }], 123);
  return { ...b, playerUnits: b.playerUnits.map(u => ({ ...u, hp: 40, maxHp: 40, passive: undefined, skills: ['claw_attack'] })),
    enemyUnits: b.enemyUnits.map(u => ({ ...u, hp: 8, maxHp: 20, shield: 0, passive: undefined, skills, skillCooldowns: {}, statuses: [] })) };
}

function choices(b: BattleState, actor = b.enemyUnits[0]) {
  return Array.from({ length: 200 }, (_, i) => selectEnemyAction(b, actor, 0.2, (i + 0.5) / 200));
}

function count(b: BattleState, kind: string, actor = b.enemyUnits[0]) {
  return choices(b, actor).filter(c => c?.kind === kind).length;
}

describe('敌方治疗与增益决策', () => {
  it('有效治疗优于仅补一点血，满血时不为普通治疗生成高优先候选', () => {
    const b = setup();
    const almostFull = { ...b, enemyUnits: [{ ...b.enemyUnits[0], hp: 19 }] };
    const full = { ...b, enemyUnits: [{ ...b.enemyUnits[0], hp: 20 }] };
    expect(count(b, 'heal')).toBeGreaterThan(count(almostFull, 'heal'));
    expect(count(full, 'heal')).toBe(0);
  });

  it('可以收掉最后一名敌人时优先攻击而不是残血回血', () => {
    const b = setup();
    b.playerUnits[0].hp = 2;
    expect(count(b, 'attack')).toBeGreaterThan(190);
  });

  it('实际救命的治疗比普通补血优先', () => {
    const b = setup();
    const rescued = { ...b, enemyUnits: [{ ...b.enemyUnits[0], hp: 2 }] };
    expect(count(rescued, 'heal')).toBeGreaterThan(count(b, 'heal'));
  });

  it('正确治疗重伤队友，而不只治疗自己', () => {
    const b = setup();
    const actor = { ...b.enemyUnits[0], hp: 20 };
    const ally: Unit = { ...actor, uid: 'injured', hp: 2, column: 1 };
    b.enemyUnits = [actor, ally];
    const heals = choices(b).filter(c => c?.kind === 'heal');
    expect(heals.length).toBeGreaterThan(100);
    expect(heals.every(c => c?.targetUid === ally.uid)).toBe(true);
  });

  it('连续治疗与交替防御使用同一类惩罚，救命仍有机会', () => {
    const b = setup();
    const repeated = { ...b.enemyUnits[0], lastSkillId: 'shield_skill', defensiveStreak: 2 };
    expect(count(b, 'heal', repeated)).toBeLessThan(count(b, 'heal'));
    const dying = { ...repeated, hp: 2 };
    expect(count(b, 'heal', dying)).toBeGreaterThan(0);
  });

  it('群体护盾进入候选，已有足够护盾时不再叠盾', () => {
    const b = setup(['seal_furnace', 'claw_attack']);
    const ally = { ...b.enemyUnits[0], uid: 'ally', column: 1 as const };
    b.enemyUnits.push(ally);
    expect(count(b, 'buff')).toBeGreaterThan(100);
    b.enemyUnits = b.enemyUnits.map(u => ({ ...u, shield: 20 }));
    expect(count(b, 'buff')).toBe(0);
  });

  it('单体护盾选择真正需要保护的伙伴', () => {
    const b = setup(['shield_skill', 'claw_attack']);
    const actor = { ...b.enemyUnits[0], shield: 20 };
    b.enemyUnits = [actor, { ...actor, uid: 'unshielded', shield: 0, column: 1 }];
    const buffs = choices(b).filter(c => c?.kind === 'buff');
    expect(buffs.length).toBeGreaterThan(0);
    expect(buffs.every(c => c?.targetUid === 'unshielded')).toBe(true);
  });

  it('没有攻击技能或无法活到后续输出时不盲目战吼', () => {
    const b = setup(['roar', 'claw_attack']);
    b.enemyUnits[0].hp = 2;
    expect(count(b, 'buff')).toBe(0);
  });

  it('崩解前提高进攻倾向，必死且无法救回时减少治疗', () => {
    const b = setup();
    expect(count({ ...b, round: 13 }, 'attack')).toBeGreaterThan(count(b, 'attack'));
    const doomed = { ...b, round: 20, enemyUnits: [{ ...b.enemyUnits[0], hp: 1 }] };
    expect(count(doomed, 'attack')).toBeGreaterThan(180);
  });

  it('护盾无法挽救崩解必死目标，治疗可以时仍会治疗', () => {
    const b = setup(['shield_skill', 'water_bath', 'claw_attack']);
    b.round = 15;
    b.enemyUnits[0].hp = 2;
    expect(count(b, 'buff')).toBe(0);
    expect(count(b, 'heal')).toBeGreaterThan(0);
  });

  it('纯治疗者与封印后只剩治疗者仍能行动', () => {
    const b = setup(['water_bath']);
    b.enemyUnits[0].hp = 20;
    expect(choices(b).every(c => c?.skillId === 'water_bath')).toBe(true);
    b.enemyUnits[0].skills.push('claw_attack');
    b.enemyUnits[0].statuses = [{ kind: 'skillSeal', value: 1, turns: 2, sealedSkills: ['claw_attack'] }];
    expect(choices(b).every(c => c?.skillId === 'water_bath')).toBe(true);
  });

  it('相同随机值结果一致，不读取玩家尚未执行的技能指令，也不改状态', () => {
    const b = setup();
    const snapshot = JSON.stringify(b);
    const first = choices(b);
    expect(choices(b)).toEqual(first);
    expect(choices({ ...b, orders: { [b.playerUnits[0].uid]: { kind: 'attack', skillId: 'claw_attack', targetUid: b.enemyUnits[0].uid } } })).toEqual(first);
    expect(JSON.stringify(b)).toBe(snapshot);
  });

  it('实际施放防御累积次数，随后攻击归零', () => {
    let b = setup(['shield_skill']);
    b = playerEndTurn(b);
    expect(b.enemyUnits[0].defensiveStreak).toBe(1);
    b.enemyUnits[0].skills = ['water_bath'];
    b = playerEndTurn(b);
    expect(b.enemyUnits[0].defensiveStreak).toBe(2);
    b.enemyUnits[0].skills = ['claw_attack'];
    b = playerEndTurn(b);
    expect(b.enemyUnits[0].defensiveStreak).toBe(0);
  });

  it('重复的技能/目标候选不会额外提高抽中权重', () => {
    const b = setup();
    const repeated = { ...b.enemyUnits[0], skills: ['water_bath', 'water_bath', 'claw_attack'] };
    expect(choices(b, repeated)).toEqual(choices(b));
  });

  it('只有一个重伤伙伴也能使用群体治疗', () => {
    const b = setup(['tidal_domain', 'claw_attack']);
    b.enemyUnits[0].hp = 2;
    expect(count(b, 'heal')).toBeGreaterThan(0);
  });

  it('治疗的净化被动会增加灼烧目标的处理优先度', () => {
    const b = setup(['light_bath', 'claw_attack']);
    b.enemyUnits[0].passive = makeUnit('light_moss', false, 0, false).passive;
    b.enemyUnits[0].hp = 20;
    const safe = count(b, 'heal');
    b.enemyUnits[0].statuses = [{ kind: 'burn', value: 4, turns: 2 }];
    expect(count(b, 'heal')).toBeGreaterThan(safe);
  });
});
