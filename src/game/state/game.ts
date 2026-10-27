import type { BattleState, FoodDef, Unit } from '../types';
import type { MainRatingStats } from '../rating';
import type { FormationPosition } from './formation';
import type { MainRegionId } from '../data/regions';
import { MAIN_REGIONS, MIXED_ACT_BOSS_POOLS as ACT_BOSS_POOLS } from '../data/regions';
export { MIXED_ACT_BOSS_POOLS as ACT_BOSS_POOLS } from '../data/regions';
import { getMonster, fusionNeed, SPECIAL_EGG_POOL } from '../data/monsters';
export { MAIN_EVO2_POOL as EVO2_POOL } from '../data/monsters';
import { getFood, FOODS } from '../data/foods';
import { ITEMS, mainShopItemPool } from '../data/items';
import { createRng, pick, randInt, shuffle, weightedPick } from '../rng';
import { computeStats, makeUnit } from '../core/battle';
import { pickProgressEncounter } from '../data/encounter-progression';
import { generateMainShopStock, getMainShopOffer } from '../data/main-shop';

/** 字符串简单哈希（用于按节点 id 派生可复现随机） */
export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export type NodeType =
  | 'battle'
  | 'elite'
  | 'rest'
  | 'shop'
  | 'event'
  | 'special'
  | 'boss'
  | 'arena'
  | 'gauntlet'
  | 'corrupted'
  | 'watchtower'
  | 'sync'
  | 'guardian'
  | 'keydoor'
  | 'blacksmith'
  | 'arena3';

export interface MapNode {
  id: string;
  type: NodeType;
  label: string;
  /** 列序号：本行第几个节点，用于判断下一层相邻路线 */
  col: number;
/** 被侵蚀节点 debuff：'spd' 我方速度 -2 | 'dmg' 我方受到伤害 +2 | 'burn' 每回合结束受到 2 点伤害 */
corruptDebuff?: 'spd' | 'dmg' | 'burn';
  /** 被侵蚀节点奖励翻倍方式：'gold' 金币翻倍 | 'food' 食物翻倍 */
  corruptReward?: 'gold' | 'food';
  /** 车轮战敌人数：2 或 3 */
  gauntletSize?: 2 | 3;
  /** 同步双节点：配对节点 id（同一行相邻，虚线相连；抵达其一另一消失） */
  pairedId?: string;
  /** 钥匙门节点：对应守卫节点 id（击败守卫获得专用钥匙） */
  guardianId?: string;
}

/**
 * 相邻路线判定：从当前行 currentRow、当前列 currentCol 能否踏上下一行节点 node。
 * - 出发层（currentRow === 0，即尚未出发或站在出发节点）可直达下一层任意节点；
 * - currentCol 为 null/undefined 表示旧存档或状态异常，放行；
 * - 节点无 col（旧存档）时放行；
 * - 已失效节点（同步双节点被开启后的配对节点）不可到达；
 * - 其余要求列号相差不超过 1（末层首领同样遵循相邻寻路）。
 */
export function canStepTo(
  currentRow: number,
  currentCol: number | null | undefined,
  node: MapNode,
  map?: RunMap,
): boolean {
  if (map?.disabled?.[node.id]) return false;
  if (currentRow === 0) return true;
  if (currentCol == null) return true;
  if (typeof node.col !== 'number') return true;
  return Math.abs(node.col - currentCol) <= 1;
}

export interface EventBattleReward {
  kind: 'gold' | 'food' | 'hp' | 'recruit';
  amount?: number;
  foodId?: string;
  monsterId?: string;
}

export interface EventChoice {
  id: string;
  label: string;
  desc: string;
  kind: 'heal' | 'gold' | 'food' | 'recruit' | 'damage' | 'item' | 'none'
      | 'battle' | 'sacrifice' | 'boost' | 'purify' | 'curse' | 'status' | 'revive' | 'growthPoint'
      | 'permanentBoost' | 'resetGrowthPoints' | 'skillReplace' | 'carryEgg' | 'coin' | 'purifyChoice' | 'feedRecruit';
  foodCost?: number;
  recruitBonus?: { stat: 'hp' | 'spd'; amount: number };
  coinResult?: 'heads' | 'tails';
  purifySuccess?: boolean;
  foodRewards?: { foodId: string; amount: number }[];
  extraBoost?: { stat: 'hp' | 'spd'; amount: number };
  /** heal/damage=百分比，gold=金额 */
  amount?: number;
  /** 复活属性保留比例（0~1） */
  reviveRatio?: number;
  /** 金币变动（food/exp 附加） */
  goldDelta?: number;
  foodId?: string;
  monsterId?: string;
  /** item 道具 id */
  itemId?: string;
  /** 事件战斗敌人 */
  battleEnemies?: { speciesId: string }[];
  /** 永久属性提升类型 */
  boostStat?: 'hp' | 'spd';
  /** 状态类型 */
  statusKind?: 'burn' | 'poison';
  /** 状态层数 */
  statusValue?: number;
  /** 消耗 foodId 对应的道具（而非获得） */
  consumeFood?: boolean;
  consumeRandomFood?: boolean;
  damagePercent?: number;
  carriedEgg?: { ambush: boolean; special: boolean; monsterId: string };
  /** gold 选项附加：随机宠物诅咒 */
  curseTarget?: boolean;
  /** 战斗胜利奖励 */
  battleReward?: EventBattleReward;
  /** 战斗失败惩罚 */
  battlePenalty?: { percent?: number; goldLoss?: number; curseTarget?: boolean };
  /** 战斗胜利额外奖励 */
  bonusReward?: { kind: 'food'; foodId: string };
  /** 给予目标宠物的成长点 */
  growthPointGain?: number;
  /** 重置目标宠物的成长点 */
  resetGrowthPoints?: boolean;
  /** 目标全体（而非单只选择） */
  targetAll?: boolean;
  /** 永久属性提升不计入上限 */
  noCap?: boolean;
  /** 成功概率（0~1），缺省=1（必定成功） */
  chance?: number;
}

export interface EventNode {
  title: string;
  desc: string;
  choices: EventChoice[];
}

/** 奇遇关高级奖励类型 */
export type SpecialRewardKind = 'evolve' | 'superevolve' | 'gold' | 'boost' | 'custom' | 'item' | 'growthPoint' | 'slotUnlock' | 'recruit' | 'revive' | 'reviveHalf' | 'egg';

export interface SpecialReward {
  id: string;
  label: string;
  desc: string;
  kind: SpecialRewardKind;
  /** gold 的金额 */
  amount?: number;
  /** item 的（道具或食物）id */
  itemId?: string;
  monsterId?: string;
  hpBonus?: number;
  spdBonus?: number;
  toFinal?: boolean;
}

export interface SpecialNode {
  title: string;
  desc: string;
  rewards: SpecialReward[];
}

export const SPECIAL_REWARDS: SpecialReward[] = [
  { id: 'sr-evolve', label: '完美进化', desc: '将1只指定生物直接进化到最终形态，不附加新诅咒', kind: 'evolve', toFinal: true },
  { id: 'sr-gold', label: '龙之宝藏', desc: '获得120金币', kind: 'gold', amount: 120 },
  { id: 'sr-golden-fruit', label: '圣果宝藏', desc: '获得2个必定驯服的「圣果」', kind: 'item', itemId: 'golden_fruit', amount: 2 },
  { id: 'sr-boost', label: '属性重塑', desc: '选择1只宠物，永久生命+6或永久速度+3', kind: 'boost', hpBonus: 6, spdBonus: 3 },
  { id: 'sr-custom', label: '造物·自创生物', desc: '从三种属性模板中创造一只独特生物，技能随机组合', kind: 'custom' },
  { id: 'sr-egg', label: '神秘蛋', desc: '获得随机蛋，经过3次关卡后必定孵化1只特殊生物', kind: 'egg' },
  { id: 'sr-purify', label: '净化药水', desc: '获得 2 瓶清除负面诅咒的药水', kind: 'item', itemId: 'purify', amount: 2 },
];

export const CUSTOM_PRESETS = ['custom_guardian', 'custom_fury', 'custom_gale'] as const;

export const CURSE_CN: Record<NonNullable<Unit['curse']>, string> = {
  hpDown: '血脆',
  atkDown: '虚弱',
  spdDown: '迟缓',
};

export interface RunMap {
  layers: MapNode[][];
  encounter: Record<string, { speciesId: string }[]>;
  boss: Record<string, { speciesId: string }[]>;
  events: Record<string, EventNode>;
  specials: Record<string, SpecialNode>;
  /** 已失效（消失/已开启）的节点 id：同步双节点被开启后配对节点消失、钥匙门开启后失效 */
  disabled?: Record<string, boolean>;
}

export type Screen =
  | 'title'
  | 'region-select'
  | 'starter'
  | 'map'
  | 'formation'
  | 'gauntlet-order'
  | 'battle'
  | 'reward'
  | 'roster'
  | 'shop'
  | 'rest'
  | 'event'
  | 'special'
  | 'custom'
  | 'boost'
  | 'gameover'
  | 'victory'
  | 'inter_act'
  | 'watchtower'
  | 'chest'
  | 'backpack'
  | 'tame-overflow'
  | 'test-type'
  | 'test-pick'
  | 'test-config'
  | 'achievements'
  | 'difficulty-select'
  | 'proficiency-select'
  | 'proficiency-result'
  | 'skill-pick'
  | 'growth-menu'
  | 'blacksmith'
  | 'rest-fusion'
  | 'rest-fusion-skill'
  | 'revive-select'
  | 'enhance-stone'
  | 'enhance-reset'
  | 'arena3';

export interface RunStats {
  /** 仅新主模式远征初始化；缺失表示沿用旧评分。 */
  rating?: MainRatingStats;
  battlesWon: number;
  battlesLost: number;
  /** 全部实际金币收入，含开局及遗物赠金；不扣消费/损失，不计退款。 */
  goldEarned: number;
  goldSpent: number;
  /** 商人商品购买与刷新实付金币，不含事件损失；旧档缺失时从0开始。 */
  shopGoldSpent?: number;
  petsTamed: number;
  /** 本局已达最终进化形态的驯服生物UID，累计去重，释放/阵亡不减。 */
  finalTamedUids?: string[];
  petsLost: number;
  turnsPlayed: number;
  tameAttempts: number;
  /** 本局实际消耗的普通道具数量（不含捕获食物与免费跳关） */
  itemsUsed: number;
  圣果Used: number;
  fusions: number;
  shopVisits: number;
  lastBattleRound: number;
  actSnapshot: {
    battlesWon: number;
    battlesLost: number;
    goldEarned: number;
    goldSpent: number;
    petsTamed: number;
    petsLost: number;
    turnsPlayed: number;
    tameAttempts: number;
    圣果Used: number;
    fusions: number;
    shopVisits: number;
  };
}

export interface RewardChoice {
  id: string;
  label: string;
  desc: string;
  kind: 'food' | 'heal' | 'recruit' | 'gold';
  foodId?: string;
  monsterId?: string;
  recruitCandidates?: string[];
  amount?: number;
}

export interface TestScenario {
  mode: 'main' | 'proficiency';
  region: MainRegionId;
  difficulty: Difficulty;
  act: number;
  layer: number;
  seed: number;
  gold: number;
  itemCount: number;
  hpPercent: number;
  deadCount: number;
  partySize?: number;
  customParty: boolean;
  nodeType: NodeType;
  eventType?: string;
  specialId?: string;
  bossId?: string;
  corruptDebuff?: 'spd' | 'dmg' | 'burn';
  corruptReward?: 'gold' | 'food';
}

