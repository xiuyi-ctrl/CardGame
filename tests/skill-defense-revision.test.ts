// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createBattle, makeUnit, playerEndTurn, playerSkill, skillCooldownLeft } from '../src/game/core/battle';
import { getSkill } from '../src/game/data/skills';
import { getSkillEnhanceBonus, getSkillEnhanceMaxLevel } from '../src/game/core/growth';
import { ACTION_MS, HIT_DELAY_MS, useBattleFx } from '../src/ui/battleFx';

afterEach(() => { cleanup(); vi.useRealTimers(); });
function setup(skill: string, enemies = ['momo']) {
  const b = createBattle([makeUnit('momo', true, 0, false)], enemies.map(speciesId => ({ speciesId })), 17);
  Object.assign(b.playerUnits[0], { skills: [skill], spd: 99, hp: 100, maxHp: 100, passive: undefined });
  b.enemyUnits.forEach(u => Object.assign(u, { skills: [], passive: undefined, hp: 100, maxHp: 100, statuses: [] }));
  return b;
}

it('火幕庇护连续回合可用，旧冷却不再阻挡，火种额外护盾保留', () => {
  let b = setup('ember_veil');
  b.playerUnits[0].skillCooldowns = { ember_veil: 9 };
  b.playerUnits[0].statuses = [{ kind: 'emberSeed', value: 1, turns: 99 }];
  expect(getSkill('ember_veil').cooldown).toBeUndefined();
  for (let i = 0; i < 2; i++) {
    expect(skillCooldownLeft(b.playerUnits[0], 'ember_veil')).toBe(0);
    b = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, 'ember_veil'));
  }
  expect(b.playerUnits[0].shield).toBe(8);
});

it.each([false, true])('泡泡龙神每段超过6减2，先扣盾，恰好6不减，敌方攻击=%s', enemyActor => {
  for (const damage of [6, 7, 9]) {
    const attacker = makeUnit('momo', !enemyActor, 0, false);
    attacker.skills = ['punch']; attacker.passive = undefined; attacker.spd = 99;
    const target = makeUnit('lulu_god', enemyActor, 0, false); target.shield = 99;
    const b = enemyActor ? createBattle([target], [], 17, { mirrorUnits: [attacker] })
      : createBattle([attacker], [], 17, { mirrorUnits: [target] });
    (enemyActor ? b.playerUnits : b.enemyUnits)[0].skills = [];
    b.testSkillOverrides = { punch: { damage, hits: 2 } };
    const actor = (enemyActor ? b.enemyUnits : b.playerUnits)[0];
    const victim = (enemyActor ? b.playerUnits : b.enemyUnits)[0];
    const after = playerEndTurn(enemyActor ? b : playerSkill(b, actor.uid, 'punch', victim.uid));
    const hits = after.log.filter(e => e.actorUid === actor.uid && e.text.includes('使用「爪击」攻击'));
    expect(hits).toHaveLength(2);
    for (const entry of hits) expect(entry.impacts?.[victim.uid]).toMatchObject({ hpLoss: 0, shieldLoss: damage > 6 ? damage - 2 : damage });
  }
});

it('潮汐领域只在施放当回合减伤2，不治疗，下回合不保留，不强化减伤', () => {
  let b = setup('tidal_domain');
  b.enemyUnits[0].skills = ['punch'];
  const actor = b.playerUnits[0], enemy = b.enemyUnits[0];
  actor.hp = 30;
  const after = playerEndTurn(playerSkill(b, actor.uid, 'tidal_domain'));
  const hit = after.log.find(e => e.actorUid === enemy.uid && e.text.includes('使用「爪击」攻击'))!;
  expect(hit.impacts?.[actor.uid].hpLoss).toBe(getSkill('punch').damage! - 2);
  const buffs = after.log.filter(e => e.text.includes('使用「潮汐领域」'));
  expect(buffs).toHaveLength(1);
  expect(buffs[0].impacts?.[actor.uid].healing).toBe(0);
  expect(after.playerUnits[0].statuses.some(s => s.kind === 'waterCurtain')).toBe(false);
  b = playerEndTurn(after);
  const nextHit = b.log.slice(after.log.length).find(e => e.actorUid === enemy.uid && e.text.includes('使用「爪击」攻击'))!;
  expect(nextHit.impacts?.[actor.uid].hpLoss).toBe(getSkill('punch').damage);
  expect(getSkill('tidal_domain').heal).toBeUndefined();
  expect(getSkillEnhanceMaxLevel('tidal_domain')).toBe(0);
  expect(getSkillEnhanceBonus('tidal_domain', 4).effectBonus).toBe(0);
});

it('铁壁双击每段先命中再获得盾，快照和动画均不提前展示下一段护盾', () => {
  vi.useFakeTimers();
  const b = setup('iron_double', ['momo', 'lulu']);
  const uid = b.playerUnits[0].uid;
  const after = playerEndTurn(playerSkill(b, uid, 'iron_double'));
  const relevant = after.log.filter(e => e.actorUid === uid && (e.text.includes('使用「铁壁双击」攻击') || e.text.includes('获得 5 点护盾')));
  expect(relevant).toHaveLength(4);
  expect(relevant.map(e => e.shields?.[uid])).toEqual([0, 5, 5, 10]);
  expect(relevant[0].text).toContain('攻击'); expect(relevant[1].text).toContain('获得');
  const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
  rerender({ battle: after });
  act(() => vi.advanceTimersByTime(HIT_DELAY_MS));
  expect(result.current.shieldMap?.[uid]).toBe(0);
  expect(result.current.pops.some(p => p.uid === uid && p.shield)).toBe(false);
  act(() => vi.advanceTimersByTime(ACTION_MS));
  expect(result.current.shieldMap?.[uid]).toBe(5);
  expect(result.current.pops.some(p => p.uid === uid && p.shield && p.text === '+5')).toBe(true);
  act(() => vi.runAllTimers());
  expect(result.current.shieldMap?.[uid]).toBe(10);
});

it('淬毒噬咬不主动附毒，纯攻击强化；熔岩重爪无灼烧条件额外伤害', () => {
  for (const id of ['toxic_bite', 'molten_claw']) for (const active of [false, true]) {
    const b = setup(id), target = b.enemyUnits[0];
    if (active) target.statuses = [{ kind: id === 'toxic_bite' ? 'poison' : 'burn', value: 2, turns: 3 }];
    const after = playerEndTurn(playerSkill(b, b.playerUnits[0].uid, id, target.uid));
    const hit = after.log.find(e => e.text.includes(`使用「${getSkill(id).name}」攻击`))!;
    expect(hit.impacts?.[target.uid].hpLoss).toBe(id === 'toxic_bite' ? active ? 8 : 4 : 6);
    expect(hit.impacts?.[target.uid].addedStatuses?.poison).toBeUndefined();
  }
  expect(getSkillEnhanceBonus('toxic_bite', 4).damageBonus).toBe(8);
});
