// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { RewardScreen } from '../src/ui/App';
import { createInitialState, gameReducer } from '../src/game/state/reducer';
import { makeUnit } from '../src/game/core/battle';
import { generateMap, generateRewards, type GameState } from '../src/game/state/game';
afterEach(cleanup);
function state(): GameState {
 const base = createInitialState(), map = generateMap(42, 2, 'normal', 'emerald_forest');
 const currentRow = map.layers.length - 1;
 const state: GameState = { ...base, map, currentRow, currentNodeId: map.layers[currentRow][0].id, region: 'emerald_forest', act: 2, screen: 'reward', roster: [makeUnit('momo', true, 0, false)] };
 return { ...state, rewards: generateRewards(state) };
}
it('首领奖励卡不提前展示候选；强化锁定后选择属性确认', () => {
 const s = state(), dispatch = vi.fn();
 s.roster.push(makeUnit('lulu', true, 1, false));
 const view = render(createElement(RewardScreen, { state: s, dispatch }));
 expect(screen.queryByText('深渊蛇王')).toBeNull();
 fireEvent.click(screen.getByRole('button', {name: /领取：伙伴强化/}));
 expect(dispatch).toHaveBeenCalledWith({type:'PICK_REWARD', rewardId:'boss-boost'});
 const locked = gameReducer(s, { type:'PICK_REWARD', rewardId:'boss-boost' });
 view.rerender(createElement(RewardScreen, { state: locked, dispatch }));
 expect(screen.queryByText('伙伴招募')).toBeNull();
 expect(screen.queryByRole('combobox')).toBeNull();
 const partner = screen.getByRole('button', {name:/泡泡.*生命/});
 fireEvent.click(partner);
 expect(partner.getAttribute('aria-pressed')).toBe('true');
 fireEvent.click(screen.getByRole('button', {name:'速度＋2'}));
 fireEvent.click(screen.getByRole('button', {name:'确认强化速度＋2'}));
 expect(dispatch).toHaveBeenCalledWith({type:'PICK_REWARD', rewardId:'boss-boost', targetUid:s.roster[1].uid, stat:'spd'});
});
it('补给只允许选择药水后领取，不返回三选一', () => {
 const s = gameReducer(state(), {type:'PICK_REWARD', rewardId:'boss-supply'}), dispatch = vi.fn();
 render(createElement(RewardScreen, { state:s, dispatch }));
 fireEvent.change(screen.getByRole('combobox', {name:'补给药水'}), {target:{value:'spd_down'}});
 fireEvent.click(screen.getByRole('button', {name:'领取补给'}));
 expect(dispatch).toHaveBeenCalledWith({type:'PICK_REWARD', rewardId:'boss-supply', potionId:'spd_down'});
 expect(screen.queryByRole('button', {name:/返回/})).toBeNull();
});
