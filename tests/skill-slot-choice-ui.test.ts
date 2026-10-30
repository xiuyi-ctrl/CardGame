// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SkillPickScreen } from '../src/ui/SkillPickScreen';
import { makeUnit } from '../src/game/core/battle';
import { createInitialState } from '../src/game/state/reducer';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it.each([false, true])('解锁技能槽后无取消按钮，仍可选择技能 mobile=%s', mobile => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const unit = makeUnit('momo', true, 0, false), dispatch = vi.fn();
  render(createElement(SkillPickScreen, { state: { ...createInitialState(), roster: [unit], skillPick: { uid: unit.uid, slot: 3, choices: ['punch'] } }, dispatch }));
  expect(screen.queryByRole('button', { name: /取消/ })).toBeNull();
  fireEvent.click(document.querySelector('.camp-skill-card')!);
  expect(dispatch).toHaveBeenCalledWith({ type: 'PROF_SLOT_PICK', skillId: 'punch' });
});
it('替换技能仍保留取消入口', () => {
  const unit = makeUnit('momo', true, 0, false), dispatch = vi.fn();
  render(createElement(SkillPickScreen, { state: { ...createInitialState(), roster: [unit], skillReplace: { uid: unit.uid, replaceIdx: -1, choices: [], refreshCount: 0 } }, dispatch }));
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(dispatch).toHaveBeenCalledWith({ type: 'PROF_SLOT_CANCEL' });
});
