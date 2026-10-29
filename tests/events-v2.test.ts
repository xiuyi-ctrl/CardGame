import { expect, it } from 'vitest';
import { buildEventByType, CURSE_CN, type GameState } from '../src/game/state/game';
import { createInitialState, gameReducer, type GameAction } from '../src/game/state/reducer';
import { createRng } from '../src/game/rng';
import { makeUnit } from '../src/game/core/battle';
import { getMonster } from '../src/game/data/monsters';
import { MAIN_REGIONS } from '../src/game/data/regions';
import { parseDualSave } from '../src/ui/persistence';

function event(type: string, seed = 1): GameState {
  const base = gameReducer(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'kiki', seed });
  return { ...base, screen: 'event', currentNodeId: 'event', currentRow: 1, gold: 100,
    map: { ...base.map, events: { event: buildEventByType(createRng(seed), type, 2) } } };
}
const choose = (state: GameState, choiceId = 'e1', extra: Partial<Extract<GameAction, { type: 'EVENT_CHOICE' }>> = {}) =>
  gameReducer(state, { type: 'EVENT_CHOICE', choiceId, ...extra });

function battleResult(state: GameState, won: boolean) {
  const formation = choose(state);
  const battle = gameReducer(formation, { type: 'FORMATION_CONFIRM', units: formation.formation!.initialField });
  return gameReducer({ ...battle, battle: { ...battle.battle!, phase: won ? 'won' : 'lost' } }, { type: 'BATTLE_END_CONFIRM' });
}

it('流浪精灵是当前幕次单体池，挑战和喂食使用同一物种，胜利得生物和20金', () => {
  for (let act = 1; act <= 3; act++) {
    const state = event('精灵');
    state.act = act;
    state.map.events.event = buildEventByType(createRng(act), '精灵', act, 'emerald_forest');
    const [challenge, feed] = state.map.events.event.choices;
    expect(challenge.battleEnemies).toHaveLength(1);
    expect(feed.monsterId).toBe(challenge.battleEnemies![0].speciesId);
    expect(getMonster(feed.monsterId!).rank).toBe(act);
    expect([...MAIN_REGIONS.emerald_forest.basePool, ...MAIN_REGIONS.emerald_forest.evo1Pool, ...MAIN_REGIONS.emerald_forest.evo2Pool]).toContain(feed.monsterId);
    const after = battleResult(state, true);
    expect(after.roster.at(-1)?.speciesId).toBe(feed.monsterId);
    expect(after.gold).toBe(state.gold + 20);
    expect(after.runStats!.goldEarned - state.runStats!.goldEarned).toBe(20);
    expect(after.toast?.msg).toContain(getMonster(feed.monsterId!).name);
    expect(after.toast?.msg).toContain('20 金币');
  }
});

it('流浪精灵挑战失败全队扣20%生命，不损金币，不发伙伴', () => {
  const state = event('精灵');
  const after = battleResult(state, false);
  expect(after.gold).toBe(state.gold);
  expect(after.roster).toHaveLength(state.roster.length);
  after.roster.forEach((unit, i) => expect(unit.hp).toBe(Math.max(1, state.roster[i].hp - Math.round(unit.maxHp * .2))));
});

it('喂食必须有两份真实食物；同种两份可用，圣水不消耗，结果确定且提示消耗', () => {
  const state = { ...event('精灵'), inventory: { berry: 1, heal_potion: 10 } };
  expect(choose(state, 'e2')).toBe(state);
  const ready = { ...state, inventory: { ...state.inventory, berry: 2 } };
  const after = choose(ready, 'e2');
  expect(after.inventory.berry).toBe(0); expect(after.inventory.heal_potion).toBe(10);
  expect(after.roster).toHaveLength(state.roster.length + 1);
  expect(after.toast?.msg).toContain('消耗 浆果 ×2');
  const repeated = choose(ready, 'e2');
  expect(repeated.inventory).toEqual(after.inventory);
  expect(repeated.roster.at(-1)?.bonusStats).toEqual(after.roster.at(-1)?.bonusStats);
  expect(repeated.roster.at(-1)?.speciesId).toBe(after.roster.at(-1)?.speciesId);
});

