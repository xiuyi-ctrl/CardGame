// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../src/game/state/reducer';

const native = vi.hoisted(() => ({ files: new Map<string, string>(), fail: false }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' } }));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA', Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' },
  Filesystem: {
    readdir: vi.fn(async () => ({ files: [...native.files.keys()].map(name => ({ name })) })),
    readFile: vi.fn(async ({ path }: { path: string }) => ({ data: native.files.get(path) })),
    writeFile: vi.fn(async ({ path, data }: { path: string; data: string }) => {
      if (native.fail) throw new Error('storage full');
      native.files.set(path, data);
      return { uri: `file://${path}` };
    }),
    rename: vi.fn(async ({ from, to }: { from: string; to: string }) => {
      native.files.set(to, native.files.get(from)!); native.files.delete(from);
    }),
    deleteFile: vi.fn(async ({ path }: { path: string }) => { native.files.delete(path); }),
  },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn(async () => {}) } }));
import { clearDeletedSlot, deleteSave, deleteSaveMode, exportSave, importSave, listSaves, loadSave, persistSave } from '../src/ui/persistence';
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

beforeEach(() => {
  native.files.clear(); native.fail = false; localStorage.clear(); vi.clearAllMocks();
  for (let slot = 1; slot <= 6; slot++) clearDeletedSlot(slot);
});
afterEach(() => vi.restoreAllMocks());

describe('Android 私有存档', () => {
  it('同槽位并发保存串行执行，两个模式与最新状态均保留，不使用浏览器槽位', async () => {
    const main = { ...createInitialState(), saveSlot: 1, gold: 12 };
    const proficiency = { ...main, runMode: 'proficiency' as const, gold: 34 };
    await Promise.all([persistSave(main), persistSave(proficiency), persistSave({ ...main, gold: 56 })]);
    const loaded = await loadSave(1);
    expect(loaded?.main?.gold).toBe(56);
    expect(loaded?.proficiency?.gold).toBe(34);
    expect(localStorage.getItem('petCardSave_1')).toBeNull();
    expect(native.files.has('save_1.json.tmp')).toBe(false);
    expect((await listSaves())[0].main?.gold).toBe(56);
  });

  it('写入失败通知界面且旧文件不丢失，失败后仍可重试', async () => {
    const state = { ...createInitialState(), saveSlot: 1, gold: 10 };
    await persistSave(state);
    const listener = vi.fn();
    window.addEventListener('petcard-save-error', listener);
    native.fail = true;
    expect(await persistSave({ ...state, gold: 20 })).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
    expect((await loadSave(1))?.main?.gold).toBe(10);
    native.fail = false;
    expect(await persistSave({ ...state, gold: 30 })).toBe(true);
    expect((await loadSave(1))?.main?.gold).toBe(30);
    window.removeEventListener('petcard-save-error', listener);
  });

  it('删除单模式不影响另一模式，完整删除后旧自动保存不会复活槽位', async () => {
    const state = { ...createInitialState(), saveSlot: 2 };
    await persistSave(state);
    await persistSave({ ...state, runMode: 'proficiency' });
    expect(await deleteSaveMode(2, 'main')).toBe(true);
    expect((await loadSave(2))?.proficiency).toBeTruthy();
    expect((await loadSave(2))?.main).toBeNull();
    await deleteSave(2);
    expect(await persistSave(state)).toBe(false);
    expect(await loadSave(2)).toBeNull();
  });

  it('导入拒绝损坏与未来版本，不覆盖旧数据；有效导入更新槽位归属', async () => {
    const state = { ...createInitialState(), saveSlot: 1, gold: 30 };
    await persistSave(state);
    const old = native.files.get('save_1.json');
    for (const json of ['{bad', '{}', JSON.stringify({ saveVersion: 99, main: state })]) await expect(importSave(1, json)).rejects.toThrow();
    expect(native.files.get('save_1.json')).toBe(old);
    await importSave(3, old!);
    expect((await loadSave(3))?.main?.saveSlot).toBe(3);
  });

  it('备份写入缓存目录并调用原生分享，不申请公共存储权限', async () => {
    await persistSave({ ...createInitialState(), saveSlot: 1 });
    await exportSave(1);
    expect(Filesystem.writeFile).toHaveBeenLastCalledWith(expect.objectContaining({ directory: 'CACHE', encoding: 'utf8' }));
    expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ files: ['file://驯牌远征-存档1.json'] }));
  });
});
