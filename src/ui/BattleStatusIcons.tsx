import type { Unit } from '../game/types';
import { STATUS_ART, BATTLE_BUFF_ART, CURSE_ART } from './BuffIcon';
import type { IconArt } from './BuffIcon';
export { BATTLE_BUFF_ICON_IMAGES } from './BuffIcon';

export function BattleStatusIcons({ unit }: { unit: Unit }) {
  if (unit.hp <= 0) return null;
  const icons: { id: string; art: IconArt; detail: string }[] = [];
  for (const status of unit.statuses) {
    if (status.kind === 'shield' && unit.shield <= 0) continue;
    const art = STATUS_ART[status.kind];
    const value = status.kind === 'shield' ? unit.shield : status.value;
    const turns = status.turns > 0 && !['burn', 'poison', 'fear', 'shield'].includes(status.kind) ? `，剩余 ${status.turns} 回合` : '';
    icons.push({ id: `status-${status.kind}`, art, detail: `${art[0]}${value > 0 ? `（${value}）` : ''}${turns}` });
  }
  if (unit.shield > 0 && !unit.statuses.some((status) => status.kind === 'shield')) {
    icons.push({ id: 'shield', art: STATUS_ART.shield, detail: `护盾（${unit.shield}）` });
  }
  for (const key of Object.keys(BATTLE_BUFF_ART) as (keyof NonNullable<Unit['battleBuffs']>)[]) {
    const value = unit.battleBuffs?.[key] ?? 0;
    if (value <= 0) continue;
    const art = BATTLE_BUFF_ART[key];
    icons.push({ id: `buff-${key}`, art, detail: `${art[0]}${key === 'skillSpd' ? ` +${value}` : `，剩余 ${value} 回合`}` });
  }
  if (unit.curse) {
    const art = CURSE_ART[unit.curse];
    icons.push({ id: 'curse', art, detail: art[0] });
  }
  if (icons.length === 0) return null;
  return (
    <span className="battle-status-icons" aria-label={`${unit.name}的状态`}>
      {icons.slice(0, 3).map(({ id, art, detail }) => (
        <img key={id} src={`/buff-icons/${art[1]}.png`} alt={art[0]} title={detail} draggable={false} />
      ))}
    </span>
  );
}
