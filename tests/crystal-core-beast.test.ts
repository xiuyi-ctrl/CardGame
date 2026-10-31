import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerSkill, playerEndTurn, playerRest } from '../src/game/core/battle';
import { MONSTERS, SPECIAL_EGG_POOL } from '../src/game/data/monsters';
import { SKILLS } from '../src/game/data/skills';
import { fuseUnit } from '../src/game/state/game';
import { getNormalSkillPool, getSkillEnhanceBonus } from '../src/game/core/growth';
import { skillBrief, skillFullDesc } from '../src/ui/components';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { parseEvent } from '../src/ui/battleFx';

function setup(count = 3) {
  const b = createBattle([makeUnit('crystal_core_beast', true, 0, false)], Array.from({ length: count }, () => ({ speciesId: 'momo' })), 71);
  b.enemyUnits = b.enemyUnits.map(unit => ({ ...unit, hp: 100, maxHp: 100, shield: 10, passive: undefined, skills: [], acted: true }));
  return b;
}
function cast(id: string, shield = 0) {
  const b = setup(); b.playerUnits[0].shield = shield;
  return playerEndTurn(playerSkill(b, b.playerUnits[0].uid, id, b.enemyUnits[0].uid));
}

describe('晶核兽', () => {
  it('固定特殊蛋形态，不进化、不驯服、不进入普通技能池', () => {
    const unit = makeUnit('crystal_core_beast', true, 0, false);
    expect([unit.hp, unit.spd, MONSTERS.crystal_core_beast.rank]).toEqual([20, 1, 2]);
    expect(MONSTERS.crystal_core_beast.eggBorn).toBe(true);
    expect(MONSTERS.crystal_core_beast.tame.difficulty).toBe(0);
    expect(fuseUnit(unit)).toBeNull(); expect(SPECIAL_EGG_POOL).toContain(unit.speciesId);
    for (const skill of unit.skills) expect(getNormalSkillPool()).not.toContain(skill);
    expect(SKILLS.crystal_sting.id).not.toBe(SKILLS.core_crystal_spike.id);
    expect(SKILLS.crystal_sting.desc).not.toContain('自身有护盾');
  });
  it.each([[0, 3], [1, 6]])('晶刺：护盾%d时造成%d伤害', (shield, damage) => {
    const b = cast('core_crystal_spike', shield);
    const log = b.log.find(entry => entry.text.includes('使用「晶刺」攻击'))!;
    expect(log.shields![b.enemyUnits[0].uid]).toBe(10 - damage);
  });
  it.each([[0, 2], [3, 5], [8, 7]])('晶爆消耗最多5盾，原护盾%d时伤害%d', (shield, damage) => {
    const b = cast('core_crystal_burst', shield);
    const log = b.log.find(entry => entry.text.includes('使用「晶爆」攻击'))!;
    expect(log.shields![b.enemyUnits[0].uid]).toBe(10 - damage);
    expect(log.shields![b.playerUnits[0].uid]).toBe(Math.max(0, shield - 5));
  });
  it('晶壁获得5盾，同回合末转化为3点真实伤害，随机目标不重复', () => {
    const b = cast('core_crystal_wall');
    expect(b.enemyUnits.map(unit => unit.hp).sort((a, c) => a - c)).toEqual([97, 97, 100]);
    expect(b.enemyUnits.every(unit => unit.shield === 10)).toBe(true);
    expect(b.playerUnits[0].shield).toBe(0);
    const entry = b.log.find(log => log.text.includes('「晶核转化」'))!;
    expect(new Set(entry.burstTargets).size).toBe(2);
    expect(entry.burstTargets!.every(uid => entry.hp![uid] === 97)).toBe(true);
    expect(parseEvent(b, entry)).toMatchObject({ kind: 'burst', value: 3, burstTargets: entry.burstTargets });
  });
  it('只有一名敌人不重复命中；真实伤害无视减伤', () => {
    const b = setup(1); b.playerUnits[0].shield = 5;
    b.enemyUnits[0].passive = 'rock_guard';
    const next = playerEndTurn(playerRest(b, b.playerUnits[0].uid));
    expect(next.enemyUnits[0].hp).toBe(97); expect(next.enemyUnits[0].shield).toBe(10);
    expect(next.log.find(log => log.text.includes('「晶核转化」'))!.burstTargets).toHaveLength(1);
  });
  it('无盾不触发，也不消耗随机数', () => {
    const b = setup(1);
    const next = playerEndTurn(playerRest(b, b.playerUnits[0].uid));
    expect(next.log.some(log => log.text.includes('「晶核转化」'))).toBe(false);
    expect(next.rngCount).toBe(b.rngCount);
  });
  it('净化按灼烧→中毒→恐惧合计6层，保留其他状态', () => {
    let b = setup(); b.playerUnits[0].passive = undefined;
    b.playerUnits[0].statuses = [
      { kind: 'burn', value: 3, turns: 3 }, { kind: 'poison', value: 5, turns: 3 },
      { kind: 'fear', value: 4, turns: 3 }, { kind: 'windSpd', value: 2, turns: 3 },
    ];
    b = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'core_crystal_cleanse'));
    const log = b.log.find(entry => entry.text.includes('使用「晶核净化」'))!;
    expect(log.shields![b.playerUnits[0].uid]).toBe(6);
    expect(log.statuses![b.playerUnits[0].uid].map(status => [status.kind, status.value])).toEqual([['poison', 2], ['fear', 4], ['windSpd', 2]]);
  });
  it('只净化现有层数，盾不超过99，空净化不凭空获得护盾', () => {
    let b = setup(); b.playerUnits[0].passive = undefined; b.playerUnits[0].shield = 98;
    b.playerUnits[0].statuses = [{ kind: 'fear', value: 2, turns: 3 }];
    b = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'core_crystal_cleanse'));
    expect(b.playerUnits[0].shield).toBe(99); expect(b.playerUnits[0].statuses).toEqual([]);
    expect(cast('core_crystal_cleanse').playerUnits[0].shield).toBe(0);
  });
  it('灼烧先结算，若已死亡不再转化；一方全灭后不再继续转化', () => {
    let b = setup(1); b.playerUnits[0].hp = 1; b.playerUnits[0].shield = 20;
    b.playerUnits[0].statuses = [{ kind: 'burn', value: 2, turns: 3 }];
    b = playerEndTurn(playerRest(b, b.playerUnits[0].uid));
    expect(b.phase).toBe('lost'); expect(b.log.some(log => log.text.includes('「晶核转化」'))).toBe(false);
    b = setup(1); b.playerUnits[0].shield = 20; b.enemyUnits[0].hp = 1;
    b.enemyUnits[0].passive = 'crystal_conversion';
    b = playerEndTurn(playerRest(b, b.playerUnits[0].uid));
    expect(b.phase).toBe('won'); expect(b.log.filter(log => log.text.includes('「晶核转化」'))).toHaveLength(1);
  });
  it('护盾强化沿用+2，攻击+2；摘要与强化描述同步', () => {
    expect(getSkillEnhanceBonus('core_crystal_wall', 3).effectBonus).toBe(6);
    expect(getSkillEnhanceBonus('core_crystal_burst', 3).damageBonus).toBe(6);
    expect(skillFullDesc(SKILLS.core_crystal_spike, 2)).toContain('7点伤害');
    expect(skillFullDesc(SKILLS.core_crystal_wall, 2)).toContain('9点护盾');
    expect(skillBrief(SKILLS.core_crystal_burst)).toContain('消耗盾≤5');
  });
  it('已锁定晶核兽蛋读档孵化不重抽', () => {
    const state = { ...createInitialState(), screen: 'map' as const, roster: [], carriedEggs: [
      { id: 'crystal', remaining: 0, special: true, monsterId: 'crystal_core_beast', passedNodeIds: [] },
    ] };
    const next = gameReducer(createInitialState(), { type: 'LOAD_GAME', state });
    expect(next.roster.map(unit => unit.speciesId)).toEqual(['crystal_core_beast']);
    expect(next.carriedEggs).toHaveLength(0);
  });
  it('敌方晶核转化对玩家生效，致死时仍允许时砂回溯', () => {
    let b = setup(1);
    b.playerUnits[0].passive = 'time_rewind'; b.playerUnits[0].hp = 1;
    b.enemyUnits[0].passive = 'crystal_conversion'; b.enemyUnits[0].shield = 5;
    b = playerEndTurn(playerRest(b, b.playerUnits[0].uid));
    expect(b.playerUnits[0].timeRewindUsed).toBe(true);
    expect(b.playerUnits[0].hp).toBe(10); expect(b.phase).toBe('acting');
  });
  it('净化移除灼烧会给日炎灵日华充能', () => {
    let b = setup();
    const sun = { ...makeUnit('momo', true, 1, false), passive: 'clear_flame', acted: true };
    b.playerUnits.push(sun); b.playerUnits[0].statuses = [{ kind: 'burn', value: 2, turns: 3 }];
    b = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'core_crystal_cleanse'));
    expect(b.playerUnits[1].statuses.some(status => status.kind === 'sunRadiance' && status.value === 1)).toBe(true);
  });
});
