import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, planEnemyLayout, playerEndTurn, playerSkill, skillCooldownLeft } from '../src/game/core/battle';
import { MONSTERS } from '../src/game/data/monsters';
import { fusionNeedCount, generateMap, generateRewards, nextStage } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { parseEvent, computeRevealAt } from '../src/ui/battleFx';
import type { BattleState } from '../src/game/types';
import { getSkillEnhanceBonus } from '../src/game/core/growth';
import { getSkill } from '../src/game/data/skills';

function incomingBattle(speciesId = 'coal', count = 3, skill = 'double_hit'): BattleState {
  const players = Array.from({ length: count }, (_, i) => ({ ...makeUnit('momo', true, i as 0 | 1 | 2, false),
    hp: 500, maxHp: 500, spd: 99, skills: [skill] }));
  const raw = createBattle(players, [{ speciesId }], 9);
  return { ...raw, enemyUnits: raw.enemyUnits.map(u => ({ ...u, hp: 500, maxHp: 500, skills: [], acted: true })) };
}

function attackAll(battle: BattleState): BattleState {
  let ordered = battle;
  for (const unit of battle.playerUnits) ordered = playerSkill(ordered, unit.uid, unit.skills[0], battle.enemyUnits[0].uid);
  return playerEndTurn(ordered);
}

