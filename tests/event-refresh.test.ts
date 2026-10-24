import { describe, expect, it } from 'vitest';
import { buildEventByType, type GameState } from '../src/game/state/game';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { makeUnit } from '../src/game/core/battle';
import { createRng } from '../src/game/rng';
import { FOODS } from '../src/game/data/foods';
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
  if (full) state.roster = Array.from({ length: 8 }, (_, i) => makeUnit('kiki', true, (i % 3) as 0 | 1 | 2, false));
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
    expect(after.gold).toBe(100);
    expect(choose(after, 'e2')).toBe(after);
  });
  it('金币祈愿扣40，随机一只永久加1速度，余额不足不扣不加', () => {
    const state = eventState('altar');
    state.gold = 39;
    expect(choose(state)).toBe(state);
    state.gold = 40;
    const after = choose(state);
    expect(after.gold).toBe(0);
    expect(after.roster.map(u => u.bonusStats?.spd ?? 0).sort()).toEqual([0, 1]);
  });
  it('祭坛强化不会丢掉迅迅已生效的被动速度', () => {
    const state = eventState('altar');
    state.roster = [makeUnit('momo', true, 0, false)];
    expect(choose(state).roster[0].spd).toBe(state.roster[0].spd + 1);
  });
  it('生命祈愿全体失去最大生命40%，仅一只永久加2最大生命，最低保留1血', () => {
    const state = eventState('altar');
    state.roster.forEach(u => { u.hp = 1; });
    const after = choose(state, 'e2');
    expect(after.roster.every(u => u.hp >= 1)).toBe(true);
    expect(after.roster.map(u => u.bonusStats?.hp ?? 0).sort()).toEqual([0, 2]);
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
    state.roster = Array.from({ length: 8 }, () => makeUnit('kiki', true, 0, false));
    const choice = state.map.events.origin.choices[0];
    const preview = gameReducer(state, { type: 'EVENT_HATCH_PREVIEW', choiceId: choice.id, monsterId: choice.monsterId! });
    const after = gameReducer(preview, { type: 'EVENT_HATCH_CONFIRM' });
    expect(after.screen).toBe('tame-overflow');
    expect(after.tameOverflow?.[0].speciesId).toBe(choice.monsterId);
  });
  it('带走选项50%战斗／50%携带，携带中10%特殊预定结果且可复现', () => {
    let battles = 0, specials = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const state = eventState('egg', seed), egg = state.map.events.origin.choices[1].carriedEgg!;
      const after = choose(state, 'e2');
      if (egg.ambush) { battles++; expect(after.screen).toBe('formation'); expect(after.carriedEggs).toBeUndefined(); }
      else { specials += egg.special ? 1 : 0; expect(after.carriedEggs?.[0].remaining).toBe(3); }
      expect(buildEventByType(createRng(seed), 'egg', 2)).toEqual(state.map.events.origin);
    }
    expect(battles).toBeGreaterThan(400); expect(battles).toBeLessThan(600);
    expect(specials).toBeGreaterThan(25); expect(specials).toBeLessThan(80);
  });
  it.each([false, true])('不同三关后普通蛋孵化，满员=%s，读档与重复关卡不重抽不多计', full => {
    let state = carried(false, full);
    const count = state.roster.length;
    expect(state.carriedEggs?.[0].remaining).toBe(3);
    state = passNode(state, 'a');
    state = passNode(state, 'a');
    expect(state.carriedEggs?.[0].remaining).toBe(2);
    state = parseDualSave(JSON.stringify(state))!.main!;
    state = passNode(state, 'b');
    expect(state.roster.length).toBe(count);
    state = passNode(state, 'c');
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
