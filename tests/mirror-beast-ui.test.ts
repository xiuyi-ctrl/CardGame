// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { createInitialState } from '../src/game/state/reducer';
import { BattleScreen } from '../src/ui/BattleScreen';

afterEach(cleanup);
function setup(used = false, queued = false) {
  const battle = createBattle([makeUnit('mirror_beast', true, 0, false)], [{ speciesId: 'momo' }], 1);
  const actor = battle.playerUnits[0];
  if (used) actor.skillUses = { mirror_copy: 0 };
  if (queued) { actor.acted = true; battle.orders = { [actor.uid]: { skillId: 'mirror_copy' } }; }
  const dispatch = vi.fn();
  render(createElement(BattleScreen, { state: { ...createInitialState(), screen: 'battle', battle }, dispatch }));
  fireEvent.click(screen.getByRole('button', { name: /镜影兽，右键或按菜单键查看我方生物 Buff/ }));
  return { actor, dispatch };
}
describe('镜影兽战斗入口', () => {
  it('两个自身技能之外显示独立复制入口，不需要选择自身目标', () => {
    const { actor, dispatch } = setup();
    expect(screen.getByRole('button', { name: /^镜像加速/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^镜像减速/ })).toBeTruthy();
    expect(screen.getByText('本场+1速')).toBeTruthy();
    expect(screen.getByText('本场−1速')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^镜影复制/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'PLAYER_SKILL', actorUid: actor.uid, skillId: 'mirror_copy' });
  });
  it('本场用尽后复制入口禁用', () => {
    setup(true);
    expect((screen.getByRole('button', { name: /^镜影复制/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('排队提示不误显示为复制自身', () => {
    setup(false, true);
    expect(screen.getByText('✓ 镜影复制 → 行动时判定')).toBeTruthy();
  });
});