export interface GameState {
  saveSlot?: number;
  /** 主模式地区；旧存档缺失时迁移为 mixed，熟练度模式不使用。 */
  region?: MainRegionId;
  screen: Screen;
  seed: number;
  act: number;
  map: RunMap;
  currentRow: number;
  currentNodeId: string;
  roster: Unit[];
  /** 死亡宠物墓地（成长远征模式用于复活功能） */
  deadPets?: Unit[];
  field: string[];
  inventory: Record<string, number>;
  gold: number;
  battle?: BattleState;
  rewards: RewardChoice[];
  pendingRecruitRewardId?: string;
  log: string[];
  /** 奇遇关奖励进行中：进化/超进化（等待玩家在队伍中点选）或属性强化（等待选属性）；斗兽场等待选择出战宠物 */
  specialPending?:
    | { kind: 'evolve'; super: boolean; toFinal?: boolean }
    | { kind: 'boost'; uid: string; hpBonus?: number; spdBonus?: number }
    | { kind: 'arena'; uid: string }
    | { kind: 'growthPoint'; uid: string; amount?: number }
    | { kind: 'shopGrantGrowthPoint'; uid: string; amount: number }
    | { kind: 'shopStatBoost'; uid: string }
    | { kind: 'shopSlotUnlock'; uid: string; slot: 3 | 4 | 5 }
    | { kind: 'shopForget'; uid: string }
    | { kind: 'eventBoostHp'; uid: string; amount?: number }
    | { kind: 'eventBoostSpd'; uid: string; amount?: number }
    | { kind: 'eventResetGrowth'; uid: string }
    | { kind: 'eventSkillReplace'; uid: string }
    | { kind: 'legendSkill'; uid: string; skillId?: string }
    | { kind: 'arena3Exhibition'; uid: string };
  /** 竞技场模式选择 */
  arena3Pending?: { mode?: 'simulation' | 'challenge' | 'exhibition' };
  /** 本次商人节点是否已购买过食物（买了就不能再立即休整） */
  shopBought?: boolean;
  /** 本次商人节点已购买的物品 id（每种物品每次进入商店限购 1 次） */
  shopBoughtItems?: string[];
  /** 本次商人节点在售的 4 个随机物品 id（按节点确定性生成，重进同一商店不变） */
  shopStock?: string[];
  /** 本次商人节点已刷新次数（0-3，刷新费用递增） */
  shopRefreshCount?: number;
  /** 背包使用远征道具时，记录被使用的物品 ID（用于取消时归还） */
  growthItemPending?: string;
  /** 熟练度远征结算结果 */
  proficiencyResult?: 'won' | 'lost';
  /** 宝箱/钥匙门开启结果（chest 界面展示的文本列表） */
  chestResult?: string[];
  /** 本幕已访问的瞭望塔节点 ID 列表 */
  visitedWatchtowers?: string[];
  /** 当前预览的瞭望塔节点 ID（打开瞭望界面时设置，关闭时清空） */
  watchtowerPreviewNodeId?: string;
  /** 本幕已走过的节点 ID 列表（按访问顺序，用于绘制路径高亮） */
  visitedNodeIds?: string[];
  /** 本次主模式远征击败第一幕首领后开放传奇进化；旧存档第二幕起默认开放。 */
  legendEvolutionUnlocked?: boolean;
  /** 队伍已满（ROSTER_MAX）时捕捉溢出、等待玩家处理的宠物（替换/融合/放弃） */
  tameOverflow?: Unit[];
  /** 溢出处理完毕后返回的界面：战斗驯服→'reward'；孵化→'map'；招募→'roster' */
  tameOverflowReturn?: 'reward' | 'map' | 'roster';
  /** 上次普通布阵的站位，按生物 uid 记忆；缺席位置留空，不自动补位。 */
  lastFormation?: Record<string, FormationPosition>;
  /** 布阵：进入普通/精英/被侵蚀/守卫战斗前选择站位（FORMATION_CONFIRM 确认后创建战斗） */
  formation?: {
    units: Unit[];
    /** 恢复记忆站位；首次布阵时自动布阵的出战宠物。 */
    initialField: Unit[];
    encounter: { speciesId: string }[];
    nodeId: string;
    options?: { corruptDebuff?: 'spd' | 'dmg' | 'burn'; untameable?: boolean; act?: number; nodeType?: string; difficulty?: Difficulty };
    /** 移动前的位置（BACK_TO_MAP 时恢复） */
    prevRow?: number;
    prevNodeId?: string;
    /** 竞技场模拟战：强制全部宠物上场，不可移除 */
    forceAllUnits?: boolean;
  };
  /** 车轮战：等待玩家选择出战顺序（GAUNTLET_ORDER_CONFIRM 确认后创建战斗） */
  gauntletOrder?: Unit[];
  /** 车轮战：敌方数量（n v n，顺序栏只解锁 n 个槽位） */
  gauntletSize?: number;
  /** 车轮战：移动前的位置（BACK_TO_MAP 时恢复） */
  gauntletPrevRow?: number;
  gauntletPrevNodeId?: string;
  /** 侦查符使用结果：查看指定节点情报（背包界面展示） */
  scoutResult?: { nodeId: string; title: string; detail: string } | null;
  /** 侦查选择模式：打开背包使用侦查符后跳回地图，点击任意节点查看情报 */
  scoutSelecting?: boolean;
  /** 跳关选择模式：打开背包使用跳关道具后跳回地图，点击可达的战斗类节点直接获得奖励 */
  skipSelecting?: boolean;
  /** 全局toast提示：选择奖励后显示获得的食物/宠物等信息 */
  toast?: { msg: string; kind?: 'info' | 'success' | 'error' | 'warning' };
  /** 打开背包前所在的界面（关闭背包时返回） */
  backpackFrom?: Screen;
  /** 独立测试进行中，禁止保存至正式存档。 */
  testRun?: boolean;
  testScenario?: TestScenario;
  /** 测试局内存快照，不保存至正式存档；重置时还原选择与随机结果。 */
  testSnapshot?: Omit<GameState, 'testSnapshot'>;
  /** 自定义测试流程暂存：当前阶段（选我方/选敌方）、关卡类型、我方已选宠物 */
  testPick?: {
    side: 'player' | 'enemy';
    nodeType: MapNode['type'];
    corruptDebuff?: 'spd' | 'dmg' | 'burn';
    corruptReward?: 'gold' | 'food';
    playerUnits?: Unit[];
    returnToNode?: boolean;
  };
  /** 自定义测试：选宠确认后、开战前暂存的战斗数据（test-config 界面确认后创建战斗） */
  pendingBattle?: {
    units: Unit[];
    encounter: { speciesId: string }[];
    seed: number;
    options?: { corruptDebuff?: 'spd' | 'dmg' | 'burn'; gauntlet?: boolean; untameable?: boolean; enemyExact?: boolean };
    nodeType: NodeType;
  };
  /** 战斗胜利后进入队伍管理界面：禁止选择出战，只能释放/融合 */
  postBattle?: boolean;
  /** 孵化预览：点击「孵化它」后暂存，弹出确认弹窗显示将孵化的宠物 */
  pendingEventHatch?: { choiceId: string; monsterId: string };
  pendingEventTarget?: { kind: 'spd' | 'purify'; choiceId: string };
  /** 历史瞭望塔查看不算再次完成关卡。 */
  watchtowerReopened?: boolean;
  carriedEggs?: { id: string; remaining: number; special: boolean; monsterId: string; passedNodeIds: string[] }[];
  /** 事件战斗：记录战斗数据（敌人、奖励、惩罚），战斗结束后处理结果 */
  eventBattle?: {
    enemies: { speciesId: string }[];
    reward: EventBattleReward;
    penalty: { percent?: number; goldLoss?: number; curseTarget?: boolean };
    bonusReward?: { kind: 'food'; foodId: string };
  };
  runStats?: RunStats;
  /** 难度等级 */
  difficulty?: Difficulty;
  /** 本局携带的遗物 ID */
  relics?: string[];
  cauldronClaimedShops?: string[];
  newRelicUnlocks?: string[];
  /** 跨局解锁（持久化到 localStorage） */
  unlocks?: Unlocks;
  /** 远征模式标记 */
  runMode?: 'main' | 'proficiency';
  /** 远征模式：当前层数（1~15） */
  currentLayer?: number;
  /** 远征模式：本局统计数据 */
  proficiencyStats?: {
    totalProficiency: number;
    totalGrowthPoints: number;
    battlesWon: number;
    battlesLost: number;
    kills: number;
  };
  /** 技能槽解锁后：待选技能列表 + 目标单位uid + 技能槽编号(3/4) */
  skillPick?: {
    uid: string;
    slot: 3 | 4 | 5;
    choices: string[];
  };
  /** 替换技能：待替换技能列表 + 目标单位uid + 可选新技能 */
  skillReplace?: {
    uid: string;
    replaceIdx: number;
    choices: string[];
    refreshCount?: number;
  };
  /** 替换技能随机种子递增计数器 */
  skillReplaceCount?: number;
  /** 休整融合：已选主宠uid */
  fusionMainUid?: string;
  /** 休整融合：已选副宠uid */
  fusionSubUid?: string;
  /** 休整融合：副宠可学习的技能列表（进入技能选择时暂存） */
  fusionSubSkills?: string[];
  /** 休整融合：技能选择阶段 — 玩家已选要学习的技能 */
  fusionLearnSkill?: string;
  /** 休整融合：技能选择阶段 — 玩家已选要替换的槽位索引 */
  fusionReplaceIdx?: number;
  /** 复活属性保留比例（事件触发时暂存） */
  reviveRatio?: number;
}

export type Difficulty = 'normal' | 'hard' | 'nightmare';

export interface DifficultyConfig {
  label: string;
  enemyHpMult: number;
  enemySpdBonus: number;
  shopPriceMult: number;
  healRatio: number;
  eliteBoost: number;
  /** 进入下一幕时，全队至少恢复到该生命比例。 */
  interActMinHpRatio: number;
}

export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  normal:    { label: '普通', enemyHpMult: 1.0, enemySpdBonus: 0, shopPriceMult: 1.0, healRatio: 0.5, eliteBoost: 0, interActMinHpRatio: 0.8 },
  hard:      { label: '困难', enemyHpMult: 1.15, enemySpdBonus: 1, shopPriceMult: 1.1, healRatio: 0.4, eliteBoost: 0.05, interActMinHpRatio: 0.65 },
  nightmare: { label: '地狱', enemyHpMult: 1.35, enemySpdBonus: 2, shopPriceMult: 1.25, healRatio: 0.3, eliteBoost: 0.1, interActMinHpRatio: 0.5 },
};

/** 主线商店刷新费用（按已刷新次数递增，不超过 3 次） */
export const MAIN_SHOP_REFRESH_COSTS = [10, 15, 25] as const;

export const DIFFICULTY_ORDER: Difficulty[] = ['normal', 'hard', 'nightmare'];

export interface RelicDef {
  name: string;
  emoji: string;
  desc: string;
  unlockCondition: string;
}

export const RELIC_DEFS: Record<string, RelicDef> = {
  traveler_charm: { name: '旅者护符', emoji: '🧭', desc: '开局金币 +50', unlockCondition: 'B 级通关' },
  elite_badge:    { name: '精锐之证', emoji: '⚔️', desc: '初始赠送每种道具各 1 个', unlockCondition: '单局使用 20 个及以上道具' },
  beast_master:   { name: '驯兽大师', emoji: '🍖', desc: '初始赠送每种捕获物各 1 个', unlockCondition: '单局捕捉 15 只及以上生物' },
  greedy_eye: { name: '贪婪之眼', emoji: '👁️', desc: '战斗胜利直接结算金币+50%；商店刷新价格翻倍', unlockCondition: '单局结束时金币结余≥200' },
  metal_cauldron: { name: '金属坩埚', emoji: '⚗️', desc: '每个商人节点免费获得1个随机食物或道具（各50%）', unlockCondition: '单局商店累计消费≥300金币（含刷新）' },
  horn_of_plenty: { name: '丰收之角', emoji: '🌽', desc: '食物基础驯服效果×1.1，仍受原品阶概率上限限制', unlockCondition: '单局累计5只驯服所得生物达到最终进化形态（含直接捕获）' },
  spare_candle: { name: '备用的蜡烛', emoji: '🕯️', desc: '每场首次我方阵亡时，自动以1血复活，全队限1次', unlockCondition: '以8只满编队伍、全局无宠物阵亡通关' },
};

export const RELIC_ORDER = ['traveler_charm', 'elite_badge', 'beast_master', 'greedy_eye', 'metal_cauldron', 'horn_of_plenty', 'spare_candle'];

export function growthRelicUnlocks(unlocks: Unlocks, stats?: Partial<Pick<RunStats, 'finalTamedUids' | 'petsLost'>>, victoryRosterSize?: number): Unlocks {
  const relics = [...unlocks.relics];
  if (new Set(stats?.finalTamedUids ?? []).size >= 5 && !relics.includes('horn_of_plenty')) relics.push('horn_of_plenty');
  if (victoryRosterSize === 8 && stats?.petsLost === 0 && !relics.includes('spare_candle')) relics.push('spare_candle');
  return { ...unlocks, relics };
}

export function economicRelicUnlocks(unlocks: Unlocks, gold: number, shopGoldSpent = 0): Unlocks {
  const relics = [...unlocks.relics];
  if (gold >= 200 && !relics.includes('greedy_eye')) relics.push('greedy_eye');
  if (shopGoldSpent >= 300 && !relics.includes('metal_cauldron')) relics.push('metal_cauldron');
  return { ...unlocks, relics };
}

export function mainShopRefreshCost(state: GameState): number {
  const base = MAIN_SHOP_REFRESH_COSTS[state.shopRefreshCount ?? 0] ?? MAIN_SHOP_REFRESH_COSTS[2];
  return Math.round(base * DIFFICULTY_CONFIG[state.difficulty ?? 'normal'].shopPriceMult)
    * (state.runMode !== 'proficiency' && state.relics?.includes('greedy_eye') ? 2 : 1);
}

export interface Unlocks {
  /** 按地区记录实际战斗中遇见的形态，同槽位跨远征保留。 */
  regionEncounters?: Partial<Record<MainRegionId, string[]>>;
  difficulties: string[];
  relics: string[];
  bestGrade?: string;
  proficiencyUnlocked?: boolean;
}

export const DEFAULT_UNLOCKS: Unlocks = { difficulties: ['normal'], relics: [], bestGrade: undefined, proficiencyUnlocked: false };

export const ROSTER_MAX = 8;
/** 出战宠物上限（最大 5 只，实际受敌方数量限制：敌方 n 只时玩家最多 n+1 只） */
export const FIELD_MAX = 5;
/** 根据敌方数量计算我方出战上限（n+1，不超过 FIELD_MAX） */
export const PROF_ROSTER_MAX = 5;
export const PROF_FIELD_MAX = 3;

/** 根据游戏模式返回队伍上限：远征5只，主模式8只 */
export function getMaxRoster(runMode?: string): number {
  return runMode === 'proficiency' ? PROF_ROSTER_MAX : ROSTER_MAX;
}

export function maxFieldForEnemy(enemyCount: number, runMode?: 'main' | 'proficiency'): number {
  const fieldMax = runMode === 'proficiency' ? PROF_FIELD_MAX : FIELD_MAX;
  return Math.min(enemyCount + 1, fieldMax);
}

/** 地图节点图标（UI 与侦查/瞭望共用） */
export const NODE_ICON: Record<NodeType, string> = {
  battle: '⚔️',
  elite: '💀',
  rest: '🛌',
  shop: '🏪',
  event: '📜',
  special: '💎',
  boss: '👑',
  arena: '🗡️',
  gauntlet: '🔥',
  corrupted: '🌑',
  watchtower: '🔭',
  sync: '🎁',
  guardian: '🛡️',
  keydoor: '🔒',
  blacksmith: '🔨',
  arena3: '🏟️',
};

export interface NodeInfo {
  icon: string;
  title: string;
  detail: string;
  shopItems?: { name: string; price: number }[];
}

export interface ChestRoll {
  gold: number;
  foodId?: string;
  healRatio?: number;
  extras: { id: string; name: string }[];
  text: string;
}

/**
 * 确定性宝箱掷骰（钥匙门 / 双生宝箱共用），与 openChest 使用完全相同的 RNG 调用顺序。
 * row 必须为节点所在行（openChest 用 base.currentRow，瞭望塔/侦察符用 layers.findIndex）。
 */
export function rollChest(seed: number, row: number, nodeId: string, keydoor: boolean): ChestRoll {
  const rng = createRng(seed * 7919 + row * 104729 + hashStr(nodeId));
  const foodPool = Object.keys(FOODS).filter((id) => FOODS[id].shop !== false);
  if (keydoor) {
    const amt = 25 + Math.floor(rng() * 16);
    const foodId = foodPool[Math.floor(rng() * foodPool.length)];
    const food = getFood(foodId);
    const extras: { id: string; name: string }[] = [];
    if (rng() < 0.2) {
      extras.push({ id: 'purify', name: ITEMS.purify.name });
    } else if (rng() < 0.25) {
      const pool = ['scout', 'twin', 'skip'];
      const extraId = pool[Math.floor(rng() * pool.length)];
      extras.push({ id: extraId, name: ITEMS[extraId].name });
    }
    if (rng() < 0.1) {
      extras.push({ id: 'golden_fruit', name: getFood('golden_fruit').name });
    }
    const extraText = extras.length ? '、' + extras.map((e) => `额外获得「${e.name}」`).join('、') : '';
    return { gold: amt, foodId, extras, text: `获得 ${amt} 金币、1 个${food.name}${extraText}` };
  }
  const roll = rng();
  if (roll < 0.4) {
    const amt = 12 + Math.floor(rng() * 9);
    return { gold: amt, extras: [], text: `获得 ${amt} 金币` };
  }
  if (roll < 0.7) {
    const foodId = foodPool[Math.floor(rng() * foodPool.length)];
    const food = getFood(foodId);
    return { gold: 0, foodId, extras: [], text: `获得 1 个${food.name}` };
  }
  const itemId = pick(rng, mainShopItemPool());
  const item = ITEMS[itemId];
  return { gold: 0, extras: [{ id: itemId, name: item.name }], text: `获得 1 个${item.name}` };
}