describe('煤煤与炉甲獾', () => {
  it('炭爪与护灯强化沿用原规则，并以新基础数值递增', () => {
    const claw = getSkill('coal_claw');
    const lamp = getSkill('lamp_guard');
    expect([0, 1, 2, 3].map(level => {
      const bonus = getSkillEnhanceBonus(claw.id, level);
      return [claw.damage! + bonus.damageBonus, claw.effects![0].value + bonus.effectBonus];
    })).toEqual([[2, 2], [3, 3], [4, 4], [5, 5]]);
    expect([0, 1, 2, 3].map(level => lamp.heal! + getSkillEnhanceBonus(lamp.id, level).healBonus)).toEqual([5, 7, 9, 11]);
  });
  it('属性、固定技能组和两只融合符合设计，二阶连接传奇形态', () => {
    const coal = makeUnit('coal', true, 0, false);
    expect([coal.maxHp, coal.spd]).toEqual([13, 1]);
    expect(coal.skills).toEqual(['coal_claw', 'furnace_shell']);
    const material = makeUnit('coal', true, 1, false);
    const state = { ...createInitialState(), screen: 'roster' as const, roster: [coal, material] };
    const after = gameReducer(state, { type: 'FUSE', primaryUid: coal.uid });
    expect(fusionNeedCount('coal')).toBe(2);
    expect(after.roster).toHaveLength(1);
    expect(after.roster[0].speciesId).toBe('coal_guard');
    expect([after.roster[0].maxHp, after.roster[0].spd]).toEqual([22, 2]);
    expect(after.roster[0].skills).toEqual(MONSTERS.coal_guard.skills);
    expect(nextStage('coal_guard')).toBe('furnace_beast');
    expect(planEnemyLayout([{ speciesId: 'coal' }, { speciesId: 'coal_guard' }]).every(p => p.row === 'front')).toBe(true);
  });

  it.each([['coal', 2], ['coal_guard', 3]] as const)('%s：多段攻击只触发一次，每完整回合最多两次，下回合重置', (speciesId, value) => {
    const battle = incomingBattle(speciesId);
    const after = attackAll(battle);
    const logs = after.log.filter(entry => /的「(?:炉火|炽炉)」使/.test(entry.text));
    expect(logs).toHaveLength(2);
    expect(logs.every(entry => entry.text.endsWith(`灼烧 ${value} 层`))).toBe(true);
    expect(logs.every(entry => entry.text.includes(speciesId === 'coal' ? '「炉火」' : '「炽炉」'))).toBe(true);
    expect(new Set(logs.map(entry => entry.targetUid)).size).toBe(2);
    expect(after.enemyUnits[0].furnaceTriggers).toBeUndefined();
    const second = attackAll(after);
    expect(second.log.filter(entry => /的「(?:炉火|炽炉)」使/.test(entry.text))).toHaveLength(4);
  });

  it('护盾吸收攻击仍触发炉火，致死攻击不触发', () => {
    const raw = incomingBattle('coal', 1, 'punch');
    const shielded = { ...raw, enemyUnits: raw.enemyUnits.map(u => ({ ...u, shield: 99 })) };
    const after = attackAll(shielded);
    expect(after.enemyUnits[0].hp).toBe(500);
    expect(after.log.some(entry => /的「(?:炉火|炽炉)」使/.test(entry.text))).toBe(true);
    const lethal = { ...raw, enemyUnits: raw.enemyUnits.map(u => ({ ...u, hp: 1 })) };
    expect(attackAll(lethal).log.some(entry => /的「(?:炉火|炽炉)」使/.test(entry.text))).toBe(false);
  });

  it('我方炉火同样对敌方行动触发，每回合最多两次，不提供额外行动', () => {
    const coal = { ...makeUnit('coal_guard', true, 0, false), hp: 100, maxHp: 100, shield: 99 };
    const raw = createBattle([coal], [{ speciesId: 'momo' }, { speciesId: 'momo' }, { speciesId: 'momo' }], 9);
    const battle = { ...raw, enemyUnits: raw.enemyUnits.map(u => ({ ...u, skills: ['double_hit'] })) };
    const after = playerEndTurn(battle);
    const logs = after.log.filter(entry => /的「(?:炉火|炽炉)」使/.test(entry.text));
    expect(logs).toHaveLength(2);
    expect(logs.every(entry => entry.actorUid === coal.uid && entry.text.endsWith('灼烧 3 层'))).toBe(true);
    expect(after.log.some(entry => entry.actorUid === coal.uid && entry.text.includes('使用「'))).toBe(false);
  });

  it('持续伤害和状态技能不触发炉火，旧战斗计数不带入新战斗', () => {
    const raw = incomingBattle('coal', 1, 'weaken');
    const burning: BattleState = { ...raw, enemyUnits: raw.enemyUnits.map(u => ({ ...u, statuses: [{ kind: 'burn', value: 4, turns: 2 }] })) };
    expect(attackAll(burning).log.some(entry => /的「(?:炉火|炽炉)」使/.test(entry.text))).toBe(false);
    const carried = { ...makeUnit('coal', true, 0, false), furnaceTriggers: 2 };
    expect(createBattle([carried], [{ speciesId: 'momo' }], 2).playerUnits[0].furnaceTriggers).toBeUndefined();
  });

  it('炉火灼烧日志对应独立状态动画，不在攻击前提前显示', () => {
    const after = attackAll(incomingBattle('coal', 1));
    const entry = after.log.find(log => /的「(?:炉火|炽炉)」使/.test(log.text))!;
    const event = parseEvent(after, entry)!;
    expect(event.kind).toBe('buff');
    expect(event.targetUid).toBe(after.playerUnits[0].uid);
    expect(event.addsStatus).toEqual(['burn']);
    const reveals = computeRevealAt([event], { [event.targetUid!]: ['burn'] });
    expect(reveals[0][0].uid).toBe(event.targetUid);
  });

  it('炉壳为自身及指定友方各加3盾并保留冷却，灰烬庇护仍提供4或6盾', () => {
    const unit = makeUnit('coal_guard', true, 0, false);
    const ally = makeUnit('momo', true, 1, false);
    const raw = createBattle([unit, ally], [{ speciesId: 'momo' }], 8);
    const battle = { ...raw, enemyUnits: raw.enemyUnits.map(u => ({ ...u, acted: true })) };
    const shell = playerEndTurn(playerSkill(battle, unit.uid, 'furnace_shell', ally.uid));
    expect(shell.playerUnits[0].shield).toBe(3);
    expect(shell.playerUnits[1].shield).toBe(3);
    expect(skillCooldownLeft(shell.playerUnits[0], 'furnace_shell')).toBe(1);
    expect(playerSkill(shell, unit.uid, 'furnace_shell', ally.uid)).toBe(shell);
    expect(skillCooldownLeft(playerEndTurn(shell).playerUnits[0], 'furnace_shell')).toBe(0);
    for (const burning of [false, true]) {
      const b: BattleState = { ...battle, enemyUnits: battle.enemyUnits.map(u => ({ ...u,
        statuses: burning ? [{ kind: 'burn', value: 4, turns: 2 }] : [] })) };
      const after = playerEndTurn(playerSkill(b, unit.uid, 'ash_shelter', ally.uid));
      expect(after.playerUnits[1].shield).toBe(burning ? 6 : 4);
      expect(after.playerUnits[0].shield).toBe(0);
    }
  });

  it('炭爪造成2点伤害并附加2层灼烧；炉壳不能重复选自己拿双盾，独自上场仅加3盾', () => {
    const coal = makeUnit('coal', true, 0, false);
    const ally = makeUnit('momo', true, 1, false);
    const raw = createBattle([coal, ally], [{ speciesId: 'momo' }], 2);
    const battle = { ...raw, enemyUnits: raw.enemyUnits.map(u => ({ ...u, acted: true })) };
    const hit = playerEndTurn(playerSkill(battle, coal.uid, 'coal_claw', battle.enemyUnits[0].uid));
    const log = hit.log.find(entry => entry.actorUid === coal.uid && entry.text.includes('使用「炭爪」攻击'))!;
    expect(log.text).toContain('造成 2 伤害');
    expect(log.statuses?.[battle.enemyUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(2);
    expect(playerSkill(battle, coal.uid, 'furnace_shell', coal.uid)).toBe(battle);
    expect(playerSkill(battle, coal.uid, 'furnace_shell', battle.enemyUnits[0].uid)).toBe(battle);
    expect(playerSkill(battle, coal.uid, 'furnace_shell')).toBe(battle);
    const third = makeUnit('kiki', true, 2, false);
    const chosen = { ...battle, playerUnits: [coal, ally, third] };
    const dual = playerEndTurn(playerSkill(chosen, coal.uid, 'furnace_shell', third.uid));
    expect(dual.playerUnits.map(unit => unit.shield)).toEqual([3, 0, 3]);
    const queued = playerSkill(chosen, coal.uid, 'furnace_shell', third.uid);
    const targetDied = { ...queued, playerUnits: queued.playerUnits.map(unit => unit.uid === third.uid ? { ...unit, hp: 0 } : unit) };
    const remaining = playerEndTurn(targetDied);
    expect(remaining.playerUnits.map(unit => unit.shield)).toEqual([3, 0, 0]);
    const solo = { ...battle, playerUnits: [coal] };
    const shell = playerEndTurn(playerSkill(solo, coal.uid, 'furnace_shell'));
    expect(shell.playerUnits[0].shield).toBe(3);
  });

  it('主模式能遇到并招募新伙伴，不替换开局六种伙伴', () => {
    const encounters = new Set<string>();
    const recruits = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const map = generateMap(seed, 1);
      for (const entries of Object.values(map.encounter)) for (const unit of entries) encounters.add(unit.speciesId);
      for (const act of [1, 2]) {
        const state = { ...createInitialState(), seed, act };
        for (const reward of generateRewards(state)) for (const id of reward.recruitCandidates ?? []) recruits.add(id);
      }
    }
    expect(encounters.has('coal')).toBe(true);
    expect(encounters.has('coal_guard')).toBe(true);
    expect(recruits.has('coal')).toBe(true);
    expect(recruits.has('coal_guard')).toBe(true);
    const fresh = gameReducer(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'kiki', seed: 8 });
    expect(fresh.roster.map(u => u.speciesId)).toEqual(['momo', 'momo', 'kiki']);
  });

  it('敌方炉甲獾会使用灰烬庇护保护受伤同伴，而不是永远给自己套盾', () => {
    let protectedAlly = false;
    for (let seed = 0; seed < 20; seed++) {
      const raw = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'coal_guard' }, { speciesId: 'fifi' }], seed);
      const battle = { ...raw, enemyUnits: raw.enemyUnits.map((u, i) => ({ ...u,
        hp: i === 1 ? 1 : u.hp, skills: i === 0 ? ['ash_shelter'] : [], acted: i === 1 })) };
      const after = playerEndTurn(battle);
      protectedAlly ||= after.log.some(entry => entry.actorUid === battle.enemyUnits[0].uid
        && entry.targetUid === battle.enemyUnits[1].uid && entry.text.includes('使用「灰烬庇护」'));
    }
    expect(protectedAlly).toBe(true);
  });
});
