export interface StatusEffect {
  kind: 'burn' | 'poison' | 'atkUp' | 'atkDown' | 'stun' | 'healTick' | 'shield' | 'taunt' | 'spdDown' | 'thorns' | 'shieldCounter' | 'thornSpikes' | 'rageThorn' | 'waterCurtain' | 'flameShield' | 'windSpd' | 'comboBoost' | 'shadowMark' | 'sporeShield' | 'toxicBurstReady';
  /** atkUp/atkDown 为固定伤害修正（±整数）；burn/poison 为**层数**（可叠加，每回合结算 ceil(层数/2) 伤并消耗等量层数，归 0 移除，不使用 turns） */
  value: number;
  /** 除 burn/poison 外各状态的持续回合数；burn/poison 忽略此字段 */
  turns: number;
  /** 嘲讽来源：记录施加嘲讽的单位 UID，被嘲讽者只能攻击该来源 */
  sourceUid?: string;
  /** 施加时的回合号（施放回合不计入持续回合数） */
  appliedRound?: number;
}

export type SkillTarget = 'single' | 'all' | 'random' | 'self' | 'ally' | 'allyAll';

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  target: SkillTarget;
  /**
   * 攻击范围定位（作用于 single/all 攻击技能）：
   * - 缺省 = 前排（默认单体只能攻击前排，前排全灭后可打后排）
   * - 'front' = 前排优先：全体技能只打前排，前排全灭后才打后排
   * - 'pierce' = 贯穿：命中前排目标并波及对应位置后排
   * - 'back' = 后排：跳过前排直接攻击后排
   * - 'direct' = 指定：可攻击任意位置（无视前排保护）
   */
  reach?: 'front' | 'pierce' | 'back' | 'direct';
  /** 攻击技能固定伤害值（整数，不经任何属性倍率） */
  damage?: number;
  /** 治疗技能固定回复值（整数） */
  heal?: number;
  kind: 'attack' | 'heal' | 'buff';
  hits?: number;
  effects?: StatusEffect[];
  /** 每场战斗可使用次数上限（回血/强化等强技能限定，缺省无限制） */
  uses?: number;
  /** 使用后的冷却回合数（冷却期间不可再次使用，缺省无冷却） */
  cooldown?: number;
  /** 先手：该技能在回合结算时必定最先执行（同为先手则按速度排序） */
  priority?: 'first';
  /** 速度加成：每点速度增加的伤害值（0或缺省=不加成） */
  spdScaling?: number;
  /** 技能描述已自包含效果信息，skillFullDesc 不再自动追加 effects 文本 */
  hideEffects?: boolean;
}

