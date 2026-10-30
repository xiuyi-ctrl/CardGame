import { generateGrowthMap } from '../../src/game/core/growth-map';
import { CollapseWarning } from '../../src/ui/CollapseWarning';
// 仅由独立验收服务器加载，不进入生产入口，也不读取或覆盖真实存档。
import { createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import * as screens from '../../src/ui/App';
import { BattleScreen } from '../../src/ui/BattleScreen';
import { FormationScreen } from '../../src/ui/FormationScreen';
import { GauntletOrderScreen } from '../../src/ui/GauntletOrderScreen';
import { GrowthScreen } from '../../src/ui/GrowthScreen';
import { GrowthEncounterScreen } from '../../src/ui/GrowthEncounterScreen';
import { beginGrowthEncounter, type GrowthEncounterKind } from '../../src/game/state/growth-encounters';
import { buildGrowthEvent } from '../../src/game/data/growth-events';
import { GROWTH_SPECIAL_REWARDS } from '../../src/game/data/growth-special';
import { BlacksmithScreen } from '../../src/ui/BlacksmithScreen';
import { EnhanceStoneScreen } from '../../src/ui/EnhanceStoneScreen';
import { EnhanceResetScreen } from '../../src/ui/EnhanceResetScreen';
import { SkillPickScreen } from '../../src/ui/SkillPickScreen';
import { Arena3Screen } from '../../src/ui/Arena3Screen';
import { CampFusionScreen, CampFusionSkillScreen, CampRestScreen, SpecialTargetScreen } from '../../src/ui/CampScreens';
import { ProgressionChoiceScreen, AttributeBoostScreen, CreationScreen, RevivalScreen } from '../../src/ui/ProgressionScreens';
import { MobileShell } from '../../src/ui/mobile';
import { TestSessionFrame } from '../../src/ui/TestSetupScreen';
import { preloadImages } from '../../src/ui/imageCache';
import { CREATURE_IMAGES } from '../../src/game/data/creature-art';
import { CreatureStylePreview, CREATURE_STYLE_IMAGES } from './CreatureStylePreview';
import { createInitialState, gameReducer } from '../../src/game/state/reducer';
import { createBattle, makeUnit, performGauntletSwap, playerTame, playerSkill, playerEndTurn } from '../../src/game/core/battle';
import { ITEMS } from '../../src/game/data/items';
import { FOODS } from '../../src/game/data/foods';
import { emptyMainRating } from '../../src/game/rating';
import { generateMap, generateRewards, buildEventByType, SPECIAL_REWARDS, RELIC_ORDER } from '../../src/game/state/game';
import { createRng } from '../../src/game/rng';
import type { GameState } from '../../src/game/state/game';
import type { StatusEffect } from '../../src/game/types';
import '../../src/ui/styles.css';
import '../../src/ui/mobile.css';

// 模拟 Android 的触控媒体条件；其余媒体查询仍由 Chromium 的真实视口计算。
const nativeMatchMedia = window.matchMedia.bind(window);
let mobileEmulation = true;
window.matchMedia = query => query === '(pointer: coarse) and (max-width: 1200px)'
  ? nativeMatchMedia(mobileEmulation ? '(min-width: 0px)' : '(max-width: -1px)') : nativeMatchMedia(query);

const ui = screens as unknown as Record<string, any>;
const base = gameReducer(createInitialState(), { type: 'START_RUN', starterId: 'momo', companionId: 'lulu', seed: 123 });
const ids = ['momo', 'lulu', 'fifi', 'mimi', 'kiki', 'pipi', 'momo', 'fifi'];
base.roster = ids.map((id, i) => ({ ...makeUnit(id, true, (i % 3) as 0 | 1 | 2, false, i < 3 ? 'front' : 'back'), growthPoints: 100 }));
base.field = base.roster.slice(0, 5).map(u => u.uid);
base.gold = 123;
base.inventory = Object.fromEntries([...Object.keys(ITEMS), ...Object.keys(FOODS)].map(id => [id, 3]));
const first = base.roster[0];
const rewards = [
  { id: 'gold', kind: 'gold', label: '金币补给', desc: '获得30金币', amount: 30 },
  { id: 'recruit', kind: 'recruit', label: '招募伙伴', desc: '从两位候选伙伴中选择一位', recruitCandidates: ['momo', 'fifi_king'] },
  { id: 'food', kind: 'food', label: '捕获食物', desc: '获得一份捕获食物', foodId: 'berry', amount: 1 },
];
const encounter = [{ speciesId: 'fifi' }, { speciesId: 'lulu' }, { speciesId: 'momo' }];
const formation = { units: base.roster, initialField: base.roster.slice(0, 3), encounter, nodeId: '', forceAllUnits: false };
const state = (screen: string, extra = {}) => ({ ...structuredClone(base), screen, ...extra }) as GameState;
type Scene = { component: any; state: GameState; flow?: boolean; setup?: string; extra?: Record<string, unknown> };
const registry: Record<string, Scene> = {};
const add = (name: string, component: any, extra = {}, flow = true, setup?: string) => { registry[name] = { component, state: state(name, extra), flow, setup }; };
add('title', ui.HomeScreen, {}, false);
add('region-select', ui.RegionScreen, {}, false);
add('region-forest', ui.RegionScreen, { region: 'emerald_forest' }, false);
add('region-ecology', ui.RegionScreen, { region: 'emerald_forest' }, false, '查看生态详情');
add('region-mixed-ecology', ui.RegionScreen, {}, false, '查看生态详情');
add('region-ecology-discovered', ui.RegionScreen, { region: 'emerald_forest', unlocks: { ...base.unlocks, regionEncounters: { emerald_forest: ['momo', 'torch_fox', 'mimi_king', 'time_sand_beast', 'mirror_beast'] } } }, false, '查看生态详情');
add('difficulty-select', ui.DifficultyScreen, {}, false);
add('relics-five-unlocked', ui.DifficultyScreen, { relics: ['greedy_eye'], unlocks: { ...base.unlocks, relics: RELIC_ORDER } }, false);
add('relics-cauldron-selected', ui.DifficultyScreen, { relics: ['metal_cauldron'], unlocks: { ...base.unlocks, relics: RELIC_ORDER } }, false);
add('relics-horn-selected', ui.DifficultyScreen, { relics: ['horn_of_plenty'], unlocks: { ...base.unlocks, relics: RELIC_ORDER } }, false);
add('relics-candle-selected', ui.DifficultyScreen, { relics: ['spare_candle'], unlocks: { ...base.unlocks, relics: RELIC_ORDER } }, false);
add('relics-compass-selected', ui.DifficultyScreen, { relics: ['explorer_compass'], unlocks: { ...base.unlocks, relics: RELIC_ORDER } }, false);
add('relics-achievements', ui.AchievementsScreen, {}, true, '遗物');
add('shop-greedy-eye', ui.ShopScreen, { relics: ['greedy_eye'], shopStock: ['berry', 'atk_up', 'scout', 'bundle_gem'], shopRefreshCount: 1, gold: 40 }, false);
add('starter', ui.StarterScreen, {}, false);
add('creature-style-compare', CreatureStylePreview, {}, false);
add('proficiency-select', ui.ProficiencyStarterScreen, {}, false);
add('map', ui.MapScreen, {}, false);
add('map-prof-rhythm', ui.MapScreen, { runMode: 'proficiency', map: generateGrowthMap(2578), currentRow: 0, currentNodeId: '', currentLayer: 1 }, false);
add('map-act2-wide', ui.MapScreen, { act: 2, map: generateMap(1, 2), currentRow: 1, currentNodeId: 'n2_1_2' }, false);
add('map-act3-wide', ui.MapScreen, { act: 3, region: 'emerald_forest', map: generateMap(1, 3, 'normal', 'emerald_forest'), currentRow: 1, currentNodeId: 'n3_1_2' }, false);
add('forest-map', ui.MapScreen, { region: 'emerald_forest' }, false);
add('formation', FormationScreen, { formation }, false);
add('gauntlet-order', GauntletOrderScreen, { gauntletOrder: base.roster.slice(0, 4) });
add('battle-test-editor', BattleScreen, { testRun: true, battle: createBattle(base.roster.slice(0, 5), encounter, 123) }, false, '调整数值');
add('battle', BattleScreen, { battle: createBattle(base.roster.slice(0, 5), encounter, 123) }, false);
add('battle-corrupt-immune', BattleScreen, { battle: createBattle(base.roster.slice(0, 5), encounter, 123, { corruptDebuff: 'immune' }) }, false);
add('battle-mimic', BattleScreen, { battle: createBattle([makeUnit('mimic_beast', true, 0, false)], [{ speciesId: 'boss_vine' }], 123) }, false);
add('battle-mirror', BattleScreen, { battle: createBattle([makeUnit('mirror_beast', true, 0, false), makeUnit('momo', true, 1, false)], encounter, 123) }, false);
add('battle-crystal', BattleScreen, { battle: createBattle([makeUnit('crystal_core_beast', true, 0, false), makeUnit('momo', true, 1, false)], encounter, 123) }, false);
add('battle-mimic-duplicate', BattleScreen, { battle: createBattle([makeUnit('mimic_beast', true, 0, false)], [{ speciesId: 'mimic_beast' }], 123) }, false);
add('battle-mimic-long', BattleScreen, { battle: createBattle([makeUnit('mimic_beast', true, 0, false)], [], 123, { mirrorUnits: [{ ...makeUnit('momo', false, 0, false), skills: ['flame_tail_shield', 'sand_time_strike', 'burn_reversal', 'nine_tail_wildfire'] }] }) }, false);
add('reward', ui.RewardScreen, { rewards }, false);
add('recruit', ui.RewardScreen, { rewards, pendingRecruitRewardId: 'recruit' }, false);
add('roster', ui.RosterScreen);
add('postbattle', ui.PostBattleRosterScreen, { postBattle: true }, false);
add('shop', ui.ShopScreen, { shopStock: ['atk_up', 'meat', 'scout', 'gem'], shopBoughtItems: ['meat'], gold: 10 }, false);
add('shop-bundle-berry', ui.ShopScreen, { shopStock: ['bundle_berry', 'meat', 'atk_up', 'scout'], gold: 100 }, false);
add('shop-bundle-meat', ui.ShopScreen, { shopStock: ['bundle_meat', 'berry', 'spd_up', 'twin'], shopBoughtItems: ['bundle_meat'], gold: 10 }, false);
add('shop-bundle-gem', ui.ShopScreen, { shopStock: ['bundle_gem', 'berry', 'hp_up', 'scout'], difficulty: 'nightmare', gold: 20 }, false);
add('shop-prof', ui.ShopScreen, { runMode: 'proficiency', shopStock: ['book_large', 'skill_enhance_stone', 'revival_stone', 'reset_stone'] }, false);
add('shop-prof-recruit', ui.ShopScreen, { runMode: 'proficiency', shopStock: ['pet_recruit', 'book_medium', 'heal_potion_g', 'reset_stone'] }, false);
add('rest', CampRestScreen, { runMode: 'proficiency' });
add('rest-fusion', CampFusionScreen, { runMode: 'proficiency', fusionMainUid: first.uid, fusionSubUid: base.roster[1].uid });
add('rest-fusion-skill', CampFusionSkillScreen, { runMode: 'proficiency', fusionMainUid: first.uid, fusionSubSkills: ['aqua_shot', 'heal_light'] });
add('revive-select', RevivalScreen, { deadPets: base.roster.slice(0, 3) });
const eventNode = Object.keys(base.map.events)[0];
add('event', ui.EventScreen, { currentNodeId: eventNode });
const specialNode = Object.keys(base.map.specials)[0];
add('special', ui.SpecialScreen, { currentNodeId: specialNode ?? 'preview-special', map: { ...base.map, specials: { ...base.map.specials, 'preview-special': { title: '林间奇遇', desc: '选择适合队伍的成长方向。', rewards: [{ id: 'gold', kind: 'gold', amount: 30, label: '金币补给', desc: '获得30金币' }, { id: 'evolve', kind: 'evolve', label: '进化之光', desc: '选择一位伙伴进化' }, { id: 'custom', kind: 'custom', label: '神秘造物', desc: '选择一个造物模板' }] } } } });
add('custom', CreationScreen);
add('boost', AttributeBoostScreen, { specialPending: { kind: 'boost', uid: first.uid } });
for (const ids of [['sr-evolve', 'sr-gold', 'sr-golden-fruit'], ['sr-egg', 'sr-boost', 'sr-purify']]) {
  add(ids.includes('sr-egg') ? 'special-revised-egg' : 'special-revised-perfect', ui.SpecialScreen, { screen: 'special', act: 2, currentNodeId: 'new-special',
    map: { ...base.map, specials: { 'new-special': { title: '林间奇遇', desc: '选择一项奖励。', rewards: SPECIAL_REWARDS.filter(reward => ids.includes(reward.id)) } } } });
}
add('perfect-evolution', ProgressionChoiceScreen, { act: 2, specialPending: { kind: 'evolve', super: false, toFinal: true } });
add('perfect-evolution-branch', ProgressionChoiceScreen, { act: 2, roster: [makeUnit('fire_fox', true, 0, false)], specialPending: { kind: 'evolve', super: false, toFinal: true } });
add('reshape-choice', ProgressionChoiceScreen, { act: 2, specialPending: { kind: 'boost', uid: '', hpBonus: 6, spdBonus: 3 } });
add('reshape-stat', AttributeBoostScreen, { act: 2, specialPending: { kind: 'boost', uid: first.uid, hpBonus: 6, spdBonus: 3 } });
add('evolve', ProgressionChoiceScreen, { specialPending: { kind: 'evolve' } });
add('special-target', SpecialTargetScreen, { specialPending: { kind: 'eventBoostHp', amount: 5 } });
add('gameover', ui.GameOverScreen);
add('victory', ui.VictoryScreen);
add('inter_act', ui.InterActScreen);
add('forest-interact', ui.InterActScreen, { region: 'emerald_forest' });
add('watchtower', ui.WatchtowerScreen);
add('chest', ui.ChestScreen, { chestResult: ['左侧宝箱：金币30、浆果2', '右侧宝箱：侦查符1、全队恢复生命'] });
add('chest-creature', ui.ChestScreen, { chestResult: ['开启「双生宝箱」：获得 1 只火狐'] });
add('chest-creature-overflow', ui.ChestScreen, { chestResult: ['开启「双生宝箱」：获得 1 只火狐', '开启「双生宝箱」：获得 1 只光苔球'],
  tameOverflow: [makeUnit('fire_fox', true, 0, false), makeUnit('light_moss', true, 0, false)] });
add('backpack', ui.BackpackScreen, {}, false);
const eggPreview = { id: 'egg-preview', remaining: 3, special: false, monsterId: 'momo', passedNodeIds: [] };
add('backpack-eggs', ui.BackpackScreen, { screen: 'backpack', carriedEggs: [eggPreview, { ...eggPreview, id: 'egg-2', remaining: 1 }] }, false, '随机蛋');
for (const type of ['spring', 'altar', 'gambler', '行商', 'egg', 'ruins', 'altar2', 'cursed_chest', '精灵', '训练']) {
  const extra = { screen: 'event', currentNodeId: 'revised', map: { ...base.map, events: { revised: buildEventByType(createRng(42), type, 2) } } };
  add(`event-revised-${type}`, ui.EventScreen, extra, true);
  if (type === 'gambler') {
    add('event-coin-picker', ui.EventScreen, extra, true, '猜硬币');
    add('event-target-picker', ui.EventScreen, { ...extra, pendingEventTarget: { kind: 'spd', choiceId: 'e1' } }, true);
  }
}
add('tame-overflow', ui.TameOverflowScreen, { tameOverflow: [makeUnit('momo', true, 0, false)] });
add('test-type', ui.TestTypeScreen, {}, false);
add('test-corrupt-immune', ui.TestTypeScreen, { testScenario: { mode: 'main', region: 'mixed', difficulty: 'normal', act: 1, layer: 5, seed: 1,
  gold: 500, itemCount: 2, hpPercent: 60, deadCount: 1, customParty: false, nodeType: 'corrupted', corruptDebuff: 'immune' } }, false);
add('test-home-entry', ui.default, {}, false, '测试关卡');
const testSettings = { mode: 'main' as const, region: 'mixed' as const, difficulty: 'normal' as const, act: 2, layer: 5,
  seed: 42, gold: 500, itemCount: 2, hpPercent: 50, deadCount: 1, customParty: false, nodeType: 'event' as const, eventType: 'merchant' };
add('test-events-config', ui.TestTypeScreen, { testScenario: testSettings }, false);
add('test-prof-special-config', ui.TestTypeScreen, { testScenario: { ...testSettings, mode: 'proficiency', nodeType: 'special', specialId: 'revive' } }, false);
const testEventState = gameReducer(createInitialState(), { type: 'TEST_TYPE_PICK', nodeType: 'event', scenario: testSettings });
function TestEventPreview({ state, dispatch }: any) {
  return <TestSessionFrame state={state} dispatch={dispatch}><div className="screen screen-flow"><ui.EventScreen state={state} dispatch={dispatch} /></div></TestSessionFrame>;
}
add('test-event-playing', TestEventPreview, testEventState, false);
add('test-pick', ui.TestPickScreen, { testPick: { side: 'player', nodeType: 'battle' } }, false);
add('test-config', ui.TestConfigScreen, { pendingBattle: { units: base.roster.slice(0, 3), encounter, seed: 123, nodeType: 'battle' } }, false);
add('achievements', ui.AchievementsScreen);
add('skill-pick', SkillPickScreen, { runMode: 'proficiency', skillPick: { uid: first.uid, slot: 3, choices: ['aqua_shot', 'heal_light', 'roar'] } });
add('growth-menu', GrowthScreen, { runMode: 'proficiency' });
add('growth-transfer', GrowthScreen, { runMode: 'proficiency' }, true, '.training-pet|成长点转移');
add('blacksmith', BlacksmithScreen, { runMode: 'proficiency' }, true, '.training-pet');
add('enhance-stone', EnhanceStoneScreen, { runMode: 'proficiency' }, true, '.training-pet');
add('enhance-reset', EnhanceResetScreen, { runMode: 'proficiency' }, true, '.training-pet');
add('arena3', Arena3Screen, { runMode: 'proficiency' });
add('proficiency-result', ui.ProficiencyResultScreen, { runMode: 'proficiency', proficiencyResult: 'won' });
add('codex', ui.CodexScreen, {}, false);
registry.codex.extra = { onClose: () => {} };
add('fusion-dialog', ui.FusionConfirm, { act: 2 }, false);
registry['fusion-dialog'].extra = { primary: first, onClose: () => {} };

// 隔离的内存存档桥，仅供标题页的存档与叠加确认验收。
window.petCard = { platform: 'preview', loadGame: async slot => slot === 1 ? JSON.stringify({ saveVersion: 1, main: base }) : null, saveGame: async () => true, deleteSave: async () => true, quit: () => {} };
const variant = (name: string, original: string, extra = {}, setup?: string) => {
  registry[name] = { ...registry[original], state: { ...structuredClone(registry[original].state), ...extra }, setup };
};
variant('creature-style-battle', 'creature-style-compare', {}, '战场卡片');
variant('test-proficiency', 'test-type', {}, '熟练度远征测试');
variant('test-proficiency-event', 'test-type', {}, '熟练度远征测试|事件');
variant('test-proficiency-boss', 'test-type', {}, '熟练度远征测试|首领');
variant('creature-style-formation', 'creature-style-compare', {}, '布阵卡片');
variant('battle-mirror-selected', 'battle-mirror', {}, '.player-area .formation-slot');
variant('battle-crystal-selected', 'battle-crystal', {}, '.player-area .formation-slot');
variant('battle-mirror-queued', 'battle-mirror', {}, '.player-area .formation-slot|.battle-skill-grid .skill-btn:nth-child(1)');
const usedMirrorBattle = structuredClone(registry['battle-mirror'].state.battle!);
usedMirrorBattle.playerUnits[0].skillUses = { mirror_copy: 0 };
variant('battle-mirror-used', 'battle-mirror', { battle: usedMirrorBattle }, '.player-area .formation-slot');
const watchtowerMap = { ...base.map, layers: [
  [{ id: 'preview-tower', type: 'watchtower', label: '瞭望塔', col: 0 }],
  [{ id: 'preview-corrupt', type: 'corrupted', label: '被侵蚀', col: 0 }, { id: 'preview-elite', type: 'elite', label: '精英怪', col: 1 }, { id: 'preview-battle', type: 'battle', label: '遭遇战', col: 2 }, { id: 'preview-special', type: 'special', label: '神秘蛋', col: 3 }, { id: 'preview-arena', type: 'arena', label: '斗兽场', col: 4 }],
  [{ id: 'preview-shop', type: 'shop', label: '商店', col: 0 }, { id: 'preview-event', type: 'event', label: '事件', col: 1 }, { id: 'preview-special', type: 'special', label: '神秘蛋', col: 2 }, { id: 'preview-rest', type: 'rest', label: '营火', col: 3 }, { id: 'preview-next-tower', type: 'watchtower', label: '瞭望塔', col: 4 }],
  [{ id: 'preview-sync', type: 'sync', label: '双生宝箱', col: 0 }, { id: 'preview-keydoor', type: 'keydoor', label: '钥匙门', col: 1, guardianId: 'preview-guardian' }, { id: 'preview-guardian', type: 'guardian', label: '守卫', col: 2 }, { id: 'preview-gauntlet', type: 'gauntlet', label: '车轮战', col: 3, gauntletSize: 3 }, { id: 'preview-boss', type: 'boss', label: '首领战', col: 4 }],
], encounter: { ...base.map.encounter,
  'preview-corrupt': [{ speciesId: 'momo' }, { speciesId: 'momo' }, { speciesId: 'fifi' }],
  'preview-elite': [{ speciesId: 'phantom_tail_fox' }],
  'preview-battle': [{ speciesId: 'lulu' }, { speciesId: 'kiki' }],
  'preview-arena': [{ speciesId: 'nine_tail_sovereign' }],
  'preview-guardian': [{ speciesId: 'kiki' }],
  'preview-gauntlet': [{ speciesId: 'momo' }, { speciesId: 'fifi' }, { speciesId: 'lulu' }],
}, boss: { ...base.map.boss, 'preview-boss': [{ speciesId: 'boss_vine' }] }, events: { ...base.map.events, 'preview-event': { title: '林间旅人', desc: '交谈', choices: [{ id: 'talk', label: '营地交流', kind: 'none', desc: '交流' }, { id: 'leave', label: '继续前进', kind: 'none', desc: '离开' }] } }, specials: { ...base.map.specials, 'preview-special': { title: '神秘蛋', desc: '选择', rewards: [{ id: 'gold', kind: 'gold', amount: 30, label: '孵化它', desc: '孵化' }, { id: 'leave', kind: 'gold', amount: 1, label: '离开', desc: '离开' }] } } };
variant('watchtower-cards', 'watchtower', { currentRow: 0, currentNodeId: 'preview-tower', watchtowerPreviewNodeId: 'preview-tower', map: watchtowerMap });
variant('watchtower-compass', 'watchtower-cards', { relics: ['explorer_compass'], currentRow: 0, currentNodeId: '', watchtowerReopened: true });
variant('map-compass', 'map', { relics: ['explorer_compass'], currentRow: 0, currentNodeId: '', map: watchtowerMap });
variant('watchtower-creature-detail', 'watchtower-cards', {}, '九尾炎尊');
variant('watchtower-utilities', 'watchtower-cards', {}, '第 3 层');
variant('watchtower-challenges', 'watchtower-cards', {}, '第 4 层');
variant('watchtower-training', 'watchtower-cards', { map: { ...watchtowerMap, layers: [watchtowerMap.layers[0], [{ id: 'preview-blacksmith', type: 'blacksmith', label: '铁匠铺', col: 0 }, { id: 'preview-arena3', type: 'arena3', label: '竞技场', col: 1 }]] } });
variant('save-management', 'title', {}, '存档管理');
variant('save-delete-confirm', 'title', {}, '存档管理|.save-slot-del');
variant('save-overwrite-confirm', 'title', {}, '新的远征');
registry['save-overwrite-confirm'].extra = { currentSaveSlot: 1 };
variant('save-import-confirm', 'title', {}, '存档管理|file:backup');
registry['save-import-confirm'].extra = { currentSaveSlot: 1 };
variant('backpack-detail', 'backpack', {}, '.backpack-item');
variant('backpack-tame-food', 'backpack', { inventory: { berry: 3 } }, '.backpack-item');
variant('backpack-empty', 'backpack', { inventory: {}, roster: [], field: [] });
variant('codex-detail', 'codex', {}, '.codex-item');
variant('codex-xuntian-original', 'codex', {}, '迅天');
variant('codex-paopao-original', 'codex', {}, '泡泡龙神');
variant('codex-zhuotian-original', 'codex', {}, '灼天');
variant('battle-food', 'battle', {}, '捕获');
variant('battle-items', 'battle', {}, '道具');
variant('battle-enemy', 'battle', {}, 'hold:.enemy-area .formation-slot:not(.empty)');
const enhancedInspectBattle = structuredClone(registry.battle.state.battle!);
enhancedInspectBattle.enemyUnits[0].skills = ['punch', 'heal_light'];
enhancedInspectBattle.enemyUnits[0].skillEnhancements = { 0: 2, 1: 3 };
variant('battle-enemy-enhanced', 'battle', { battle: enhancedInspectBattle }, 'hold:.enemy-area .formation-slot:not(.empty)');
variant('battle-ally', 'battle', {}, 'hold:.player-area .formation-slot:not(.empty)');
variant('battle-skills', 'battle', {}, 'hold:.player-area .formation-slot:not(.empty)');
variant('battle-log', 'battle', {}, '战斗记录');
variant('battle-won', 'battle', { battle: { ...registry.battle.state.battle, phase: 'won', log: [] } });
variant('battle-lost', 'battle', { battle: { ...registry.battle.state.battle, phase: 'lost', log: [] } });
variant('enhance-confirm', 'blacksmith', {}, '.training-pet|.growth-enhance-btn');
variant('growth-confirm', 'growth-menu', {}, '.training-pet|成长点转移|.training-transfer-targets button|range:10|确认转移');
variant('scout-dialog', 'map', { scoutResult: { nodeId: '', title: '侦查结果', detail: '这里有三只守卫伙伴。' .repeat(50) } });
variant('hatch-dialog', 'event', { pendingEventHatch: { choiceId: 'preview', monsterId: 'momo' } });
variant('revive-empty', 'revive-select', { deadPets: [] });
variant('chest-empty', 'chest', { chestResult: [] });
variant('event-long', 'event', { map: { ...base.map, events: { [eventNode]: { ...base.map.events[eventNode], desc: '旅途中，你遇到一群带着补给和消息的冒险者。'.repeat(20) } } } });
variant('proficiency-lost', 'proficiency-result', { proficiencyResult: 'lost', roster: [] });
variant('skill-replace', 'skill-pick', { skillPick: undefined, skillReplace: { uid: first.uid, replaceIdx: -1, choices: ['aqua_shot', 'roar'], refreshCount: 0 } });
add('collapse-intro', CollapseWarning, {}, false);
registry['collapse-intro'].extra = { round: 1, onConfirm: () => {} };
add('collapse-start', CollapseWarning, {}, false);
registry['collapse-start'].extra = { round: 15, onConfirm: () => {} };
const chainFixture = createBattle([makeUnit('time_sand_beast', true, 0, false)], [{ speciesId: 'kiki' }, { speciesId: 'momo' }], 42);
chainFixture.playerUnits[0].skills = ['chain_activate'];
chainFixture.enemyUnits.forEach((u, i) => { u.skills = []; u.passive = undefined; u.hp = 30; u.maxHp = 30; u.statuses = [{ kind: 'chainLink', value: 50, turns: 2, sourceUid: chainFixture.enemyUnits[1 - i].uid }]; });
add('chain-explosion', BattleScreen, { battle: { ...chainFixture, log: [], collapseWarningSeenRound: 1 }, roster: chainFixture.playerUnits }, false);
const rewindFixture = createBattle([makeUnit('time_sand_beast', true, 0, false)], [{ speciesId: 'momo' }], 42);
rewindFixture.playerUnits[0].hp = 1;
rewindFixture.enemyUnits[0] = { ...rewindFixture.enemyUnits[0], skills: ['shadow_claw'], hp: 100, maxHp: 100, spd: 10 };
const rewindPaused = playerEndTurn(playerSkill(rewindFixture, rewindFixture.playerUnits[0].uid, 'sand_time_strike', rewindFixture.enemyUnits[0].uid));
add('rewind-choice', BattleScreen, { battle: { ...rewindPaused, log: [], collapseWarningSeenRound: 1 }, roster: rewindPaused.playerUnits }, false);
variant('shield-many-statuses', 'battle', { battle: { ...registry.battle.state.battle!, log: [], collapseWarningSeenRound: 1, playerUnits: registry.battle.state.battle!.playerUnits.map(u => ({ ...u, shield: 123, statuses: [{kind: 'burn', value: 3, turns: 0}, {kind: 'poison', value: 2, turns: 0}, {kind: 'fear', value: 1, turns: 0}] })) } });
variant('achievement-difficulty-grades', 'achievements', { unlocks: { ...base.unlocks!, bestGrade: 'S', bestGrades: { normal: 'S', hard: 'B' } } }, '评级里程碑');
const bossRewardMap = generateMap(42, 1, 'normal', 'emerald_forest');
const bossRewardRow = bossRewardMap.layers.length - 1;
const bossRewardState = { ...base, map: bossRewardMap, act: 1, region: 'emerald_forest' as const, currentRow: bossRewardRow, currentNodeId: bossRewardMap.layers[bossRewardRow][0].id, gold: 50, inventory: { gem: 1 } };
add('boss-reward', ui.RewardScreen, { ...bossRewardState, screen: 'reward', rewards: generateRewards(bossRewardState) }, false);
variant('boss-reward-boost', 'boss-reward', {}, '伙伴强化');
variant('boss-reward-supply', 'boss-reward', {}, '远征补给');
variant('boss-reward-recruit', 'boss-reward', {}, '伙伴招募');
variant('potion-target', 'battle', { battle: { ...registry.battle.state.battle!, log: [], collapseWarningSeenRound: 1 }, inventory: { atk_up: 1 } }, '道具|.battle-overlay-grid button');
variant('codex-mysterious', 'codex', {}, '.codex-item[data-codex-id="time_sand_beast"]');
variant('proficiency-selected', 'proficiency-select', {}, '.proficiency-contract:nth-child(1) .starter-choice|.proficiency-contract:nth-child(4) .starter-choice');
variant('proficiency-pet-details', 'proficiency-select', {}, '.contract-details');
variant('fusion-long', 'fusion-dialog', { roster: [first, ...Array.from({ length: 3 }, (_, i) => makeUnit(first.speciesId, true, (i % 3) as 0 | 1 | 2, false))] });
const stressRoster = ['nine_tail_sovereign', 'solar_spirit', 'furnace_beast', 'eternal_moth', 'momo'].map((id, i) => ({
  ...makeUnit(id, true, (i % 3) as 0 | 1 | 2, false, i < 3 ? 'front' : 'back'), hp: 123, maxHp: 123,
}));
const stressBattle = createBattle(stressRoster, encounter, 123);
stressBattle.playerUnits[0].statuses = (['burn', 'poison', 'atkUp', 'atkDown', 'shield', 'spdDown', 'thorns', 'fear'] as StatusEffect['kind'][]).map(kind => ({ kind, value: 3, turns: 2 }));
variant('battle-many-buffs', 'battle', { battle: stressBattle });
const foxfireBattle = structuredClone(stressBattle);
foxfireBattle.playerUnits[0].statuses = [{ kind: 'foxFire', value: 9, turns: 0 }, { kind: 'burn', value: 2, turns: 0 }];
variant('battle-foxfire', 'battle', { battle: foxfireBattle });
variant('battle-foxfire-detail', 'battle', { battle: foxfireBattle }, 'hold:.player-area .formation-slot:not(.empty)');
variant('buff-detail-long', 'battle', { battle: stressBattle }, 'hold:.player-area .formation-slot:not(.empty)');
variant('battle-selected', 'battle', { battle: stressBattle }, '.player-area .formation-slot');
variant('battle-menu', 'battle', {}, '菜单');
variant('roster-long', 'roster', { roster: stressRoster });
variant('toast-recruit', 'roster', { toast: { msg: '招募成功！迅迅加入了队伍', kind: 'success' } });
variant('toast-food', 'map', { toast: { msg: '获得食物：鲜肉 ×2', kind: 'success' } });
variant('toast-long', 'shop', { toast: { msg: '购买成功！获得技能强化石，可在背包中选择伙伴强化技能；当前队伍已满，请在伙伴管理中调整阵容后继续远征。', kind: 'info' } });
const supportBattle = createBattle(['coal', 'momo', 'kiki'].map((id, index) => makeUnit(id, true, index as 0 | 1 | 2, false)), encounter, 123);
supportBattle.playerUnits[0].skills = ['furnace_shell', 'heal_light'];
supportBattle.playerUnits[1].hp -= 3;
variant('battle-ally-shield-target', 'battle', { battle: supportBattle }, '.player-area .formation-slot:not(.empty)|炉壳');
variant('battle-ally-heal-target', 'battle', { battle: supportBattle }, '.player-area .formation-slot:not(.empty)|愈光');
variant('battle-order-attack', 'battle', {}, '.player-area .formation-slot:not(.empty)|爪击|.enemy-area .attack-target');
variant('battle-order-support', 'battle', { battle: supportBattle }, '.player-area .formation-slot:not(.empty)|炉壳|.player-area .ally-target');
variant('starter-details', 'starter', {}, '.mobile-details-trigger');
variant('formation-details', 'formation', {}, '.mobile-details-trigger');
variant('roster-details', 'roster', {}, '.mobile-details-trigger');
variant('postbattle-details', 'postbattle', {}, '.mobile-details-trigger');
variant('shop-details', 'shop', {}, '.mobile-details-trigger');
variant('event-details', 'event-long', {}, '.mobile-details-trigger');
variant('evolve-details', 'evolve', {}, '.mobile-details-trigger');
variant('rating-details', 'victory', {}, '.rating-display .mobile-details-trigger');
variant('interact-details', 'inter_act', {}, '.mobile-details-trigger');
variant('proficiency-team-details', 'proficiency-result', {}, '.mobile-details-trigger');
variant('blacksmith-details', 'blacksmith', {}, '.training-pet|.mobile-details-trigger');
variant('growth-selected', 'growth-menu', {}, '.training-pet');
variant('growth-return', 'growth-menu', {}, '.training-pet|成长点转移|.training-transfer footer button:last-child');
variant('skill-pick-long', 'skill-pick', { skillPick: { uid: first.uid, slot: 3, choices: ['solar_strike', 'furnace_shell', 'burn_reversal'] } });
variant('skill-pick-details', 'skill-pick-long', {}, '.mobile-details-trigger');
variant('fusion-skill-details', 'rest-fusion-skill', {}, '.mobile-details-trigger');
const cursedRoster = base.roster.map((unit, index) => index ? unit : { ...unit, curse: 'atkDown' as const, bonusStats: { hp: 15, spd: 4 } });
variant('postbattle-cursed', 'postbattle', { roster: cursedRoster });
variant('postbattle-cursed-details', 'postbattle-cursed', {}, '.mobile-details-trigger');
variant('roster-cursed', 'roster', { roster: cursedRoster });
variant('tame-overflow-long', 'tame-overflow', { roster: stressRoster, tameOverflow: [stressRoster[0]] });
variant('gauntlet-empty', 'gauntlet-order', { gauntletOrder: [] });
const fiveSkillBattle = structuredClone(stressBattle);
fiveSkillBattle.playerUnits[0].skills = ['flame_tail_shield', 'burn_tail', 'burn_reversal', 'furnace_shell', 'solar_strike'];
variant('battle-five-skills', 'battle', { battle: fiveSkillBattle }, '.player-area .formation-slot');
const summaryBattle = structuredClone(fiveSkillBattle);
summaryBattle.playerUnits[0].skills = ['clean_flame_care', 'nine_tail_wildfire', 'seal_furnace', 'leaf_needle', 'roar'];
summaryBattle.playerUnits[1].name = '长名称的日炎灵伙伴';
summaryBattle.orders = { [summaryBattle.playerUnits[0].uid]: { skillId: 'clean_flame_care', targetUid: summaryBattle.playerUnits[1].uid } };
variant('battle-summary-long', 'battle', { battle: summaryBattle }, '.player-area .formation-slot');

const root = createRoot(document.getElementById('root')!);
variant('codex-light-moss-art', 'codex', {}, '光苔球');
variant('codex-moss-beast-art', 'codex', {}, '光苔兽');
variant('codex-solar-spirit-art', 'codex', {}, '日炎灵');
variant('codex-molten-larva-art', 'codex', {}, '熔壳虫');
variant('codex-molten-beetle-art', 'codex', {}, '熔甲虫');
variant('codex-molten-beast-art', 'codex', {}, '熔甲兽');
variant('codex-ember-hawk-art', 'codex', {}, '焚风雏鹰');
variant('codex-searing-hawk-art', 'codex', {}, '焚风鹰');
variant('codex-solar-eagle-art', 'codex', {}, '烈日神鹰');
variant('codex-fire-fox-art', 'codex', {}, '火狐');
variant('codex-phantom-tail-fox-art', 'codex', {}, '幻尾火狐');
variant('codex-nine-tail-sovereign-art', 'codex', {}, '九尾炎尊');
variant('codex-torch-fox-art', 'codex', {}, '传火狐');
variant('codex-torch-fox-lord-art', 'codex', {}, '传火狐尊');
variant('codex-time-sand-beast-art', 'codex', {}, '时砂兽');
variant('codex-mimic-beast-art', 'codex', {}, '百变兽');
variant('codex-mirror-beast-art', 'codex', {}, '镜影兽');
variant('codex-crystal-core-beast-art', 'codex', {}, '晶核兽');
variant('codex-mimi-art', 'codex', {}, '咪咪');
variant('codex-mangying-art', 'codex', {}, '蟒影');
variant('codex-abyss-serpent-art', 'codex', {}, '深渊蛇王');
variant('codex-cici-art', 'codex', {}, '刺刺');
variant('codex-jiwei-art', 'codex', {}, '棘尾');
variant('codex-thorn-king-art', 'codex', {}, '棘刺王');
const mossArt = ['light_moss', 'moss_beast', 'solar_spirit'].map((id, column) => makeUnit(id, true, column as 0 | 1 | 2, false));
const mossArtEncounter = mossArt.map(unit => ({ speciesId: unit.speciesId }));
add('light-moss-art-battle', BattleScreen, { roster: mossArt, field: mossArt.map(unit => unit.uid), battle: createBattle(mossArt, mossArtEncounter, 126) }, false);
add('light-moss-art-formation', FormationScreen, { roster: mossArt, formation: { ...formation, units: mossArt, initialField: mossArt, encounter: mossArtEncounter } }, false);
const moltenArt = ['molten_larva', 'molten_beetle', 'molten_beast'].map((id, column) => makeUnit(id, true, column as 0 | 1 | 2, false));
const moltenArtEncounter = moltenArt.map(unit => ({ speciesId: unit.speciesId }));
add('molten-art-battle', BattleScreen, { roster: moltenArt, field: moltenArt.map(unit => unit.uid), battle: createBattle(moltenArt, moltenArtEncounter, 126) }, false);
add('molten-art-formation', FormationScreen, { roster: moltenArt, formation: { ...formation, units: moltenArt, initialField: moltenArt, encounter: moltenArtEncounter } }, false);
const hawkArt = ['ember_hawk', 'searing_hawk', 'solar_eagle'].map((id, column) => makeUnit(id, true, column as 0 | 1 | 2, false));
const hawkArtEncounter = hawkArt.map(unit => ({ speciesId: unit.speciesId }));
add('hawk-art-battle', BattleScreen, { roster: hawkArt, field: hawkArt.map(unit => unit.uid), battle: createBattle(hawkArt, hawkArtEncounter, 126) }, false);
add('hawk-art-formation', FormationScreen, { roster: hawkArt, formation: { ...formation, units: hawkArt, initialField: hawkArt, encounter: hawkArtEncounter } }, false);
const foxArt = ['fire_fox', 'phantom_tail_fox', 'nine_tail_sovereign'].map((id, column) => makeUnit(id, true, column as 0 | 1 | 2, false));
const foxArtEncounter = foxArt.map(unit => ({ speciesId: unit.speciesId }));
add('fox-art-battle', BattleScreen, { roster: foxArt, field: foxArt.map(unit => unit.uid), battle: createBattle(foxArt, foxArtEncounter, 126) }, false);
add('fox-art-formation', FormationScreen, { roster: foxArt, formation: { ...formation, units: foxArt, initialField: foxArt, encounter: foxArtEncounter } }, false);
const torchArt = ['fire_fox', 'torch_fox', 'torch_fox_lord'].map((id, column) => makeUnit(id, true, column as 0 | 1 | 2, false));
const torchArtEncounter = torchArt.map(unit => ({ speciesId: unit.speciesId }));
add('torch-art-battle', BattleScreen, { roster: torchArt, field: torchArt.map(unit => unit.uid), battle: createBattle(torchArt, torchArtEncounter, 126) }, false);
add('torch-art-formation', FormationScreen, { roster: torchArt, formation: { ...formation, units: torchArt, initialField: torchArt, encounter: torchArtEncounter } }, false);
const eggArt = ['time_sand_beast', 'mimic_beast'].map((id, column) => makeUnit(id, true, column as 0 | 1, false));
const eggArtEncounter = eggArt.map(unit => ({ speciesId: unit.speciesId }));
add('egg-art-battle', BattleScreen, { roster: eggArt, field: eggArt.map(unit => unit.uid), battle: createBattle(eggArt, eggArtEncounter, 126) }, false);
add('egg-art-formation', FormationScreen, { roster: eggArt, formation: { ...formation, units: eggArt, initialField: eggArt, encounter: eggArtEncounter } }, false);
const mineralArt = ['mirror_beast', 'crystal_core_beast'].map((id, column) => makeUnit(id, true, column as 0 | 1, false));
const mineralArtEncounter = mineralArt.map(unit => ({ speciesId: unit.speciesId }));
add('mineral-art-battle', BattleScreen, { roster: mineralArt, field: mineralArt.map(unit => unit.uid), battle: createBattle(mineralArt, mineralArtEncounter, 126) }, false);
add('mineral-art-formation', FormationScreen, { roster: mineralArt, formation: { ...formation, units: mineralArt, initialField: mineralArt, encounter: mineralArtEncounter } }, false);
const serpentArt = ['mimi', 'mimi_king', 'mimi_god'].map((id, column) => makeUnit(id, true, column as 0 | 1 | 2, false));
const serpentArtEncounter = serpentArt.map(unit => ({ speciesId: unit.speciesId }));
add('serpent-art-battle', BattleScreen, { roster: serpentArt, field: serpentArt.map(unit => unit.uid), battle: createBattle(serpentArt, serpentArtEncounter, 126) }, false);
add('serpent-art-formation', FormationScreen, { roster: serpentArt, formation: { ...formation, units: serpentArt, initialField: serpentArt, encounter: serpentArtEncounter } }, false);
const thornArt = ['pipi', 'sisi', 'sisi_god'].map((id, column) => makeUnit(id, true, column as 0 | 1 | 2, false));
const thornArtEncounter = thornArt.map(unit => ({ speciesId: unit.speciesId }));
add('thorn-art-battle', BattleScreen, { roster: thornArt, field: thornArt.map(unit => unit.uid), battle: createBattle(thornArt, thornArtEncounter, 126) }, false);
add('thorn-art-formation', FormationScreen, { roster: thornArt, formation: { ...formation, units: thornArt, initialField: thornArt, encounter: thornArtEncounter } }, false);
const unifiedArt = ['momo', 'mimi', 'coal'].map((id, column) => makeUnit(id, true, column as 0 | 1 | 2, false));
const simpleSerpentArt = ['mimi', 'mimi_king'].map((id, column) => makeUnit(id, true, column as 0 | 1, false));
const simpleSerpentEncounter = simpleSerpentArt.map(unit => ({ speciesId: unit.speciesId }));
add('simple-serpent-battle', BattleScreen, { roster: simpleSerpentArt, field: simpleSerpentArt.map(unit => unit.uid), battle: createBattle(simpleSerpentArt, simpleSerpentEncounter, 126) }, false);
add('simple-serpent-formation', FormationScreen, { roster: simpleSerpentArt, formation: { ...formation, units: simpleSerpentArt, initialField: simpleSerpentArt, encounter: simpleSerpentEncounter } }, false);
variant('simple-serpent-roster', 'postbattle', { roster: simpleSerpentArt });
const unifiedArtEncounter = unifiedArt.map(unit => ({ speciesId: unit.speciesId }));
add('unified-art-battle', BattleScreen, { roster: unifiedArt, field: unifiedArt.map(unit => unit.uid), battle: createBattle(unifiedArt, unifiedArtEncounter, 126) }, false);
add('unified-art-formation', FormationScreen, { roster: unifiedArt, formation: { ...formation, units: unifiedArt, initialField: unifiedArt, encounter: unifiedArtEncounter } }, false);
variant('unified-art-roster', 'postbattle', { roster: unifiedArt });
variant('codex-unified-xunxun', 'codex', {}, '迅迅');
const scoreLedger = emptyMainRating();
for (const act of [1, 2, 3]) {
  scoreLedger.acts[act] = { totalRows: 10, completedRows: Array.from({ length: 10 }, (_, i) => i), bossDefeated: true, challengeTarget: 5 };
  for (let i = 0; i < 3; i++) scoreLedger.battles[`${act}:${i}`] = { act, type: 'elite', won: true, rounds: 5, participants: 3, deaths: 0, enemyCount: 2 };
}
const scoreStats = { ...base.runStats!, rating: scoreLedger, battlesWon: 9, turnsPlayed: 45 };
variant('rating-v2-victory', 'victory', { act: 3, runStats: scoreStats });
variant('rating-v2-details', 'rating-v2-victory', {}, '.rating-display .mobile-details-trigger');
const lostLedger = structuredClone(scoreLedger);
lostLedger.acts['3'].bossDefeated = false;
lostLedger.acts['3'].completedRows.pop();
variant('rating-v2-defeat', 'gameover', { act: 3, runStats: { ...scoreStats, rating: lostLedger } });
variant('rating-v2-defeat-details', 'rating-v2-defeat', {}, '.rating-display .mobile-details-trigger');
const actLedger = structuredClone(scoreLedger);
delete actLedger.acts['2']; delete actLedger.acts['3'];
actLedger.battles = Object.fromEntries(Object.entries(actLedger.battles).filter(([, b]) => b.act === 1));
variant('rating-v2-interact', 'inter_act', { runStats: { ...scoreStats, rating: actLedger } });
variant('settlement-forest-full', 'rating-v2-interact', { region: 'emerald_forest', runStats: { ...scoreStats, rating: actLedger, battlesWon: 25, goldEarned: 12345, petsTamed: 18, petsLost: 5, turnsPlayed: 234 } });
variant('settlement-empty-defeat', 'rating-v2-defeat', { roster: [] });
variant('settlement-team-details', 'rating-v2-interact', {}, '查看同行伙伴 · 8只');
variant('rating-legacy-victory', 'victory', { act: 3, runStats: { ...scoreStats, rating: undefined, turnsPlayed: 90 } });
variant('rating-legacy-details', 'rating-legacy-victory', {}, '.rating-display .mobile-details-trigger');
variant('postbattle-zhuoren-portrait', 'postbattle', { roster: [makeUnit('fifi_king', true, 0, false)] });
variant('postbattle-eternal-portrait', 'postbattle', { roster: [makeUnit('eternal_moth', true, 0, false)] });
variant('codex-eternal-moth-art', 'codex', {}, '长明灵蛾');
const eternalMothArt = [makeUnit('eternal_moth', true, 0, false)];
const eternalMothEncounter = [{ speciesId: 'eternal_moth' }];
add('eternal-moth-art-battle', BattleScreen, { roster: eternalMothArt, field: eternalMothArt.map(unit => unit.uid), battle: createBattle(eternalMothArt, eternalMothEncounter, 126) }, false);
add('eternal-moth-art-formation', FormationScreen, { roster: eternalMothArt, formation: { ...formation, units: eternalMothArt, initialField: eternalMothArt, encounter: eternalMothEncounter } }, false);
variant('codex-coal-guard-art', 'codex', {}, '炉甲獾');
variant('codex-lantern-moth-art', 'codex', {}, '灯翅蛾');
variant('codex-furnace-beast-art', 'codex', {}, '熔炉兽');
const revisedCoalMoth = ['coal_guard', 'lantern_moth', 'furnace_beast'].map((id, column) => makeUnit(id, true, column as 0 | 1 | 2, false));
const revisedCoalMothEncounter = revisedCoalMoth.map(unit => ({ speciesId: unit.speciesId }));
add('coal-moth-revised-battle', BattleScreen, { roster: revisedCoalMoth, field: revisedCoalMoth.map(unit => unit.uid), battle: createBattle(revisedCoalMoth, revisedCoalMothEncounter, 126) }, false);
add('coal-moth-revised-formation', FormationScreen, { roster: revisedCoalMoth, formation: { ...formation, units: revisedCoalMoth, initialField: revisedCoalMoth, encounter: revisedCoalMothEncounter } }, false);
variant('codex-coal-art', 'codex', {}, '煤煤');
variant('codex-candle-art', 'codex', {}, '烛烛');
const coalCandleArt = ['coal', 'candle'].map((id, column) => makeUnit(id, true, column as 0 | 1, false));
const coalCandleEncounter = coalCandleArt.map(unit => ({ speciesId: unit.speciesId }));
add('coal-candle-art-battle', BattleScreen, { roster: coalCandleArt, field: coalCandleArt.map(unit => unit.uid), battle: createBattle(coalCandleArt, coalCandleEncounter, 126) }, false);
add('coal-candle-art-formation', FormationScreen, { roster: coalCandleArt, formation: { ...formation, units: coalCandleArt, initialField: coalCandleArt, encounter: coalCandleEncounter } }, false);
const originalLegends = ['momo_god', 'lulu_god', 'fifi_god'].map((id, column) => makeUnit(id, true, column as 0 | 1 | 2, false));
const originalEncounter = originalLegends.map(unit => ({ speciesId: unit.speciesId }));
add('legend-original-battle', BattleScreen, { roster: originalLegends, field: originalLegends.map(unit => unit.uid), battle: createBattle(originalLegends, originalEncounter, 126) }, false);
add('legend-original-formation', FormationScreen, { roster: originalLegends, formation: { ...formation, units: originalLegends, initialField: originalLegends, encounter: originalEncounter } }, false);
let feedbackDispatch: ((action: any) => void) | undefined;
let feedbackEnter: (() => void) | undefined;
const feedbackCases: Record<string, { skillId: string; targetUid: string }> = {};
feedbackCases['chain-explosion'] = { skillId: 'chain_activate', targetUid: chainFixture.enemyUnits[0].uid };
for (const [label, skillId] of [['melee', 'punch'], ['ranged', 'ember'], ['block', 'ember'], ['heavy', 'shadow_claw'], ['heal', 'water_bath'], ['shield', 'shield_skill'], ['group', 'vine_whip'], ['combo', 'swift_needle'], ['death', 'vine_whip'], ['rewind', 'punch'], ['group-heal', 'tidal_domain'], ['group-shield', 'ember_veil'], ['multi-group', 'inferno'], ['entry', 'punch'], ['pure-debuff', 'poison_mist'], ['pure-self', 'illusory_flame'], ['pure-ally', 'pass_flame'], ['pure-allies', 'relay_wildfire']]) {
  const pets = ['momo_queen', 'fifi_king', 'lulu_king', 'coal', 'light_moss'].map((id, i) => makeUnit(id, true, (i % 3) as 0 | 1 | 2, false, i < 3 ? 'front' : 'back'));
  const battle = createBattle(pets, [{ speciesId: 'fifi_king' }, { speciesId: 'lulu_king' }, { speciesId: 'momo_queen' }], 31);
  battle.playerUnits = battle.playerUnits.map((unit, i) => ({ ...unit, hp: i === 0 ? 19 : 20, maxHp: 20, passive: undefined, spd: 99, skills: i === 0 ? [skillId] : unit.skills }));
  battle.enemyUnits = battle.enemyUnits.map(unit => ({ ...unit, hp: 20, maxHp: 20, passive: undefined, skills: [], acted: true, shield: label === 'block' ? 30 : unit.row === 'front' ? 2 : 0 }));
  if (label === 'shield') battle.playerUnits[0].shield = 98;
  if (label === 'death') battle.enemyUnits.forEach(unit => { unit.hp = 1; unit.shield = 0; });
  if (label === 'group-heal') battle.playerUnits.forEach((unit, i) => { unit.hp = 10 + i; });
  if (label === 'rewind') {
    const target = battle.enemyUnits.find(unit => unit.row === 'front')!;
    Object.assign(target, { ...makeUnit('time_sand_beast', false, target.column, false, 'front'), uid: target.uid, hp: 1, shield: 0, skills: [], acted: true });
  }
  if (label === 'entry') {
    battle.enemyUnits = [{ ...battle.enemyUnits[0], hp: 0 }];
    battle.enemyBench = [makeUnit('fifi_king', false, 1, false, 'front')];
    battle.gauntlet = { total: 2, current: 1 };
  }
  const targetUid = ['heal', 'shield', 'pure-self', 'pure-ally', 'pure-allies'].includes(label) ? battle.playerUnits[0].uid : (battle.enemyUnits.find(unit => unit.row === 'front') ?? battle.enemyUnits[0]).uid;
  const name = `battle-feedback-${label}`;
  add(name, BattleScreen, { battle, roster: battle.playerUnits, field: battle.playerUnits.map(unit => unit.uid) }, false);
  feedbackCases[name] = { skillId, targetUid };
}
const tenPartners = [...base.roster, makeUnit('coal', true, 0, false), makeUnit('candle', true, 1, false)];
for (const kind of ['master', 'train_pair', 'transfer', 'recycle', 'relearn', 'contract', 'spring', 'buy_stone'] as GrowthEncounterKind[]) {
  let fixture = beginGrowthEncounter(state('event', { runMode: 'proficiency', currentNodeId: 'growth-preview', currentLayer: 20,
    roster: base.roster.slice(0, 5).map(unit => ({ ...unit, skills: ['swift_needle', 'flame_combo', 'fire_feather', 'burn_reversal', 'roar'].slice(0, kind === 'contract' ? 2 : 5), skillEnhancements: { 0: 3, 1: 2, 2: 3 }, skillEnhancePaid: { 0: 18, 1: 18, 2: 30 } })) }), kind);
  if (kind === 'relearn' || kind === 'contract') fixture = gameReducer(fixture, { type: 'GROWTH_ENCOUNTER_PREVIEW', uid: fixture.roster[0].uid, slot: 0 });
  registry[`growth-encounter-${kind}`] = { component: GrowthEncounterScreen, state: fixture, flow: true };
}
for (const type of ['ancient_arena', 'skill_mentor', 'soul_resonance', 'stone_of_forget'] as const) {
  add(`growth-event-${type}`, ui.EventScreen, { runMode: 'proficiency', roster: base.roster.slice(0, 5), currentNodeId: 'batch-event',
    map: { ...base.map, events: { 'batch-event': buildGrowthEvent(createRng(1), type) } } });
}
for (const type of ['stat_blessing', 'growth_blessing', 'skill_blessing'] as const) {
  add(`growth-special-${type}`, ui.SpecialScreen, { runMode: 'proficiency', roster: base.roster.slice(0, 5), currentNodeId: 'batch-special',
    map: { ...base.map, specials: { 'batch-special': { title: '奇遇', desc: '选择本次成长奖励', rewards: [{ ...GROWTH_SPECIAL_REWARDS[type], kind: 'growthEncounter' }] } } } });
}
registry['growth-candidate-details'] = { ...registry['growth-encounter-relearn'], setup: '.camp-learning-cards .mobile-details-trigger' };
const secondEventTypes = ['battle_master', 'mysterious_altar', 'expedition_supply', 'pet_recruit', 'arena_challenge', 'revive_dead'] as const;
for (const type of secondEventTypes) {
  add(`growth-event-${type}`, ui.EventScreen, { screen: 'event', runMode: 'proficiency', roster: base.roster.slice(0, 5), deadPets: base.roster.slice(0, 3).map(pet => ({ ...pet, uid: `dead-${pet.uid}`, hp: 0 })), currentNodeId: 'batch2', currentLayer: 31,
    map: { ...base.map, events: { batch2: buildGrowthEvent(createRng(17), type, 3, 31) } } });
}
for (const type of ['legend_recruit', 'gold_treasure', 'revive'] as const) {
  add(`growth-special-${type}`, ui.SpecialScreen, { screen: 'special', runMode: 'proficiency', roster: base.roster.slice(0, 5), deadPets: base.roster.slice(0, 3).map(pet => ({ ...pet, uid: `dead-${pet.uid}`, hp: 0 })), currentNodeId: 'batch2', currentLayer: 31,
    map: { ...base.map, specials: { batch2: { title: '奇遇', desc: '选择本次成长奖励', rewards: [{ ...GROWTH_SPECIAL_REWARDS[type], kind: 'growthEncounter' }] } } } });
}
for (const [kind, source] of [['duel', 'battle_master'], ['trial', 'arena_challenge'], ['altar_hp', 'mysterious_altar'], ['altar_spd', 'mysterious_altar'], ['supply_heal', 'expedition_supply'], ['supply_book', 'expedition_supply'], ['companions', 'pet_recruit'], ['grave', 'revive_dead'], ['revival_spring', 'revive'], ['legend', 'legend_recruit'], ['tools', 'gold_treasure']] as const) {
  let fixture = beginGrowthEncounter(structuredClone(registry[`${['revival_spring', 'legend', 'tools'].includes(kind) ? 'growth-special' : 'growth-event'}-${source}`].state), kind);
  if (kind === 'legend') fixture = gameReducer(fixture, { type: 'GROWTH_ENCOUNTER_PREVIEW', uid: fixture.roster[0].uid, slot: 0 });
  registry[`growth-encounter-${kind}`] = { component: GrowthEncounterScreen, state: fixture, flow: true };
}
registry['growth-companion-details'] = { ...registry['growth-encounter-companions'], setup: '.growth-encounter-recruits article button:last-child' };
registry['growth-duel-details'] = { ...registry['growth-encounter-duel'], setup: '查看对手详情' };
registry['growth-legend-details'] = { ...registry['growth-encounter-legend'], setup: '.camp-learning-cards .mobile-details-trigger' };
registry['growth-master-selected'] = { ...registry['growth-encounter-master'], setup: '.training-pet' };
registry['growth-master-confirm'] = { ...registry['growth-encounter-master'], setup: '.training-pet|免费强化' };
registry['growth-relearn-old'] = { ...registry['growth-event-skill_mentor'], component: GrowthEncounterScreen,
  state: beginGrowthEncounter(state('event', { runMode: 'proficiency', roster: base.roster.slice(0, 5) }), 'relearn'), setup: '.training-pet' };
registry['growth-relearn-new'] = { ...registry['growth-relearn-old'], setup: '.training-pet|.camp-learning-cards .camp-skill-card' };
registry['growth-trial-formation'] = { component: FormationScreen, state: gameReducer(registry['growth-encounter-trial'].state, { type: 'GROWTH_ENCOUNTER_CONFIRM' }), flow: false };
registry['growth-companion-overflow'] = { component: registry['tame-overflow'].component, state: gameReducer(registry['growth-encounter-companions'].state, { type: 'GROWTH_ENCOUNTER_CONFIRM', speciesId: registry['growth-encounter-companions'].state.map.events.batch2.choices[0].recruitCandidates![0] }), flow: true };
registry['growth-revive-overflow'] = { component: registry['tame-overflow'].component, state: gameReducer(registry['growth-encounter-revival_spring'].state, { type: 'GROWTH_ENCOUNTER_CONFIRM', uid: registry['growth-encounter-revival_spring'].state.deadPets![0].uid }), flow: true };
const fixedEffectPet = { ...base.roster[0], skills: ['shadow_rift', 'tidal_domain', 'quake', 'provoke', 'growth_bind'], skillEnhancements: { 0: 2, 1: 2, 2: 2, 3: 2, 4: 2 }, skillEnhancePaid: { 0: 27, 1: 27 } };
for (const [name, component] of [['blacksmith', BlacksmithScreen], ['enhance-stone', EnhanceStoneScreen], ['enhance-reset', EnhanceResetScreen]] as const) {
  add(`fixed-effects-${name}`, component, { screen: name, runMode: 'proficiency', roster: [fixedEffectPet] }, true, '.training-pet');
}
registry['fixed-effects-compare'] = { ...registry['fixed-effects-blacksmith'], setup: '.training-pet|暗影裂隙强化对比' };
variant('roster-ten', 'roster', { roster: tenPartners });
variant('postbattle-ten', 'postbattle', { roster: tenPartners });
variant('overflow-ten', 'tame-overflow', { roster: tenPartners });
variant('formation-ten', 'formation', { roster: tenPartners, formation: { ...formation, units: tenPartners } });
variant('boss-boost-ten', 'boss-reward-boost', { roster: tenPartners }, '伙伴强化');
let generation = 0;
const captureCases: Record<string, string> = {};
for (const label of ['preview', 'feed', 'success', 'fail']) {
  const battle = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'fifi' }, { speciesId: 'lulu' }], 42);
  battle.enemyUnits.forEach(unit => { unit.hp = label === 'success' || label === 'feed' ? 1 : Math.floor(unit.maxHp * .4); });
  const uid = battle.enemyUnits[0].uid;
  if (label === 'fail') for (let seed = 1; seed <= 100; seed++) {
    battle.seed = seed; battle.rngCount = 0;
    if (playerTame(battle, 'berry', uid).log.some(entry => entry.capture?.success === false)) break;
  }
  const name = `battle-feedback-capture-${label}`;
  add(name, BattleScreen, { battle, roster: battle.playerUnits, field: battle.playerUnits.map(unit => unit.uid), inventory: { berry: 3 } }, false);
  captureCases[name] = uid;
}
function Preview({ scene, mobile }: { scene: Scene; mobile: boolean }) {
  const [current, setCurrent] = useState(scene.state);
  const dispatch = (action: any) => setCurrent(s => gameReducer(s, action));
  feedbackDispatch = dispatch;
  feedbackEnter = () => setCurrent(s => ({ ...s, battle: performGauntletSwap({ ...s.battle!, pendingSwap: { enemy: true } }) }));
  const C = scene.component;
  const shell = scene.flow ? 'screen-flow' : C === ui.HomeScreen ? 'screen-title' : C === ui.RewardScreen ? 'screen-reward'
    : C === ui.BackpackScreen ? 'screen-backpack' : C === ui.StarterScreen || C === ui.ProficiencyStarterScreen ? 'screen-starter'
      : C === ui.DifficultyScreen ? 'screen-difficulty' : C === ui.RegionScreen ? 'screen-region' : '';
  return <div className={`screen ${shell}`}>
    <C state={current} dispatch={dispatch} {...scene.extra} />
    {current.toast && <div className={`toast ${current.toast.kind ?? 'info'}`}>{current.toast.msg}</div>}
    {mobile && <MobileShell state={current} dispatch={dispatch} canSave={false} />}
  </div>;
}
(window as any).preview = {
  pauseFeedback() { flushSync(() => window.dispatchEvent(new CustomEvent('petcard-visibility', { detail: false }))); },
  resumeFeedback() { flushSync(() => window.dispatchEvent(new CustomEvent('petcard-visibility', { detail: true }))); },
  startFeedback(name: string) {
    if (name === 'battle-feedback-capture-preview') {
      flushSync(() => [...document.querySelectorAll('button')].find(button => button.textContent === '捕获')!.click());
      flushSync(() => [...document.querySelectorAll('.battle-overlay-grid button')].find(button => button.textContent?.includes('浆果'))!.click());
      return;
    }
    if (captureCases[name]) { flushSync(() => feedbackDispatch!({ type: 'PLAYER_TAME', foodId: 'berry', enemyUid: captureCases[name] })); return; }
    if (name === 'battle-feedback-entry') { flushSync(() => feedbackEnter!()); return; }
    const config = feedbackCases[name];
    const actorUid = registry[name].state.battle!.playerUnits[0].uid;
    flushSync(() => feedbackDispatch!({ type: 'PLAYER_SKILL', actorUid, ...config }));
    flushSync(() => feedbackDispatch!({ type: 'END_TURN' }));
    return { actorUid, ...config };
  },
  names: Object.keys(registry),
  desktopNames: Object.keys(registry).filter(name => !name.endsWith('-details') && !['save-import-confirm', 'battle-menu'].includes(name)),
  backupJson: JSON.stringify({ saveVersion: 1, main: base }),
  async render(name: string, mobile = true, preload = true) {
    if (!registry[name]?.component) throw Error(`Missing fixture: ${name}`);
    if (name.startsWith('creature-style-')) await preloadImages(CREATURE_STYLE_IMAGES);
    const battle = registry[name].state.battle;
    if (preload) await preloadImages([...Object.values(CREATURE_IMAGES).filter((src): src is string => !!src), ...[...registry[name].state.roster, ...(battle ? [...battle.playerUnits, ...battle.enemyUnits] : [])]
      .map(unit => unit.speciesId === 'momo' ? '/battle-momo.png' : unit.image)
      .filter((src): src is string => !!src)]);
    mobileEmulation = mobile;
    // MobileShell's coarse-pointer check also exercises the real mobile activation path.
    flushSync(() => root.render(<Preview key={++generation} scene={registry[name]} mobile={mobile} />));
    document.documentElement.classList.toggle('mobile-ui', mobile);
    return registry[name].setup;
  },
};
