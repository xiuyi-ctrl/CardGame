import { describe, expect, it } from 'vitest';
import { MAIN_BASE_POOL, MAIN_EVO1_POOL, getMonster } from '../src/game/data/monsters';
import { makeUnit } from '../src/game/core/battle';
import { fuseUnit, fusionNeedCount, nextStage, type GameState } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';

describe('主模式融合材料与继承', () => {
  it.each([...MAIN_BASE_POOL, ...MAIN_EVO1_POOL])('%s：按品阶数量同形态进化，使用固定技能、被动并保留主宠强化和诅咒', (id) => {
    for (const curse of ['hpDown', 'spdDown', 'atkDown'] as const) {
      const primary = { ...makeUnit(id, true, 2, false, 'back'), hp: 1, bonusStats: { hp: 5, spd: 2 }, curse, shield: 9, skills: ['punch'], skillUses: { punch: 0 }, skillCooldowns: { punch: 3 }, statuses: [{ kind: 'burn' as const, value: 3, turns: 2 }] };
      const material = { ...makeUnit(id, true, 0, false), bonusStats: { hp: 100, spd: 100 }, curse: 'hpDown' as const };
      const materials = MAIN_BASE_POOL.includes(id) ? [material, makeUnit(id, true, 1, false)] : [material];
      const state: GameState = { ...createInitialState(), act: 2, screen: 'roster', roster: [primary, ...materials], field: [primary.uid, ...materials.map(u => u.uid)] };
      const next = gameReducer(state, { type: 'FUSE', primaryUid: primary.uid, materialUids: materials.map(u => u.uid) });
      const evolved = next.roster[0];
      const species = getMonster(nextStage(id)!);
      const fresh = makeUnit(species.id, true, 2, false, 'back');
      expect(fusionNeedCount(id)).toBe(MAIN_BASE_POOL.includes(id) ? 3 : 2);
      expect(next.roster).toHaveLength(1);
      expect(evolved.speciesId).toBe(species.id);
      expect(evolved.uid).toBe(primary.uid);
      expect(evolved.row).toBe('back');
      expect(evolved.column).toBe(2);
      expect(evolved.skills).toEqual(species.skills);
      expect(evolved.passive).toBe(species.passive);
      expect(evolved.bonusStats).toEqual(primary.bonusStats);
      expect(evolved.curse).toBe(curse);
      expect(evolved.maxHp).toBe(fresh.maxHp + 5 - (curse === 'hpDown' ? 5 : 0));
      expect(evolved.spd).toBe(fresh.spd + 2 - (curse === 'spdDown' ? 2 : 0));
      expect(evolved.hp).toBe(evolved.maxHp);
      expect(evolved.shield).toBe(0);
      expect(evolved.statuses).toEqual([]);
      expect(evolved.skillUses).toEqual(fresh.skillUses);
      expect(evolved.skillCooldowns).toEqual(fresh.skillCooldowns);
      expect(next.field).toEqual([primary.uid]);
      expect(next.runStats?.fusions).toBe((state.runStats?.fusions ?? 0) + 1);
      expect(primary.skills).toEqual(['punch']);
    }
  });

  it('只消耗指定材料，拒绝自身、异形态及不存在的材料', () => {
    const primary = makeUnit('momo_queen', true, 1, false);
    const first = makeUnit('momo_queen', true, 0, false);
    const chosen = makeUnit('momo_queen', true, 2, false);
    const wrong = makeUnit('momo', true, 0, false);
    const state: GameState = { ...createInitialState(), act: 2, screen: 'backpack', roster: [primary, first, chosen, wrong], field: [primary.uid, chosen.uid] };
    for (const materialUid of [primary.uid, wrong.uid, 'missing']) {
      expect(gameReducer(state, { type: 'FUSE', primaryUid: primary.uid, materialUid })).toBe(state);
    }
    const next = gameReducer(state, { type: 'FUSE', primaryUid: primary.uid, materialUid: chosen.uid });
    expect(next.roster.map(unit => unit.uid)).toEqual([primary.uid, first.uid, wrong.uid]);
    expect(next.field).toEqual([primary.uid]);
    const solo = { ...state, roster: [primary, wrong] };
    expect(gameReducer(solo, { type: 'FUSE', primaryUid: primary.uid })).toBe(solo);
  });

  it('满员使用待处理二阶材料进化，不消耗其他伙伴，计入融合统计', () => {
    const primary = makeUnit('momo_queen', true, 1, false);
    const material = makeUnit('momo_queen', false, 0, false);
    const state: GameState = { ...createInitialState(), act: 2, screen: 'tame-overflow', roster: [primary, ...Array.from({ length: 7 }, () => makeUnit('kiki', true, 0, false))], field: [primary.uid], tameOverflow: [material], tameOverflowReturn: 'roster', postBattle: true };
    const next = gameReducer(state, { type: 'TAME_OVERFLOW_FUSE', primaryUid: primary.uid, tameUid: material.uid });
    expect(next.roster).toHaveLength(8);
    expect(next.roster[0].speciesId).toBe('momo_god');
    expect(next.tameOverflow).toBeUndefined();
    expect(next.screen).toBe('roster');
    expect(next.field).toEqual([primary.uid]);
    expect(next.runStats?.fusions).toBe((state.runStats?.fusions ?? 0) + 1);
  });

  it('处理队伍内融合仅消耗指定伙伴，待处理伙伴保留', () => {
    const primary = makeUnit('momo_queen', true, 1, false);
    const material = makeUnit('momo_queen', true, 0, false);
    const pending = makeUnit('fifi', false, 0, false);
    const state: GameState = { ...createInitialState(), act: 2, screen: 'tame-overflow', roster: [primary, material], field: [primary.uid, material.uid], tameOverflow: [pending] };
    expect(gameReducer(state, { type: 'FUSE_IN_OVERFLOW', uid: primary.uid, materialUid: 'missing' })).toBe(state);
    const next = gameReducer(state, { type: 'FUSE_IN_OVERFLOW', uid: primary.uid, materialUid: material.uid });
    expect(next.roster).toHaveLength(1);
    expect(next.roster[0].speciesId).toBe('momo_god');
    expect(next.tameOverflow).toEqual([pending]);
    expect(next.screen).toBe('tame-overflow');
  });

  it('熟练度不能调用主模式常规融合，旧存档仍可按新材料规则融合', () => {
    const primary = makeUnit('momo_queen', true, 0, false);
    const material = makeUnit('momo_queen', true, 1, false);
    const state: GameState = { ...createInitialState(), act: 2, screen: 'roster', roster: [primary, material] };
    const prof = { ...state, runMode: 'proficiency' as const };
    expect(gameReducer(prof, { type: 'FUSE', primaryUid: primary.uid })).toBe(prof);
    const loaded = gameReducer(createInitialState(), { type: 'LOAD_GAME', state: JSON.parse(JSON.stringify(state)) });
    expect(gameReducer(loaded, { type: 'FUSE', primaryUid: primary.uid }).roster).toHaveLength(1);
    expect(fuseUnit(makeUnit('custom_guardian', true, 0, false))).toBeNull();
    expect(fuseUnit(makeUnit('momo_god', true, 0, false))).toBeNull();
  });
  it('一阶不足三只不能融合；只消耗指定的两只材料，拒绝重复、缺失和异种材料', () => {
    const primary = makeUnit('momo', true, 0, false);
    const a = makeUnit('momo', true, 1, false), b = makeUnit('momo', true, 2, false);
    const spare = makeUnit('momo', true, 0, false), wrong = makeUnit('lulu', true, 1, false);
    const state: GameState = { ...createInitialState(), screen: 'roster', roster: [primary, a, b, spare, wrong], field: [primary.uid, a.uid, b.uid] };
    const short = { ...state, roster: [primary, a] };
    expect(gameReducer(short, { type: 'FUSE', primaryUid: primary.uid })).toBe(short);
    for (const materialUids of [[a.uid], [a.uid, a.uid], [a.uid, 'missing'], [a.uid, wrong.uid], [primary.uid, a.uid], [a.uid, b.uid, spare.uid]]) {
      expect(gameReducer(state, { type: 'FUSE', primaryUid: primary.uid, materialUids })).toBe(state);
    }
    const next = gameReducer(state, { type: 'FUSE', primaryUid: primary.uid, materialUids: [a.uid, b.uid] });
    expect(next.roster.map(u => u.uid)).toEqual([primary.uid, spare.uid, wrong.uid]);
    expect(next.roster[0].speciesId).toBe('momo_queen');
    expect(next.field).toEqual([primary.uid]);
  });

  it.each([false, true])('一阶满员融合支持选择队伍或待处理材料，多个待处理=%s', multiplePending => {
    const primary = makeUnit('momo', true, 0, false);
    const a = makeUnit('momo', true, 1, false), b = makeUnit('momo', false, 2, false);
    const roster = [primary, ...(multiplePending ? [] : [a])];
    while (roster.length < 8) roster.push(makeUnit('kiki', true, 0, false));
    const state: GameState = { ...createInitialState(), screen: 'tame-overflow', roster, tameOverflow: multiplePending ? [a, b] : [b], tameOverflowReturn: 'map' };
    expect(gameReducer(state, { type: 'TAME_OVERFLOW_FUSE', primaryUid: primary.uid, tameUid: b.uid, materialUids: [b.uid, b.uid] })).toBe(state);
    const next = gameReducer(state, { type: 'TAME_OVERFLOW_FUSE', primaryUid: primary.uid, tameUid: b.uid, materialUids: [a.uid, b.uid] });
    expect(next.roster).toHaveLength(multiplePending ? 8 : 7);
    expect(next.roster[0].speciesId).toBe('momo_queen');
    expect(next.tameOverflow).toBeUndefined();
    expect(next.screen).toBe('map');
  });

});
