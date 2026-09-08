import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('petCard', {
  platform: process.platform,
  saveGame: (slot: number, json: string): Promise<boolean> => ipcRenderer.invoke('save-game', slot, json),
  loadGame: (slot: number): Promise<string | null> => ipcRenderer.invoke('load-game', slot),
  deleteSave: (slot: number): Promise<boolean> => ipcRenderer.invoke('delete-save', slot),
  quit: (): void => ipcRenderer.send('quit'),
});
