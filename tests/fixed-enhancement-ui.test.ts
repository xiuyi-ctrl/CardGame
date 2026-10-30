// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BlacksmithScreen } from '../src/ui/BlacksmithScreen';
import { EnhanceStoneScreen } from '../src/ui/EnhanceStoneScreen';
import { EnhanceResetScreen } from '../src/ui/EnhanceResetScreen';
import { createInitialState } from '../src/game/state/reducer';
import { makeUnit } from '../src/game/core/battle';

afterEach(() => { cleanup(); document.getElementById('root')?.remove(); vi.unstubAllGlobals(); });
it.each([BlacksmithScreen, EnhanceStoneScreen, EnhanceResetScreen])('强化与还原预览均固定印记和水幕，电脑与手机共用数值：%s', Component => {
  const root = document.createElement('div'); root.id = 'root'; document.body.append(root);
  const initial = createInitialState(), unit = { ...makeUnit('momo', true, 0, false), skills: ['shadow_rift', 'tidal_domain'], growthPoints: 100, skillEnhancements: { 0: 2, 1: 2 } };
  const state = { ...initial, runMode: 'proficiency' as const, roster: [unit], inventory: { reset_stone: 2, skill_enhance_stone: 2 } };
  for (const mobile of [false, true]) {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const result = render(createElement(Component, { state, dispatch: vi.fn() }));
    fireEvent.click(result.container.querySelector('.training-pet')!);
    const check = (name: string, value: string) => {
      if (mobile) fireEvent.click(screen.getByRole('button', { name: `${name}${Component === EnhanceResetScreen ? '重置对比' : '强化对比'}` }));
      const text = mobile ? screen.getByRole('dialog').textContent! : result.container.textContent!;
      expect(text).toContain(value);
      expect(text).not.toMatch(/印记受伤\+[3456]|水幕减伤[3456]/);
      if (mobile) fireEvent.click(screen.getByRole('button', { name: `关闭${name}${Component === EnhanceResetScreen ? '重置对比' : '强化对比'}` }));
    };
    check('暗影裂隙', '印记受伤+2'); check('潮汐领域', '水幕减伤2');
    result.unmount();
  }
});
