// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInitialState } from '../src/game/state/reducer';
import type { GameState } from '../src/game/state/game';
import { RewardScreen } from '../src/ui/App';

afterEach(cleanup);

function state(): GameState {
  return {
    ...createInitialState(), screen: 'reward',
    rewards: [{ id: 'recruit', label: '招募', desc: '从两位候选伙伴中选择一位', kind: 'recruit', recruitCandidates: ['momo', 'fifi_king'] }],
  };
}

describe('招募奖励候选界面', () => {
  it('奖励卡只显示通用图标，不提前展示候选的名称或图片', () => {
    const dispatch = vi.fn();
    const { container } = render(createElement(RewardScreen, { state: state(), dispatch }));
    expect(screen.queryByText('迅迅')).toBeNull();
    expect(screen.queryByText('灼刃')).toBeNull();
    expect(container.querySelector('.recruit-candidate-list')).toBeNull();
    expect(container.querySelector('.reward-choice-icon img')?.getAttribute('src')).toBe('/starter-growth-icons/starter-paw.png');
    fireEvent.click(screen.getByRole('button', { name: '领取：招募，从两位候选伙伴中选择一位' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_REWARD', rewardId: 'recruit' });
  });

  it('揭晓后展示双卡详情，无返回入口、下一形态和融合信息', () => {
    const dispatch = vi.fn();
    const { container } = render(createElement(RewardScreen, { state: { ...state(), pendingRecruitRewardId: 'recruit' }, dispatch }));
    expect(container.querySelectorAll('.recruit-candidate')).toHaveLength(2);
    expect(screen.getByText('迅迅')).toBeTruthy();
    expect(screen.getByText('灼刃')).toBeTruthy();
    expect(screen.getByText('迅捷')).toBeTruthy();
    expect(screen.getByText(/战斗开始速度/)).toBeTruthy();
    expect(container.querySelectorAll('.recruit-portrait')).toHaveLength(2);
    expect(container.querySelectorAll('.recruit-stats')).toHaveLength(2);
    expect(container.querySelectorAll('.recruit-overview > .recruit-portrait')).toHaveLength(2);
    expect(container.querySelectorAll('.recruit-identity > h3')).toHaveLength(2);
    expect(container.querySelectorAll('.recruit-identity > .recruit-stats')).toHaveLength(2);
    expect(screen.queryByText(/下一形态|同物种|融合|最终形态/)).toBeNull();
    expect(screen.getByText('爪击')).toBeTruthy();
    expect(container.querySelectorAll('.recruit-skills .skill-desc')).toHaveLength(0);
    expect(container.querySelectorAll('.recruit-skills .skill-tag')).toHaveLength(5);
    expect(screen.queryByText('攻击单个敌人')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '确认招募 迅迅' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'PICK_REWARD', rewardId: 'recruit', monsterId: 'momo' });
    expect(screen.queryByRole('button', { name: /返回|取消/ })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
