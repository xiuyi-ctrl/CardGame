import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  gameReducer,
  isValidGameState,
  resolveBattle,
  type GameAction,
} from '../src/game/state/reducer';
import type { GameState } from '../src/game/state/game';
import { generateMap, fuseUnit, fusionNeedCount, nextStage, nodeInfo, recomputeStats, ROSTER_MAX, ACT_BOSS_POOLS, type SpecialReward, type MapNode } from '../src/game/state/game';
import { createBattle, makeUnit, isTameable } from '../src/game/core/battle';
import { FOODS } from '../src/game/data/foods';
import { ITEMS } from '../src/game/data/items';

function dispatch(state: GameState, action: GameAction): GameState {
  return gameReducer(state, action);
}

describe('成长与融合', () => {
  it('nextStage 返回可融合的下一形态，末段不可融合', () => {
    expect(nextStage('momo')).toBe('momo_queen');
    expect(nextStage('momo_queen')).toBe('momo_god');
    expect(nextStage('momo_god')).toBeUndefined();
    expect(nextStage('boss_vine')).toBeUndefined();
  });

  it('融合需求数量：第 n 阶需 n+1 只同物种', () => {
    expect(fusionNeedCount('momo')).toBe(2);
    expect(fusionNeedCount('momo_queen')).toBe(3);
    expect(fusionNeedCount('momo_god')).toBe(4);
  });

  it('fuseUnit：主宠融合成下一形态，血回满、属性为新形态固定值', () => {
    const u = makeUnit('momo', true, 0, false);
    u.hp = 3;
    const fused = fuseUnit(u)!;
    expect(fused.speciesId).toBe('momo_queen');
    expect(fused.name).toBe('毛毛王后');
    expect(fused.maxHp).toBe(18);
    expect(fused.hp).toBe(18);
    expect(fused.uid).toBe(u.uid);
    expect(fused.skills).toEqual(['bite', 'leaf_needle', 'heal_light', 'shockwave']);
  });

  it('fuseUnit 继承主宠的强化与诅咒', () => {
    const u = makeUnit('momo', true, 0, false);
    const boosted = recomputeStats({ ...u, bonusStats: { hp: 3, spd: 1 } });
    const cursed = { ...boosted, curse: 'spdDown' as const };
    const fused = fuseUnit(cursed)!;
    expect(fused.bonusStats).toEqual({ hp: 3, spd: 1 });
    expect(fused.curse).toBe('spdDown');
    expect(fused.spd).toBe(4); // 王后 spd4 +1 -1
  });

  it('FUSE reducer：材料不足被拒；材料足够融合并移除材料', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    const a = makeUnit('momo', true, 0, false);
    const b = makeUnit('momo', true, 1, false);
    s = { ...s, screen: 'roster', roster: [a, b], field: [a.uid, b.uid] };
    // 仅一只时被拒
    const solo = dispatch({ ...s, roster: [a], field: [a.uid] }, { type: 'FUSE', primaryUid: a.uid });
    expect(solo.roster).toHaveLength(1);
    expect(solo.roster[0].speciesId).toBe('momo');
    // 两只融合成 momo_queen
    const next = dispatch(s, { type: 'FUSE', primaryUid: a.uid });
    expect(next.roster).toHaveLength(1);
    expect(next.roster[0].speciesId).toBe('momo_queen');
    expect(next.roster[0].uid).toBe(a.uid);
    expect(next.field).toEqual([a.uid]);
    expect(next.log[0]).toContain('融合');
  });

  it('二阶融合需要 3 只同物种', () => {
    const a = makeUnit('momo_queen', true, 0, false);
    const b = makeUnit('momo_queen', true, 1, false);
    let s: GameState = { ...createInitialState(), screen: 'roster', roster: [a, b], field: [a.uid, b.uid] };
    // 2 只不够
    const two = dispatch(s, { type: 'FUSE', primaryUid: a.uid });
    expect(two.roster.map((u) => u.speciesId)).toEqual(['momo_queen', 'momo_queen']);
    // 3 只融合成 momo_god
    const c = makeUnit('momo_queen', true, 2, false);
    const three = dispatch({ ...s, roster: [a, b, c], field: [a.uid, b.uid, c.uid] }, { type: 'FUSE', primaryUid: a.uid });
    expect(three.roster).toHaveLength(1);
    expect(three.roster[0].speciesId).toBe('momo_god');
  });
});