/** 查看单个节点的情报（侦查符 / 瞭望塔共用）：按节点类型展示敌人/货物/事件/宝箱奖励等内容 */
export function nodeInfo(state: GameState, n: MapNode): NodeInfo {
  const enc = state.map.encounter[n.id];
  const encDetail = (list?: { speciesId: string }[]): string =>
    list && list.length > 0
      ? list.map((x) => `${getMonster(x.speciesId).emoji} ${getMonster(x.speciesId).name}`).join('、')
      : '—';
  switch (n.type) {
    case 'battle':
    case 'elite':
    case 'arena': {
      const enemy = enc?.[0];
      const rank = enemy ? getMonster(enemy.speciesId).rank : undefined;
      return {
        icon: NODE_ICON.arena,
        title: n.label,
        detail: `${encDetail(enc)}${rank ? `（${rank}阶）` : ''}；1v1高风险挑战，失败将承受惩罚`,
      };
    }
    case 'gauntlet':
      return {
        icon: NODE_ICON.gauntlet,
        title: n.label,
        detail: `${encDetail(enc)}；共 ${n.gauntletSize ?? enc?.length ?? 2} 轮，失败将承受惩罚`,
      };
    case 'corrupted':
    case 'arena3':
      return { icon: NODE_ICON[n.type], title: n.label, detail: encDetail(enc) };
    case 'boss': {
      const e = state.map.boss[n.id]?.[0];
      return {
        icon: NODE_ICON.boss,
        title: n.label,
        detail: e ? `${getMonster(e.speciesId).emoji} ${getMonster(e.speciesId).name}（首领）` : '—',
      };
    }
    case 'shop': {
      // 与进入商店时的库存生成保持一致（同一 seed 公式），保证侦查/瞭望塔看到的就是实际可购商品
      const row = state.map.layers.findIndex((r) => r.includes(n));
      const rng = createRng(state.seed * 7919 + row * 104729 + hashStr(n.id));
      const stock = generateMainShopStock(rng);
      const goods = stock
        .map((id) => {
          const offer = getMainShopOffer(id)!;
          return `${offer.name} ${Math.round(offer.price * DIFFICULTY_CONFIG[state.difficulty ?? 'normal'].shopPriceMult)} 金`;
        })
        .join('、');
      return {
        icon: NODE_ICON.shop,
        title: '商店',
        detail: `本店出售：${goods}（每件限购1次）`,
        shopItems: stock.map(id => {
          const item = getMainShopOffer(id)!;
          return { name: item.name, price: Math.round(item.price * DIFFICULTY_CONFIG[state.difficulty ?? 'normal'].shopPriceMult) };
        }),
      };
    }
    case 'event': {
      const ev = state.map.events[n.id];
      return { icon: NODE_ICON.event, title: ev?.title ?? '事件', detail: ev ? ev.choices.map((c) => c.label).join(' ／ ') : '—' };
    }
    case 'special': {
      const sp = state.map.specials[n.id];
      return { icon: NODE_ICON.special, title: sp?.title ?? '奇遇关', detail: sp ? sp.rewards.map((r) => r.label).join(' ／ ') : '—' };
    }
    case 'watchtower':
      return { icon: NODE_ICON.watchtower, title: '瞭望塔', detail: '可以在此继续瞭望更下层' };
    case 'guardian':
      return { icon: NODE_ICON.guardian, title: n.label, detail: `${encDetail(enc)}（守卫·不可驯服，击败获得专用钥匙）` };
    case 'keydoor': {
      const row = state.map.layers.findIndex((r) => r.includes(n));
      const roll = rollChest(state.seed, row, n.id, true);
      return { icon: NODE_ICON.keydoor, title: n.label, detail: `宝箱奖励：${roll.text}（需先击败对应守卫取得钥匙）` };
    }
    case 'sync': {
      const row = state.map.layers.findIndex((r) => r.includes(n));
      const roll = rollChest(state.seed, row, n.id, false);
      return { icon: NODE_ICON.sync, title: n.label, detail: `宝箱奖励：${roll.text}（与配对宝箱二选一，持双生符可同时开启）` };
    }
    case 'blacksmith':
      return { icon: NODE_ICON.blacksmith, title: '铁匠铺', detail: '为宠物强化技能效果（消耗成长点）' };
    default:
      return { icon: NODE_ICON[n.type], title: n.label, detail: '' };
  }
}

// ---------- 地图生成 ----------

// ---- 第 1 幕固定遭遇表（第一幕敌人.md 设计） ----
// 普通战斗：按规模分表，加权抽取具体组合
const ACT1_ENCOUNTERS_1V1: readonly { species: string[]; weight: number }[] = [
  { species: ['molten_larva'], weight: 1 },
  { species: ['fire_fox'], weight: 1 },
  { species: ['ember_hawk'], weight: 1 },
  { species: ['coal'], weight: 1 },
  { species: ['momo'], weight: 1 },  // S1 迅迅
  { species: ['fifi'], weight: 1 },  // S3 灼灼
  { species: ['mimi'], weight: 1 },  // S5 咪咪
  { species: ['pipi'], weight: 1 },  // S6 刺刺
];
const ACT1_ENCOUNTERS_2V2: readonly { species: string[]; weight: number }[] = [
  { species: ['molten_larva', 'candle'], weight: 10 },
  { species: ['light_moss', 'mimi'], weight: 10 },
  { species: ['fire_fox', 'light_moss'], weight: 10 },
  { species: ['ember_hawk', 'coal'], weight: 10 },
  { species: ['coal', 'lulu'], weight: 10 },
  { species: ['candle', 'fifi'], weight: 10 },
  { species: ['coal', 'candle'], weight: 10 },
  { species: ['coal', 'fifi'], weight: 10 },
  { species: ['momo', 'fifi'], weight: 11 },  // D1 迅迅+灼灼
  { species: ['lulu', 'momo'], weight: 11 },
  { species: ['mimi', 'pipi'], weight: 11 },  // D3 咪咪+刺刺
  { species: ['fifi', 'lulu'], weight: 11 },  // D4 灼灼+泡泡
  { species: ['kiki', 'mimi'], weight: 11 },  // D5 铁墩+咪咪
  { species: ['pipi', 'momo'], weight: 11 },  // D6 刺刺+迅迅
  { species: ['fifi', 'pipi'], weight: 11 },  // D7 灼灼+刺刺
  { species: ['lulu', 'mimi'], weight: 11 },  // D8 泡泡+咪咪
  { species: ['kiki', 'fifi'], weight: 12 },  // D9 铁墩+灼灼
];
const ACT1_ENCOUNTERS_3V3: readonly { species: string[]; weight: number }[] = [
  { species: ['molten_larva', 'lulu', 'momo'], weight: 10 },
  { species: ['light_moss', 'molten_larva', 'momo'], weight: 10 },
  { species: ['fire_fox', 'coal', 'momo'], weight: 10 },
  { species: ['ember_hawk', 'coal', 'candle'], weight: 10 },
  { species: ['coal', 'momo', 'fifi'], weight: 10 },
  { species: ['candle', 'kiki', 'mimi'], weight: 10 },
  { species: ['fifi', 'fifi', 'momo'], weight: 12 },       // T1
  { species: ['kiki', 'momo', 'lulu'], weight: 12 },
  { species: ['mimi', 'mimi', 'pipi'], weight: 12 },       // T3
  { species: ['pipi', 'mimi', 'lulu'], weight: 10 },
  { species: ['pipi', 'pipi', 'mimi'], weight: 10 },       // T5
  { species: ['momo', 'momo', 'fifi'], weight: 8 },        // T6
  { species: ['fifi', 'fifi', 'fifi'], weight: 8 },        // T7
  { species: ['kiki', 'fire_fox', 'light_moss'], weight: 6 },
  { species: ['fifi', 'mimi', 'fifi'], weight: 12 },       // T9
  { species: ['kiki', 'pipi', 'momo'], weight: 10 },
];
// 精英：6 种加权抽取
const ACT1_ELITE_ENCOUNTERS: readonly [string, number][] = [
  ['molten_beetle', 15],
  ['phantom_tail_fox', 15],
  ['searing_hawk', 15],
  ['coal_guard', 15],
  ['fifi_king', 20],   // E1 灼刃
  ['sisi', 20],        // E2 棘尾
  ['momo_queen', 15],  // E4 迅牙
  ['mimi_king', 10],   // E6 蟒影
];
// 车轮战：按出场顺序排列的固定阵容表
const ACT1_GAUNTLET_2: readonly { sequence: string[]; weight: number }[] = [
  { sequence: ['molten_larva', 'fifi'], weight: 16 },
  { sequence: ['fire_fox', 'pipi'], weight: 32 },
  { sequence: ['ember_hawk', 'momo'], weight: 16 },
  { sequence: ['coal', 'momo'], weight: 16 },
  { sequence: ['coal', 'fifi'], weight: 16 },
  { sequence: ['fifi', 'fifi'], weight: 20 },         // G1 双灼烧
  { sequence: ['momo', 'pipi'], weight: 20 },
  { sequence: ['mimi', 'pipi'], weight: 18 },         // G3 咪咪→刺刺
  { sequence: ['momo', 'fifi'], weight: 16 },         // G4 迅迅→灼灼
  { sequence: ['pipi', 'pipi'], weight: 14 },
  { sequence: ['pipi', 'mimi'], weight: 12 },         // G6 刺刺→咪咪
];
const ACT1_GAUNTLET_3: readonly { sequence: string[]; weight: number }[] = [
  { sequence: ['molten_larva', 'momo', 'fifi'], weight: 16 },
  { sequence: ['fire_fox', 'coal', 'pipi'], weight: 32 },
  { sequence: ['ember_hawk', 'coal', 'momo'], weight: 16 },
  { sequence: ['coal', 'momo', 'momo'], weight: 16 },
  { sequence: ['coal', 'pipi', 'fifi'], weight: 16 },
  { sequence: ['fifi', 'mimi', 'fifi'], weight: 20 },       // G7 灼烧→毒→灼烧
  { sequence: ['momo', 'pipi', 'momo'], weight: 20 },
  { sequence: ['pipi', 'pipi', 'pipi'], weight: 18 },
  { sequence: ['momo', 'momo', 'fifi'], weight: 16 },       // G10 迅迅→迅迅→灼灼
  { sequence: ['mimi', 'mimi', 'pipi'], weight: 14 },       // G11 咪咪→咪咪→刺刺
  { sequence: ['fifi', 'pipi', 'momo'], weight: 12 },
];

// ---- 第 2 幕固定遭遇表（第二幕敌人.md 设计） ----
const ACT2_ENCOUNTERS_1V1: readonly { species: string[]; weight: number }[] = [
  { species: ['molten_beetle'], weight: 1 },
  { species: ['phantom_tail_fox'], weight: 1 },
  { species: ['searing_hawk'], weight: 1 },
  { species: ['coal_guard'], weight: 1 },
  { species: ['momo_queen'], weight: 1 },   // S1 迅牙
  { species: ['fifi_king'], weight: 1 },    // S3 灼刃
  { species: ['sisi'], weight: 1 },         // S4 棘尾
  { species: ['mimi_king'], weight: 1 },    // S6 蟒影
];

const ACT2_ENCOUNTERS_2V2: readonly { species: string[]; weight: number }[] = [
  { species: ['torch_fox', 'phantom_tail_fox'], weight: 9 },
  { species: ['torch_fox', 'molten_beetle'], weight: 9 },
  { species: ['molten_beetle', 'lantern_moth'], weight: 9 },
  { species: ['moss_beast', 'mimi_king'], weight: 9 },
  { species: ['phantom_tail_fox', 'moss_beast'], weight: 9 },
  { species: ['searing_hawk', 'coal_guard'], weight: 9 },
  { species: ['molten_larva', 'momo_queen'], weight: 8 },
  { species: ['light_moss', 'momo_queen'], weight: 8 },
  { species: ['fire_fox', 'gora'], weight: 8 },
  { species: ['ember_hawk', 'fifi_king'], weight: 8 },
  { species: ['coal_guard', 'fifi_king'], weight: 9 },
  { species: ['lantern_moth', 'momo_queen'], weight: 9 },
  { species: ['coal', 'momo_queen'], weight: 8 },
  { species: ['fifi', 'lantern_moth'], weight: 8 },
  { species: ['fifi_king', 'momo_queen'], weight: 10 },  // D1
  { species: ['momo_queen', 'gora'], weight: 10 },
  { species: ['mimi_king', 'sisi'], weight: 9 },         // D3
  { species: ['momo_queen', 'lulu_king'], weight: 9 },   // D4
  { species: ['fifi_king', 'mimi_king'], weight: 9 },    // D5
  { species: ['gora', 'phantom_tail_fox'], weight: 8 },
  { species: ['fifi', 'fifi_king'], weight: 8 },         // D7
  { species: ['lulu', 'mimi_king'], weight: 8 },
  { species: ['mimi', 'mimi_king'], weight: 8 },         // D9
  { species: ['kiki', 'searing_hawk'], weight: 7 },
  { species: ['pipi', 'mimi_king'], weight: 7 },
  { species: ['momo_queen', 'fifi_king'], weight: 7 },   // D12
];

const ACT2_ENCOUNTERS_3V3: readonly { species: string[]; weight: number }[] = [
  { species: ['torch_fox', 'phantom_tail_fox', 'gora'], weight: 9 },
  { species: ['molten_beetle', 'lulu_king', 'momo_queen'], weight: 9 },
  { species: ['moss_beast', 'coal_guard', 'searing_hawk'], weight: 9 },
  { species: ['phantom_tail_fox', 'moss_beast', 'gora'], weight: 9 },
  { species: ['searing_hawk', 'coal_guard', 'fifi_king'], weight: 9 },
  { species: ['molten_larva', 'searing_hawk', 'lulu_king'], weight: 7 },
  { species: ['light_moss', 'coal_guard', 'momo_queen'], weight: 7 },
  { species: ['fire_fox', 'coal_guard', 'momo_queen'], weight: 7 },
  { species: ['ember_hawk', 'coal_guard', 'fifi_king'], weight: 7 },
  { species: ['coal_guard', 'fifi_king', 'momo_queen'], weight: 9 },
  { species: ['lantern_moth', 'coal_guard', 'mimi_king'], weight: 9 },
  { species: ['coal', 'coal_guard', 'fifi'], weight: 7 },
  { species: ['candle', 'fifi_king', 'momo'], weight: 7 },
  { species: ['fifi_king', 'fifi_king', 'momo_queen'], weight: 12 },    // T1
  { species: ['gora', 'momo_queen', 'lulu_king'], weight: 12 },
  { species: ['mimi_king', 'mimi_king', 'sisi'], weight: 10 },          // T3
  { species: ['sisi', 'mimi_king', 'lulu_king'], weight: 9 },
  { species: ['sisi', 'sisi', 'mimi_king'], weight: 9 },                // T5
  { species: ['momo_queen', 'momo_queen', 'fifi_king'], weight: 8 },    // T6
  { species: ['fifi', 'fifi_king', 'fifi'], weight: 8 },                // T7
  { species: ['lulu', 'mimi_king', 'gora'], weight: 8 },
  { species: ['mimi', 'mimi_king', 'sisi'], weight: 7 },                // T9
  { species: ['kiki', 'mimi_king', 'sisi'], weight: 6 },
  { species: ['fifi_king', 'mimi_king', 'fifi_king'], weight: 6 },      // T11
  { species: ['momo_queen', 'fifi_king', 'mimi_king'], weight: 5 },     // T12
];

const ACT2_ENCOUNTERS_4V4: readonly { species: string[]; weight: number }[] = [
  { species: ['torch_fox', 'phantom_tail_fox', 'gora', 'moss_beast'], weight: 10 },
  { species: ['molten_beetle', 'lantern_moth', 'gora', 'momo_queen'], weight: 10 },
  { species: ['moss_beast', 'molten_beetle', 'gora', 'momo_queen'], weight: 10 },
  { species: ['phantom_tail_fox', 'moss_beast', 'gora', 'momo_queen'], weight: 10 },
  { species: ['searing_hawk', 'coal_guard', 'fifi_king', 'mimi_king'], weight: 10 },
  { species: ['coal_guard', 'fifi_king', 'momo_queen', 'mimi_king'], weight: 10 },
  { species: ['lantern_moth', 'gora', 'sisi', 'fifi_king'], weight: 10 },
  { species: ['fifi_king', 'fifi_king', 'momo_queen', 'mimi_king'], weight: 16 },       // F1
  { species: ['momo_queen', 'mimi_king', 'gora', 'lulu_king'], weight: 16 },
  { species: ['mimi_king', 'mimi_king', 'sisi', 'gora'], weight: 14 },                  // F3
  { species: ['momo_queen', 'momo_queen', 'fifi_king', 'lulu_king'], weight: 12 },      // F4
  { species: ['fifi', 'fifi_king', 'mimi_king', 'momo_queen'], weight: 10 },            // F5
  { species: ['gora', 'lulu_king', 'fifi_king', 'momo_queen'], weight: 10 },            // F6
  { species: ['sisi', 'sisi', 'fifi_king', 'mimi_king'], weight: 8 },                   // F7
  { species: ['lulu', 'mimi_king', 'sisi', 'momo_queen'], weight: 6 },
  { species: ['mimi', 'mimi_king', 'fifi_king', 'momo_queen'], weight: 4 },             // F9
  { species: ['fifi', 'fifi', 'fifi', 'lulu_king'], weight: 4 },                        // F10
];