/** 被动技能效果类型 */
export type PassiveKind =
  | 'hp' // 生命加成：maxHp + value（战斗开始时生效）
  | 'spd' // 速度加成：spd + value（战斗开始时生效）
  | 'regen' // 再生：每回合开始恢复 value 点生命
  | 'thorns' // 尖刺：受到攻击时反伤 value 点
  | 'thornEntangle' // 荆棘缠绕：攻击时概率使目标伤害-1（古树之主在场时概率更高）
  | 'drain' // 吸血：造成伤害时恢复 value 点生命
  | 'power' // 力量：所有技能伤害 + value
  | 'guard' // 守护：受到的所有伤害 - value
  | 'venom' // 毒牙：攻击命中附加中毒 value（2 回合）
  | 'scorch' // 炽热：攻击命中附加灼烧 value（2 回合）
  | 'frenzy' // 狂暴：生命低于 50% 时伤害 + value
  | 'venomPower' // 蟒影：对中毒目标伤害 + value
  | 'thornRoyal' // 荆棘之躯：反伤 3，每受 3 次攻击反伤 5 并恢复 2
  | 'damageCap' // 铁壁上限：每回合最多累计受到 value 点伤害
  | 'poisonBreak' // 蛇狩：攻击中毒目标无视 value 点护盾/减伤，额外造成 3 真伤
  | 'spdOnAttack' // 疾风连携：攻击后速度 +value（可叠加）
  | 'spdOnHit' // 受击加速：受到攻击后速度 +value（可叠加，上限 6 层）
  | 'treeSpeedUp' // 古木加速：每回合恢复3HP + 受击后速度+1（可叠加，上限8层）
  | 'speedBonus' // 速度差增伤：速度每高于目标 1 点伤害 +1，上限 value
  | 'bigHitGuard' // 大额伤害减免：受到超过 value 点伤害时，伤害 -2
  | 'scorchPlus' // 余烬焚身：攻击附灼烧 value 层；已灼烧目标每层+1伤害，上限+5
  | 'lifeSpring' // 生命之泉：每回合开始恢复 3 点生命；受到超过 value 点伤害时，伤害 -2
  | 'tideRhythm' // 潮汐节律：每3回合触发一次，本回合伤害+2
  | 'tideEcho' // 潮汐共鸣：潮汐巨蟹爆发时本回合自身伤害+2
  | 'rockShellBreak' // 岩壳崩解：每受到4次攻击，对全体敌人造成5点伤害并清除自身所有减益
  | 'rockShard' // 岩壳碎片：死亡时对全体敌我3真实伤害+可连锁+巨像受击计数+1
  | 'shadowHunter' // 暗影追猎：对生命值低于50%的目标伤害+3；击杀目标后立即获得一次额外行动
  | 'shadowFollow' // 暗影追随：暗影之王每击杀一个目标时，自身永久伤害+1
  | 'bloodScent' // 嗜血嗅觉：攻击目标永远为血量最低的敌人
  | 'corruptSpread' // 腐化蔓延：每当一个单位被附加中毒时，随机对另一个敌方单位附加中毒2层
  | 'corruptSac' // 腐化囊体：被攻击时50%概率使攻击者中毒2层
  | 'stickyBody'; // 粘滞躯体：攻击蛞蝓的单位速度-1，持续2回合

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
  /** 图鉴说明（登录界面图鉴展示用） */
  desc?: string;
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
  /** 护盾值（吸收伤害，优先于生命值扣除） */
  shield: number;
  skills: string[];
  statuses: StatusEffect[];
  /** 站位列（0-2）；战斗棋盘 6 格 = 前排3列 + 后排3列 */
  column: 0 | 1 | 2;
  /** 站位排：前排 / 后排 */
  row: 'front' | 'back';
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
  /** 本场战斗中各技能冷却剩余回合数（skillId -> 剩余回合；冷却结束后归零） */
  skillCooldowns?: Record<string, number>;
  /** 属性强化：对基准属性的永久加成（来自奇遇关「属性强化」） */
  bonusStats?: { hp?: number; spd?: number };
  /** 超进化带来的负面诅咒：hpDown=生命-5 / atkDown=伤害-2 / spdDown=速度-2 */
  curse?: 'hpDown' | 'atkDown' | 'spdDown';
  /** 自创生物：创建时随机组合的技能，融合时保留而非按物种解锁 */
  customSkills?: string[];
  /** 被动速度技能叠加层数（受击加速上限6层/古木加速上限8层/疾风连携无上限） */
  passiveSpdStacks?: number;
  /** 战斗药水临时效果（uid -> {atkUp?, spdUp?, atkDown?, spdDown?} 回合数；hpUp/hpDown 为即时生效不入此表） */
  battleBuffs?: {
    atkUp?: number;
    spdUp?: number;
    atkDown?: number;
    spdDown?: number;
    /** 技能/被动提供的永久速度加成（风羽/疾风连携），与药水 spdUp 独立 */
    skillSpd?: number;
  };
  /** 荆棘之躯被动：本场战斗中受击次数（每 3 次触发强化反伤） */
  thornsHitCount?: number;
  /** 岩壳崩解被动：本场战斗中受击计数（每 4 次触发全体伤害+清减益） */
  rockShellHits?: number;
  /** 暗影追随被动：永久伤害加成（暗影之王击杀时 +1） */
  passiveDmgBonus?: number;
  /** 敌方换位次数（每场战斗最多 2 次） */
  swapCount?: number;
  /** 召唤动画标记：新召唤的生物设为 true，动画揭示后清除 */
  summoning?: boolean;
}

