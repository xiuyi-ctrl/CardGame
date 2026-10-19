// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { makeUnit } from '../src/game/core/battle';
import { createInitialState } from '../src/game/state/reducer';
import type { GameState } from '../src/game/state/game';
import { FusionConfirm } from '../src/ui/App';

afterEach(cleanup);

describe('融合确认信息', () => {
  it('仅显示融合结果，多材料仍需明确选择，不展示过程信息', () => {
    const primary = { ...makeUnit('momo', true, 1, false), bonusStats: { hp: 5, spd: 2 }, curse: 'spdDown' as const };
    const first = makeUnit('momo', true, 0, false);
    const chosen = { ...makeUnit('momo', true, 2, false), bonusStats: { hp: 10 } };
    const state: GameState = { ...createInitialState(), screen: 'roster', roster: [primary, first, chosen], field: [primary.uid, chosen.uid] };
    const dispatch = vi.fn();
    const onClose = vi.fn();
    const { container } = render(createElement(FusionConfirm, { primary, state, dispatch, onClose }));
    expect(screen.getByRole('dialog', { name: '确认融合' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '确定融合' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('迅牙')).toBeTruthy();
    expect(screen.getByText(/永久强化：生命 \+5、速度 \+2；诅咒：迟缓/)).toBeTruthy();
    expect(screen.getByText(/新形态被动：迅力/)).toBeTruthy();
    expect(Array.from(container.querySelectorAll('.fusion-result-skills .skill-name')).map(el => el.textContent)).toEqual(['叶针', '连击', '冲击波']);
    fireEvent.change(screen.getByRole('combobox', { name: '融合材料' }), { target: { value: chosen.uid } });
    expect(screen.queryByText(/队伍人数|空出一个出战位置|保留主宠|将被消耗/)).toBeNull();
    expect(container.querySelectorAll('.fusion-pet-row')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '确定融合' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'FUSE', primaryUid: primary.uid, materialUid: chosen.uid });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('单一待处理材料默认选中，取消不派发融合', () => {
    const primary = makeUnit('momo_queen', true, 0, false);
    const material = makeUnit('momo_queen', false, 0, false);
    const state: GameState = { ...createInitialState(), screen: 'tame-overflow', roster: [primary], tameOverflow: [material] };
    const dispatch = vi.fn();
    const onClose = vi.fn();
    render(createElement(FusionConfirm, { primary, state, dispatch, onClose }));
    expect(screen.queryByRole('combobox', { name: '融合材料' })).toBeNull();
    expect(screen.queryByText(/队伍人数/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '确定融合' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'TAME_OVERFLOW_FUSE', primaryUid: primary.uid, tameUid: material.uid });
  });

  it('新伙伴处理中选择队伍内材料，仍走队伍内融合动作', () => {
    const primary = makeUnit('momo', true, 0, false);
    const material = makeUnit('momo', true, 1, false);
    const state: GameState = { ...createInitialState(), screen: 'tame-overflow', roster: [primary, material], tameOverflow: [makeUnit('fifi', false, 0, false)] };
    const dispatch = vi.fn();
    render(createElement(FusionConfirm, { primary, state, dispatch, onClose: vi.fn() }));
    fireEvent.click(screen.getByRole('button', { name: '确定融合' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'FUSE_IN_OVERFLOW', uid: primary.uid, materialUid: material.uid });
  });
});
