import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

function saveFile(slot: number): string {
  return path.join(app.getPath('userData'), `save_${slot}.json`);
}

function registerIpc(): void {
  ipcMain.handle('save-game', (_event, slot: number, json: string) => {
    try {
      fs.writeFileSync(saveFile(slot), json, 'utf8');
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('load-game', (_event, slot: number) => {
    try {
      return fs.readFileSync(saveFile(slot), 'utf8');
    } catch {
      return null;
    }
  });
  ipcMain.handle('delete-save', (_event, slot: number) => {
    try {
      const fp = saveFile(slot);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.on('quit', () => app.quit());
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: '驯牌远征',
    backgroundColor: '#14101f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
