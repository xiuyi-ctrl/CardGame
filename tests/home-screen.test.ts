// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import App from '../src/ui/App';
import { createInitialState } from '../src/game/state/reducer';

describe('主界面入口', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('无可继续存档时突出新游戏，保留所有入口', () => {
    render(createElement(App));

    expect(screen.getByRole('heading', { name: '驯牌远征' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '请先选择存档' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '新游戏' }).className).toContain('home-action-primary');
    for (const name of ['熟练度远征', '存档管理', '生物图鉴', '成就', '测试关卡', '退出游戏']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeTruthy();
    }
  });

  it('选中有记录的槽位时突出继续游戏', () => {
    const saved = { ...createInitialState(), screen: 'map' as const, saveSlot: 1 };
    localStorage.setItem('petCardSave_1', JSON.stringify({ saveVersion: 1, main: saved, proficiency: null }));
    localStorage.setItem('petCardSaveSelected', '1');

    render(createElement(App));

    const continueButton = screen.getByRole('button', { name: '继续游戏' });
    expect(continueButton.hasAttribute('disabled')).toBe(false);
    expect(continueButton.className).toContain('home-action-primary');
    expect(screen.getByRole('button', { name: '新游戏' }).className).not.toContain('home-action-primary');
  });
});