const ACT2_ELITE_ENCOUNTERS: readonly { species: string; weight: number }[] = [
  { species: 'molten_beast', weight: 16 },
  { species: 'solar_eagle', weight: 16 },
  { species: 'nine_tail_sovereign', weight: 16 },
  { species: 'furnace_beast', weight: 16 },
  { species: 'mimi_god', weight: 18 },     // E2 深渊蛇王
  { species: 'fifi_god', weight: 17 },     // E3 灼天
  { species: 'momo_god', weight: 17 },     // E4 迅天
  { species: 'sisi_god', weight: 14 },    // E6 棘刺王
];

const ACT2_GAUNTLET_2: readonly { species: string[]; weight: number }[] = [
  { species: ['molten_beetle', 'momo_queen'], weight: 16 },
  { species: ['phantom_tail_fox', 'sisi'], weight: 32 },
  { species: ['searing_hawk', 'coal_guard'], weight: 16 },
  { species: ['molten_larva', 'sisi'], weight: 16 },
  { species: ['fire_fox', 'sisi'], weight: 32 },
  { species: ['ember_hawk', 'fifi_king'], weight: 16 },
  { species: ['coal_guard', 'fifi_king'], weight: 16 },
  { species: ['coal_guard', 'momo_queen'], weight: 16 },
  { species: ['fifi_king', 'fifi_king'], weight: 20 },       // G1
  { species: ['momo_queen', 'sisi'], weight: 18 },
  { species: ['mimi_king', 'sisi'], weight: 18 },            // G3
  { species: ['fifi', 'fifi_king'], weight: 16 },            // G4
  { species: ['sisi', 'sisi'], weight: 14 },
  { species: ['sisi', 'mimi_king'], weight: 14 },            // G6
];

const ACT2_GAUNTLET_3: readonly { species: string[]; weight: number }[] = [
  { species: ['molten_larva', 'molten_beetle', 'momo_queen'], weight: 16 },
  { species: ['fire_fox', 'phantom_tail_fox', 'sisi'], weight: 32 },
  { species: ['ember_hawk', 'searing_hawk', 'coal_guard'], weight: 16 },
  { species: ['molten_larva', 'sisi', 'momo_queen'], weight: 16 },
  { species: ['ember_hawk', 'coal_guard', 'fifi_king'], weight: 16 },
  { species: ['coal', 'coal_guard', 'fifi_king'], weight: 16 },
  { species: ['coal', 'coal_guard', 'sisi'], weight: 16 },
  { species: ['fifi_king', 'mimi_king', 'fifi_king'], weight: 20 },       // G7
  { species: ['momo_queen', 'sisi', 'momo_queen'], weight: 18 },
  { species: ['sisi', 'sisi', 'sisi'], weight: 18 },
  { species: ['fifi', 'fifi_king', 'mimi_king'], weight: 16 },            // G10
  { species: ['mimi_king', 'mimi_king', 'sisi'], weight: 14 },            // G11
  { species: ['fifi_king', 'sisi', 'momo_queen'], weight: 14 },
];

// ---- 第 3 幕固定遭遇表（第三幕敌人.md 设计） ----
const ACT3_ENCOUNTERS_1V1: readonly { species: string[]; weight: number }[] = [
  { species: ['molten_beetle'], weight: 8 },
  { species: ['phantom_tail_fox'], weight: 8 },
  { species: ['searing_hawk'], weight: 8 },
  { species: ['coal_guard'], weight: 8 },
  { species: ['furnace_beast'], weight: 10 },
  { species: ['molten_beast'], weight: 10 },
  { species: ['solar_eagle'], weight: 10 },
  { species: ['nine_tail_sovereign'], weight: 10 },
  { species: ['mimi_god'], weight: 15 },    // S2 深渊蛇王
  { species: ['fifi_god'], weight: 14 },    // S3 灼天
  { species: ['momo_god'], weight: 14 },    // S4 迅天
  { species: ['sisi_god'], weight: 12 },    // S6 棘刺王
  { species: ['momo_queen'], weight: 9 },   // S7 迅牙
  { species: ['fifi_king'], weight: 8 },    // S8 灼刃
  { species: ['sisi'], weight: 8 },
];

const ACT3_ENCOUNTERS_2V2: readonly { species: string[]; weight: number }[] = [
  { species: ['torch_fox', 'phantom_tail_fox'], weight: 9 },
  { species: ['torch_fox_lord', 'phantom_tail_fox'], weight: 8 },
  { species: ['molten_beetle', 'eternal_moth'], weight: 9 },
  { species: ['moss_beast', 'molten_beast'], weight: 9 },
  { species: ['phantom_tail_fox', 'solar_spirit'], weight: 9 },
  { species: ['searing_hawk', 'furnace_beast'], weight: 9 },
  { species: ['coal_guard', 'mimi_god'], weight: 9 },
  { species: ['lantern_moth', 'fifi_god'], weight: 9 },
  { species: ['furnace_beast', 'lulu_god'], weight: 8 },
  { species: ['molten_beast', 'lantern_moth'], weight: 8 },
  { species: ['solar_eagle', 'coal_guard'], weight: 8 },
  { species: ['solar_spirit', 'molten_beetle'], weight: 8 },
  { species: ['nine_tail_sovereign', 'moss_beast'], weight: 8 },
  { species: ['eternal_moth', 'fifi_god'], weight: 8 },
  { species: ['fifi_king', 'fifi_god'], weight: 10 },       // D1 灼刃+灼天
  { species: ['lulu_king', 'momo_god'], weight: 10 },
  { species: ['mimi_king', 'mimi_god'], weight: 9 },        // D3 蟒影+深渊蛇王
  { species: ['gora', 'momo_god'], weight: 9 },
  { species: ['sisi', 'solar_eagle'], weight: 8 },
  { species: ['momo_queen', 'momo_god'], weight: 8 },       // D6 迅牙+迅天
  { species: ['fifi_king', 'mimi_king'], weight: 7 },       // D7 灼刃+蟒影
  { species: ['lulu_king', 'momo_queen'], weight: 7 },
  { species: ['momo_queen', 'fifi_king'], weight: 7 },      // D9 迅牙+灼刃
  { species: ['mimi_king', 'sisi'], weight: 6 },            // D10 蟒影+棘尾
  { species: ['gora_god', 'fifi_god'], weight: 6 },         // D11 铁壁神+灼天
  { species: ['lulu_god', 'momo_god'], weight: 5 },         // D12 泡泡龙神+迅天
  { species: ['mimi_god', 'sisi_god'], weight: 4 },         // D13 深渊蛇王+棘刺王
  { species: ['momo_god', 'fifi_god'], weight: 4 },         // D14 迅天+灼天
];

const ACT3_ENCOUNTERS_3V3: readonly { species: string[]; weight: number }[] = [
  { species: ['torch_fox_lord', 'phantom_tail_fox', 'gora'], weight: 9 },
  { species: ['molten_beetle', 'eternal_moth', 'momo_queen'], weight: 9 },
  { species: ['moss_beast', 'furnace_beast', 'searing_hawk'], weight: 9 },
  { species: ['phantom_tail_fox', 'solar_spirit', 'searing_hawk'], weight: 9 },
  { species: ['searing_hawk', 'furnace_beast', 'fifi_king'], weight: 9 },
  { species: ['furnace_beast', 'fifi_king', 'momo_queen'], weight: 9 },
  { species: ['molten_beast', 'lantern_moth', 'momo_queen'], weight: 9 },
  { species: ['solar_eagle', 'coal_guard', 'lulu_king'], weight: 9 },
  { species: ['solar_spirit', 'molten_beetle', 'searing_hawk'], weight: 9 },
  { species: ['nine_tail_sovereign', 'moss_beast', 'gora'], weight: 9 },
  { species: ['eternal_moth', 'gora', 'mimi_king'], weight: 9 },
  { species: ['coal_guard', 'lantern_moth', 'fifi_god'], weight: 8 },
  { species: ['fifi_king', 'fifi_king', 'fifi_god'], weight: 12 },         // T1
  { species: ['gora', 'momo_queen', 'lulu_god'], weight: 12 },
  { species: ['mimi_king', 'mimi_king', 'mimi_god'], weight: 10 },         // T3
  { species: ['gora', 'mimi_king', 'momo_god'], weight: 9 },
  { species: ['sisi', 'sisi', 'sisi_god'], weight: 9 },                    // T5
  { species: ['momo_queen', 'momo_queen', 'momo_god'], weight: 8 },        // T6
  { species: ['fifi_king', 'mimi_king', 'fifi_god'], weight: 8 },          // T7
  { species: ['lulu_king', 'gora', 'momo_god'], weight: 7 },
  { species: ['mimi_king', 'sisi', 'mimi_god'], weight: 7 },              // T9
  { species: ['gora_god', 'fifi_king', 'momo_queen'], weight: 6 },
  { species: ['lulu_god', 'momo_queen', 'fifi_king'], weight: 6 },
  { species: ['sisi_god', 'momo_queen', 'mimi_king'], weight: 6 },
];

const ACT3_ENCOUNTERS_4V4: readonly { species: string[]; weight: number }[] = [
  { species: ['torch_fox_lord', 'nine_tail_sovereign', 'moss_beast', 'gora'], weight: 10 },
  { species: ['molten_beetle', 'eternal_moth', 'gora', 'momo_god'], weight: 10 },
  { species: ['moss_beast', 'molten_beast', 'gora', 'momo_god'], weight: 10 },
  { species: ['phantom_tail_fox', 'solar_spirit', 'gora', 'momo_god'], weight: 10 },
  { species: ['searing_hawk', 'furnace_beast', 'fifi_king', 'mimi_god'], weight: 10 },
  { species: ['furnace_beast', 'lulu_god', 'searing_hawk', 'momo_queen'], weight: 10 },
  { species: ['molten_beast', 'solar_eagle', 'lantern_moth', 'momo_queen'], weight: 10 },
  { species: ['solar_spirit', 'molten_beast', 'searing_hawk', 'momo_queen'], weight: 10 },
  { species: ['nine_tail_sovereign', 'solar_spirit', 'gora', 'momo_queen'], weight: 10 },
  { species: ['eternal_moth', 'gora', 'momo_queen', 'fifi_king'], weight: 10 },
  { species: ['fifi_god', 'fifi_king', 'fifi_king', 'momo_queen'], weight: 14 },    // F1
  { species: ['lulu_god', 'momo_queen', 'mimi_king', 'gora'], weight: 14 },
  { species: ['mimi_god', 'mimi_king', 'mimi_king', 'sisi'], weight: 12 },          // F3
  { species: ['gora_god', 'momo_queen', 'mimi_king', 'sisi'], weight: 11 },
  { species: ['sisi_god', 'sisi', 'sisi', 'mimi_king'], weight: 10 },              // F5
  { species: ['momo_god', 'momo_queen', 'momo_queen', 'fifi_king'], weight: 10 },  // F6
  { species: ['fifi_god', 'lulu_god', 'fifi_king', 'momo_queen'], weight: 9 },
  { species: ['mimi_god', 'gora_god', 'mimi_king', 'gora'], weight: 8 },           // F8
  { species: ['sisi_god', 'momo_god', 'momo_queen', 'fifi_king'], weight: 6 },     // F9
  { species: ['fifi_god', 'mimi_god', 'fifi_king', 'mimi_king'], weight: 6 },      // F10
];

const ACT3_ELITE_ENCOUNTERS: readonly { species: string[]; weight: number }[] = [
  { species: ['torch_fox_lord', 'nine_tail_sovereign'], weight: 16 },
  { species: ['nine_tail_sovereign', 'solar_spirit'], weight: 16 },
  { species: ['solar_spirit', 'molten_beast'], weight: 16 },
  { species: ['furnace_beast', 'lulu_god'], weight: 16 },
  { species: ['molten_beast', 'solar_eagle'], weight: 16 },
  { species: ['eternal_moth', 'fifi_god'], weight: 16 },
  { species: ['gora_god', 'momo_god'], weight: 20 },
  { species: ['mimi_god', 'fifi_god'], weight: 18 },     // E2 深渊蛇王+灼天
  { species: ['sisi_god', 'momo_god'], weight: 17 },     // E3 棘刺王+迅天
  { species: ['momo_god', 'fifi_god'], weight: 16 },     // E4 迅天+灼天
  { species: ['gora_god', 'mimi_god'], weight: 15 },     // E5 铁壁神+深渊蛇王
  { species: ['lulu_god', 'sisi_god'], weight: 14 },     // E6 泡泡龙神+棘刺王
];

const ACT3_ARENA_ENCOUNTERS: readonly { species: string; weight: number }[] = [
  { species: 'nine_tail_sovereign', weight: 16 },
  { species: 'furnace_beast', weight: 16 },
  { species: 'molten_beast', weight: 16 },
  { species: 'solar_eagle', weight: 16 },
  { species: 'mimi_god', weight: 18 },
  { species: 'fifi_god', weight: 17 },
  { species: 'momo_god', weight: 17 },
  { species: 'sisi_god', weight: 14 },
];

const ACT3_GAUNTLET_2: readonly { species: string[]; weight: number }[] = [
  { species: ['nine_tail_sovereign', 'nine_tail_sovereign'], weight: 16 },
  { species: ['nine_tail_sovereign', 'molten_beast'], weight: 16 },
  { species: ['furnace_beast', 'momo_god'], weight: 32 },
  { species: ['molten_beast', 'solar_eagle'], weight: 16 },
  { species: ['fifi_god', 'fifi_god'], weight: 20 },             // G1 灼天→灼天
  { species: ['momo_god', 'sisi_god'], weight: 18 },
  { species: ['mimi_god', 'sisi_god'], weight: 18 },             // G3 深渊蛇王→棘刺王
  { species: ['momo_god', 'fifi_god'], weight: 16 },             // G4 迅天→灼天
  { species: ['sisi_god', 'sisi_god'], weight: 14 },
  { species: ['sisi_god', 'mimi_god'], weight: 14 },             // G6 棘刺王→深渊蛇王
];