it('喂食60%强化，生命与速度各半，效果永久；挑战与喂食满员均进入处理', () => {
  let boosted = 0, hp = 0, spd = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const state = { ...event('精灵', seed), inventory: { berry: 1, meat: 1 } };
    const bonus = state.map.events.event.choices[1].recruitBonus;
    const after = choose(state, 'e2');
    const unit = after.roster.at(-1)!;
    const normal = makeUnit(unit.speciesId, true, 0, false);
    expect(unit.tamedOrigin).toBe(true);
    if (bonus) {
      boosted++; bonus.stat === 'hp' ? hp++ : spd++;
      expect(unit.bonusStats?.[bonus.stat]).toBe(bonus.amount);
      expect(bonus.stat === 'hp' ? unit.maxHp - normal.maxHp : unit.spd - normal.spd).toBe(bonus.amount);
    }
  }
  expect(boosted).toBeGreaterThan(260); expect(boosted).toBeLessThan(340);
  expect(hp).toBeGreaterThan(100); expect(spd).toBeGreaterThan(100);
  const state = { ...event('精灵'), inventory: { berry: 2 } };
  state.roster = Array.from({ length: 10 }, (_, i) => makeUnit('momo', true, (i % 3) as 0 | 1 | 2, false));
  state.lastFormation = undefined;
  state.field = state.roster.slice(0, 2).map(unit => unit.uid);
  for (const after of [choose(state, 'e2'), battleResult(state, true)]) {
    expect(after.screen).toBe('tame-overflow'); expect(after.tameOverflow).toHaveLength(1);
    expect(after.tameOverflowReturn).toBe('map'); expect(after.roster).toHaveLength(10);
  }
});

it('训练场2至3只当前幕对手；全队（含后备）永久+1最大生命且读档保留', () => {
  for (let act = 1; act <= 3; act++) {
    const state = event('训练');
    state.act = act;
    state.map.events.event = buildEventByType(createRng(act), '训练', act);
    const enemies = state.map.events.event.choices[0].battleEnemies!;
    expect(enemies.length).toBeGreaterThanOrEqual(2); expect(enemies.length).toBeLessThanOrEqual(3);
    expect(enemies.every(unit => getMonster(unit.speciesId).rank === act)).toBe(true);
    const after = battleResult(state, true);
    after.roster.forEach((unit, i) => {
      expect(unit.maxHp).toBe(state.roster[i].maxHp + 1);
      expect(unit.bonusStats?.hp).toBe((state.roster[i].bonusStats?.hp ?? 0) + 1);
    });
    expect(parseDualSave(JSON.stringify(after))!.main!.roster.map(unit => unit.bonusStats)).toEqual(after.roster.map(unit => unit.bonusStats));
  }
});

it('泉水拒绝用治疗圣水换药，混合库存只减少真实食物', () => {
  const state = { ...event('spring'), inventory: { heal_potion: 4, berry: 0 } };
  expect(choose(state, 'e2')).toBe(state);
  const food = { ...state, inventory: { ...state.inventory, meat: 2, golden_fruit: 1 } };
  const next = choose(food, 'e2');
  expect(next.inventory.heal_potion).toBe(4);
  expect(next.inventory.meat + next.inventory.golden_fruit).toBe(2);
  expect(next.inventory.hp_up).toBe(1);
  expect(next.toast?.msg).not.toContain('治疗圣水');
});