describe('地图生成', () => {
  it('层数在 8~10 之间，首层单战斗、末层 2~3 个首领（遵循寻路），且每幕含商店/事件', () => {
    for (let act = 1; act <= 3; act++) {
      const map = generateMap(42, act);
      expect(map.layers.length).toBeGreaterThanOrEqual(8);
      expect(map.layers.length).toBeLessThanOrEqual(10);
      expect(map.layers[0].length).toBe(1);
      expect(map.layers[0][0].type).toBe('battle');
      const last = map.layers[map.layers.length - 1];
      expect(last.length).toBeGreaterThanOrEqual(2);
      expect(last.length).toBeLessThanOrEqual(3);
      expect(last.every((n) => n.type === 'boss')).toBe(true);
      expect(Object.keys(map.boss).length).toBe(last.length);
      // 末层首领从对应幕的候选池抽取（不重复）
      const pool = ACT_BOSS_POOLS[act];
      const bossIds = last.map((n) => map.boss[n.id]![0].speciesId);
      expect(new Set(bossIds).size).toBe(bossIds.length);
      for (const b of bossIds) expect(pool).toContain(b);
      // 末层遵循寻路：倒数第二行每个节点都能走到相邻首领节点
      const prevRow = map.layers[map.layers.length - 2];
      for (const n of prevRow) {
        expect(last.some((m) => Math.abs(m.col - n.col) <= 1)).toBe(true);
      }
      // col 列号连续递增；中间行宽度 3~5
      for (const row of map.layers) {
        row.forEach((n, i) => expect(n.col).toBe(i));
      }
      for (const row of map.layers.slice(1, -1)) {
        expect(row.length).toBeGreaterThanOrEqual(3);
        expect(row.length).toBeLessThanOrEqual(5);
      }
      // 出发后第 1 行强制全战斗
      expect(map.layers[1].every((n) => n.type === 'battle')).toBe(true);
      // 全战斗行（不含首/尾）不超过 3
      const allBattleRows = map.layers.slice(1, -1).filter((row) => row.every((n) => n.type === 'battle'));
      expect(allBattleRows.length).toBeLessThanOrEqual(3);
      // 不再生成独立休整节点；每幕 3~5 次事件、2~4 个商人（最后两层必有商人，故上限放宽到 5）
      const types = map.layers.flat().map((n) => n.type);
      expect(types.includes('rest')).toBe(false);
      const shopCount = types.filter((t) => t === 'shop').length;
      expect(shopCount).toBeGreaterThanOrEqual(2);
      expect(shopCount).toBeLessThanOrEqual(5);
      const tail = map.layers.slice(-3, -1);
      expect(tail.some((row) => row.some((n) => n.type === 'shop'))).toBe(true);
      const evCount = types.filter((t) => t === 'event').length;
      expect(evCount).toBeGreaterThanOrEqual(3);
      expect(evCount).toBeLessThanOrEqual(5);
      // 奇遇节点都有事件内容
      for (const n of map.layers.flat().filter((x) => x.type === 'event')) {
        expect(map.events[n.id]).toBeDefined();
        expect(map.events[n.id].choices.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('神秘蛋事件不暴露孵化生物名', () => {
    for (let act = 1; act <= 3; act++) {
      for (const seed of [1, 42, 123]) {
        const map = generateMap(seed, act);
        for (const ev of Object.values(map.events)) {
          for (const c of ev.choices) {
            if (c.kind === 'recruit') {
              expect(c.monsterId).toBeDefined();
              expect(c.desc).not.toMatch(/（|）/);
            }
          }
        }
      }
    }
  });

  it('MOVE：出发层可直达任意下一层节点，进入第一层后只能走相邻列', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 7 });
    const start = s.map.layers[0][0];
    s = dispatch(s, { type: 'MOVE', nodeId: start.id });
    expect(['battle', 'formation', 'roster', 'event', 'shop', 'rest', 'special']).toContain(s.screen);
    // 跳过战斗，直接构造已到达出发节点的地图状态
    s = { ...s, screen: 'map', battle: undefined, formation: undefined, currentNodeId: start.id, currentRow: 0 };
    const nextRow = s.map.layers[1];
    expect(nextRow.length).toBeGreaterThanOrEqual(2);
    // 出发节点可直达第一层任意节点（含最右侧）
    const far = nextRow.find((n) => n.col >= 2);
    if (far) {
      const moved = dispatch(s, { type: 'MOVE', nodeId: far.id });
      expect(moved.currentNodeId).toBe(far.id);
    }
    // 进入第一层后：只能移动到 col±1
    const mid = nextRow.find((n) => n.col <= 1)!;
    s = dispatch(s, { type: 'MOVE', nodeId: mid.id });
    s = { ...s, screen: 'map', battle: undefined };
    const row2 = s.map.layers[2];
    const far2 = row2.find((n) => Math.abs(n.col - (mid.col ?? 0)) > 1);
    if (far2) {
      const before = s.currentNodeId;
      const after = dispatch(s, { type: 'MOVE', nodeId: far2.id });
      expect(after.currentNodeId).toBe(before);
      expect(after.screen).toBe('map');
    }
    // 相邻节点可以移动
    const near2 = row2.find((n) => Math.abs(n.col - (mid.col ?? 0)) <= 1)!;
    const moved = dispatch(s, { type: 'MOVE', nodeId: near2.id });
    expect(moved.currentNodeId).toBe(near2.id);
  });

  it('MOVE 后清除跳关/侦查选择态，避免模式残留', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 7 });
    const start = s.map.layers[0][0];
    s = dispatch(s, { type: 'MOVE', nodeId: start.id });
    s = { ...s, screen: 'backpack', battle: undefined, formation: undefined, currentNodeId: start.id, currentRow: 0, inventory: { ...s.inventory, skip: 1, scout: 1 } };
    s = dispatch(s, { type: 'OPEN_SKIP' });
    expect(s.skipSelecting).toBe(true);
    const t1 = s.map.layers[1][0];
    s = dispatch(s, { type: 'MOVE', nodeId: t1.id });
    expect(s.skipSelecting).toBe(false);
    expect(s.scoutSelecting).toBe(false);
    expect(s.currentNodeId).toBe(t1.id);
    s = { ...s, screen: 'backpack', currentRow: s.currentRow, currentNodeId: s.currentNodeId };
    s = dispatch(s, { type: 'OPEN_SCOUT' });
    expect(s.scoutSelecting).toBe(true);
    const cur = s.map.layers[s.currentRow].find((n) => n.id === s.currentNodeId);
    const row2 = s.map.layers[s.currentRow + 1];
    const t2 = row2.find((n) => Math.abs(n.col - (cur?.col ?? 0)) <= 1) ?? row2[0];
    s = dispatch(s, { type: 'MOVE', nodeId: t2.id });
    expect(s.scoutSelecting).toBe(false);
    expect(s.skipSelecting).toBe(false);
  });

  it('奇遇节点可进入并做出抉择', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 13 });
    const evNodes = s.map.layers.flat().filter((n) => n.type === 'event');
    expect(evNodes.length).toBeGreaterThanOrEqual(1);
    const evNode = evNodes[0];
    const ev = s.map.events[evNode.id];
    expect(ev).toBeDefined();
    const rowIdx = s.map.layers.findIndex((row) => row.includes(evNode));
    // 若上层存在相邻父节点，走真实 MOVE 进入奇遇
    const parent = rowIdx > 0 ? s.map.layers[rowIdx - 1].find((n) => Math.abs(n.col - evNode.col) <= 1) : undefined;
    if (parent) {
      s = { ...s, screen: 'map', currentRow: rowIdx - 1, currentNodeId: parent.id, gold: 100 };
      s = dispatch(s, { type: 'MOVE', nodeId: evNode.id });
      expect(s.screen).toBe('event');
    } else {
      s = { ...s, screen: 'event', currentRow: rowIdx, currentNodeId: evNode.id, gold: 100 };
    }
    // 选择获得金币的选项（无金币选项时退而选择无花费的收益）
    const choice =
      ev.choices.find((x) => x.kind === 'gold') ??
      ev.choices.find((x) => x.kind === 'heal') ??
      ev.choices[0];
    const goldBefore = s.gold;
    s = dispatch(s, { type: 'EVENT_CHOICE', choiceId: choice.id });
    expect(s.screen).toBe('map');
    if (choice.kind === 'gold') expect(s.gold).toBeGreaterThan(goldBefore);
    // 伤害选项不会杀死宠物
    const damageEv = { ...ev, choices: [{ id: 'x', label: '损伤', desc: '', kind: 'damage' as const, amount: 100 }] };
    s = { ...s, screen: 'event', map: { ...s.map, events: { ...s.map.events, [s.currentNodeId]: damageEv } } };
    const hpBefore = s.roster.map((u) => u.hp);
    s = dispatch(s, { type: 'EVENT_CHOICE', choiceId: 'x' });
    expect(s.screen).toBe('map');
    s.roster.forEach((u) => expect(u.hp).toBeGreaterThanOrEqual(1));
    expect(s.roster.some((u, i) => u.hp < hpBefore[i])).toBe(true);
  });
});

