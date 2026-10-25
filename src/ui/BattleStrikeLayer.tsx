import { useLayoutEffect, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import type { BattleStrike, CaptureAnim } from './battleFx';

/** 以实际显示位置定位弹道；仅为表现层，不拦截战场输入。 */
export function BattleStrikeLayer({ field, strikes, capture }: { field: RefObject<HTMLDivElement>; strikes: BattleStrike[]; capture?: CaptureAnim | null }) {
  const [paths, setPaths] = useState<Array<BattleStrike & { x: number; y: number; dx: number; dy: number }>>([]);
  const [foodPath, setFoodPath] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      const units = [...element.querySelectorAll<HTMLElement>('[data-battle-uid]')];
      const destination = capture?.stage === 'feed' ? units.find(unit => unit.dataset.battleUid === capture.targetUid) : undefined;
      const origin = element.closest('.battle-screen')?.querySelector('[data-capture-origin]');
      if (destination && origin) {
        const a = origin.getBoundingClientRect();
        const t = (destination.querySelector('.battle-sprite') ?? destination).getBoundingClientRect();
        setFoodPath({ x: a.x + a.width / 2 - bounds.x, y: a.y + a.height / 2 - bounds.y, dx: t.x + t.width / 2 - a.x - a.width / 2, dy: t.y + t.height / 2 - a.y - a.height / 2 });
      } else setFoodPath(null);
      setPaths(strikes.flatMap(strike => {
        const actor = units.find(unit => unit.dataset.battleUid === strike.actorUid);
        const target = units.find(unit => unit.dataset.battleUid === strike.targetUid);
        if (!actor || !target) return [];
        const a = (actor.querySelector('.battle-sprite') ?? actor).getBoundingClientRect();
        const t = (target.querySelector('.battle-sprite') ?? target).getBoundingClientRect();
        const dx = t.x + t.width / 2 - a.x - a.width / 2;
        const dy = t.y + t.height / 2 - a.y - a.height / 2;
        const distance = Math.hypot(dx, dy) || 1;
        const movement = Math.min(18, a.height * .16);
        actor.style.setProperty('--attack-x', `${dx / distance * movement}px`);
        actor.style.setProperty('--attack-y', `${dy / distance * movement}px`);
        return strike.ranged ? [{ ...strike, x: a.x + a.width / 2 - bounds.x, y: a.y + a.height / 2 - bounds.y, dx, dy }] : [];
      }));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [field, strikes, capture]);
  return <div className="battle-strike-layer" aria-hidden="true">
    {foodPath && capture && <span key={capture.seq} className="capture-food-origin" style={{ left: foodPath.x, top: foodPath.y }}>
      <img className="capture-food-flight" src={`/capture-food-icons/${capture.foodId}.png`} alt="" style={{ '--shot-x': `${foodPath.dx}px`, '--shot-y': `${foodPath.dy}px` } as CSSProperties} />
    </span>}
    {paths.map(path => <span key={path.id} className="battle-projectile-origin" style={{ left: path.x, top: path.y }}>
      <span className="battle-projectile" style={{ '--shot-x': `${path.dx}px`, '--shot-y': `${path.dy}px` } as CSSProperties} />
    </span>)}
  </div>;
}