const ACT3_GAUNTLET_3: readonly { species: string[]; weight: number }[] = [
  { species: ['nine_tail_sovereign', 'nine_tail_sovereign', 'sisi_god'], weight: 16 },
  { species: ['nine_tail_sovereign', 'solar_eagle', 'sisi_god'], weight: 16 },
  { species: ['furnace_beast', 'fifi_god', 'sisi_god'], weight: 16 },
  { species: ['molten_beast', 'solar_eagle', 'momo_god'], weight: 16 },
  { species: ['furnace_beast', 'momo_god', 'mimi_god'], weight: 16 },
  { species: ['fifi_god', 'mimi_god', 'fifi_god'], weight: 20 },       // G7 灼天→深渊蛇王→灼天
  { species: ['momo_god', 'sisi_god', 'momo_god'], weight: 18 },
  { species: ['sisi_god', 'sisi_god', 'sisi_god'], weight: 18 },
  { species: ['momo_god', 'momo_god', 'fifi_god'], weight: 16 },     // G10 迅天→迅天→灼天
  { species: ['mimi_god', 'mimi_god', 'sisi_god'], weight: 14 },     // G11 深渊蛇王→深渊蛇王→棘刺王
  { species: ['fifi_god', 'sisi_god', 'momo_god'], weight: 14 },
];

const ACT3_GUARDIAN_1V1: readonly { species: string; weight: number }[] = [
  { species: 'nine_tail_sovereign', weight: 24 },
  { species: 'furnace_beast', weight: 24 },
  { species: 'molten_beast', weight: 24 },
  { species: 'solar_eagle', weight: 24 },
  { species: 'mimi_god', weight: 26 },
  { species: 'fifi_god', weight: 24 },
  { species: 'momo_god', weight: 22 },
  { species: 'sisi_god', weight: 22 },
];

const ACT3_GUARDIAN_2V2: readonly { species: string[]; weight: number }[] = [
  { species: ['torch_fox_lord', 'nine_tail_sovereign'], weight: 30 },
  { species: ['nine_tail_sovereign', 'solar_spirit'], weight: 30 },
  { species: ['solar_spirit', 'molten_beast'], weight: 30 },
  { species: ['furnace_beast', 'lulu_god'], weight: 30 },
  { species: ['molten_beast', 'solar_eagle'], weight: 30 },
  { species: ['eternal_moth', 'fifi_god'], weight: 30 },
  { species: ['gora_god', 'mimi_god'], weight: 38 },
  { species: ['mimi_god', 'fifi_god'], weight: 34 },     // W6 深渊蛇王+灼天
  { species: ['sisi_god', 'momo_god'], weight: 28 },     // W7 棘刺王+迅天
];

/** 中间层节点类型加权随机：越靠后精英越多，前期偏战斗/事件；奇遇关为低概率稀有节点；休整并入商人（不再生成 rest） */
function middleNodeType(rng: () => number, progress: number, difficulty?: Difficulty): NodeType {
  const r = rng();
  const eliteBoost = difficulty ? DIFFICULTY_CONFIG[difficulty].eliteBoost : 0;
  // 战斗类节点变体：80% 普通遭遇战、10% 斗兽场（1v1）、10% 车轮战（轮换上阵）
  const battleVariant = (): NodeType => {
    const vr = rng();
    if (vr < 0.8) return 'battle';
    if (vr < 0.9) return 'arena';
    return 'gauntlet';
  };
  if (progress < 0.2) {
    if (r < 0.77 - eliteBoost) return battleVariant();
    if (r < 0.92) return 'event';
    return 'elite';
  }
  if (progress < 0.6) {
    if (r < 0.34 - eliteBoost) return battleVariant();
    if (r < 0.51) return 'shop';
    if (r < 0.73) return 'event';
    if (r < 0.9 + eliteBoost) return 'elite';
    if (r < 0.94) return 'special';
    return 'watchtower';
  }
  if (r < 0.3 - eliteBoost) return battleVariant();
  if (r < 0.5 + eliteBoost) return 'elite';
  if (r < 0.68) return 'shop';
  if (r < 0.76) return 'event';
  if (r < 0.85) return 'special';
  if (r < 0.89) return 'watchtower';
  return battleVariant();
}

/** Boss 小怪映射表：每个 boss 的小怪 speciesId 列表 */
export const BOSS_MINIONS: Record<string, string[]> = {
  boss_vine: ['boss_minion_tree_guard', 'boss_minion_thorn'],
  boss_crab: ['boss_minion_shrimp', 'boss_minion_hermit'],
  boss_golem: ['boss_minion_rock', 'boss_minion_crystal'],
  boss_dark: ['boss_minion_shadow_servant', 'boss_minion_shadow_bat'],
  boss_moss: ['boss_minion_spore_sac', 'boss_minion_slug'],
  boss_ghost: ['boss_minion_ghost_sailor', 'boss_minion_phantom'],
  boss_fire: ['boss_minion_lava_golem', 'boss_minion_fire_sprite'],
  boss_dragon: ['boss_minion_chain_guard', 'boss_minion_chain_smith'],
  boss_demon: ['boss_minion_demon_imp', 'boss_minion_hellhound'],
};

/** 主模式固定组合；林地按整组生态筛选，各幕单体与组合均经过独立校验。 */
export const MIXED_ENCOUNTER_TABLES = {
  ACT1_ENCOUNTERS_1V1,
  ACT1_ENCOUNTERS_2V2,
  ACT1_ENCOUNTERS_3V3,
  ACT1_ELITE_ENCOUNTERS,
  ACT1_GAUNTLET_2,
  ACT1_GAUNTLET_3,
  ACT2_ENCOUNTERS_1V1,
  ACT2_ENCOUNTERS_2V2,
  ACT2_ENCOUNTERS_3V3,
  ACT2_ENCOUNTERS_4V4,
  ACT2_ELITE_ENCOUNTERS,
  ACT2_GAUNTLET_2,
  ACT2_GAUNTLET_3,
  ACT3_ENCOUNTERS_1V1,
  ACT3_ENCOUNTERS_2V2,
  ACT3_ENCOUNTERS_3V3,
  ACT3_ENCOUNTERS_4V4,
  ACT3_ELITE_ENCOUNTERS,
  ACT3_ARENA_ENCOUNTERS,
  ACT3_GAUNTLET_2,
  ACT3_GAUNTLET_3,
  ACT3_GUARDIAN_1V1,
  ACT3_GUARDIAN_2V2,
};

type EncounterEntry = readonly [string, number] | { species: string | string[]; weight: number } | { sequence: string[]; weight: number };

function encounterSpecies(entry: EncounterEntry): readonly string[] {
  if ('sequence' in entry) return entry.sequence;
  if ('species' in entry) return typeof entry.species === 'string' ? [entry.species] : entry.species;
  return [entry[0]];
}

const forestSpecies = new Set([
  ...MAIN_REGIONS.emerald_forest.basePool,
  ...MAIN_REGIONS.emerald_forest.evo1Pool,
  ...MAIN_REGIONS.emerald_forest.evo2Pool,
]);

function filterForestTable<T extends EncounterEntry>(name: string, table: readonly T[]): readonly T[] {
  const filtered = table.filter(entry => encounterSpecies(entry).every(id => forestSpecies.has(id)));
  if (filtered.length === 0) throw new Error(`翠影林地遭遇表为空：${name}`);
  return filtered;
}

export const FOREST_ENCOUNTER_TABLES = {
  ACT1_ENCOUNTERS_1V1: filterForestTable('ACT1_ENCOUNTERS_1V1', ACT1_ENCOUNTERS_1V1),
  ACT1_ENCOUNTERS_2V2: filterForestTable('ACT1_ENCOUNTERS_2V2', ACT1_ENCOUNTERS_2V2),
  ACT1_ENCOUNTERS_3V3: filterForestTable('ACT1_ENCOUNTERS_3V3', ACT1_ENCOUNTERS_3V3),
  ACT1_ELITE_ENCOUNTERS: filterForestTable('ACT1_ELITE_ENCOUNTERS', ACT1_ELITE_ENCOUNTERS),
  ACT1_GAUNTLET_2: filterForestTable('ACT1_GAUNTLET_2', ACT1_GAUNTLET_2),
  ACT1_GAUNTLET_3: filterForestTable('ACT1_GAUNTLET_3', ACT1_GAUNTLET_3),
  ACT2_ENCOUNTERS_1V1: filterForestTable('ACT2_ENCOUNTERS_1V1', ACT2_ENCOUNTERS_1V1),
  ACT2_ENCOUNTERS_2V2: filterForestTable('ACT2_ENCOUNTERS_2V2', ACT2_ENCOUNTERS_2V2),
  ACT2_ENCOUNTERS_3V3: filterForestTable('ACT2_ENCOUNTERS_3V3', ACT2_ENCOUNTERS_3V3),
  ACT2_ENCOUNTERS_4V4: filterForestTable('ACT2_ENCOUNTERS_4V4', ACT2_ENCOUNTERS_4V4),
  ACT2_ELITE_ENCOUNTERS: filterForestTable('ACT2_ELITE_ENCOUNTERS', ACT2_ELITE_ENCOUNTERS),
  ACT2_GAUNTLET_2: filterForestTable('ACT2_GAUNTLET_2', ACT2_GAUNTLET_2),
  ACT2_GAUNTLET_3: filterForestTable('ACT2_GAUNTLET_3', ACT2_GAUNTLET_3),
  ACT3_ENCOUNTERS_1V1: filterForestTable('ACT3_ENCOUNTERS_1V1', ACT3_ENCOUNTERS_1V1),
  ACT3_ENCOUNTERS_2V2: filterForestTable('ACT3_ENCOUNTERS_2V2', ACT3_ENCOUNTERS_2V2),
  ACT3_ENCOUNTERS_3V3: filterForestTable('ACT3_ENCOUNTERS_3V3', ACT3_ENCOUNTERS_3V3),
  ACT3_ENCOUNTERS_4V4: filterForestTable('ACT3_ENCOUNTERS_4V4', ACT3_ENCOUNTERS_4V4),
  ACT3_ELITE_ENCOUNTERS: filterForestTable('ACT3_ELITE_ENCOUNTERS', ACT3_ELITE_ENCOUNTERS),
  ACT3_ARENA_ENCOUNTERS: filterForestTable('ACT3_ARENA_ENCOUNTERS', ACT3_ARENA_ENCOUNTERS),
  ACT3_GAUNTLET_2: filterForestTable('ACT3_GAUNTLET_2', ACT3_GAUNTLET_2),
  ACT3_GAUNTLET_3: filterForestTable('ACT3_GAUNTLET_3', ACT3_GAUNTLET_3),
  ACT3_GUARDIAN_1V1: filterForestTable('ACT3_GUARDIAN_1V1', ACT3_GUARDIAN_1V1),
  ACT3_GUARDIAN_2V2: filterForestTable('ACT3_GUARDIAN_2V2', ACT3_GUARDIAN_2V2),
};

/** 事件保持原人数和品阶，用固定搭配代替逐只随机；消耗同样数量的随机数，保留后续奖励抽取节奏。 */
function eventBattleEnemies(rng: () => number, act: number, count: number, region: MainRegionId): { speciesId: string }[] {
  const rolls = Array.from({ length: count }, () => rng());
  const tables = region === 'mixed' ? MIXED_ENCOUNTER_TABLES : FOREST_ENCOUNTER_TABLES;
  const table = act === 1
    ? count === 1 ? tables.ACT1_ENCOUNTERS_1V1 : count === 2 ? tables.ACT1_ENCOUNTERS_2V2 : tables.ACT1_ENCOUNTERS_3V3
    : act === 2
      ? count === 1 ? tables.ACT2_ENCOUNTERS_1V1 : count === 2 ? tables.ACT2_ENCOUNTERS_2V2 : tables.ACT2_ENCOUNTERS_3V3
      : count === 1 ? tables.ACT3_ENCOUNTERS_1V1 : tables.ACT3_ELITE_ENCOUNTERS;
  const candidates = table.filter(entry => entry.species.every(id => getMonster(id).rank === act));
  const picked = weightedPick(() => rolls[0], candidates.map(entry => [entry, entry.weight] as const));
  const species = [...picked.species];
  if (act === 3 && count === 3) {
    const solos = tables.ACT3_ENCOUNTERS_1V1.filter(entry => getMonster(entry.species[0]).rank === 3);
    species.push(weightedPick(() => rolls[2], solos.map(entry => [entry.species[0], entry.weight] as const)));
  }
  return species.map(speciesId => ({ speciesId }));
}

export function buildEncounter(
  rng: () => number,
  type: NodeType,
  act: number,
  progress: number,
  bossId?: string,
  gauntletSize?: 2 | 3,
  region: MainRegionId = 'mixed',
): { speciesId: string }[] {
  const {
    ACT1_ENCOUNTERS_1V1,
    ACT1_ENCOUNTERS_2V2,
    ACT1_ENCOUNTERS_3V3,
    ACT1_ELITE_ENCOUNTERS,
    ACT1_GAUNTLET_2,
    ACT1_GAUNTLET_3,
    ACT2_ENCOUNTERS_1V1,
    ACT2_ENCOUNTERS_2V2,
    ACT2_ENCOUNTERS_3V3,
    ACT2_ENCOUNTERS_4V4,
    ACT2_ELITE_ENCOUNTERS,
    ACT2_GAUNTLET_2,
    ACT2_GAUNTLET_3,
    ACT3_ENCOUNTERS_1V1,
    ACT3_ENCOUNTERS_2V2,
    ACT3_ENCOUNTERS_3V3,
    ACT3_ENCOUNTERS_4V4,
    ACT3_ELITE_ENCOUNTERS,
    ACT3_ARENA_ENCOUNTERS,
    ACT3_GAUNTLET_2,
    ACT3_GAUNTLET_3,
    ACT3_GUARDIAN_1V1,
    ACT3_GUARDIAN_2V2,
  } = region === 'mixed' ? MIXED_ENCOUNTER_TABLES : FOREST_ENCOUNTER_TABLES;
  if (type === 'boss') {
    const id = bossId ?? ACT_BOSS_POOLS[act][0];
    const minions = BOSS_MINIONS[id] ?? [];
    return [{ speciesId: id }, ...minions.map((m) => ({ speciesId: m }))];
  }
  if (type === 'battle' && act >= 1 && act <= 3) {
    const tables = act === 1 ? [ACT1_ENCOUNTERS_1V1, ACT1_ENCOUNTERS_2V2, ACT1_ENCOUNTERS_3V3]
      : act === 2 ? [ACT2_ENCOUNTERS_1V1, ACT2_ENCOUNTERS_2V2, ACT2_ENCOUNTERS_3V3, ACT2_ENCOUNTERS_4V4]
        : [ACT3_ENCOUNTERS_1V1, ACT3_ENCOUNTERS_2V2, ACT3_ENCOUNTERS_3V3, ACT3_ENCOUNTERS_4V4];
    return pickProgressEncounter(rng, act, progress, tables, region);
  }
  // ---- 第 1 幕：固定遭遇表（加权抽取） ----
  if (act === 1) {
    if (type === 'elite') {
      return [{ speciesId: weightedPick(rng, ACT1_ELITE_ENCOUNTERS) }];
    }
    if (type === 'arena') {
      return [{ speciesId: weightedPick(rng, ACT1_ELITE_ENCOUNTERS) }];
    }
    if (type === 'gauntlet') {
      const size = gauntletSize ?? 2;
      const table = size === 3 ? ACT1_GAUNTLET_3 : ACT1_GAUNTLET_2;
      const picked = weightedPick(rng, table.map((e) => [e, e.weight] as const));
      return picked.sequence.map((speciesId) => ({ speciesId }));
    }
    if (type === 'guardian') {
      return [{ speciesId: weightedPick(rng, ACT1_ELITE_ENCOUNTERS) }];
    }
  }
  // ---- 第 2 幕：固定遭遇表（第二幕敌人.md 设计） ----
  if (act === 2) {
    if (type === 'elite') {
      return [{ speciesId: weightedPick(rng, ACT2_ELITE_ENCOUNTERS.map((e) => [e, e.weight] as const)).species }];
    }
    if (type === 'arena') {
      return [{ speciesId: weightedPick(rng, ACT2_ELITE_ENCOUNTERS.map((e) => [e, e.weight] as const)).species }];
    }
    if (type === 'gauntlet') {
      const size = gauntletSize ?? (2 + Math.floor(rng() * 2));
      const table = size === 3 ? ACT2_GAUNTLET_3 : ACT2_GAUNTLET_2;
      return weightedPick(rng, table.map((e) => [e, e.weight] as const)).species.map((speciesId) => ({ speciesId }));
    }
    if (type === 'guardian') {
      return [{ speciesId: weightedPick(rng, ACT2_ELITE_ENCOUNTERS.map((e) => [e, e.weight] as const)).species }];
    }
  }
  // ---- 第 3 幕：固定遭遇表（第三幕敌人.md 设计） ----
  if (act === 3) {
    if (type === 'elite') {
      const picked = weightedPick(rng, ACT3_ELITE_ENCOUNTERS.map((e) => [e, e.weight] as const));
      return picked.species.map((speciesId) => ({ speciesId }));
    }
    if (type === 'arena') {
      return [{ speciesId: weightedPick(rng, ACT3_ARENA_ENCOUNTERS.map((e) => [e, e.weight] as const)).species }];
    }
    if (type === 'gauntlet') {
      const size = gauntletSize ?? (2 + Math.floor(rng() * 2));
      const table = size === 3 ? ACT3_GAUNTLET_3 : ACT3_GAUNTLET_2;
      return weightedPick(rng, table.map((e) => [e, e.weight] as const)).species.map((speciesId) => ({ speciesId }));
    }
    if (type === 'guardian') {
      // 50% 概率 2v2 双传奇守卫，50% 单传奇
      if (rng() < 0.5) {
        const picked = weightedPick(rng, ACT3_GUARDIAN_2V2.map((e) => [e, e.weight] as const));
        return picked.species.map((speciesId) => ({ speciesId }));
      }
      return [{ speciesId: weightedPick(rng, ACT3_GUARDIAN_1V1.map((e) => [e, e.weight] as const)).species }];
    }
  }
  // fallback — 理论上不会到这里
  return [{ speciesId: 'momo' }];
}