describe('完整肉鸽流程', () => {
  it('从开始到战斗胜利并确认收获', () => {
    const strong = makeUnit('momo_god', true, 0, false);
    let s: GameState = {
      ...createInitialState(),
      screen: 'map',
      seed: 3,
      roster: [strong],
      field: [strong.uid],
    };
    const firstNode = s.map.layers[0][0];
    s = {
      ...s,
      map: {
        ...s.map,
        encounter: {
          ...s.map.encounter,
          [firstNode.id]: [
            { speciesId: 'kiki' },
          ],
        },
      },
    };

    s = dispatch(s, { type: 'MOVE', nodeId: firstNode.id });
    expect(s.screen).toBe('formation');
    expect(s.formation).toBeDefined();

    // 确认布阵进入战斗
    const formed = s.formation!.units;
    s = dispatch(s, { type: 'FORMATION_CONFIRM', units: formed });
    expect(s.screen).toBe('battle');
    expect(s.battle).toBeDefined();

    // 自动打牌直到战斗结束
    let guard = 0;
    while (s.battle && s.battle.phase === 'acting' && guard < 300) {
      const b = s.battle;
      const actable = b.playerUnits.filter((u) => u.hp > 0 && !u.acted && b.playerAp > 0);
      if (actable.length === 0) {
        s = dispatch(s, { type: 'END_TURN' });
      } else {
        const cur = actable[0];
        const target = b.enemyUnits.filter((u) => u.hp > 0)[0];
        s = dispatch(s, { type: 'PLAYER_SKILL', actorUid: cur.uid, skillId: cur.skills[0], targetUid: target?.uid });
      }
      guard += 1;
    }
    expect(s.battle!.phase).toBe('won');
    const goldBefore = s.gold;

    s = dispatch(s, { type: 'BATTLE_END_CONFIRM' });
    expect(s.screen).toBe('reward');
    expect(s.gold).toBeGreaterThan(goldBefore);
    expect(s.roster.length).toBeGreaterThanOrEqual(1);

    s = dispatch(s, { type: 'PICK_REWARD', rewardId: s.rewards[0].id });
    expect(s.screen).toBe('roster');

    s = dispatch(s, { type: 'NEXT_NODE' });
    expect(s.screen).toBe('map');
  });

  it('胜利后阵亡单位从队伍永久移除', () => {
    const starter = makeUnit('momo', true, 0, false);
    const meat = makeUnit('fifi', true, 1, false);
    let s: GameState = {
      ...createInitialState(),
      screen: 'map',
      roster: [starter, meat],
      field: [starter.uid, meat.uid],
      seed: 9,
    };
    const battle = createBattle([starter, meat], [{ speciesId: 'pipi' }], 9);
    // 手动击杀 meat 后获胜
    const meatInBattle = battle.playerUnits.find((u) => u.uid === meat.uid)!;
    meatInBattle.hp = 0;
    const aliveEnemy = battle.enemyUnits.find((u) => u.hp > 0)!;
    aliveEnemy.hp = 0;
    const won = { ...battle, phase: 'won' as const };
    s = resolveBattle(s, won);
    expect(s.roster.some((u) => u.uid === meat.uid)).toBe(false);
    expect(s.roster.some((u) => u.uid === starter.uid)).toBe(true);
  });

  it('战斗胜利后后备（未上场）宠物保留在队伍', () => {
    const starter = makeUnit('momo', true, 0, false);
    const meat = makeUnit('fifi', true, 1, false);
    const backup = makeUnit('lulu', true, 2, false);
    let s: GameState = {
      ...createInitialState(),
      screen: 'map',
      roster: [starter, meat, backup],
      field: [starter.uid, meat.uid],
      seed: 9,
    };
    const battle = createBattle([starter, meat], [{ speciesId: 'pipi' }], 9);
    const aliveEnemy = battle.enemyUnits.find((u) => u.hp > 0)!;
    aliveEnemy.hp = 0;
    const won = { ...battle, phase: 'won' as const };
    s = resolveBattle(s, won);
    expect(s.roster.some((u) => u.uid === backup.uid)).toBe(true);
    expect(s.roster.some((u) => u.uid === starter.uid)).toBe(true);
    expect(s.roster.some((u) => u.uid === meat.uid)).toBe(true);
  });

  it('驯服获得的新宠物会进入队伍', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 5 });
    const battle = createBattle(s.roster.filter((u) => s.field.includes(u.uid)), [{ speciesId: 'momo' }], 5);
    const enemy = battle.enemyUnits[0];
    enemy.hp = Math.floor(enemy.maxHp * 0.1);
    // 直接构造 battle 后 resolve
    const tamed = { ...battle, phase: 'won' as const };
    // 模拟玩家驯服：把敌人加入 pendingTame 再胜利
    tamed.pendingTame.push(makeUnit(enemy.speciesId, true, 2, false));
    s = resolveBattle(s, tamed);
    expect(s.roster.length).toBe(3);
  });

  it('首领战胜利后进入下一层', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 11 });
    // 直接放置首领战状态
    s = { ...s, currentRow: 4, currentNodeId: 'boss1', screen: 'roster' };
    s = { ...s, map: { ...s.map, boss: { boss1: [{ speciesId: 'boss_vine' }] } } };
    s = dispatch(s, { type: 'NEXT_NODE' });
    expect(s.act).toBe(2);
    expect(s.screen).toBe('map');
  });

  it('第三层首领后通关', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 12 });
    s = { ...s, act: 3, currentRow: 4, currentNodeId: 'boss1', screen: 'roster' };
    s = { ...s, map: { ...s.map, boss: { boss1: [{ speciesId: 'boss_fire' }] } } };
    s = dispatch(s, { type: 'NEXT_NODE' });
    expect(s.screen).toBe('victory');
  });

  it('最后一幕首领战胜利直接进入通关界面，不再弹出战利品/队伍界面', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 13 });
    s = { ...s, act: 3, currentRow: 4, currentNodeId: 'boss1' };
    s = { ...s, map: { ...s.map, boss: { boss1: [{ speciesId: 'boss_fire' }] } } };
    const battle = createBattle(s.roster.filter((u) => s.field.includes(u.uid)), [{ speciesId: 'boss_fire' }], 13);
    const aliveEnemy = battle.enemyUnits.find((u) => u.hp > 0)!;
    aliveEnemy.hp = 0;
    s = { ...s, screen: 'battle', battle: { ...battle, phase: 'won' as const } };
    s = dispatch(s, { type: 'BATTLE_END_CONFIRM' });
    expect(s.screen).toBe('victory');
  });

  it('前两幕首领战胜利仍走正常结算（战利品界面）', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 14 });
    s = { ...s, act: 2, currentRow: 4, currentNodeId: 'boss1' };
    s = { ...s, map: { ...s.map, boss: { boss1: [{ speciesId: 'boss_dark' }] } } };
    const battle = createBattle(s.roster.filter((u) => s.field.includes(u.uid)), [{ speciesId: 'boss_dark' }], 14);
    const aliveEnemy = battle.enemyUnits.find((u) => u.hp > 0)!;
    aliveEnemy.hp = 0;
    s = { ...s, screen: 'battle', battle: { ...battle, phase: 'won' as const } };
    s = dispatch(s, { type: 'BATTLE_END_CONFIRM' });
    expect(s.screen).toBe('reward');
  });
});

