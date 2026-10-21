import { Capacitor } from '@capacitor/core';

export const isAndroid = () => Capacitor.getPlatform() === 'android';

export function reportSaveError(): void {
  window.dispatchEvent(new Event('petcard-save-error'));
}

export async function readSaveFile(slot: number): Promise<string | null> {
  if (window.petCard) return window.petCard.loadGame(slot);
  if (!isAndroid()) return localStorage.getItem(`petCardSave_${slot}`);
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const path = `save_${slot}.json`;
  const files = await Filesystem.readdir({ directory: Directory.Data, path: '' });
  if (!files.files.some(file => file.name === path)) return null;
  const result = await Filesystem.readFile({ directory: Directory.Data, path, encoding: Encoding.UTF8 });
  return String(result.data);
}

export async function writeSaveFile(slot: number, json: string): Promise<void> {
  if (window.petCard) {
    if (!await window.petCard.saveGame(slot, json)) throw new Error('保存失败');
  } else if (isAndroid()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const path = `save_${slot}.json`;
    await Filesystem.writeFile({ directory: Directory.Data, path: `${path}.tmp`, data: json, encoding: Encoding.UTF8 });
    await Filesystem.rename({ directory: Directory.Data, from: `${path}.tmp`, to: path });
  } else localStorage.setItem(`petCardSave_${slot}`, json);
}

export async function removeSaveFile(slot: number): Promise<void> {
  if (window.petCard) {
    if (!await window.petCard.deleteSave(slot)) throw new Error('删除失败');
  } else if (isAndroid()) {
    if (await readSaveFile(slot) === null) return;
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.deleteFile({ directory: Directory.Data, path: `save_${slot}.json` });
  } else localStorage.removeItem(`petCardSave_${slot}`);
}

export async function shareSaveFile(slot: number, json: string): Promise<void> {
  if (isAndroid()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const file = await Filesystem.writeFile({ directory: Directory.Cache, path: `驯牌远征-存档${slot}.json`, data: json, encoding: Encoding.UTF8 });
    await Share.share({ title: '备份存档', files: [file.uri], dialogTitle: '保存或分享存档备份' });
  } else {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `驯牌远征-存档${slot}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
