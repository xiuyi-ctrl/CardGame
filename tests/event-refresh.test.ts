import { describe, expect, it } from 'vitest';
import { buildEventByType, CURSE_CN, type GameState } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { createRng } from '../src/game/rng';
import { FOODS } from '../src/game/data/foods';
import { ITEMS } from '../src/game/data/items';
import { parseDualSave } from '../src/ui/persistence';

function eventState(type: string, seed = 1): GameState {
  return { ...createInitialState(), screen: 'event', act: 2, seed, currentNodeId: 'origin',
    roster: [makeUnit('kiki', true, 0, false), makeUnit('lulu', true, 1, false)], gold: 100,
    inventory: {}, map: { layers: [], boss: {}, encounter: {}, specials: {}, events: { origin: buildEventByType(createRng(seed), type, 2) } } };
}
function choose(state: GameState, choiceId = 'e1') { return gameReducer(state, { type: 'EVENT_CHOICE', choiceId }); }
function passNode(state: GameState, id: string) {
  const next: GameState = { ...state, screen: 'event', currentNodeId: id,
    map: { ...state.map, events: { ...state.map.events, [id]: { title: '关卡', desc: '', choices: [{ id: 'done', label: '完成', desc: '', kind: 'none' }] } } } };
  return choose(next, 'done');
}
function carried(special = false, full = false): GameState {
  const state = eventState('egg');
  const choice = state.map.events.origin.choices[1];
  choice.carriedEgg = { ambush: false, special, monsterId: 'momo' };
  if (full) state.roster = Array.from({ length: 10 }, (_, i) => makeUnit('kiki', true, (i % 3) as 0 | 1 | 2, false));
  return choose(state, 'e2');
}

describe('四类事件改版', () => {
  it('泉水治疗50%，保持生命上限', () => {
    const state = eventState('spring');
    state.roster[0].hp = 1;
    const after = choose(state);
    expect(after.roster[0].hp).toBe(1 + Math.round(state.roster[0].maxHp * 0.5));
    expect(after.roster[0].maxHp).toBe(state.roster[0].maxHp);
  });
  it('入药从实际持有食物中消耗一个，没有食物时不发放药水', () => {
    const state = eventState('spring');
    expect(choose(state, 'e2')).toBe(state);
    const food = Object.keys(FOODS)[0];
    state.inventory = { [food]: 2 };
    const after = choose(state, 'e2');
    expect(after.inventory[food]).toBe(1);
    expect(after.inventory.hp_up).toBe(1);
    expect(after.toast?.msg).toContain(`消耗 ${FOODS[food].name} ×1`);
    expect(after.toast?.msg).toContain(`获得 ${ITEMS.hp_up.name} ×1`);
    expect(after.gold).toBe(100);
    expect(choose(after, 'e2')).toBe(after);
  });
  it('财富祈愿扣50，随机一只永久强化，余额不足不扣不加', () => {
    const state = eventState('altar');
    state.gold = 49;
    expect(choose(state)).toBe(state);
    state.gold = 50;
    const after = choose(state);
    expect(after.gold).toBe(0);
    const choice = state.map.events.origin.choices[0];
    expect(after.roster.map(u => u.bonusStats?.[choice.boostStat!] ?? 0).sort()).toEqual([0, choice.amount]);
  });
  it('祭坛强化不会丢掉迅迅已生效的被动速度', () => {
    const state = eventState('altar');
    state.roster = [makeUnit('momo', true, 0, false)];
    const choice = state.map.events.origin.choices[0];
    const after = choose(state).roster[0];
    expect(after.spd).toBe(state.roster[0].spd + (choice.boostStat === 'spd' ? 1 : 0));
  });
  it('鲜血祈愿全体失去最大生命40%，仅一只永久强化，最低保留1血', () => {
    const state = eventState('altar');
    state.roster.forEach(u => { u.hp = 1; });
    const after = choose(state, 'e2');
    expect(after.roster.every(u => u.hp >= 1)).toBe(true);
    const choice = state.map.events.origin.choices[1];
    expect(after.roster.map(u => u.bonusStats?.[choice.boostStat!] ?? 0).sort()).toEqual([0, choice.amount]);
    expect(after.gold).toBe(100);
    expect(choose(state, 'e3').roster).toEqual(state.roster);
  });
  it('商人食物／道具各半且结果不提前泄露，支付20或直接得20', () => {
    let foods = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const state = eventState('merchant', seed);
      const choice = state.map.events.origin.choices[0];
      foods += choice.kind === 'food' ? 1 : 0;
      expect(choice.desc).toBe('损失20金币，随机获得1个食物或道具（各50%）');
      expect(choose(state).gold).toBe(80);
      expect(Object.values(choose(state).inventory).reduce((sum, n) => sum + n, 0)).toBe(1);
      expect(choose(state, 'e2').gold).toBe(120);
    }
    expect(foods).toBeGreaterThan(200);
    expect(foods).toBeLessThan(300);
  });
  it('即时孵化为一阶，满队伍进入处理界面', () => {
    const state = eventState('egg');
    state.roster = Array.from({ length: 10 }, () => makeUnit('kiki', true, 0, false));
    const choice = state.map.events.origin.choices[0];
    const preview = gameReducer(state, { type: 'EVENT_HATCH_PREVIEW', choiceId: choice.id, monsterId: choice.monsterId! });
    const after = gameReducer(preview, { type: 'EVENT_HATCH_CONFIRM' });
    expect(after.screen).toBe('tame-overflow');
    expect(after.tameOverflow?.[0].speciesId).toBe(choice.monsterId);
  });
  it('带走选项50%战斗／50%携带，携带中30%特殊预定结果且可复现', () => {
    let battles = 0, specials = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const state = eventState('egg', seed), egg = state.map.events.origin.choices[1].carriedEgg!;
      const after = choose(state, 'e2');
      if (egg.ambush) { battles++; expect(after.screen).toBe('formation'); expect(after.carriedEggs).toBeUndefined(); }
      else { specials += egg.special ? 1 : 0; expect(after.carriedEggs?.[0].remaining).toBe(3); }
      expect(buildEventByType(createRng(seed), 'egg', 2)).toEqual(state.map.events.origin);
    }
    expect(battles).toBeGreaterThan(400); expect(battles).toBeLessThan(600);
    expect(specials).toBeGreaterThan(110); expect(specials).toBeLessThan(190);
  });
  it.each([false, true])('三次关卡后普通蛋孵化，满员=%s，读档不重抽，重复关卡计数', full => {
    let state = carried(false, full);
    const count = state.roster.length;
    expect(state.carriedEggs?.[0].remaining).toBe(3);
    state = passNode(state, 'a');
    state = passNode(state, 'a');
    expect(state.carriedEggs?.[0].remaining).toBe(1);
    state = parseDualSave(JSON.stringify(state))!.main!;
    expect(state.roster.length).toBe(count);
    state = passNode(state, 'a');
    expect(state.carriedEggs).toEqual([]);
    expect(state.screen).toBe(full ? 'tame-overflow' : 'map');
    expect(full ? state.tameOverflow?.[0].speciesId : state.roster.at(-1)?.speciesId).toBe('momo');
  });
  it('特殊蛋三关后孵化时砂兽，不重复孵化', () => {
    let state = carried(true);
    for (const id of ['a', 'b', 'c', 'd']) state = passNode(state, id);
    expect(state.carriedEggs).toEqual([]);
    expect(state.roster).toHaveLength(3);
    expect(state.roster.at(-1)?.speciesId).toBe('time_sand_beast');
  });
  it('返回布阵和关闭背包不推进孵化；跨幕继续保留成熟蛋', () => {
    const state = carried(false);
    const back = gameReducer({ ...state, screen: 'formation' }, { type: 'BACK_TO_MAP' });
    expect(back.carriedEggs?.[0].remaining).toBe(3);
    const closed = gameReducer({ ...state, screen: 'backpack' }, { type: 'CLOSE_BACKPACK' });
    expect(closed.carriedEggs?.[0].remaining).toBe(3);
    const mature = { ...state, screen: 'inter_act' as const, carriedEggs: state.carriedEggs!.map(egg => ({ ...egg, remaining: 0 })) };
    const after = gameReducer(mature, { type: 'INTER_ACT_CONTINUE' });
    expect(after.act).toBe(3);
    expect(after.roster).toHaveLength(state.roster.length + 1);
    expect(after.carriedEggs).toEqual([]);
  });
});