describe('队伍上限', () => {
  it('招募奖励不会超过队伍上限', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 2 });
    const filler = Array.from({ length: ROSTER_MAX }, () => makeUnit('kiki', true, 0, false));
    s = { ...s, roster: filler };
    const rec = { id: 'r', label: '', desc: '', kind: 'recruit' as const, monsterId: 'mimi' };
    s = { ...s, rewards: [rec], screen: 'reward' };
    s = dispatch(s, { type: 'PICK_REWARD', rewardId: 'r' });
    expect(s.roster.length).toBe(ROSTER_MAX);
  });
});

describe('存档读档', () => {
  it('合法存档可 LOAD_GAME 恢复，非法存档回首页', () => {
    const run = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    const moved = dispatch(run, { type: 'MOVE', nodeId: run.map.layers[0][0].id });
    expect(moved.screen).toBe('formation');

    const restored = dispatch(createInitialState(), { type: 'LOAD_GAME', state: moved });
    expect(restored.screen).toBe('formation');
    expect(restored.seed).toBe(3);
    expect(restored.roster.length).toBe(2);

    const bad = dispatch(createInitialState(), { type: 'LOAD_GAME', state: { seed: 1 } as GameState });
    expect(bad.screen).toBe('title');
  });

  it('isValidGameState 能识别残缺对象', () => {
    expect(isValidGameState(null)).toBe(false);
    expect(isValidGameState({ seed: 1 })).toBe(false);
    const s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 4 });
    expect(isValidGameState(s)).toBe(true);
  });
});

