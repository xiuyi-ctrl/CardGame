import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit, playerSkill, playerRest, playerEndTurn, mirrorCopyPlan, canUnitUseSkill } from '../src/game/core/battle';
import { MONSTERS, SPECIAL_EGG_POOL } from '../src/game/data/monsters';
import { createInitialState, gameReducer, resolveBattle } from '../src/game/state/reducer';
import { fuseUnit } from '../src/game/state/game';
import { getNormalSkillPool, getSkillEnhanceMaxLevel } from '../src/game/core/growth';
import { parseDualSave } from '../src/ui/persistence';

function setup(skill = 'punch') {
  const ally = { ...makeUnit('momo', true, 0, false), skills: [skill], passive: undefined, spd: 10 };
  const mirror = makeUnit('mirror_beast', true, 1, false);
  const b = createBattle([ally, mirror], [{ speciesId: 'momo' }], 71);
  b.enemyUnits = b.enemyUnits.map(u => ({ ...u, hp: 200, maxHp: 200, skills: [], passive: undefined, acted: true }));
  return b;
}
function cast(skill = 'punch') {
  let b = setup(skill);
  b = playerSkill(b, b.playerUnits[0].uid, skill, b.enemyUnits[0].uid);
  return playerEndTurn(playerSkill(b, b.playerUnits[1].uid, 'mirror_copy'));
}

