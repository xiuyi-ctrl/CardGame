// 对照本次调整前保存的桌面截图；PNG 编码差异不视为像素变化。
const { app, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const output = path.resolve(__dirname, '../../dump');
app.whenReady().then(async () => {
  const before = JSON.parse(await fs.readFile(path.join(output, 'one-screen-desktop-before.json'), 'utf8'));
  const after = JSON.parse(await fs.readFile(path.join(output, 'mobile-layout/desktop-report.json'), 'utf8'));
  const results = [];
  for (const old of before) {
    if (old.error || old.errors?.length || !old.file) continue;
    const current = after.find(item => item.name === old.name && item.width === old.width);
    if (!current?.file) continue;
    const a = nativeImage.createFromPath(path.join(output, 'one-screen-desktop-baseline', old.file));
    const b = nativeImage.createFromPath(path.join(output, 'mobile-layout', current.file));
    const left = a.toBitmap(); const right = b.toBitmap();
    let changedPixels = 0;
    let bounds = null;
    if (!left.equals(right)) for (let i = 0; i < Math.max(left.length, right.length); i += 4) {
      if (left.readUInt32LE(i) === right.readUInt32LE(i)) continue;
      changedPixels++;
      const x = (i / 4) % a.getSize().width; const y = Math.floor(i / 4 / a.getSize().width);
      bounds = bounds ? [Math.min(bounds[0], x), Math.min(bounds[1], y), Math.max(bounds[2], x), Math.max(bounds[3], y)] : [x, y, x, y];
    }
    const geometryStable = ['clipped', 'concealed', 'horizontal'].every(key => JSON.stringify(old[key]) === JSON.stringify(current[key]));
    results.push({ name: old.name, width: old.width, height: old.height, changedPixels, bounds, geometryStable });
  }
  await fs.writeFile(path.join(output, 'one-screen-desktop-comparison.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ compared: results.length, exactPixels: results.filter(item => !item.changedPixels).length, differences: results.filter(item => item.changedPixels || !item.geometryStable) }, null, 2));
  app.exit(results.some(item => !item.geometryStable) ? 1 : 0);
}).catch(error => { console.error(error); app.exit(1); });
