import type { PassiveDef } from '../types';

export const PASSIVES: Record<string, PassiveDef> = {
  nine_tail_heart: { id: 'nine_tail_heart', name: '九尾焰心', desc: '免疫灼烧伤害，每次被附加灼烧获得1层狐火，上限9层；每层使技能对敌人附加的灼烧额外增加1层，狐火满9层时技能直接伤害＋1；按施放前层数计算，不增强自身点火或被动附火', kind: 'foxFlame', value: 9, fullFoxDamage: 1 },
  fox_flame_body: { id: 'fox_flame_body', name: '狐火之躯', desc: '免疫灼烧伤害，每次被附加灼烧时获得1层狐火，上限3层；每层使自身技能对敌人附加的灼烧额外增加1层，不增强自身点火或被动附火。狐火战斗内不衰减', kind: 'foxFlame', value: 3 },
  twin_fox_flame: { id: 'twin_fox_flame', name: '双尾狐焰', desc: '免疫灼烧伤害，每次被附加灼烧时获得1层狐火，上限5层；每层使自身技能对敌人附加的灼烧额外增加1层，不增强自身点火或被动附火。狐火战斗内不衰减', kind: 'foxFlame', value: 5 },
  clear_flame: { id: 'clear_flame', name: '澄焰', desc: '每次技能治疗后移除目标最多3层灼烧；每回合首次有友方灼烧被技能或被动移除时获得1层日华，上限3层，每只持有者独立计次；灼烧自然结算不触发。本回合未触发充能时，回合结束失去1层日华', kind: 'sunRadiance', value: 3 },
  heat_moss: { id: 'heat_moss', name: '吸热苔', desc: '每次以技能施加治疗后，移除该伙伴最多2层灼烧；不限每回合次数，不移除中毒，不由道具、被动恢复或吸血触发', kind: 'healBurnCleanse', value: 2 },
  clean_moss: { id: 'clean_moss', name: '净苔', desc: '每次以技能施加治疗后，移除目标最多2层灼烧；为治疗前已灼烧的友方提供治疗时，治疗量额外增加2点，灼烧反转按清火前判断；不限每回合次数，不移除中毒', kind: 'healBurnBoost', value: 2 },
  heated_carapace: { id: 'heated_carapace', name: '热壳换火', desc: '每回合开始，在上一回合灼烧结算后，消耗自身1层灼烧并获得2点护盾；没有灼烧时不触发', kind: 'burnShield', value: 2 },
  burning_feather: { id: 'burning_feather', name: '灼羽剥甲', desc: '每回合首次攻击一个攻击前已灼烧且有护盾的敌人时，伤害前额外移除其2点护盾；多段或群攻只作用一次，不造成额外生命伤害', kind: 'burnStripShield', value: 2 },
  red_carapace: { id: 'red_carapace', name: '赤甲炼火', desc: '每回合开始，在上一回合灼烧结算后，消耗自身最多2层灼烧，每层获得3点护盾，最多6点；没有灼烧时不触发', kind: 'burnShield', value: 3, burnConsumeMax: 2 },
  solar_feather: { id: 'solar_feather', name: '烈日销甲', desc: '每回合首次攻击一个攻击前已灼烧且有护盾的敌人时，伤害前额外移除其4点护盾；多段或群攻只作用一次，不造成额外生命伤害', kind: 'burnStripShield', value: 4 },
  molten_molt: { id: 'molten_molt', name: '熔蜕', desc: '每回合开始，在上一回合灼烧结算后，消耗自身最多2层灼烧，每层获得2点护盾，最多4点；没有灼烧时不触发', kind: 'burnShield', value: 2, burnConsumeMax: 2 },
  searing_feather: { id: 'searing_feather', name: '焚风蚀甲', desc: '每回合首次攻击一个攻击前已灼烧且有护盾的敌人时，伤害前额外移除其3点护盾；多段或群攻只作用一次，不造成额外生命伤害', kind: 'burnStripShield', value: 3 },
  // —— 基础（御三家/常见野怪）——
  quick: { id: 'quick', name: '迅捷', desc: '战斗开始速度 +2', kind: 'spd', value: 2 },
  watery_regen: { id: 'watery_regen', name: '水愈', desc: '每回合开始恢复 2 点生命', kind: 'regen', value: 2 },
  heat: { id: 'heat', name: '炽热', desc: '攻击命中附加灼烧 3 层', kind: 'scorch', value: 3 },
  coal_furnace: { id: 'coal_furnace', name: '炉火', desc: '每回合前两次受到敌方攻击技能命中且存活后，使攻击者灼烧1层；多段攻击只计一次', kind: 'furnace', value: 1 },
  armored_furnace: { id: 'armored_furnace', name: '炽炉', desc: '每回合前两次受到敌方攻击技能命中且存活后，使攻击者灼烧2层；多段攻击只计一次', kind: 'furnace', value: 2 },
  candle_afterglow: { id: 'candle_afterglow', name: '余温', desc: '每回合我方首次攻击一个攻击前已灼烧的敌人后，为生命值最低的存活伙伴回复2点生命；全队同名被动每回合一次，取最高值', kind: 'afterglow', value: 2 },
  lantern_afterglow: { id: 'lantern_afterglow', name: '余温', desc: '每回合我方首次攻击一个攻击前已灼烧的敌人后，为生命值最低的2个存活伙伴各回复2点生命；全队同名被动每回合一次，取最高值', kind: 'afterglow', value: 2, targetCount: 2 },
  molten_furnace: { id: 'molten_furnace', name: '熔炉之心', desc: '每回合前两次受到敌方攻击技能命中且存活后，使攻击者灼烧2层，每次触发为自身施加1点护盾；多段攻击只计一次', kind: 'furnace', value: 2, shieldOnTrigger: 1 },
  eternal_light: { id: 'eternal_light', name: '长明之光', desc: '每回合我方首次攻击一个攻击前已灼烧的敌人后，为全体存活伙伴各回复3点生命值；每只持有者独立计次，不与同类或余温共享次数', kind: 'eternalLight', value: 3 },
  iron_guard: { id: 'iron_guard', name: '铁壁', desc: '受到的所有伤害 -1', kind: 'guard', value: 1 },
  venom_fang: { id: 'venom_fang', name: '毒牙', desc: '攻击命中附加中毒 3 层', kind: 'venom', value: 3 },
  spike: { id: 'spike', name: '尖刺', desc: '受到攻击时反伤 2 点', kind: 'thorns', value: 2 },

  // —— 第一阶进化 ——
  brute: { id: 'brute', name: '蛮力', desc: '所有技能伤害 +1', kind: 'power', value: 1 },
  thick_shell: { id: 'thick_shell', name: '厚壳', desc: '受到的所有伤害 -2', kind: 'guard', value: 2 },
  hot_flame: { id: 'hot_flame', name: '烈焰', desc: '攻击命中附加灼烧 3 层', kind: 'scorch', value: 3 },
  venom_tail: { id: 'venom_tail', name: '毒尾', desc: '攻击命中附加中毒 3 层', kind: 'venom', value: 3 },
  hard_armor: { id: 'hard_armor', name: '硬甲', desc: '受到攻击时反伤 3 点', kind: 'thorns', value: 3 },

  // —— 第二阶进化 ——
  fury: { id: 'fury', name: '狂怒', desc: '生命低于 50% 时伤害 +3', kind: 'frenzy', value: 3 },
  deep_regen: { id: 'deep_regen', name: '深海再生', desc: '每回合开始恢复 4 点生命', kind: 'regen', value: 4 },
  dragon_power: { id: 'dragon_power', name: '龙力', desc: '所有技能伤害 +2', kind: 'power', value: 2 },

  // —— Boss ——
  tree_regen: { id: 'tree_regen', name: '古树再生', desc: '每回合开始恢复 3 点生命', kind: 'regen', value: 3 },
  shadow_power: { id: 'shadow_power', name: '暗影之力', desc: '所有技能伤害 +3', kind: 'power', value: 3 },
  lava_scorch: { id: 'lava_scorch', name: '熔火灼烧', desc: '攻击命中附加灼烧 3 层', kind: 'scorch', value: 3 },
  tide_drain: { id: 'tide_drain', name: '潮汐吸噬', desc: '造成伤害时恢复 2 点生命', kind: 'drain', value: 2 },
  tide_rhythm: { id: 'tide_rhythm', name: '潮汐节律', desc: '每3回合触发一次：本回合自身伤害+2', kind: 'tideRhythm', value: 2 },
  rock_guard: { id: 'rock_guard', name: '磐岩护甲', desc: '受到的所有伤害 -3', kind: 'guard', value: 3 },
  spore_venom: { id: 'spore_venom', name: '剧毒孢子', desc: '攻击命中附加中毒 3 层', kind: 'venom', value: 3 },
  ghost_step: { id: 'ghost_step', name: '幽灵疾步', desc: '战斗开始速度 +3', kind: 'spd', value: 3 },
  dragon_thorns: { id: 'dragon_thorns', name: '玄铁反甲', desc: '受到攻击时反伤 3 点', kind: 'thorns', value: 3 },
  demon_frenzy: { id: 'demon_frenzy', name: '炼狱狂暴', desc: '生命低于 50% 时伤害 +3', kind: 'frenzy', value: 3 },
  hit_speed_up: { id: 'hit_speed_up', name: '受击加速', desc: '每次受到攻击后，自身速度 +1，可叠加最多 6 层', kind: 'spdOnHit', value: 1 },
  tree_speed_up: { id: 'tree_speed_up', name: '古木加速', desc: '每回合结束时回复3点生命值，每次受到攻击后，自身速度 +1，可叠加最多 8 层', kind: 'treeSpeedUp', value: 1 },

  // —— Boss 小怪 ——
  symbiotic_bark: { id: 'symbiotic_bark', name: '共生树皮', desc: '每回合开始恢复 2 点生命；若古树之主在场，恢复量翻倍为 4', kind: 'regen', value: 2 },
  thorn_slow: { id: 'thorn_slow', name: '荆棘缠绕', desc: '攻击时有 40% 概率使目标伤害 -1，持续 2 回合；若古树之主在场，概率为 60%', kind: 'thornEntangle', value: 1 },
  tide_echo: { id: 'tide_echo', name: '潮汐共鸣', desc: '潮汐巨蟹爆发时本回合自身伤害 +2', kind: 'tideEcho', value: 2 },
  shell_guard: { id: 'shell_guard', name: '寄居壳', desc: '受到的所有伤害-1，潮汐巨蟹在场时-2', kind: 'guard', value: 1 },
  rock_shell_break: { id: 'rock_shell_break', name: '岩壳崩解', desc: '每受到4次攻击，对全体敌人造成5点伤害并清除自身所有减益状态', kind: 'rockShellBreak', value: 4 },
  rock_shard: { id: 'rock_shard', name: '岩壳碎片', desc: '死亡时对全体敌人和友方造成3点真实伤害（无视护盾），波及巨像计入其受击计数', kind: 'rockShard', value: 3 },
  shadow_hunter: { id: 'shadow_hunter', name: '暗影追猎', desc: '对生命值低于50%的目标伤害+3；击杀目标后立即获得一次额外行动', kind: 'shadowHunter', value: 3 },
  shadow_follow: { id: 'shadow_follow', name: '暗影追随', desc: '暗影之王每击杀一个目标时，自身永久伤害+1', kind: 'shadowFollow', value: 1 },
  blood_scent: { id: 'blood_scent', name: '嗜血嗅觉', desc: '攻击目标永远为血量最低的敌人', kind: 'bloodScent', value: 0 },
  corrupt_spread: { id: 'corrupt_spread', name: '腐化蔓延', desc: '每当一个单位被附加中毒时，随机对另一个敌方单位附加中毒2层', kind: 'corruptSpread', value: 2 },
  corrupt_sac: { id: 'corrupt_sac', name: '腐化囊体', desc: '被攻击时50%概率使攻击者中毒2层', kind: 'corruptSac', value: 2 },
  sticky_body: { id: 'sticky_body', name: '粘滞躯体', desc: '攻击蛞蝓的单位速度-1，持续2回合', kind: 'stickyBody', value: 1 },

  // —— 幽灵船长 ——
  soul_siphon: { id: 'soul_siphon', name: '灵魂汲取', desc: '每次攻击命中汲取1点灵魂：5点灵魂伤害+2，10点灵魂每回合回3HP，20点灵魂伤害+3', kind: 'soulSiphon', value: 1 },
  ghost_soul: { id: 'ghost_soul', name: '灵魂链接', desc: '死亡时为幽灵船长+1灵魂', kind: 'ghostSoul', value: 1 },

  // —— 熔火领主 ——
  molten_armor: { id: 'molten_armor', name: '熔岩护体', desc: '受到的伤害 -2，受到攻击时灼烧攻击者 1 层', kind: 'guard', value: 2 },
  fire_rage: { id: 'fire_rage', name: '熔火狂暴', desc: '攻击命中附加灼烧 3 层；所有攻击伤害 +1', kind: 'scorch', value: 3 },
  ember_death: { id: 'ember_death', name: '余烬遗火', desc: '死亡时对全体敌人造成 3 点伤害 + 灼烧 3 层', kind: 'emberDeath', value: 3 },
  flame_aura: { id: 'flame_aura', name: '烈焰环绕', desc: '被攻击时 30% 概率使攻击者灼烧 2 层（熔火领主在场时 100%）', kind: 'flameAura', value: 2 },

  // —— 奇遇自创生物 ——
  stone_guard: { id: 'stone_guard', name: '磐岩之力', desc: '受到的所有伤害 -2', kind: 'guard', value: 2 },
  berserk: { id: 'berserk', name: '狂战', desc: '生命低于 50% 时伤害 +2', kind: 'frenzy', value: 2 },
  swift_wind: { id: 'swift_wind', name: '迅风', desc: '造成伤害时恢复 1 点生命', kind: 'drain', value: 1 },

  // —— 初级一阶进化专属 ——
  swift_power: { id: 'swift_power', name: '迅力', desc: '战斗开始速度 +3', kind: 'spd', value: 3 },
  tidal_regen: { id: 'tidal_regen', name: '潮汐再生', desc: '每回合开始恢复 3 点生命', kind: 'regen', value: 3 },
  blazing: { id: 'blazing', name: '灼焰', desc: '攻击命中附加灼烧 4 层', kind: 'scorch', value: 4 },
  venom_power: { id: 'venom_power', name: '蟒影', desc: '对中毒目标伤害 +3', kind: 'venomPower', value: 3 },

  // —— 刺刺二阶进化专属 ——
  thorn_royal: { id: 'thorn_royal', name: '荆棘之躯', desc: '受到攻击时反伤 3 点；每受到第 3 次攻击，反伤 5 点并恢复 2 点生命', kind: 'thornRoyal', value: 3 },

  // —— 传奇宠物重做被动 ——
  iron_cap: { id: 'iron_cap', name: '铁壁上限', desc: '每回合最多累计受到 10 点伤害，超出部分无效', kind: 'damageCap', value: 10 },
  serpent_hunt: { id: 'serpent_hunt', name: '蛇狩', desc: '攻击中毒目标时，无视其 8 点护盾/减伤效果，并额外造成 5 点伤害', kind: 'poisonBreak', value: 5 },
  gale_combo: { id: 'gale_combo', name: '疾风连携', desc: '每次使用攻击技能后，自身速度 +1（可叠加）；速度每高于目标 1 点，伤害 +1，上限 +5', kind: 'speedBonus', value: 5 },
  life_spring: { id: 'life_spring', name: '生命之泉', desc: '每回合开始恢复 3 点生命；每次受到伤害超过 6 点时，伤害减少 2 点', kind: 'lifeSpring', value: 6 },
  ember_body: { id: 'ember_body', name: '余烬焚身', desc: '攻击命中附加灼烧 4 层；对已灼烧的目标，每层灼烧使该次伤害 +1，上限 +5', kind: 'scorchPlus', value: 4 },

  // —— 玄铁渊龙 ——
  chain_master: { id: 'chain_master', name: '锁链掌控', desc: '锁链链接的敌人死亡时，回复15%最大生命+伤害+2持续2回合；自身被链接时，获取链接单位的被动效果', kind: 'chainMaster', value: 15 },
  chain_anchor: { id: 'chain_anchor', name: '锁链锚定', desc: '被锁链连接时受到的伤害-2', kind: 'chainAnchor', value: 2 },
  chain_spark: { id: 'chain_spark', name: '锁链火花', desc: '攻击锁链目标时伤害+2', kind: 'chainSpark', value: 2 },

  // —— 成长远征模式 Boss ——
  growth_drain: { id: 'growth_drain', name: '成长汲取', desc: '每次攻击命中 +1 成长点；累积 5 点时伤害 +3', kind: 'growthDrain', value: 5 },
  growth_value: { id: 'growth_value', name: '成长值', desc: '攻击命中+2成长值，回合结束+1成长值；每5成长值受伤-1（最多-5）', kind: 'growthValue', value: 5 },
  sacrifice: { id: 'sacrifice', name: '献祭', desc: '存活时每回合结束给予成长之主+1成长值；死亡时给予+3成长值', kind: 'sacrifice', value: 3 },

  // —— 炼狱魔君 ——
  fear_on_hit: { id: 'fear_on_hit', name: '恐惧支配', desc: '攻击命中附加恐惧1层；≥6层触发恐惧震慑（眩晕1回合+清除）', kind: 'fearOnHit', value: 1 },
  fear_lord: { id: 'fear_lord', name: '恐惧之王', desc: '攻击命中附加恐惧1层；对有恐惧效果的敌人伤害+2', kind: 'fearLord', value: 1 },
  fear_on_being_hit: { id: 'fear_on_being_hit', name: '恐惧传递', desc: '被攻击时50%概率给攻击者恐惧1层', kind: 'fearOnBeingHit', value: 1 },
  fear_on_round_start: { id: 'fear_on_round_start', name: '恐惧嚎叫', desc: '每回合开始随机给1个敌人恐惧1层', kind: 'fearOnRoundStart', value: 1 },
};

export function getPassive(id?: string): PassiveDef | undefined {
  if (!id) return undefined;
  const p = PASSIVES[id];
  return p;
}
