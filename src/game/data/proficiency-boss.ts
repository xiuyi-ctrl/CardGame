/**
 * 熟练度远征模式 - 最终首领：熟练之主
 * 包含Boss数据、小怪数据、技能定义
 */

/** 熟练之主Boss数据 */
export const PROFICIENCY_MASTER = {
  id: 'proficiency_master',
  name: '熟练之主',
  emoji: '🐉',
  baseHp: 60,
  baseSpd: 6,
  rank: 4,
  skills: ['proficiency_strike', 'proficiency_field', 'roar', 'proficiency_burst'],
  passive: 'proficiency_drain',
  desc: '精通战斗技艺的远古存在，通过汲取对手的熟练度来强化自身。',
};

/** 熟练傀儡（小怪）数据 */
export const PROFICIENCY_PUPPET = {
  id: 'proficiency_puppet',
  name: '熟练傀儡',
  emoji: '🤖',
  baseHp: 15,
  baseSpd: 2,
  rank: 4,
  skills: ['claw_attack'],
  passive: undefined,
  desc: '熟练之主的傀儡，被击败时不会触发驯服。',
};

/** Boss技能定义 */
export const PROFICIENCY_BOSS_SKILLS = {
  proficiency_strike: {
    id: 'proficiency_strike',
    name: '熟练冲击',
    desc: '造成 8 点伤害',
    damage: 8,
    kind: 'attack' as const,
    target: 'enemy' as const,
  },
  proficiency_field: {
    id: 'proficiency_field',
    name: '熟练领域',
    desc: '全体己方 +2 伤害，持续 2 回合',
    kind: 'buff' as const,
    target: 'ally_all' as const,
    effects: [{ kind: 'atkUp', value: 2, turns: 2 }],
  },
  proficiency_burst: {
    id: 'proficiency_burst',
    name: '熟练爆发',
    desc: '造成 12 点伤害（消耗自身 3 生命）',
    damage: 12,
    kind: 'attack' as const,
    target: 'enemy' as const,
    selfDamage: 3,
  },
  claw_attack: {
    id: 'claw_attack',
    name: '爪击',
    desc: '造成 3 点伤害',
    damage: 3,
    kind: 'attack' as const,
    target: 'enemy' as const,
  },
};

/** Boss被动：熟练汲取 */
export const PROFICIENCY_DRAIN_PASSIVE = {
  id: 'proficiency_drain',
  name: '熟练汲取',
  desc: '每次攻击命中汲取 1 熟练度；累积 10 熟练度时伤害 +3',
  kind: 'custom' as const,
};

/** 小怪击杀奖励（无奖励） */
export const PUPPET_REWARD = {
  gold: 0,
  proficiency: 0,
  items: [],
};
