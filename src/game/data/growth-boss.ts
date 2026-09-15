/**
 * 成长远征模式 - 最终首领：成长之主
 * Boss/小怪元数据（技能和被动定义在 skills.ts / passives.ts）
 */

/** 成长之主Boss数据 */
export const GROWTH_MASTER = {
  id: 'growth_master',
  name: '成长之主',
  emoji: '🐉',
  baseHp: 80,
  baseSpd: 8,
  rank: 4,
  skills: ['growth_bind', 'growth_roar', 'growth_ultimate', 'growth_impact', 'growth_eruption', 'growth_summon'],
  passive: 'growth_value',
  desc: '掌握成长奥秘的远古存在，通过累积成长值强化自身并召唤傀儡作战。',
  growthValue: 5, // 初始成长值
};

/** 成长傀儡（小怪）数据 */
export const GROWTH_PUPPET = {
  id: 'growth_puppet',
  name: '成长傀儡',
  emoji: '🤖',
  baseHp: 10,
  baseSpd: 2,
  rank: 4,
  skills: ['puppet_bind', 'puppet_fist', 'puppet_soul_return'],
  passive: 'sacrifice',
  desc: '成长之主的傀儡，献祭自身为成长之主提供成长值。',
};
