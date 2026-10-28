// @vitest-environment jsdom
import { createElement } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CollapseWarning } from '../src/ui/CollapseWarning';

describe('崩解预警', () => {
  it.each([1, 15])('第%s回合紧凑弹窗，确认或Escape关闭', round => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
    try {
      const confirm = vi.fn();
      render(createElement(CollapseWarning, { round, onConfirm: confirm }));
      expect(screen.getByRole('dialog')).toBeTruthy();
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
