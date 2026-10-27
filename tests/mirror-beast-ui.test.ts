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
  it('只显示两个自身技能与休息，默认提示自动复制，无主动复制入口', () => {
    const { dispatch } = setup();
    expect(screen.getByRole('button', { name: /^镜像加速/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^镜像减速/ })).toBeTruthy();
    expect(screen.getByText('本场+1速')).toBeTruthy();
    expect(screen.getByText('本场−1速')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^镜影复制/ })).toBeNull();
    expect(screen.getByText('自动判定')).toBeTruthy();
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('旧档的一次性消耗记录不再展示用尽按钮', () => {
    setup(true);
    expect(screen.queryByRole('button', { name: /^镜影复制/ })).toBeNull();
    expect(screen.getByText('自动判定')).toBeTruthy();
  });
  it('排队提示不误显示为复制自身', () => {
    setup(false, true);
    expect(screen.getByText('自动判定')).toBeTruthy();
  });
});