describe('事件结果说明实际对象与消耗', () => {
  it.each(['curse', 'gold'] as const)('%s选项提示被诅咒的实际伙伴和诅咒，保留金币奖励', kind => {
    const state = eventState('cursed_chest');
    state.roster[0].name = '左伙伴';
    state.roster[1].name = '右伙伴';
    state.map.events.origin.choices = [{ id: 'result', label: '打开', desc: '', kind,
      ...(kind === 'gold' ? { amount: 30, curseTarget: true } : {}) }];
    const after = choose(state, 'result');
    const cursed = after.roster.find(unit => unit.curse)!;
    expect(after.toast?.msg).toContain(`${cursed.name} 获得诅咒「${CURSE_CN[cursed.curse!]}」`);
    expect(after.roster.filter(unit => unit.curse)).toHaveLength(1);
    if (kind === 'gold') expect(after.toast?.msg).toContain('获得 30 金币');
    expect(choose(state, 'result')).toEqual(after);
  });

  it('泉水随机消耗提示与库存实际减少的食物一致', () => {
    for (const seed of [1, 2, 3, 4]) {
      const state = eventState('spring', seed);
      state.inventory = { berry: 2, meat: 3 };
      const after = choose(state, 'e2');
      const consumed = ['berry', 'meat'].find(id => after.inventory[id] === state.inventory[id] - 1)!;
      expect(after.toast?.msg).toContain(`消耗 ${FOODS[consumed].name} ×1`);
      expect(after.toast?.msg).toContain(`获得 ${ITEMS.hp_up.name} ×1`);
    }
  });

  it('赠送指定食物换道具时，不把消耗的食物误报为奖励', () => {
    const state = eventState('spring');
    state.inventory = { meat: 2 };
    state.map.events.origin.choices = [{ id: 'gift', label: '赠送食物', desc: '', kind: 'food',
      foodId: 'meat', consumeFood: true, itemId: 'hp_up' }];
    const after = choose(state, 'gift');
    expect(after.inventory.meat).toBe(1);
    expect(after.inventory.hp_up).toBe(1);
    expect(after.toast?.msg).toBe(`消耗 鲜肉 ×1；获得 ${ITEMS.hp_up.name} ×1`);
  });

  it('事件战斗失败的诅咒提示保留其他惩罚并指明实际伙伴', () => {
    const state = eventState('spring');
    state.battle = { ...createBattle(state.roster, [{ speciesId: 'momo' }], 1), phase: 'lost' };
    state.eventBattle = { enemies: [{ speciesId: 'momo' }], reward: { kind: 'gold', amount: 0 },
      penalty: { curseTarget: true, goldLoss: 10 } };
    const after = gameReducer(state, { type: 'BATTLE_END_CONFIRM' });
    const cursed = after.roster.find(unit => unit.curse)!;
    expect(after.toast?.msg).toContain('失去 10 金币');
    expect(after.toast?.msg).toContain(`${cursed.name} 获得诅咒「${CURSE_CN[cursed.curse!]}」`);
  });
});
