import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Dispatch, DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { gameReducer, createInitialState, newSeed } from '../game/state/reducer';
import type { GameAction } from '../game/state/reducer';
import type { GameState, Difficulty } from '../game/state/game';
import { canStepTo, generateMap, nodeInfo, FIELD_MAX, PROF_FIELD_MAX, maxFieldForEnemy, fusionNeedCount, evolutionLockReason, fuseUnit, nextStage, CURSE_CN, labelOf, EVENT_TYPE_LABELS, DIFFICULTY_CONFIG, DIFFICULTY_ORDER, RELIC_DEFS, RELIC_ORDER, DEFAULT_UNLOCKS, getMaxRoster, type MapNode, type SpecialReward } from '../game/state/game';
import type { FormationRow } from '../game/state/formation';
import type { Unit, MonsterSpecies } from '../game/types';
import { MONSTERS, STARTER_GROUP_1, STARTER_GROUP_2, BASE_POOL, getMonster } from '../game/data/monsters';
import { FOODS } from '../game/data/foods';
import { ITEMS } from '../game/data/items';
import { getSkill } from '../game/data/skills';
import { getPassive } from '../game/data/passives';
import { computeStats, makeUnit } from '../game/core/battle';
import { UnitCard, SkillTag, PetIcon, PixelCreature, BattlePixelSprite, skillBrief } from './components';
import { GrowthScreen } from './GrowthScreen';
import { BlacksmithScreen } from './BlacksmithScreen';
import { EnhanceStoneScreen } from './EnhanceStoneScreen';
import { EnhanceResetScreen } from './EnhanceResetScreen';
import { Arena3Screen } from './Arena3Screen';
import { SkillPickScreen } from './SkillPickScreen';
import { BattleScreen, BattleUnitInspectPanel } from './BattleScreen';
import { FormationScreen } from './FormationScreen';
import { BATTLE_BUFF_ICON_IMAGES, BuffIcon, CURSE_ART } from './BuffIcon';
import { FORMATION_SPRITES } from './formationSprites';
import { BACKPACK_ITEM_ART } from './backpackItemArt';
import './backpack.css';
import { FLOW_ART, FLOW_ICON_NAMES, FlowIcon, FlowHeader, FlowPet, FlowPetStats, FlowTeam, flowChoiceArt } from './MainFlowArt';
import './mainFlow.css';
import './remainingMain.css';
import { ProgressionChoiceScreen, AttributeBoostScreen, CreationScreen, RevivalScreen } from './ProgressionScreens';
import { CampRestScreen, CampFusionScreen, CampFusionSkillScreen, SpecialTargetScreen } from './CampScreens';
import { ProficiencyReport } from './ProficiencyArt';
import { GauntletOrderScreen } from './GauntletOrderScreen';
import { MapNodeIcon } from './MapNodeIcon';
import { ShopItemIcon } from './ShopItemIcon';
import { UiSymbol, UI_SYMBOL_IMAGES } from './UiSymbol';
import { getMapRouteEdges } from './mapRoutes';
import { getDecodedImage, preloadImages } from './imageCache';
import { MobileShell, useBackAction, useMobileLayout } from './mobile';
import { MobileDetails, MobileUnitAbilities, MobileSkillDescription } from './MobileDetails';
import { SaveBackup } from './SaveBackup';
import { persistSave, quitGame, detectUnlocks, getSlotUnlocks, listSaves, deleteSave, deleteSaveMode, clearDeletedSlot, type SaveSlotInfo } from './persistence';
import homeXunxun from './assets/home-xunxun.png';
import homePaopao from './assets/home-paopao.png';
import homeZhuozhuo from './assets/home-zhuozhuo.png';
import starterTiedun from './assets/starter-tiedun.png';
import starterMimi from './assets/starter-mimi.png';
import starterCici from './assets/starter-cici.png';
import homeTitleLogo from './assets/home-title-logo.png';
import homeContinueIcon from './assets/home-terminal-kit-v2/continue-backpack.png';
import homeNewIcon from './assets/home-terminal-kit-v2/new-expedition-map.png';
import homeProficiencyIcon from './assets/home-terminal-kit-v2/proficiency-chart.png';
import homeCodexIcon from './assets/home-terminal-kit-v2/creature-codex.png';
import homeSaveIcon from './assets/home-terminal-kit-v2/save-archive.png';
import homeAchievementIcon from './assets/home-terminal-kit-v2/achievement-trophy.png';
import homeSettingsIcon from './assets/home-terminal-kit-v2/settings-gear.png';
import homeExitIcon from './assets/home-terminal-kit-v2/exit-door.png';
import homePawIcon from './assets/home-terminal-kit-v2/paw-status.png';

const NO_SAVE_SCREENS = ['title', 'starter', 'gameover', 'victory', 'achievements', 'difficulty-select'];

const EMPTY_ROW: MapNode[] = [];
const MAP_ACT_NAMES = ['', '翠绿之径', '暗影沼泽', '余烬险地'];
const chestOpenArt = '/page-special-icons/chest-open.png';
const watchtowerTelescopeArt = '/page-special-icons/watchtower-telescope.png';

const HOME_BACKGROUND = new URL('./assets/home-handheld-background.png', import.meta.url).href;
const MAP_BACKGROUNDS = [
  new URL('./assets/map-act1.png', import.meta.url).href,
  new URL('./assets/map-act2.png', import.meta.url).href,
  new URL('./assets/map-act3.png', import.meta.url).href,
  new URL('./assets/map-proficiency.png', import.meta.url).href,
];

function creatureImages(units: Unit[]): string[] {
  return units.flatMap((unit) => unit.speciesId === 'momo' ? ['/battle-momo.png'] : unit.image ? [unit.image] : []);
}

function formationImage(speciesId: string, image?: string): string | undefined {
  return FORMATION_SPRITES[speciesId] ?? (speciesId === 'momo' ? '/battle-momo.png' : image);
}

function screenImages(screen: GameState['screen'], state: GameState): string[] {
  switch (screen) {
    case 'title':
      return [HOME_BACKGROUND, homeTitleLogo, homeXunxun, homePaopao, homeZhuozhuo,
        homeContinueIcon, homeNewIcon, homeProficiencyIcon, homeCodexIcon, homeSaveIcon,
        homeAchievementIcon, homeSettingsIcon, homeExitIcon, homePawIcon];
    case 'difficulty-select':
      return [HOME_BACKGROUND,
        ...['difficulty-header', 'difficulty-normal', 'difficulty-hard', 'difficulty-nightmare',
          'traveler_charm', 'elite_badge', 'beast_master', 'difficulty-shop', 'difficulty-recovery']
          .map((name) => `/starter-growth-icons/${name}.png`)];
    case 'starter':
    case 'proficiency-select':
      return [HOME_BACKGROUND, homeXunxun, homePaopao, homeZhuozhuo,
        starterTiedun, starterMimi, starterCici, '/starter-choice-stone.png',
        '/formation-plinth-occupied.png', '/starter-growth-icons/starter-paw.png'];
    case 'map':
      return [MAP_BACKGROUNDS[state.runMode === 'proficiency' ? 3 : Math.min(2, Math.max(0, state.act - 1))],
        '/map-node-stele.png',
        ...['route', 'party', 'gold', 'skip', 'bag', 'home', 'flag'].map((kind) => `/map-hud-icons/${kind}.png`),
        ...state.map.layers.flat().map((node) => `/map-node-icons/${node.type}.png`)];
    case 'formation':
      return ['/formation-art/formation-forest-left-v1.png',
        '/formation-art/formation-plinth-occupied-v1.png',
        '/formation-art/formation-plinth-empty-v1.png',
        '/formation-art/formation-title-pines-v1.png',
        '/battle-stat-icons/life.png', '/battle-stat-icons/speed.png',
        ...(state.formation?.units ?? []).map((unit) => formationImage(unit.speciesId, unit.image)).filter((src): src is string => !!src),
        ...(state.formation?.encounter ?? []).map((enemy) => formationImage(enemy.speciesId, getMonster(enemy.speciesId).image)).filter((src): src is string => !!src)];
    case 'battle':
      return ['/battle-forest-background.png',
        '/battle-stat-icons/life.png', '/battle-stat-icons/speed.png',
        ...BATTLE_BUFF_ICON_IMAGES,
        '/battle-action-icons/capture.png', '/battle-action-icons/item.png', '/battle-action-icons/swap.png',
        ...['atk_up', 'spd_up', 'hp_up', 'atk_down', 'spd_down', 'hp_down'].map(id => BACKPACK_ITEM_ART[id]),
        '/capture-food-icons/berry.png', '/capture-food-icons/meat.png',
        '/capture-food-icons/gem.png', '/capture-food-icons/golden_fruit.png',
        ...creatureImages(state.battle?.playerUnits ?? []), ...creatureImages(state.battle?.enemyUnits ?? [])];
    case 'reward':
      return ['/roster-camp-background.png', '/reward-icons/gold.png', '/reward-icons/food.png', '/reward-icons/heal.png', '/starter-growth-icons/starter-paw.png', '/battle-stat-icons/life.png', '/battle-stat-icons/speed.png', '/page-special-icons/victory-swords.png',
        ...state.rewards.flatMap((reward) => {
          return (reward.recruitCandidates ?? []).flatMap((id) => {
            const species = getMonster(id);
            const image = formationImage(id, species.image);
            return image ? [image] : [];
          });
        })];
    case 'roster':
      return ['/roster-camp-background.png', '/formation-camp.png', `${FLOW_ART}/partner-camp.png`, `${FLOW_ART}/encounter-shrine.png`, homePawIcon, ...BATTLE_BUFF_ICON_IMAGES, ...creatureImages(state.roster),
        ...state.roster.flatMap((unit) => {
          const image = formationImage(unit.speciesId, unit.image);
          const next = nextStage(unit.speciesId);
          const nextImage = next ? formationImage(next, getMonster(next).image) : undefined;
          return [image, nextImage].filter((src): src is string => !!src);
        })];
    case 'shop':
      return ['/shop-stall-background.png', '/reward-icons/gold.png', homePawIcon,
        '/starter-growth-icons/difficulty-shop.png', '/page-special-icons/shop-refresh.png',
        ...(state.shopStock ?? []).flatMap((id) => BACKPACK_ITEM_ART[id] ? [BACKPACK_ITEM_ART[id]] : [])];
    case 'backpack':
      return ['/roster-camp-background.png', homeContinueIcon, homePawIcon, '/reward-icons/gold.png',
        ...Object.entries(state.inventory).flatMap(([id, count]) => count > 0 && BACKPACK_ITEM_ART[id] ? [BACKPACK_ITEM_ART[id]] : []),
        ...state.roster.flatMap((unit) => {
          const image = formationImage(unit.speciesId, unit.image);
          return image ? [image] : [];
        })];
    case 'event':
    case 'special':
    case 'tame-overflow':
    case 'inter_act':
    case 'victory':
    case 'gameover': {
      const backgrounds = { event: 'event-forest', special: 'encounter-shrine', 'tame-overflow': 'partner-camp',
        inter_act: 'interact-sunset', victory: 'victory-dawn', gameover: 'defeat-dusk' };
      return [`${FLOW_ART}/${backgrounds[screen]}.png`, '/reward-icons/gold.png', '/reward-icons/heal.png', '/reward-icons/food.png',
        ...FLOW_ICON_NAMES.map(name => `${FLOW_ART}/icons/${name}.png`), ...Object.values(BACKPACK_ITEM_ART),
        ...[...state.roster, ...(state.tameOverflow ?? [])].flatMap(unit => {
          const image = formationImage(unit.speciesId, unit.image);
          return image ? [image] : [];
        })];
    }
    case 'watchtower':
      return [`${FLOW_ART}/event-forest.png`, watchtowerTelescopeArt, '/reward-icons/gold.png'];
    case 'chest':
      return [`${FLOW_ART}/encounter-shrine.png`, chestOpenArt, '/reward-icons/gold.png', '/reward-icons/heal.png', ...Object.values(BACKPACK_ITEM_ART)];
    case 'gauntlet-order':
      return [`${FLOW_ART}/partner-camp.png`, ...state.roster.flatMap(unit => {
        const image = formationImage(unit.speciesId, unit.image);
        return image ? [image] : [];
      })];
    case 'rest':
    case 'rest-fusion':
    case 'rest-fusion-skill':
    case 'skill-pick':
    case 'growth-menu':
    case 'blacksmith':
    case 'enhance-stone':
    case 'enhance-reset':
    case 'arena3':
    case 'proficiency-result':
      return ['/formation-camp.png', `${FLOW_ART}/victory-dawn.png`, `${FLOW_ART}/defeat-dusk.png`, `${FLOW_ART}/icons/fuse-companion.png`, `${FLOW_ART}/icons/rating-laurel.png`, `${FLOW_ART}/icons/victory-crown.png`, `${FLOW_ART}/icons/journey-end.png`, BACKPACK_ITEM_ART.skill_enhance_stone, BACKPACK_ITEM_ART.reset_stone, '/page-special-icons/upgrade-anvil.png',
        ...(screen === 'arena3' ? ['simulation', 'challenge', 'exhibition'].map(mode => `/page-special-icons/arena-${mode}.png`) : []),
        ...state.roster.flatMap(unit => {
        const image = formationImage(unit.speciesId, unit.image);
        return image ? [image] : [];
      })];
    case 'boost':
    case 'custom':
    case 'revive-select':
    case 'achievements':
      return [`${FLOW_ART}/partner-camp.png`, `${FLOW_ART}/encounter-shrine.png`, homeAchievementIcon,
        `${FLOW_ART}/icons/rating-laurel.png`, `${FLOW_ART}/icons/journey-end.png`,
        ...(screen === 'achievements' ? ['difficulty-normal', 'difficulty-hard', 'difficulty-nightmare',
          'traveler_charm', 'elite_badge', 'beast_master'].map((name) => `/starter-growth-icons/${name}.png`) : []),
        ...(screen === 'custom' ? ['custom_guardian', 'custom_fury', 'custom_gale'].map(id => `/page-special-icons/creation-${id}.png`) : []),
        ...[...state.roster, ...(state.deadPets ?? [])].flatMap(unit => {
          const image = formationImage(unit.speciesId, unit.image);
          return image ? [image] : [];
        })];
    default:
      return [];
  }
}

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);
  const [readyScreen, setReadyScreen] = useState<string | null>(null);
  const screenKey = state.screen === 'map' ? `${state.screen}-${state.runMode}-${state.act}` : state.screen;
  const imagesReady = readyScreen === screenKey || [...UI_SYMBOL_IMAGES, ...screenImages(state.screen, state)].every((src) => !!getDecodedImage(src));

  useEffect(() => { void preloadImages(BATTLE_BUFF_ICON_IMAGES); }, []);

  useEffect(() => {
    let active = true;
    void preloadImages([...UI_SYMBOL_IMAGES, ...screenImages(state.screen, state)]).then(() => {
      if (active) {
        setReadyScreen(screenKey);
        const nextScreen = state.screen === 'title' ? 'difficulty-select'
          : state.screen === 'difficulty-select' ? 'starter'
            : state.screen === 'starter' || state.screen === 'proficiency-select' ? 'map'
              : state.screen === 'map' ? 'formation'
                : state.screen === 'formation' ? 'battle' : null;
        if (nextScreen) void preloadImages(screenImages(nextScreen, state));
      }
    });
    return () => { active = false; };
  }, [screenKey]);

  useEffect(() => {
    if (!NO_SAVE_SCREENS.includes(state.screen)) {
      const t = setTimeout(() => {
        void persistSave(state);
      }, 400);
      return () => clearTimeout(t);
    }
  }, [state]);

  useEffect(() => {
    if (state.toast) {
      const t = setTimeout(() => dispatch({ type: 'CLEAR_TOAST' }), 2500);
      return () => clearTimeout(t);
    }
  }, [state.toast]);

  return (
    <div className={['event', 'special', 'tame-overflow', 'inter_act', 'victory', 'gameover', 'watchtower', 'chest', 'gauntlet-order', 'boost', 'custom', 'revive-select', 'achievements', 'rest', 'rest-fusion', 'rest-fusion-skill', 'skill-pick', 'growth-menu', 'blacksmith', 'enhance-stone', 'enhance-reset', 'arena3', 'proficiency-result'].includes(state.screen) || (state.screen === 'roster' && !state.postBattle && (!state.specialPending || state.specialPending.kind === 'evolve' || ['boost', 'arena', 'growthPoint', 'shopSlotUnlock', 'eventBoostHp', 'eventBoostSpd', 'eventResetGrowth', 'eventSkillReplace', 'arena3Exhibition'].includes(state.specialPending.kind))) ? 'screen screen-flow' : state.screen === 'title' ? 'screen screen-title' : state.screen === 'reward' ? 'screen screen-reward' : state.screen === 'backpack' ? 'screen screen-backpack' : state.screen === 'starter' || state.screen === 'proficiency-select' ? 'screen screen-starter' : state.screen === 'difficulty-select' ? 'screen screen-difficulty' : 'screen'}>
      {!imagesReady && <div className="screen-assets-loading" role="status" aria-live="polite">正在准备画面…</div>}
      {state.screen === 'title' && <HomeScreen dispatch={dispatch} currentSaveSlot={state.saveSlot} />}
      {state.screen === 'starter' && <StarterScreen dispatch={dispatch} />}
      {state.screen === 'map' && <MapScreen state={state} dispatch={dispatch} />}
      {state.screen === 'formation' && <FormationScreen state={state} dispatch={dispatch} />}
      {state.screen === 'gauntlet-order' && <GauntletOrderScreen state={state} dispatch={dispatch} />}
      {state.screen === 'battle' && <BattleScreen state={state} dispatch={dispatch} />}
      {state.screen === 'reward' && <RewardScreen state={state} dispatch={dispatch} />}
      {state.screen === 'roster' && <RosterScreen state={state} dispatch={dispatch} />}
      {state.screen === 'shop' && <ShopScreen state={state} dispatch={dispatch} />}
      {state.screen === 'rest' && <RestScreen state={state} dispatch={dispatch} />}
      {(state.screen === 'rest-fusion' || state.screen === 'rest-fusion-skill') && <RestFusionScreen state={state} dispatch={dispatch} />}
      {state.screen === 'revive-select' && <ReviveSelectScreen state={state} dispatch={dispatch} />}
      {state.screen === 'event' && <EventScreen state={state} dispatch={dispatch} />}
      {state.screen === 'special' && <SpecialScreen state={state} dispatch={dispatch} />}
      {state.screen === 'custom' && <CustomScreen state={state} dispatch={dispatch} />}
      {state.screen === 'boost' && <BoostScreen state={state} dispatch={dispatch} />}
      {state.screen === 'gameover' && <GameOverScreen state={state} dispatch={dispatch} />}
      {state.screen === 'victory' && <VictoryScreen state={state} dispatch={dispatch} />}
      {state.screen === 'inter_act' && <InterActScreen state={state} dispatch={dispatch} />}
      {state.screen === 'watchtower' && <WatchtowerScreen state={state} dispatch={dispatch} />}
      {state.screen === 'chest' && <ChestScreen state={state} dispatch={dispatch} />}
      {state.screen === 'backpack' && <BackpackScreen state={state} dispatch={dispatch} />}
      {state.screen === 'tame-overflow' && <TameOverflowScreen state={state} dispatch={dispatch} />}
      {state.screen === 'test-type' && <TestTypeScreen dispatch={dispatch} />}
      {state.screen === 'test-pick' && <TestPickScreen state={state} dispatch={dispatch} />}
      {state.screen === 'test-config' && <TestConfigScreen state={state} dispatch={dispatch} />}
      {state.screen === 'achievements' && <AchievementsScreen state={state} dispatch={dispatch} />}
      {state.screen === 'growth-menu' && <GrowthScreen state={state} dispatch={dispatch} />}
      {state.screen === 'blacksmith' && <BlacksmithScreen state={state} dispatch={dispatch} />}
      {state.screen === 'enhance-stone' && <EnhanceStoneScreen state={state} dispatch={dispatch} />}
      {state.screen === 'enhance-reset' && <EnhanceResetScreen state={state} dispatch={dispatch} />}
      {state.screen === 'arena3' && <Arena3Screen state={state} dispatch={dispatch} />}
      {state.screen === 'skill-pick' && <SkillPickScreen state={state} dispatch={dispatch} />}
      {state.screen === 'difficulty-select' && <DifficultyScreen state={state} dispatch={dispatch} />}
      {state.screen === 'proficiency-select' && <ProficiencyStarterScreen state={state} dispatch={dispatch} />}
      {state.screen === 'proficiency-result' && <ProficiencyResultScreen state={state} dispatch={dispatch} />}
      {state.toast && (
        <div className={`toast ${state.toast.kind ?? 'info'}`}>
          {state.toast.msg}
        </div>
      )}
      <MobileShell state={state} dispatch={dispatch} canSave={!NO_SAVE_SCREENS.includes(state.screen)} />
    </div>
  );
}

function MapHudIcon({ kind }: { kind: 'route' | 'party' | 'gold' | 'skip' | 'bag' | 'home' }) {
  return <img className={`map-hud-icon map-hud-icon-${kind}`} src={`/map-hud-icons/${kind}.png`} alt="" aria-hidden="true" draggable={false} />;
}

