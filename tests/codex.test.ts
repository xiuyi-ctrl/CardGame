import { describe, it, expect } from 'vitest';
import { MONSTERS, getMonster } from '../src/game/data/monsters';
import { getSkill } from '../src/game/data/skills';
import { getPassive } from '../src/game/data/passives';
import { computeStats } from '../src/game/core/battle';

describe('生物图鉴数据', () => {
  const all = Object.values(MONSTERS);

  it('每只生物都有图鉴说明 desc', () => {
    for (const m of all) {
      expect(m.desc, `${m.id} 缺少图鉴说明`).toBeTruthy();
    }
  });

  it('每只生物都有可解析的专属被动', () => {
    for (const m of all) {
      expect(getPassive(m.passive), `${m.id} 被动无效`).toBeDefined();
    }
  });

  it('每只生物的技能均可解析且属性为正', () => {
    for (const m of all) {
      for (const sid of m.skills) {
        expect(getSkill(sid), `${m.id} 技能 ${sid} 无效`).toBeDefined();
      }
      const stats = computeStats(m.id);
      expect(stats.maxHp).toBeGreaterThan(0);
      expect(stats.spd).toBeGreaterThan(0);
    }
  });

  it('造物与首领不可进化，驯服难度区分首领', () => {
    for (const m of all) {
      const canFuse = m.evolutions && m.evolutions.length > 0;
      if (m.id.startsWith('custom_') || m.rank === 4) {
        expect(canFuse, `${m.id} 不应可融合`).toBeFalsy();
      }
    }
    expect(getMonster('boss_demon').tame.difficulty).toBe(0);
  });
});
