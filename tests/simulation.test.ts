import { describe, it, expect } from 'vitest';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import type { GameAction } from '../src/game/state/reducer';
import type { GameState } from '../src/game/state/game';
import { currentPlayerUnit, isTameable } from '../src/game/core/battle';
import { canStepTo, canTameEnemy, nextStage, ROSTER_MAX, type MapNode } from '../src/game/state/game';
import { getSkill } from '../src/game/data/skills';
import { FOODS } from '../src/game/data/foods';

function dispatch(s: GameState, a: GameAction): GameState {
  return gameReducer(s, a);
}

/** 自动玩家：选择单体伤害最高的技能，集火血量最低的敌人，低血敌可驯则驯 */
function botBattleStep(s: GameState): GameState {
  const b = s.battle!;
  if (b.phase === 'won' || b.phase === 'lost') return s;
  const cur = currentPlayerUnit(b);
  if (!cur) return s;

  const tameTarget = b.enemyUnits
    .filter((u) => u.hp > 0 && canTameEnemy(u) && isTameable(u) && u.hp / u.maxHp <= 0.25)
    .sort((a, c) => a.hp - c.hp)[0];
  const foods = Object.entries(s.inventory).filter(([id, c]) => c > 0 && FOODS[id]);
  if (tameTarget && foods.length > 0) {
    const foodId = foods[0][0];
    return dispatch(s, { type: 'PLAYER_TAME', foodId, enemyUid: tameTarget.uid });
  }

  const heal = cur.skills.map(getSkill).find((x) => x.kind === 'heal');
  if (heal) {
    const ally = [...b.playerUnits]
      .filter((u) => u.hp > 0)
      .sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0];
    if (ally && ally.hp / ally.maxHp < 0.5) {
      return dispatch(s, { type: 'PLAYER_SKILL', skillId: heal.id, targetUid: ally.uid });
    }
  }

  const skillIds = cur.skills
    .map((id) => ({ id, def: getSkill(id) }))
    .filter((x) => x.def.target !== 'self')
    .sort((a, c) => (c.def.damage ?? 0) - (a.def.damage ?? 0));
  const chosen = skillIds[0] ?? { id: cur.skills[0], def: getSkill(cur.skills[0]) };
  const targets = b.enemyUnits.filter((u) => u.hp > 0);
  if (chosen.def.target === 'all') {
    return dispatch(s, { type: 'PLAYER_SKILL', skillId: chosen.id });
  }
  const victim = [...targets].sort((a, c) => a.hp - c.hp)[0];
  return dispatch(s, { type: 'PLAYER_SKILL', skillId: chosen.id, targetUid: victim?.uid });
}

