const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const output = path.resolve(__dirname, '../../dump/mobile-layout');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  const files = (await fs.readdir(output)).filter(f => f.endsWith('-640x320.png')).sort();
  const win = new BrowserWindow({ show: false, width: 1600, height: 1000, useContentSize: true });
  for (let i = 0; i < files.length; i += 12) {
    const tiles = files.slice(i, i + 12).map(file => `<figure><figcaption>${file}</figcaption><img src="${file}"></figure>`);
    const html = path.join(output, `gallery-${1 + i / 12}.html`);
    await fs.writeFile(html, `<html><head><style>*{box-sizing:border-box}body{margin:0;background:#384650;display:grid;grid-template-columns:repeat(4,1fr);gap:4px}figure{margin:0;min-width:0}figcaption{height:24px;color:white;font:16px sans-serif}img{width:100%;height:200px;object-fit:contain;display:block}</style></head><body>${tiles.join('')}</body></html>`);
    await win.loadFile(html);
    await win.webContents.executeJavaScript('Promise.all([...document.images].map(i=>i.decode()))');
    await fs.writeFile(path.join(output, `gallery-${1 + i / 12}.png`), (await win.webContents.capturePage()).toPNG());
  }
  win.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
