import { describe, it, expect } from 'vitest';
import { makeUnit, createBattle, playerEndTurn } from '../src/game/core/battle';
import { getFearStacks } from '../src/game/core/battle';

describe('炼狱魔君恐惧机制', () => {
  it('boss_demon 攻击应附加恐惧（恐惧凝视=2层+恐惧之王被动1层=3层）', () => {
    const p = makeUnit('momo', true, 0, false);
    p.spd = 1;
    const b = createBattle([p], [{ speciesId: 'boss_demon' }], 1);
    const boss = b.enemyUnits.find((u) => u.speciesId === 'boss_demon')!;
    expect(boss.passive).toBe('fear_lord');

    // Boss 行动（速度7 > 玩家速度1）
    const afterEnemy = playerEndTurn(b);
    const target = afterEnemy.playerUnits.find((u) => u.uid === p.uid)!;
    const fearStacks = getFearStacks(target);
    const fearLogs = afterEnemy.log.filter((e) => e.text.includes('恐惧'));
    expect(fearLogs.length).toBeGreaterThan(0);
    // 恐惧凝视(2层) + 恐惧之王被动(1层) = 3
    expect(fearStacks).toBe(3);
  });
});