function simulate(seed: number): { result: 'victory' | 'gameover' | 'stuck'; detail: string; specials: number } {
  let s: GameState = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed });
  let steps = 0;
  let specials = 0;
  while (steps < 600) {
    steps += 1;
    if (s.screen === 'victory') return { result: 'victory', detail: '', specials };
    if (s.screen === 'gameover')
      return { result: 'gameover', detail: `act=${s.act} row=${s.currentRow} roster=${s.roster.length} hp=${s.roster.map((u) => u.hp).join(',')}`, specials };

    switch (s.screen) {
      case 'map': {
        const best = [...s.roster]
          .sort((a, c) => c.maxHp - a.maxHp)
          .slice(0, 3)
          .map((u) => u.uid);
        if (best.length > 0 && s.field.join(',') !== best.join(',')) s = dispatch(s, { type: 'SET_FIELD', uids: best });
        const row = s.currentNodeId === '' ? s.currentRow : s.currentRow + 1;
        const nodes = s.map.layers[row];
        if (!nodes || nodes.length === 0) {
          s = dispatch(s, { type: 'NEXT_NODE' });
          continue;
        }
        // 只考虑可到达的节点（出发层任意节点，此后 col±1；失效节点与未持钥匙的钥匙门不可到达）
        const currentCol =
          s.currentNodeId === ''
            ? null
            : (s.map.layers[s.currentRow]?.find((n) => n.id === s.currentNodeId)?.col ?? null);
        const hasKey = (n: MapNode) =>
          n.guardianId ? (s.inventory[`key_${n.guardianId}`] ?? 0) > 0 : false;
        const adjacent = nodes.filter(
          (n) => canStepTo(s.currentRow, currentCol, n, s.map) && !(n.type === 'keydoor' && !hasKey(n)),
        );
        if (adjacent.length === 0) {
          s = dispatch(s, { type: 'NEXT_NODE' });
          continue;
        }
        const wounded = s.roster.some((u) => u.hp / u.maxHp < 0.6);
        const restNode = adjacent.find((n) => n.type === 'rest' || n.type === 'shop');
        const specialNode = adjacent.find((n) => n.type === 'special');
        const battleNode = adjacent.find(
          (n) => n.type === 'battle' || n.type === 'elite' || n.type === 'arena' || n.type === 'gauntlet' || n.type === 'corrupted' || n.type === 'guardian',
        );
        const eventNode = adjacent.find((n) => n.type === 'event');
        const chosen = (wounded && restNode) || specialNode || battleNode || eventNode || adjacent[0];
        s = dispatch(s, { type: 'MOVE', nodeId: chosen.id });
        break;
      }
      case 'battle': {
        if (!s.battle) {
          s = dispatch(s, { type: 'BATTLE_END_CONFIRM' });
          break;
        }
        if (s.battle.phase === 'won') {
          s = dispatch(s, { type: 'BATTLE_END_CONFIRM' });
          break;
        }
        if (s.battle.phase === 'lost') {
          s = dispatch(s, { type: 'BATTLE_END_CONFIRM' });
          break;
        }
        s = botBattleStep(s);
        break;
      }
      case 'reward': {
        const wounded = s.roster.some((u) => u.hp / u.maxHp < 0.7);
        const heal = s.rewards.find((r) => r.kind === 'heal');
        const recruit = s.rewards.find((r) => r.kind === 'recruit');
        const food = s.rewards.find((r) => r.kind === 'food');
        const pick = (wounded && heal) || recruit || food || s.rewards[0];
        s = dispatch(s, { type: 'PICK_REWARD', rewardId: pick?.id ?? '' });
        break;
      }
      case 'roster': {
        if (s.specialPending?.kind === 'evolve') {
          const target = s.roster.find((u) => nextStage(u.speciesId));
          if (target) {
            s = dispatch(s, { type: 'EVOLVE_ONE', uid: target.uid });
            break;
          }
        }
        if (s.specialPending?.kind === 'boost') {
          const t = s.roster[0];
          if (t) {
            s = dispatch(s, { type: 'SPECIAL_TARGET', uid: t.uid });
            break;
          }
        }
        if (s.specialPending?.kind === 'arena') {
          const t = [...s.roster].sort((a, c) => c.maxHp - a.maxHp)[0];
          if (t) {
            s = dispatch(s, { type: 'SPECIAL_TARGET', uid: t.uid });
            break;
          }
        }
        s = dispatch(s, { type: 'NEXT_NODE' });
        break;
      }
      case 'shop': {
        if (s.shopBought !== true && s.gold >= 5 && s.roster.some((u) => u.hp / u.maxHp < 0.5)) {
          s = dispatch(s, { type: 'SHOP_REST' });
          break;
        }
        if (s.gold >= 14 && (s.shopStock ?? []).includes('gem')) s = dispatch(s, { type: 'SHOP_BUY', foodId: 'gem' });
        s = dispatch(s, { type: 'NEXT_NODE' });
        break;
      }
      case 'rest': {
        s = dispatch(s, { type: 'REST_HEAL' });
        break;
      }
      case 'event': {
        const ev = s.map.events[s.currentNodeId];
        if (!ev) {
          s = dispatch(s, { type: 'NEXT_NODE' });
          break;
        }
        // 过滤买不起的花费选项，避免事件界面卡死
        const affordable = ev.choices.filter((c) => (c.goldDelta ?? 0) >= 0 || s.gold + (c.goldDelta ?? 0) >= 0);
        const pool = affordable.length > 0 ? affordable : ev.choices;
        const priority = ['recruit', 'heal', 'food', 'none', 'gold'];
        const pick = pool.find((c) => priority.includes(c.kind)) ?? pool.find((c) => c.kind === 'none') ?? pool[0];
        s = dispatch(s, { type: 'EVENT_CHOICE', choiceId: pick.id });
        break;
      }
      case 'special': {
        specials += 1;
        const sp = s.map.specials[s.currentNodeId];
        if (!sp) {
          s = dispatch(s, { type: 'NEXT_NODE' });
          break;
        }
        const hasEvolvable = s.roster.some((u) => nextStage(u.speciesId));
        const rosterFull = s.roster.length >= ROSTER_MAX;
        const valid = sp.rewards.filter(
          (r) =>
            !((r.kind === 'evolve' || r.kind === 'superevolve') && !hasEvolvable) &&
            !(r.kind === 'custom' && rosterFull),
        );
        const order = ['gold', 'item', 'evolve', 'boost', 'custom', 'superevolve'];
        const best = [...valid].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0] ?? valid[0];
        s = dispatch(s, { type: 'SPECIAL_CHOICE', rewardId: best.id });
        break;
      }
      case 'custom': {
        s = dispatch(s, { type: 'PICK_CUSTOM', presetId: 'custom_fury' });
        break;
      }
      case 'boost': {
        s = dispatch(s, { type: 'BOOST_STAT', stat: 'hp' });
        break;
      }
      case 'watchtower': {
        s = dispatch(s, { type: 'NEXT_NODE' });
        break;
      }
      case 'chest': {
        s = dispatch(s, { type: 'NEXT_NODE' });
        break;
      }
      case 'backpack': {
        s = dispatch(s, { type: 'CLOSE_BACKPACK' });
        break;
      }
      case 'tame-overflow': {
        const t = (s.tameOverflow ?? [])[0];
        if (t) {
          s = dispatch(s, { type: 'TAME_OVERFLOW_DISCARD', tameUid: t.uid });
          break;
        }
        s = dispatch(s, { type: 'NEXT_NODE' });
        break;
      }
      default:
        return { result: 'stuck', detail: `unknown screen ${s.screen}`, specials };
    }
  }
  return {
    result: 'stuck',
    detail: `screen=${s.screen} act=${s.act} row=${s.currentRow} roster=${s.roster.length} battlePhase=${s.battle?.phase}`,
    specials,
  };
}

describe('整局模拟（自动玩家）', () => {
  it('多局不崩溃、无死循环，且存在通关', () => {
    const results = { victory: 0, gameover: 0, stuck: 0 };
    let specials = 0;
    for (let seed = 2000; seed < 2020; seed++) {
      const r = simulate(seed);
      specials += r.specials;
      if (r.result !== 'victory') {
        // eslint-disable-next-line no-console
        console.log(`[${r.result} seed=${seed}] ${r.detail}`);
      }
      results[r.result] += 1;
    }
    // eslint-disable-next-line no-console
    console.log(`STAT: victory=${results.victory} gameover=${results.gameover} stuck=${results.stuck} specials=${specials}`);
    expect(results.stuck).toBe(0);
    expect(results.victory).toBeGreaterThan(0);
    expect(specials).toBeGreaterThan(0);
  });
});
