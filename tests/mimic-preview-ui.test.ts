// @vitest-environment jsdom
import { createElement } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MimicPreview } from '../src/ui/MimicPreview';
import { makeUnit } from '../src/game/core/battle';

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

describe('万变开战预览', () => {
  it('四个重复技能均展示，确认按钮与同名限制说明可见', () => {
    const unit = { ...makeUnit('mimic_beast', true, 0, false), skills: Array(4).fill('claw_attack') };
    const confirm = vi.fn();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(createElement(MimicPreview, { units: [unit], onConfirm: confirm }));
      expect(screen.getByRole('dialog')).toBeTruthy();
      expect(screen.getAllByText('爪击')).toHaveLength(4);
      expect(screen.getByText(/同名技能共享冷却与次数/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: '开始战斗' }));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(errors).not.toHaveBeenCalled();
    } finally { errors.mockRestore(); }
  });
  it('双方百变兽都展示本场结果，首领技能保留完整效果与次数', () => {
    const ally = { ...makeUnit('mimic_beast', true, 0, false), skills: ['growth_bind', 'growth_roar', 'punch', 'nine_tail_wildfire'] };
    const enemy = { ...makeUnit('mimic_beast', false, 0, false), skills: Array(4).fill('claw_attack') };
    render(createElement(MimicPreview, { units: [ally, enemy], onConfirm: vi.fn() }));
    expect(screen.getByText('我方 · 百变兽')).toBeTruthy(); expect(screen.getByText('敌方 · 百变兽')).toBeTruthy();
    expect(screen.getByText('成长束缚')).toBeTruthy(); expect(screen.getByText('每场限 3 次')).toBeTruthy();
  });
});
