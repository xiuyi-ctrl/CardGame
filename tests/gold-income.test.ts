import { describe, expect, it } from 'vitest';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { parseDualSave } from '../src/ui/persistence';
import type { EventChoice, GameState } from '../src/game/state/game';

const fresh = (relic?: string) => gameReducer(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'kiki', seed: 42, relic });
const income = (state: GameState) => state.runStats!.goldEarned;
function event(state: GameState, choice: EventChoice): GameState {
  return { ...state, screen: 'event', currentNodeId: 'event', map: { ...state.map,
    events: { event: { title: '事件', desc: '', choices: [choice] } } } };
}

describe('全部金币收入统计', () => {
  it('开局及遗物赠金计入首幕，熟练度也记录起始金币', () => {
    expect(income(fresh())).toBe(20);
    expect(income(fresh('traveler_charm'))).toBe(70);
    expect(fresh('traveler_charm').runStats!.actSnapshot.goldEarned).toBe(0);
    const prof = gameReducer(createInitialState(), { type: 'START_PROFICIENCY_PICKED', seed: 42, starterId: 'momo', companionId: 'lulu' });
    expect(income(prof)).toBe(prof.gold);
  });

  it('奖励卡、奇遇、普通事件和释放的收入全部累计，扣款不抵扣', () => {
    let state: GameState = { ...fresh(), screen: 'reward', rewards: [{ id: 'gold', kind: 'gold', label: '', desc: '', amount: 20 }] };
    state = gameReducer(state, { type: 'PICK_REWARD', rewardId: 'gold' });
    expect(income(state)).toBe(40);
    expect(gameReducer(state, { type: 'PICK_REWARD', rewardId: 'gold' })).toBe(state);
    state = { ...state, screen: 'special', currentNodeId: 'special', map: { ...state.map,
      specials: { special: { title: '', desc: '', rewards: [{ id: 'gold', kind: 'gold', label: '', desc: '', amount: 80 }] } } } };
    state = gameReducer(state, { type: 'SPECIAL_CHOICE', rewardId: 'gold' });
    expect(income(state)).toBe(120);
    // 同一选项付10金币再收入30，记录收入30而非净增长20。
    state = event(state, { id: 'gold', label: '', desc: '', kind: 'gold', amount: 30, goldDelta: -10 });
    state = gameReducer(state, { type: 'EVENT_CHOICE', choiceId: 'gold' });
    expect(income(state)).toBe(150);
    state = event(state, { id: 'cost', label: '', desc: '', kind: 'gold', amount: -40 });
    state = gameReducer(state, { type: 'EVENT_CHOICE', choiceId: 'cost' });
    expect(income(state)).toBe(150);
    state = event(state, { id: 'gift', label: '', desc: '', kind: 'none', goldDelta: 20 });
    state = gameReducer(state, { type: 'EVENT_CHOICE', choiceId: 'gift' });
    expect(income(state)).toBe(170);
    state = gameReducer(state, { type: 'DISCARD', uid: state.roster[0].uid });
    expect(income(state)).toBe(175);
  });

  it('孵化放生和满员替换的放生收益计入', () => {
    const before = fresh();
    let state = gameReducer({ ...before, screen: 'event', pendingEventHatch: { monsterId: 'momo', choiceId: 'hatch' } }, { type: 'EVENT_HATCH_CANCEL' });
    expect(income(state)).toBe(25);
    const tame = makeUnit('lulu', true, 0, false);
    state = gameReducer({ ...state, screen: 'tame-overflow', tameOverflow: [tame] }, { type: 'TAME_OVERFLOW_REPLACE', tameUid: tame.uid, discardUid: state.roster[0].uid });
    expect(income(state)).toBe(30);
  });

  it('跳关和事件战斗计入，普通胜利不会重复统计', () => {
    const before = fresh();
    const node = { id: 'skip', type: 'battle' as const, col: 0, label: '' };
    const skipped = gameReducer({ ...before, currentNodeId: '', map: { ...before.map, layers: [[node]] } }, { type: 'USE_SKIP', nodeId: node.id, free: true });
    expect(income(skipped) - income(before)).toBe(skipped.gold - before.gold);
    expect(skipped.gold).toBeGreaterThan(before.gold);
    const battle = createBattle(before.roster, [{ speciesId: 'momo' }], 42);
    battle.phase = 'won';
    const won: GameState = { ...before, screen: 'battle', battle };
    const settled = gameReducer(won, { type: 'BATTLE_END_CONFIRM' });
    expect(income(settled) - income(before)).toBe(settled.gold - before.gold);
    expect(gameReducer(settled, { type: 'BATTLE_END_CONFIRM' })).toBe(settled);
    const eventWon: GameState = { ...won, eventBattle: { enemies: [{ speciesId: 'momo' }], reward: { kind: 'gold', amount: 33 }, penalty: {} } };
    expect(income(gameReducer(eventWon, { type: 'BATTLE_END_CONFIRM' })) - income(before)).toBe(33);
  });

  it('退款、读档、查看页面不计收入；幕间快照分开累计，旧统计不回填', () => {
    const before = fresh();
    before.roster[0].extraSkillSlots = 3;
    const refunded = gameReducer({ ...before, specialPending: { kind: 'shopSlotUnlock', uid: before.roster[0].uid, slot: 5 } }, { type: 'PROF_SHOP_EFFECT', uid: before.roster[0].uid });
    expect(refunded.gold - before.gold).toBe(50);
    expect(income(refunded)).toBe(income(before));
    const nextAct = gameReducer({ ...before, screen: 'inter_act' }, { type: 'INTER_ACT_CONTINUE' });
    expect(nextAct.runStats!.actSnapshot.goldEarned).toBe(income(before));
    const loaded = gameReducer(createInitialState(), { type: 'LOAD_GAME', state: parseDualSave(JSON.stringify(nextAct))!.main! });
    expect(income(loaded)).toBe(income(nextAct));
    const legacy = { ...before, runStats: { ...before.runStats!, goldEarned: 7 } };
    expect(income(gameReducer(before, { type: 'LOAD_GAME', state: legacy }))).toBe(7);
  });
});
