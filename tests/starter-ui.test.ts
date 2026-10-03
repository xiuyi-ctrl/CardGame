// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInitialState } from '../src/game/state/reducer';
import { ProficiencyStarterScreen, StarterScreen } from '../src/ui/App';

afterEach(cleanup);

describe('开局生物选择界面', () => {
  it('主线先选两只同种主力，再选一只同伴后开局', () => {
    const dispatch = vi.fn();
    render(createElement(StarterScreen, { dispatch }));

    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(3);
    expect(document.querySelectorAll('.starter-choice.main-choice')).toHaveLength(3);
    const next = screen.getByRole('button', { name: '下一步：选择同伴' });
    expect((next as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /迅迅.*灵巧/ }));
    expect((next as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(next);

    expect(screen.getByText('已选主力：迅迅 ×2')).toBeTruthy();
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(3);
    expect(document.querySelectorAll('.starter-choice.main-choice')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /咪咪.*剧毒/ }));
    fireEvent.click(screen.getByRole('button', { name: '开始远征' }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'START_RUN', starterId: 'momo', companionId: 'mimi', seed: expect.any(Number),
    }));
  });

  it('主线返回重选时清除候选同伴', () => {
    const dispatch = vi.fn();
    render(createElement(StarterScreen, { dispatch }));
    fireEvent.click(screen.getByRole('button', { name: /泡泡.*治愈/ }));
    fireEvent.click(screen.getByRole('button', { name: '下一步：选择同伴' }));
    fireEvent.click(screen.getByRole('button', { name: '← 返回重选' }));
    expect(screen.queryByText('已选主力：泡泡 ×2')).toBeNull();
    expect((screen.getByRole('button', { name: '下一步：选择同伴' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '← 返回难度' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'SELECT_DIFFICULTY_BACK' });
  });

  it('熟练度只允许六选二，可取消并按选择顺序出发', () => {
    const dispatch = vi.fn();
    render(createElement(ProficiencyStarterScreen, { state: createInitialState(), dispatch }));
    expect(document.querySelectorAll('.starter-choice')).toHaveLength(6);
    expect(document.querySelectorAll('.starter-choice.main-choice')).toHaveLength(0);
    const depart = screen.getByRole('button', { name: '出发远征' });
    expect((depart as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /迅迅.*灵巧/ }));
    fireEvent.click(screen.getByRole('button', { name: /泡泡.*治愈/ }));
    fireEvent.click(screen.getByRole('button', { name: /灼灼.*进攻/ }));
    expect(screen.getByText('2/2')).toBeTruthy();
    expect(screen.getByRole('button', { name: /灼灼.*进攻/ }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: /泡泡.*治愈/ }));
    fireEvent.click(screen.getByRole('button', { name: /咪咪.*剧毒/ }));
    fireEvent.click(depart);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'START_PROFICIENCY_PICKED', starterId: 'momo', companionId: 'mimi',
    }));
    fireEvent.click(screen.getByRole('button', { name: '← 返回首页' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'TITLE' });
  });
});
