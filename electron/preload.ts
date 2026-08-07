import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('petCard', {
  platform: process.platform,
  saveGame: (json: string): Promise<boolean> => ipcRenderer.invoke('save-game', json),
  loadGame: (): Promise<string | null> => ipcRenderer.invoke('load-game'),
  quit: (): void => ipcRenderer.send('quit'),
});
