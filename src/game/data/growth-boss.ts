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
  baseSpd: 10,
  rank: 4,
  skills: ['growth_strike', 'growth_field', 'roar', 'growth_burst'],
  passive: 'growth_drain',
  desc: '掌握成长奥秘的远古存在，通过汲取对手的成长力量来强化自身。',
};

/** 成长傀儡（小怪）数据 */
export const GROWTH_PUPPET = {
  id: 'growth_puppet',
  name: '成长傀儡',
  emoji: '🤖',
  baseHp: 10,
  baseSpd: 2,
  rank: 4,
  skills: ['claw_attack'],
  passive: undefined,
  desc: '成长之主的傀儡，被击败时不会触发驯服。',
};
