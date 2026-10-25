import { describe, expect, it } from 'vitest';
import {
  createBattle, getActablePlayerUnits, makeUnit, playerCancelOrder, playerEndTurn,
  playerHasMove, playerRest, playerSkill, playerSwap, playerTame, skillUsesLeft,
} from '../src/game/core/battle';
import { createInitialState, migrateGameState } from '../src/game/state/reducer';
import type { BattleState } from '../src/game/types';

function durableBattle(): BattleState {
  const units = ([0, 1] as const).map((column) => ({
    ...makeUnit('momo', true, column, false), hp: 500, maxHp: 500, skills: ['punch', 'bite'],
  }));
  const battle = createBattle(units, [{ speciesId: 'kiki' }, { speciesId: 'momo' }], 31, { collectTelemetry: true });
  return { ...battle, enemyUnits: battle.enemyUnits.map((u) => ({ ...u, hp: 500, maxHp: 500 })) };
}

describe('取消共享行动点', () => {
  it('每只宠物独立下令一次，修改与取消不影响伙伴，结算后恢复', () => {
    const battle = durableBattle();
    const [first, second] = battle.playerUnits;
    const target = battle.enemyUnits[0].uid;
    let ordered = playerSkill(battle, first.uid, 'punch', target);
    ordered = playerSkill(ordered, first.uid, 'bite', target);
    expect(getActablePlayerUnits(ordered).map((u) => u.uid)).toEqual([second.uid]);
    ordered = playerSkill(ordered, second.uid, 'punch', target);
    expect(playerHasMove(ordered)).toBe(false);
    const canceled = playerCancelOrder(ordered, first.uid);
    expect(canceled.orders?.[second.uid]).toEqual(ordered.orders?.[second.uid]);
    expect(getActablePlayerUnits(canceled).map((u) => u.uid)).toEqual([first.uid]);
    const after = playerEndTurn(ordered);
    const uses = after.telemetry!.filter((e) => e.kind === 'skill-use' && e.side === 'player');
    expect(uses.map((e) => e.actorUid).sort()).toEqual([first.uid, second.uid].sort());
    expect(uses.find((e) => e.actorUid === first.uid)?.skillId).toBe('bite');
    expect(after.round).toBe(2);
    expect(getActablePlayerUnits(after)).toHaveLength(2);
    expect(after).not.toHaveProperty('playerAp');
    expect(after).not.toHaveProperty('enemyAp');
  });

  it('换位只占发起者行动，不能取消成免费换位或再追加技能', () => {
    const battle = durableBattle();
    const [first, second] = battle.playerUnits;
    const swapped = playerSwap(battle, first.uid, second.uid);
    expect(swapped.round).toBe(battle.round);
    expect(getActablePlayerUnits(swapped).map((u) => u.uid)).toEqual([second.uid]);
    expect(playerCancelOrder(swapped, first.uid)).toBe(swapped);
    expect(playerSkill(swapped, first.uid, 'punch', battle.enemyUnits[0].uid)).toBe(swapped);
    expect(playerRest(swapped, first.uid)).toBe(swapped);
    const ordered = playerSkill(swapped, second.uid, 'punch', battle.enemyUnits[0].uid);
    const after = playerEndTurn(ordered);
    expect(after.telemetry!.filter((e) => e.kind === 'skill-use' && e.side === 'player').map((e) => e.actorUid)).toEqual([second.uid]);
  });

  it('捕获不占宠物行动，不提前执行已下达指令', () => {
    const battle = durableBattle();
    battle.enemyUnits[0] = { ...battle.enemyUnits[0], hp: 1 };
    let ordered = battle;
    for (const unit of battle.playerUnits) ordered = playerSkill(ordered, unit.uid, 'punch', battle.enemyUnits[1].uid);
    const after = playerTame(ordered, 'berry', battle.enemyUnits[0].uid);
    expect(after.pendingTame).toHaveLength(1);
    expect(after.round).toBe(battle.round);
    expect(after.orders).toEqual(ordered.orders);
    expect(after.telemetry!.filter((e) => e.kind === 'skill-use')).toHaveLength(0);
    expect(after.playerUnits).toEqual(ordered.playerUnits);
  });

  it('旧存档中即使行动点为零，未行动宠物仍能下令；已换位宠物仍不能重复行动', () => {
    const battle = durableBattle();
    battle.playerUnits[0] = { ...battle.playerUnits[0], acted: true };
    const legacy = { ...battle, playerAp: 0, playerApMax: 2, enemyAp: 0 };
    const migrated = migrateGameState(JSON.parse(JSON.stringify({ ...createInitialState(), screen: 'battle', battle: legacy })))!.battle!;
    expect(migrated).not.toHaveProperty('playerAp');
    expect(migrated).not.toHaveProperty('playerApMax');
    expect(migrated).not.toHaveProperty('enemyAp');
    const [first, second] = migrated.playerUnits;
    expect(playerSkill(migrated, first.uid, 'punch')).toBe(migrated);
    const ordered = playerSkill(migrated, second.uid, 'punch', migrated.enemyUnits[0].uid);
    expect(ordered.orders?.[second.uid]?.skillId).toBe('punch');
  });

  it('死亡和眩晕单位不能下令，伙伴行动不受影响', () => {
    const battle = durableBattle();
    const [first, second] = battle.playerUnits;
    const stunned: BattleState = { ...battle, playerUnits: [{ ...first, statuses: [{ kind: 'stun', value: 1, turns: 1 }] }, second] };
    expect(playerSkill(stunned, first.uid, 'punch')).toBe(stunned);
    expect(getActablePlayerUnits(stunned).map((u) => u.uid)).toEqual([second.uid]);
    const dead = { ...battle, playerUnits: [{ ...first, hp: 0 }, second] };
    expect(playerSkill(dead, first.uid, 'punch')).toBe(dead);
  });

  it('暗影追猎获得追加行动，但原指定目标已死亡时跳过，不转打其他敌人', () => {
    const hunter = { ...makeUnit('boss_dark', true, 0, false), hp: 500, maxHp: 500, spd: 99, skills: ['soul_rend', 'bite'], skillUses: { soul_rend: 1 } };
    const raw = createBattle([hunter], [{ speciesId: 'momo' }, { speciesId: 'lulu' }], 31, { collectTelemetry: true });
    const battle = { ...raw, enemyUnits: raw.enemyUnits.map((u, i) => ({ ...u, row: 'front' as const, hp: i === 0 ? 1 : 100, maxHp: 100 })) };
    const after = playerEndTurn(playerSkill(battle, hunter.uid, 'soul_rend', battle.enemyUnits[0].uid));
    const uses = after.telemetry!.filter((e) => e.kind === 'skill-use' && e.actorUid === hunter.uid);
    expect(uses.map((e) => e.skillId)).toEqual(['soul_rend']);
    expect(skillUsesLeft(after.playerUnits[0], 'soul_rend')).toBe(0);
    expect(after.log.some(entry => entry.actorUid === hunter.uid && entry.text.includes('本次行动跳过'))).toBe(true);
    expect(after.log.every(entry => (entry.hp?.[battle.enemyUnits[1].uid] ?? 100) === 100)).toBe(true);
  });
});