describe('奇遇关', () => {
  const reward = (id: string, kind: SpecialReward['kind'], extra?: Partial<SpecialReward>): SpecialReward => ({
    id,
    label: id,
    desc: 'd',
    kind,
    ...extra,
  });

  /** 构造一个当前位于指定奇遇关节点的状态 */
  function atSpecial(s: GameState, rewards: SpecialReward[]): GameState {
    return {
      ...s,
      screen: 'special',
      currentNodeId: 'sp-test',
      map: { ...s.map, specials: { ...s.map.specials, 'sp-test': { title: '裂隙', desc: '测试', rewards } } },
    };
  }

  it('每幕奇遇关最多 1 个，奖励 3 选 1 且内容完整', () => {
    for (let act = 1; act <= 3; act++) {
      for (const seed of [1, 11, 42]) {
        const map = generateMap(seed, act);
        const sp = map.layers.flat().filter((n) => n.type === 'special');
        expect(sp.length).toBeLessThanOrEqual(1);
        for (const n of sp) {
          const node = map.specials[n.id];
          expect(node).toBeDefined();
          expect(node.rewards.length).toBe(3);
        }
      }
    }
  });

  it('SPECIAL_CHOICE gold 奖励金币并进入队伍界面', () => {
    const s = atSpecial(dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 }), [
      reward('g', 'gold', { amount: 60 }),
    ]);
    const before = s.gold;
    const next = dispatch(s, { type: 'SPECIAL_CHOICE', rewardId: 'g' });
    expect(next.screen).toBe('roster');
    expect(next.gold).toBe(before + 60);
  });

  it('SPECIAL_CHOICE item 获得跳关道具/净化药水/圣果', () => {
    let s = atSpecial(dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 }), [
      reward('i', 'item', { itemId: 'skip' }),
    ]);
    s = dispatch(s, { type: 'SPECIAL_CHOICE', rewardId: 'i' });
    expect(s.inventory.skip).toBe(1);

    s = atSpecial(s, [reward('p', 'item', { itemId: 'purify' })]);
    s = dispatch(s, { type: 'SPECIAL_CHOICE', rewardId: 'p' });
    expect(s.inventory.purify).toBe(1);

    s = atSpecial(s, [reward('f', 'item', { itemId: 'golden_fruit' })]);
    s = dispatch(s, { type: 'SPECIAL_CHOICE', rewardId: 'f' });
    expect(s.inventory.golden_fruit).toBe(1);
  });

  it('进化之光：点选宠物后无视等级进化', () => {
    let s = atSpecial(dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 }), [
      reward('e', 'evolve'),
    ]);
    s = dispatch(s, { type: 'SPECIAL_CHOICE', rewardId: 'e' });
    expect(s.specialPending).toEqual({ kind: 'evolve', super: false });
    const momo = s.roster.find((u) => u.speciesId === 'momo')!;
    s = dispatch(s, { type: 'EVOLVE_ONE', uid: momo.uid });
    const evolved = s.roster.find((u) => u.uid === momo.uid)!;
    expect(evolved.speciesId).toBe('momo_queen');
    expect(s.specialPending).toBeUndefined();
  });

  it('无可进化宠物时进化奖励被拒绝', () => {
    const run = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    const noEvo = { ...run, roster: [makeUnit('custom_fury', true, 0, false)] };
    const s = atSpecial(noEvo, [reward('e', 'evolve')]);
    const next = dispatch(s, { type: 'SPECIAL_CHOICE', rewardId: 'e' });
    expect(next.screen).toBe('special');
  });

  it('超进化：进化并附带随机负面诅咒，净化药水可解除', () => {
    let s = atSpecial(dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 }), [
      reward('x', 'superevolve'),
    ]);
    s = dispatch(s, { type: 'SPECIAL_CHOICE', rewardId: 'x' });
    expect(s.specialPending).toEqual({ kind: 'evolve', super: true });
    const momo = s.roster.find((u) => u.speciesId === 'momo')!;
    s = dispatch(s, { type: 'EVOLVE_ONE', uid: momo.uid });
    const evolved = s.roster.find((u) => u.uid === momo.uid)!;
    expect(evolved.speciesId).toBe('momo_queen');
    expect(['hpDown', 'atkDown', 'spdDown']).toContain(evolved.curse);
    // 净化药水清除诅咒
    s = { ...s, inventory: { ...s.inventory, purify: 1 } };
    s = dispatch(s, { type: 'USE_PURIFY', uid: momo.uid });
    expect(s.roster.find((u) => u.uid === momo.uid)!.curse).toBeUndefined();
    expect(s.inventory.purify).toBe(0);
  });

  it('属性强化：选宠物 → 选属性 → 属性提升', () => {
    let s = atSpecial(dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 }), [
      reward('b', 'boost'),
    ]);
    s = dispatch(s, { type: 'SPECIAL_CHOICE', rewardId: 'b' });
    expect(s.specialPending).toEqual({ kind: 'boost', uid: '' });
    const u = s.roster[0];
    const hp0 = u.maxHp;
    s = dispatch(s, { type: 'SPECIAL_TARGET', uid: u.uid });
    expect(s.screen).toBe('boost');
    s = dispatch(s, { type: 'BOOST_STAT', stat: 'hp' });
    expect(s.screen).toBe('roster');
    expect(s.specialPending).toBeUndefined();
    const boosted = s.roster.find((x) => x.uid === u.uid)!;
    expect(boosted.maxHp).toBe(hp0 + 3);
  });

  it('造物：选择模板后随机技能自创生物加入队伍', () => {
    let s = atSpecial(dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 }), [
      reward('c', 'custom'),
    ]);
    const len0 = s.roster.length;
    s = dispatch(s, { type: 'SPECIAL_CHOICE', rewardId: 'c' });
    expect(s.screen).toBe('custom');
    s = dispatch(s, { type: 'PICK_CUSTOM', presetId: 'custom_fury' });
    expect(s.screen).toBe('roster');
    expect(s.roster.length).toBe(len0 + 1);
    const created = s.roster[s.roster.length - 1];
    expect(created.speciesId).toBe('custom_fury');
    expect(created.skills.length).toBe(3);
  });

  it('USE_SKIP 跳过战斗节点直接结算奖励，首领/非战斗节点拒绝', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 5 });
    const first = s.map.layers[0][0];
    s = { ...s, screen: 'map', inventory: { ...s.inventory, skip: 1 } };
    const gold0 = s.gold;
    s = dispatch(s, { type: 'USE_SKIP', nodeId: first.id });
    expect(s.screen).toBe('reward');
    expect(s.gold).toBe(gold0 + 8);
    expect(s.inventory.skip).toBe(0);
    expect(s.currentNodeId).toBe(first.id);
    expect(s.rewards.length).toBeGreaterThan(0);

    // 首领不可跳过：位置在首领前一行
    const lastRow = s.map.layers.length - 1;
    const prev = s.map.layers[lastRow - 1][0];
    const boss = s.map.layers[lastRow][0];
    s = { ...s, screen: 'map', currentRow: lastRow - 1, currentNodeId: prev.id, inventory: { ...s.inventory, skip: 1 } };
    const g1 = s.gold;
    const after = dispatch(s, { type: 'USE_SKIP', nodeId: boss.id });
    expect(after.inventory.skip).toBe(1);
    expect(after.gold).toBe(g1);

    // 非战斗节点（商人）不可跳过
    const shopNode = s.map.layers.flat().find((n) => n.type === 'shop')!;
    const shopRow = s.map.layers.findIndex((r) => r.includes(shopNode));
    const parent = s.map.layers[shopRow - 1].find((n) => Math.abs(n.col - shopNode.col) <= 1) ?? s.map.layers[shopRow - 1][0];
    s = { ...s, currentRow: shopRow - 1, currentNodeId: parent.id };
    const g2 = s.gold;
    const after2 = dispatch(s, { type: 'USE_SKIP', nodeId: shopNode.id });
    expect(after2.inventory.skip).toBe(1);
    expect(after2.screen).toBe('map');
    expect(after2.gold).toBe(g2);
  });
});

describe('商人·立即休整', () => {
  it('未购买时可花 5 金币回满血并离开，扣金币不解诅咒', () => {
    const run = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    const shopNode = run.map.layers.flat().find((n) => n.type === 'shop')!;
    const row = run.map.layers.findIndex((r) => r.includes(shopNode));
    const parent = run.map.layers[row - 1].find((n) => Math.abs(n.col - shopNode.col) <= 1) ?? run.map.layers[row - 1][0];
    let s: GameState = { ...run, screen: 'map', currentRow: row - 1, currentNodeId: parent.id, gold: 30 };
    s = dispatch(s, { type: 'MOVE', nodeId: shopNode.id });
    expect(s.screen).toBe('shop');
    expect(s.shopBought).toBe(false);
    s = {
      ...s,
      roster: s.roster.map((u, i) => ({ ...u, hp: i === 0 ? 1 : u.hp, curse: i === 0 ? ('atkDown' as const) : u.curse })),
    };
    const gold0 = s.gold;
    const after = dispatch(s, { type: 'SHOP_REST' });
    expect(after.screen).toBe('shop');
    expect(after.gold).toBe(gold0);
    expect(after.shopBought).toBe(true);
    expect(after.roster.every((u) => u.hp === u.maxHp)).toBe(true);
    expect(after.roster.find((u) => u.curse)?.curse).toBe('atkDown');
  });

  it('购买食物后不可再休整，休整后被拒仍停留商店', () => {
    const run = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    const shopNode = run.map.layers.flat().find((n) => n.type === 'shop')!;
    const row = run.map.layers.findIndex((r) => r.includes(shopNode));
    const parent = run.map.layers[row - 1].find((n) => Math.abs(n.col - shopNode.col) <= 1) ?? run.map.layers[row - 1][0];
    let s: GameState = { ...run, screen: 'map', currentRow: row - 1, currentNodeId: parent.id, gold: 30 };
    s = dispatch(s, { type: 'MOVE', nodeId: shopNode.id });
    s = dispatch(s, { type: 'SHOP_BUY', foodId: s.shopStock![0] });
    expect(s.shopBought).toBe(true);
    const after = dispatch(s, { type: 'SHOP_REST' });
    expect(after.screen).toBe('shop');
    expect(after.gold).toBe(s.gold);
  });

  it('金币不足休整被拒，仍停留商店', () => {
    const run = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    const shopNode = run.map.layers.flat().find((n) => n.type === 'shop')!;
    const row = run.map.layers.findIndex((r) => r.includes(shopNode));
    const parent = run.map.layers[row - 1].find((n) => Math.abs(n.col - shopNode.col) <= 1) ?? run.map.layers[row - 1][0];
    let s: GameState = { ...run, screen: 'map', currentRow: row - 1, currentNodeId: parent.id, gold: 3 };
    s = dispatch(s, { type: 'MOVE', nodeId: shopNode.id });
    const after = dispatch(s, { type: 'SHOP_REST' });
    expect(after.screen).toBe('shop');
    expect(after.gold).toBe(3);
  });

  it('旧存档的休整节点仍可用 REST_HEAL 恢复', () => {
    const run = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    const s: GameState = {
      ...run,
      screen: 'rest',
      roster: run.roster.map((u, i) => ({ ...u, hp: i === 0 ? 1 : u.hp })),
    };
    const after = dispatch(s, { type: 'REST_HEAL' });
    expect(after.screen).toBe('roster');
    expect(after.roster.every((u) => u.hp === u.maxHp)).toBe(true);
  });
});

