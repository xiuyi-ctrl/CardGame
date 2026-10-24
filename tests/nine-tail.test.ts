import { describe, expect, it } from 'vitest';
import { createBattle, foxFireLayers, makeUnit, playerEndTurn, playerSkill, skillCooldownLeft } from '../src/game/core/battle';
import { LEGENDARY_SKILLS, getNormalSkillPool } from '../src/game/core/growth';
import { LEGENDARY } from '../src/game/core/growth-map';
import { MAIN_EVO2_POOL } from '../src/game/data/monsters';
import { getSkill } from '../src/game/data/skills';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { fusionNeedCount, generateMap, nextStage } from '../src/game/state/game';
import { parseEvent } from '../src/ui/battleFx';
import { skillFullDesc } from '../src/ui/components';
import type { BattleState } from '../src/game/types';

function quiet(layers = 0, count = 2): BattleState {
  const b = createBattle([makeUnit('nine_tail_sovereign', true, 0, false)], Array.from({ length: count }, () => ({ speciesId: 'momo' })), 17);
  b.playerUnits[0] = { ...b.playerUnits[0], hp: 100, maxHp: 100, spd: 99,
    statuses: layers ? [{ kind: 'foxFire', value: layers, turns: 0 }] : [] };
  b.enemyUnits = b.enemyUnits.map(u => ({ ...u, hp: 500, maxHp: 500, acted: true, skills: [] }));
  return b;
}
function cast(b: BattleState, skill: string) {
  return playerEndTurn(playerSkill(b, b.playerUnits[0].uid, skill, b.enemyUnits[0].uid));
}

