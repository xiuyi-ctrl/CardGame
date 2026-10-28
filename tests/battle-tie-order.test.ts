import { describe, expect, it } from 'vitest';
import { computeTurnOrder, createBattle, makeUnit, playerSkill, playerEndTurn } from '../src/game/core/battle';
import type { Unit } from '../src/game/types';

function units(player: boolean): Unit[] {
  return ([['back', 0], ['front', 1], ['back', 2], ['front', 0], ['front', 2]] as const).map(([row, col]) => ({
    ...makeUnit('momo', player, col, false, row), spd: 5, hp: 999, maxHp: 999, passive: undefined, skills: ['punch'],
  }));
}
function fixture() {
  const base = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'momo' }], 1);
  return { ...base, playerUnits: units(true), enemyUnits: units(false) };
}
const playerOrder = (units: Unit[]) => [3, 1, 4, 0, 2].map(i => units[i].uid);
const enemyOrder = (units: Unit[]) => [4, 1, 3, 2, 0].map(i => units[i].uid);

describe('同速按站位排序', () => {
  it('我方先前排从左到右，再后排从左到右；敌方左右镜像', () => {
    const b = fixture();
    expect(computeTurnOrder(b)).toEqual([...playerOrder(b.playerUnits), ...enemyOrder(b.enemyUnits)]);
  });
  it('不依赖队伍数组顺序，站位变化立即反映到顺序预览', () => {
    const b = fixture();
    const order = computeTurnOrder(b);
    expect(computeTurnOrder({ ...b, playerUnits: [...b.playerUnits].reverse(), enemyUnits: [...b.enemyUnits].reverse() })).toEqual(order);
    const swapped = { ...b, playerUnits: b.playerUnits.map((u, i) => i === 3 ? { ...u, column: 2 as const } : i === 4 ? { ...u, column: 0 as const } : u) };
    expect(computeTurnOrder(swapped).slice(0, 3)).toEqual([b.playerUnits[4].uid, b.playerUnits[1].uid, b.playerUnits[3].uid]);
  });
  it('速度高者优先，不因阵营或站位靠后而延后', () => {
    const b = fixture();
    b.enemyUnits[0].spd = 6;
    expect(computeTurnOrder(b)[0]).toBe(b.enemyUnits[0].uid);
  });
  it('先手优先；多个同速先手也按站位排序', () => {
    const b = fixture();
    for (const i of [0, 2]) b.playerUnits[i].skills = ['swift_strike'];
    expect(computeTurnOrder(b).slice(0, 2)).toEqual([b.playerUnits[0].uid, b.playerUnits[2].uid]);
    const explicit = { ...b, orders: { [b.playerUnits[2].uid]: { skillId: 'swift_strike' }, [b.playerUnits[0].uid]: { skillId: 'punch' } } };
    expect(computeTurnOrder(explicit)[0]).toBe(b.playerUnits[2].uid);
  });
  it('时滞优先于站位，死亡单位不进入队列', () => {
    const b = fixture();
    b.playerUnits[3].statuses = [{ kind: 'timeLag', value: 1, turns: 1, appliedRound: b.round }];
    b.enemyUnits[4].hp = 0;
    const order = computeTurnOrder(b);
    expect(order.at(-1)).toBe(b.playerUnits[3].uid);
    expect(order).not.toContain(b.enemyUnits[4].uid);
  });
  it('实际执行与预览一致，不受我方下令顺序影响', () => {
    let b = fixture();
    const expected = computeTurnOrder(b);
    for (const unit of [...b.playerUnits].reverse()) b = playerSkill(b, unit.uid, 'punch', b.enemyUnits[1].uid);
    const result = playerEndTurn(b);
    const actors = result.log.filter(l => l.text.includes('使用「爪击」攻击')).map(l => l.actorUid);
    expect(actors).toEqual(expected);
  });
});