describe('商人·每店限购', () => {
  function enterShop(gold: number): GameState {
    const run = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    const shopNode = run.map.layers.flat().find((n) => n.type === 'shop')!;
    const row = run.map.layers.findIndex((r) => r.includes(shopNode));
    const parent = run.map.layers[row - 1].find((n) => Math.abs(n.col - shopNode.col) <= 1) ?? run.map.layers[row - 1][0];
    return dispatch({ ...run, screen: 'map', currentRow: row - 1, currentNodeId: parent.id, gold }, { type: 'MOVE', nodeId: shopNode.id });
  }

  it('每种物品每次进入商店限购 1 次（重复购买被拒）', () => {
    let s = enterShop(100);
    expect(s.shopBoughtItems).toEqual([]);
    const id = s.shopStock![0];
    const before = s.inventory[id] ?? 0;
    s = dispatch(s, { type: 'SHOP_BUY', foodId: id });
    expect(s.shopBoughtItems).toEqual([id]);
    expect(s.inventory[id]).toBe(before + 1);
    const gold = s.gold;
    const again = dispatch(s, { type: 'SHOP_BUY', foodId: id });
    expect(again.gold).toBe(gold);
    expect(again.inventory[id]).toBe(s.inventory[id]);
    expect(again.shopBoughtItems).toEqual([id]);
  });

  it('不同物品可在同一商店各买 1 次', () => {
    let s = enterShop(100);
    expect(s.shopStock!.length).toBe(4);
    const a = s.shopStock![0];
    const b = s.shopStock![1];
    s = dispatch(s, { type: 'SHOP_BUY', foodId: a });
    s = dispatch(s, { type: 'SHOP_BUY', foodId: b });
    expect(s.shopBoughtItems).toEqual([a, b]);
    expect(s.inventory[a]).toBeGreaterThan(0);
    expect(s.inventory[b]).toBeGreaterThan(0);
  });

  it('重新进入商店节点后重置限购，可再次购买', () => {
    let s = enterShop(100);
    const id = s.shopStock![0];
    s = dispatch(s, { type: 'SHOP_BUY', foodId: id });
    expect(s.shopBoughtItems).toEqual([id]);
    // 离开并再次进入同一商店节点
    const shopNode = s.map.layers[s.currentRow].find((n) => n.id === s.currentNodeId)!;
    const parent = s.map.layers[s.currentRow - 1].find((n) => Math.abs(n.col - shopNode.col) <= 1) ?? s.map.layers[s.currentRow - 1][0];
    s = dispatch({ ...s, screen: 'map', currentRow: s.currentRow - 1, currentNodeId: parent.id }, { type: 'MOVE', nodeId: shopNode.id });
    expect(s.screen).toBe('shop');
    expect(s.shopBoughtItems).toEqual([]);
    expect(s.shopStock).toEqual(expect.arrayContaining([id]));
    const count = s.inventory[id] ?? 0;
    s = dispatch(s, { type: 'SHOP_BUY', foodId: id });
    expect(s.inventory[id]).toBe(count + 1);
  });
});

describe('瞭望塔', () => {
  it('到达瞭望塔停留在地图，可反复打开/关闭查看，再继续前进', () => {
    let run: GameState | null = null;
    let target: MapNode | null = null;
    for (let seed = 1; seed < 300 && !target; seed++) {
      const s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed });
      const n = s.map.layers.flat().find((x) => x.type === 'watchtower');
      if (n) {
        run = s;
        target = n;
      }
    }
    expect(target).not.toBeNull();
    const row = run!.map.layers.findIndex((r) => r.includes(target!));
    const parent = run!.map.layers[row - 1].find((n) => Math.abs(n.col - target!.col) <= 1) ?? run!.map.layers[row - 1][0];
    let s: GameState = { ...run!, screen: 'map', currentRow: row - 1, currentNodeId: parent.id };
    s = dispatch(s, { type: 'MOVE', nodeId: target!.id });
    // 到达后停留在地图，不会强制进入瞭望界面
    expect(s.screen).toBe('map');
    expect(s.currentRow).toBe(row);
    expect(s.currentNodeId).toBe(target!.id);
    // 可反复打开 / 关闭
    s = dispatch(s, { type: 'OPEN_WATCHTOWER' });
    expect(s.screen).toBe('watchtower');
    s = dispatch(s, { type: 'CLOSE_WATCHTOWER' });
    expect(s.screen).toBe('map');
    s = dispatch(s, { type: 'OPEN_WATCHTOWER' });
    expect(s.screen).toBe('watchtower');
    // 从瞭望界面返回地图（同一层），再继续前进
    const after = dispatch(s, { type: 'NEXT_NODE' });
    expect(after.screen).toBe('map');
    expect(after.currentRow).toBe(row);
    const nextParent = run!.map.layers[row + 1].find((n) => Math.abs(n.col - target!.col) <= 1) ?? run!.map.layers[row + 1][0];
    const moved = dispatch(after, { type: 'MOVE', nodeId: nextParent.id });
    expect(moved.currentRow).toBe(row + 1);
  });

  it('瞭望塔在首领关前 3 行内出现概率显著更高（20%）', () => {
    let last3Count = 0;
    let otherCount = 0;
    for (let seed = 1; seed <= 300; seed++) {
      for (let act = 1; act <= 3; act++) {
        const map = generateMap(seed, act);
        const last = map.layers.length - 1;
        for (let r = 1; r < last; r++) {
          const wt = map.layers[r].filter((n) => n.type === 'watchtower').length;
          if (wt === 0) continue;
          if (r >= last - 3) last3Count += wt;
          else otherCount += wt;
        }
      }
    }
    expect(last3Count).toBeGreaterThanOrEqual(60);
    expect(last3Count).toBeGreaterThan(otherCount);
  });

  it('末层多个首领：击败任意一个即可通关本幕', () => {
    let s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 7 });
    const lastRow = s.map.layers.length - 1;
    const bosses = s.map.layers[lastRow];
    expect(bosses.length).toBeGreaterThanOrEqual(2);
    expect(bosses.every((n) => n.type === 'boss')).toBe(true);
    // 站在末层第一个首领节点，模拟击败后通关
    s = { ...s, currentRow: lastRow, currentNodeId: bosses[0].id, screen: 'roster' };
    const next = dispatch(s, { type: 'NEXT_NODE' });
    expect(next.act).toBe(2);
    expect(next.currentRow).toBe(0);
    expect(next.screen).toBe('map');
  });
});