/** 随机事件：多选一抉择，风险与收益并存（结果在生成时用种子预掷，可复现） */
export function buildEvent(rng: () => number, act: number, region: MainRegionId = 'mixed', previousEventTitles: readonly string[] = []): EventNode {
  // 幕次专属池
  const pool: string[] = [];
  if (act === 1) {
    pool.push('spring', 'altar', 'merchant', 'egg', 'wheel', 'ruins', 'campfire');
  } else {
    pool.push('spring', 'altar', 'merchant', 'egg', '行商',
              'wheel', 'gambler', 'altar2', 'ruins', 'cursed_chest',
              '精灵', '训练');
  }
  // 只降低相邻上一层同类事件的权重，保留重复可能；不额外重抽随机数。
  const pick2 = previousEventTitles.length === 0 ? pool[Math.floor(rng() * pool.length)]
    : weightedPick(rng, pool.map(type => [type, previousEventTitles.includes(EVENT_TYPE_LABELS[type]) ? 0.2 : 1] as const));

  return buildEventByType(rng, pick2, act, region);
}

/** 事件类型映射：eventType → 中文标题（供自定义测试选择） */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  spring: '神秘泉水',
  altar: '古老祭坛',
  merchant: '流浪商人',
  egg: '神秘蛋',
  '行商': '神秘行商',
  wheel: '命运之轮',
  ruins: '宠物遗迹',
  campfire: '冒险者营地',
  gambler: '神秘商人的赌局',
  altar2: '灵魂祭坛',
  cursed_chest: '诅咒宝箱',
  '精灵': '流浪精灵',
  '训练': '训练场挑战',
};

/** 按类型构建事件（可导出供自定义测试直接调用） */
export function buildEventByType(rng: () => number, type: string, act: number, region: MainRegionId = 'mixed'): EventNode {
  const c = (id: number, label: string, desc: string, kind: EventChoice['kind'], extra?: Partial<EventChoice>): EventChoice => ({
    id: `e${id}`,
    label,
    desc,
    kind,
    ...extra,
  });

  if (type === 'spring') {
    return {
      title: '神秘泉水',
      desc: '一汪泛着微光的泉水在密林深处静静流淌，似有治愈之力。',
      choices: [
        c(1, '饮用泉水', '全体恢复50%生命', 'heal', { amount: 50 }),
        c(2, '以泉水入药', '消耗1个随机持有的食物，获得1个生命药水', 'item', { itemId: 'hp_up', consumeRandomFood: true }),
      ],
    };
  }
  if (type === 'altar') {
    const boost = () => rng() < 0.5 ? { boostStat: 'spd' as const, amount: 1 } : { boostStat: 'hp' as const, amount: 2 };
    return {
      title: '古老祭坛',
      desc: '一座刻满符文的祭坛散发着危险而诱人的力量。',
      choices: [
        c(1, '献上财富', '损失50金币，随机1只宠物永久+1速度或+2最大生命（各50%）', 'boost', { ...boost(), goldDelta: -50 }),
        c(2, '献上鲜血', '全体失去40%生命，随机1只宠物永久+1速度或+2最大生命（各50%）', 'boost', { ...boost(), damagePercent: 40 }),
        c(3, '离开', '无事', 'none'),
      ],
    };
  }
  if (type === 'merchant') {
    const isItem = rng() < 0.5;
    const shopFoodPool = Object.keys(FOODS).filter((id) => FOODS[id].shop !== false);
    const shopItemPool = mainShopItemPool();
    let tradeChoice: EventChoice;
    if (isItem) {
      const itemId = pick(rng, shopItemPool);
      tradeChoice = c(1, '购买补给', '损失20金币，随机获得1个食物或道具（各50%）', 'item', { itemId, goldDelta: -20 });
    } else {
      const foodId2 = pick(rng, shopFoodPool);
      tradeChoice = c(1, '购买补给', '损失20金币，随机获得1个食物或道具（各50%）', 'food', { foodId: foodId2, goldDelta: -20 });
    }
    return {
      title: '流浪商人',
      desc: '一位背着鼓鼓行囊的商人在路边歇脚，愿意与你交易。',
      choices: [
        tradeChoice,
        c(2, '打探消息', '获得 20 金币', 'gold', { amount: 20 }),
      ],
    };
  }
  if (type === 'egg') {
    const pools = MAIN_REGIONS[region];
    const normalEggPool = [...pools.basePool, ...pools.evo1Pool];
    const eggMonsterId = pick(rng, normalEggPool);
    const ambush = rng() < 0.5;
    const special = rng() < 0.3;
    const carriedEgg = { ambush, special, monsterId: pick(rng, special ? SPECIAL_EGG_POOL : normalEggPool) };
    const battleEnemies = eventBattleEnemies(rng, act, 2, region);
    return {
      title: '神秘蛋',
      desc: '一颗布满奇异纹路的蛋静静躺在草丛中，轻轻颤动。',
      choices: [
        c(1, '孵化它', '随机普通生物加入队伍；队伍满则进入处理界面', 'recruit', { monsterId: eggMonsterId }),
        c(2, '带走它', '50%触发战斗，50%带走；经过3次关卡后孵化（70%一、二阶普通生物，30%蛋生特殊生物；可重复关卡）', 'carryEgg', { carriedEgg, battleEnemies }),
      ],
    };
  }
  if (type === '行商') {
    return {
      title: '神秘行商',
      desc: '一位兜售奇物符文的游商，称他的货能解开远古双生宝箱的秘密。',
      choices: [
        c(1, '购得侦察符', '获得2个「侦察符」', 'item', { itemId: 'scout', amount: 2 }),
        c(2, '购得双生符', '获得2个「双生符」', 'item', { itemId: 'twin', amount: 2 }),
      ],
    };
  }
  // ===== 幕1-3 通用新事件 =====
  if (type === 'wheel') {
    // 命运之轮（赌博）
    const bet30 = Math.floor(rng() * 100);
    const bet15 = Math.floor(rng() * 100);
    let e1: EventChoice;
    if (bet30 < 20) {
      e1 = c(1, '投入 30 金', '可能赢得更多金币', 'gold', { amount: 80, goldDelta: -30 });
    } else if (bet30 < 50) {
      e1 = c(1, '投入 30 金', '可能赢得一些金币', 'gold', { amount: 60, goldDelta: -30 });
    } else {
      e1 = c(1, '投入 30 金', '可能什么也得不到', 'gold', { amount: 0, goldDelta: -30 });
    }
    let e2: EventChoice;
    if (bet15 < 20) {
      e2 = c(2, '投入 15 金', '可能赢得一些金币', 'gold', { amount: 40, goldDelta: -15 });
    } else if (bet15 < 50) {
      e2 = c(2, '投入 15 金', '可能赢得一些金币', 'gold', { amount: 30, goldDelta: -15 });
    } else {
      e2 = c(2, '投入 15 金', '可能什么也得不到', 'gold', { amount: 0, goldDelta: -15 });
    }
    return {
      title: '命运之轮',
      desc: '一个古老的轮盘在你面前缓缓转动，上面刻满了神秘的符文……',
      choices: [e1, e2, c(3, '离开', '不参与赌博', 'none')],
    };
  }
  if (type === 'ruins') {
    const roll = rng();
    const desc = '20%获得随机食物或道具（各半），30%全体失去30%生命，30%失去30金币，20%随机伙伴永久+4生命、随机伙伴永久+2速度（可为同一只）';
    let explore: EventChoice;
    if (roll < .2) explore = rng() < .5
      ? c(1, '探索', desc, 'food', { foodId: pick(rng, ['berry', 'meat', 'gem']) })
      : c(1, '探索', desc, 'item', { itemId: pick(rng, mainShopItemPool()) });
    else if (roll < .5) explore = c(1, '探索', desc, 'damage', { amount: 30 });
    else if (roll < .8) explore = c(1, '探索', desc, 'gold', { amount: -30 });
    else explore = c(1, '探索', desc, 'boost', { boostStat: 'hp', amount: 4, extraBoost: { stat: 'spd', amount: 2 } });
    return {
      title: '宠物遗迹', desc: '你发现了一处古老的遗迹，空气中弥漫着神秘的气息……',
      choices: [explore,
        c(2, '带走遗物', '随机1只宠物永久+1速度', 'boost', { boostStat: 'spd', amount: 1 }),
        c(3, '离开', '谨慎行事', 'none')],
    };
  }
  if (type === 'gambler') {
    return {
      title: '神秘商人的赌局', desc: '一个蒙面商人举起一枚硬币，请你猜测落下的一面。',
      choices: [
        c(1, '猜硬币', '选择正面或反面；50%指定伙伴永久+1速度，50%随机伙伴获得迟缓诅咒', 'coin', { coinResult: rng() < .5 ? 'heads' : 'tails' }),
        c(2, '离开', '无事发生', 'none'),
      ],
    };
  }
  if (type === 'altar2') {
    // 灵魂祭坛（宠物养成，幕2-3）
    return {
      title: '灵魂祭坛',
      desc: '一座古老的祭坛散发着幽蓝的光芒，似乎在呼唤着什么……',
      choices: [
        c(1, '献祭', '随机放生1只宠物，其余伙伴永久+2生命上限', 'sacrifice', { boostStat: 'hp', amount: 2 }),
        c(2, '净化？', '50%指定1只宠物清除诅咒，50%随机1只宠物获得随机诅咒', 'purifyChoice', { purifySuccess: rng() < .5 }),
        c(3, '离开', '敬畏地绕开', 'none'),
      ],
    };
  }
  if (type === 'cursed_chest') {
    const foodRewards = rng() < .5 ? [{ foodId: 'golden_fruit', amount: 1 }]
      : Array.from({ length: 2 }, () => ({ foodId: pick(rng, ['berry', 'meat', 'gem']), amount: 1 }));
    return {
      title: '诅咒宝箱', desc: '一个漆黑的宝箱散发着不祥的气息，上面缠绕着暗色的藤蔓……',
      choices: [
        c(1, '打开宝箱', '必得食物：50%获得1个圣果，50%获得2个随机普通食物；另有50%概率使随机1只宠物获得随机诅咒', 'food', { foodRewards, curseTarget: rng() < .5 }),
        c(2, '离开', '远离不祥之物', 'none'),
      ],
    };
  }
  if (type === '精灵') {
    // 流浪精灵（战斗交互，全幕）
    const enemies = eventBattleEnemies(rng, act, 1, region);
    const monsterId = enemies[0].speciesId;
    const recruitBonus = rng() < .6 ? (rng() < .5 ? { stat: 'spd' as const, amount: 1 } : { stat: 'hp' as const, amount: 2 }) : undefined;
    return {
      title: '流浪精灵',
      desc: '一只散发着微光的精灵挡在路中央，似乎想要较量一番……',
      choices: [
        c(1, '挑战', `战斗（1只${getMonster(monsterId).name}，当前幕次池）；胜利获得该生物和20金币，失败全队损失20%生命`, 'battle', {
          battleEnemies: enemies,
          battleReward: { kind: 'recruit', monsterId, amount: 20 },
          battlePenalty: { percent: 20 },
        }),
        c(2, '喂食', `消耗2个随机持有的捕捉食物，获得${getMonster(monsterId).name}；60%概率永久+1速度或+2生命（强化内各半）`, 'feedRecruit', { monsterId, consumeRandomFood: true, foodCost: 2, recruitBonus }),
        c(3, '离开', '绕道而行', 'none'),
      ],
    };
  }
  if (type === '训练') {
    // 训练场挑战（战斗交互，全幕）
    const enemyCount = 2 + Math.floor(rng() * 2);
    const enemies = eventBattleEnemies(rng, act, enemyCount, region);
    return {
      title: '训练场挑战',
      desc: '前方是一个训练场，几位训练家正在切磋……',
      choices: [
        c(1, '接受挑战', `战斗（${enemyCount}只对手，当前幕次较强搭配）；胜利全体永久+1最大HP，失败随机宠物诅咒`, 'battle', {
          battleEnemies: enemies,
          battleReward: { kind: 'hp', amount: 1 },
          battlePenalty: { curseTarget: true },
        }),
        c(2, '离开', '继续赶路', 'none'),
      ],
    };
  }
  if (type === 'campfire') {
    // 冒险者营地（幕次专属，幕1）
    return {
      title: '冒险者营地',
      desc: '你遇到了一群友善的冒险者，他们愿意分享经验……',
      choices: [
        c(1, '交流', '获得 1 个随机道具', 'item', { itemId: pick(rng, mainShopItemPool()) }),
        c(2, '训练', '全体回复 50% 生命值', 'heal', { amount: 50 }),
        c(3, '分道扬镳', '+25 金币', 'gold', { amount: 25 }),
      ],
    };
  }
  // fallback
  return {
    title: '训练营地',
    desc: '一片被踩实的空地，似乎曾被勇者用作训练场。',
    choices: [
      c(1, '严格训练', '全体恢复 30% 生命', 'heal', { amount: 30 }),
      c(2, '休整半天', '全体恢复 20% 生命', 'heal', { amount: 20 }),
      c(3, '离开', '时间不等人', 'none'),
    ],
  };
}