it.each(['heads', 'tails'] as const)('硬币%s可赢，奖励必须指定伙伴，选取期间锁定事件且读档不重抽', coinSide => {
  const state = event('gambler');
  state.map.events.event.choices[0].coinResult = coinSide;
  expect(choose(state)).toBe(state);
  const won = choose(state, 'e1', { coinSide });
  expect(won.screen).toBe('event');
  expect(won.pendingEventTarget?.kind).toBe('spd');
  expect(choose(won, 'e2')).toBe(won);
  const loaded = parseDualSave(JSON.stringify(won))!.main!;
  expect(loaded.pendingEventTarget).toEqual(won.pendingEventTarget);
  const unit = loaded.roster[1];
  const after = gameReducer(loaded, { type: 'EVENT_TARGET_CONFIRM', uid: unit.uid });
  expect(after.roster[1].spd).toBe(unit.spd + 1);
  expect(after.roster[0].spd).toBe(won.roster[0].spd);
  expect(after.pendingEventTarget).toBeUndefined();
  expect(after.screen).toBe('map');
  expect(gameReducer(after, { type: 'EVENT_TARGET_CONFIRM', uid: unit.uid })).toBe(after);
});

it('猜错仅随机一只获迟缓，提示实际对象；离开无事发生', () => {
  const state = event('gambler');
  state.map.events.event.choices[0].coinResult = 'tails';
  const after = choose(state, 'e1', { coinSide: 'heads' });
  expect(after.roster.filter(unit => unit.curse === 'spdDown')).toHaveLength(1);
  expect(after.toast?.msg).toContain(after.roster.find(unit => unit.curse)!.name);
  expect(after.gold).toBe(state.gold);
  const leave = choose(state, 'e2');
  expect(leave.roster).toEqual(state.roster);
});

it('祭坛财富50金币，鲜血40%；随机属性与目标结果确定', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const state = event('altar', seed);
    for (const id of ['e1', 'e2']) {
      const choice = state.map.events.event.choices.find(choice => choice.id === id)!;
      const after = choose(state, id);
      expect(after.gold).toBe(id === 'e1' ? 50 : 100);
      expect(after.roster.filter((unit, i) => (unit.bonusStats?.[choice.boostStat!] ?? 0) > (state.roster[i].bonusStats?.[choice.boostStat!] ?? 0))).toHaveLength(1);
      for (let i = 0; i < state.roster.length; i++) {
        const before = state.roster[i], next = after.roster[i];
        const hpBonus = (next.bonusStats?.hp ?? 0) - (before.bonusStats?.hp ?? 0);
        expect(next.hp).toBe((id === 'e2' ? Math.max(1, before.hp - Math.round(before.maxHp * .4)) : before.hp) + hpBonus);
      }
      expect(choose(state, id)).toEqual(after);
    }
  }
});

it('神秘行商只有两个领取选项，每项2符', () => {
  const state = event('行商');
  expect(state.map.events.event.choices.map(choice => choice.kind)).toEqual(['item', 'item']);
  expect(choose(state).inventory.scout).toBe((state.inventory.scout ?? 0) + 2);
  expect(choose(state, 'e2').inventory.twin).toBe((state.inventory.twin ?? 0) + 2);
});

it('新蛋70%普通且含一二阶，30%特殊；普通池遵守地区，结果存档固定', () => {
  for (const region of ['mixed', 'emerald_forest'] as const) {
    let specials = 0; const ranks = new Set<number>();
    for (let seed = 1; seed <= 1000; seed++) {
      const generated = buildEventByType(createRng(seed), 'egg', 1, region);
      const egg = generated.choices[1].carriedEgg!;
      if (egg.special) { specials++; expect(getMonster(egg.monsterId).eggBorn).toBe(true); }
      else { ranks.add(getMonster(egg.monsterId).rank); expect([...MAIN_REGIONS[region].basePool, ...MAIN_REGIONS[region].evo1Pool]).toContain(egg.monsterId); }
      expect(getMonster(generated.choices[0].monsterId!).rank).toBeLessThanOrEqual(2);
      expect(generated).toEqual(buildEventByType(createRng(seed), 'egg', 1, region));
    }
    expect(specials).toBeGreaterThan(250); expect(specials).toBeLessThan(350);
    expect([...ranks].sort()).toEqual([1, 2]);
  }
});