describe('九尾炎尊', () => {
  it('首领后两只幻尾火狐融合，继承主宠强化与固定技能，不开放一幕传奇', () => {
    const primary = makeUnit('phantom_tail_fox', true, 0, false);
    primary.bonusStats = { hp: 5, spd: 2 };
    const state = { ...createInitialState(), screen: 'roster' as const, roster: [primary, makeUnit('phantom_tail_fox', true, 1, false)] };
    expect(gameReducer(state, { type: 'FUSE', primaryUid: primary.uid })).toBe(state);
    const after = gameReducer({ ...state, legendEvolutionUnlocked: true }, { type: 'FUSE', primaryUid: primary.uid });
    expect(after.roster).toHaveLength(1);
    expect(after.roster[0]).toMatchObject({ speciesId: 'nine_tail_sovereign', hp: 25, maxHp: 25, spd: 8, passive: 'nine_tail_heart',
      skills: ['twin_tail_flames', 'burn_tail', 'nine_tail_wildfire', 'flame_tail_shield'] });
    expect(fusionNeedCount('phantom_tail_fox')).toBe(2);
    expect(nextStage('nine_tail_sovereign')).toBeUndefined();
  });

  it.each([8, 9])('燎原以施放前%s层计算全体伤害与附火，只有九层额外增伤', layers => {
    const b = quiet(layers, 3);
    const after = cast(b, 'nine_tail_wildfire');
    const hits = after.log.filter(l => l.text.includes('九尾燎原」攻击'));
    expect(hits).toHaveLength(3);
    for (const hit of hits) {
      expect(hit.hp?.[hit.targetUid!]).toBe(500 - 3 - (layers === 9 ? 1 : 0));
      expect(hit.statuses?.[hit.targetUid!].find(s => s.kind === 'burn')?.value).toBe(1 + layers);
    }
    expect(skillCooldownLeft(after.playerUnits[0], 'nine_tail_wildfire')).toBe(1);
    expect(playerSkill(after, after.playerUnits[0].uid, 'nine_tail_wildfire')).toBe(after);
    expect(skillCooldownLeft(playerEndTurn(after).playerUnits[0], 'nine_tail_wildfire')).toBe(0);
  });

  it('满层双尾各4伤害、附10火，强化燎原不增加目标或狐火上限', () => {
    const b = quiet(9, 3);
    const twin = cast(b, 'twin_tail_flames').log.filter(l => l.text.includes('双尾扫焰」攻击'));
    expect(twin).toHaveLength(2);
    expect(new Set(twin.map(l => l.targetUid)).size).toBe(2);
    twin.forEach(l => expect(l.hp?.[l.targetUid!]).toBe(496));
    b.playerUnits[0].skillEnhancements = { 2: 2 };
    const hits = cast(b, 'nine_tail_wildfire').log.filter(l => l.text.includes('九尾燎原」攻击'));
    hits.forEach(l => {
      expect(l.hp?.[l.targetUid!]).toBe(494);
      expect(l.statuses?.[l.targetUid!].find(s => s.kind === 'burn')?.value).toBe(12);
    });
  });

  it('攻击中被反灼烧升至九层，不追溯增加同次技能后续目标伤害或附火', () => {
    const b = quiet(8);
    b.enemyUnits[0].passive = 'coal_furnace';
    const after = cast(b, 'nine_tail_wildfire');
    expect(foxFireLayers(after.playerUnits[0])).toBe(9);
    after.log.filter(l => l.text.includes('九尾燎原」攻击')).forEach(l => {
      expect(l.hp?.[l.targetUid!]).toBe(497);
      expect(l.statuses?.[l.targetUid!].find(s => s.kind === 'burn')?.value).toBe(9);
    });
  });

  it('护盾自燃固定2层，免疫掉血；同回合首次敌方多段攻击只额外充能一次', () => {
    const b = quiet();
    b.enemyUnits = b.enemyUnits.map(u => ({ ...u, skills: ['leaf_needle'], acted: false, spd: 1 }));
    const after = cast(b, 'flame_tail_shield');
    const shield = after.log.find(l => l.text.includes('使用「焰尾护盾」'))!;
    expect(shield.statuses?.[b.playerUnits[0].uid].find(s => s.kind === 'burn')?.value).toBe(2);
    expect(foxFireLayers(after.playerUnits[0])).toBe(2);
    expect(after.log.filter(l => l.text.includes('的「焰尾护盾」获得'))).toHaveLength(1);
    expect(parseEvent(after, after.log.find(l => l.text.includes('的「焰尾护盾」获得'))!)).toMatchObject({ kind: 'buff', value: 0 });
    expect(after.playerUnits[0].statuses.some(s => s.kind === 'foxTailGuard')).toBe(false);
    expect(skillCooldownLeft(after.playerUnits[0], 'flame_tail_shield')).toBe(1);
  });

  it('护盾完全吸收也触发，施放之前受击不追溯，未受击的标记回合末消失', () => {
    const absorbed = quiet();
    absorbed.enemyUnits = [ { ...absorbed.enemyUnits[0], skills: ['punch'], acted: false, spd: 1 } ];
    absorbed.playerUnits[0].shield = 20;
    const after = cast(absorbed, 'flame_tail_shield');
    expect(after.playerUnits[0].hp).toBe(100);
    expect(foxFireLayers(after.playerUnits[0])).toBe(2);
    const early = quiet();
    early.enemyUnits = [{ ...early.enemyUnits[0], skills: ['punch'], acted: false, spd: 200 }];
    const lateShield = cast(early, 'flame_tail_shield');
    expect(foxFireLayers(lateShield.playerUnits[0])).toBe(1);
    expect(lateShield.playerUnits[0].statuses.some(s => s.kind === 'foxTailGuard')).toBe(false);
    const idle = cast(quiet(), 'flame_tail_shield');
    expect(idle.playerUnits[0].shield).toBe(4);
    expect(foxFireLayers(idle.playerUnits[0])).toBe(1);
    expect(idle.playerUnits[0].statuses.some(s => s.kind === 'foxTailGuard')).toBe(false);
  });

  it('强化只增加护盾，焚尾和自燃不突破九层；战斗保存保留狐火，新战斗清空', () => {
    const b = quiet(8);
    b.playerUnits[0].skillEnhancements = { 3: 2 };
    const after = cast(b, 'flame_tail_shield');
    expect(after.playerUnits[0].shield).toBe(8);
    expect(skillFullDesc(getSkill('flame_tail_shield'), 2)).toContain('8点护盾');
    expect(skillFullDesc(getSkill('nine_tail_wildfire'), 2)).toContain('5点伤害');
    expect(foxFireLayers(after.playerUnits[0])).toBe(9);
    expect(foxFireLayers(cast(quiet(8), 'burn_tail').playerUnits[0])).toBe(9);
    expect(foxFireLayers(JSON.parse(JSON.stringify(after)).playerUnits[0])).toBe(9);
    expect(foxFireLayers(createBattle(after.playerUnits, [{ speciesId: 'momo' }], 1).playerUnits[0])).toBe(0);
  });

  it('致死命中不充能，灼烧与中毒结算不会触发受击奖励', () => {
    const lethal = quiet();
    lethal.playerUnits[0].hp = 1;
    lethal.enemyUnits = [{ ...lethal.enemyUnits[0], skills: ['punch'], acted: false, spd: 1 }];
    const dead = cast(lethal, 'flame_tail_shield');
    expect(dead.playerUnits[0].hp).toBe(0);
    expect(foxFireLayers(dead.playerUnits[0])).toBe(1);
    expect(dead.log.some(l => l.text.includes('的「焰尾护盾」获得'))).toBe(false);
    const b = quiet();
    b.playerUnits[0].statuses.push({ kind: 'poison', value: 12, turns: 2 });
    const dot = cast(b, 'flame_tail_shield');
    expect(dot.playerUnits[0].hp).toBe(94);
    expect(foxFireLayers(dot.playerUnits[0])).toBe(1);
    expect(dot.log.some(l => l.text.includes('的「焰尾护盾」获得'))).toBe(false);
  });

  it('进入传奇生物与技能池，不进入普通技能池或第一幕遭遇', () => {
    expect(MAIN_EVO2_POOL).toContain('nine_tail_sovereign');
    expect(LEGENDARY).toContain('nine_tail_sovereign');
    for (const id of ['nine_tail_wildfire', 'flame_tail_shield']) {
      expect(LEGENDARY_SKILLS.has(id)).toBe(true);
      expect(getNormalSkillPool()).not.toContain(id);
    }
    const seen = new Set<string>();
    for (let seed = 0; seed < 100; seed++) for (const act of [1, 2, 3]) {
      const ids = Object.values(generateMap(seed, act).encounter).flat().map(e => e.speciesId);
      if (act === 1) expect(ids).not.toContain('nine_tail_sovereign');
      else ids.forEach(id => seen.add(id));
    }
    expect(seen.has('nine_tail_sovereign')).toBe(true);
  });
});
