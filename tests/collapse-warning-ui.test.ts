// @vitest-environment jsdom
import { createElement } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CollapseWarning } from '../src/ui/CollapseWarning';
import { BATTLE_COLLAPSE_WARNING_ROUND } from '../src/game/core/battle';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { createInitialState } from '../src/game/state/reducer';
import { BattleScreen } from '../src/ui/BattleScreen';

describe('崩解预警', () => {
  it('实战仅第13回合显示，开战不提示，确认后不重弹', () => {
    const battle = { ...createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 42), log: [] };
    const base = { ...createInitialState(), screen: 'battle' as const };
    const dispatch = vi.fn();
    const { container, rerender, unmount } = render(createElement(BattleScreen, { state: { ...base, battle }, dispatch }));
    try {
      expect(container.querySelector('.collapse-warning')).toBeNull();
      rerender(createElement(BattleScreen, { state: { ...base, battle: { ...battle, round: 13 } }, dispatch }));
      expect(container.querySelector('.collapse-warning')?.textContent).toContain('还有 2 回合');
      fireEvent.click(screen.getByRole('button', { name: '继续战斗', hidden: true }));
      expect(dispatch).toHaveBeenCalledWith({ type: 'ACK_COLLAPSE_WARNING' });
      rerender(createElement(BattleScreen, { state: { ...base, battle: { ...battle, round: 13, collapseWarningSeenRound: 13 } }, dispatch }));
      expect(container.querySelector('.collapse-warning')).toBeNull();
      rerender(createElement(BattleScreen, { state: { ...base, battle: { ...battle, round: 15 } }, dispatch }));
      expect(container.querySelector('.collapse-warning')).toBeNull();
    } finally { unmount(); }
  });
  it('触发前两回合首次展示紧凑弹窗，确认或Escape关闭', () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
    try {
      const confirm = vi.fn();
      render(createElement(CollapseWarning, { round: BATTLE_COLLAPSE_WARNING_ROUND, onConfirm: confirm }));
      expect(screen.getByRole('dialog')).toBeTruthy();
      expect(screen.getByRole('heading', { name: '战场崩解预警' })).toBeTruthy();
      expect(screen.getByText(/还有 2 回合/)).toBeTruthy();
      expect(screen.getByText(/首次5点/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: '继续战斗' }));
      expect(confirm).toHaveBeenCalledTimes(1);
      fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }));
      expect(confirm).toHaveBeenCalledTimes(2);
    } finally {
      cleanup();
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    }
  });
});