describe('同步双节点', () => {
  /** 找到同时含 sync 节点与相邻父节点的地图状态 */
  function atSyncParent(): { s: GameState; node: MapNode; parent: MapNode } {
    for (let seed = 1; seed < 200; seed++) {
      for (let act = 1; act <= 3; act++) {
        const s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed });
        const map = generateMap(seed, act);
        const node = map.layers.flat().find((n) => n.type === 'sync');
        if (!node) continue;
        const row = map.layers.findIndex((r) => r.includes(node));
        const parent = map.layers[row - 1].find((n) => Math.abs(n.col - node.col) <= 1);
        if (!parent) continue;
        return { s: { ...s, act, map }, node, parent };
      }
    }
    throw new Error('未找到含 sync 节点的地图');
  }

  it('生成：配对节点互指、同行相邻、每幕 1~2 对', () => {
    let pairs = 0;
    for (let act = 1; act <= 3; act++) {
      const map = generateMap(1, act);
      const syncs = map.layers.flat().filter((n) => n.type === 'sync');
      for (const n of syncs) {
        expect(n.pairedId).toBeDefined();
        const p = map.layers.flat().find((m) => m.id === n.pairedId)!;
        expect(p.type).toBe('sync');
        expect(p.pairedId).toBe(n.id);
        expect(Math.abs(p.col - n.col)).toBe(1);
        expect(map.layers.findIndex((r) => r.includes(n))).toBe(map.layers.findIndex((r) => r.includes(p)));
      }
      pairs += syncs.length / 2;
    }
    expect(pairs).toBeGreaterThanOrEqual(3); // 每幕 1~2 对
    expect(pairs).toBeLessThanOrEqual(6);
  });

  it('抵达开启双生宝箱：结果进 chest 界面、配对节点失效不可再进', () => {
    const { s, node, parent } = atSyncParent();
    const pairedId = node.pairedId!;
    const row = s.map.layers.findIndex((r) => r.includes(node));
    let cur: GameState = { ...s, screen: 'map', currentRow: row - 1, currentNodeId: parent.id, gold: 100 };
    cur = dispatch(cur, { type: 'MOVE', nodeId: node.id });
    expect(cur.screen).toBe('chest');
    expect((cur.chestResult ?? []).length).toBe(1);
    expect(cur.map.disabled?.[node.id]).toBe(true);
    expect(cur.map.disabled?.[pairedId]).toBe(true);
    // 从相同父节点无法再进入已失效的配对节点
    const blocked = dispatch({ ...cur, screen: 'map', currentNodeId: parent.id, currentRow: row - 1 }, {
      type: 'MOVE',
      nodeId: pairedId,
    });
    expect(blocked.currentNodeId).toBe(parent.id);
    // chest 界面离开后回地图且清除结果
    const after = dispatch(cur, { type: 'NEXT_NODE' });
    expect(after.screen).toBe('map');
    expect(after.chestResult).toBeUndefined();
  });

  it('持双生符抵达时消耗 1 个并同时开启两个宝箱（侦察符不再参与双开）', () => {
    const { s, node, parent } = atSyncParent();
    const row = s.map.layers.findIndex((r) => r.includes(node));
    let cur: GameState = {
      ...s,
      screen: 'map',
      currentRow: row - 1,
      currentNodeId: parent.id,
      inventory: { ...s.inventory, scout: 1, twin: 1 },
    };
    cur = dispatch(cur, { type: 'MOVE', nodeId: node.id });
    expect(cur.screen).toBe('chest');
    expect((cur.chestResult ?? []).length).toBe(2);
    expect(cur.inventory.scout).toBe(1); // 侦察符只用于查看情报，不参与双开
    expect(cur.inventory.twin).toBe(0); // 只消耗双生符

    // 仅持侦察符不会双开
    const { s: s2, node: node2, parent: parent2 } = atSyncParent();
    const row2 = s2.map.layers.findIndex((r) => r.includes(node2));
    let cur2: GameState = {
      ...s2,
      screen: 'map',
      currentRow: row2 - 1,
      currentNodeId: parent2.id,
      inventory: { ...s2.inventory, scout: 1 },
    };
    cur2 = dispatch(cur2, { type: 'MOVE', nodeId: node2.id });
    expect((cur2.chestResult ?? []).length).toBe(1);
    expect(cur2.inventory.scout).toBe(1);
  });
});

