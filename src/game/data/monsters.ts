import type { MonsterSpecies } from '../types';

export const MONSTERS: Record<string, MonsterSpecies> = {
  time_sand_beast: {
    id: 'time_sand_beast', name: '时砂兽', emoji: '⌛', image: '/time_sand_beast.png', eggBorn: true,
    baseHp: 20, baseSpd: 3, rank: 2, tame: { difficulty: 0 },
    passive: 'time_rewind', skills: ['sand_time_strike', 'time_lag', 'sand_shield', 'time_haste'],
    desc: '特殊蛋孵化的固定形态生物，以时砂回溯挣脱死亡、干预出手顺序；不可进化，不可作为主宠或材料参与融合。',
  },
  momo: {
    id: 'momo', name: '迅迅', emoji: '🐭', image: '/01.png',
    baseHp: 10, baseSpd: 3,
    skills: ['punch', 'leaf_needle'],
    desc: '开局御三家之一，均衡型选手，速度与生存兼备。',
    passive: 'quick',
    evolutions: [{ to: 'momo_queen' }],
    tame: { difficulty: 0.75 }, rank: 1,
  },
  lulu: {
    id: 'lulu', name: '泡泡', emoji: '🐸', image: '/03.png',
    baseHp: 14, baseSpd: 3,
    skills: ['aqua_shot', 'water_bath'],
    desc: '开局御三家之一，血量最高的坦克型，靠持续回复磨血。',
    passive: 'watery_regen',
    evolutions: [{ to: 'lulu_king' }],
    tame: { difficulty: 0.75 }, rank: 1,
  },
  fifi: {
    id: 'fifi', name: '灼灼', emoji: '🔥', image: '/02.png',
    baseHp: 8, baseSpd: 4,
    skills: ['ember', 'double_hit'],
    desc: '开局御三家之一，灼烧刺客，但极其脆弱。',
    passive: 'heat',
    evolutions: [{ to: 'fifi_king' }],
    tame: { difficulty: 0.75 }, rank: 1,
  },
  kiki: {
    id: 'kiki', name: '铁墩', emoji: '🛡️', image: '/05.png',
    baseHp: 12, baseSpd: 2,
    skills: ['steel_spike', 'shield_skill'],
    desc: '血厚的基础宠，皮糙肉厚的盾卫。',
    passive: 'iron_guard',
    evolutions: [{ to: 'gora' }],
    tame: { difficulty: 0.75 }, rank: 1,
  },
  mimi: {
    id: 'mimi', name: '咪咪', emoji: '🐍', image: '/06.png',
    baseHp: 10, baseSpd: 3,
    skills: ['bite', 'poison_sting'],
    desc: '毒系刺客，单点爆发输出',
    passive: 'venom_fang',
    evolutions: [{ to: 'mimi_king' }],
    tame: { difficulty: 0.75 }, rank: 1,
  },
  pipi: {
    id: 'pipi', name: '刺刺', emoji: '🦔', image: '/04.png',
    baseHp: 11, baseSpd: 1,
    skills: ['weaken', 'provoke'],
    desc: '受击反伤，嘲讽敌人',
    passive: 'spike',
    evolutions: [{ to: 'sisi' }],
    tame: { difficulty: 0.75 }, rank: 1,
  },
  momo_queen: {
    id: 'momo_queen', name: '迅牙', emoji: '🐹', image: '/01-1.png',
    baseHp: 15, baseSpd: 4,
    skills: ['swift_needle', 'flying_leaf', 'shockwave'],
    desc: '迅迅的融合形态，高速多段连击手，先手爆发。',
    passive: 'swift_power',
    evolutions: [{ to: 'momo_god' }],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  lulu_king: {
    id: 'lulu_king', name: '泡泡将', emoji: '🐢', image: '/03-1.png',
    baseHp: 22, baseSpd: 4,
    skills: ['water_gun', 'heal_light', 'water_wave'],
    desc: '泡泡的融合形态，高血量的水系坦克，攻击群体并自愈。',
    passive: 'tidal_regen',
    evolutions: [{ to: 'lulu_god' }],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  fifi_king: {
    id: 'fifi_king', name: '灼刃', emoji: '🦊', image: '/02-1.png',
    baseHp: 13, baseSpd: 6,
    skills: ['flame_combo', 'roar', 'fire_shock'],
    desc: '灼灼的融合形态，高速度的火焰刺客，多段灼烧爆发。',
    passive: 'blazing',
    evolutions: [{ to: 'fifi_god' }],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  sisi: {
    id: 'sisi', name: '棘尾', emoji: '🦂', image: '/04-1.png',
    baseHp: 18, baseSpd: 3,
    skills: ['weaken', 'provoke', 'thorn_skill'],
    desc: '刺刺的融合形态，控制+反伤的肉盾，擅长削弱和限制敌人。',
    passive: 'hard_armor',
    evolutions: [{ to: 'sisi_god' }],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  gora: {
    id: 'gora', name: '铁卫', emoji: '🐊', image: '/05-1.png',
    baseHp: 19, baseSpd: 3,
    skills: ['steel_spike', 'shield_skill', 'shield_counter'],
    desc: '铁墩的融合形态，高血铁壁，护盾防御的铁壁坦克。',
    passive: 'thick_shell',
    evolutions: [{ to: 'gora_god' }],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  mimi_king: {
    id: 'mimi_king', name: '蟒影', emoji: '🐍', image: '/06-1.png',
    baseHp: 15, baseSpd: 5,
    skills: ['poison_sting', 'shadow_strike', 'shadow_claw'],
    desc: '咪咪的融合形态，毒系影袭刺客，优先猎杀后排。',
    passive: 'venom_power',
    evolutions: [{ to: 'mimi_god' }],
    tame: { difficulty: 0.4 }, rank: 2,
  },
  gora_god: {
    id: 'gora_god', name: '铁壁神', emoji: '🗿', image: '/05-2.png',
    baseHp: 26, baseSpd: 4,
    skills: ['steel_spike', 'iron_domain', 'shield_quake', 'iron_double', 'shield_skill'],
    desc: '铁墩的最终形态，拥有受击上限的不朽堡垒，为队友提供大量护盾。',
    passive: 'iron_cap',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  mimi_god: {
    id: 'mimi_god', name: '深渊蛇王', emoji: '👹', image: '/06-2.png',
    baseHp: 22, baseSpd: 6,
    skills: ['poison_sting', 'shadow_strike', 'poison_mist', 'toxic_bite'],
    desc: '咪咪的最终形态，毒系爆发刺客，真实伤害无视护盾。',
    passive: 'serpent_hunt',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  sisi_god: {
    id: 'sisi_god', name: '棘刺王', emoji: '🦂', image: '/04-2.png',
    baseHp: 26, baseSpd: 4,
    skills: ['thorn_skill', 'steel_spike', 'revenge_thorn', 'group_taunt'],
    desc: '刺刺的最终形态，荆棘反伤坦克，受击越多反伤越痛，控制+反伤的极致肉盾。',
    passive: 'thorn_royal',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  momo_god: {
    id: 'momo_god', name: '迅天', emoji: '🐉', image: '/01-2.png',
    baseHp: 22, baseSpd: 5,
    skills: ['wind_flash', 'wind_feather', 'whirlwind', 'swift_strike'],
    desc: '迅迅最终形态，越打越快，速度差转化为伤害',
    passive: 'gale_combo',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  lulu_god: {
    id: 'lulu_god', name: '泡泡龙神', emoji: '🐳', image: '/03-2.png',
    baseHp: 30, baseSpd: 5,
    skills: ['tidal_domain', 'heal_light', 'water_shot', 'wave'],
    desc: '泡泡最终形态，全体回血与伤害减免',
    passive: 'life_spring',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  fifi_god: {
    id: 'fifi_god', name: '灼天', emoji: '🐲', image: '/02-2.png',
    baseHp: 20, baseSpd: 7,
    skills: ['burn_burst', 'roar', 'flame_shield', 'flame_slash', 'flame_combo'],
    desc: '灼灼最终形态，群体灼烧，爆发伤害。',
    passive: 'ember_body',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  boss_vine: {
    id: 'boss_vine', name: '古树之主', emoji: '🌳', image: '/07.png',
    baseHp: 28, baseSpd: 2,
    skills: ['leaf_needle', 'roar', 'leaf_quake', 'vine_whip', 'wild_leaf', 'boss_vine_shield'],
    desc: '越挨打越快的站桩树王，小怪会保护它。速度越快，狂叶和叶震波伤害越高。',
    passive: 'tree_speed_up',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_tree_guard: {
    id: 'boss_minion_tree_guard', name: '树精卫士', emoji: '🌿', image: '/07-1.png',
    baseHp: 18, baseSpd: 2,
    skills: ['weaken', 'entangle'],
    desc: '古树之主的贴身护卫，削弱敌人保护Boss。',
    passive: 'symbiotic_bark',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_thorn: {
    id: 'boss_minion_thorn', name: '荆棘卫士', emoji: '🌱', image: '/07-2.png',
    baseHp: 12, baseSpd: 3,
    skills: ['poison_vine', 'steel_spike'],
    desc: '骚扰型小怪，毒刺+铁刺双debuff削弱敌人。',
    passive: 'thorn_slow',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_crab: {
    id: 'boss_crab', name: '潮汐巨蟹', emoji: '🦀', image: '/08.png',
    baseHp: 36, baseSpd: 3,
    skills: ['double_hit', 'claw_smash', 'wave_aura', 'water_cannon', 'tidal_slam'],
    desc: '多段连击手，每2回合爆发一次，配合波光环强化连击。',
    passive: 'tide_rhythm',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_shrimp: {
    id: 'boss_minion_shrimp', name: '潮汐虾兵', emoji: '🦐', image: '/08-1.png',
    baseHp: 16, baseSpd: 4,
    skills: ['double_hit', 'aqua_shot'],
    desc: '与巨蟹共享爆发节奏，爆发回合双压力。',
    passive: 'tide_echo',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_hermit: {
    id: 'boss_minion_hermit', name: '寄居蟹', emoji: '🐚', image: '/08-2.png',
    baseHp: 14, baseSpd: 1,
    skills: ['punch', 'shell_up'],
    desc: '纯肉盾，缩壳拖慢节奏让巨蟹等到爆发回合。',
    passive: 'shell_guard',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_golem: {
    id: 'boss_golem', name: '岩甲巨像', emoji: '🗻', image: '/12.png',
    baseHp: 40, baseSpd: 2,
    skills: ['steel_spike', 'quake', 'rock_reforge', 'rock_throw'],
    desc: '受击计数惩罚机制，多段连击反而触发全屏伤害。碎岩重组可主动消灭小怪触发自爆，加速岩壳崩解。',
    passive: 'rock_shell_break',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_rock: {
    id: 'boss_minion_rock', name: '碎石傀儡', emoji: '🪨', image: '/12-1.png',
    baseHp: 10, baseSpd: 1,
    skills: ['steel_spike', 'gravel_throw'],
    desc: '低血量自爆小怪，死亡时对全体敌人造成3点真实伤害并加速巨像岩壳崩解。',
    passive: 'rock_shard',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_crystal: {
    id: 'boss_minion_crystal', name: '晶石虫', emoji: '💎', image: '/12-2.png',
    baseHp: 8, baseSpd: 5,
    skills: ['double_hit', 'crystal_sting'],
    desc: '高速多段小怪，连击快速堆叠巨像受击计数器，死亡自爆同样计入巨像计数。',
    passive: 'rock_shard',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_dark: {
    id: 'boss_dark', name: '暗影之王', emoji: '😈', image: '/09.png',
    baseHp: 36, baseSpd: 5,
    skills: ['dark_shock', 'shadow_flurry', 'roar', 'shadow_rift'],
    desc: '残血收割者，暗影印记+乱舞打出斩杀连段，击杀再动滚雪球。',
    passive: 'shadow_hunter',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_shadow_servant: {
    id: 'boss_minion_shadow_servant', name: '暗影仆从', emoji: '👤', image: '/09-1.png',
    baseHp: 14, baseSpd: 5,
    skills: ['shadow_claw', 'snipe'],
    desc: '暗影之王的贴身侍卫，杀人后永久增伤。',
    passive: 'shadow_follow',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_shadow_bat: {
    id: 'boss_minion_shadow_bat', name: '影蝠', emoji: '🦇', image: '/09-2.png',
    baseHp: 10, baseSpd: 6,
    skills: ['shadow_claw', 'leech_bite'],
    desc: '残血收割者，与王共同压制低血量目标。',
    passive: 'blood_scent',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_fire: {
    id: 'boss_fire', name: '熔火领主', emoji: '🌋', image: '/14.png',
    baseHp: 42, baseSpd: 6,
    skills: ['blood_fang', 'roar', 'flame_shield', 'flame_combo'],
    altSkills: ['flame_burst', 'inferno', 'flame_pillar', 'roar'],
    passive: 'molten_armor',
    altPassive: 'fire_rage',
    desc: '形态切换型首领：血量>50%为熔岩形态（减伤+灼血撕咬），血量≤50%为爆发形态（全体灼烧+伤害+3）。',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_lava_golem: {
    id: 'boss_minion_lava_golem', name: '烈焰巨人', emoji: '🪨', image: '/14-1.png',
    baseHp: 20, baseSpd: 3,
    skills: ['flame_combo', 'fire_shock'],
    desc: '高血量坦克，死亡时释放火焰引爆全场。',
    passive: 'ember_death',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_fire_sprite: {
    id: 'boss_minion_fire_sprite', name: '火精灵', emoji: '🧚', image: '/14-2.png',
    baseHp: 12, baseSpd: 5,
    skills: ['flame_combo', 'flame_slash'],
    desc: '高速骚扰型，被攻击时反向灼烧攻击者。',
    passive: 'flame_aura',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_moss: {
    id: 'boss_moss', name: '苔藓领主', emoji: '🍄', image: '/10.png',
    baseHp: 44, baseSpd: 3,
    skills: ['poison_sting', 'spore_burst', 'spore_summon', 'spore_shield'],
    desc: '全首领最高血量之一，中毒扩散全队，愈光/解毒手段变得关键。',
    passive: 'corrupt_spread',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_spore_sac: {
    id: 'boss_minion_spore_sac', name: '毒孢囊', emoji: '🫧', image: '/10-1.png',
    baseHp: 10, baseSpd: 4,
    skills: ['poison_sting', 'toxic_burst'],
    desc: '移动毒弹，死亡时毒雾爆发全体敌人。',
    passive: 'corrupt_sac',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_slug: {
    id: 'boss_minion_slug', name: '沼地蛞蝓', emoji: '🐛', image: '/10-2.png',
    baseHp: 16, baseSpd: 1,
    skills: ['poison_sting', 'slime_cover'],
    desc: '减速坦克，拖慢玩家给领主铺毒时间。',
    passive: 'sticky_body',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_ghost: {
    id: 'boss_ghost', name: '幽灵船长', emoji: '👻', image: '/11.png',
    baseHp: 42, baseSpd: 6,
    skills: ['soul_echo', 'ghostly_harvest', 'roar', 'ghostly_summon', 'soul_rend'],
    desc: '高速灵魂收集者，攻击命中汲取灵魂增强自身，灵魂越多伤害越高。小怪全灭时可重新召唤。',
    passive: 'soul_siphon',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_ghost_sailor: {
    id: 'boss_minion_ghost_sailor', name: '幽灵水手', emoji: '🧟', image: '/11-1.png',
    baseHp: 16, baseSpd: 4,
    skills: ['shadow_claw', 'soul_share'],
    desc: '幽灵船长的船员，可主动为船长献祭灵魂。',
    passive: 'ghost_soul',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_phantom: {
    id: 'boss_minion_phantom', name: '幽影', emoji: '💨', image: '/11-2.png',
    baseHp: 10, baseSpd: 6,
    skills: ['shadow_claw', 'ghost_burst'],
    desc: '高速幽灵刺客，可自爆对全体敌人造成3点伤害。',
    passive: 'ghost_soul',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_dragon: {
    id: 'boss_dragon', name: '玄铁渊龙', emoji: '⚔️', image: '/13.png',
    baseHp: 60, baseSpd: 7,
    skills: ['chain_bind', 'chain_activate', 'iron_tail', 'dragon_claw', 'iron_wall'],
    passive: 'chain_master',
    desc: '锁链束缚型首领，用锁链连接玩家单位共享伤害，引爆锁链造成爆发。',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_chain_guard: {
    id: 'boss_minion_chain_guard', name: '玄铁链卫', emoji: '⛓️', image: '/13-1.png',
    baseHp: 24, baseSpd: 3,
    skills: ['chain_link', 'iron_tail'],
    passive: 'chain_anchor',
    desc: '被锁链连接时减伤的坦克小怪，永久链接自身与Boss。',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_chain_smith: {
    id: 'boss_minion_chain_smith', name: '渊龙锁匠', emoji: '🔗', image: '/13-2.png',
    baseHp: 20, baseSpd: 6,
    skills: ['pierce_strike', 'chain_bind'],
    passive: 'chain_spark',
    desc: '攻击锁链目标时伤害加成的输出小怪，能释放锁链束缚。',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_demon: {
    id: 'boss_demon', name: '炼狱魔君', emoji: '😈', image: '/15.png',
    baseHp: 48, baseSpd: 7,
    skills: ['fear_gaze', 'hell_scream', 'fear_burst', 'despair_gaze', 'fear_harvest'],
    desc: '恐惧之王，攻击附加恐惧，对有恐惧效果的敌人造成额外伤害。',
    passive: 'fear_lord',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_demon_imp: {
    id: 'boss_minion_demon_imp', name: '炼狱小鬼', emoji: '👹', image: '/15-2.png',
    baseHp: 14, baseSpd: 5,
    skills: ['fear_claw', 'fear_bolt'],
    desc: '高速骚扰型，被攻击时有概率反向恐惧攻击者。',
    passive: 'fear_on_being_hit',
    tame: { difficulty: 0 }, rank: 4,
  },
  boss_minion_hellhound: {
    id: 'boss_minion_hellhound', name: '地狱犬', emoji: '🐕', image: '/15-1.png',
    baseHp: 20, baseSpd: 4,
    skills: ['fear_bite', 'fear_howl'],
    desc: '坦克型，每回合开始随机恐惧一个敌人，保护Boss。',
    passive: 'fear_on_round_start',
    tame: { difficulty: 0 }, rank: 4,
  },
  // 奇遇关「造物」：自创生物，不出现在战斗池，技能由玩家随机组合
  custom_guardian: {
    id: 'custom_guardian', name: '岩甲兽', emoji: '🗿',
    baseHp: 20, baseSpd: 2,
    skills: ['punch', 'tail', 'steel_spike', 'roar', 'heal_light'],
    desc: '奇遇关「造物」的血厚肉盾模板，可打全体可治疗。',
    passive: 'stone_guard',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  custom_fury: {
    id: 'custom_fury', name: '狂焰兽', emoji: '🐺',
    baseHp: 16, baseSpd: 5,
    skills: ['ember', 'double_hit', 'bite', 'flame_burst', 'roar'],
    desc: '奇遇关「造物」的输出模板，范围灼烧。',
    passive: 'berserk',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  custom_gale: {
    id: 'custom_gale', name: '迅风兽', emoji: '🕊️',
    baseHp: 15, baseSpd: 8,
    skills: ['leaf_needle', 'aqua_shot', 'shadow_claw', 'double_hit', 'poison_sting', 'snipe'],
    desc: '奇遇关「造物」的高速模板，速度全场最高，抢先手压制。',
    passive: 'swift_wind',
    tame: { difficulty: 0.3 }, rank: 3,
  },
  // —— 成长远征模式 Boss ——
  growth_master: {
    id: 'growth_master', name: '成长之主', emoji: '🐉',
    baseHp: 80, baseSpd: 8,
    skills: ['growth_bind', 'growth_roar', 'growth_ultimate', 'growth_impact', 'growth_eruption', 'growth_summon'],
    desc: '掌握成长奥秘的远古存在，通过累积成长值强化自身并召唤傀儡作战。',
    passive: 'growth_value', tame: { difficulty: 0 }, rank: 4,
    growthValue: 5,
  },
  growth_puppet: {
    id: 'growth_puppet', name: '成长傀儡', emoji: '🤖',
    baseHp: 10, baseSpd: 2,
    skills: ['puppet_bind', 'puppet_fist', 'puppet_soul_return'],
    desc: '成长之主的傀儡，献祭自身为成长之主提供成长值。',
    passive: 'sacrifice', tame: { difficulty: 0 }, rank: 4,
  },
  coal: {
    id: 'coal', name: '煤煤', emoji: '🦡', image: '/coal.png',
    baseHp: 13, baseSpd: 1, skills: ['coal_claw', 'furnace_shell'],
    passive: 'coal_furnace', evolutions: [{ to: 'coal_guard' }],
    desc: '背负煤块的林地小獾，以炉壳承受攻击，让敌人在余火中燃烧。',
    tame: { difficulty: 0.75 }, rank: 1,
  },
  coal_guard: {
    id: 'coal_guard', name: '炉甲獾', emoji: '🦡', image: '/coal_guard.png',
    baseHp: 22, baseSpd: 2, skills: ['coal_claw', 'furnace_shell', 'ash_shelter'],
    passive: 'armored_furnace',
    evolutions: [{ to: 'furnace_beast' }],
    desc: '煤煤的融合形态，炉甲中的余火更加炽热，也能用灰烬护住同伴。',
    tame: { difficulty: 0.4 }, rank: 2,
  },
  candle: {
    id: 'candle', name: '烛烛', emoji: '🦋', image: '/candle.png', baseHp: 9, baseSpd: 5,
    skills: ['candle_flame', 'stoke_fire'], passive: 'candle_afterglow',
    evolutions: [{ to: 'lantern_moth' }], tame: { difficulty: 0.75 }, rank: 1,
    desc: '腹部闪着微光的小飞蛾，为余火添薪，并将温暖送给受伤伙伴。',
  },
  lantern_moth: {
    id: 'lantern_moth', name: '灯翅蛾', emoji: '🦋', image: '/lantern_moth.png', baseHp: 15, baseSpd: 6,
    skills: ['candle_flame', 'stoke_fire', 'lamp_guard'], passive: 'lantern_afterglow',
    evolutions: [{ to: 'eternal_moth' }],
    tame: { difficulty: 0.4 }, rank: 2,
    desc: '烛烛的融合形态，灯笼般的尾部照亮同伴，以护灯和余温维系阵线。',
  },
  furnace_beast: {
    id: 'furnace_beast', name: '熔炉兽', emoji: '🦡', image: '/furnace_beast.png', baseHp: 29, baseSpd: 3,
    skills: ['molten_claw', 'furnace_bastion', 'ash_shelter', 'seal_furnace'], passive: 'molten_furnace',
    tame: { difficulty: 0.3 }, rank: 3,
    desc: '煤煤的传奇形态，胸甲化作赤热炉膛，受击时以余火灼敌并凝成护盾，危急时封炉护住全队。',
  },
  eternal_moth: {
    id: 'eternal_moth', name: '长明灵蛾', emoji: '🦋', image: '/eternal_moth.png', baseHp: 23, baseSpd: 6,
    skills: ['eternal_flame', 'blazing_fuel', 'lamp_guard', 'ember_transfer'], passive: 'eternal_light',
    tame: { difficulty: 0.3 }, rank: 3,
    desc: '烛烛的传奇形态，暖金翅纹与灯尾长明不灭，将燃烧敌人的余光化为全队生机。',
  },
  molten_larva: {
    id: 'molten_larva', name: '熔壳虫', emoji: '🐛', image: '/molten_larva.png', baseHp: 14, baseSpd: 2,
    skills: ['heated_shell_bump', 'molten_self_burn'], passive: 'heated_carapace',
    evolutions: [{ to: 'molten_beetle' }],
    tame: { difficulty: 0.7 }, rank: 1,
    desc: '黑炭甲壳的低速幼虫，主动引火准备护盾，也能在顶撞后消耗余火换盾。剩余灼烧仍会伤害自身，可融合为熔甲虫。',
  },
  ember_hawk: {
    id: 'ember_hawk', name: '焚风雏鹰', emoji: '🐣', image: '/ember_hawk.png', baseHp: 10, baseSpd: 5,
    skills: ['flame_tracing_feather', 'fire_feather'], passive: 'burning_feather',
    evolutions: [{ to: 'searing_hawk' }],
    tame: { difficulty: 0.75 }, rank: 1,
    desc: '翅尖焦黑的高速幼鹰，循着火光攻击后排，优先剥开燃烧敌人的护盾，为队友创造击杀机会，可融合为焚风鹰。',
  },
  molten_beetle: {
    id: 'molten_beetle', name: '熔甲虫', emoji: '🐞', image: '/molten_beetle.png', baseHp: 19, baseSpd: 3,
    skills: ['heated_shell_bump', 'molten_self_burn', 'shell_charge'], passive: 'molten_molt',
    tame: { difficulty: 0.4 }, rank: 2,
    evolutions: [{ to: 'molten_beast' }],
    desc: '赤色熔线贯穿厚重甲壳的盾攻手，将自身余火转换为护盾，再以裂壳冲撞消耗护盾进攻。',
  },
  searing_hawk: {
    id: 'searing_hawk', name: '焚风鹰', emoji: '🦅', image: '/searing_hawk.png', baseHp: 15, baseSpd: 6,
    skills: ['flame_tracing_feather', 'fire_feather', 'burn_brand'], passive: 'searing_feather',
    tame: { difficulty: 0.4 }, rank: 2,
    evolutions: [{ to: 'solar_eagle' }],
    desc: '金纹赤羽的高速猛禽，剥开燃烧敌人的护盾，并用灼烧烙印引导伙伴命中后集中引爆余火。',
  },
  fire_fox: {
    id: 'fire_fox', name: '火狐', emoji: '🦊', image: '/fire_fox.png', baseHp: 11, baseSpd: 4,
    skills: ['sealed_style_foxfire', 'illusory_flame'], passive: 'fox_flame_body', tame: { difficulty: 0.7 }, rank: 1,
    evolutions: [{ to: 'phantom_tail_fox' }, { to: 'torch_fox' }],
    desc: '将自身灼烧化为狐火的灵巧幼狐，免疫灼烧伤害，以自燃逐渐强化点火能力；仍会受到直接攻击与中毒伤害。',
  },
  torch_fox: {
    id: 'torch_fox', name: '传火狐', emoji: '🦊', image: '/torch_fox.png', baseHp: 16, baseSpd: 5,
    skills: ['ember_veil', 'twin_tail_flames', 'pass_flame'], passive: 'flame_relay',
    evolutions: [{ to: 'torch_fox_lord' }], tame: { difficulty: 0.4 }, rank: 2,
    desc: '火狐的传火分支，以灼烧为伙伴传递火种，保护队伍并准备后续引燃。',
  },
  torch_fox_lord: {
    id: 'torch_fox_lord', name: '传火狐尊', emoji: '🦊', image: '/torch_fox_lord.png', baseHp: 22, baseSpd: 6,
    skills: ['pass_flame', 'relay_wildfire', 'ignite_embers', 'ember_veil'], passive: 'flame_relay',
    tame: { difficulty: 0.3 }, rank: 3,
    desc: '汇聚战场火种的传火传奇，通过群体传火与火幕庇护支援伙伴。',
  },
  phantom_tail_fox: {
    id: 'phantom_tail_fox', name: '幻尾火狐', emoji: '🦊', image: '/phantom_tail_fox.png', baseHp: 16, baseSpd: 5,
    skills: ['twin_tail_flames', 'illusory_flame', 'burn_tail'], passive: 'twin_fox_flame', tame: { difficulty: 0.4 }, rank: 2,
    evolutions: [{ to: 'nine_tail_sovereign' }],
    desc: '双尾间燃起多重狐火，随机向不同敌人扫出火焰；焚尾可快速积累狐火，但每场只有一次机会。',
  },
  nine_tail_sovereign: {
    id: 'nine_tail_sovereign', name: '九尾炎尊', emoji: '🦊', image: '/nine_tail_sovereign.png', baseHp: 20, baseSpd: 6,
    skills: ['twin_tail_flames', 'burn_tail', 'nine_tail_wildfire', 'flame_tail_shield'], passive: 'nine_tail_heart', tame: { difficulty: 0.3 }, rank: 3,
    desc: '九尾环绕焰心，借自燃和承受攻击积攒最多九层狐火；满层后灼烧铺场与直接攻击一同增强。',
  },
  light_moss: {
    id: 'light_moss', name: '光苔球', emoji: '🌱', image: '/light_moss.png', baseHp: 12, baseSpd: 3,
    skills: ['aqua_shot', 'light_bath'], passive: 'heat_moss', tame: { difficulty: 0.75 }, rank: 1,
    evolutions: [{ to: 'moss_beast' }],
    desc: '中心透出暖白光的淡绿苔球，以光浴恢复伙伴生命，每次治疗后吸走最多两层灼烧；过早清火也会减少熔甲伙伴的燃料。',
  },
  moss_beast: {
    id: 'moss_beast', name: '光苔兽', emoji: '🌿', image: '/moss_beast.png', baseHp: 18, baseSpd: 4,
    skills: ['light_bath', 'burn_reversal', 'purifying_orb'], passive: 'clean_moss', tame: { difficulty: 0.4 }, rank: 2,
    evolutions: [{ to: 'solar_spirit' }],
    desc: '背负叶簇的四足苔兽，为燃烧伙伴提供更强治疗并清除余火，也能以净光球攻击燃烧敌人。',
  },
  solar_spirit: {
    id: 'solar_spirit', name: '日炎灵', emoji: '☀️', image: '/solar_spirit.png', baseHp: 26, baseSpd: 5,
    skills: ['burn_reversal', 'solar_strike', 'clean_flame_care', 'solar_heal'], passive: 'clear_flame', tame: { difficulty: 0.3 }, rank: 3,
    desc: '披着叶之斗篷的暖光灵体，将伙伴被移除的余火凝成日华，增强攻击与治疗；未能持续清火时，日华逐渐消退。',
  },
  molten_beast: {
    id: 'molten_beast', name: '熔甲兽', emoji: '🪲', image: '/molten_beast.png', baseHp: 25, baseSpd: 4,
    skills: ['heated_shell_bump', 'molten_self_burn', 'shell_charge', 'molten_quake'], passive: 'red_carapace',
    tame: { difficulty: 0.3 }, rank: 3,
    desc: '赤红炉腹藏在六足重甲下，将余火炼成护盾，再选择集中冲撞或震荡铺火；护盾无法抵挡自身灼烧。',
  },
  solar_eagle: {
    id: 'solar_eagle', name: '烈日神鹰', emoji: '🦅', image: '/solar_eagle.png', baseHp: 21, baseSpd: 7,
    skills: ['flame_tracing_feather', 'fire_feather', 'burn_brand', 'sun_sunder'], passive: 'solar_feather',
    tame: { difficulty: 0.3 }, rank: 3,
    desc: '日轮般的金红羽翼掠过战场，拆解敌方护盾并转为灼烧，以烙印引导伙伴集火。',
  },
  mimic_beast: {
    id: 'mimic_beast', name: '百变兽', emoji: '🎲', image: '/mimic_beast.png', eggBorn: true,
    baseHp: 18, baseSpd: 4, rank: 2, tame: { difficulty: 0 },
    passive: 'myriad_forms', skills: [],
    desc: '特殊蛋孵化的固定形态生物。每场战斗开始时以万变抽取4个主动技能；不可进化、融合或驯服，不进入野生生物池。',
  },
  mirror_beast: {
    id: 'mirror_beast', name: '镜影兽', emoji: '🪞', eggBorn: true,
    baseHp: 18, baseSpd: 5, rank: 2, tame: { difficulty: 0 },
    passive: 'mirror_reflection', skills: ['mirror_speed_up', 'mirror_speed_down'],
    desc: '固定形态的特殊蛋生物，不可进化、融合或驯服。调节本场速度，接在队友之后镜像复制一次其刚使用的技能。',
  },
  crystal_core_beast: {
    id: 'crystal_core_beast', name: '晶核兽', emoji: '💠', eggBorn: true,
    baseHp: 20, baseSpd: 1, rank: 2, tame: { difficulty: 0 },
    passive: 'crystal_conversion', skills: ['core_crystal_spike', 'core_crystal_wall', 'core_crystal_burst', 'core_crystal_cleanse'],
    desc: '特殊蛋孵化的固定形态生物，不可进化、融合或驯服。净化自身持续负面状态获得护盾，再以护盾发动攻击或回合末真实伤害。',
  },
};

/** 第一组：迅迅/泡泡/灼灼 → 选一只获得2只 */
export const STARTER_GROUP_1 = ['momo', 'lulu', 'fifi'];
/** 第二组：铁墩/咪咪/刺刺 → 选一只获得1只 */
export const STARTER_GROUP_2 = ['kiki', 'mimi', 'pipi'];

export function getMonster(id: string): MonsterSpecies {
  const m = MONSTERS[id];
  if (!m) throw new Error(`未知怪物: ${id}`);
  return m;
}

/** 融合链深度：沿进化链向上数祖先个数（0=基础形态、1=第一阶、2=第二阶…） */
export function fusionDepth(id: string): number {
  let depth = 0;
  let cur = id;
  for (;;) {
    const parent = Object.values(MONSTERS).find((m) => m.evolutions?.some((e) => e.to === cur));
    if (!parent) break;
    depth += 1;
    cur = parent.id;
  }
  return depth;
}

/** 主模式进化链每阶均需两只同形态；其他物种沿用原有需求。 */
export function fusionNeed(id: string): number {
  if (MAIN_BASE_POOL.includes(id) || MAIN_EVO1_POOL.includes(id) || id === 'torch_fox') return 2;
  return fusionDepth(id) + 2;
}

/** 按进化阶段划分的物种池（用于事件招募） */
export const BASE_POOL = ['momo', 'lulu', 'fifi', 'kiki', 'mimi', 'pipi'];
/** 特殊蛋独立池，不并入任何地区或野生遭遇池。 */
export const SPECIAL_EGG_POOL = ['time_sand_beast', 'mimic_beast', 'mirror_beast', 'crystal_core_beast'];
export const EVO1_POOL = ['momo_queen', 'lulu_king', 'fifi_king', 'sisi', 'gora', 'mimi_king'];
export const EVO2_POOL = ['momo_god', 'lulu_god', 'fifi_god', 'gora_god', 'mimi_god'];

/** 主模式新增伙伴池；原六条进化链池保留用于开局与专项评估。 */
export const MAIN_BASE_POOL = [...BASE_POOL, 'coal', 'candle', 'molten_larva', 'ember_hawk', 'light_moss', 'fire_fox'];
export const MAIN_EVO1_POOL = [...EVO1_POOL, 'coal_guard', 'lantern_moth', 'molten_beetle', 'searing_hawk', 'moss_beast', 'phantom_tail_fox', 'torch_fox'];
export const MAIN_EVO2_POOL = [...EVO2_POOL, 'furnace_beast', 'eternal_moth', 'molten_beast', 'solar_eagle', 'solar_spirit', 'nine_tail_sovereign', 'torch_fox_lord'];
