// 仅由独立验收服务器加载，不进入生产入口，也不读取或覆盖真实存档。
import { createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import * as screens from '../../src/ui/App';
import { BattleScreen } from '../../src/ui/BattleScreen';
import { FormationScreen } from '../../src/ui/FormationScreen';
import { GauntletOrderScreen } from '../../src/ui/GauntletOrderScreen';
import { GrowthScreen } from '../../src/ui/GrowthScreen';
import { BlacksmithScreen } from '../../src/ui/BlacksmithScreen';
import { EnhanceStoneScreen } from '../../src/ui/EnhanceStoneScreen';
import { EnhanceResetScreen } from '../../src/ui/EnhanceResetScreen';
import { SkillPickScreen } from '../../src/ui/SkillPickScreen';
import { Arena3Screen } from '../../src/ui/Arena3Screen';
import { CampFusionScreen, CampFusionSkillScreen, CampRestScreen, SpecialTargetScreen } from '../../src/ui/CampScreens';
import { ProgressionChoiceScreen, AttributeBoostScreen, CreationScreen, RevivalScreen } from '../../src/ui/ProgressionScreens';
import { MobileShell } from '../../src/ui/mobile';
import { preloadImages } from '../../src/ui/imageCache';
import { FORMATION_SPRITES } from '../../src/ui/formationSprites';
import { createInitialState, gameReducer } from '../../src/game/state/reducer';
import { createBattle, makeUnit } from '../../src/game/core/battle';
import { ITEMS } from '../../src/game/data/items';
import { FOODS } from '../../src/game/data/foods';
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
add('difficulty-select', ui.DifficultyScreen, {}, false);
add('starter', ui.StarterScreen, {}, false);
add('proficiency-select', ui.ProficiencyStarterScreen, {}, false);
add('map', ui.MapScreen, {}, false);
add('forest-map', ui.MapScreen, { region: 'emerald_forest' }, false);
add('formation', FormationScreen, { formation }, false);
add('gauntlet-order', GauntletOrderScreen, { gauntletOrder: base.roster.slice(0, 4) });
add('battle', BattleScreen, { battle: createBattle(base.roster.slice(0, 5), encounter, 123) }, false);
add('reward', ui.RewardScreen, { rewards }, false);
add('recruit', ui.RewardScreen, { rewards, pendingRecruitRewardId: 'recruit' }, false);
add('roster', ui.RosterScreen);
add('postbattle', ui.PostBattleRosterScreen, { postBattle: true }, false);
add('shop', ui.ShopScreen, { shopStock: ['atk_up', 'meat', 'scout', 'gem'], shopBoughtItems: ['meat'], gold: 10 }, false);
add('shop-prof', ui.ShopScreen, { runMode: 'proficiency', shopStock: ['book_large', 'skill_enhance_stone', 'revival_stone', 'reset_stone'] }, false);
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
add('evolve', ProgressionChoiceScreen, { specialPending: { kind: 'evolve' } });
add('special-target', SpecialTargetScreen, { specialPending: { kind: 'eventBoostHp', amount: 5 } });
add('gameover', ui.GameOverScreen);
add('victory', ui.VictoryScreen);
add('inter_act', ui.InterActScreen);
add('forest-interact', ui.InterActScreen, { region: 'emerald_forest' });
add('watchtower', ui.WatchtowerScreen);
add('chest', ui.ChestScreen, { chestResult: ['左侧宝箱：金币30、浆果2', '右侧宝箱：侦查符1、全队恢复生命'] });
add('backpack', ui.BackpackScreen, {}, false);
add('tame-overflow', ui.TameOverflowScreen, { tameOverflow: [makeUnit('momo', true, 0, false)] });
add('test-type', ui.TestTypeScreen, {}, false);
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
variant('backpack-empty', 'backpack', { inventory: {}, roster: [], field: [] });
variant('codex-detail', 'codex', {}, '.codex-item');
variant('battle-food', 'battle', {}, '捕获');
variant('battle-items', 'battle', {}, '道具');
variant('battle-enemy', 'battle', {}, 'hold:.enemy-area .formation-slot:not(.empty)');
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
variant('fusion-long', 'fusion-dialog', { roster: [first, ...base.roster.filter(u => u.speciesId === first.speciesId)] });
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
let generation = 0;
function Preview({ scene, mobile }: { scene: Scene; mobile: boolean }) {
  const [current, setCurrent] = useState(scene.state);
  const dispatch = (action: any) => setCurrent(s => gameReducer(s, action));
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
  names: Object.keys(registry),
  desktopNames: Object.keys(registry).filter(name => !name.endsWith('-details') && !['save-import-confirm', 'battle-menu'].includes(name)),
  backupJson: JSON.stringify({ saveVersion: 1, main: base }),
  async render(name: string, mobile = true) {
    if (!registry[name]?.component) throw Error(`Missing fixture: ${name}`);
    const battle = registry[name].state.battle;
    await preloadImages([...Object.values(FORMATION_SPRITES), ...[...registry[name].state.roster, ...(battle ? [...battle.playerUnits, ...battle.enemyUnits] : [])]
      .map(unit => unit.speciesId === 'momo' ? '/battle-momo.png' : unit.image)
      .filter((src): src is string => !!src)]);
    mobileEmulation = mobile;
    // MobileShell's coarse-pointer check also exercises the real mobile activation path.
    flushSync(() => root.render(<Preview key={++generation} scene={registry[name]} mobile={mobile} />));
    document.documentElement.classList.toggle('mobile-ui', mobile);
    return registry[name].setup;
  },
};
