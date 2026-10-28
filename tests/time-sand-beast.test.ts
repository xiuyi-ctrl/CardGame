import { describe, expect, it } from 'vitest';
import { createBattle, getEffectiveSpd, makeUnit, playerEndTurn, playerRest, playerSkill } from '../src/game/core/battle';
import { MONSTERS, MAIN_BASE_POOL, MAIN_EVO1_POOL, MAIN_EVO2_POOL } from '../src/game/data/monsters';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { fuseUnit, nextStage } from '../src/game/state/game';
import { getNormalSkillPool, getSkillEnhanceBonus } from '../src/game/core/growth';
import { parseDualSave } from '../src/ui/persistence';
import { STATUS_ART } from '../src/ui/BuffIcon';
import { parseEvent } from '../src/ui/battleFx';
import { skillFullDesc } from '../src/ui/components';
import { getSkill } from '../src/game/data/skills';
import { existsSync, readFileSync } from 'node:fs';

function setup() {
  const b = createBattle([makeUnit('time_sand_beast', true, 0, false)], [{ speciesId: 'momo' }], 71, { enemyExact: true });
  b.enemyUnits = b.enemyUnits.map(u => ({ ...u, passive: undefined, skills: ['shadow_claw'], hp: 100, maxHp: 100, spd: 10 }));
  return b;
}
const attacks = (b: ReturnType<typeof setup>) => b.log.filter(e => e.text.includes('使用「砂时攻击」攻击'));

