// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { createBattle, makeUnit } from '../src/game/core/battle';
import { createInitialState } from '../src/game/state/reducer';
import { BattleScreen } from '../src/ui/BattleScreen';

afterEach(cleanup);

describe('战斗功能入口图标', () => {
  it('捕获、道具、换位使用独立图片，按钮文字与操作入口保留', () => {
    const battle = createBattle([makeUnit('momo', true, 0, false)], [{ speciesId: 'kiki' }], 42);
    const state = { ...createInitialState(), screen: 'battle' as const, battle };
    const { container } = render(createElement(BattleScreen, { state, dispatch: vi.fn() }));
    expect(container.querySelector('.battle-hud-ap, .end-ap')).toBeNull();
    expect(screen.queryByText(/\bAP\b|行动点/)).toBeNull();

    for (const [label, name] of [['捕获', 'capture'], ['道具', 'item'], ['换位', 'swap']]) {
      const button = screen.getByRole('button', { name: label });
      expect(button.querySelector('img')?.getAttribute('src')).toBe(`/battle-action-icons/${name}.png`);
      expect(button.querySelector('svg')).toBeNull();
    }
  });
});