describe('守卫与钥匙门', () => {
  /** 找到同时含 guardian 与 keydoor 且配对完整的地图状态 */
  function atGuardPair(): { s: GameState; guardian: MapNode; keydoor: MapNode } {
    for (let seed = 1; seed < 300; seed++) {
      for (let act = 1; act <= 3; act++) {
        const s = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed });
        const map = generateMap(seed, act);
        const keydoor = map.layers.flat().find((n) => n.type === 'keydoor');
        if (!keydoor || !keydoor.guardianId) continue;
        const guardian = map.layers.flat().find((n) => n.id === keydoor.guardianId);
        if (!guardian || guardian.type !== 'guardian') continue;
        return { s: { ...s, act, map }, guardian, keydoor };
      }
    }
    throw new Error('未找到含守卫/钥匙门配对的节点');
  }

  it('生成：守卫在第 r-1 行、钥匙门在第 r 行且列相邻', () => {
    const { s, guardian, keydoor } = atGuardPair();
    const gRow = s.map.layers.findIndex((r) => r.includes(guardian));
    const dRow = s.map.layers.findIndex((r) => r.includes(keydoor));
    expect(dRow).toBe(gRow + 1);
    expect(Math.abs(keydoor.col - guardian.col)).toBeLessThanOrEqual(1);
    expect(keydoor.guardianId).toBe(guardian.id);
    expect(s.map.encounter[guardian.id]).toBeDefined();
  });

  it('守卫战不可驯服：进入后敌人均不可驯服', () => {
    const { s, guardian, keydoor } = atGuardPair();
    const row = s.map.layers.findIndex((r) => r.includes(guardian));
    const parent = s.map.layers[row - 1].find((n) => Math.abs(n.col - guardian.col) <= 1)!;
    let cur: GameState = { ...s, screen: 'map', currentRow: row - 1, currentNodeId: parent.id };
    cur = dispatch(cur, { type: 'MOVE', nodeId: guardian.id });
    expect(cur.screen).toBe('formation');
    cur = dispatch(cur, { type: 'FORMATION_CONFIRM', units: cur.formation!.units });
    expect(cur.screen).toBe('battle');
    expect(cur.battle!.enemyUnits.every((u) => !isTameable(u))).toBe(true);
    expect(keydoor.guardianId).toBe(guardian.id);
  });

  it('守卫胜利：获得专用钥匙与精英级金币，钥匙门不可用跳关跳过', () => {
    const { s, guardian } = atGuardPair();
    const gRow = s.map.layers.findIndex((r) => r.includes(guardian));
    let cur: GameState = { ...s, screen: 'map', currentRow: gRow, currentNodeId: guardian.id };
    const battle = createBattle(
      cur.roster.filter((u) => cur.field.includes(u.uid)),
      cur.map.encounter[guardian.id]!,
      cur.seed + 5 * 17,
      { untameable: true },
    );
    const gold0 = cur.gold;
    cur = resolveBattle(cur, { ...battle, phase: 'won' });
    expect(cur.inventory[`key_${guardian.id}`]).toBe(1);
    expect(cur.gold).toBe(gold0 + 16);
    // 守卫不可被 USE_SKIP 跳过
    const parent = cur.map.layers[gRow - 1].find((n) => Math.abs(n.col - guardian.col) <= 1)!;
    const skipTry: GameState = { ...cur, screen: 'map', currentRow: gRow - 1, currentNodeId: parent.id, inventory: { ...cur.inventory, skip: 1 } };
    const skipped = dispatch(skipTry, { type: 'USE_SKIP', nodeId: guardian.id });
    expect(skipped.inventory.skip).toBe(1);
    expect(skipped.screen).toBe('map');
  });

  it('钥匙门：无钥匙不可进入，有钥匙进入开启高级宝箱并消耗钥匙', () => {
    const { s, guardian, keydoor } = atGuardPair();
    const dRow = s.map.layers.findIndex((r) => r.includes(keydoor));
    const parent = s.map.layers[dRow - 1].find((n) => Math.abs(n.col - keydoor.col) <= 1)!;
    // 无钥匙：MOVE 被拒
    let cur: GameState = { ...s, screen: 'map', currentRow: dRow - 1, currentNodeId: parent.id, gold: 100 };
    const blocked = dispatch(cur, { type: 'MOVE', nodeId: keydoor.id });
    expect(blocked.currentNodeId).toBe(parent.id);
    expect(blocked.screen).toBe('map');
    // 持钥匙：进入开启高级宝箱
    cur = { ...cur, inventory: { ...cur.inventory, [`key_${guardian.id}`]: 1 } };
    const gold0 = cur.gold;
    cur = dispatch(cur, { type: 'MOVE', nodeId: keydoor.id });
    expect(cur.screen).toBe('chest');
    expect((cur.chestResult ?? []).length).toBe(1);
    expect(cur.inventory[`key_${guardian.id}`]).toBe(0);
    expect(cur.map.disabled?.[keydoor.id]).toBe(true);
    expect(cur.gold).toBeGreaterThanOrEqual(gold0 + 25);
  });

  it('商店随机出售 4 种商品，可购买侦察/双生符等库存中的道具', () => {
    const run = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    const shopNode = run.map.layers.flat().find((n) => n.type === 'shop')!;
    const row = run.map.layers.findIndex((r) => r.includes(shopNode));
    const parent = run.map.layers[row - 1].find((n) => Math.abs(n.col - shopNode.col) <= 1) ?? run.map.layers[row - 1][0];
    let s: GameState = { ...run, screen: 'map', currentRow: row - 1, currentNodeId: parent.id, gold: 100 };
    s = dispatch(s, { type: 'MOVE', nodeId: shopNode.id });
    expect(s.screen).toBe('shop');
    expect(s.shopStock!.length).toBe(4);
    expect([...new Set(s.shopStock!)].length).toBe(4);
    // 购买第一件在售商品，库存 +1、金币减少
    const before = s.gold;
    const buyId = s.shopStock![0];
    const invBefore = s.inventory[buyId] ?? 0;
    s = dispatch(s, { type: 'SHOP_BUY', foodId: buyId });
    expect(s.inventory[buyId]).toBe(invBefore + 1);
    expect(s.gold).toBeLessThan(before);
  });

  it('侦查/瞭望塔的商店情报与实际库存一致（含价格与休整说明）', () => {
    const run = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed: 3 });
    const shopNode = run.map.layers.flat().find((n) => n.type === 'shop')!;
    const row = run.map.layers.findIndex((r) => r.includes(shopNode));
    const parent = run.map.layers[row - 1].find((n) => Math.abs(n.col - shopNode.col) <= 1) ?? run.map.layers[row - 1][0];
    let s: GameState = { ...run, screen: 'map', currentRow: row - 1, currentNodeId: parent.id, gold: 100 };
    s = dispatch(s, { type: 'MOVE', nodeId: shopNode.id });
    const info = nodeInfo(s, shopNode);
    expect(info.title).toBe('商店');
    expect(info.detail).toContain('休整');
    // 情报展示的商品名必须与本次实际库存一致（同一 seed 公式）
    for (const id of s.shopStock ?? []) {
      const name = (FOODS[id] ?? ITEMS[id])?.name;
      expect(info.detail).toContain(name);
    }
  });
});