describe('时砂兽与时滞', () => {
  it('固定形态，不在常规生物和技能池中，也不能参与主模式或营火融合', () => {
    const unit = makeUnit('time_sand_beast', true, 0, false);
    expect([unit.hp, unit.spd, MONSTERS.time_sand_beast.rank]).toEqual([20, 3, 2]);
    expect(nextStage(unit.speciesId)).toBeUndefined();
    expect(fuseUnit(unit)).toBeNull();
    expect([...MAIN_BASE_POOL, ...MAIN_EVO1_POOL, ...MAIN_EVO2_POOL]).not.toContain(unit.speciesId);
    for (const id of unit.skills) expect(getNormalSkillPool()).not.toContain(id);
    const base = { ...createInitialState(), screen: 'rest-fusion' as const, roster: [unit, makeUnit('momo', true, 1, false)] };
    expect(gameReducer(base, { type: 'REST_FUSION_SET_MAIN', uid: unit.uid })).toEqual(base);
    expect(gameReducer(base, { type: 'REST_FUSION_SET_SUB', uid: unit.uid })).toEqual(base);
    const forged = { ...base, fusionMainUid: base.roster[1].uid, fusionSubUid: unit.uid };
    expect(gameReducer(forged, { type: 'REST_FUSION_CONFIRM' })).toEqual(forged);
  });
  it('砂时攻击按当前速度比较，条件加伤不重复计算', () => {
    for (const [speed, damage] of [[2, 7], [3, 7], [4, 5]]) {
      const b = setup(); b.enemyUnits[0].spd = speed; b.enemyUnits[0].acted = true;
      const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'sand_time_strike', b.enemyUnits[0].uid));
      expect(after.enemyUnits[0].hp).toBe(100 - damage);
    }
  });
  it('致死攻击先回溯再判负，保留原行动并额外行动一次，清减益保留增益', () => {
    const b = setup(), u = b.playerUnits[0]; u.hp = 1;
    u.statuses = [{ kind: 'poison', value: 20, turns: 2 }, { kind: 'atkDown', value: 1, turns: 2 }, { kind: 'windSpd', value: 2, turns: 2 }];
    const paused = playerEndTurn(playerSkill(b, u.uid, 'sand_time_strike', b.enemyUnits[0].uid));
    expect(paused.rewindChoice?.uid).toBe(u.uid);
    expect(attacks(paused)).toHaveLength(0);
    const after = playerSkill(paused, u.uid, 'sand_time_strike', b.enemyUnits[0].uid);
    expect(after.phase).toBe('acting'); expect(after.playerUnits[0].hp).toBe(10);
    expect(after.playerUnits[0].timeRewindUsed).toBe(true);
    expect(after.playerUnits[0].statuses.map(s => s.kind)).toEqual(['windSpd']);
    expect(attacks(after)).toHaveLength(2); expect(after.enemyUnits[0].hp).toBe(86);
    expect(after.log.filter(e => e.text.includes('的「时砂回溯」恢复'))).toHaveLength(1);
    after.playerUnits[0].hp = 1;
    const dead = playerEndTurn(after);
    expect(dead.phase).toBe('lost'); expect(dead.playerUnits[0].hp).toBe(0);
  });
  it('已经行动后的致死命中仍获得额外行动', () => {
    const b = setup(); b.playerUnits[0].hp = 1; b.playerUnits[0].spd = 20;
    const paused = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'sand_time_strike', b.enemyUnits[0].uid));
    expect(paused.rewindChoice?.uid).toBe(b.playerUnits[0].uid);
    expect(attacks(paused)).toHaveLength(1);
    const after = playerSkill(paused, b.playerUnits[0].uid, 'sand_time_strike', b.enemyUnits[0].uid);
    expect(attacks(after)).toHaveLength(2); expect(after.playerUnits[0].hp).toBe(10);
  });
  it('持续伤害致死会清除其他减益，回合结束前执行额外行动且下回合不保留回溯加成', () => {
    const b = setup(); b.playerUnits[0].hp = 1; b.enemyUnits[0].acted = true;
    b.playerUnits[0].statuses = [{ kind: 'burn', value: 2, turns: 2 }, { kind: 'poison', value: 20, turns: 2 }];
    const paused = playerEndTurn(b);
    expect(paused.rewindChoice?.nextRound).toBe(2);
    expect(attacks(paused)).toHaveLength(0);
    const after = playerSkill(paused, b.playerUnits[0].uid, 'sand_time_strike', b.enemyUnits[0].uid);
    expect(after.playerUnits[0].hp).toBe(10); expect(after.playerUnits[0].statuses).toEqual([]);
    expect(attacks(after)).toHaveLength(1); expect(after.enemyUnits[0].hp).toBe(93);
    expect(after.playerUnits[0].timeRewindRound).toBeUndefined();
  });
  it('反伤、崩解也可触发回溯；新战斗恢复一次触发机会', () => {
    const b = setup(); b.playerUnits[0].hp = 1; b.enemyUnits[0].acted = true; b.enemyUnits[0].passive = 'spike';
    const counter = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'sand_time_strike', b.enemyUnits[0].uid));
    expect(counter.playerUnits[0].timeRewindUsed).toBe(true); expect(counter.phase).toBe('acting');
    const collapse = setup(); collapse.round = 15; collapse.playerUnits[0].hp = 1; collapse.enemyUnits[0].acted = true;
    const paused = playerEndTurn(collapse);
    expect(paused.round).toBe(15);
    const after = playerSkill(paused, collapse.playerUnits[0].uid, 'sand_time_strike', collapse.enemyUnits[0].uid);
    expect(after.playerUnits[0].hp).toBe(10); expect(attacks(after)).toHaveLength(1);
    const next = createBattle(after.playerUnits, [{ speciesId: 'momo' }], 2);
    expect(next.playerUnits[0].timeRewindUsed).toBeUndefined();
  });
  it('回溯前后砂盾分别为4/6盾，强化只增加护盾，不改变条件', () => {
    for (const [rewound, shield] of [[false, 4], [true, 6]] as const) {
      const b = setup(); b.enemyUnits[0].acted = true;
      if (rewound) b.playerUnits[0].timeRewindRound = b.round;
      const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'sand_shield'));
      expect(after.playerUnits[0].shield).toBe(shield);
      expect(after.playerUnits[0].skillCooldowns?.sand_shield).toBe(1);
    }
    expect(getSkillEnhanceBonus('sand_shield', 3).effectBonus).toBe(6);
    expect(getSkillEnhanceBonus('sand_time_strike', 3).damageBonus).toBe(6);
    expect(getSkillEnhanceBonus('time_lag', 3).effectBonus).toBe(0);
  });
  it('时滞优先于速度和先手，将尚未行动的目标移动到队尾且不重复行动', () => {
    const b = setup();
    const ally = makeUnit('lulu', true, 1, false); ally.skills = ['punch']; ally.spd = 5; ally.passive = undefined;
    b.playerUnits.push(ally);
    const enemy = { ...makeUnit('kiki', false, 1, false), passive: undefined, skills: ['punch'], hp: 100, maxHp: 100, spd: 8 };
    b.enemyUnits.push(enemy);
    let next = playerSkill(b, b.playerUnits[0].uid, 'time_lag', b.enemyUnits[0].uid);
    next = playerSkill(next, ally.uid, 'punch', b.enemyUnits[0].uid);
    const after = playerEndTurn(next);
    const actions = after.log.filter(e => e.text.includes('使用「'));
    expect(actions.map(e => e.actorUid)).toEqual([b.playerUnits[0].uid, enemy.uid, ally.uid, b.enemyUnits[0].uid]);
    expect(after.enemyUnits[0].spd).toBe(10);
    expect(after.enemyUnits[0].statuses.some(s => s.kind === 'timeLag')).toBe(false);
    expect(after.playerUnits[0].skillCooldowns?.time_lag).toBe(1);
    const lagLog = actions[0];
    expect(parseEvent(after, lagLog)).toMatchObject({ kind: 'buff', addsStatus: ['timeLag'], targetUid: b.enemyUnits[0].uid });
  });
  it('时速只改变速度，持续两轮后到期', () => {
    let b = setup(); b.enemyUnits[0].skills = []; b.enemyUnits[0].acted = true;
    b = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'time_haste'));
    expect(getEffectiveSpd(b.playerUnits[0])).toBe(5);
    b = playerEndTurn(b); expect(getEffectiveSpd(b.playerUnits[0])).toBe(5);
    b = playerEndTurn(b); expect(getEffectiveSpd(b.playerUnits[0])).toBe(3);
  });
  it('敌方回溯同样保留基础与额外行动，不会错误判胜', () => {
    const b = setup();
    b.playerUnits[0].spd = 20;
    const foe = makeUnit('time_sand_beast', false, 0, false); foe.hp = 1;
    b.enemyUnits = [foe];
    const next = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'sand_time_strike', foe.uid));
    expect(next.enemyUnits[0].timeRewindUsed).toBe(true); expect(next.phase).toBe('acting');
    expect(next.log.filter(e => e.actorUid === foe.uid && e.text.includes('使用「'))).toHaveLength(2);
  });
  it('多段攻击可在复活后再次击倒，不重复回溯也不追打', () => {
    const b = setup(); b.playerUnits[0].hp = 1;
    b.enemyUnits[0].skills = ['swift_needle'];
    b.enemyUnits[0].statuses = [{ kind: 'atkUp', value: 10, turns: 2 }];
    const next = playerEndTurn(b);
    expect(next.phase).toBe('lost'); expect(next.playerUnits[0].hp).toBe(0);
    expect(next.log.filter(e => e.text.includes('的「时砂回溯」恢复'))).toHaveLength(1);
    expect(next.log.filter(e => e.text.includes('使用「迅针」攻击'))).toHaveLength(2);
  });
  it('双方同时受到崩解致死时，各只回溯只记一次且不提前终止', () => {
    const b = setup(); b.round = 15; b.playerUnits[0].hp = 1; b.playerUnits[0].skills = [];
    const foe = makeUnit('time_sand_beast', false, 0, false); foe.hp = 1; foe.skills = []; foe.acted = true;
    b.enemyUnits = [foe];
    const next = playerEndTurn(b);
    expect(next.phase).toBe('acting');
    expect([next.playerUnits[0].hp, next.enemyUnits[0].hp]).toEqual([10, 10]);
    expect(next.log.filter(e => e.text.includes('的「时砂回溯」恢复'))).toHaveLength(2);
  });
  it('未成熟特殊蛋读档不减关数，多只成熟特殊蛋全部保留到队伍或满员处理', () => {
    const state = { ...createInitialState(), screen: 'map' as const,
      roster: Array.from({ length: 7 }, () => makeUnit('momo', true, 0, false)),
      carriedEggs: [2, 0, 0].map((remaining, i) => ({ id: `egg${i}`, remaining, special: true, monsterId: 'momo', passedNodeIds: [] })) };
    const next = gameReducer(createInitialState(), { type: 'LOAD_GAME', state });
    expect(next.carriedEggs).toHaveLength(1); expect(next.carriedEggs?.[0].remaining).toBe(2);
    expect(next.roster.at(-1)?.speciesId).toBe('time_sand_beast');
    expect(next.tameOverflow?.map(u => u.speciesId)).toEqual(['time_sand_beast']);
  });
  it.each([false, true])('旧成熟特殊蛋读档即可孵化一次，满员=%s', full => {
    const state = { ...createInitialState(), screen: 'map' as const,
      roster: Array.from({ length: full ? 8 : 1 }, () => makeUnit('momo', true, 0, false)),
      carriedEggs: [{ id: 'old', remaining: 0, special: true, monsterId: 'momo', passedNodeIds: ['a', 'b', 'c'] }] };
    const saved = parseDualSave(JSON.stringify(state))!.main!;
    const next = gameReducer(createInitialState(), { type: 'LOAD_GAME', state: saved });
    expect(next.carriedEggs).toEqual([]);
    expect(full ? next.tameOverflow?.[0].speciesId : next.roster.at(-1)?.speciesId).toBe('time_sand_beast');
    expect(next.screen).toBe(full ? 'tame-overflow' : 'map');
    const reloaded = gameReducer(createInitialState(), { type: 'LOAD_GAME', state: next });
    expect(reloaded.roster.length).toBe(next.roster.length);
    expect(reloaded.tameOverflow?.length).toBe(next.tameOverflow?.length);
  });
  it('时滞图标双份PNG一致且已登记预加载', () => {
    expect(STATUS_ART.timeLag).toEqual(['时滞', 'time-lag']);
    expect(existsSync('public/buff-icons/time-lag.png')).toBe(true);
    expect(readFileSync('public/buff-icons/time-lag.png')).toEqual(readFileSync('美术素材/buff-icons/time-lag.png'));
  });
  it('强化详情保留条件，正确展示伤害、普通盾与回溯盾数值', () => {
    expect(skillFullDesc(getSkill('sand_time_strike'), 3)).toContain('造成11点伤害');
    expect(skillFullDesc(getSkill('sand_time_strike'), 3)).toContain('额外造成2点伤害');
    const shield = skillFullDesc(getSkill('sand_shield'), 3);
    expect(shield).toContain('获得10点护盾'); expect(shield).toContain('改为12点护盾');
    expect(skillFullDesc(getSkill('time_haste'), 3)).toContain('增加5点');
  });
  it('砂时攻击遵守前排优先，前排存活时不能绕过攻击后排', () => {
    const b = createBattle([makeUnit('time_sand_beast', true, 0, false)], [{ speciesId: 'kiki' }, { speciesId: 'momo' }], 5);
    b.enemyUnits = b.enemyUnits.map((u, i) => ({ ...u, row: i === 0 ? 'front' : 'back', hp: 100, maxHp: 100, skills: [], passive: undefined }));
    const backUid = b.enemyUnits[1].uid;
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'sand_time_strike', backUid));
    expect(after.enemyUnits.find(u => u.uid === backUid)?.hp).toBe(100);
    expect(getSkill('sand_time_strike').reach).toBe('front');
  });
  it('弱化设置一回合冷却，各强化等级保持相同冷却', () => {
    expect(getSkill('weaken').cooldown).toBe(1);
  });

  it.each([3, 20])('回溯后可改选砂盾，原基础行动按实际是否执行保留，速度%s', speed => {
    const b = setup(); const uid = b.playerUnits[0].uid;
    b.playerUnits[0].hp = 1; b.playerUnits[0].spd = speed;
    const paused = playerEndTurn(playerSkill(b, uid, 'sand_time_strike', b.enemyUnits[0].uid));
    expect(paused.round).toBe(1);
    expect(paused.rewindChoice?.uid).toBe(uid);
    expect(playerEndTurn(paused)).toBe(paused);
    const loaded = JSON.parse(JSON.stringify(paused));
    const after = playerSkill(loaded, uid, 'sand_shield');
    expect(after.rewindChoice).toBeUndefined();
    expect(after.round).toBe(2);
    expect(attacks(after)).toHaveLength(1);
    expect(after.playerUnits[0].shield).toBe(6);
  });
  it('回溯额外行动可以休息，不消耗原基础行动，不允许指挥其他单位', () => {
    const b = setup(); const uid = b.playerUnits[0].uid;
    b.playerUnits[0].hp = 1;
    const paused = playerEndTurn(playerSkill(b, uid, 'sand_time_strike', b.enemyUnits[0].uid));
    expect(playerSkill(paused, 'other', 'punch')).toBe(paused);
    const after = playerRest(paused, uid);
    expect(attacks(after)).toHaveLength(1);
    expect(after.round).toBe(2);
    expect(after.rewindChoice).toBeUndefined();
  });

});
