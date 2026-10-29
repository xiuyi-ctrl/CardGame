import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerEndTurn, playerSkill } from '../src/game/core/battle';
import { applyMasterEnhance, applySkillEnhance, applySkillEnhanceReset, applySkillEnhanceStone, getSkillEnhanceBonus, canMasterEnhance } from '../src/game/core/growth';
import { buildGrowthEvent } from '../src/game/data/growth-events';
import { getGrowthSpecialRewards } from '../src/game/data/growth-special';
import { beginGrowthEncounter, growthEncounterCacheKey, type GrowthEncounterKind } from '../src/game/state/growth-encounters';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { createRng } from '../src/game/rng';
import type { GameState } from '../src/game/state/game';

function state(): GameState {
  const a = { ...makeUnit('momo', true, 0, false), skills: ['punch', 'swift_needle'], growthPoints: 100 };
  const b = { ...makeUnit('lulu', true, 1, false), skills: ['aqua_shot', 'water_bath'], growthPoints: 10 };
  return { ...createInitialState(), screen: 'event', runMode: 'proficiency', currentLayer: 20, currentNodeId: 'test', roster: [a, b], gold: 50 };
}
function pending(kind: GrowthEncounterKind) { return beginGrowthEncounter(state(), kind); }

describe('大师传承与费用记录', () => {
  it('普通强化仍在2级停止，传承可逐级到4且不扣点，不增加付费成本', () => {
    let unit = state().roster[0];
    unit = applySkillEnhance(applySkillEnhance(unit, 1)!, 1)!;
    expect(unit.skillEnhancePaid?.[1]).toBe(18);
    expect(applySkillEnhance(unit, 1)).toBeNull();
    expect(applySkillEnhanceStone(unit, 1)).toBeNull();
    const gp = unit.growthPoints;
    unit = applyMasterEnhance(applyMasterEnhance(unit, 1)!, 1)!;
    expect(unit.skillEnhancements?.[1]).toBe(4);
    expect(unit.growthPoints).toBe(gp);
    expect(unit.skillEnhancePaid?.[1]).toBe(18);
    expect(applyMasterEnhance(unit, 1)).toBeNull();
    expect(applySkillEnhanceReset(unit, 1)?.refundPoints).toBe(9);
  });
  it('免费石头、传承与未知来源旧等级都不虚构退款', () => {
    const unit = state().roster[0];
    const free = applyMasterEnhance(applySkillEnhanceStone(unit, 0)!, 0)!;
    expect(applySkillEnhanceReset(free, 0)?.refundPoints).toBe(0);
    expect(applySkillEnhanceReset({ ...unit, skillEnhancements: { 0: 3 } }, 0)?.refundPoints).toBe(0);
    expect(canMasterEnhance({ ...unit, skills: ['gather_shields'] }, 0)).toBe(false);
  });
  it('4级迅针实际结算七段，火羽和熔火自焚按专用分支成长', () => {
    let actor = { ...state().roster[0], passive: undefined, spd: 99, skillEnhancements: { 1: 4 } };
    let battle = createBattle([actor], [], 1, { mirrorUnits: [{ ...makeUnit('kiki', false, 0, false), hp: 100, maxHp: 100, skills: [], passive: undefined }] });
    battle.enemyUnits[0].acted = true;
    battle = playerEndTurn(playerSkill(battle, actor.uid, 'swift_needle', battle.enemyUnits[0].uid));
    expect(battle.log.filter(entry => entry.text.includes('使用「迅针」攻击'))).toHaveLength(7);
    expect(getSkillEnhanceBonus('fire_feather', 4)).toMatchObject({ damageBonus: 4, effectBonus: 4 });
    expect(getSkillEnhanceBonus('molten_self_burn', 4)).toMatchObject({ effectBonus: 8 });
  });
  it('传承两次上限随读档保存，不可重复领取同一关', () => {
    let s = pending('master');
    s = gameReducer(s, { type: 'GROWTH_ENCOUNTER_CONFIRM', uid: s.roster[0].uid, slot: 0 });
    expect(s.masterTransmissions).toBe(1);
    expect(beginGrowthEncounter({ ...s, screen: 'special' }, 'master').growthEncounterPending).toBeUndefined();
    s = gameReducer(createInitialState(), { type: 'LOAD_GAME', state: JSON.parse(JSON.stringify(s)) });
    s = beginGrowthEncounter({ ...s, screen: 'special', currentNodeId: 'next' }, 'master');
    s = gameReducer(s, { type: 'GROWTH_ENCOUNTER_CONFIRM', uid: s.roster[0].uid, slot: 0 });
    expect(s.masterTransmissions).toBe(2);
    expect(beginGrowthEncounter({ ...s, screen: 'special', currentNodeId: 'third' }, 'master').growthEncounterPending).toBeUndefined();
  });
});