/** 奇遇关：从高级奖励池洗牌抽 3 个（种子预掷，可复现） */
export function buildSpecial(rng: () => number): SpecialNode {
  const rewards = shuffle(rng, [...SPECIAL_REWARDS]).slice(0, 3)
    .map(reward => reward.kind === 'egg' ? { ...reward, monsterId: pick(rng, SPECIAL_EGG_POOL) } : reward);
  const titles = ['神秘裂隙', '命运回廊', '星辉祭坛'];
  return {
    title: pick(rng, titles),
    desc: '一道泛着星光的裂隙缓缓睁开，其中蕴含着不可思议的机遇与代价。',
    rewards,
  };
}

/** 斗兽场/车轮战失败后的惩罚事件：多选一承受代价（宠物不会阵亡） */
export function buildPunishmentEvent(rng: () => number): EventNode {
  const roll = rng();
  const damage = 15 + Math.floor(rng() * 11); // 15~25
  const goldLoss = 20 + Math.floor(rng() * 16); // 20~35
  return {
    title: roll < 0.5 ? '挑战落败' : '铩羽而归',
    desc: '没能通过这场挑战，队伍付出了代价……（此战没有宠物阵亡）',
    choices: [
      { id: 'p1', label: '承受伤痛', desc: `全体失去 ${damage}% 生命`, kind: 'damage', amount: damage },
      { id: 'p2', label: '破财消灾', desc: `失去 ${goldLoss} 金币`, kind: 'gold', amount: -goldLoss },
    ],
  };
}

/** 主模式按幕抽取两个不同的招募候选，不依赖现有队伍。 */
function recruitCandidates(rng: () => number, act: number, region: MainRegionId = 'mixed'): string[] {
  const pools = MAIN_REGIONS[region];
  const candidates: string[] = [];
  const advancedChance = act >= 3 ? 0.6 : act === 2 ? 0.3 : 0;
  for (let i = 0; i < 2; i++) {
    const pool = rng() < advancedChance ? pools.evo1Pool : pools.basePool;
    candidates.push(pick(rng, pool.filter((id) => !candidates.includes(id))));
  }
  return candidates;
}

/** 斗兽场/车轮战胜利奖励：3 选 1 的丰厚选择（金币/食物/治疗/招募） */
export function generateChallengeRewards(state: GameState, type: 'arena' | 'gauntlet'): RewardChoice[] {
  const region = state.runMode === 'proficiency' ? 'mixed' : state.region ?? 'mixed';
  const rng = createRng(state.seed * 173 + state.act * 37 + state.currentRow * 59 + (type === 'arena' ? 1 : 2));
  const options: RewardChoice[] = [
    { id: 'ch-gold', label: '冠军赏金', desc: '获得 30 金币', kind: 'gold', amount: 30 },
    { id: 'ch-food', label: '美味补给', desc: '获得 1 个随机食物', kind: 'food', foodId: pick(rng, Object.keys(FOODS).filter((id) => FOODS[id].shop !== false)) },
    { id: 'ch-heal', label: '庆功宴', desc: '全体恢复 50% 生命', kind: 'heal', amount: 50 },
  ];
  const mainRecruit = state.runMode !== 'proficiency';
  if (mainRecruit || state.roster.length < getMaxRoster(state.runMode)) {
    options.push({
      id: 'ch-recruit',
      label: '斗士招募',
      desc: '随机一只普通宠物加入队伍',
      kind: 'recruit',
      monsterId: pick(rng, MAIN_REGIONS[region].basePool),
    });
  }
  return shuffle(rng, options).slice(0, 3).map((reward) => {
    if (!mainRecruit || reward.kind !== 'recruit') return reward;
    return { ...reward, monsterId: undefined, recruitCandidates: recruitCandidates(rng, state.act, region), desc: '从两位候选伙伴中选择一位' };
  });
}

export function generateMap(seed: number, act: number, difficulty?: Difficulty, region: MainRegionId = 'mixed'): RunMap {
  const rng = createRng(seed + act * 1013);
  const LAYER_RANGES: Record<number, [number, number]> = { 1: [11, 13], 2: [10, 12], 3: [12, 14] };
  const [lo, hi] = LAYER_RANGES[act] ?? LAYER_RANGES[1];
  const layerCount = randInt(rng, lo, hi);
  const encounter: Record<string, { speciesId: string }[]> = {};
  const boss: Record<string, { speciesId: string }[]> = {};
  const events: Record<string, EventNode> = {};
  const specials: Record<string, SpecialNode> = {};

  const make = (type: NodeType, row: number, col: number): MapNode => ({
    id: `n${act}_${row}_${col}`,
    type,
    label: labelOf(type, row),
    col,
  });

  const layers: MapNode[][] = [];
  // 保证相邻路线双向无死路：
  // - 向下：本行节点数至少为上一行 -1（任意列 c 在下一行都有 col ∈ [c-1, c+1] 的节点可走）；
  // - 向上：本行节点数最多为上一行 +1（上一行列 0..prevCount-1 只能到达下一行列 0..prevCount，
  //   否则最右节点无父节点、永远不可达）。后者由下方 `row > 1` 的上限约束实现。
  let prevCount = 1;
  // 末层首领池（shuffle 后按列分配，保证不重复）
  let actBossPool: string[] = [];
  for (let row = 0; row < layerCount; row++) {
    if (row === 0) {
      layers.push([make('battle', row, 0)]);
      continue;
    }
    if (row === layerCount - 1) {
      // 混合地区仍为2~3个；林地单首领放在第1列，与前一层0~2列均相邻。
      const [minBosses, maxBosses] = MAIN_REGIONS[region].bossCount;
      const m = randInt(rng, minBosses, maxBosses);
      actBossPool = shuffle(rng, [...MAIN_REGIONS[region].bossPools[act]]).slice(0, m);
      layers.push(Array.from({ length: m }, (_, i) => make('boss', row, region === 'emerald_forest' ? 1 : i)));
      continue;
    }
    const branchIncrease = Math.min(2, Math.max(0, act - 1));
    let count = Math.max(prevCount - 1, randInt(rng, 3 + branchIncrease, 5 + branchIncrease));
    // 可达性：本行数量 ≤ 上一行+1，避免上一行只有 3 个节点时下一行 5 个导致最右节点无父、不可达。
    // 第 1 行除外：出发层（row 0）可直达下一层任意节点，不受列约束。
    if (row > 1) count = Math.min(count, prevCount + 1);
    // 首领前逐层收拢，最多每层减少一列，防止后两幕较宽的分支形成死路。
    count = Math.min(3 + layerCount - 2 - row, count);
    prevCount = count;
    const progress = row / (layerCount - 1);
    const nodes: MapNode[] = [];
    for (let i = 0; i < count; i++) {
      const n = make(middleNodeType(rng, progress, difficulty), row, i);
      if (n.type === 'gauntlet') n.gauntletSize = act <= 2 ? 2 : (rng() < 0.7 ? 2 : 3);
      nodes.push(n);
    }
    layers.push(nodes);
  }

  // 支援节点统一安排，所有随机均由地图种子控制。
  const setType = (node: MapNode, t: NodeType): void => {
    const row = layers.findIndex((r) => r.includes(node));
    node.type = t;
    node.label = labelOf(t, row);
  };
  const mid = layers.slice(1, -1).flat();
  // 出发后第 1 行强制全部战斗
  layers[1].forEach((n) => setType(n, 'battle'));
  // 奇遇关每幕最多 1 个：多余转为战斗；前 5 层不出现奇遇关
  const spNodes = mid.filter((n) => n.type === 'special');
  const earlySpNodes = spNodes.filter((n) => {
    const row = layers.findIndex((r) => r.includes(n));
    return row < 5;
  });
  earlySpNodes.forEach((n) => setType(n, 'battle'));
  const remainingSp = mid.filter((n) => n.type === 'special');
  if (remainingSp.length > 1) remainingSp.slice(1).forEach((n) => setType(n, 'battle'));
  // 第一幕不出现奇遇关
  if (act === 1) {
    mid.filter((n) => n.type === 'special').forEach((n) => setType(n, 'battle'));
  }

  const lastRow = layers.length - 1;
  // 补给按层分段投放，不再独立抽取后从前往后补齐，避免扎堆或长期缺席。
  for (const node of mid) {
    if (node.type === 'shop' || node.type === 'event' || node.type === 'watchtower') setType(node, 'battle');
  }
  const supportRows = Array.from({ length: lastRow - 2 }, (_, i) => i + 2);
  const section = (row: number) => Math.min(2, Math.floor((row - 2) * 3 / supportRows.length));
  const shopPlans: number[][] = [];
  for (const a of supportRows) for (const b of supportRows) for (const c of supportRows) {
    if (section(a) === 0 && section(b) === 1 && section(c) === 2
      && b - a >= 3 && c - b >= 3 && c >= lastRow - 2) shopPlans.push([a, b, c]);
  }
  const placeSupport = (row: number, type: 'shop' | 'event' | 'watchtower') => {
    const candidates = layers[row].filter(n => n.type !== 'shop' && n.type !== 'event'
      && n.type !== 'watchtower' && n.type !== 'special');
    // 商店靠近中间，并覆盖前三层最右分支的三步转入范围。
    const supportCol = type === 'shop'
      ? Math.max((layers[row].length - 1) / 2, layers[Math.max(0, row - 3)].length - 4)
      : (layers[row].length - 1) / 2;
    const node = type === 'event' ? pick(rng, candidates)
      : [...candidates].sort((a, b) => Math.abs(a.col - supportCol)
        - Math.abs(b.col - supportCol))[0];
    setType(node, type);
    node.gauntletSize = undefined;
  };
  for (const row of pick(rng, shopPlans)) placeSupport(row, 'shop');

  const eventTarget = randInt(rng, 4, Math.min(6, Math.ceil(supportRows.length * 2 / 3)));
  const eventPlans: number[][] = [];
  const collectEvents = (chosen: number[], index: number): void => {
    if (chosen.length === eventTarget) {
      if ([0, 1, 2].every(part => chosen.some(row => section(row) === part))
        && chosen[0] <= 3 && chosen[chosen.length - 1] >= lastRow - 3) eventPlans.push(chosen);
      return;
    }
    for (let i = index; i < supportRows.length; i++) {
      const row = supportRows[i];
      if (chosen.length >= 2 && chosen[chosen.length - 2] === row - 2) continue;
      if (chosen.length && row - chosen[chosen.length - 1] > 3) continue;
      collectEvents([...chosen, row], i + 1);
    }
  };
  collectEvents([], 0);
  for (const row of pick(rng, eventPlans)) placeSupport(row, 'event');

  const towerRows = supportRows.filter(row => layers[row].some(n => n.type === 'battle' || n.type === 'elite'
    || n.type === 'arena' || n.type === 'gauntlet' || n.type === 'corrupted'));
  const lateTower = pick(rng, towerRows.filter(row => row >= lastRow - 4 && row <= lastRow - 2));
  placeSupport(lateTower, 'watchtower');
  const otherTowers = towerRows.filter(row => Math.abs(row - lateTower) >= 4);
  if (randInt(rng, 1, 2) === 2 && otherTowers.length) placeSupport(pick(rng, otherTowers), 'watchtower');

  // 同步双节点：每幕 1~2 对。同一行两个相邻节点改写为「双生宝箱」（虚线相连，二选一；
  // 持侦察/加速道具可同时开启两个）。只覆盖普通战斗/精英节点，不破坏事件/商人数量保证。
  // 第一层（row 2）sync+watchtower 总数不超过 2，后面层不超过 3。
  const syncPairs = randInt(rng, 1, 2);
  let syncMade = 0;
  for (let attempt = 0; attempt < syncPairs * 4 && syncMade < syncPairs; attempt++) {
    const row = randInt(rng, 2, lastRow - 1);
    const rowNodes = layers[row];
    // 统计该行已有的 sync+watchtower 数量
    const specialCount = rowNodes.filter((n) => n.type === 'sync' || n.type === 'watchtower').length;
    const limit = row <= 2 ? 2 : 3;
    if (specialCount >= limit) continue;
    for (let i = 0; i + 1 < rowNodes.length; i++) {
      const a = rowNodes[i];
      const b = rowNodes[i + 1];
      if ((a.type === 'battle' || a.type === 'elite') && (b.type === 'battle' || b.type === 'elite')) {
        a.type = 'sync';
        a.label = labelOf('sync', row);
        a.pairedId = b.id;
        b.type = 'sync';
        b.label = labelOf('sync', row);
        b.pairedId = a.id;
        syncMade += 1;
        break;
      }
    }
  }

  // 守卫 + 钥匙门：每幕 1~2 对。钥匙门在第 r 行，其上一行（r-1）相邻列生成对应守卫；
  // 击败守卫获得该门的专用钥匙后，钥匙门才可开启（高级宝箱）。
  const guardPairs = randInt(rng, 1, 2);
  let guardMade = 0;
  for (let attempt = 0; attempt < guardPairs * 6 && guardMade < guardPairs; attempt++) {
    const row = randInt(rng, 3, lastRow - 1);
    const rowNodes = layers[row];
    const prevNodes = layers[row - 1];
    const doorIdx = rowNodes.findIndex((n) => n.type === 'battle' || n.type === 'elite');
    if (doorIdx < 0) continue;
    const door = rowNodes[doorIdx];
    const guardNode = prevNodes.find(
      (n) => (n.type === 'battle' || n.type === 'elite') && Math.abs(n.col - door.col) <= 1,
    );
    if (!guardNode) continue;
    door.type = 'keydoor';
    door.label = labelOf('keydoor', row);
    door.guardianId = guardNode.id;
    guardNode.type = 'guardian';
    guardNode.label = labelOf('guardian', row - 1);
    guardMade += 1;
  }


  // 被侵蚀节点：每 3~4 行间隔概率出现（行 2 起；不覆盖强制战斗行 1、商人/事件/奇遇/首领；间隔超 5 行则强制出现）
  let lastCorruptRow = 1;
  for (let row = 2; row < layers.length - 1; row++) {
    if (row - lastCorruptRow < 3) continue;
    const battles = layers[row].filter((n) => n.type === 'battle');
    if (battles.length === 0) continue;
    const force = row - lastCorruptRow >= 5;
    if (force || rng() < 0.5) {
      const n = battles[Math.floor(rng() * battles.length)];
      n.type = 'corrupted';
      n.label = labelOf('corrupted', row);
      n.corruptDebuff = (['spd', 'dmg', 'burn'] as const)[Math.floor(rng() * 3)];
      n.corruptReward = rng() < 0.5 ? 'gold' : 'food';
      lastCorruptRow = row;
    }
  }


  // 钥匙门死锁防护：钥匙门需钥匙才可进入（守卫在前一行），若某玩家跳过守卫，
  // 下一行可达节点可能全部是钥匙门 → 卡死。保证从上一行任意可站立节点出发，
  // 下一行始终至少有一个非钥匙门的可进入节点；否则把造成死锁的一对钥匙门+守卫还原为普通战斗。
  const revertKeydoorPair = (door: MapNode): void => {
    const guard = layers.flat().find((n) => n.id === door.guardianId);
    if (guard) {
      const gRow = layers.findIndex((row) => row.includes(guard));
      guard.type = 'battle';
      guard.label = labelOf('battle', gRow);
    }
    const dRow = layers.findIndex((row) => row.includes(door));
    door.type = 'battle';
    door.label = labelOf('battle', dRow);
    door.guardianId = undefined;
  };
  const findKeydoorDeadlock = (): MapNode | null => {
    for (let r = 3; r < lastRow; r++) {
      const row = layers[r];
      if (!row.some((n) => n.type === 'keydoor')) continue;
      const prev = layers[r - 1];
      for (const p of prev) {
        if (p.type === 'keydoor') continue;
        const reachable = row.filter((q) => Math.abs(q.col - p.col) <= 1);
        if (reachable.length > 0 && reachable.every((q) => q.type === 'keydoor')) {
          return reachable[0];
        }
      }
    }
    return null;
  };
  let deadlockDoor: MapNode | null;
  while ((deadlockDoor = findKeydoorDeadlock()) !== null) {
    revertKeydoorPair(deadlockDoor);
  }

  // 检查商店前三层的转入机会；钥匙门不能成为通往补给的唯一通道。
  for (let row = 2; row < lastRow; row++) {
    const shop = layers[row].find(n => n.type === 'shop');
    if (!shop) continue;
    const from = Math.max(0, row - 3);
    const coversBranches = (node: MapNode) => {
      let reachable = [node];
      for (let r = row - 1; r >= from; r--)
        reachable = layers[r].filter(n => n.type !== 'keydoor'
          && reachable.some(next => r === 0 || Math.abs(next.col - n.col) <= 1));
      return reachable.length === layers[from].filter(n => n.type !== 'keydoor').length;
    };
    const candidates = layers[row].filter(n => !['sync', 'keydoor', 'guardian'].includes(n.type));
    let destination = candidates.find(coversBranches);
    while (!destination) {
      const door = layers.slice(from, row).flat().find(n => n.type === 'keydoor');
      if (!door) break;
      revertKeydoorPair(door);
      destination = candidates.find(coversBranches);
    }
    if (destination && destination !== shop) {
      const { type, gauntletSize, corruptDebuff, corruptReward } = destination;
      setType(shop, type);
      Object.assign(shop, { gauntletSize, corruptDebuff, corruptReward });
      setType(destination, 'shop');
      Object.assign(destination, { gauntletSize: undefined, corruptDebuff: undefined, corruptReward: undefined });
    }
  }

  // 不能让玩家在某层被迫只选高风险战斗；不拆除守卫与钥匙门配对。
  const riskyTypes: NodeType[] = ['elite', 'corrupted', 'arena', 'gauntlet', 'guardian'];
  for (const row of layers.slice(2, -1)) {
    const open = row.filter(n => n.type !== 'keydoor');
    if (open.every(n => riskyTypes.includes(n.type))) {
      const node = open.find(n => n.type !== 'guardian')!;
      setType(node, 'battle');
      node.gauntletSize = undefined;
      node.corruptDebuff = undefined;
      node.corruptReward = undefined;
    }
  }
  const allBattleRows = layers.slice(1, -1).filter(row => row.every(n => n.type === 'battle'));
  for (const row of allBattleRows.slice(2)) setType(row[0], 'elite');

  // 为所有节点生成遭遇/首领/事件/奇遇关内容
  for (let row = 0; row < layerCount; row++) {
    const progress = (row - 1) / (layerCount - 3);
    const previousEventTitles = row > 0 ? layers[row - 1].filter(n => n.type === 'event').map(n => events[n.id].title) : [];
    for (const n of layers[row]) {
      if (n.type === 'boss') boss[n.id] = buildEncounter(rng, n.type, act, progress, actBossPool[region === 'emerald_forest' ? 0 : n.col], undefined, region);
      else if (n.type === 'battle' || n.type === 'elite') encounter[n.id] = buildEncounter(rng, n.type, act, progress, undefined, undefined, region);
      else if (n.type === 'arena') encounter[n.id] = buildEncounter(rng, 'arena', act, progress, undefined, undefined, region);
      else if (n.type === 'gauntlet') encounter[n.id] = buildEncounter(rng, 'gauntlet', act, progress, undefined, n.gauntletSize, region);
      else if (n.type === 'corrupted') encounter[n.id] = buildEncounter(rng, 'battle', act, progress, undefined, undefined, region);
      else if (n.type === 'guardian') encounter[n.id] = buildEncounter(rng, 'guardian', act, progress, undefined, undefined, region);
      else if (n.type === 'event') events[n.id] = buildEvent(rng, act, region, previousEventTitles);
      else if (n.type === 'special') specials[n.id] = buildSpecial(rng);
    }
  }
  return { layers, encounter, boss, events, specials };
}

