export interface StatusEffect {
  kind: 'burn' | 'poison' | 'atkUp' | 'atkDown' | 'stun' | 'healTick';
  /** atkUp/atkDown 为固定伤害修正（±整数）；burn/poison 为固定持续伤害值 */
  value: number;
  turns: number;
}

export type SkillTarget = 'single' | 'all' | 'random' | 'self' | 'ally';

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  target: SkillTarget;
  /** 攻击技能固定伤害值（整数，不经任何属性倍率） */
  damage?: number;
  /** 治疗技能固定回复值（整数） */
  heal?: number;
  kind: 'attack' | 'heal' | 'buff';
  hits?: number;
  effects?: StatusEffect[];
  /** 每场战斗可使用次数上限（回血/强化等强技能限定，缺省无限制） */
  uses?: number;
}

/** 被动技能效果类型 */
export type PassiveKind =
  | 'hp' // 生命加成：maxHp + value（战斗开始时生效）
  | 'spd' // 速度加成：spd + value（战斗开始时生效）
  | 'regen' // 再生：每回合开始恢复 value 点生命
  | 'thorns' // 尖刺：受到攻击时反伤 value 点
  | 'drain' // 吸血：造成伤害时恢复 value 点生命
  | 'power' // 力量：所有技能伤害 + value
  | 'guard' // 守护：受到的所有伤害 - value
  | 'venom' // 毒牙：攻击命中附加中毒 value（2 回合）
  | 'scorch' // 炽热：攻击命中附加灼烧 value（2 回合）
  | 'frenzy'; // 狂暴：生命低于 50% 时伤害 + value

export interface PassiveDef {
  id: string;
  name: string;
  desc: string;
  kind: PassiveKind;
  value: number;
}

export interface SpeciesTame {
  /** 驯服难度系数 0..1，越高越好驯 */
  difficulty: number;
}

export interface MonsterSpecies {
  id: string;
  name: string;
  emoji: string;
  baseHp: number;
  baseSpd: number;
  skills: string[];
  /** 专属被动技能 id（见 PASSIVES 表），每只生物固定一个 */
  passive?: string;
  /** 进化链：依次 { 目标形态 }。缺省或空数组表示不可进化 */
  evolutions?: { to: string }[];
  tame: SpeciesTame;
  /** 1=普通 2=精英 3=传奇 4=Boss */
  rank: 1 | 2 | 3 | 4;
}

export interface FoodDef {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  /** 基础驯服成功率 */
  baseTame: number;
  price: number;
  /** 奖励：驯服成功时给新怪物附加最大生命加成 */
  hpBonus: number;
  /** 特殊道具：必定驯服（仍要求残血且可驯服） */
  guaranteed?: boolean;
  /** 是否在商店出售；特殊道具默认不售 */
  shop?: boolean;
}

export interface Unit {
  uid: string;
  speciesId: string;
  name: string;
  emoji: string;
  maxHp: number;
  hp: number;
  spd: number;
  skills: string[];
  statuses: StatusEffect[];
  /** 0=前 1=中 2=后 */
  column: 0 | 1 | 2;
  isPlayer: boolean;
  /** 敌方专用：是否可被驯服 */
  tameable: boolean;
  /** 敌方专用：本场战斗中已驯服失败的次数（每次失败提高后续捕捉概率） */
  tameFails?: number;
  /** 本回合是否已行动（回合内排序用） */
  acted: boolean;
  /** 专属被动技能 id（随物种固定） */
  passive?: string;
  /** 本场战斗中各技能剩余使用次数（skillId -> 剩余次数；有限次数技能用） */
  skillUses?: Record<string, number>;
  /** 属性强化：对基准属性的永久加成（来自奇遇关「属性强化」） */
  bonusStats?: { hp?: number; spd?: number };
  /** 超进化带来的负面诅咒：hpDown=生命-5 / atkDown=伤害-1 / spdDown=速度-1 */
  curse?: 'hpDown' | 'atkDown' | 'spdDown';
  /** 自创生物：创建时随机组合的技能，融合时保留而非按物种解锁 */
  customSkills?: string[];
  /** 战斗药水临时效果（uid -> {atkUp?, spdUp?, atkDown?, spdDown?} 回合数；hpUp/hpDown 为即时生效不入此表） */
  battleBuffs?: {
    atkUp?: number;
    spdUp?: number;
    atkDown?: number;
    spdDown?: number;
  };
}

export interface LogEntry {
  text: string;
  /** 消息归属：player=我方行动、enemy=敌方行动、info=通用/系统 */
  side: 'player' | 'enemy' | 'info';
}

export interface BattleState {
  playerUnits: Unit[];
  enemyUnits: Unit[];
  turnOrder: string[];
  turnIndex: number;
  round: number;
  phase: 'acting' | 'won' | 'lost';
  log: LogEntry[];
  pendingTame: Unit[];
  seed: number;
  rngCount: number;
  /** 被侵蚀节点的暗影 debuff：'spd' 我方速度 -10% | 'dmg' 我方受到伤害 +10% */
  corruptDebuff?: 'spd' | 'dmg';
  /** 车轮战：total 总场数、current 当前上场序号（从 1 开始） */
  gauntlet?: { total: number; current: number };
  /** 车轮战：尚未上场的敌方后备队列 */
  enemyBench?: Unit[];
  /** 车轮战：尚未上场的我方后备队列（我方也一次只上一只） */
  playerBench?: Unit[];
  /** 车轮战：已战败退场、不再显示的我方单位 */
  playerDown?: Unit[];
  /** 敌方本场战斗剩余治疗次数（防止敌方治疗无限拉长战斗形成死局） */
  enemyHealsLeft?: number;
}