function HUD({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const handleSkip = () => {
    const isFirst = state.currentNodeId === '';
    const targetRow = isFirst ? state.currentRow : state.currentRow + 1;
    const currentCol = isFirst ? null : (state.map.layers[state.currentRow]?.find((n) => n.id === state.currentNodeId)?.col ?? null);
    const nextRow = state.map.layers[targetRow] ?? [];
    const visitedInRow = (state.visitedNodeIds ?? []).filter((id) => nextRow.some((n) => n.id === id));
    const lockedId = visitedInRow.length > 0 ? visitedInRow[0] : null;
    const skipTypes = new Set(['battle', 'elite', 'arena', 'gauntlet', 'corrupted', 'boss']);
    const target = nextRow.find((n) => {
      if (lockedId && n.id !== lockedId) return false;
      if (!skipTypes.has(n.type)) return false;
      return canStepTo(state.currentRow, currentCol, n, state.map);
    });
    if (target) dispatch({ type: 'USE_SKIP', nodeId: target.id, free: true });
  };
  const returnHome = () => {
    void persistSave(state);
    dispatch({ type: 'TITLE' });
  };
  if (state.screen === 'map') {
    return (
      <div className="hud map-hud">
        <div className="map-hud-place">
          <span className="map-hud-crest"><MapHudIcon kind="route" /></span>
          <span className="map-hud-place-copy">
            <strong>{state.runMode === 'proficiency'
              ? `熟练度远征 · 第${Math.max(1, state.currentRow + 1)}/50层`
              : `第${state.act}幕 · ${MAP_ACT_NAMES[state.act] ?? '远征之路'}`}</strong>
            <small>远征地图</small>
          </span>
        </div>
        <div className="map-hud-resources">
          <span className="map-hud-chip map-hud-layer" aria-label={`当前第 ${Math.max(1, state.currentRow + 1)} 层`}><MapHudIcon kind="route" />第{Math.max(1, state.currentRow + 1)}层</span>
          <span className="map-hud-chip" aria-label={`出战 ${state.field.length}/${FIELD_MAX}`}><MapHudIcon kind="party" />{state.field.length}/{FIELD_MAX}</span>
          <span className="map-hud-chip" aria-label={`金币 ${state.gold}`}><MapHudIcon kind="gold" />{state.gold}</span>
        </div>
        <div className="map-hud-actions">
          <button className="map-hud-button" onClick={handleSkip}><MapHudIcon kind="skip" />跳关</button>
          <button className="map-hud-button" onClick={() => dispatch({ type: 'OPEN_BACKPACK' })}><MapHudIcon kind="bag" />背包</button>
        </div>
        <div className="map-hud-exit">
          <button className="map-hud-button" onClick={returnHome}><MapHudIcon kind="home" />返回首页</button>
        </div>
      </div>
    );
  }
  return (
    <div className="hud">
      <span className="act">
        第 {state.act} 层
      </span>
      <span>
        <span className="chip">👥 {state.field.length}/{FIELD_MAX}</span>
        <span className="chip">💰 {state.gold}</span>
      </span>
      {state.screen === 'backpack' ? (
        <button className="home-btn" onClick={() => dispatch({ type: 'CLOSE_BACKPACK' })}>
          🎒 关闭背包
        </button>
      ) : null}
      <button className="home-btn" onClick={returnHome}>
        🏠 返回首页
      </button>
    </div>
  );
}

type PetConfirm = { kind: 'fuse' | 'discard' | 'notice' | 'replace'; uid?: string; msg?: string; gold?: number } | null;

/** 宠物卡片底部操作区：融合 / 释放（点击弹出确认框，材料不足时提示） */
function PetCardFooter({
  unit,
  state,
  setConfirm,
}: {
  unit: Unit;
  state: GameState;
  setConfirm: (c: NonNullable<PetConfirm>) => void;
}) {
  const isProf = state.runMode === 'proficiency';
  const stage = nextStage(unit.speciesId);
  const lockReason = evolutionLockReason(state, unit.speciesId);
  const need = stage ? fusionNeedCount(unit.speciesId) : 0;
  const sameCount = state.roster.filter((x) => x.speciesId === unit.speciesId).length;
  const canFuse = stage !== undefined && !lockReason && sameCount >= need;
  return (
    <div className="unit-card-actions">
      {!isProf && (
        <button
          disabled={!!lockReason}
          title={lockReason ?? (stage ? `与同物种融合进化为 ${getMonster(stage).name}（${sameCount}/${need}）` : '该宠物已是最终形态，无法融合')}
          onClick={(e) => {
            e.stopPropagation();
            if (!stage) {
              setConfirm({ kind: 'notice', msg: '该宠物已是最终形态，无法融合' });
            } else if (!canFuse) {
              setConfirm({ kind: 'notice', msg: `同物种不足（${sameCount}/${need}），无法融合` });
            } else {
              setConfirm({ kind: 'fuse', uid: unit.uid });
            }
          }}
        >
          融合
        </button>
      )}
      <button
        title="释放后获得金币，宠物被永久移除"
        onClick={(e) => {
          e.stopPropagation();
          setConfirm({ kind: 'discard', uid: unit.uid });
        }}
      >
        释放
      </button>
    </div>
  );
}

/** 融合/释放/提示 的二次确认弹窗 */
export function FusionConfirm({ primary, state, dispatch, onClose }: { primary: Unit; state: GameState; dispatch: Dispatch<GameAction>; onClose: () => void }) {
  const overflow = state.screen === 'tame-overflow' ? state.tameOverflow ?? [] : [];
  const materials = [...state.roster, ...overflow].filter(unit => unit.uid !== primary.uid && unit.speciesId === primary.speciesId);
  const [materialUid, setMaterialUid] = useState(materials.length === 1 ? materials[0].uid : '');
  const material = materials.find(unit => unit.uid === materialUid);
  const lockReason = evolutionLockReason(state, primary.speciesId);
  const evolved = useMemo(() => fuseUnit(primary), [primary]);
  if (!evolved) return null;
  const fromOverflow = !!material && overflow.some(unit => unit.uid === material.uid);
  const passive = getPassive(evolved.passive);
  const materialInfo = (unit: Unit) => `生命 ${unit.hp}/${unit.maxHp} · 速度 ${unit.spd} · 强化：生命 +${unit.bonusStats?.hp ?? 0}、速度 +${unit.bonusStats?.spd ?? 0} · 诅咒：${unit.curse ? CURSE_CN[unit.curse] : '无'}`;
  return <div className="confirm-overlay" onClick={onClose}>
    <div className="confirm-box fusion-confirm" role="dialog" aria-modal="true" aria-labelledby="fusion-confirm-title" onClick={event => event.stopPropagation()}>
      <div className="section-title fusion-title" id="fusion-confirm-title"><img src="/main-flow-art/icons/fuse-companion.png" alt="" />确认融合</div>
      <div className="popup-body fusion-confirm-body">
        <div className="fusion-result-card">
          <div className="fusion-pet-row"><PetIcon image={formationImage(evolved.speciesId, evolved.image)} emoji={evolved.emoji} name={evolved.name} /><div><h3 className="fusion-name">{evolved.name}</h3><div className="fusion-stats"><span><img src="/battle-stat-icons/life.png" alt="" />生命 <strong>{evolved.hp}/{evolved.maxHp}</strong></span><span><img src="/battle-stat-icons/speed.png" alt="" />速度 <strong>{evolved.spd}</strong></span></div></div></div>
          {passive && <section className="fusion-detail fusion-passive"><h4>被动</h4><strong>{passive.name}</strong><p>{passive.desc}</p></section>}
          <section className="fusion-detail"><h4>技能</h4><div className="fusion-result-skills">{evolved.skills.map(id => <SkillTag key={id} skill={getSkill(id)} />)}</div></section>
          <div className="fusion-modifiers"><span className="fusion-modifier-label">永久强化</span><span>生命 +{evolved.bonusStats?.hp ?? 0}</span><span>速度 +{evolved.bonusStats?.spd ?? 0}</span><span className={`fusion-curse${evolved.curse ? ' has-curse' : ''}`}>诅咒：{evolved.curse ? CURSE_CN[evolved.curse] : '无'}</span></div>
        </div>
        {materials.length > 1 && <label>融合材料 <select aria-label="融合材料" value={materialUid} onChange={event => setMaterialUid(event.target.value)}><option value="">请选择材料</option>{materials.map((unit, index) => <option key={unit.uid} value={unit.uid}>{index + 1}. {unit.name} · {overflow.some(item => item.uid === unit.uid) ? '待处理' : '队伍内'} · {materialInfo(unit)}</option>)}</select></label>}
        {lockReason && <p role="status">{lockReason}</p>}
      </div>
      <div className="panel-row fusion-actions"><button className="primary" disabled={!material || !!lockReason || state.runMode === 'proficiency'} onClick={() => {
        if (!material || lockReason) return;
        if (fromOverflow) dispatch({ type: 'TAME_OVERFLOW_FUSE', tameUid: material.uid, primaryUid: primary.uid });
        else if (state.screen === 'tame-overflow') dispatch({ type: 'FUSE_IN_OVERFLOW', uid: primary.uid, materialUid: material.uid });
        else dispatch({ type: 'FUSE', primaryUid: primary.uid, materialUid: material.uid });
        onClose();
      }}>确定融合</button><button onClick={onClose}>取消</button></div>
    </div>
  </div>;
}

function FuseDiscardConfirm({
  confirm,
  state,
  dispatch,
  setConfirm,
}: {
  confirm: PetConfirm;
  state: GameState;
  dispatch: Dispatch<GameAction>;
  setConfirm: (c: PetConfirm) => void;
}) {
  if (!confirm) return null;
  const target = confirm.uid ? state.roster.find((x) => x.uid === confirm.uid) : undefined;
  if (confirm.kind === 'fuse' && target) return <FusionConfirm key={target.uid} primary={target} state={state} dispatch={dispatch} onClose={() => setConfirm(null)} />;
  const isDiscard = confirm.kind === 'discard';
  const isReplace = confirm.kind === 'replace';
  return (
    <div className="confirm-overlay" onClick={() => setConfirm(null)}>
      <div className={`confirm-box${isDiscard || isReplace ? ' popup-danger' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="section-title">{isDiscard ? '确认释放' : isReplace ? '确认替换' : '提示'}</div>
        <div className="popup-body">
        {isDiscard && target && (
          <div className="popup-pet-row">
            {target.image ? <img className="popup-pet-portrait" src={target.image} alt="" /> : <span className="popup-pet-portrait">{target.emoji}</span>}
            <div><p>释放「{target.name}」后，将获得 <b>{5 * getMonster(target.speciesId).rank} 金币</b>。</p><p className="popup-consequence">这名伙伴将永久离队。</p></div>
          </div>
        )}
        {isReplace && target && (
          <div className="popup-pet-row">
            {target.image ? <img className="popup-pet-portrait" src={target.image} alt="" /> : <span className="popup-pet-portrait">{target.emoji}</span>}
            <div><p>放生「{target.name}」后，将获得 <b>{confirm.gold ?? 0} 金币</b>，然后「{state.tameOverflow?.[0]?.name ?? '新宠物'}」加入队伍。</p><p className="popup-consequence">这名伙伴将永久离队。</p></div>
          </div>
        )}
        {confirm.kind === 'notice' && <p>{confirm.msg}</p>}
        </div>
        <div className="panel-row" style={{ justifyContent: 'center' }}>
          {(isDiscard || isReplace) ? (
            <>
              <button
                className="primary"
                onClick={() => {
                  if (isDiscard) dispatch({ type: 'DISCARD', uid: confirm.uid! });
                  else if (isReplace && state.tameOverflow?.[0]) {
                    dispatch({ type: 'TAME_OVERFLOW_REPLACE', tameUid: state.tameOverflow[0].uid, discardUid: confirm.uid! });
                  }
                  setConfirm(null);
                }}
              >
                确定
              </button>
              <button onClick={() => setConfirm(null)}>取消</button>
            </>
          ) : (
            <button className="primary" onClick={() => setConfirm(null)}>
              知道了
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 自定义测试可选的全部关卡类型（战斗类需选敌我双方，非战斗类直接进入对应界面） */
const CUSTOM_TYPES: { value: MapNode['type']; label: string }[] = [
  { value: 'battle', label: '⚔ 战斗' },
  { value: 'arena', label: '🆚 斗兽场' },
  { value: 'gauntlet', label: '🔁 车轮战' },
  { value: 'corrupted', label: '☠ 被侵蚀' },
  { value: 'elite', label: '⭐ 精英' },
  { value: 'boss', label: '👑 首领' },
  { value: 'guardian', label: '🛡 守卫' },
  { value: 'rest', label: '🔥 休息' },
  { value: 'shop', label: '🏪 商店' },
  { value: 'event', label: '❓ 事件' },
  { value: 'special', label: '🎁 奇遇' },
  { value: 'watchtower', label: '🔭 瞭望塔' },
  { value: 'sync', label: '📦 双生宝箱' },
  { value: 'keydoor', label: '🗝 钥匙门' },
];

/** 自定义测试需要选宠的战斗类关卡（非战斗类跳过选宠直接进入） */
const TEST_BATTLE_TYPES: MapNode['type'][] = ['battle', 'arena', 'gauntlet', 'corrupted', 'elite', 'boss', 'guardian'];

function TestTypeScreen({ dispatch }: { dispatch: Dispatch<GameAction> }) {
  const [sel, setSel] = useState<MapNode['type']>('battle');
  const [debuff, setDebuff] = useState<'spd' | 'dmg' | 'burn'>('spd');
  const [reward, setReward] = useState<'gold' | 'food'>('gold');
  const [eventType, setEventType] = useState('spring');
  return (
    <div className="screen center-col test-type-screen">
      <div className="hud">
        <span className="act">⚙ 自定义测试 · 选择关卡类型</span>
        <button className="home-btn" onClick={() => dispatch({ type: 'TITLE' })}>
          ↩ 返回首页
        </button>
      </div>
      <div className="side-label">先选择关卡类型，再进入布阵界面依次选我方 / 敌方宠物（同种可上多只）</div>
      <div className="test-type-grid">
        {CUSTOM_TYPES.map((t) => (
          <button
            key={t.value}
            className={`debug-cell big-tap ${sel === t.value ? 'selected' : ''}`}
            onClick={() => setSel(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sel === 'corrupted' && (
        <div className="debug-row">
          <label>侵蚀</label>
          <select value={debuff} onChange={(e) => setDebuff(e.target.value as 'spd' | 'dmg' | 'burn')}>
            <option value="spd">速度 -2</option>
            <option value="dmg">受伤 +2</option>
            <option value="burn">每回合 -2HP</option>
          </select>
          <label>胜利奖励</label>
          <select value={reward} onChange={(e) => setReward(e.target.value as 'gold' | 'food')}>
            <option value="gold">金币</option>
            <option value="food">食物</option>
          </select>
        </div>
      )}
      {sel === 'event' && (
        <div className="debug-row">
          <label>选择事件</label>
          <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
            {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      )}
      <div className="formation-footer">
        <button
          className="primary big-btn"
          onClick={() =>
            dispatch({
              type: 'TEST_TYPE_PICK',
              nodeType: sel,
              corruptDebuff: sel === 'corrupted' ? debuff : undefined,
              corruptReward: sel === 'corrupted' ? reward : undefined,
              eventType: sel === 'event' ? eventType : undefined,
            })
          }
        >
          下一步：{TEST_BATTLE_TYPES.includes(sel) ? '选择宠物' : '进入关卡'}
        </button>
      </div>
    </div>
  );
}

function TestPickScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const tp = state.testPick;
  if (!tp) return null;
  const isPlayerSide = tp.side === 'player';
  const [units, setUnits] = useState<Unit[]>(() => {
    if (isPlayerSide) {
      return [
        makeUnit('momo_god', true, 0, false),
        makeUnit('lulu_god', true, 1, false),
        makeUnit('fifi_god', true, 2, false),
        makeUnit('momo', true, 0, false, 'back'),
        makeUnit('lulu', true, 1, false, 'back'),
        makeUnit('fifi', true, 2, false, 'back'),
      ];
    }
    return [];
  });

  const maxSlots = isPlayerSide ? FIELD_MAX : 6;
  const fieldCount = units.length;
  const bySlot: Record<string, Unit | undefined> = {};
  for (const u of units) bySlot[`${u.row}-${u.column}`] = u;

  function firstEmpty(): { row: FormationRow; column: 0 | 1 | 2 } | null {
    for (const row of ['front', 'back'] as const) {
      for (const col of [0, 1, 2] as const) {
        if (!bySlot[`${row}-${col}`]) return { row, column: col };
      }
    }
    return null;
  }

  function addSpecies(speciesId: string) {
    if (fieldCount >= maxSlots) return;
    const slot = firstEmpty();
    if (!slot) return;
    const u = makeUnit(speciesId, isPlayerSide, slot.column, false, slot.row);
    setUnits((prev) => [...prev, u]);
  }

  function onSlotClick(row: FormationRow, col: 0 | 1 | 2) {
    const existing = bySlot[`${row}-${col}`];
    if (existing) setUnits((prev) => prev.filter((u) => u.uid !== existing.uid));
  }

  function onSlotDrop(e: DragEvent<HTMLDivElement>, row: FormationRow, col: 0 | 1 | 2) {
    e.preventDefault();
    const uid = e.dataTransfer.getData('text/plain');
    const from = units.find((u) => u.uid === uid);
    if (!from) return;
    const target = bySlot[`${row}-${col}`];
    setUnits((prev) =>
      prev.map((u) => {
        if (u.uid === uid) return { ...u, row, column: col };
        if (target && u.uid === target.uid) return { ...u, row: from.row, column: from.column };
        return u;
      }),
    );
  }

  function confirm() {
    const ordered = [...units].sort((a, b) => {
      const ia = (a.row === 'front' ? 0 : 3) + a.column;
      const ib = (b.row === 'front' ? 0 : 3) + b.column;
      return ia - ib;
    });
    if (isPlayerSide) {
      dispatch({ type: 'TEST_PICK_PLAYER_CONFIRM', units: ordered });
    } else {
      dispatch({ type: 'TEST_PICK_ENEMY_CONFIRM', units: ordered });
    }
  }

  const countBySpecies: Record<string, number> = {};
  for (const u of units) countBySpecies[u.speciesId] = (countBySpecies[u.speciesId] ?? 0) + 1;

  return (
    <div className="screen test-pick-screen">
      <div className="hud">
        <span className="act">⚙ 自定义测试 · {labelOf(tp.nodeType, 0)} · {isPlayerSide ? '选择我方出战' : '选择敌方阵容'}</span>
        <span className="chip">👥 已选 {fieldCount}/{maxSlots} 只</span>
        <button className="home-btn" onClick={() => dispatch({ type: 'DEBUG_CUSTOM_TEST' })}>
          ↩ 重新选关卡
        </button>
      </div>

      <div className="formation-main">
        <div className="formation-left">
          <div className="side-label">
            {isPlayerSide
              ? '点击下方宠物池即可上阵（同种可多点几只）；点击棋盘上的宠物下阵，拖拽可调整站位'
              : '选择敌方宠物（同种可多点几只），敌方数量决定战斗规模；点击下阵、拖拽调整'}
          </div>
          <div className="formation-board">
            {(['front', 'back'] as const).map((row) => (
              <div key={row} className={`formation-row ${row === 'front' ? 'row-front' : 'row-back'}`}>
                <span className="formation-row-label">{row === 'front' ? '前 排' : '后 排'}</span>
                {([0, 1, 2] as const).map((col) => {
                  const u = bySlot[`${row}-${col}`];
                  return (
                    <div
                      key={`${row}-${col}`}
                      className={`formation-slot ${u ? '' : 'empty'}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => onSlotDrop(e, row, col)}
                      onClick={() => onSlotClick(row, col)}
                    >
                      {u ? (
                        <div
                          draggable
                          title="拖拽调整站位，点击下阵"
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', u.uid)}
                        >
                          <UnitCard unit={u} small showSkills={false} topStats />
                        </div>
                      ) : (
                        <span className="formation-empty-slot">空</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="formation-list">
          <div className="side-label">宠物池（点击上阵，同种可多只）</div>
          <div className="test-pool">
            {Object.values(MONSTERS).map((m) => {
              const cnt = countBySpecies[m.id] ?? 0;
              const full = fieldCount >= maxSlots;
              return (
                <button
                  key={m.id}
                  className={`test-pool-item ${full ? 'disabled' : ''} ${cnt > 0 ? 'has-count' : ''}`}
                  onClick={() => addSpecies(m.id)}
                  title={m.name}
                >
                  <span className="test-pool-emoji">{m.emoji}</span>
                  <span className="test-pool-name">{m.name}</span>
                  {cnt > 0 && <span className="test-pool-count">×{cnt}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="formation-footer">
        <button className="primary big-btn" disabled={fieldCount === 0} onClick={confirm}>
          {isPlayerSide ? '⚔️ 确认我方出战' : '⚔️ 确认敌方阵容'}
        </button>
      </div>
    </div>
  );
}

function TestConfigScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const pb = state.pendingBattle;
  if (!pb) return null;
  const [gold, setGold] = useState(state.gold);
  const [seed, setSeed] = useState(1);
  const [items, setItems] = useState<Record<string, number>>(() => ({ ...state.inventory }));
  const CT_ITEMS: { id: string; label: string }[] = [
    ...Object.keys(FOODS).map((id) => ({ id, label: FOODS[id].name })),
    ...Object.keys(ITEMS).map((id) => ({ id, label: ITEMS[id].name })),
  ];
  const enemyDesc = pb.encounter.map((e) => getMonster(e.speciesId).name).join('、');
  return (
    <div className="screen center-col test-config-screen">
      <div className="hud">
        <span className="act">⚙ 自定义测试 · {labelOf(pb.nodeType, 0)} · 配置战斗</span>
        <button className="home-btn" onClick={() => dispatch({ type: 'TITLE' })}>
          ↩ 返回首页
        </button>
      </div>
      <div className="test-items">
        <div className="side-label">敌方：{enemyDesc}</div>
        <div className="side-label">我方出战：{pb.units.map((u) => u.name).join('、')}</div>
        <div className="debug-row">
          <label>金币</label>
          <input type="number" min={0} value={gold} onChange={(e) => setGold(Number(e.target.value))} style={{ width: 80 }} />
          <label>种子</label>
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} style={{ width: 80 }} />
        </div>
        <div className="side-label">调整本次战斗携带的食物/道具数量，确认后开战</div>
        <div className="debug-grid">
          {CT_ITEMS.map((it) => (
            <label key={it.id} className="debug-cell">
              <span className="debug-cell-name">{it.label}</span>
              <input
                type="number"
                min={0}
                value={items[it.id] ?? 0}
                onChange={(e) => setItems((v) => ({ ...v, [it.id]: Number(e.target.value) }))}
              />
            </label>
          ))}
        </div>
        <button
          className="primary big-btn"
          onClick={() => dispatch({ type: 'TEST_ITEMS_CONFIRM', inventory: items, gold, seed })}
        >
          ⚔ 开始战斗
        </button>
      </div>
    </div>
  );
}

function HomeScreen({ dispatch, currentSaveSlot }: { dispatch: Dispatch<GameAction>; currentSaveSlot?: number }) {
  const [hasSave, setHasSave] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [showCodex, setShowCodex] = useState(false);
  const [showSaveMgmt, setShowSaveMgmt] = useState(false);
  const [slots, setSlots] = useState<SaveSlotInfo[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<number | undefined>(() => {
    try { return Number(localStorage.getItem('petCardSaveSelected')) || undefined; } catch { return undefined; }
  });
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [overwriteTarget, setOverwriteTarget] = useState<number | null>(null);
  const [profConfirmSlot, setProfConfirmSlot] = useState<number | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [dbgAct, setDbgAct] = useState(1);
  const [dbgRow, setDbgRow] = useState(5);
  const [dbgType, setDbgType] = useState<MapNode['type'] | 'all'>('all');
  const [dbgSeed, setDbgSeed] = useState(42);
  useBackAction(showCodex || showSaveMgmt || showDebug || deleteTarget !== null || overwriteTarget !== null || profConfirmSlot !== null, () => {
    if (deleteTarget !== null) setDeleteTarget(null);
    else if (overwriteTarget !== null) setOverwriteTarget(null);
    else if (profConfirmSlot !== null) setProfConfirmSlot(null);
    else if (showCodex) setShowCodex(false);
    else if (showSaveMgmt) setShowSaveMgmt(false);
    else setShowDebug(false);
  });

  function selectSlot(slot: number | undefined) {
    setSelectedSlot(slot);
    try {
      if (slot) localStorage.setItem('petCardSaveSelected', String(slot));
      else localStorage.removeItem('petCardSaveSelected');
    } catch { /* ignore */ }
  }

  function openSaveMgmt() {
    setShowSaveMgmt(true);
    setSlotsLoading(true);
    void listSaves().then((s) => {
      setSlots(s);
      setHasSave(s.some((x) => x.main || x.proficiency));
      setSlotsLoading(false);
    });
  }

  useEffect(() => {
    let cancelled = false;
    void listSaves().then((s) => {
      if (!cancelled) {
        setSlots(s);
        setHasSave(s.some((x) => x.main || x.proficiency));
        setSlotsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (currentSaveSlot) {
      selectSlot(currentSaveSlot);
    }
  }, [currentSaveSlot, slots]);

  function onNewGame() {
    if (slotsLoading) return;
    if (selectedSlot) {
      const target = slots.find((s) => s.slot === selectedSlot);
      if (target?.main || target?.proficiency) {
        setOverwriteTarget(selectedSlot);
        return;
      }
      clearDeletedSlot(selectedSlot);
      selectSlot(selectedSlot);
      dispatch({ type: 'STARTER', saveSlot: selectedSlot, unlocks: getSlotUnlocks(target) });
      return;
    }
    const empty = slots.find((s) => !s.main && !s.proficiency);
    if (empty) {
      clearDeletedSlot(empty.slot);
      selectSlot(empty.slot);
      dispatch({ type: 'STARTER', saveSlot: empty.slot, unlocks: getSlotUnlocks(empty) });
    } else {
      alert('存档已满，请在「存档管理」中删除一个存档');
    }
  }

  function confirmOverwrite() {
    if (overwriteTarget === null) return;
    const slotNum = overwriteTarget;
    const unlocks = getSlotUnlocks(slots.find((slot) => slot.slot === slotNum));
    setOverwriteTarget(null);
    void deleteSaveMode(slotNum, 'main').then((success) => {
      if (!success) return;
      setSlots((prev) => {
        const next = prev.map((s) => s.slot === slotNum ? { ...s, main: null } : s);
        setHasSave(next.some((x) => x.main || x.proficiency));
        return next;
      });
      clearDeletedSlot(slotNum);
      selectSlot(slotNum);
      dispatch({ type: 'STARTER', saveSlot: slotNum, unlocks });
    });
  }

  function profConfirmContinue() {
    if (profConfirmSlot === null) return;
    const slotState = slots.find(s => s.slot === profConfirmSlot);
    setProfConfirmSlot(null);
    if (slotState?.proficiency) {
      dispatch({ type: 'LOAD_GAME', state: slotState.proficiency });
    }
  }

  function profConfirmRestart() {
    if (profConfirmSlot === null) return;
    const slot = profConfirmSlot;
    const unlocks = getSlotUnlocks(slots.find((slotState) => slotState.slot === slot));
    setProfConfirmSlot(null);
    clearDeletedSlot(slot);
    selectSlot(slot);
    dispatch({ type: 'START_PROFICIENCY', seed: Date.now(), saveSlot: slot, unlocks });
  }

  function onContinue() {
    if (!selectedSlot) return;
    const target = slots.find((s) => s.slot === selectedSlot);
    if (!target) return;
    // 优先加载主模式，无则加载熟练度
    const toLoad = target.main ?? target.proficiency;
    if (toLoad) {
      dispatch({ type: 'LOAD_GAME', state: toLoad });
    }
  }

  function onSlotClick(slot: SaveSlotInfo) {
    selectSlot(slot.slot);
    dispatch({ type: 'SHOW_TOAST', msg: `已切换到存档 ${slot.slot}`, kind: 'success' });
  }

  function onDeleteSlot(slotNum: number, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteTarget(slotNum);
  }

  function confirmDelete() {
    if (deleteTarget === null) return;
    const slotNum = deleteTarget;
    setDeleteTarget(null);
    void deleteSave(slotNum).then((success) => {
      if (!success) return;
      setSlots((prev) => {
        const next = prev.map((s) => s.slot === slotNum ? { ...s, main: null, proficiency: null } : s);
        setHasSave(next.some((x) => x.main || x.proficiency));
        return next;
      });
      if (selectedSlot === slotNum) {
        selectSlot(undefined);
      }
    });
  }

  function slotSummary(s: SaveSlotInfo) {
    const parts: string[] = [];
    const subs: string[] = [];
    if (s.main) {
      const st = s.main;
      const diffLabel = DIFFICULTY_CONFIG[st.difficulty ?? 'normal'].label;
      parts.push(`主模式 第${st.act}幕 ${st.roster.length}只 ${st.gold}金`);
      subs.push(diffLabel);
    }
    if (s.proficiency) {
      const st = s.proficiency;
      parts.push(`远征 第${st.currentLayer ?? 1}层 ${st.roster.length}只 ${st.gold}金`);
    }
    if (parts.length === 0) return { text: '空', sub: '', cls: 'empty' };
    return {
      text: parts.join(' | '),
      sub: subs.length > 0 ? subs.join(' · ') : '',
      cls: 'occupied',
    };
  }

  const DEBUG_TYPES_ALL: { value: MapNode['type'] | 'all'; label: string }[] = [
    { value: 'all', label: '任意' },
    { value: 'battle', label: '战斗' },
    { value: 'arena', label: '斗兽场' },
    { value: 'gauntlet', label: '车轮战' },
    { value: 'corrupted', label: '被侵蚀' },
    { value: 'elite', label: '精英' },
    { value: 'boss', label: '首领' },
    { value: 'event', label: '事件' },
    { value: 'shop', label: '商店' },
    { value: 'special', label: '奇遇' },
    { value: 'watchtower', label: '瞭望塔' },
    { value: 'sync', label: '双生宝箱' },
    { value: 'guardian', label: '守卫' },
    { value: 'keydoor', label: '钥匙门' },
  ];

  const dbgMap = useMemo(() => generateMap(dbgSeed, dbgAct), [dbgSeed, dbgAct]);
  const dbgRows = dbgMap.layers.length;
  const dbgRowClamped = Math.min(dbgRow, dbgRows - 1);
  const rowTypes = new Set(dbgMap.layers[dbgRowClamped].map((n) => n.type));
  const DEBUG_TYPES = DEBUG_TYPES_ALL.filter((t) => t.value === 'all' || rowTypes.has(t.value as MapNode['type']));
  const dbgTypeEff = rowTypes.has(dbgType as MapNode['type']) ? dbgType : 'all';
  const selectedSave = slots.find((s) => s.slot === selectedSlot);
  const canContinue = Boolean(selectedSave?.main || selectedSave?.proficiency);

  return (
    <div className="center-col home-screen">
      <div className="home-shell">
        <section className="home-world" aria-labelledby="home-title">
          <header className="home-brand">
            <h1 className="home-title" id="home-title">
              <img src={homeTitleLogo} alt="驯牌远征" />
            </h1>
          </header>
          <div className="home-companions" aria-hidden="true">
            <span className="home-companion home-companion-xunxun"><img src={homeXunxun} alt="" /></span>
            <span className="home-companion home-companion-paopao"><img src={homePaopao} alt="" /></span>
            <span className="home-companion home-companion-zhuozhuo"><img src={homeZhuozhuo} alt="" /></span>
          </div>
        </section>
        <aside className="home-terminal" aria-label="远征终端">
          <div className="home-terminal-header" aria-hidden="true">
            <span className="home-terminal-tab" />
            <img src={homePawIcon} alt="" />
          </div>
          <nav className="home-menu" aria-label="主菜单">
            <button
              aria-label={hasSave === null ? '检查存档…' : selectedSlot ? '继续游戏' : '请先选择存档'}
              className={`home-action${canContinue ? ' home-action-primary' : ''}`}
              onClick={onContinue}
              disabled={!canContinue}
            >
              <span className="home-action-icon" aria-hidden="true"><img src={homeContinueIcon} alt="" /></span>
              <span>{hasSave === null ? '检查存档…' : selectedSlot ? '继续远征' : '请先选择存档'}</span>
              <span className="home-action-arrow" aria-hidden="true" />
            </button>
            <button aria-label="新游戏" disabled={slotsLoading} className={`home-action${canContinue ? '' : ' home-action-primary'}`} onClick={onNewGame}>
              <span className="home-action-icon" aria-hidden="true"><img src={homeNewIcon} alt="" /></span>
              <span>新的远征</span>
              <span className="home-action-arrow" aria-hidden="true" />
            </button>
            {(() => {
              const slotState = slots.find((s) => s.slot === selectedSlot);
              const unlocks = slotState?.main?.unlocks ?? slotState?.proficiency?.unlocks ?? { ...DEFAULT_UNLOCKS };
              const profLocked = !unlocks.proficiencyUnlocked;
              return (
                <button
                  className={`home-action home-action-proficiency${profLocked ? ' is-locked' : ''}`}
                  disabled={profLocked || slotsLoading}
                  onClick={() => {
                    if (profLocked) return;
                    // 确保有选中槽位：优先当前选中，否则选有存档的，最后选空槽
                    let slot = selectedSlot;
                    if (!slot) {
                      const occupied = slots.find(s => s.main || s.proficiency);
                      slot = occupied ? occupied.slot : slots.find(s => !s.main && !s.proficiency)?.slot;
                    }
                    if (!slot) { alert('存档已满，请在「存档管理」中删除一个存档'); return; }

                    // 检查该槽是否有未完成的熟练度远征
                    const slotState2 = slots.find(s => s.slot === slot);
                    if (slotState2?.proficiency) {
                      setProfConfirmSlot(slot);
                      return;
                    }

                    // 无远征记录 → 新开
                    clearDeletedSlot(slot);
                    selectSlot(slot);
                    dispatch({ type: 'START_PROFICIENCY', seed: Date.now(), saveSlot: slot, unlocks: getSlotUnlocks(slotState2) });
                  }}
                >
                  <span className="home-action-icon" aria-hidden="true"><img src={homeProficiencyIcon} alt="" /></span>
                  <span className="home-action-copy">熟练度远征{profLocked && <small className="locked-hint">通关第 1 幕后解锁</small>}</span>
                  <span className="home-action-arrow" aria-hidden="true" />
                </button>
              );
            })()}
            <button className="home-action" onClick={quitGame}>
              <span className="home-action-icon" aria-hidden="true"><img src={homeExitIcon} alt="" /></span>
              <span>退出游戏</span>
              <span className="home-action-arrow" aria-hidden="true" />
            </button>
            <div className="home-menu-divider" aria-hidden="true"><span><img src={homePawIcon} alt="" /></span></div>
            <div className="home-menu-secondary">
              <button onClick={() => setShowCodex(true)}><img src={homeCodexIcon} alt="" aria-hidden="true" /><span>生物图鉴</span></button>
              <button onClick={openSaveMgmt}><img src={homeSaveIcon} alt="" aria-hidden="true" /><span>存档管理</span></button>
              <button onClick={() => {
                const slotState = slots.find((s) => s.slot === selectedSlot);
                const unlocks = slotState?.main?.unlocks ?? slotState?.proficiency?.unlocks ?? { ...DEFAULT_UNLOCKS };
                dispatch({ type: 'ACHIEVEMENTS', unlocks });
              }}><img src={homeAchievementIcon} alt="" aria-hidden="true" /><span>成就</span></button>
              <button onClick={() => setShowDebug((v) => !v)}>
                <img src={homeSettingsIcon} alt="" aria-hidden="true" />
                <span>{showDebug ? '收起测试' : '测试关卡'}</span>
              </button>
            </div>
          </nav>
        </aside>
      </div>
      {showSaveMgmt && (
        <div className="save-mgmt-overlay" onClick={() => setShowSaveMgmt(false)}>
          <div className="save-mgmt-panel" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">存档管理</div>
            {slotsLoading ? (
              <div style={{ padding: 20, color: 'var(--muted)', textAlign: 'center' }}>⏳ 存档加载中…</div>
            ) : (
              <div className="save-grid">
                {slots.map((s) => {
                  const info = slotSummary(s);
                  const isActive = s.slot === selectedSlot;
                  return (
                    <div
                      key={s.slot}
                      className={`save-slot ${info.cls}${isActive ? ' active' : ''}`}
                      onClick={() => onSlotClick(s)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSlotClick(s);
                        }
                      }}
                    >
                      <div className="save-slot-num">存档 {s.slot}{isActive ? '（当前）' : ''}</div>
                      <div className="save-slot-text">{info.text}</div>
                      {info.sub && <div className="save-slot-sub">{info.sub}</div>}
                      {(s.main || s.proficiency) && (
                        <button className="save-slot-del" onClick={(e) => onDeleteSlot(s.slot, e)} title="删除存档" aria-label="删除存档"><UiSymbol name="close" /></button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <SaveBackup slot={selectedSlot} onClose={() => setShowSaveMgmt(false)} onImported={() => { void listSaves().then(s => { setSlots(s); setHasSave(s.some(x => x.main || x.proficiency)); }); }} />
            <button className="big-btn" style={{ marginTop: 16 }} onClick={() => setShowSaveMgmt(false)}>关闭</button>
          </div>
        </div>
      )}
      {deleteTarget !== null && (
        <div className="confirm-overlay" style={{ zIndex: 1100 }} onClick={() => setDeleteTarget(null)}>
          <div className="confirm-box popup-danger popup-save" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">删除存档</div>
            <div className="popup-body">
            <p>
              确定要删除存档 <b>{deleteTarget}</b> 吗？
            </p>
            <p className="popup-consequence">
              此操作不可撤销。
            </p>
            </div>
            <div className="panel-row" style={{ justifyContent: 'center' }}>
              <button className="primary" onClick={confirmDelete}>确定删除</button>
              <button onClick={() => setDeleteTarget(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {overwriteTarget !== null && (
        <div className="confirm-overlay" style={{ zIndex: 1100 }} onClick={() => setOverwriteTarget(null)}>
          <div className="confirm-box popup-danger popup-save" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">覆盖存档</div>
            <div className="popup-body">
            <p>
              存档 <b>{overwriteTarget}</b> 已有游戏，确定覆盖？
            </p>
            <p className="popup-consequence">
              旧存档将被删除，此操作不可撤销。
            </p>
            </div>
            <div className="panel-row" style={{ justifyContent: 'center' }}>
              <button className="primary" onClick={confirmOverwrite}>确定覆盖</button>
              <button onClick={() => setOverwriteTarget(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {profConfirmSlot !== null && (
        <div className="confirm-overlay" style={{ zIndex: 1100 }} onClick={() => setProfConfirmSlot(null)}>
          <div className="confirm-box popup-save" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">熟练度远征</div>
            <div className="popup-body">
            <p>
              存档 <b>{profConfirmSlot}</b> 有未完成的熟练度远征
            </p>
            <p className="popup-consequence">
              重新开始将覆盖当前远征记录
            </p>
            </div>
            <div className="panel-row" style={{ justifyContent: 'center' }}>
              <button className="primary" onClick={profConfirmContinue}>继续游戏</button>
              <button onClick={profConfirmRestart}>重新开始</button>
            </div>
          </div>
        </div>
      )}
      {showDebug && (
        <div className="debug-panel">
          <div className="debug-row">
            <label>幕</label>
            <select value={dbgAct} onChange={(e) => setDbgAct(Number(e.target.value))}>
              {[1, 2, 3].map((a) => (
                <option key={a} value={a}>
                  第 {a} 幕
                </option>
              ))}
            </select>
            <label>层</label>
            <select value={dbgRowClamped} onChange={(e) => setDbgRow(Number(e.target.value))}>
              {Array.from({ length: dbgRows }, (_, i) => (
                <option key={i} value={i}>
                  第 {i} 层{i === dbgRows - 1 ? '（首领层）' : ''}
                </option>
              ))}
            </select>
            <label>节点</label>
            <select value={dbgTypeEff} onChange={(e) => setDbgType(e.target.value as MapNode['type'] | 'all')}>
              {DEBUG_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <label>种子</label>
            <input
              type="number"
              value={dbgSeed}
              onChange={(e) => setDbgSeed(Number(e.target.value))}
              style={{ width: 80 }}
            />
          </div>
          <button
            className="primary big-btn"
            onClick={() =>
              dispatch({ type: 'DEBUG_JUMP', act: dbgAct, row: dbgRowClamped, nodeType: dbgTypeEff, seed: dbgSeed })
            }
          >
            直接进入
          </button>
          <div className="debug-hint">调试模式：自动配备 3 只最高进化形态宠物、500 金币、3 个跳关道具；节点类型仅显示当前幕当前层实际存在的类型</div>
          <button className="debug-sub-toggle" onClick={() => dispatch({ type: 'DEBUG_CUSTOM_TEST' })}>
            ⚙ 自定义测试（选关卡 → 选我方 → 选敌方 → 配置 → 开战）
          </button>
        </div>
      )}
      {showCodex && createPortal(<CodexScreen onClose={() => setShowCodex(false)} />, document.body)}
    </div>
  );
}

const CODEX_RANK_LABEL: Record<number, string> = { 1: '普通', 2: '精英', 3: '传奇', 4: '首领' };

const CODEX_GROUPS: { key: string; label: string; match: (m: MonsterSpecies) => boolean }[] = [
  { key: 'common', label: '普通宠物', match: (m) => m.rank === 1 },
  { key: 'elite', label: '精英宠物', match: (m) => m.rank === 2 },
  { key: 'legend', label: '传奇宠物', match: (m) => m.rank === 3 && !m.id.startsWith('custom_') },
  { key: 'boss', label: '首领', match: (m) => m.rank === 4 },
  { key: 'custom', label: '造物', match: (m) => m.id.startsWith('custom_') },
];

function CodexScreen({ onClose }: { onClose: () => void }) {
  const mobile = useMobileLayout();
  const [mobileDetail, setMobileDetail] = useState(false);
  useBackAction(mobile && mobileDetail, () => setMobileDetail(false), 1);
  useEffect(() => {
    void preloadImages(['/formation-camp.png', homeCodexIcon, ...(mobile ? [] : Object.values(MONSTERS)).flatMap(species => {
      const image = formationImage(species.id, species.image);
      return image ? [image] : [];
    })]);
  }, [mobile]);
  const groups = useMemo(
    () =>
      CODEX_GROUPS.map((g) => ({
        ...g,
        items: Object.values(MONSTERS)
          .filter(g.match)
          .sort((a, b) => {
            const numA = a.image ? parseInt(a.image.replace('/', '').replace('.png', ''), 10) : 999;
            const numB = b.image ? parseInt(b.image.replace('/', '').replace('.png', ''), 10) : 999;
            return numA - numB;
          }),
      })).filter((g) => g.items.length > 0),
    [],
  );
  const [selectedId, setSelectedId] = useState<string>(() => groups[0]?.items[0]?.id ?? '');
  const listRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-codex-id="${selectedId}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedId]);
  const sp = getMonster(selectedId);
  useEffect(() => {
    if (!mobile) return;
    const image = formationImage(sp.id, sp.image);
    if (image) void preloadImages([image]);
  }, [mobile, sp.id]);
  const stats = computeStats(sp.id);
  const passive = getPassive(sp.passive);
  const next = nextStage(sp.id);
  const rankLabel = sp.id.startsWith('custom_') ? '造物' : (CODEX_RANK_LABEL[sp.rank] ?? '');
  const rankTone = sp.id.startsWith('custom_') ? '' : sp.rank === 2 ? ' rank-chip-elite' : sp.rank === 3 ? ' rank-chip-legend' : sp.rank === 4 ? ' rank-chip-boss' : '';
  const tameable = sp.rank !== 4;

  return (
    <div className={`codex-root flow-screen codex-terminal${mobileDetail ? ' codex-mobile-detail' : ''}`}>
      <header className="codex-header flow-frame">
        <h1 className="codex-title"><img src={homeCodexIcon} alt="" />生物图鉴</h1>
        <div className="codex-sub">
          查看生物属性、技能与进化
        </div>
        <button type="button" onClick={() => { if (mobile && mobileDetail) setMobileDetail(false); else onClose(); }}>
          {mobile && mobileDetail ? '返回目录' : '返回'}
        </button>
      </header>
      <div className="codex-body">
        <nav className="codex-list flow-frame" aria-label="生物目录" ref={listRef}>
          {groups.map((g) => (
            <div key={g.key} className="codex-group">
              <div className="codex-group-title">{g.label}</div>
              {g.items.map((m) => {
                return (
                  <button type="button"
                    key={m.id}
                    className={`codex-item ${m.id === selectedId ? 'selected' : ''}`}
                    aria-pressed={m.id === selectedId}
                    data-codex-id={m.id}
                    onClick={() => { setSelectedId(m.id); if (mobile) setMobileDetail(true); }}
                  >
                    <span className="codex-item-emoji"><PetIcon image={formationImage(m.id, m.image)} emoji={m.emoji} name={m.name} /></span>
                    <span className="codex-item-name">{m.name}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <main className="codex-detail flow-frame">
          <div className="codex-detail-head">
            <span className="codex-detail-emoji"><PetIcon image={formationImage(sp.id, sp.image)} emoji={sp.emoji} name={sp.name} /></span>
            <div>
              <div className="codex-detail-name">
                {sp.name}
                <span className={`chip rank-chip${rankTone}`}>{rankLabel}</span>
              </div>
              <div className="codex-detail-stats">
                <span><i className="starter-stat-icon starter-stat-heart" aria-hidden="true" />生命 {stats.maxHp}</span><span><i className="starter-stat-icon starter-stat-speed" aria-hidden="true" />速度 {stats.spd}</span>
              </div>
            </div>
          </div>

          {sp.altSkills && sp.altPassive && (() => {
            const p1 = getPassive(sp.passive);
            const p2 = getPassive(sp.altPassive);
            return (
              <>
                <div className="codex-form-block form-1">
                  <div className="codex-form-title">形态1：生命 &gt; 50%</div>
                  {p1 && (
                    <div className="codex-passive" title={p1.desc}>
                      {p1.name}：{p1.desc}
                    </div>
                  )}
                  <div className="codex-skills">
                    {sp.skills.map((sid) => {
                      const s = getSkill(sid);
                      return <SkillTag key={sid} skill={s} desc usesNote />;
                    })}
                  </div>
                </div>
                <div className="codex-form-block form-2">
                  <div className="codex-form-title">形态2：生命 ≤ 50%</div>
                  {p2 && (
                    <div className="codex-passive" title={p2.desc}>
                      {p2.name}：{p2.desc}
                    </div>
                  )}
                  <div className="codex-skills">
                    {sp.altSkills.map((sid) => {
                      const s = getSkill(sid);
                      return <SkillTag key={sid} skill={s} desc usesNote />;
                    })}
                  </div>
                </div>
              </>
            );
          })()}

          {!sp.altSkills && (
            <>
              {passive && (
                <div className="codex-section">
                  <div className="codex-sec-title">专属被动</div>
                  <div className="codex-passive" title={passive.desc}>
                    <strong>{passive.name}</strong>：{passive.desc}
                  </div>
                </div>
              )}

              <div className="codex-section">
                <div className="codex-sec-title">技能</div>
                <div className="codex-skills">
                  {sp.skills.map((sid) => {
                    const s = getSkill(sid);
                    return <SkillTag key={sid} skill={s} desc usesNote />;
                  })}
                </div>
                {sp.id.startsWith('custom_') && (
                  <div className="codex-note">造物：从上方技能池随机组合 3 个技能</div>
                )}
              </div>
            </>
          )}

          <div className="codex-meta-grid"><div className="codex-section">
            <div className="codex-sec-title">驯服</div>
            <div className="codex-line">
              {tameable ? `驯服成功率 ${Math.round(sp.tame.difficulty * 100)}%` : '首领 · 不可驯服'}
            </div>
          </div>

          <div className="codex-section">
            <div className="codex-sec-title">融合</div>
            <div className="codex-line">
              {next ? (
                <>
                  需 {fusionNeedCount(sp.id)} 只同物种 →{' '}
                  <button type="button"
                    className="codex-link"
                    onClick={() => setSelectedId(next)}
                  >
                    {getMonster(next).name}
                  </button>
                </>
              ) : (
                '不可融合'
              )}
            </div>
          </div></div>

          {sp.desc && <div className="codex-section codex-description"><div className="codex-sec-title">生物说明</div><p className="codex-desc">{sp.desc}</p></div>}
        </main>
      </div>
    </div>
  );
}

function RelicEmblem({ id }: { id: string }) {
  return <img src={`/starter-growth-icons/${id}.png`} alt="" aria-hidden="true" draggable={false} />;
}

export function DifficultyScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('normal');
  const [selectedRelic, setSelectedRelic] = useState<string>('');
  const unlocks = state.unlocks ?? { ...DEFAULT_UNLOCKS };

  const handleNext = () => {
    dispatch({ type: 'SET_PRERUN_CONFIG', difficulty: selectedDifficulty, relic: selectedRelic || undefined });
  };

  const relicDef = selectedRelic ? RELIC_DEFS[selectedRelic] : null;

  return (
    <div className="difficulty-screen">
      <header className="difficulty-header">
        <span className="difficulty-header-emblem" aria-hidden="true" />
        <h1><span>选择</span>难度与<span>遗物</span></h1>
        <div className="difficulty-step" aria-label="新远征第 1 步，共 2 步"><i className="active" /><span>···</span><i /><strong>新远征 1/2</strong></div>
        <button className="difficulty-back" onClick={() => dispatch({ type: 'TITLE' })}><UiSymbol name="arrow-left" /> 返回</button>
      </header>
      <main className="difficulty-main">
        <section className="difficulty-choices" aria-label="选择难度">
          {DIFFICULTY_ORDER.map((d) => {
            const cfg = DIFFICULTY_CONFIG[d];
            const locked = !unlocks.difficulties.includes(d);
            return <button key={d} className={`difficulty-tablet difficulty-${d} ${selectedDifficulty === d ? 'selected' : ''}`}
              disabled={locked} aria-pressed={selectedDifficulty === d} onClick={() => setSelectedDifficulty(d)}>
              <span className="difficulty-art" aria-hidden="true">{locked && <span className="difficulty-art-lock" />}</span>
              <strong>{cfg.label}</strong>
              <span className="difficulty-stats">
                <span><i className="difficulty-stat-hp" aria-hidden="true" />敌方生命 <b>×{cfg.enemyHpMult.toFixed(2)}</b></span>
                <span><i className="difficulty-stat-spd" aria-hidden="true" />速度 <b>+{cfg.enemySpdBonus}</b></span>
                <span><i className="difficulty-stat-shop" aria-hidden="true" />商店 <b>×{cfg.shopPriceMult.toFixed(2)}</b></span>
                <span><i className="difficulty-stat-heal" aria-hidden="true" />战后恢复 <b>{Math.round(cfg.healRatio * 100)}%</b></span>
              </span>
              <em>{locked && <span className="stone-lock" aria-hidden="true" />}{locked ? '未解锁' : selectedDifficulty === d ? '已选择' : '选择'}</em>
            </button>;
          })}
        </section>
        <section className="relic-cabinet" aria-label="选择初始遗物">
          <div className="relic-cabinet-heading"><h2>初始遗物</h2><span>可选一件</span></div>
          <button className={`relic-none ${selectedRelic === '' ? 'selected' : ''}`}
            aria-pressed={selectedRelic === ''} onClick={() => setSelectedRelic('')}>
            <span className="relic-none-icon" aria-hidden="true" /><span>不携带遗物</span>
          </button>
          <div className="relic-grid">
            {RELIC_ORDER.map((id) => {
              const def = RELIC_DEFS[id];
              const locked = !unlocks.relics.includes(id);
              const unlockNote = def.unlockCondition;
              return <button key={id} className={`relic-tile ${selectedRelic === id ? 'selected' : ''}`}
                disabled={locked} aria-pressed={selectedRelic === id} title={locked ? unlockNote : def.desc}
                onClick={() => setSelectedRelic(id)}>
                <span className="relic-symbol" aria-hidden="true"><RelicEmblem id={id} /></span>
                <span className="relic-copy"><strong>{def.name}</strong><small>{def.desc}</small></span>
                {locked && <span className="stone-lock relic-lock" aria-hidden="true" />}
              </button>;
            })}
          </div>
        </section>
      </main>
      <footer className="difficulty-footer">
        <div className="difficulty-summary"><span className={`difficulty-summary-emblem difficulty-summary-${selectedDifficulty}`} aria-hidden="true" />
          <strong>{DIFFICULTY_CONFIG[selectedDifficulty].label} · {relicDef?.name ?? '无遗物'}</strong>
          <span>{relicDef?.desc ?? '通关后解锁更多难度与遗物'}</span></div>
        <button className="difficulty-next" onClick={handleNext}>下一步：选择伙伴 <UiSymbol name="arrow-right" /></button>
      </footer>
    </div>
  );
}

const STARTER_ROLES: Record<string, string> = {
  momo: '均衡', lulu: '治愈', fifi: '进攻',
  kiki: '防护', mimi: '剧毒', pipi: '控制',
};

function StarterChoiceCard({ id, selected, order, compact = false, onClick }: {
  id: string; selected: boolean; order?: number; compact?: boolean; onClick: () => void;
}) {
  const species = getMonster(id);
  const stats = computeStats(id);
  return (
    <button type="button" className={`starter-choice ${compact ? 'compact' : 'main-choice'} ${selected ? 'selected' : ''}`}
      aria-pressed={selected} title={`技能：${species.skills.map((skill) => getSkill(skill).name).join('、')}`} onClick={onClick}>
      {order && <span className="starter-choice-order">{order}</span>}
      <span className="starter-choice-art">
        <span className="starter-choice-sprite"><BattlePixelSprite src={id === 'momo' ? '/battle-momo.png' : species.image!} name={species.name} /></span>
        <span className="starter-choice-plinth" aria-hidden="true" />
      </span>
      <span className="starter-choice-info">
        <span className="starter-choice-name">{species.name}<small>{STARTER_ROLES[id]}</small></span>
        <span className="starter-choice-stats"><span title="速度">⚡ {!compact && <small>速度</small>} {stats.spd}</span><span title="生命">♥ {!compact && <small>生命</small>} {stats.maxHp}</span></span>
        {!compact && <span className="starter-choice-skills">{species.skills.map((skill) => getSkill(skill).name).join(' · ')}</span>}
      </span>
      {!compact && selected && <span className="starter-choice-selected-note" aria-hidden="true"><UiSymbol name="marker-info" /> 已选择 <UiSymbol name="marker-info" /></span>}
    </button>
  );
}

export function StarterScreen({ dispatch }: { dispatch: Dispatch<GameAction> }) {
  const [firstPick, setFirstPick] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<string | null>(STARTER_GROUP_1[0]);
  const isCompanion = firstPick !== null;
  const choices = isCompanion ? STARTER_GROUP_2 : STARTER_GROUP_1;
  const selected = getMonster(candidate ?? choices[0]);
  const passive = getPassive(selected.passive);
  const starterArt: Record<string, string> = {
    momo: homeXunxun, lulu: homePaopao, fifi: homeZhuozhuo,
    kiki: starterTiedun, mimi: starterMimi, pipi: starterCici,
  };

  const confirm = () => {
    if (!candidate) return;
    if (!firstPick) {
      setFirstPick(candidate);
      setCandidate(STARTER_GROUP_2[0]);
    } else {
      dispatch({ type: 'START_RUN', starterId: firstPick, companionId: candidate, seed: newSeed() });
    }
  };

  return (
    <div className="starter-screen starter-selection">
      <header className="starter-select-header">
        <span className="starter-select-emblem" aria-hidden="true" />
        <h1><span>选择</span>{isCompanion ? '同行伙伴' : '初始伙伴'}</h1>
        <div className="starter-select-step" aria-label={`新远征第 ${isCompanion ? 2 : 1} 步，共 2 步`}>
          <i className={!isCompanion ? 'active' : ''} /><span>···</span><i className={isCompanion ? 'active' : ''} />
          <strong>新远征 {isCompanion ? 2 : 1}/2</strong>
        </div>
        <button className="starter-select-back" onClick={() => {
          if (isCompanion) { setFirstPick(null); setCandidate(STARTER_GROUP_1[0]); }
          else dispatch({ type: 'SELECT_DIFFICULTY_BACK' });
        }}><UiSymbol name="arrow-left" /> 返回</button>
      </header>
      <main className="starter-select-layout">
        <section className="starter-select-world" aria-label="选择生物">
          <div className="starter-select-choices">
            {choices.map((id) => {
              const species = getMonster(id);
              const choiceStats = computeStats(id);
              return <button key={id} type="button" className={`starter-select-choice ${candidate === id ? 'selected' : ''}`}
                aria-pressed={candidate === id} onClick={() => setCandidate(id)}>
                <span className="starter-select-pet">
                  {starterArt[id] ? <img src={starterArt[id]} alt="" /> : <BattlePixelSprite src={species.image!} name={species.name} />}
                </span>
                <span className="starter-select-ground" aria-hidden="true" />
                <span className="starter-select-label">
                  <strong>{species.name}</strong>
                  <span className="starter-select-numbers"><span className="starter-stat-icon starter-stat-heart" aria-hidden="true" />{choiceStats.maxHp}<span className="starter-stat-icon starter-stat-speed" aria-hidden="true" />{choiceStats.spd}</span>
                </span>
              </button>;
            })}
          </div>
        </section>
        <aside className="starter-select-panel" aria-label={`${selected.name}详情`}>
          <div className="starter-select-profile">
            <div className="starter-select-portrait">
              {starterArt[selected.id] ? <img src={starterArt[selected.id]} alt="" /> : <BattlePixelSprite src={selected.image!} name={selected.name} />}
            </div>
            <div><h2>{selected.name}</h2><span className="starter-select-role">{STARTER_ROLES[selected.id]}</span><p>{selected.desc}</p></div>
          </div>
          <MobileDetails label="技能与被动详情" details={<>{passive && <section><h3>被动 · {passive.name}</h3><p>{passive.desc}</p></section>}{selected.skills.map(id => <MobileSkillDescription key={id} skill={getSkill(id)} />)}</>} summary={<div className="mobile-ability-summary">{passive && <span>被动 · {passive.name}</span>}{selected.skills.map(id => <span key={id}>{getSkill(id).name} {skillBrief(getSkill(id))}</span>)}</div>}><div className="starter-select-abilities">
            {passive && <div className="starter-select-ability"><span className="starter-ability-icon passive" aria-hidden="true"><UiSymbol name="sparkle" /></span><strong>{passive.name}</strong><span>{passive.desc}</span></div>}
            {selected.skills.map((id) => {
              const skill = getSkill(id);
              return <div key={id} className="starter-select-ability"><span className="starter-ability-icon" aria-hidden="true"><UiSymbol name="marker-info" /></span><strong>{skill.name}</strong><span>{skill.desc}{skill.damage ? ` · ${skill.damage}${skill.hits ? `×${skill.hits}` : ''}` : skill.heal ? ` · 治疗 ${skill.heal}` : ''}</span></div>;
            })}
          </div></MobileDetails>
          <button className="starter-select-confirm" onClick={confirm}>选择{selected.name}<UiSymbol name="play" /></button>
          <p className="starter-select-note">{isCompanion ? `已选主力：${getMonster(firstPick).name} ×2 · 再选一只同伴` : '可在图鉴查看进化'}</p>
        </aside>
      </main>
    </div>
  );
}

export function ProficiencyStarterScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) => setSelected((prev) =>
    prev.includes(id) ? prev.filter((value) => value !== id) : prev.length < 2 ? [...prev, id] : prev
  );

  return (
    <div className="starter-screen starter-observatory">
      <header className="starter-header">
        <div className="starter-heading"><span className="starter-mark" aria-hidden="true"><UiSymbol name="sparkle" /></span><div>
          <h1>熟练度远征</h1><p>从六只生物中选择两只，开启 50 层远征</p>
        </div></div>
        <button className="starter-back" onClick={() => dispatch({ type: 'TITLE' })}><UiSymbol name="arrow-left" /> 返回首页</button>
      </header>
      <main className="starter-proficiency-main">
        <div className="starter-choice-grid proficiency">
          {BASE_POOL.map((id) => <StarterChoiceCard key={id} id={id} compact selected={selected.includes(id)}
            order={selected.indexOf(id) + 1 || undefined} onClick={() => toggle(id)} />)}
        </div>
        <aside className="starter-summary">
          <h2>已选 <span>{selected.length}/2</span></h2>
          <div className="starter-selected-list">
            {[0, 1].map((index) => {
              const id = selected[index];
              return <div key={index} className={`starter-selected-slot ${id ? 'filled' : ''}`}>
                <span className="starter-selected-number">{index + 1}</span>
                {id ? <><img src={getMonster(id).image} alt="" /><strong>{getMonster(id).name}</strong></> : <span>选择伙伴</span>}
              </div>;
            })}
          </div>
          <p>点击卡片选择或取消</p>
          <div className="starter-milestones" aria-label="远征里程碑：15 层、30 层、50 层">
            <span>15 层</span><span>30 层</span><span>50 层</span>
          </div>
          <button className="starter-confirm" disabled={selected.length !== 2} onClick={() => {
            dispatch({ type: 'START_PROFICIENCY_PICKED', seed: state.seed ?? Date.now(), saveSlot: state.saveSlot,
              starterId: selected[0], companionId: selected[1] });
          }}>出发远征</button>
        </aside>
      </main>
    </div>
  );
}

const MAP_KNOWN_HINTS: Record<MapNode['type'], string> = {
  battle: '常规战斗，胜利后可获得奖励。',
  elite: '高风险战斗，对手更强。',
  rest: '恢复队伍状态，整备下一段旅程。',
  shop: '可以购买补给；具体货物需侦查。',
  event: '未知事件；具体选项需侦查。',
  special: '稀有奇遇；具体奖励需侦查。',
  boss: '幕末首领，击败后完成当前幕。',
  arena: '单宠高风险挑战；失败将承受惩罚。',
  gauntlet: '连续战斗；失败将承受惩罚。',
  corrupted: '带有侵蚀效果的战斗。',
  watchtower: '可瞭望其他地点的情报。',
  sync: '双生宝箱二选一；持双生符可同时开启。',
  guardian: '击败守卫可获得对应钥匙。',
  keydoor: '需要击败对应守卫，取得钥匙。',
  blacksmith: '为宠物强化技能效果。',
  arena3: '从三种竞技场模式中选择一项。',
};

export function MapScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  useBackAction(!!(state.scoutSelecting || state.skipSelecting), () => dispatch({ type: state.scoutSelecting ? 'CANCEL_SCOUT' : 'CANCEL_SKIP' }));
  const isProficiency = state.runMode === 'proficiency';
  const isFirst = state.currentNodeId === '';
  const optionsRow = isFirst ? state.currentRow : state.currentRow + 1;
  const currentCol = isFirst
    ? null
    : (state.map.layers[state.currentRow]?.find((n) => n.id === state.currentNodeId)?.col ?? null);
  const isDisabled = (n: MapNode) => state.map.disabled?.[n.id] === true;
  const isLocked = (n: MapNode) => (n.type === 'keydoor' && (n.guardianId ? (state.inventory[`key_${n.guardianId}`] ?? 0) > 0 : false) === false);
  const canSelect = (n: MapNode) =>
    (lockedNodeId == null || n.id === lockedNodeId) && !isDisabled(n) && !isLocked(n) && canStepTo(state.currentRow, currentCol, n, state.map);

  // 路线预览：默认显示当前节点 → 下一步可达；悬停某节点时显示该节点的下一步可达
  const nextRow = state.map.layers[optionsRow] ?? EMPTY_ROW;
  const visitedInOptions = useMemo(
    () => nextRow.filter((n) => (state.visitedNodeIds ?? []).includes(n.id)),
    [nextRow, state.visitedNodeIds],
  );
  const lockedNodeId = visitedInOptions.length > 0 ? visitedInOptions[0].id : null;
  const nearIds = useMemo(
    () =>
      new Set(
        nextRow
          .filter((n) => !isDisabled(n) && !isLocked(n) && canStepTo(state.currentRow, currentCol, n, state.map))
          .filter((n) => lockedNodeId == null || n.id === lockedNodeId)
          .map((n) => n.id),
      ),
    [nextRow, state.currentRow, currentCol, lockedNodeId, state.map, state.inventory],
  );
  const [hoverId, setHoverId] = useState<string | null>(null);
  const hoverRow = hoverId ? state.map.layers.findIndex((r) => r.some((n) => n.id === hoverId)) : -1;
  const hoverNode = hoverId && hoverRow >= 0 ? state.map.layers[hoverRow].find((n) => n.id === hoverId) : undefined;
  const hoverNextRow =
    hoverNode && hoverRow + 1 < state.map.layers.length ? state.map.layers[hoverRow + 1] : EMPTY_ROW;
  const hoverReachIds = useMemo(
    () =>
      hoverNode
        ? new Set(hoverNextRow.filter((m) => !isDisabled(m) && !isLocked(m) && canStepTo(hoverRow, hoverNode.col, m, state.map)).map((m) => m.id))
        : new Set<string>(),
    [hoverNode, hoverRow, hoverNextRow, state.map, state.inventory],
  );

  const canvasRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const nodeEls = useRef<Record<string, HTMLButtonElement | null>>({});
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 });
  const [lines, setLines] = useState<{ from: string; to: string; x1: number; y1: number; x2: number; y2: number; kind: 'base' | 'near' | 'far' | 'path' }[]>([]);
  const routeEdges = useMemo(() => getMapRouteEdges(state.map, state.visitedNodeIds), [state.map, state.visitedNodeIds]);
  const routeKey = (from: string, to: string) => `${from}->${to}`;
  const visitedIds = state.visitedNodeIds ?? [];
  const visitedPairs = new Set(visitedIds.slice(1).map((id, index) => routeKey(visitedIds[index], id)));

  const infoNode = hoverNode ?? nextRow.find((n) => canSelect(n)) ?? state.map.layers[state.currentRow]?.find((n) => n.id === state.currentNodeId);
  const infoRow = infoNode ? state.map.layers.findIndex((row) => row.some((n) => n.id === infoNode.id)) : -1;
  let infoStatus = '选择路线';
  if (infoNode) {
    if (isDisabled(infoNode)) infoStatus = '已失效';
    else if (isLocked(infoNode)) infoStatus = '需要钥匙';
    else if (infoNode.id === state.currentNodeId) infoStatus = '当前位置';
    else if (infoRow === optionsRow && canSelect(infoNode)) infoStatus = '可进入';
    else if (infoRow < optionsRow) infoStatus = visitedIds.includes(infoNode.id) ? '已走过' : '错过的分支';
    else infoStatus = '尚不可达';
  }

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => {
      const w = track.scrollWidth;
      const h = track.scrollHeight;
      setSvgSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(track);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const center = (id: string): { x: number; y: number } | null => {
      const el = nodeEls.current[id];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left - rect.left + r.width / 2, y: r.top - rect.top + r.height / 2 };
    };
    const result: typeof lines = [];
    for (const edge of routeEdges) {
      const a = center(edge.from);
      const b = center(edge.to);
      if (!a || !b) continue;
      const key = routeKey(edge.from, edge.to);
      const kind = visitedPairs.has(key) ? 'path'
        : !isFirst && edge.from === state.currentNodeId && nearIds.has(edge.to) ? 'near'
        : hoverNode && edge.from === hoverNode.id && hoverReachIds.has(edge.to) ? 'far'
        : 'base';
      result.push({ ...edge, x1: a.x, y1: a.y, x2: b.x, y2: b.y, kind });
    }
    setLines(result);
  }, [isFirst, state.currentNodeId, nearIds, hoverNode, hoverReachIds, svgSize, routeEdges, state.visitedNodeIds]);

  // 每次进入地图，滚动定位到当前所在节点（居中）
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const el = state.currentNodeId ? nodeEls.current[state.currentNodeId] : null;
    if (!el) return;
    const rect = canvas.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const targetTop = canvas.scrollTop + r.top - rect.top - (rect.height - r.height) / 2;
    const targetLeft = canvas.scrollLeft + r.left - rect.left - (rect.width - r.width) / 2;
    canvas.scrollTop = Math.max(0, targetTop);
    canvas.scrollLeft = Math.max(0, targetLeft);
  }, [state.currentNodeId]);

  return (
    <div className={`screen map-screen ${isProficiency ? 'map-proficiency' : `map-act-${state.act}`}`}>
      <HUD state={state} dispatch={dispatch} />
      {state.scoutSelecting && (
        <div className="panel-row" style={{ justifyContent: 'center', marginBottom: 8 }}>
          <span className="chip" style={{ fontSize: 13 }}>
            🔍 侦查模式：点击任意节点查看情报（消耗 1 个侦查符，持有 {state.inventory.scout ?? 0} 个）
          </span>
          <button onClick={() => dispatch({ type: 'CANCEL_SCOUT' })}><UiSymbol name="close" /> 取消</button>
        </div>
      )}
      {state.skipSelecting && (
        <div className="panel-row" style={{ justifyContent: 'center', marginBottom: 8 }}>
          <span className="chip" style={{ fontSize: 13 }}>
            🪜 跳关模式：点击可达的战斗类节点，直接获得其奖励（消耗 1 个跳关道具，持有 {state.inventory.skip ?? 0} 个）
          </span>
          <button onClick={() => dispatch({ type: 'CANCEL_SKIP' })}><UiSymbol name="close" /> 取消</button>
        </div>
      )}
      <div className="map-layout">
        <div className="map-canvas" ref={canvasRef}>
          <div className="map-track" ref={trackRef}>
            <svg className="map-lines" width={svgSize.w} height={svgSize.h} aria-hidden="true">
              {lines.map((l, i) => (
                <line
                  key={i}
                  className={`ln-${l.kind}`}
                  data-from={l.from}
                  data-to={l.to}
                  data-route-kind={l.kind}
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
                />
              ))}
            </svg>
            {state.map.layers.map((row, ri) => {
          const isOptionRow = ri === optionsRow;
          const isPast = ri < optionsRow;
          return (
            <div className={`map-row ${isProficiency ? 'map-row-proficiency' : ''}`} key={ri}>
              <span className={`map-row-index ${isProficiency && [14, 29, 49].includes(ri) ? 'milestone' : ''}`}>第{ri + 1}层</span>
              {row.map((n) => {
                const isCurrent = n.id === state.currentNodeId;
                const isVisited = (state.visitedNodeIds ?? []).includes(n.id);
                const scoutable = state.scoutSelecting === true && !isDisabled(n);
                const selectable = isOptionRow && canSelect(n);
                const skipable =
                  state.skipSelecting === true &&
                  selectable &&
                  (n.type === 'battle' ||
                    n.type === 'elite' ||
                    n.type === 'arena' ||
                    n.type === 'gauntlet' ||
                    n.type === 'corrupted');
                const reachCls = isCurrent ? '' : nearIds.has(n.id) ? 'reach-1' : hoverReachIds.has(n.id) ? 'reach-2' : '';
                const visitedWatchtowers = state.visitedWatchtowers ?? [];
                const isVisitedWatchtower = n.type === 'watchtower' && visitedWatchtowers.includes(n.id);
                const cls = [
                  isCurrent ? 'current' : isOptionRow ? (selectable ? 'option' : 'dim') : isPast && isVisited ? 'visited' : 'dim',
                  reachCls,
                  isDisabled(n) && !isVisited && !isCurrent ? 'node-off' : '',
                  isLocked(n) ? 'node-locked' : '',
                  isVisitedWatchtower ? 'visited-watchtower' : '',
                  scoutable ? 'node-scoutable' : '',
                  skipable ? 'node-skipable' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                const nodeHint =
                  n.type === 'keydoor'
                    ? isLocked(n)
                      ? '钥匙门：需先击败对应守卫取得钥匙'
                      : '持有钥匙，可开启高级宝箱'
                    : n.type === 'sync'
                    ? '双生宝箱：与配对宝箱二选一（持双生符可同时开启）'
                    : n.type === 'guardian'
                    ? '守卫：强力怪物，击败获得专用钥匙'
                    : undefined;
                const watchtowerAction = n.type === 'watchtower' && (isCurrent || (isVisitedWatchtower && isPast));
                const actionable = skipable || scoutable || selectable || watchtowerAction;
                return (
                  <button
                    type="button"
                    key={n.id}
                    ref={(el) => {
                      nodeEls.current[n.id] = el;
                    }}
                    className={`node ${cls}`}
                    data-node-id={n.id}
                    data-type={n.type}
                    aria-label={`第${ri + 1}层 ${n.label}${isLocked(n) ? '，需要钥匙' : ''}`}
                    aria-disabled={!actionable}
                    tabIndex={actionable ? 0 : -1}
                    title={nodeHint}
                    onMouseEnter={() => setHoverId(n.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onFocus={() => setHoverId(n.id)}
                    onBlur={() => setHoverId(null)}
                    onClick={
                      skipable
                        ? () => dispatch({ type: 'USE_SKIP', nodeId: n.id })
                        : scoutable
                          ? () => dispatch({ type: 'USE_SCOUT', nodeId: n.id })
                          : selectable
                            ? () => dispatch({ type: 'MOVE', nodeId: n.id })
                            : isCurrent && n.type === 'watchtower'
                              ? () => dispatch({ type: 'OPEN_WATCHTOWER' })
                              : isVisitedWatchtower && isPast
                                ? () => dispatch({ type: 'OPEN_WATCHTOWER', nodeId: n.id })
                                : undefined
                    }
                  >
                    {isCurrent && <img className="map-current-flag" src="/map-hud-icons/flag.png" alt="" aria-hidden="true" draggable={false} />}
                    <span className="nicon"><MapNodeIcon type={n.type} /></span>
                    <span className="nlabel">{n.label}</span>
                  </button>
                );
              })}
            </div>
          );
            })}
          </div>
        </div>
        <aside className="map-info" aria-live="polite">
          {infoNode ? (
            <>
              <div className="map-info-summary">
                <div className="map-info-icon" data-type={infoNode.type}><MapNodeIcon type={infoNode.type} /></div>
                <div className="map-info-name">{infoNode.label}</div>
                <div className={`map-info-status ${infoStatus === '可进入' ? 'available' : ''}`}>{infoStatus}</div>
              </div>
              <p>{infoNode.type === 'gauntlet' ? `共${infoNode.gauntletSize ?? 2}轮，失败将承受惩罚。` : MAP_KNOWN_HINTS[infoNode.type]}</p>
            </>
          ) : <><div className="map-info-name">暂无关卡</div><p>选择下一处地点继续远征。</p></>}
        </aside>
      </div>
      {state.scoutResult && (
        <div className="confirm-overlay" onClick={() => dispatch({ type: 'CANCEL_SCOUT' })}>
          <div className="confirm-box scout-popup" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">侦查结果</div>
            <div className="scout-result">
              <div className="ricon"><MapNodeIcon type={state.map.layers.flat().find((n) => n.id === state.scoutResult!.nodeId)?.type ?? 'battle'} /></div>
              <div className="rtitle">{state.scoutResult.title}</div>
              <div className="rdesc">{state.scoutResult.detail}</div>
            </div>
            <div className="panel-row" style={{ justifyContent: 'center' }}>
              <button className="primary" onClick={() => dispatch({ type: 'CANCEL_SCOUT' })}>
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="map-footer">
        <span>从上到下选择路线；同层节点不可横向移动。</span>
        <span className="route-legend">
          <span className="legend-path" /> 已走路线
          <span className="legend-near" /> 下一步可达
          <span className="legend-far" /> 后续路线预览
        </span>
      </div>
    </div>
  );
}

export function RewardScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const pending = state.rewards.find((reward) => reward.id === state.pendingRecruitRewardId);
  const candidates = useMemo(() => (pending?.recruitCandidates ?? []).map((id) => makeUnit(id, true, 0, false)), [pending]);
  const currentNode = state.map.layers[state.currentRow]?.find((node) => node.id === state.currentNodeId);
  const skipped = state.log[0]?.startsWith('使用跳关道具');
  return (
    <div className={`reward-screen${pending ? ' recruit-screen' : ''}`}>
      <header className="reward-header">
        <div className="reward-heading"><img className="reward-swords" src="/page-special-icons/victory-swords.png" alt="" draggable={false} /><h1>{skipped ? '跳关奖励' : '战斗胜利'}</h1></div>
        <div className="reward-header-info">
          <span className="reward-location">{currentNode?.label ?? '远征战斗'} · 第 {state.act} 幕</span>
          <span className="reward-gold"><img src="/reward-icons/gold.png" alt="" />金币 <strong>{state.gold}</strong></span>
        </div>
      </header>
      <main className="reward-content">
        <section className={`reward-choice-panel${pending ? ' recruit-choice-panel' : ''}`} aria-labelledby="reward-choice-title">
          <div className="reward-panel-heading"><div>{pending && <img className="recruit-heading-paw" src="/starter-growth-icons/starter-paw.png" alt="" />}<h2 id="reward-choice-title">{pending ? '招募伙伴' : '选择一份战利品'}</h2>{pending && <p className="recruit-subtitle">选择一位伙伴加入队伍</p>}</div></div>
          {pending ? <div className="recruit-candidate-list">
            {candidates.map((unit) => {
              const passive = getPassive(unit.passive);
              return <section className="recruit-candidate" key={unit.speciesId} aria-label={`${unit.name}候选详情`}>
                <div className="recruit-overview">
                  <div className="recruit-portrait"><PetIcon image={formationImage(unit.speciesId, unit.image)} emoji={unit.emoji} name={unit.name} /></div>
                  <div className="recruit-identity"><h3>{unit.name}</h3><div className="recruit-stats"><span><img src="/battle-stat-icons/life.png" alt="" />生命 <strong>{unit.hp}/{unit.maxHp}</strong></span><span><img src="/battle-stat-icons/speed.png" alt="" />速度 <strong>{unit.spd}</strong></span></div></div>
                </div>
                <div className="recruit-detail-section"><h4>被动</h4><div className="recruit-passive"><strong>{passive?.name ?? '无'}</strong>{passive && <p>{passive.desc}</p>}</div></div>
                <div className="recruit-detail-section recruit-skills"><h4>技能</h4><div className="recruit-skill-list">{unit.skills.map((skillId) => <SkillTag key={skillId} skill={getSkill(skillId)} />)}</div></div>
                <button type="button" className="recruit-confirm" aria-label={`确认招募 ${unit.name}`} onClick={() => dispatch({ type: 'PICK_REWARD', rewardId: pending.id, monsterId: unit.speciesId })}>确认招募</button>
              </section>;
            })}
          </div> :
          <div className="reward-choice-list" style={{ gridTemplateColumns: `repeat(${Math.max(1, state.rewards.length)}, minmax(0, 1fr))` }}>
            {state.rewards.map((reward) => {
              return <button key={reward.id} type="button" className={`reward-choice reward-choice-${reward.kind}`} aria-label={`领取：${reward.label}，${reward.desc}`} onClick={() => dispatch({ type: 'PICK_REWARD', rewardId: reward.id })}>
                <span className={`reward-choice-icon reward-choice-icon-${reward.kind}`} aria-hidden="true">
                  <img src={reward.kind === 'recruit' ? '/starter-growth-icons/starter-paw.png' : `/reward-icons/${reward.kind}.png`} alt="" draggable={false} />
                </span>
                <span className="reward-choice-copy"><strong>{reward.label}</strong><small>{reward.desc}</small></span>
                <span className="reward-claim">领取</span>
              </button>;
            })}
          </div>}
          {!pending && <div className="reward-panel-footer"><span className="reward-footer-sigil" aria-hidden="true"><UiSymbol name="sparkle" /></span><span>选择后进入战后休整</span><span className="reward-footer-sigil" aria-hidden="true"><UiSymbol name="sparkle" /></span></div>}
        </section>
      </main>
    </div>
  );
}

function RosterScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const toggleField = (uid: string) => {
    // 战斗胜利后禁止选择出战
    if (state.postBattle) return;
    const inField = state.field.includes(uid);
    if (inField) {
      dispatch({ type: 'SET_FIELD', uids: state.field.filter((u) => u !== uid) });
    } else {
      const isBoss = !!state.map.boss[state.currentNodeId];
      const enemyCount = state.formation?.encounter?.length ?? 1;
      const maxField = isBoss ? (state.runMode === 'proficiency' ? PROF_FIELD_MAX : FIELD_MAX) : maxFieldForEnemy(enemyCount, state.runMode);
      if (state.field.length < maxField) {
        dispatch({ type: 'SET_FIELD', uids: [...state.field, uid] });
      }
    }
  };

  const pending = state.specialPending;
  const evolveMode = pending?.kind === 'evolve';
  const boostMode = pending?.kind === 'boost';
  const arenaMode = pending?.kind === 'arena';
  const growthPointMode = pending?.kind === 'growthPoint';
  const shopSlotUnlockMode = pending?.kind === 'shopSlotUnlock';
  const eventBoostMode = pending?.kind === 'eventBoostHp' || pending?.kind === 'eventBoostSpd';
  const eventResetGrowthMode = pending?.kind === 'eventResetGrowth';
  const eventSkillReplaceMode = pending?.kind === 'eventSkillReplace';
  const arena3ExhibitionMode = pending?.kind === 'arena3Exhibition';
  const [confirm, setConfirm] = useState<PetConfirm>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  if (state.postBattle) return <PostBattleRosterScreen state={state} dispatch={dispatch} />;
  if (evolveMode || boostMode) return <ProgressionChoiceScreen state={state} dispatch={dispatch} />;
  if (pending && ['arena', 'growthPoint', 'shopSlotUnlock', 'eventBoostHp', 'eventBoostSpd', 'eventResetGrowth', 'eventSkillReplace', 'arena3Exhibition'].includes(pending.kind)) return <SpecialTargetScreen state={state} dispatch={dispatch} />;
  if (!pending) return <OrdinaryRosterScreen state={state} dispatch={dispatch} toggleField={toggleField} />;
  const title = growthPointMode
        ? `选择一只宠物获得 ${pending.amount ?? 1} 成长点`
        : eventBoostMode
          ? `选择一只宠物永久 +${pending.amount ?? 1} ${pending.kind === 'eventBoostSpd' ? '速度' : '生命'}`
          : eventResetGrowthMode
            ? '选择一只宠物重置其成长点'
            : eventSkillReplaceMode
              ? '选择一只宠物替换技能'
              : shopSlotUnlockMode
                ? `选择一只宠物解锁第${pending.slot === 4 ? '5' : '4'}技能槽`
                : arenaMode
                  ? '斗兽场：选择 1 只宠物出战（1v1 单挑，胜利得丰厚奖励）'
                  : arena3ExhibitionMode
                    ? '表演赛：选择 1 只宠物获得 5 成长点'
                    : state.postBattle
              ? '战后休整（只能释放或融合宠物）'
              : `队伍管理（上限 ${getMaxRoster(state.runMode)} 只）`;

  return (
    <div className="screen">
      <HUD state={state} dispatch={dispatch} />
      <div className="section-title">{title}</div>
      {!evolveMode && !boostMode && !growthPointMode && !shopSlotUnlockMode && !arenaMode && !arena3ExhibitionMode && !state.postBattle && (
        <div className="panel-row" style={{ marginBottom: 10 }}>
          <span className="card-sub">出战宠物（点击下方宠物卡加入/移除）：</span>
          {state.field.map((uid) => {
            const u = state.roster.find((x) => x.uid === uid);
            return u ? <span className="chip" key={uid}><PetIcon image={u.image} emoji={u.emoji} name={u.name} /> {u.name}</span> : null;
          })}
        </div>
      )}
      <div className="roster-list">
        {state.roster.map((u) => {
          const canEvolve = nextStage(u.speciesId) !== undefined;
          const onCard = evolveMode
            ? canEvolve
              ? () => dispatch({ type: 'EVOLVE_ONE', uid: u.uid })
              : undefined
            : boostMode || growthPointMode || shopSlotUnlockMode || eventBoostMode || eventResetGrowthMode || eventSkillReplaceMode
              ? () => dispatch({ type: 'SPECIAL_TARGET', uid: u.uid })
              : arenaMode
                ? () => dispatch({ type: 'SPECIAL_TARGET', uid: u.uid })
                : arena3ExhibitionMode
                  ? () => dispatch({ type: 'SPECIAL_TARGET', uid: u.uid })
                  : state.postBattle
                  ? () => setSelectedUid(selectedUid === u.uid ? null : u.uid)
                  : () => toggleField(u.uid);
          const isPostBattleSelected = state.postBattle && selectedUid === u.uid;
          return (
        <div key={u.uid} className="roster-item">
          <UnitCard
            unit={u}
            className={`roster-card ${(evolveMode && canEvolve) || boostMode || growthPointMode || eventBoostMode || eventResetGrowthMode || eventSkillReplaceMode || arenaMode || state.postBattle ? 'clickable' : ''} ${isPostBattleSelected ? 'selected' : ''}`}
            onClick={onCard}
            showSkillDesc
            topStats
            footer={
              !evolveMode && !boostMode && !growthPointMode && !eventBoostMode && !eventResetGrowthMode && !eventSkillReplaceMode && !arenaMode ? <PetCardFooter unit={u} state={state} setConfirm={setConfirm} /> : undefined
            }
          />
              <div className="roster-actions">
                <div className="panel-row" style={{ justifyContent: 'center' }}>
                  {u.curse && (
                    <span className="chip" title="负面诅咒，可用净化药水解除">
                      <BuffIcon art={CURSE_ART[u.curse]} /> {CURSE_CN[u.curse]}
                    </span>
                  )}
                  {u.bonusStats && (u.bonusStats.hp || u.bonusStats.spd) && (
                    <span className="chip" title="来自奇遇关的属性强化">
                      ✨+{(u.bonusStats.hp ?? 0) ? `血${u.bonusStats.hp}` : ''}
                      {(u.bonusStats.spd ?? 0) ? `速${u.bonusStats.spd}` : ''}
                    </span>
                  )}
                </div>
                {u.curse && (state.inventory.purify ?? 0) > 0 && (
                  <button onClick={() => dispatch({ type: 'USE_PURIFY', uid: u.uid })}>
                    🧪 净化（{state.inventory.purify}）
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!evolveMode && !boostMode && !growthPointMode && !eventBoostMode && !eventResetGrowthMode && !eventSkillReplaceMode && !arenaMode && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
          <button className="primary big-btn" onClick={() => dispatch({ type: 'NEXT_NODE' })}>
            继续前进 <UiSymbol name="arrow-right" />
          </button>
        </div>
      )}
      {confirm && (
        <FuseDiscardConfirm confirm={confirm} state={state} dispatch={dispatch} setConfirm={setConfirm} />
      )}
    </div>
  );
}

function OrdinaryRosterScreen({ state, dispatch, toggleField }: { state: GameState; dispatch: Dispatch<GameAction>; toggleField: (uid: string) => void }) {
  const [focusedUid, setFocusedUid] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PetConfirm>(null);
  const focused = state.roster.find(unit => unit.uid === focusedUid) ?? state.roster[0];
  const passive = focused ? getPassive(focused.passive) : undefined;
  const fieldMax = state.map.boss[state.currentNodeId]
    ? (state.runMode === 'proficiency' ? PROF_FIELD_MAX : FIELD_MAX)
    : maxFieldForEnemy(state.formation?.encounter?.length ?? 1, state.runMode);
  return <div className="flow-screen ordinary-roster-screen">
    <FlowHeader title={`队伍管理 · ${state.roster.length}/${getMaxRoster(state.runMode)}`} state={state} fieldMax={fieldMax} onHome={() => { void persistSave(state); dispatch({ type: 'TITLE' }); }} />
    <main className="ordinary-roster-layout">
      <section className="flow-frame ordinary-roster-panel">
        <div className="ordinary-roster-heading"><h2>队伍伙伴</h2><span>点击伙伴切换出战</span></div>
        <div className="ordinary-roster-grid">{Array.from({ length: getMaxRoster(state.runMode) }, (_, index) => {
          const unit = state.roster[index];
          if (!unit) return <div className="flow-roster-empty" key={`empty-${index}`}>空位</div>;
          const deployed = state.field.includes(unit.uid);
          return <button type="button" key={unit.uid} className={`ordinary-roster-tile ${focused?.uid === unit.uid ? 'is-focused' : ''}`} aria-pressed={deployed}
            aria-label={`${unit.name}，${deployed ? '已出战，点击下阵' : '待命，点击出战'}`}
            onMouseEnter={() => setFocusedUid(unit.uid)} onFocus={() => setFocusedUid(unit.uid)} onClick={() => { setFocusedUid(unit.uid); toggleField(unit.uid); }}>
            <span className={`ordinary-roster-badge ${deployed ? 'is-deployed' : ''}`}>{deployed ? '已出战' : '待命'}</span>
            <FlowPet unit={unit} /><strong>{unit.name}</strong><FlowPetStats unit={unit} />
          </button>;
        })}</div>
      </section>
      <section className="flow-frame ordinary-roster-detail">
        <h2>伙伴详情</h2>
        {focused ? <>
          <div className="ordinary-roster-profile"><FlowPet unit={focused} /><div><h3>{focused.name}</h3><span className="ordinary-detail-state">{state.field.includes(focused.uid) ? '已出战' : '待命'}</span><FlowPetStats unit={focused} /></div></div>
          <MobileDetails label={`${focused.name}技能与被动`} summary={focused.curse && <span>诅咒：{CURSE_CN[focused.curse]}</span>} details={<><MobileUnitAbilities unit={focused} /><p>诅咒：{focused.curse ? CURSE_CN[focused.curse] : '无'}</p>{focused.bonusStats && <p>属性强化：生命 +{focused.bonusStats.hp ?? 0} · 速度 +{focused.bonusStats.spd ?? 0}</p>}</>}><div className="ordinary-roster-info">
            {passive && <section className="flow-passive"><b>被动 · {passive.name}</b><p>{passive.desc}</p></section>}
            <section><h3>技能</h3><div className="flow-skill-chips">{focused.skills.map(id => <span key={id} title={getSkill(id).desc}>{getSkill(id).name}</span>)}</div></section>
            <section><h3>诅咒</h3><div className="ordinary-curse">{focused.curse ? <><BuffIcon art={CURSE_ART[focused.curse]} />{CURSE_CN[focused.curse]}</> : '无诅咒'}</div></section>
            {focused.bonusStats && (focused.bonusStats.hp || focused.bonusStats.spd) ? <p className="ordinary-bonus">属性强化：{focused.bonusStats.hp ? `生命 +${focused.bonusStats.hp} ` : ''}{focused.bonusStats.spd ? `速度 +${focused.bonusStats.spd}` : ''}</p> : null}
          </div></MobileDetails>
          <footer className="ordinary-detail-actions"><PetCardFooter unit={focused} state={state} setConfirm={setConfirm} />
            <button type="button" className="flow-positive" disabled={!focused.curse || (state.inventory.purify ?? 0) <= 0} onClick={() => dispatch({ type: 'USE_PURIFY', uid: focused.uid })}>净化（{state.inventory.purify ?? 0}）</button>
          </footer>
        </> : <p>队伍中暂无伙伴</p>}
      </section>
    </main>
    <footer className="flow-frame remaining-footer"><span>已出战 {state.field.length}/{fieldMax}</span><button type="button" className="flow-primary" onClick={() => dispatch({ type: 'NEXT_NODE' })}>继续前进 <UiSymbol name="arrow-right" /></button></footer>
    {confirm && <FuseDiscardConfirm confirm={confirm} state={state} dispatch={dispatch} setConfirm={setConfirm} />}
  </div>;
}

export function PostBattleRosterScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PetConfirm>(null);
  const focused = state.roster.find((u) => u.uid === selectedUid) ?? state.roster[0];
  const stage = focused ? nextStage(focused.speciesId) : undefined;
  const lockReason = focused ? evolutionLockReason(state, focused.speciesId) : undefined;
  const need = stage ? fusionNeedCount(focused.speciesId) : 0;
  const sameCount = focused ? state.roster.filter((u) => u.speciesId === focused.speciesId).length : 0;
  const canFuse = !!stage && !lockReason && sameCount >= need;
  const passive = focused ? getPassive(focused.passive) : undefined;
  const isProf = state.runMode === 'proficiency';

  return <div className="postbattle-screen">
    <header className="postbattle-header">
      <div className="postbattle-heading"><span className="postbattle-camp-icon" aria-hidden="true"><MapNodeIcon type="rest" /></span><h1>战后休整</h1></div>
      <div className="postbattle-header-actions">
        <span>队伍 {state.roster.length}/{getMaxRoster(state.runMode)}</span>
        <button type="button" onClick={() => { void persistSave(state); dispatch({ type: 'TITLE' }); }}>返回首页</button>
      </div>
    </header>
    <main className="postbattle-layout">
      <section className="postbattle-roster-panel" aria-label="存活伙伴">
        <div className="postbattle-roster-heading"><h2>存活伙伴</h2><span className="postbattle-result">奖励已领取</span></div>
        <div className="postbattle-roster-grid">
          {Array.from({ length: getMaxRoster(state.runMode) }, (_, index) => {
            const u = state.roster[index];
            if (!u) return <div key={`empty-${index}`} className="postbattle-empty"><img src={homePawIcon} alt="" /><small>空位</small></div>;
            const image = formationImage(u.speciesId, u.image);
            return <button key={u.uid} type="button" className={`postbattle-pet ${focused?.uid === u.uid ? 'selected' : ''}`}
              aria-label={`查看${u.name}，生命${u.hp}/${u.maxHp}，速度${u.spd}`}
              aria-pressed={focused?.uid === u.uid}
              onClick={() => setSelectedUid(u.uid)} onFocus={() => setSelectedUid(u.uid)}>
              <span className="postbattle-pet-portrait">{image ? <BattlePixelSprite src={image} name={u.name} /> : <PixelCreature unit={u} />}</span>
              <strong>{u.name}</strong>
              <span className="postbattle-pet-stats"><span><i className="starter-stat-icon starter-stat-heart" aria-hidden="true" />{u.hp}/{u.maxHp}</span><span><i className="starter-stat-icon starter-stat-speed" aria-hidden="true" />{u.spd}</span></span>
            </button>;
          })}
        </div>
      </section>
      <aside className="postbattle-detail" aria-label="伙伴详情">
        {focused ? <>
          <div className="postbattle-detail-body">
          <div className="postbattle-detail-heading"><h2>{focused.name}</h2><span>{focused.hp < focused.maxHp ? '生命未满' : '状态良好'}</span></div>
          <div className="postbattle-detail-portrait">{formationImage(focused.speciesId, focused.image) ? <BattlePixelSprite src={formationImage(focused.speciesId, focused.image)!} name={focused.name} /> : <PixelCreature unit={focused} />}</div>
          <div className="postbattle-detail-stats"><span><i className="starter-stat-icon starter-stat-heart" aria-hidden="true" />{focused.hp}/{focused.maxHp}</span><span><i className="starter-stat-icon starter-stat-speed" aria-hidden="true" />{focused.spd}</span></div>
          {focused.curse && <p className="postbattle-curse"><BuffIcon art={CURSE_ART[focused.curse]} /> {CURSE_CN[focused.curse]}</p>}
          {focused.bonusStats && (focused.bonusStats.hp || focused.bonusStats.spd) &&
            <p className="postbattle-bonus">属性强化：生命 +{focused.bonusStats.hp ?? 0} · 速度 +{focused.bonusStats.spd ?? 0}</p>}
          <MobileDetails label={`${focused.name}技能与被动`} details={<><MobileUnitAbilities unit={focused} />{focused.bonusStats && <p>属性强化：生命 +{focused.bonusStats.hp ?? 0} · 速度 +{focused.bonusStats.spd ?? 0}</p>}</>}><div className="postbattle-passive"><strong>被动 · {passive?.name ?? '无'}</strong><p>{passive?.desc ?? '暂无被动效果'}</p></div>
          <div className="postbattle-skills"><h3>技能</h3><div>{focused.skills.map((sid, index) => {
            const skill = getSkill(sid);
            return <span key={`${sid}-${index}`} title={skill.desc}>{skill.name}</span>;
          })}</div></div></MobileDetails>
          </div>
          <div className="postbattle-detail-actions">
            {!isProf && <><p>融合条件：{lockReason ?? (stage ? `同物种 ${sameCount} / ${need}` : '已是最终形态')}</p>
              <button type="button" disabled={!!lockReason} title={lockReason} className={`postbattle-fuse ${canFuse ? '' : 'unavailable'}`} onClick={() => {
                if (!stage) setConfirm({ kind: 'notice', msg: '该宠物已是最终形态，无法融合' });
                else if (!canFuse) setConfirm({ kind: 'notice', msg: `同物种不足（${sameCount}/${need}），无法融合` });
                else setConfirm({ kind: 'fuse', uid: focused.uid });
              }}>融合进化</button></>}
            <button type="button" className="postbattle-release" onClick={() => setConfirm({ kind: 'discard', uid: focused.uid })}>释放</button>
            {focused.curse && (state.inventory.purify ?? 0) > 0 &&
              <button type="button" className="postbattle-purify" onClick={() => dispatch({ type: 'USE_PURIFY', uid: focused.uid })}>净化（{state.inventory.purify}）</button>}
          </div>
        </> : <p className="postbattle-no-pets">没有存活伙伴。</p>}
        <button type="button" className="postbattle-continue" onClick={() => dispatch({ type: 'NEXT_NODE' })}>继续前进 <UiSymbol name="arrow-right" /></button>
      </aside>
    </main>
    {confirm && <FuseDiscardConfirm confirm={confirm} state={state} dispatch={dispatch} setConfirm={setConfirm} />}
  </div>;
}

export function ShopScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const boughtItems = state.shopBoughtItems ?? [];
  const isProf = state.runMode === 'proficiency';
  const profShopIds = ['heal_potion', 'gold_bag', 'book_small', 'book_medium', 'book_large', 'growth_stone', 'stat_boost', 'slot_unlock', 'skill_replace', 'forget_stone', 'pet_recruit', 'reset_stone', 'skill_enhance_stone', 'revival_stone'];
  const stock = (state.shopStock ?? []).filter((id) =>
    isProf ? profShopIds.includes(id) : (!!FOODS[id] || !!ITEMS[id])
  );
  const refreshCount = state.shopRefreshCount ?? 0;
  const refreshCost = Math.round((5 + refreshCount * 5) * (isProf ? 1 : DIFFICULTY_CONFIG[state.difficulty ?? 'normal'].shopPriceMult));
  const canRefresh = refreshCount < 3 && state.gold >= refreshCost;
  const canRest = state.roster.some((u) => u.hp < u.maxHp);
  return (
    <div className="shop-screen">
      <header className="shop-header">
        <div className="shop-heading"><span className="shop-heading-mark" aria-hidden="true" /><div>
          <h1>{isProf ? '远征补给站' : '林间商铺'}</h1>
          <p>{isProf ? `熟练度远征 · 第 ${state.currentLayer ?? state.currentRow + 1} 层` : `第 ${state.act} 幕 · 旅途补给`}</p>
        </div></div>
        <div className="shop-header-actions">
          <span className="shop-header-chip shop-gold"><img src="/reward-icons/gold.png" alt="金币" /><strong>{state.gold}</strong></span>
          <span className="shop-header-chip"><img src={homePawIcon} alt="出战伙伴" /><strong>{state.field.length}/{isProf ? PROF_FIELD_MAX : FIELD_MAX}</strong></span>
          <button type="button" className="shop-leave" onClick={() => dispatch({ type: 'NEXT_NODE' })}>离开 <UiSymbol name="arrow-right" /></button>
        </div>
      </header>
      <main className="shop-catalog">
        <div className="shop-catalog-heading"><h2>今日货架</h2><span>随机上架 · {stock.length} 件</span></div>
        <div className="shop-stock">
        {stock.map((id) => {
          const profShopData: Record<string, { label: string; desc: string; price: number }> = {
            heal_potion: { label: '治疗圣水', desc: '全队回复 50% 生命', price: 30 },
            gold_bag: { label: '金币袋', desc: '获得 25 金币', price: 10 },
            book_small: { label: '成长之书（小）', desc: '选择一只宠物获得 1 成长点', price: 12 },
            book_medium: { label: '成长之书（中）', desc: '选择一只宠物获得 2 成长点', price: 22 },
            book_large: { label: '成长之书（大）', desc: '选择一只宠物获得 3 成长点', price: 30 },
            growth_stone: { label: '成长之石', desc: '选择一只宠物获得 1 成长点', price: 15 },
            stat_boost: { label: '属性强化', desc: '选择一只宠物提升属性', price: 18 },
            slot_unlock: { label: '技能槽解锁', desc: '选择一只宠物解锁技能槽', price: 50 },
            skill_replace: { label: '技能替换', desc: '选择一只宠物替换技能', price: 12 },
            forget_stone: { label: '遗忘之石', desc: '选择一只宠物重置成长点', price: 30 },
            pet_recruit: { label: '宠物招募', desc: '招募一只随机宠物', price: 20 },
            reset_stone: { label: '还原石', desc: '重置技能强化等级（返还50%消耗）', price: 25 },
            skill_enhance_stone: { label: '技能强化石', desc: '强化1个技能（无需成长点）', price: 40 },
            revival_stone: { label: '复活石', desc: '复活1只死亡宠物（保留50%属性）', price: 60 },
          };
          const profItem = isProf ? profShopData[id] : undefined;
          const f = !isProf ? FOODS[id] : undefined;
          const it = !isProf ? ITEMS[id] : undefined;
          const name = profItem?.label ?? f?.name ?? it?.name ?? id;
          const desc = profItem?.desc ?? f?.desc ?? it?.desc ?? '';
          const rawPrice = profItem?.price ?? f?.price ?? it?.price ?? 0;
          const price = isProf ? rawPrice : Math.round(rawPrice * DIFFICULTY_CONFIG[state.difficulty ?? 'normal'].shopPriceMult);
          const soldOut = boughtItems.includes(id);
          const affordable = state.gold >= price;
          return (
            <article key={id} className={`shop-product ${soldOut ? 'is-sold' : ''} ${!soldOut && !affordable ? 'is-unaffordable' : ''}`}>
              {soldOut && <span className="shop-sold-badge">已购买</span>}
              <div className="shop-product-icon">{BACKPACK_ITEM_ART[id] ? <img src={BACKPACK_ITEM_ART[id]} alt="" draggable={false} /> : <ShopItemIcon itemId={id} />}</div>
              <div className="shop-product-copy"><h3>{name}</h3><MobileDetails label={`${name}说明`} triggerLabel={desc}><p>{desc}</p></MobileDetails></div>
              <span className="shop-price"><img src="/reward-icons/gold.png" alt="金币" />{price}</span>
              <button
                  type="button"
                  className="shop-buy"
                  aria-label={`${soldOut ? '已购买' : affordable ? '购买' : '金币不足'} ${name}`}
                  disabled={soldOut || !affordable}
                  onClick={() => dispatch(isProf ? { type: 'PROF_SHOP_BUY', itemId: id } : { type: 'SHOP_BUY', foodId: id })}
                >
                  {soldOut ? '已购买' : affordable ? '购买' : '金币不足'}
                </button>
            </article>
          );
        })}
        </div>
        <div className={`shop-utilities ${isProf ? 'shop-utilities-single' : ''}`}>
        {!isProf && (
          <div className="shop-utility shop-utility-rest"><span className="shop-utility-icon" aria-hidden="true"><MapNodeIcon type="rest" /></span><div><h3>立即休整</h3><p>免费让全队回满血，不解除诅咒</p></div>
            <button type="button" disabled={!canRest} onClick={() => dispatch({ type: 'SHOP_REST' })}>{canRest ? '休整' : '已满血'}</button>
          </div>
        )}
        <div className="shop-utility"><span className="shop-utility-icon" aria-hidden="true"><img src="/page-special-icons/shop-refresh.png" alt="" draggable={false} /></span><div><h3>刷新货架</h3><p>{refreshCount >= 3 ? '刷新次数已用尽' : `花费 ${refreshCost} 金币 · 剩余 ${3 - refreshCount} 次`}</p></div>
          <button type="button" disabled={!canRefresh} onClick={() => dispatch(isProf ? { type: 'PROF_SHOP_REFRESH' } : { type: 'SHOP_REFRESH' })}>{refreshCount >= 3 ? '已用完' : '刷新'}</button>
        </div>
        </div>
      </main>
    </div>
  );
}

function RestScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  return <CampRestScreen state={state} dispatch={dispatch} />;
}

function ReviveSelectScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  return <RevivalScreen state={state} dispatch={dispatch} />;
}

function RestFusionScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  return state.screen === 'rest-fusion-skill'
    ? <CampFusionSkillScreen state={state} dispatch={dispatch} />
    : <CampFusionScreen state={state} dispatch={dispatch} />;
}

export function WatchtowerScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  // 找到正在预览的瞭望塔节点及其所在行
  const previewId = state.watchtowerPreviewNodeId;
  const previewNode = previewId ? state.map.layers.flat().find((n) => n.id === previewId) : undefined;
  const previewRow = previewNode
    ? state.map.layers.findIndex((layer) => layer.some((n) => n.id === previewId))
    : state.currentRow;
  const maxRow = state.map.layers.length - 1;
  const rows = [previewRow + 1, previewRow + 2, previewRow + 3].filter((r) => r <= maxRow);
  const [selRow, setSelRow] = useState<number>(rows[0] ?? previewRow);
  const [detailSpeciesId, setDetailSpeciesId] = useState<string | null>(null);
  const sel = rows.includes(selRow) ? selRow : rows[0] ?? previewRow;

  return (
    <div className="flow-screen watchtower-screen">
      <FlowHeader title={`瞭望塔 · 第${state.act}幕`} state={state} onHome={() => { void persistSave(state); dispatch({ type: 'TITLE' }); }} />
      <div className="watchtower-layout">
      <aside className="watchtower-scenery" aria-hidden="true"><img src={watchtowerTelescopeArt} alt="" /><span>前路情报</span></aside>
      <main className="flow-frame watchtower-panel">
      <h2>选择瞭望层数</h2>
      <div className="watchtower-tabs" role="group" aria-label="瞭望层数">
        {rows.map((r) => (
          <button type="button" key={r} className={r === sel ? 'flow-primary' : ''} aria-pressed={r === sel} onClick={() => setSelRow(r)}>
            第 {r + 1} 层{r === maxRow ? '（首领层）' : ''}
          </button>
        ))}
      </div>
      <div className="watchtower-intel">
        {(state.map.layers[sel] ?? []).map((n) => {
          const info = nodeInfo(state, n);
          const combat = ['battle', 'elite', 'arena', 'gauntlet', 'corrupted', 'guardian', 'boss'].includes(n.type);
          const enemies = n.type === 'boss' ? state.map.boss[n.id] : state.map.encounter[n.id];
          const descriptions = n.type === 'rest' ? ['恢复伙伴生命']
            : n.type === 'arena3' ? ['模拟战', '挑战赛', '表演赛']
            : n.type === 'sync' || n.type === 'keydoor' ? [info.detail.replace(/^宝箱奖励：/, '').split('（')[0], n.type === 'sync' ? '二选一；持双生符可双开' : '需先击败对应守卫取得钥匙']
            : info.detail.split(' ／ ');
          return (
            <article key={n.id} className="watchtower-intel-card">
              <header className="watchtower-card-heading"><MapNodeIcon type={n.type} /><h3>{info.title}</h3></header>
              {n.type === 'shop' ? <dl className="watchtower-shop-items">{info.shopItems?.map((item, index) => <div key={index}><dt>{item.name}</dt><dd>{item.price} 金</dd></div>)}</dl> : combat ? <div className="watchtower-card-description">
                <div className="watchtower-enemy-names" aria-label={`${info.title}的敌人`}>
                  {enemies?.length ? enemies.map((enemy, index) => <button type="button" key={`${enemy.speciesId}-${index}`} aria-haspopup="dialog" onClick={() => setDetailSpeciesId(enemy.speciesId)}>{getMonster(enemy.speciesId).name}</button>) : <p>暂无敌人情报</p>}
                </div>
                {n.type === 'gauntlet' && <p>共 {n.gauntletSize ?? enemies?.length ?? 2} 轮</p>}
                {n.type === 'guardian' && <p>不可驯服 · 击败获得专用钥匙</p>}
              </div> : <div className="watchtower-card-description">{descriptions.filter(Boolean).map((text, index) => <p key={index}>{text}</p>)}</div>}
            </article>
          );
        })}
      </div>
      <footer className="watchtower-footer"><p>情报仅供预览，不会进入节点</p>
        <button type="button" className="flow-primary" onClick={() => dispatch({ type: 'CLOSE_WATCHTOWER' })}>
          关闭瞭望
        </button>
      </footer>
      </main>
      </div>
      {detailSpeciesId && <WatchtowerCreatureDetails speciesId={detailSpeciesId} onClose={() => setDetailSpeciesId(null)} />}
    </div>
  );
}

function WatchtowerCreatureDetails({ speciesId, onClose }: { speciesId: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const species = getMonster(speciesId);
  const stats = computeStats(speciesId);
  const passive = getPassive(species.passive);
  const altPassive = species.altPassive ? getPassive(species.altPassive) : undefined;
  const unit: Unit = {
    uid: `watchtower-${speciesId}`, speciesId, name: species.name, emoji: species.emoji, image: species.image,
    hp: stats.maxHp, maxHp: stats.maxHp, spd: stats.spd, shield: 0, skills: [...species.skills], statuses: [],
    column: 0, row: 'front', isPlayer: false, tameable: false, acted: false, passive: species.passive,
  };
  useBackAction(true, onClose, 100);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); onClose(); }
      if (event.key === 'Tab') { event.preventDefault(); closeRef.current?.focus(); }
    };
    window.addEventListener('keydown', keydown, true);
    return () => { window.removeEventListener('keydown', keydown, true); trigger?.focus(); };
  }, [onClose]);
  return createPortal(<div className="battle-overlay-mask watchtower-detail-overlay" onClick={onClose}>
    <section className="battle-overlay-panel enemy-inspect-modal" role="dialog" aria-modal="true" aria-labelledby="watchtower-detail-title" onClick={event => event.stopPropagation()}>
      <div className="battle-overlay-head"><h2 id="watchtower-detail-title" className="battle-overlay-title">{species.name} · 生物详情</h2><button type="button" className="battle-overlay-close" ref={closeRef} onClick={onClose} aria-label="关闭生物详情"><UiSymbol name="close" /></button></div>
      <BattleUnitInspectPanel unit={unit} side="enemy" showBuffs={false} showSkills={!species.altSkills} eyebrow="图鉴基础属性">
        {species.desc && <p className="watchtower-creature-description">{species.desc}</p>}
        {species.altSkills && <div className="enemy-inspect-section-title">形态一（生命大于50%）</div>}
        {passive && <div className="buff-section"><div className="buff-section-label">被动</div><div className="buff-item"><span className="buff-name">{passive.name}</span><span className="buff-desc">{passive.desc}</span></div></div>}
        {species.altSkills && <><div className="enemy-inspect-section-title">技能</div><div className="enemy-inspect-skills">{species.skills.map(id => <SkillTag key={id} skill={getSkill(id)} desc usesNote />)}</div><div className="enemy-inspect-section-title">形态二（生命不高于50%）</div>{altPassive && <div className="buff-section"><div className="buff-section-label">被动</div><div className="buff-item"><span className="buff-name">{altPassive.name}</span><span className="buff-desc">{altPassive.desc}</span></div></div>}<div className="enemy-inspect-section-title">技能</div><div className="enemy-inspect-skills">{species.altSkills.map(id => <SkillTag key={id} skill={getSkill(id)} desc usesNote />)}</div></>}
      </BattleUnitInspectPanel>
    </section>
  </div>, document.getElementById('root') ?? document.body);
}

function ChestScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const results = state.chestResult ?? [];
  const resultArt = (text: string) => {
    const food = Object.values(FOODS).find(item => text.includes(item.name));
    const item = Object.values(ITEMS).find(item => text.includes(item.name));
    if (text.includes('金币')) return '/reward-icons/gold.png';
    if (food && BACKPACK_ITEM_ART[food.id]) return BACKPACK_ITEM_ART[food.id];
    if (item && BACKPACK_ITEM_ART[item.id]) return BACKPACK_ITEM_ART[item.id];
    return text.includes('恢复') ? '/reward-icons/heal.png' : chestOpenArt;
  };
  return (
    <div className="flow-screen chest-results-screen">
      <FlowHeader title={`宝箱结果 · 第${state.act}幕`} state={state} onHome={() => { void persistSave(state); dispatch({ type: 'TITLE' }); }} />
      <main className="flow-frame chest-results-panel">
        <header className="chest-results-heading"><img src={chestOpenArt} alt="已开启的宝箱" /><h2>宝箱已开启</h2><p>奖励已结算，物品已放入背包</p></header>
        <div className="chest-results-content">{results.map((text, index) => {
          const separator = text.indexOf('：');
          const title = separator >= 0 ? text.slice(0, separator) : '宝箱奖励';
          const rewards = (separator >= 0 ? text.slice(separator + 1) : text).split('、');
          return <section key={index} className="chest-result-group"><h3>{title}</h3><div className="chest-result-cards">{rewards.map((reward, rewardIndex) => <article key={rewardIndex}><img src={resultArt(reward)} alt="" /><strong>{reward}</strong></article>)}</div></section>;
        })}
        {results.length === 0 && <p className="chest-empty">暂无宝箱结果</p>}
        </div>
        <footer className="chest-results-footer">
          <button type="button" className="flow-primary" onClick={() => dispatch({ type: 'NEXT_NODE' })}>
            继续前进 <UiSymbol name="arrow-right" />
          </button>
          <p>已获得全部奖励</p>
        </footer>
      </main>
    </div>
  );
}

function BackpackScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const mobile = useMobileLayout();
  const [mobileDetail, setMobileDetail] = useState(false);
  const [confirm, setConfirm] = useState<PetConfirm>(null);
  const [tab, setTab] = useState<'items' | 'pets'>('items');
  const [selectedItemId, setSelectedItemId] = useState('scout');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  useBackAction(true, () => {
    if (confirm) setConfirm(null);
    else if (mobile && mobileDetail) setMobileDetail(false);
    else dispatch({ type: 'CLOSE_BACKPACK' });
  });
  const isProf = state.runMode === 'proficiency';
  const growthItemIds = ['book_small', 'book_medium', 'book_large', 'slot_unlock', 'forget_stone', 'heal_potion', 'reset_stone', 'skill_enhance_stone', 'revival_stone'];
  const items = Object.entries(state.inventory).filter(([id, count]) => count > 0 && (FOODS[id] || ITEMS[id]) && (!isProf || growthItemIds.includes(id)));
  const itemId = items.find(([id]) => id === selectedItemId)?.[0] ?? items[0]?.[0];
  const item = itemId ? ITEMS[itemId] ?? FOODS[itemId] : undefined;
  const food = itemId && !growthItemIds.includes(itemId) ? FOODS[itemId] : undefined;
  const growthItem = !!itemId && growthItemIds.includes(itemId);
  const battleItem = !!itemId && !!ITEMS[itemId]?.usableInBattle;
  const focused = state.roster.find((unit) => unit.uid === selectedUid) ?? state.roster[0];
  const focusedImage = focused ? formationImage(focused.speciesId, focused.image) : undefined;
  const passive = focused ? getPassive(focused.passive) : undefined;
  const stage = focused ? nextStage(focused.speciesId) : undefined;
  const sameCount = focused ? state.roster.filter((unit) => unit.speciesId === focused.speciesId).length : 0;
  const canUseItem = growthItem || itemId === 'scout' || itemId === 'skip' || (itemId === 'purify' && state.roster.some((unit) => unit.curse));
  const useItem = () => {
    if (!itemId) return;
    if (growthItem) dispatch({ type: 'USE_GROWTH_ITEM', itemId });
    else if (itemId === 'scout') dispatch({ type: 'OPEN_SCOUT' });
    else if (itemId === 'skip') dispatch({ type: 'OPEN_SKIP' });
    else if (itemId === 'purify') {
      setSelectedUid(state.roster.find((unit) => unit.curse)?.uid ?? null);
      setTab('pets');
    }
  };
  const useNote = food ? '在战斗中选择食物，再指定可驯服的敌人。'
    : battleItem ? '在战斗界面的“道具”中使用。'
    : itemId === 'scout' ? '使用后返回地图选择要侦查的节点。'
    : itemId === 'skip' ? '使用后返回地图选择可跳过的战斗节点。'
    : itemId === 'twin' ? '抵达双生宝箱节点时自动使用。'
    : itemId === 'purify' ? (canUseItem ? '切换到伙伴页，选择需要净化的伙伴。' : '队伍中没有需要净化的伙伴。')
    : itemId === 'heal_potion' ? '使用后全队回复 50% 生命。'
    : growthItem ? '使用后选择需要应用效果的伙伴。' : '查看物品信息。';
  const useLabel = food || battleItem ? '战斗中使用' : itemId === 'twin' ? '抵达节点时使用' : itemId === 'purify' ? '选择伙伴净化' : `使用${item?.name ?? '物品'}`;

  return (
    <div className={`backpack-screen${mobileDetail ? ' backpack-mobile-detail' : ''}`}>
      <header className="backpack-header">
        <h1><img src={homeContinueIcon} alt="" />背包</h1>
        <div className="backpack-header-actions">
          <span><img src="/reward-icons/gold.png" alt="金币" />{state.gold}</span>
          <span><img src={homePawIcon} alt="队伍" />{state.roster.length}/{getMaxRoster(state.runMode)}</span>
          <button onClick={() => dispatch({ type: 'CLOSE_BACKPACK' })}>关闭背包</button>
        </div>
      </header>
      <nav className="backpack-tabs" aria-label="背包分类">
        <button className={tab === 'items' ? 'selected' : ''} aria-pressed={tab === 'items'} onClick={() => { setTab('items'); setMobileDetail(false); }}>物品</button>
        <button className={tab === 'pets' ? 'selected' : ''} aria-pressed={tab === 'pets'} onClick={() => { setTab('pets'); setMobileDetail(false); }}>伙伴</button>
        {mobile && mobileDetail && <button onClick={() => setMobileDetail(false)}>返回列表</button>}
      </nav>
      <main className="backpack-layout">
        <section className="backpack-storage" aria-label={tab === 'items' ? '物品收纳' : '队伍伙伴'}>
          <h2>{tab === 'items' ? '物品收纳' : '队伍伙伴'}</h2>
          {tab === 'items' ? <div className="backpack-item-grid">
            {items.map(([id, count]) => {
              const definition = ITEMS[id] ?? FOODS[id];
              return <button key={id} className={`backpack-item ${itemId === id ? 'selected' : ''}`} aria-pressed={itemId === id} aria-label={`查看${definition.name}，持有${count}个`} onClick={() => { setSelectedItemId(id); if (mobile) setMobileDetail(true); }}>
                <span className="backpack-item-count">×{count}</span>
                {BACKPACK_ITEM_ART[id] ? <img src={BACKPACK_ITEM_ART[id]} alt="" draggable={false} /> : <span className="backpack-item-emoji">{definition.emoji}</span>}
                <strong>{definition.name}</strong>
              </button>;
            })}
            {items.length === 0 && <p className="backpack-empty-message">背包中暂无物品。</p>}
          </div> : <div className="backpack-pet-grid">
            {Array.from({ length: getMaxRoster(state.runMode) }, (_, index) => {
              const unit = state.roster[index];
              if (!unit) return <div key={`empty-${index}`} className="backpack-empty-slot"><img src={homePawIcon} alt="" /><span>空位</span></div>;
              const image = formationImage(unit.speciesId, unit.image);
              return <button key={unit.uid} className={`backpack-pet ${focused?.uid === unit.uid ? 'selected' : ''}`} aria-pressed={focused?.uid === unit.uid} aria-label={`查看${unit.name}，生命${unit.hp}/${unit.maxHp}，速度${unit.spd}`} onClick={() => { setSelectedUid(unit.uid); if (mobile) setMobileDetail(true); }}>
                <span className="backpack-pet-portrait">{image ? <BattlePixelSprite src={image} name={unit.name} /> : <PixelCreature unit={unit} />}</span>
                <strong>{unit.name}</strong>
                <span className="backpack-pet-stats"><span><i className="starter-stat-icon starter-stat-heart" aria-hidden="true" />{unit.hp}/{unit.maxHp}</span><span><i className="starter-stat-icon starter-stat-speed" aria-hidden="true" />{unit.spd}</span></span>
              </button>;
            })}
          </div>}
        </section>
        <aside className="backpack-detail" aria-label={tab === 'items' ? '物品详情' : '伙伴详情'}>
          {tab === 'items' ? item && itemId ? <>
            <div className="backpack-detail-body">
              <div className="backpack-detail-heading"><h2>{item.name}</h2><span>{food ? '捕获食物' : growthItem ? '远征道具' : battleItem ? '战斗药水' : itemId === 'purify' ? '净化道具' : '地图道具'}</span></div>
              <div className="backpack-detail-art">{BACKPACK_ITEM_ART[itemId] ? <img src={BACKPACK_ITEM_ART[itemId]} alt="" /> : <span className="backpack-item-emoji">{item.emoji}</span>}</div>
              <p className="backpack-detail-count">持有 ×{state.inventory[itemId]}</p>
              <p className="backpack-description">{item.desc}</p>
              {food && <p className="backpack-food-rate">基础驯服率 {Math.round(food.baseTame * 100)}%</p>}
              <p className="backpack-use-note">{useNote}</p>
            </div>
            <button className="backpack-use" disabled={!canUseItem} onClick={useItem}>{useLabel}</button>
          </> : <p className="backpack-empty-message">获得物品后，可在这里查看用途。</p> : focused ? <>
            <div className="backpack-detail-body">
              <div className="backpack-detail-heading"><h2>{focused.name}</h2><span>伙伴详情</span></div>
              <div className="backpack-detail-art">{focusedImage ? <BattlePixelSprite src={focusedImage} name={focused.name} /> : <PixelCreature unit={focused} />}</div>
              <div className="backpack-detail-stats"><span><i className="starter-stat-icon starter-stat-heart" aria-hidden="true" />{focused.hp}/{focused.maxHp}</span><span><i className="starter-stat-icon starter-stat-speed" aria-hidden="true" />{focused.spd}</span></div>
              {focused.curse && <p className="backpack-curse"><BuffIcon art={CURSE_ART[focused.curse]} />{CURSE_CN[focused.curse]}</p>}
              {focused.bonusStats && (focused.bonusStats.hp || focused.bonusStats.spd) && <p className="backpack-bonus">属性强化：生命 +{focused.bonusStats.hp ?? 0} · 速度 +{focused.bonusStats.spd ?? 0}</p>}
              <div className="backpack-passive"><strong>被动 · {passive?.name ?? '无'}</strong><p>{passive?.desc ?? '暂无被动效果'}</p></div>
              <div className="backpack-skills">{focused.skills.map((id, index) => <span key={`${id}-${index}`} title={getSkill(id).desc}>{getSkill(id).name}</span>)}</div>
            </div>
            <div className="backpack-pet-actions">
              {!isProf && <p>融合条件：{evolutionLockReason(state, focused.speciesId) ?? (stage ? `同物种 ${sameCount}/${fusionNeedCount(focused.speciesId)}` : '已是最终形态')}</p>}
              <PetCardFooter unit={focused} state={state} setConfirm={setConfirm} />
              {focused.curse && (state.inventory.purify ?? 0) > 0 && <button className="backpack-purify" onClick={() => dispatch({ type: 'USE_PURIFY', uid: focused.uid })}>净化（{state.inventory.purify}）</button>}
            </div>
          </> : <p className="backpack-empty-message">队伍中暂无伙伴。</p>}
        </aside>
      </main>
      {confirm && <FuseDiscardConfirm confirm={confirm} state={state} dispatch={dispatch} setConfirm={setConfirm} />}
    </div>
  );
}

function TameOverflowScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const [confirm, setConfirm] = useState<PetConfirm>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const tame = (state.tameOverflow ?? [])[0];
  if (!tame) return null;
  const passive = getPassive(tame.passive);
  const remaining = state.tameOverflow!.length;
  const hasSpace = state.roster.length < getMaxRoster(state.runMode);
  const selected = state.roster.find(unit => unit.uid === selectedUid) ?? state.roster[0];
  const stage = selected ? nextStage(selected.speciesId) : undefined;
  const lockReason = selected ? evolutionLockReason(state, selected.speciesId) : undefined;
  const need = selected && stage ? fusionNeedCount(selected.speciesId) : 0;
  const sameCount = selected ? state.roster.filter(unit => unit.speciesId === selected.speciesId).length : 0;
  const totalCount = sameCount + (state.tameOverflow ?? []).filter(unit => unit.speciesId === selected?.speciesId).length;
  const canFuse = stage !== undefined && !lockReason && totalCount >= need;
  const fuseTitle = lockReason ?? (stage ? (canFuse ? `融合进化为 ${getMonster(stage).name}（${totalCount}/${need}）` : `同物种不足（${totalCount}/${need}）`) : '该宠物已是最终形态，无法融合');
  return (
    <div className="flow-screen flow-partner-screen">
      <header className="flow-header flow-frame"><h1><FlowIcon name="new-companion" />新伙伴加入</h1><span>队伍 {state.roster.length}/{getMaxRoster(state.runMode)} · 待处理 {remaining} 只</span></header>
      <div className="flow-partner-layout">
        <section className="flow-frame flow-new-partner">
          <h2>新伙伴</h2><FlowPet unit={tame} /><h3>{tame.name}</h3><FlowPetStats unit={tame} />
          <MobileDetails label={`${tame.name}技能与被动`} details={<MobileUnitAbilities unit={tame} />}>{passive && <div className="flow-passive"><b>被动 · {passive.name}</b><p>{passive.desc}</p></div>}
          <div className="flow-skill-chips">{tame.skills.map(id => <span key={id}>{getSkill(id).name}</span>)}</div></MobileDetails>
          <p>{hasSpace ? '队伍有空位，可以直接加入。' : '队伍已满，选择一只现有伙伴进行替换或融合。'}</p>
        </section>
        <section className="flow-frame flow-existing-partners">
          <h2>现有伙伴</h2>
          <div className="flow-roster-grid">{Array.from({ length: getMaxRoster(state.runMode) }, (_, index) => {
            const unit = state.roster[index];
            return unit ? <button key={unit.uid} className={`flow-roster-tile ${selected?.uid === unit.uid ? 'is-selected' : ''}`} aria-pressed={selected?.uid === unit.uid} onClick={() => setSelectedUid(unit.uid)}>
              <FlowPet unit={unit} /><strong>{unit.name}</strong><FlowPetStats unit={unit} />
            </button> : <div key={`empty-${index}`} className="flow-roster-empty">空位</div>;
          })}</div>
          {selected && <section className="flow-comparison"><h3>当前选择</h3><div><FlowPet unit={selected} /><span><b>{selected.name}</b><FlowPetStats unit={selected} /></span></div><div><FlowPet unit={tame} /><span><b>{tame.name}</b><FlowPetStats unit={tame} /></span></div></section>}
        </section>
      </div>
      <footer className="flow-frame flow-partner-actions">
        <p>替换或放生后无法撤销。融合需满足同物种数量。</p>
        <div className="flow-actions">
          {hasSpace && <button className="flow-primary" onClick={() => dispatch({ type: 'TAME_OVERFLOW_JOIN', tameUid: tame.uid })}><FlowIcon name="new-companion" />加入队伍</button>}
          <button className="flow-primary" disabled={!selected} onClick={() => selected && setConfirm({ kind: 'replace', uid: selected.uid, gold: 5 * getMonster(selected.speciesId).rank })}><FlowIcon name="replace-companion" />替换伙伴</button>
          {state.runMode !== 'proficiency' && <button className="flow-positive" disabled={!selected || !!lockReason} title={fuseTitle} onClick={() => {
            if (!selected) return;
            if (!stage) setConfirm({ kind: 'notice', msg: '该宠物已是最终形态，无法融合' });
            else if (!canFuse) setConfirm({ kind: 'notice', msg: `同物种不足（${totalCount}/${need}），无法融合` });
            else setConfirm({ kind: 'fuse', uid: selected.uid });
          }}><FlowIcon name="fuse-companion" />融合</button>}
          <button onClick={() => dispatch({ type: 'TAME_OVERFLOW_DISCARD', tameUid: tame.uid })}><FlowIcon name="release-companion" />放生新伙伴</button>
        </div>
      </footer>
      {confirm && (
        <FuseDiscardConfirm confirm={confirm} state={state} dispatch={dispatch} setConfirm={setConfirm} />
      )}
    </div>
  );
}

function EventScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const ev = state.map.events[state.currentNodeId];
  if (!ev) return null;
  const hatch = state.pendingEventHatch;
  const hatchMonster = hatch ? getMonster(hatch.monsterId) : null;
  return (
    <div className="flow-screen flow-event-screen">
      <FlowHeader title={`第${state.act}幕 · 林间事件`} state={state} onHome={() => { void persistSave(state); dispatch({ type: 'TITLE' }); }} />
      <main className="flow-choice-panel flow-frame">
        <span className="flow-eyebrow"><FlowIcon name="event-scroll" />旅途事件</span>
        <h2>{ev.title}</h2>
        <MobileDetails label="事件背景"><p className="flow-story">
          {ev.desc}
        </p></MobileDetails>
        <div className="flow-choices">
          {ev.choices.map((c) => {
            const cost = c.goldDelta ?? 0;
            const cantAfford = state.gold + cost < 0 || (c.consumeFood && c.foodId && (state.inventory[c.foodId] ?? 0) <= 0);
            return (
              <button type="button"
                key={c.id}
                className="flow-choice" disabled={!!cantAfford}
                onClick={() => {
                  if (cantAfford) return;
                  if (c.kind === 'recruit' && c.monsterId) {
                    dispatch({ type: 'EVENT_HATCH_PREVIEW', choiceId: c.id, monsterId: c.monsterId });
                  } else if (c.kind === 'battle' && c.battleEnemies) {
                    dispatch({
                      type: 'EVENT_BATTLE_START',
                      enemies: c.battleEnemies,
                      reward: c.battleReward ?? { kind: 'gold', amount: c.goldDelta ?? 0 },
                      penalty: c.battlePenalty ?? { percent: 15 },
                      bonusReward: c.bonusReward,
                    });
                  } else {
                    dispatch({ type: 'EVENT_CHOICE', choiceId: c.id });
                  }
                }}
              >
              <img className="flow-choice-icon" src={flowChoiceArt(c.kind, c.itemId ?? c.foodId)} alt="" draggable={false} />
              <span className="flow-choice-copy"><strong>{c.label}</strong><span>{c.desc}</span></span>
            </button>
            );
          })}
        </div>
      </main>
      {hatch && hatchMonster && (
        <div className="confirm-overlay" onClick={() => dispatch({ type: 'EVENT_HATCH_CANCEL' })}>
          <div className="confirm-box scout-popup" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">孵化结果</div>
            <div className="popup-body">
            <div style={{ fontSize: 48, marginBottom: 8 }}>{hatchMonster.image ? <img src={hatchMonster.image} className="pet-image" style={{ width: 48, height: 48 }} alt={hatchMonster.name} /> : hatchMonster.emoji}</div>
            <div>孵化出了 <b>{hatchMonster.name}</b>！</div>
            <div className="card-sub" style={{ marginBottom: 4, justifyContent: 'center' }}>
              ❤️ {hatchMonster.baseHp} &nbsp; ⚡ {hatchMonster.baseSpd}
            </div>
            </div>
            <div className="panel-row" style={{ marginTop: 12, justifyContent: 'center' }}>
              <button className="primary" onClick={() => dispatch({ type: 'EVENT_HATCH_CONFIRM' })}>收下</button>
              <button onClick={() => dispatch({ type: 'EVENT_HATCH_CANCEL' })}>放生</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SpecialScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const sp = state.map.specials[state.currentNodeId];
  if (!sp) return null;
  const hasEvolvable = state.roster.some((u) => nextStage(u.speciesId) && !evolutionLockReason(state, u.speciesId));
  const rosterFull = state.roster.length >= getMaxRoster(state.runMode);
  const disabled = (r: SpecialReward) =>
    ((r.kind === 'evolve' || r.kind === 'superevolve') && !hasEvolvable) ||
    (r.kind === 'custom' && rosterFull);
  return (
    <div className="flow-screen flow-special-screen">
      <FlowHeader title={`第${state.act}幕 · 林间奇遇`} state={state} onHome={() => { void persistSave(state); dispatch({ type: 'TITLE' }); }} />
      <main className="flow-choice-panel flow-frame">
        <span className="flow-eyebrow"><FlowIcon name="encounter-crystal" />稀有奇遇</span>
        <h2>{sp.title}</h2>
        <p className="flow-story">
          {sp.desc}
        </p>
        <div className="flow-choices flow-special-choices">
          {sp.rewards.map((r) => (
            <button type="button"
              key={r.id}
              className="flow-choice" disabled={disabled(r)}
              onClick={disabled(r) ? undefined : () => dispatch({ type: 'SPECIAL_CHOICE', rewardId: r.id })}
            >
              <img className="flow-choice-icon" src={flowChoiceArt(r.kind, r.itemId)} alt="" draggable={false} />
              <span className="flow-choice-copy"><strong>{r.label}</strong><span>{r.desc}</span></span>
            </button>
          ))}
        </div>
        {!hasEvolvable && (
          <p className="flow-notice">
            当前没有可进化的宠物，进化/超进化不可选{state.roster.some((u) => evolutionLockReason(state, u.speciesId)) ? '。传奇进化需击败第一幕首领后解锁。' : ''}
          </p>
        )}
      </main>
    </div>
  );
}

function CustomScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  return <CreationScreen state={state} dispatch={dispatch} />;
}

function BoostScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  return <AttributeBoostScreen state={state} dispatch={dispatch} />;
}

interface RatingDimension {
  key: string;
  name: string;
  weight: number;
  score: number; // 0-100
  grade: string;
}

function computeRating(stats: NonNullable<GameState['runStats']>, rosterSize: number, act: number): {
  score: number; grade: string; label: string; dimensions: RatingDimension[];
} {
  // 通关进度系数：1幕→0.65(最高B)，2幕→0.82(最高A)，3幕→1.0(可达S)
  const actMultiplier = [0.65, 0.82, 1.0][Math.min(3, Math.max(1, act)) - 1];

  // 征服者 (30%)：总胜率
  const totalBattles = stats.battlesWon + stats.battlesLost;
  const winRate = totalBattles > 0 ? stats.battlesWon / totalBattles : 0.5;
  const conqueror = Math.round(Math.min(1, winRate / 0.9) * 100);

  // 驯兽师 (25%)：驯服成功率
  const tameRate = stats.tameAttempts > 0 ? stats.petsTamed / stats.tameAttempts : 0.5;
  const tamer = Math.round(Math.min(1, tameRate / 0.8) * 100);

  // 经济大师 (20%)：金币结余率
  const goldKeptRate = stats.goldEarned > 0 ? (stats.goldEarned - stats.goldSpent) / stats.goldEarned : 0.5;
  const economy = Math.round(Math.min(1, goldKeptRate / 0.3) * 100);

  // 战斗效率 (15%)：总回合数 ≤ 90 满分
  const efficiency = Math.round(Math.max(0, 1 - (stats.turnsPlayed - 90) / 210) * 100);

  // 队伍完整性 (10%)：终局队伍 / 8
  const completeness = Math.round(Math.min(1, rosterSize / 7) * 100);

  const dimGrade = (s: number) => s >= 90 ? 'S' : s >= 75 ? 'A' : s >= 55 ? 'B' : s >= 40 ? 'C' : 'D';

  const dimensions: RatingDimension[] = [
    { key: 'conqueror', name: '征服者', weight: 30, score: Math.round(conqueror * actMultiplier), grade: dimGrade(Math.round(conqueror * actMultiplier)) },
    { key: 'tamer', name: '驯兽师', weight: 25, score: Math.round(tamer * actMultiplier), grade: dimGrade(Math.round(tamer * actMultiplier)) },
    { key: 'economy', name: '经济大师', weight: 20, score: Math.round(economy * actMultiplier), grade: dimGrade(Math.round(economy * actMultiplier)) },
    { key: 'efficiency', name: '战斗效率', weight: 15, score: Math.round(efficiency * actMultiplier), grade: dimGrade(Math.round(efficiency * actMultiplier)) },
    { key: 'completeness', name: '队伍完整性', weight: 10, score: Math.round(completeness * actMultiplier), grade: dimGrade(Math.round(completeness * actMultiplier)) },
  ];

  const score = Math.round(
    (conqueror * 0.3 + tamer * 0.25 + economy * 0.2 + efficiency * 0.15 + completeness * 0.1) * actMultiplier
  );

  if (score >= 90) return { score, grade: 'S', label: '传奇远征者', dimensions };
  if (score >= 75) return { score, grade: 'A', label: '精锐指挥官', dimensions };
  if (score >= 55) return { score, grade: 'B', label: '可靠旅人', dimensions };
  if (score >= 40) return { score, grade: 'C', label: '初生牛犊', dimensions };
  return { score, grade: 'D', label: '幸存者', dimensions };
}

const ACT_THEMES = [
  { emoji: '', name: '', flavor: '' },
  { emoji: '🏕️', name: '远征启程', flavor: '翠绿之径的风已歇，前方的路尚在雾中。整顿行装，你已踏出第一步。' },
  { emoji: '🌑', name: '暗影渡口', flavor: '暗影沼泽的瘴气渐散，你听到了更深处的回响。真正的考验，才刚刚开始。' },
  { emoji: '⚔️', name: '终局之前', flavor: '火焰与铁链的咆哮在身后沉寂。前方，是远征的终点——或是一切湮灭的起点。' },
];

function InterActScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const stats = state.runStats;
  const snap = stats?.actSnapshot;
  const actStats = snap ? {
    battlesWon: (stats?.battlesWon ?? 0) - snap.battlesWon,
    battlesLost: (stats?.battlesLost ?? 0) - snap.battlesLost,
    goldEarned: (stats?.goldEarned ?? 0) - snap.goldEarned,
    goldSpent: (stats?.goldSpent ?? 0) - snap.goldSpent,
    tamed: (stats?.petsTamed ?? 0) - snap.petsTamed,
    lost: (stats?.petsLost ?? 0) - snap.petsLost,
    turns: (stats?.turnsPlayed ?? 0) - snap.turnsPlayed,
  } : { battlesWon: 0, battlesLost: 0, goldEarned: 0, goldSpent: 0, tamed: 0, lost: 0, turns: 0 };
  const actNames = ['', '第一幕', '第二幕', '第三幕'];
  const actName = actNames[state.act] ?? `第${state.act}幕`;
  const nextName = actNames[state.act + 1] ?? `第${state.act + 1}幕`;
  const theme = ACT_THEMES[state.act] ?? ACT_THEMES[1];
  const rating = stats ? computeRating(stats, state.roster.length, state.act) : null;
  return (
    <div className="flow-screen flow-report-screen flow-interact-screen">
      <main className="flow-report flow-frame">
      <header className="flow-report-heading">
        <FlowIcon name="next-chapter" /><h1>{theme.name} · {actName}结算</h1>
        <p>{theme.flavor}</p>
      </header>
      <div className="flow-report-body">
      {rating && <div className="flow-act-rating"><FlowIcon name="rating-laurel" /><strong>{rating.grade}</strong><span>{rating.score}分 · {rating.label}</span><small>当前累计评级</small></div>}
      <div className="flow-act-stats">
        <div><FlowIcon name="battles-won" /><span>战斗场次</span><strong>{actStats.battlesWon + actStats.battlesLost}</strong></div>
        <div><img src="/reward-icons/gold.png" alt="" /><span>金币获取</span><strong>{actStats.goldEarned}</strong></div>
        <div><FlowIcon name="companions-tamed" /><span>驯服宠物</span><strong>{actStats.tamed}</strong></div>
        <div><FlowIcon name="companions-lost" /><span>宠物阵亡</span><strong>{actStats.lost}</strong></div>
        <div><FlowIcon name="turn-hourglass" /><span>行动回合</span><strong>{actStats.turns}</strong></div>
        <div><FlowIcon name="party-completeness" /><span>当前伙伴</span><strong>{state.roster.length}</strong></div>
      </div>
      <MobileDetails label="队伍快照"><FlowTeam units={state.roster} /></MobileDetails>
      </div>
      <footer className="flow-actions"><button className="flow-primary" onClick={() => dispatch({ type: 'INTER_ACT_CONTINUE' })}>远征{nextName} <UiSymbol name="arrow-right" /></button></footer>
      </main>
    </div>
  );
}

function RatingDisplay({ rating, color }: { rating: NonNullable<ReturnType<typeof computeRating>>; color?: string }) {
  return (
    <div className="rating-display">
      <div className="rating-grade" style={{ color: color ?? '#4ecdc4' }}>{rating.grade}</div>
      <div className="rating-score">{rating.score}分 · {rating.label}</div>
      <MobileDetails label="评分明细"><div className="rating-dimensions">
        {rating.dimensions.map((d) => (
          <div key={d.key} className="rating-dim-row">
            <span className="rating-dim-name">{d.name} ({d.weight}%)</span>
            <div className="rating-dim-bar">
              <div className="rating-dim-fill" style={{ width: `${d.score}%` }} />
            </div>
            <span className="rating-dim-score">{d.score} {d.grade}</span>
          </div>
        ))}
      </div></MobileDetails>
    </div>
  );
}

function GameOverScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const rating = state.runStats ? computeRating(state.runStats, state.roster.length, state.act) : null;
  return (
    <div className="flow-screen flow-report-screen flow-defeat-screen">
      <main className="flow-report flow-frame">
      <header className="flow-report-heading"><FlowIcon name="journey-end" /><h1>远征失败</h1><p>阵亡的宠物已永远消失，但这只是旅程的开始</p></header>
      <div className="flow-report-body">
      {rating && <RatingDisplay rating={rating} color="#e05555" />}
      <MobileDetails label="最终队伍"><FlowTeam units={state.roster} /></MobileDetails>
      </div>
      <footer className="flow-actions"><button onClick={() => dispatch({ type: 'TITLE' })}>
        返回首页
      </button></footer>
      </main>
    </div>
  );
}

function VictoryScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const rating = useMemo(() => state.runStats ? computeRating(state.runStats, state.roster.length, state.act) : null,
    [state.runStats, state.roster.length, state.act]);
  const [unlocked, setUnlocked] = useState<string[]>([]);

  useEffect(() => {
    if (!rating) return;
    const currentUnlocks = state.unlocks ?? { ...DEFAULT_UNLOCKS };
    const rosterInfo = state.roster.map((u) => ({ speciesId: u.speciesId, passive: u.passive }));
    const nextUnlocks = detectUnlocks(currentUnlocks, rating.grade, rosterInfo, state.difficulty, state.runStats);
    const newItems: string[] = [];
    for (const d of nextUnlocks.difficulties) {
      if (!currentUnlocks.difficulties.includes(d)) newItems.push(`难度：${DIFFICULTY_CONFIG[d as Difficulty].label}`);
    }
    for (const r of nextUnlocks.relics) {
      if (!currentUnlocks.relics.includes(r)) newItems.push(`遗物：${RELIC_DEFS[r].name}`);
    }
    if (nextUnlocks.bestGrade !== currentUnlocks.bestGrade) newItems.push(`最高评级：${nextUnlocks.bestGrade}`);
    setUnlocked(newItems);
    // 保存 unlocks 到当前存档槽（成就按存档隔离）
    const updatedState = { ...state, unlocks: nextUnlocks };
    void persistSave(updatedState);
  }, [rating]);

  return (
    <div className="flow-screen flow-report-screen flow-victory-screen">
      <main className="flow-report flow-frame">
      <header className="flow-report-heading"><FlowIcon name="victory-crown" /><h1>远征通关</h1><p>你击败了所有首领，驯服了沿途的怪物军团</p></header>
      <div className="flow-report-body">
      {rating && <RatingDisplay rating={rating} color="#d68b00" />}
      {unlocked.length > 0 && (
        <div className="flow-unlocks">
          <h2><FlowIcon name="unlock" />解锁新内容</h2>
          {unlocked.map((item) => (
            <div key={item} className="unlock-item">{item}</div>
          ))}
        </div>
      )}
      <MobileDetails label="最终队伍"><FlowTeam units={state.roster} /></MobileDetails>
      </div>
      <footer className="flow-actions">
      <button className="flow-primary" onClick={() => dispatch({ type: 'RETRY', seed: newSeed() })}>
        再来一次
      </button>
      <button onClick={() => dispatch({ type: 'TITLE' })}>
        返回标题
      </button>
      </footer>
      </main>
    </div>
  );
}

function ProficiencyResultScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  return <ProficiencyReport state={state} dispatch={dispatch} onRetry={() => dispatch({ type: 'RETRY', seed: newSeed() })} />;
}

function AchievementsScreen({ state, dispatch }: { state: GameState; dispatch: Dispatch<GameAction> }) {
  const unlocks = state.unlocks ?? { ...DEFAULT_UNLOCKS };
  const [tab, setTab] = useState<'difficulties' | 'relics' | 'grades'>('difficulties');
  const tabs = ['difficulties', 'relics', 'grades'] as const;
  const tabLabels: Record<string, string> = { difficulties: '难度', relics: '遗物', grades: '评级里程碑' };

  const conditions = { normal: '默认解锁', hard: '普通难度 A 级及以上通关', nightmare: '困难难度 A 级及以上通关' };
  const allDifficulties = DIFFICULTY_ORDER.map(id => {
    const config = DIFFICULTY_CONFIG[id];
    return { id, label: config.label, unlockCondition: conditions[id],
      desc: `敌方生命 ×${config.enemyHpMult} · 速度 +${config.enemySpdBonus} · 商店 ×${config.shopPriceMult} · 战后恢复 ${Math.round(config.healRatio * 100)}%` };
  });
  const allRelics = RELIC_ORDER.map((id) => ({ id, ...RELIC_DEFS[id] }));
  const grades = ['S', 'A', 'B', 'C', 'D'];

  return (
    <div className="flow-screen achievements-screen">
      <header className="flow-header flow-frame"><h1><img src={homeAchievementIcon} alt="" />成就与解锁</h1><span>当前存档的远征记录</span><button type="button" onClick={() => dispatch({ type: 'TITLE' })}>返回首页</button></header>
      <main className="flow-frame achievements-panel">
      <div className="achievements-tabs" role="tablist" aria-label="成就分类">{tabs.map(id => <button type="button" key={id} role="tab" id={`achievement-tab-${id}`} aria-selected={tab === id} aria-controls="achievement-content" className={tab === id ? 'flow-primary' : ''} onClick={() => setTab(id)}>{tabLabels[id]}</button>)}</div>
      <div className="achievements-heading"><h2>{tabLabels[tab]}{tab === 'grades' ? '' : '解锁'}</h2><div className="achievement-best-grade"><FlowIcon name="rating-laurel" /><span>最高评级 <b>{unlocks.bestGrade ?? '无'}</b></span></div></div>
      <section className="achievements-content" id="achievement-content" role="tabpanel" aria-labelledby={`achievement-tab-${tab}`}>
      {tab === 'difficulties' && (
        <div className="achievement-rows">
          {allDifficulties.map((d) => {
            const unlocked = unlocks.difficulties.includes(d.id);
            return (
              <div key={d.id} className={`achievement-row ${unlocked ? 'is-unlocked' : ''}`}>
                <span className={`achievement-difficulty-art difficulty-${d.id}`} aria-hidden="true" />
                <div className="achievement-row-copy"><h3>{d.label}</h3><p>{d.desc}</p><p>解锁条件：{d.unlockCondition}</p></div>
                <span className="achievement-state">{unlocked ? '已解锁' : '未解锁'}</span>
              </div>
            );
          })}
        </div>
      )}
      {tab === 'relics' && (
        <div className="achievement-rows">
          {allRelics.map((r) => {
            const unlocked = unlocks.relics.includes(r.id);
            return (
              <div key={r.id} className={`achievement-row ${unlocked ? 'is-unlocked' : ''}`}>
                <span className="achievement-relic-art"><RelicEmblem id={r.id} /></span>
                <div className="achievement-row-copy"><h3>{r.name}</h3><p>效果：{r.desc}</p><p>解锁条件：{r.unlockCondition}</p></div>
                <span className="achievement-state">{unlocked ? '已解锁' : '未解锁'}</span>
              </div>
            );
          })}
        </div>
      )}
      {tab === 'grades' && (
        <div className="achievement-rows">
          {grades.map((g) => {
            const rank = { S: 4, A: 3, B: 2, C: 1, D: 0 }[g] ?? 0;
            const bestRank = unlocks.bestGrade ? ({ S: 4, A: 3, B: 2, C: 1, D: 0 }[unlocks.bestGrade] ?? -1) : -1;
            const reached = bestRank >= rank;
            return (
              <div key={g} className={`achievement-row ${reached ? 'is-unlocked' : ''}`}>
                <span className="achievement-grade-art">{g}</span>
                <div className="achievement-row-copy"><h3>评级 {g}</h3><p>达成 {g} 级及以上通关评级</p></div>
                <span className="achievement-state">{reached ? '已达成' : '未达成'}</span>
              </div>
            );
          })}
        </div>
      )}
      </section><footer className="achievement-footer">解锁进度按存档独立保存</footer>
      </main>
    </div>
  );
}