describe('第一批专属事件与奇遇', () => {
  it.each([['train_core', 3], ['train_pair', 2], ['insight', 1], ['absorb', 2], ['spring', 8]] as const)('%s准确发点且确认只结算一次', (kind, amount) => {
    const s = pending(kind), a = s.roster[0], b = s.roster[1];
    const action = { type: 'GROWTH_ENCOUNTER_CONFIRM' as const, uid: a.uid, otherUid: b.uid };
    const next = gameReducer(s, action);
    expect(next.roster[0].growthPoints).toBe(100 + amount);
    expect(next.roster[1].growthPoints).toBe(kind === 'train_pair' ? 12 : 10);
    expect(next.screen).toBe('growth-menu');
    expect(gameReducer(next, action)).toBe(next);
  });
  it('成长泉双人分支各5点，不可同一对象重复', () => {
    const s = pending('spring');
    const a = { type: 'GROWTH_ENCOUNTER_CONFIRM' as const, uid: s.roster[0].uid, share: true };
    expect(gameReducer(s, { ...a, otherUid: a.uid })).toBe(s);
    const next = gameReducer(s, { ...a, otherUid: s.roster[1].uid });
    expect(next.roster.map(unit => unit.growthPoints)).toEqual([105, 15]);
  });
  it('共鸣免手续费转移最多6点，拒绝余额不足和同目标', () => {
    const s = pending('transfer'), uid = s.roster[0].uid, otherUid = s.roster[1].uid;
    expect(gameReducer(s, { type: 'GROWTH_ENCOUNTER_CONFIRM', uid, otherUid, amount: 7 })).toBe(s);
    expect(gameReducer(s, { type: 'GROWTH_ENCOUNTER_CONFIRM', uid, otherUid: uid, amount: 1 })).toBe(s);
    expect(gameReducer(s, { type: 'GROWTH_ENCOUNTER_CONFIRM', uid, otherUid, amount: 6 }).roster.map(unit => unit.growthPoints)).toEqual([94, 16]);
  });
  it.each(['relearn', 'contract'] as const)('%s候选按伙伴和槽位保存，取消读档不重抽，最终确认才结算', kind => {
    let s = pending(kind), uid = s.roster[0].uid;
    s = gameReducer(s, { type: 'GROWTH_ENCOUNTER_PREVIEW', uid, slot: 0 });
    const slot = s.growthEncounterPending!.slot!;
    const key = growthEncounterCacheKey(s, uid, slot), choices = s.growthEncounterCandidates![key];
    expect(new Set(choices).size).toBe(choices.length);
    expect(choices.some(id => s.roster[0].skills.includes(id))).toBe(false);
    expect(s.gold).toBe(50);
    s = gameReducer(s, { type: 'GROWTH_ENCOUNTER_CANCEL' });
    s = beginGrowthEncounter(gameReducer(createInitialState(), { type: 'LOAD_GAME', state: JSON.parse(JSON.stringify(s)) }), kind);
    s = gameReducer(s, { type: 'GROWTH_ENCOUNTER_PREVIEW', uid, slot: 0 });
    expect(s.growthEncounterCandidates![key]).toEqual(choices);
    const next = gameReducer(s, { type: 'GROWTH_ENCOUNTER_CONFIRM', uid, slot: 0, skillId: choices[0] });
    expect(next.gold).toBe(kind === 'relearn' ? 30 : 50);
    expect(next.roster[0].skills).toHaveLength(kind === 'contract' ? 3 : 2);
    if (kind === 'contract') expect(next.roster[0].extraSkillSlots).toBe(1);
  });
  it('拆解只退真实投入，清除传承级别；购买石头不能重复领', () => {
    const s = state(); s.roster[0] = applyMasterEnhance(applySkillEnhance(s.roster[0], 0)!, 0)!;
    const next = gameReducer(beginGrowthEncounter(s, 'recycle'), { type: 'GROWTH_ENCOUNTER_CONFIRM', uid: s.roster[0].uid, slot: 0 });
    expect(next.roster[0].growthPoints).toBe(100);
    expect(next.roster[0].skillEnhancements?.[0]).toBeUndefined();
    const bought = gameReducer(pending('buy_stone'), { type: 'GROWTH_ENCOUNTER_CONFIRM' });
    expect(bought.gold).toBe(20);
    expect(bought.inventory.skill_enhance_stone).toBe(1);
    expect(beginGrowthEncounter({ ...s, gold: 19 }, 'relearn')).toEqual({ ...s, gold: 19 });
  });
  it('投放遵守层数与条件；普通事件相邻不重复，显式测试仍可定向进入', () => {
    for (let seed = 1; seed < 100; seed++) {
      expect(getGrowthSpecialRewards(createRng(seed), 0, 15)).not.toContain('stat_blessing');
      expect(getGrowthSpecialRewards(createRng(seed), 0, 30, id => id !== 'stat_blessing' && id !== 'skill_blessing')).not.toContain('skill_blessing');
      expect(buildGrowthEvent(createRng(seed), undefined, 0, 5, '分岔训练场').title).not.toBe('分岔训练场');
      expect(buildGrowthEvent(createRng(seed), undefined, 0, 5).title).not.toBe('拆解工坊');
    }
    expect(buildGrowthEvent(createRng(1), 'stone_of_forget', 0, 1).title).toBe('拆解工坊');
  });
});