it('遗迹四种结果按20/30/30/20分布，强化两次独立选宠并提示', () => {
  const counts = { reward: 0, damage: 0, loss: 0, boost: 0 };
  let food = 0, item = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const state = event('ruins', seed), choice = state.map.events.event.choices[0];
    const after = choose(state);
    if (choice.kind === 'food' || choice.kind === 'item') { counts.reward++; choice.kind === 'food' ? food++ : item++; }
    if (choice.kind === 'damage') { counts.damage++; expect(after.roster.every(unit => unit.hp >= 1)).toBe(true); }
    if (choice.kind === 'gold') { counts.loss++; expect(after.gold).toBe(70); }
    if (choice.kind === 'boost') {
      counts.boost++;
      expect(after.roster.reduce((sum, unit, i) => sum + (unit.bonusStats?.hp ?? 0) - (state.roster[i].bonusStats?.hp ?? 0), 0)).toBe(4);
      expect(after.roster.reduce((sum, unit, i) => sum + (unit.bonusStats?.spd ?? 0) - (state.roster[i].bonusStats?.spd ?? 0), 0)).toBe(2);
      expect(after.toast?.msg).toContain('永久 +4 生命'); expect(after.toast?.msg).toContain('永久 +2 速度');
    }
  }
  expect(counts.reward).toBeGreaterThan(85); expect(counts.reward).toBeLessThan(155);
  expect(counts.damage).toBeGreaterThan(145); expect(counts.damage).toBeLessThan(220);
  expect(counts.loss).toBeGreaterThan(145); expect(counts.loss).toBeLessThan(220);
  expect(counts.boost).toBeGreaterThan(85); expect(counts.boost).toBeLessThan(155);
  expect(food).toBeGreaterThan(25); expect(item).toBeGreaterThan(25);
});

it('灵魂祭坛献祭一只其余+2生命；净化有指定成功和随机诅咒两分支', () => {
  const state = event('altar2');
  const sacrificed = choose(state);
  expect(sacrificed.roster).toHaveLength(state.roster.length - 1);
  for (const unit of sacrificed.roster) expect(unit.bonusStats?.hp).toBe(2);
  const choice = state.map.events.event.choices[1];
  choice.purifySuccess = true;
  state.roster[1].curse = 'atkDown';
  const pending = choose(state, 'e2');
  expect(pending.pendingEventTarget?.kind).toBe('purify');
  const purified = gameReducer(pending, { type: 'EVENT_TARGET_CONFIRM', uid: state.roster[1].uid });
  expect(purified.roster[1].curse).toBeUndefined(); expect(purified.gold).toBe(state.gold);
  choice.purifySuccess = false;
  const cursed = choose({ ...state, roster: state.roster.map(unit => ({ ...unit, curse: undefined })) }, 'e2');
  expect(cursed.roster.filter(unit => unit.curse)).toHaveLength(1);
  const target = cursed.roster.find(unit => unit.curse)!;
  expect(cursed.toast?.msg).toContain(`${target.name} 获得诅咒「${CURSE_CN[target.curse!]}」`);
});

it('诅咒宝箱必给圣果或两份普通食物，诅咒独立各半且不吞奖励', () => {
  let holy = 0, curse = 0;
  const combos = new Set<string>();
  for (let seed = 1; seed <= 600; seed++) {
    const state = { ...event('cursed_chest', seed), inventory: {} };
    expect(state.map.events.event.choices.map(choice => choice.label)).toEqual(['打开宝箱', '离开']);
    const after = choose(state);
    if (after.inventory.golden_fruit) { holy++; expect(Object.values(after.inventory).reduce((a, b) => a + b, 0)).toBe(1); }
    else { expect(Object.values(after.inventory).reduce((a, b) => a + b, 0)).toBe(2); expect(Object.keys(after.inventory).every(id => ['berry', 'meat', 'gem'].includes(id))).toBe(true); }
    const cursed = after.roster.some(unit => unit.curse); curse += cursed ? 1 : 0;
    combos.add(`${!!after.inventory.golden_fruit}:${cursed}`);
    expect(after.toast?.msg).toContain('获得');
    expect(choose(state)).toEqual(after);
  }
  expect(holy).toBeGreaterThan(250); expect(holy).toBeLessThan(350);
  expect(curse).toBeGreaterThan(250); expect(curse).toBeLessThan(350);
  expect(combos.size).toBe(4);
});