export interface LogEntry {
  text: string;
  /** 消息归属：player=我方行动、enemy=敌方行动、info=通用/系统 */
  side: 'player' | 'enemy' | 'info';
  /** 本条日志发生时全体单位的血量快照（uid → hp），供战斗动画按事件逐步更新血量显示 */
  hp?: Record<string, number>;
  /** 本条日志发生时全体单位的状态快照（uid → 状态数组，深拷贝），供战斗动画按事件逐步回放状态层数
   *  （如攻击附加灼烧 5 层、随后 dot 结算剩 2 层，各自对应各自日志快照） */
  statuses?: Record<string, StatusEffect[]>;
  /** 本条日志发生时全体单位的护盾快照（uid → shield），供战斗动画按事件逐步更新护盾显示 */
  shields?: Record<string, number>;
  /** 本条日志涉及的行动者 uid（攻击/治疗/buff/反伤等），供动画精确定位（同名单位也能区分） */
  actorUid?: string;
  /** 本条日志涉及的目标 uid（受击/被治疗/被强化等），供动画精确定位（同名单位也能区分） */
  targetUid?: string;
  /** 攻击类日志：本次攻击结算附加给 target 的状态 kind 列表（灼烧/中毒/减防/眩晕等）。
   *  仅标在连击多段的最后一段上（状态在全部段结算后才生效），供动画在对应攻击动画播放时揭示该状态 */
  addsStatus?: string[];
  /** 范围伤害日志（岩壳碎片自爆/岩壳崩解）：本条日志波及的所有目标 uid，供动画一次性同时挂飘字 */
  burstTargets?: string[];
}

/** 玩家给某只宠物下达的指令（指令阶段记录，结束回合后按速度统一结算）。`skillId === 'rest'` 表示「休息」（本回合不行动，不消耗 AP，可再次点击取消） */
export interface PlayerOrder {
  skillId: string;
  targetUid?: string;
}

export interface BattleState {
  playerUnits: Unit[];
  enemyUnits: Unit[];
  turnOrder: string[];
  turnIndex: number;
  round: number;
  /** 玩家剩余行动点数（每回合 = 场上存活宠物数，用于技能/换位/驯服/道具） */
  playerAp: number;
  /** 本回合行动点上限（回合开始时场上存活宠物数） */
  playerApMax: number;
  /** 敌方剩余行动点数（AI 每回合同样 = 场上存活数） */
  enemyAp: number;
  phase: 'acting' | 'won' | 'lost';
  log: LogEntry[];
  pendingTame: Unit[];
  seed: number;
  rngCount: number;
  /** 玩家已下达的技能指令（uid → 指令；结束回合统一结算后清空） */
  orders?: Record<string, PlayerOrder>;
/** 被侵蚀节点的暗影 debuff：'spd' 我方速度 -2 | 'dmg' 我方受到伤害 +2 | 'burn' 每回合结束受到 2 点伤害 */
corruptDebuff?: 'spd' | 'dmg' | 'burn';
  /** 车轮战：total 总场数、current 当前上场序号（从 1 开始） */
  gauntlet?: { total: number; current: number };
  /** 车轮战：尚未上场的敌方后备队列 */
  enemyBench?: Unit[];
  /** 车轮战：尚未上场的我方后备队列（我方也一次只上一只） */
  playerBench?: Unit[];
  /** 车轮战：已战败退场、不再显示的我方单位 */
  playerDown?: Unit[];
  /** 车轮战：场上一方全灭但仍有替补时标记待换人（死亡动画播完后由 GAUNTLET_SWAP 触发换人） */
  pendingSwap?: { player: boolean; enemy: boolean };
  /** 本回合各单位累计受到的伤害（用于 damageCap 被动：每回合上限 value，超出无效） */
  roundDmgMap?: Record<string, number>;
  /** 当前幕次（1/2/3），AI 行为差异用 */
  act?: number;
  /** 节点类型（battle/elite/arena/gauntlet/corrupted/guardian），AI 行为差异用 */
  nodeType?: string;
}
