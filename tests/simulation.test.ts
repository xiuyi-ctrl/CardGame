import { describe, it, expect } from 'vitest';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import type { GameAction } from '../src/game/state/reducer';
import type { GameState } from '../src/game/state/game';
import { currentPlayerUnit, isTameable } from '../src/game/core/battle';
import { canTameEnemy } from '../src/game/state/game';
import { getSkill } from '../src/game/data/skills';

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
  const hasFood = Object.values(s.inventory).some((c) => c > 0);
  if (tameTarget && hasFood) {
    const foodId = Object.entries(s.inventory).find(([, c]) => c > 0)![0];
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
    .sort((a, c) => c.def.power - a.def.power);
  const chosen = skillIds[0] ?? { id: cur.skills[0], def: getSkill(cur.skills[0]) };
  const targets = b.enemyUnits.filter((u) => u.hp > 0);
  if (chosen.def.target === 'all') {
    return dispatch(s, { type: 'PLAYER_SKILL', skillId: chosen.id });
  }
  const victim = [...targets].sort((a, c) => a.hp - c.hp)[0];
  return dispatch(s, { type: 'PLAYER_SKILL', skillId: chosen.id, targetUid: victim?.uid });
}

function simulate(seed: number): { result: 'victory' | 'gameover' | 'stuck'; detail: string } {
  let s: GameState = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', seed });
  let steps = 0;
  while (steps < 600) {
    steps += 1;
    if (s.screen === 'victory') return { result: 'victory', detail: '' };
    if (s.screen === 'gameover')
      return { result: 'gameover', detail: `act=${s.act} row=${s.currentRow} roster=${s.roster.length} rosterLv=${s.roster.map((u) => u.level).join(',')}` };

    switch (s.screen) {
      case 'map': {
        const best = [...s.roster]
          .sort((a, c) => c.maxHp + c.atk - (a.maxHp + a.atk))
          .slice(0, 3)
          .map((u) => u.uid);
        if (best.length > 0 && s.field.join(',') !== best.join(',')) s = dispatch(s, { type: 'SET_FIELD', uids: best });
        const row = s.currentNodeId === '' ? s.currentRow : s.currentRow + 1;
        const nodes = s.map.layers[row];
        if (!nodes || nodes.length === 0) {
          s = dispatch(s, { type: 'NEXT_NODE' });
          continue;
        }
        // 只考虑与当前节点相邻的节点（col±1）
        const currentCol =
          s.currentNodeId === ''
            ? null
            : (s.map.layers[s.currentRow]?.find((n) => n.id === s.currentNodeId)?.col ?? null);
        const adjacent = nodes.filter(
          (n) =>
            currentCol === null ||
            typeof n.col !== 'number' ||
            typeof currentCol !== 'number' ||
            Math.abs(n.col - currentCol) <= 1,
        );
        if (adjacent.length === 0) {
          s = dispatch(s, { type: 'NEXT_NODE' });
          continue;
        }
        const wounded = s.roster.some((u) => u.hp / u.maxHp < 0.6);
        const restNode = adjacent.find((n) => n.type === 'rest');
        const battleNode = adjacent.find((n) => n.type === 'battle' || n.type === 'elite');
        const eventNode = adjacent.find((n) => n.type === 'event');
        const chosen = (wounded && restNode) || battleNode || eventNode || adjacent[0];
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
        s = dispatch(s, { type: 'NEXT_NODE' });
        break;
      }
      case 'shop': {
        if (s.gold >= 14) s = dispatch(s, { type: 'SHOP_BUY', foodId: 'gem' });
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
        const priority = ['recruit', 'heal', 'exp', 'gold', 'food', 'none'];
        const pick =
          ev.choices.find((c) => priority.includes(c.kind)) ??
          ev.choices.find((c) => c.kind === 'none') ??
          ev.choices[0];
        s = dispatch(s, { type: 'EVENT_CHOICE', choiceId: pick.id });
        break;
      }
      default:
        return { result: 'stuck', detail: `unknown screen ${s.screen}` };
    }
  }
  return {
    result: 'stuck',
    detail: `screen=${s.screen} act=${s.act} row=${s.currentRow} roster=${s.roster.length} battlePhase=${s.battle?.phase}`,
  };
}

describe('整局模拟（自动玩家）', () => {
  it('多局不崩溃、无死循环，且存在通关', () => {
    const results = { victory: 0, gameover: 0, stuck: 0 };
    for (let seed = 2000; seed < 2020; seed++) {
      const r = simulate(seed);
      if (r.result !== 'victory') {
        // eslint-disable-next-line no-console
        console.log(`[${r.result} seed=${seed}] ${r.detail}`);
      }
      results[r.result] += 1;
    }
    // eslint-disable-next-line no-console
    console.log(`STAT: victory=${results.victory} gameover=${results.gameover} stuck=${results.stuck}`);
    expect(results.stuck).toBe(0);
    expect(results.victory).toBeGreaterThan(0);
  });
});
