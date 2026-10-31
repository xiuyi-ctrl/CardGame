import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerEndTurn, playerSkill, skillCooldownLeft, skillUsesLeft, stokeFireTargets } from '../src/game/core/battle';
import { fusionNeedCount, generateMap, nextStage } from '../src/game/state/game';
import { createInitialState, gameReducer, migrateGameState } from '../src/game/state/reducer';
import { parseEvent } from '../src/ui/battleFx';
import type { BattleState } from '../src/game/types';

function peacefulBattle(speciesId: string, burned = true): BattleState {
  const units = [makeUnit(speciesId, true, 0, false), makeUnit('momo', true, 1, false)];
  const raw = createBattle(units, [{ speciesId: 'momo' }, { speciesId: 'momo' }], 3);
  return { ...raw, enemyUnits: raw.enemyUnits.map((u, i) => ({ ...u, hp: 500, maxHp: 500, row: 'front', skills: [], acted: true,
    statuses: burned ? [{ kind: 'burn', value: i === 0 ? 6 : 2, turns: 2 }] : [] })) };
}

describe('熔炉兽与长明灵蛾', () => {
  it.each([['coal_guard', 'furnace_beast', 29, 3], ['lantern_moth', 'eternal_moth', 23, 6]] as const)('%s：第一幕锁定，首领后两只同形态可融合为%s', (id, evolvedId, hp, spd) => {
    const primary = makeUnit(id, true, 0, false);
    const material = makeUnit(id, true, 1, false);
    const state = { ...createInitialState(), act: 1, screen: 'roster' as const, roster: [primary, material] };
    expect(fusionNeedCount(id)).toBe(2);
    expect(gameReducer(state, { type: 'FUSE', primaryUid: primary.uid })).toBe(state);
    const evolved = gameReducer({ ...state, legendEvolutionUnlocked: true }, { type: 'FUSE', primaryUid: primary.uid });
    expect(evolved.roster).toHaveLength(1);
    expect(evolved.roster[0].speciesId).toBe(evolvedId);
    expect([evolved.roster[0].maxHp, evolved.roster[0].spd]).toEqual([hp, spd]);
    expect(evolved.roster[0].skills).toHaveLength(4);
    expect(nextStage(evolvedId)).toBeUndefined();
  });

  it('熔炉之心每回合只触发两次，每次灼烧3层并在受击结束后获得2盾，多段不重复触发', () => {
    const players = ([0, 1, 2] as const).map(col => ({ ...makeUnit('momo', true, col, false), spd: 99, skills: ['double_hit'] }));
    const raw = createBattle(players, [{ speciesId: 'furnace_beast' }], 2);
    let b: BattleState = { ...raw, enemyUnits: raw.enemyUnits.map(u => ({ ...u, hp: 500, maxHp: 500, acted: true, skills: [] })) };
    for (const player of players) b = playerSkill(b, player.uid, 'double_hit', b.enemyUnits[0].uid);
    const after = playerEndTurn(b);
    const burns = after.log.filter(entry => entry.text.includes('的「熔炉之心」使'));
    const shields = after.log.filter(entry => entry.text.includes('的「熔炉之心」获得'));
    expect(burns).toHaveLength(2);
    expect(burns.every(entry => entry.text.endsWith('灼烧 3 层'))).toBe(true);
    expect(shields).toHaveLength(2);
    expect(shields.every(entry => entry.text.endsWith('获得 2 点护盾'))).toBe(true);
    expect(parseEvent(after, shields[0])?.kind).toBe('buff');
  });

  it('熔岩重爪对燃烧与非燃烧目标均造成6伤，壁垒8盾并冷却，封炉全队3盾且每场三次', () => {
    for (const burned of [false, true]) {
      const b = peacefulBattle('furnace_beast', burned);
      const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'molten_claw', b.enemyUnits[0].uid));
      expect(after.log.find(entry => entry.text.includes('使用「熔岩重爪」攻击'))?.text).toContain('造成 6 伤害');
    }
    const b = peacefulBattle('furnace_beast');
    const wall = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'furnace_bastion'));
    expect(wall.playerUnits[0].shield).toBe(8);
    expect(skillCooldownLeft(wall.playerUnits[0], 'furnace_bastion')).toBe(1);
    let seal = b;
    for (let i = 0; i < 3; i++) {
      if (i > 0) seal = playerEndTurn(seal);
      seal = playerEndTurn(playerSkill(seal, seal.playerUnits[0].uid, 'seal_furnace'));
    }
    expect(seal.playerUnits.map(u => u.shield)).toEqual([9, 9]);
    expect(skillUsesLeft(seal.playerUnits[0], 'seal_furnace')).toBe(0);
    expect(playerSkill(seal, seal.playerUnits[0].uid, 'seal_furnace')).toBe(seal);
  });

  it('两只长明灵蛾各自触发，全队各回复6点，且不占用余温次数；不会覆盖前一只的治疗', () => {
    const raw = peacefulBattle('eternal_moth');
    const attacker = { ...makeUnit('momo', true, 0, false), hp: 10, maxHp: 100, skills: ['tail', 'double_hit'], spd: 99 };
    const first = { ...makeUnit('eternal_moth', true, 1, false), hp: 3 };
    const second = { ...makeUnit('eternal_moth', true, 2, false), hp: 4 };
    const candle = { ...makeUnit('candle', true, 0, false, 'back'), hp: 5 };
    const b = { ...raw, playerUnits: [attacker, first, second, candle] };
    const after = playerEndTurn(playerSkill(b, attacker.uid, 'tail'));
    expect(after.playerUnits.map(u => u.hp)).toEqual([16, 11, 10, 9]);
    const logs = after.log.filter(entry => entry.text.includes('的「长明之光」治愈'));
    expect(logs.filter(entry => entry.actorUid === first.uid)).toHaveLength(4);
    expect(logs.filter(entry => entry.actorUid === second.uid)).toHaveLength(4);
    expect(after.log.filter(entry => entry.text.includes('的「余温」治愈'))).toHaveLength(1);
    expect(logs.every(entry => parseEvent(after, entry)?.kind === 'heal')).toBe(true);
    const again = playerEndTurn(playerSkill(after, attacker.uid, 'double_hit', after.enemyUnits[0].uid));
    expect(again.playerUnits.map(u => u.hp)).toEqual([22, 17, 16, 9]);
  });

  it('长明之光不因当次点火触发，不治疗尸体，独立次数随存档保留而新战斗重置', () => {
    const raw = peacefulBattle('eternal_moth', false);
    const b = { ...raw, playerUnits: raw.playerUnits.map(u => ({ ...u, hp: 1 })) };
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'eternal_flame', b.enemyUnits[0].uid));
    expect(after.log.some(entry => entry.text.includes('的「长明之光」治愈'))).toBe(false);
    const burned = peacefulBattle('eternal_moth');
    const used = { ...burned, playerUnits: burned.playerUnits.map((u, i) => ({ ...u, hp: i === 0 ? 1 : 0, eternalLightUsed: true })) };
    const loaded = migrateGameState(JSON.parse(JSON.stringify({ ...createInitialState(), screen: 'battle', battle: used })))!.battle!;
    const spent = playerEndTurn(playerSkill(loaded, loaded.playerUnits[0].uid, 'eternal_flame', loaded.enemyUnits[0].uid));
    expect(spent.log.some(entry => entry.text.includes('的「长明之光」治愈'))).toBe(false);
    expect(spent.playerUnits[1].hp).toBe(0);
    expect(createBattle([used.playerUnits[0]], [{ speciesId: 'momo' }], 1).playerUnits[0].eternalLightUsed).toBeUndefined();
  });

  it('旺火追加5层，余烬迁移守恒、不造成即时伤害且使用播种随机与冷却', () => {
    const b = peacefulBattle('eternal_moth');
    const actor = b.playerUnits[0];
    const fueled = playerEndTurn(playerSkill(b, actor.uid, 'blazing_fuel', b.enemyUnits[0].uid));
    const fuelLog = fueled.log.find(entry => entry.text.includes('使用「旺火」'))!;
    expect(fuelLog.statuses?.[b.enemyUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(11);
    const moved = playerEndTurn(playerSkill(b, actor.uid, 'ember_transfer', b.enemyUnits[0].uid));
    const cast = moved.log.find(entry => entry.text.includes('使用「余烬迁移」'))!;
    expect(cast.statuses?.[b.enemyUnits[0].uid].find(s => s.kind === 'burn')).toBeUndefined();
    expect(cast.statuses?.[b.enemyUnits[1].uid].find(s => s.kind === 'burn')?.value).toBe(8);
    expect(cast.hp?.[b.enemyUnits[0].uid]).toBe(500);
    expect(cast.hp?.[b.enemyUnits[1].uid]).toBe(500);
    expect(skillCooldownLeft(moved.playerUnits[0], 'ember_transfer')).toBe(0);
    expect(moved).toEqual(playerEndTurn(playerSkill(b, actor.uid, 'ember_transfer', b.enemyUnits[0].uid)));
    const solo = { ...b, enemyUnits: [b.enemyUnits[0]] };
    expect(stokeFireTargets(solo, actor, 'ember_transfer')).toEqual([]);
    expect(playerSkill(solo, actor.uid, 'ember_transfer', solo.enemyUnits[0].uid)).toBe(solo);
  });

  it('第三幕遭遇包含两只新传奇，第一幕不会直接遇到它们', () => {
    const found = new Set<string>();
    for (let seed = 0; seed < 150; seed++) {
      for (const group of Object.values(generateMap(seed, 3).encounter)) for (const unit of group) found.add(unit.speciesId);
      const first = Object.values(generateMap(seed, 1).encounter).flat();
      expect(first.some(u => ['furnace_beast', 'eternal_moth'].includes(u.speciesId))).toBe(false);
    }
    expect(found.has('furnace_beast')).toBe(true);
    expect(found.has('eternal_moth')).toBe(true);
  });
});
