import type { GameState } from '../game/state/game';
import { FIELD_MAX, PROF_FIELD_MAX } from '../game/state/game';
import type { Unit } from '../game/types';
import { PetIcon } from './components';
import { FORMATION_SPRITES } from './formationSprites';
import { BACKPACK_ITEM_ART } from './backpackItemArt';

export const FLOW_ART = '/main-flow-art';
export const FLOW_ICON_NAMES = ['event-scroll', 'encounter-crystal', 'new-companion', 'replace-companion',
  'fuse-companion', 'release-companion', 'battles-won', 'companions-lost', 'turn-hourglass',
  'companions-tamed', 'victory-crown', 'unlock', 'rating-laurel', 'next-chapter', 'journey-end', 'party-completeness'];

export function FlowIcon({ name }: { name: string }) {
  return <img className="flow-icon" src={`${FLOW_ART}/icons/${name}.png`} alt="" draggable={false} />;
}

export function FlowHeader({ title, state, onHome, fieldMax }: { title: string; state: GameState; onHome?: () => void; fieldMax?: number }) {
  return <header className="flow-header flow-frame">
    <h1>{title}</h1>
    <div className="flow-resources">
      <span><img src="/reward-icons/gold.png" alt="金币" />{state.gold}</span>
      <span><FlowIcon name="party-completeness" />{state.field.length}/{fieldMax ?? (state.runMode === 'proficiency' ? PROF_FIELD_MAX : FIELD_MAX)}</span>
      {onHome && <button onClick={onHome}>返回首页</button>}
    </div>
  </header>;
}

export function FlowPet({ unit }: { unit: Unit }) {
  const image = FORMATION_SPRITES[unit.speciesId] ?? (unit.speciesId === 'momo' ? '/battle-momo.png' : unit.image);
  return <span className="flow-pet"><PetIcon image={image} emoji={unit.emoji} name={unit.name} /></span>;
}

export function FlowPetStats({ unit }: { unit: Unit }) {
  return <div className="flow-pet-stats">
    <span><i className="starter-stat-icon starter-stat-heart" aria-hidden="true" />{unit.hp}/{unit.maxHp}</span>
    <span><i className="starter-stat-icon starter-stat-speed" aria-hidden="true" />{unit.spd}</span>
  </div>;
}

export function FlowTeam({ units }: { units: Unit[] }) {
  return <section className="flow-team" aria-label="同行伙伴">
    <h2>同行伙伴</h2>
    <div>{units.map(unit => <div key={unit.uid} className="flow-team-pet"><FlowPet unit={unit} /><span>{unit.name}</span></div>)}</div>
    {units.length === 0 && <p>没有幸存的伙伴</p>}
  </section>;
}

export function flowChoiceArt(kind: string, itemId?: string): string {
  if (itemId && BACKPACK_ITEM_ART[itemId]) return BACKPACK_ITEM_ART[itemId];
  const existing: Record<string, string> = { gold: '/reward-icons/gold.png', heal: '/reward-icons/heal.png',
      food: '/reward-icons/food.png', feedRecruit: '/reward-icons/food.png', purify: BACKPACK_ITEM_ART.purify, purifyChoice: BACKPACK_ITEM_ART.purify,
      carryEgg: BACKPACK_ITEM_ART.mystery_egg, egg: BACKPACK_ITEM_ART.mystery_egg,
      coin: '/reward-icons/gold.png', boost: BACKPACK_ITEM_ART.hp_up };
  if (existing[kind]) return existing[kind];
  const names: Record<string, string> = { recruit: 'new-companion', revive: 'new-companion', reviveHalf: 'new-companion',
    battle: 'battles-won', none: 'next-chapter', damage: 'companions-lost', sacrifice: 'companions-lost',
    curse: 'journey-end', status: 'event-scroll', evolve: 'encounter-crystal', superevolve: 'fuse-companion',
    custom: 'new-companion', growthPoint: 'rating-laurel', slotUnlock: 'unlock' };
  return `${FLOW_ART}/icons/${names[kind] ?? 'event-scroll'}.png`;
}
