// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { CodexScreen } from '../src/ui/App';
import { SPECIAL_EGG_POOL, getMonster } from '../src/game/data/monsters';

vi.mock('../src/ui/imageCache', () => ({ getDecodedImage: () => ({}), preloadImages: () => Promise.resolve() }));
afterEach(cleanup);
it('四种蛋生生物只归入神秘生物目录', () => {
  const { container } = render(createElement(CodexScreen, { onClose: vi.fn() }));
  const group = screen.getByText('神秘生物').closest('.codex-group')!;
  expect(group.querySelectorAll('.codex-item')).toHaveLength(4);
  for (const id of SPECIAL_EGG_POOL) {
    const buttons = container.querySelectorAll(`[data-codex-id="${id}"]`);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].closest('.codex-group')).toBe(group);
    expect(group.textContent).toContain(getMonster(id).name);
  }
});