/** 当前所在节点（按 currentRow + currentNodeId 定位） */
export function currentNode(state: GameState): MapNode | undefined {
  return state.map.layers[state.currentRow]?.find((n) => n.id === state.currentNodeId);
}

/** 胜利提示与实际结算共用，不包含随后手动领取的金币奖励卡。 */
function baseBattleVictoryGold(state: GameState): number {
  if (state.testRun && !state.testScenario) return 0;
  if (state.eventBattle) return ['gold', 'recruit'].includes(state.eventBattle.reward.kind) ? state.eventBattle.reward.amount ?? 0 : 0;
  const node = currentNode(state);
  if (node?.type === 'arena3' && state.arena3Pending?.mode === 'challenge') return 50;
  if (node?.type === 'arena' || node?.type === 'gauntlet' || node?.type === 'arena3') return 0;
  if (state.map.boss[state.currentNodeId] !== undefined) return 30;
  if (state.runMode === 'proficiency') return state.map.encounter[state.currentNodeId] !== undefined ? 16 : 8;
  if (node?.type === 'elite' || node?.type === 'guardian') return 20;
  if (node?.type === 'corrupted' && node.corruptReward === 'gold') return 20;
  return 10;
}

export function battleVictoryGold(state: GameState): number {
  const amount = baseBattleVictoryGold(state);
  return state.runMode !== 'proficiency' && state.relics?.includes('greedy_eye') ? Math.floor(amount * 1.5) : amount;
}

export function labelOf(t: NodeType, row: number): string {
  switch (t) {
    case 'battle':
      return row === 0 ? '出发' : '遭遇战';
    case 'elite':
      return '精英怪';
    case 'rest':
      return '休整';
    case 'shop':
      return '商人';
    case 'event':
      return '事件';
    case 'special':
      return '奇遇关';
    case 'boss':
      return '首领';
    case 'arena':
      return '斗兽场';
    case 'gauntlet':
      return '车轮战';
    case 'corrupted':
      return '被侵蚀';
    case 'watchtower':
      return '瞭望塔';
    case 'sync':
      return '双生宝箱';
    case 'guardian':
      return '守卫';
    case 'keydoor':
      return '钥匙门';
    case 'blacksmith':
      return '铁匠铺';
    case 'arena3':
      return '竞技场';
  }
}

// ---------- 队伍与成长 ----------

export interface BaseStats {
  maxHp: number;
  spd: number;
}

/** 把属性强化加成与负面诅咒折算进基准属性（融合/净化/强化时统一使用） */
export function applyMods(stats: BaseStats, u: Pick<Unit, 'bonusStats' | 'curse'>): BaseStats {
  let out = { ...stats };
  const b = u.bonusStats;
  if (b) {
    out = {
      ...out,
      maxHp: out.maxHp + (b.hp ?? 0),
      spd: out.spd + (b.spd ?? 0),
    };
  }
  if (u.curse === 'hpDown') out = { ...out, maxHp: Math.max(1, out.maxHp - 5) };
  else if (u.curse === 'spdDown') out = { ...out, spd: Math.max(1, out.spd - 2) };
  // 虚弱（atkDown）：伤害 -2，在战斗伤害结算中体现，不影响属性
  return out;
}

/** 诅咒类型 */
export type CurseKind = 'hpDown' | 'atkDown' | 'spdDown';

/** 给单位附加诅咒，通过 recomputeStats 从基准重算属性（避免累积误差） */
export function applyCurseToUnit(u: Unit, curse: CurseKind): Unit {
  return recomputeStats({ ...u, curse });
}

/** 移除单位的诅咒，通过 recomputeStats 从基准重算属性 */
export function removeCurseFromUnit(u: Unit): Unit {
  if (!u.curse) return u;
  return recomputeStats({ ...u, curse: undefined as Unit['curse'] });
}

/** 以物种基准 + 加成/诅咒重算并回写属性（属性强化、净化后调用） */
export function recomputeStats(unit: Unit): Unit {
  const stats = applyMods(computeStats(unit.speciesId), unit);
  return {
    ...unit,
    maxHp: stats.maxHp,
    hp: Math.min(stats.maxHp, unit.hp + Math.max(0, stats.maxHp - unit.maxHp)),
    spd: stats.spd,
  };
}

/** 该物种可融合到的下一形态（不可融合返回 undefined） */
export function nextStage(speciesId: string): string | undefined {
  return getMonster(speciesId).evolutions?.[0]?.to;
}

/** 各条进化分支到最终形态的合法路径；蛋生、造物和最终形态不可进化。 */
export function finalEvolutionPaths(speciesId: string): string[][] {
  const species = getMonster(speciesId);
  if (species.eggBorn) return [];
  return (species.evolutions ?? []).flatMap(({ to }) => {
    const paths = finalEvolutionPaths(to);
    return paths.length ? paths.map(path => [to, ...path]) : [[to]];
  });
}

/** 只限制主模式传奇进化，不影响图鉴、纯属性预览及熟练度营火融合。 */
export function evolutionLockReason(state: GameState, speciesId: string, toFinal = false): string | undefined {
  const target = nextStage(speciesId);
  if (state.runMode !== 'proficiency' && state.act < 2 && !state.legendEvolutionUnlocked
    && (toFinal ? finalEvolutionPaths(speciesId).some(path => getMonster(path.at(-1)!).rank === 3) : target && getMonster(target).rank === 3)) {
    return '击败第一幕首领后解锁传奇进化';
  }
  return undefined;
}

/** 融合需要的同形态数量（含主宠自身），六条主要进化链均为两只。 */
export function fusionNeedCount(speciesId: string): number {
  return fusionNeed(speciesId);
}

/**
 * 融合：主宠 + 若干同物种材料 → 下一形态。
 * 结果宠继承主宠的 bonusStats/诅咒/自创技能，属性为新形态固定值，生命回满。
 * 材料（不含主宠）在调用前应从队伍移除。
 */
export function fuseUnit(primary: Unit, targetSpeciesId?: string): Unit | null {
  if (getMonster(primary.speciesId).eggBorn) return null;
  const target = targetSpeciesId ?? nextStage(primary.speciesId);
  if (target && !getMonster(primary.speciesId).evolutions?.some(e => e.to === target)) return null;
  if (!target) return null;
  const sp = getMonster(target);
  // 以新形态为基础（自动应用被动属性加成），再叠加主宠的 bonusStats/诅咒
  const fresh = makeUnit(target, primary.isPlayer, primary.column, false, primary.row);
  let hp = fresh.maxHp;
  let spd = fresh.spd;
  const b = primary.bonusStats;
  if (b) { hp += b.hp ?? 0; spd += b.spd ?? 0; }
  if (primary.curse === 'hpDown') hp = Math.max(1, hp - 5);
  else if (primary.curse === 'spdDown') spd = Math.max(1, spd - 2);
  return {
    ...fresh,
    uid: primary.uid,
    ...(primary.tamedOrigin ? { tamedOrigin: true } : {}),
    hp,
    maxHp: hp,
    spd,
    skills: primary.customSkills ?? [...sp.skills],
    ...(primary.bonusStats ? { bonusStats: primary.bonusStats } : {}),
    ...(primary.curse ? { curse: primary.curse } : {}),
    ...(primary.customSkills ? { customSkills: primary.customSkills } : {}),
  };
}

/** 造物·自创生物：按属性模板生成生物，技能从模板技能池随机组合 3 个 */
export function makeCustomUnit(presetId: string, rng: () => number): Unit {
  const s = getMonster(presetId);
  const u = makeUnit(presetId, true, 0, false);
  const customSkills = shuffle(rng, [...s.skills]).slice(0, 3);
  u.customSkills = customSkills;
  u.skills = customSkills;
  return u;
}

// ---------- 奖励 ----------

export function generateRewards(state: GameState): RewardChoice[] {
  const region = state.runMode === 'proficiency' ? 'mixed' : state.region ?? 'mixed';
  const rng = createRng(state.seed + state.act * 7 + state.currentRow * 31 + (hashStr(state.currentNodeId) % 997));
  const options: RewardChoice[] = [
    {
      id: 'r-food',
      label: '补给品',
      desc: '获得 1 个随机食物',
      kind: 'food',
      foodId: pick(rng, Object.keys(FOODS).filter((id) => FOODS[id].shop !== false)),
    },
    {
      id: 'r-heal',
      label: '休养',
      desc: '全体恢复 30% 生命',
      kind: 'heal',
      amount: 30,
    },
  ];
  const mainRecruit = state.runMode !== 'proficiency';
  const space = mainRecruit || state.roster.length < getMaxRoster(state.runMode);
  if (space) {
    options.push({
      id: 'r-recruit',
      label: '招募',
      desc: '随机一只普通宠物加入队伍',
      kind: 'recruit',
      monsterId: pick(rng, MAIN_REGIONS[region].basePool),
    });
  }
  // 第 1 行（出发）奖励必含招募，保证前期扩员
  if (state.currentRow === 0 && !options.some((o) => o.kind === 'recruit')) {
    options.push({
      id: 'r-recruit',
      label: '招募',
      desc: '随机一只普通宠物加入队伍',
      kind: 'recruit',
      monsterId: pick(rng, MAIN_REGIONS[region].basePool),
    });
  }
  const shuffled = shuffle(rng, options);
  // 出发层：确保招募选项一定出现在最终结果中
  if (state.currentRow === 0) {
    const hasRecruit = shuffled.slice(0, 2).some((o) => o.kind === 'recruit');
    if (!hasRecruit) {
      const recruitIdx = shuffled.findIndex((o) => o.kind === 'recruit');
      if (recruitIdx >= 0) {
        const recruit = shuffled[recruitIdx];
        shuffled.splice(recruitIdx, 1);
        shuffled.unshift(recruit);
      }
    }
  }
  return shuffled.slice(0, 2).map((reward) => {
    if (!mainRecruit || reward.kind !== 'recruit') return reward;
    return { ...reward, monsterId: undefined, recruitCandidates: recruitCandidates(rng, state.act, region), desc: '从两位候选伙伴中选择一位' };
  });
}

/** 被侵蚀节点奖励翻倍：把奖励池中的食物选项数量翻倍；若无食物选项则强制加入一个双份食物奖励 */
export function applyCorruptFoodReward(rewards: RewardChoice[], rngSeed: number): RewardChoice[] {
  const out = rewards.map((r) => (r.kind === 'food' ? { ...r, amount: 2, desc: '获得 2 个随机食物' } : r));
  if (!out.some((r) => r.kind === 'food')) {
    const rng = createRng(rngSeed);
    out[0] = {
      id: 'r-food-x2',
      label: '暗影战利品',
      desc: '获得 2 个随机食物',
      kind: 'food',
      foodId: pick(rng, Object.keys(FOODS).filter((id) => FOODS[id].shop !== false)),
      amount: 2,
    };
  }
  return out;
}

export function canTameEnemy(enemy: Unit): boolean {
  return enemy.tameable && enemy.hp > 0 && enemy.hp / enemy.maxHp <= 0.4;
}

export function currentFoodList(state: GameState): FoodDef[] {
  return Object.entries(state.inventory)
    .filter(([id, count]) => count > 0 && FOODS[id])
    .map(([id]) => getFood(id));
}
