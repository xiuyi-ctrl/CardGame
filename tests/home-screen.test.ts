// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/ui/App';
import { createInitialState } from '../src/game/state/reducer';
import { clearDeletedSlot, loadSave } from '../src/ui/persistence';
import * as platform from '../src/ui/platform';

describe('主界面入口', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDeletedSlot(1);
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
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

  it('选中有记录的槽位时突出继续游戏', async () => {
    const saved = { ...createInitialState(), screen: 'map' as const, saveSlot: 1 };
    localStorage.setItem('petCardSave_1', JSON.stringify({ saveVersion: 1, main: saved, proficiency: null }));
    localStorage.setItem('petCardSaveSelected', '1');

    render(createElement(App));

    const continueButton = screen.getByRole('button', { name: '继续游戏' });
    await waitFor(() => expect(continueButton.hasAttribute('disabled')).toBe(false));
    expect(continueButton.className).toContain('home-action-primary');
    expect(screen.getByRole('button', { name: '新游戏' }).className).not.toContain('home-action-primary');
  });

  it.each([false, true])('确认覆盖后退出再继续进入新开局，保留成就和另一模式（熟练度记录：%s）', async (withProficiency) => {
    const old = { ...createInitialState(), screen: 'map' as const, saveSlot: 1, gold: 777,
      unlocks: { difficulties: ['normal', 'hard'], relics: ['elite_badge'], bestGrade: 'A', proficiencyUnlocked: true } };
    const proficiency = withProficiency ? { ...old, runMode: 'proficiency' as const, gold: 888 } : null;
    localStorage.setItem('petCardSave_1', JSON.stringify({ saveVersion: 1, main: old, proficiency }));
    localStorage.setItem('petCardSaveSelected', '1');
    render(createElement(App));
    await waitFor(() => expect(screen.getByRole('button', { name: '新游戏' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '新游戏' }));
    fireEvent.click(screen.getByRole('button', { name: '确定覆盖' }));
    await screen.findByRole('heading', { name: '选择地区' });
    fireEvent.click(screen.getByRole('button', { name: '返回首页' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '继续游戏' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '继续游戏' }));
    await screen.findByRole('heading', { name: '选择地区' });
    const saved = await loadSave(1);
    expect(saved?.main?.screen).toBe('region-select');
    expect(saved?.main?.gold).not.toBe(777);
    expect(saved?.main?.unlocks).toEqual(old.unlocks);
    expect(saved?.proficiency?.gold ?? null).toBe(withProficiency ? 888 : null);
  });

  it('取消覆盖不改变旧存档', async () => {
    const old = { ...createInitialState(), screen: 'map' as const, saveSlot: 1, gold: 777 };
    const json = JSON.stringify({ saveVersion: 1, main: old, proficiency: null });
    localStorage.setItem('petCardSave_1', json);
    localStorage.setItem('petCardSaveSelected', '1');
    render(createElement(App));
    await waitFor(() => expect(screen.getByRole('button', { name: '新游戏' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '新游戏' }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(localStorage.getItem('petCardSave_1')).toBe(json);
    expect(screen.getByRole('button', { name: '继续游戏' }).hasAttribute('disabled')).toBe(false);
  });

  it('覆盖写入失败时保留旧记录，不进入新开局', async () => {
    const old = { ...createInitialState(), screen: 'map' as const, saveSlot: 1, gold: 777 };
    const json = JSON.stringify({ saveVersion: 1, main: old, proficiency: null });
    localStorage.setItem('petCardSave_1', json);
    localStorage.setItem('petCardSaveSelected', '1');
    const write = vi.spyOn(platform, 'writeSaveFile').mockRejectedValueOnce(new Error('storage full'));
    render(createElement(App));
    await waitFor(() => expect(screen.getByRole('button', { name: '新游戏' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '新游戏' }));
    fireEvent.click(screen.getByRole('button', { name: '确定覆盖' }));
    await waitFor(() => expect(write).toHaveBeenCalledOnce());
    await loadSave(1);
    expect(localStorage.getItem('petCardSave_1')).toBe(json);
    expect(screen.queryByRole('heading', { name: '选择地区' })).toBeNull();
    expect(screen.getByRole('button', { name: '继续游戏' }).hasAttribute('disabled')).toBe(false);
  });
});
