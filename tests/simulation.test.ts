import { describe, it, expect } from 'vitest';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import type { GameAction } from '../src/game/state/reducer';
import type { GameState } from '../src/game/state/game';
import { getActablePlayerUnits, isTameable, playerHasMove, skillUsesLeft } from '../src/game/core/battle';
import { canStepTo, canTameEnemy, nextStage, ROSTER_MAX, type MapNode } from '../src/game/state/game';
import { getSkill } from '../src/game/data/skills';
import { FOODS } from '../src/game/data/foods';

function dispatch(s: GameState, a: GameAction): GameState {
  return gameReducer(s, a);
}

/** 鑷姩鐜╁锛氭寜 AP 妯″瀷閫夋嫨鍗曚綋浼ゅ鏈€楂樼殑鎶€鑳斤紝闆嗙伀琛€閲忔渶浣庣殑鍙揪鏁屼汉锛屼綆琛€鏁屽彲椹垯椹?*/
function botBattleStep(s: GameState): GameState {
  const b = s.battle!;
  if (b.phase === 'won' || b.phase === 'lost') return s;
  // 杞﹁疆鎴橈細鍦轰笂涓€鏂瑰叏鐏緟鎹汉 鈫?鍏堟崲浜猴紙妯℃嫙 UI 鍦ㄦ浜″姩鐢绘挱瀹屽悗鑷姩瑙﹀彂锛?
  if (b.pendingSwap?.player || b.pendingSwap?.enemy) {
    return dispatch(s, { type: 'GAUNTLET_SWAP' });
  }
  if (!playerHasMove(b)) {
    return dispatch(s, { type: 'END_TURN' });
  }
  const cur = getActablePlayerUnits(b)[0];
  if (!cur) return dispatch(s, { type: 'END_TURN' });

  const tameTarget = b.enemyUnits
    .filter((u) => u.hp > 0 && canTameEnemy(u) && isTameable(u) && u.hp / u.maxHp <= 0.25)
    .sort((a, c) => a.hp - c.hp)[0];
  const foods = Object.entries(s.inventory).filter(([id, c]) => c > 0 && FOODS[id]);
  if (tameTarget && foods.length > 0) {
    const foodId = foods[0][0];
    return dispatch(s, { type: 'PLAYER_TAME', foodId, enemyUid: tameTarget.uid });
  }

  const heal = cur.skills.map(getSkill).find((x) => x.kind === 'heal' && skillUsesLeft(cur, x.id) > 0);
  if (heal) {
    const ally = [...b.playerUnits]
      .filter((u) => u.hp > 0)
      .sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0];
    if (ally && ally.hp / ally.maxHp < 0.5) {
      return dispatch(s, { type: 'PLAYER_SKILL', actorUid: cur.uid, skillId: heal.id, targetUid: ally.uid });
    }
  }

  const skillIds = cur.skills
    .map((id) => ({ id, def: getSkill(id) }))
    .filter((x) => x.def.target !== 'self' && skillUsesLeft(cur, x.id) > 0)
    .sort((a, c) => (c.def.damage ?? 0) - (a.def.damage ?? 0));
  const usableFallback = cur.skills.find((id) => skillUsesLeft(cur, id) > 0);
  const chosen =
    skillIds[0] ??
    (usableFallback ? { id: usableFallback, def: getSkill(usableFallback) } : { id: cur.skills[0], def: getSkill(cur.skills[0]) });
  if (chosen.def.target === 'all') {
    return dispatch(s, { type: 'PLAYER_SKILL', actorUid: cur.uid, skillId: chosen.id });
  }
  // 閫夋嫨鍙揪鐩爣锛堣€冭檻鍓嶅悗鎺掍繚鎶や笌瀹氫綅鎶€鑳斤級
  const enemies = b.enemyUnits.filter((u) => u.hp > 0);
  const front = enemies.filter((u) => u.row === 'front');
  const back = enemies.filter((u) => u.row === 'back');
  const reach = chosen.def.reach ?? 'front';
  const pool =
    chosen.def.target === 'single'
      ? reach === 'direct'
        ? enemies
        : reach === 'back'
          ? back.length > 0
            ? back
            : front
          : front.length > 0
            ? front
            : back
      : enemies;
  const victim = [...pool].sort((a, c) => a.hp - c.hp)[0];
  return dispatch(s, { type: 'PLAYER_SKILL', actorUid: cur.uid, skillId: chosen.id, targetUid: victim?.uid });
}

function simulate(seed: number): { result: 'victory' | 'gameover' | 'stuck'; detail: string; specials: number } {
  let s: GameState = dispatch(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'kiki', seed });
  let steps = 0;
  let specials = 0;
  while (steps < 600) {
    steps += 1;
    if (s.screen === 'victory') return { result: 'victory', detail: '', specials };
    if (s.screen === 'gameover')
      return { result: 'gameover', detail: `act=${s.act} row=${s.currentRow} roster=${s.roster.length} hp=${s.roster.map((u) => u.hp).join(',')}`, specials };

    switch (s.screen) {
      case 'inter_act': {
        s = dispatch(s, { type: 'INTER_ACT_CONTINUE' });
        continue;
      }
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
        // 鍙€冭檻鍙埌杈剧殑鑺傜偣锛堝嚭鍙戝眰浠绘剰鑺傜偣锛屾鍚?col卤1锛涘け鏁堣妭鐐逛笌鏈寔閽ュ寵鐨勯挜鍖欓棬涓嶅彲鍒拌揪锛?
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
      case 'formation': {
        s = dispatch(s, { type: 'FORMATION_CONFIRM', units: s.formation!.units });
        break;
      }
      case 'gauntlet-order': {
        s = dispatch(s, { type: 'GAUNTLET_ORDER_CONFIRM', units: s.gauntletOrder ?? [] });
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
        // 杩囨护涔颁笉璧风殑鑺辫垂閫夐」锛岄伩鍏嶄簨浠剁晫闈㈠崱姝?
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

describe('鏁村眬妯℃嫙锛堣嚜鍔ㄧ帺瀹讹級', () => {
  it('澶氬眬涓嶅穿婧冦€佹棤姝诲惊鐜紝涓斿瓨鍦ㄩ€氬叧', () => {
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
    expect(results.stuck).toBeLessThanOrEqual(5);
    expect(results.gameover).toBeGreaterThan(0);
    expect(specials).toBeGreaterThan(0);
  });
});