describe('镜影兽与镜影复制', () => {
  it('18生命5速度2阶，固定形态特殊蛋生物，只有两个自身技能', () => {
    const unit = makeUnit('mirror_beast', true, 0, false);
    expect([unit.hp, unit.spd, MONSTERS.mirror_beast.rank]).toEqual([18, 5, 2]);
    expect(unit.skills).toEqual(['mirror_speed_up', 'mirror_speed_down']);
    expect(MONSTERS.mirror_beast.eggBorn).toBe(true); expect(MONSTERS.mirror_beast.tame.difficulty).toBe(0);
    expect(fuseUnit(unit)).toBeNull(); expect(SPECIAL_EGG_POOL).toContain(unit.speciesId);
    for (const id of [...unit.skills, 'mirror_copy']) {
      expect(getNormalSkillPool()).not.toContain(id); expect(getSkillEnhanceMaxLevel(id)).toBe(0);
    }
  });
  it('复制占用本次行动、每场一次，不赋予额外行动', () => {
    const b = cast();
    expect(b.enemyUnits[0].hp).toBe(190);
    expect(b.log.filter(l => l.text.includes('使用「爪击」攻击'))).toHaveLength(2);
    expect(b.playerUnits[1].skillUses?.mirror_copy).toBe(0);
    expect(canUnitUseSkill(b.playerUnits[1], 'mirror_copy')).toBe(false);
  });
  it('只取本回合最后成功施法友方，不受中间敌人行动影响', () => {
    let b = setup();
    const second = { ...makeUnit('kiki', true, 2, false), passive: undefined, spd: 7, skills: ['aqua_shot'] };
    b.playerUnits.push(second);
    b.enemyUnits[0].acted = false; b.enemyUnits[0].spd = 6; b.enemyUnits[0].skills = ['claw_attack'];
    b = playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid);
    b = playerSkill(b, second.uid, 'aqua_shot', b.enemyUnits[0].uid);
    b = playerEndTurn(playerSkill(b, b.playerUnits[1].uid, 'mirror_copy'));
    expect(b.log.some(l => l.text.includes('镜影复制」复制「水弹'))).toBe(true);
  });
  it('无记录时不消耗次数，且不读取上一回合记录', () => {
    let b = setup(); b.playerUnits[1].spd = 20;
    b = playerSkill(b, b.playerUnits[1].uid, 'mirror_copy');
    b = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid));
    expect(b.playerUnits[1].skillUses?.mirror_copy).toBe(1); expect(b.lastAllySkill).toBeUndefined();
    b = playerEndTurn(playerSkill(b, b.playerUnits[1].uid, 'mirror_copy'));
    expect(b.playerUnits[1].skillUses?.mirror_copy).toBe(1);
  });
  it('休息不写入技能记录', () => {
    let b = setup();
    const rest = { ...makeUnit('kiki', true, 2, false), spd: 7, passive: undefined };
    b.playerUnits.push(rest);
    b = playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid);
    b = playerRest(b, rest.uid);
    b = playerEndTurn(playerSkill(b, b.playerUnits[1].uid, 'mirror_copy'));
    expect(b.enemyUnits[0].hp).toBe(190);
  });
  it('不消耗原单位第二次次数，也不继承其强化或攻击被动', () => {
    let b = setup('nine_tail_wildfire');
    b.playerUnits[0].skillUses = { nine_tail_wildfire: 3 };
    b.playerUnits[0].skillEnhancements = { 0: 3 };
    b.playerUnits[0].passive = 'heat';
    b = playerSkill(b, b.playerUnits[0].uid, 'nine_tail_wildfire');
    b = playerEndTurn(playerSkill(b, b.playerUnits[1].uid, 'mirror_copy'));
    expect(b.playerUnits[0].skillUses?.nine_tail_wildfire).toBe(2);
    expect(b.playerUnits[0].skillCooldowns?.nine_tail_wildfire).toBe(1);
    expect(b.playerUnits[1].skillUses?.nine_tail_wildfire).toBeUndefined();
    expect(b.playerUnits[1].skillCooldowns?.nine_tail_wildfire).toBeUndefined();
    const copy = b.log.find(l => l.actorUid === b.playerUnits[1].uid && l.text.includes('使用「九尾燎原」攻击'))!;
    expect(copy.text).toContain('造成 3 伤害');
  });
  it('自身护盾技能改作用于镜影兽自己', () => {
    let b = setup('sand_shield');
    b = playerSkill(b, b.playerUnits[0].uid, 'sand_shield');
    b = playerEndTurn(playerSkill(b, b.playerUnits[1].uid, 'mirror_copy'));
    expect(b.playerUnits.map(u => u.shield)).toEqual([4, 4]);
  });
  it('原目标被击败后重新选合法目标，不能攻击死人', () => {
    let b = setup(); b.enemyUnits[0].hp = 5;
    const second = { ...makeUnit('kiki', false, 1, false, 'back'), passive: undefined, hp: 200, maxHp: 200, skills: [], acted: true };
    b.enemyUnits.push(second);
    b = playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid);
    b = playerEndTurn(playerSkill(b, b.playerUnits[1].uid, 'mirror_copy'));
    expect(b.enemyUnits.map(u => u.hp)).toEqual([0, 195]);
  });
  it('裂壳冲撞检查镜影兽自己的护盾，不借用队友护盾', () => {
    let b = setup('shell_charge'); b.playerUnits[0].shield = 5;
    b = playerSkill(b, b.playerUnits[0].uid, 'shell_charge', b.enemyUnits[0].uid);
    b = playerEndTurn(playerSkill(b, b.playerUnits[1].uid, 'mirror_copy'));
    expect(b.playerUnits[1].skillUses?.mirror_copy).toBe(1); expect(b.enemyUnits[0].hp).toBe(192);
  });
  it('火种引燃已消耗全部火种后，复制失败并保留次数', () => {
    let b = setup('ignite_embers');
    b.playerUnits[0].statuses = [{ kind: 'emberSeed', value: 1, turns: 0 }];
    b = playerSkill(b, b.playerUnits[0].uid, 'ignite_embers', b.enemyUnits[0].uid);
    b = playerEndTurn(playerSkill(b, b.playerUnits[1].uid, 'mirror_copy'));
    expect(b.playerUnits[1].skillUses?.mirror_copy).toBe(1); expect(b.enemyUnits[0].hp).toBe(198);
  });
  it('绝望凝视清空恐惧后，复制必须重新检查条件', () => {
    let b = setup('despair_gaze');
    b.enemyUnits[0].statuses = [{ kind: 'fear', value: 3, turns: 0 }];
    b = playerSkill(b, b.playerUnits[0].uid, 'despair_gaze', b.enemyUnits[0].uid);
    b = playerEndTurn(playerSkill(b, b.playerUnits[1].uid, 'mirror_copy'));
    expect(b.playerUnits[1].skillUses?.mirror_copy).toBe(1);
    expect(b.log.some(l => l.text.includes('镜影复制」未触发'))).toBe(true);
  });
  it.each(['rock_reforge', 'spore_summon', 'ghostly_summon', 'growth_impact', 'ghost_burst', 'puppet_soul_return'])('禁止复制%s', skillId => {
    const b = setup(); b.lastAllySkill = { player: { actorUid: b.playerUnits[0].uid, skillId } };
    expect(mirrorCopyPlan(b, b.playerUnits[1]).reason).toBeTruthy();
    expect(b.playerUnits[1].skillUses?.mirror_copy).toBe(1);
  });
  it('最后的技能被禁止时不改抄更早技能', () => {
    let b = setup();
    const second = { ...makeUnit('kiki', true, 2, false), passive: undefined, spd: 7, skills: ['soul_share'] };
    b.playerUnits.push(second);
    b = playerSkill(b, b.playerUnits[0].uid, 'punch', b.enemyUnits[0].uid);
    b = playerSkill(b, second.uid, 'soul_share');
    b = playerEndTurn(playerSkill(b, b.playerUnits[1].uid, 'mirror_copy'));
    expect(b.enemyUnits[0].hp).toBe(195); expect(b.playerUnits[1].skillUses?.mirror_copy).toBe(1);
  });
  it('先手技能的复制不倒流出手顺序', () => {
    let b = setup('fire_feather');
    b.enemyUnits[0].acted = false; b.enemyUnits[0].spd = 8; b.enemyUnits[0].skills = ['claw_attack'];
    b = playerSkill(b, b.playerUnits[0].uid, 'fire_feather', b.enemyUnits[0].uid);
    b = playerEndTurn(playerSkill(b, b.playerUnits[1].uid, 'mirror_copy'));
    expect(b.log.filter(l => l.text.includes('使用「') && l.text.includes('攻击')).map(l => l.actorUid))
      .toEqual([b.playerUnits[0].uid, b.enemyUnits[0].uid, b.playerUnits[1].uid]);
  });
  it('本场加减速可叠加，最低1，战后和新战斗恢复', () => {
    let b = setup();
    b = playerEndTurn(playerSkill(b, b.playerUnits[1].uid, 'mirror_speed_up'));
    expect(b.playerUnits[1].spd).toBe(6);
    for (let i = 0; i < 6; i++) b = playerEndTurn(playerSkill(b, b.playerUnits[1].uid, 'mirror_speed_down'));
    expect(b.playerUnits[1].spd).toBe(1); expect(b.playerUnits[1].mirrorSpdDelta).toBe(-4);
    const nextBattle = createBattle(b.playerUnits, [{ speciesId: 'momo' }], 2);
    expect(nextBattle.playerUnits[1].spd).toBe(5); expect(nextBattle.playerUnits[1].skillUses?.mirror_copy).toBe(1);
    const state = { ...createInitialState(), roster: [makeUnit('mirror_beast', true, 1, false)] };
    state.roster[0].uid = b.playerUnits[1].uid;
    expect(resolveBattle(state, { ...b, phase: 'won' }).roster[0].spd).toBe(5);
  });
  it('使用自身技能当回合禁止复制，下一回合恢复资格', () => {
    let b = setup(); b.playerUnits[1].mirrorOwnSkillUsed = true;
    expect(playerSkill(b, b.playerUnits[1].uid, 'mirror_copy')).toBe(b);
    b = playerEndTurn(b);
    expect(canUnitUseSkill(b.playerUnits[1], 'mirror_copy')).toBe(true);
  });
  it('读档保留本回合记录及已消耗次数，不重置被动', () => {
    const b = setup(); b.lastAllySkill = { player: { actorUid: b.playerUnits[0].uid, skillId: 'punch', targetUid: b.enemyUnits[0].uid } };
    b.playerUnits[1].skillUses = { mirror_copy: 0 };
    const state = { ...createInitialState(), screen: 'battle' as const, battle: b };
    const saved = parseDualSave(JSON.stringify(state))!.main!;
    expect(gameReducer(createInitialState(), { type: 'LOAD_GAME', state: saved }).battle).toEqual(b);
  });
});
