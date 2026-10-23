// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { createBattle, makeUnit, playerEndTurn } from '../src/game/core/battle';
import { useBattleFx } from '../src/ui/battleFx';
import type { BattleState } from '../src/game/types';

describe('全灭终止后续结算与动画', () => {
  it('DOT使最后一名我方阵亡后，不再执行敌方DOT与回合回复', () => {
    const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'lulu' }], 1);
    b.playerUnits[0] = { ...b.playerUnits[0], hp: 1, statuses: [{ kind: 'burn', value: 2, turns: 2 }] };
    b.enemyUnits[0] = { ...b.enemyUnits[0], hp: 5, acted: true, skills: [], statuses: [{ kind: 'poison', value: 2, turns: 2 }] };
    const after = playerEndTurn(b);
    expect(after.phase).toBe('lost');
    expect(after.enemyUnits[0].hp).toBe(5);
    expect(after.log.some(e => e.text.includes('中毒'))).toBe(false);
  });

  it.each(['won', 'lost'] as const)('%s终结伤害之后的动画不播放，终结动画仍播完', phase => {
    vi.useFakeTimers();
    try {
      const b = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'momo' }], 1);
      const actor = phase === 'won' ? b.playerUnits[0] : b.enemyUnits[0];
      const target = phase === 'won' ? b.enemyUnits[0] : b.playerUnits[0];
      const hp = { [actor.uid]: actor.hp, [target.uid]: 0 };
      const after: BattleState = { ...b, phase,
        playerUnits: b.playerUnits.map(u => u.uid === target.uid ? { ...u, hp: 0 } : u),
        enemyUnits: b.enemyUnits.map(u => u.uid === target.uid ? { ...u, hp: 0 } : u),
        log: [...b.log,
          { text: `${actor.name} 使用「爪击」攻击 ${target.name}，造成 99 伤害`, side: actor.isPlayer ? 'player' : 'enemy', actorUid: actor.uid, targetUid: target.uid, hp },
          { text: `${actor.name} 恢复 2 点生命`, side: actor.isPlayer ? 'player' : 'enemy', targetUid: actor.uid, hp }],
      };
      const { result, rerender } = renderHook(({ battle }) => useBattleFx(battle), { initialProps: { battle: b } });
      rerender({ battle: after });
      act(() => { vi.advanceTimersByTime(1); });
      expect(result.current.animating).toBe(true);
      expect(result.current.pops.some(p => p.heal)).toBe(false);
      while (vi.getTimerCount()) {
        act(() => { vi.advanceTimersToNextTimer(); });
        expect(result.current.pops.some(p => p.heal)).toBe(false);
      }
      expect(result.current.animating).toBe(false);
      expect(result.current.revealedLogLen).toBe(after.log.length);
    } finally { cleanup(); vi.useRealTimers(); }
  });
});
