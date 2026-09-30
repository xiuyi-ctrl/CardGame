// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { makeUnit } from '../src/game/core/battle';
import { createInitialState } from '../src/game/state/reducer';
import { PostBattleRosterScreen } from '../src/ui/App';

afterEach(cleanup);

function postBattleState(runMode: 'main' | 'proficiency' = 'main') {
  const roster = [
    makeUnit('momo', true, 0, false),
    makeUnit('lulu', true, 1, false),
    { ...makeUnit('momo', true, 2, false), hp: 8 },
  ];
  return { ...createInitialState(), screen: 'roster' as const, postBattle: true, runMode, roster, field: [roster[0].uid] };
}

describe('战后休整界面', () => {
  it('只查看存活伙伴，不提供换阵；融合和释放沿用确认流程', () => {
    const state = postBattleState();
    const dispatch = vi.fn();
    const { container } = render(createElement(PostBattleRosterScreen, { state, dispatch }));

    expect(screen.getByText('战后休整')).toBeTruthy();
    expect(screen.getByText('战斗胜利')).toBeTruthy();
    expect(container.querySelectorAll('.postbattle-pet')).toHaveLength(3);
    expect(container.querySelectorAll('.postbattle-empty')).toHaveLength(5);
    expect(screen.queryByText('出战阵容')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '查看泡泡，生命14/14，速度1' }));
    expect(screen.getByRole('heading', { name: '泡泡' })).toBeTruthy();
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_FIELD' }));

    fireEvent.click(screen.getByRole('button', { name: '查看迅迅，生命8/10，速度5' }));
    expect(screen.getByText('融合条件：同物种 2 / 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '融合进化' }));
    expect(screen.getByText('确认融合')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    fireEvent.click(screen.getByRole('button', { name: '释放' }));
    expect(screen.getByText('确认释放')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    fireEvent.click(screen.getByRole('button', { name: '继续前进 →' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'NEXT_NODE' });
  });

  it('熟练度远征不显示普通融合入口', () => {
    const state = postBattleState('proficiency');
    render(createElement(PostBattleRosterScreen, { state, dispatch: vi.fn() }));
    expect(screen.queryByRole('button', { name: '融合进化' })).toBeNull();
    expect(screen.getByRole('button', { name: '释放' })).toBeTruthy();
  });
});
