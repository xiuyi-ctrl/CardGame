/* 捕获反馈的真实Chromium帧序列；使用独立内存夹具，不访问玩家存档。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const repo = path.resolve(__dirname, '../..');
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  const { createServer } = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;
  const server = await createServer({ root: repo, configFile: false, plugins: [{ name: 'private-screens', enforce: 'pre', transform(code, id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/ui/App.tsx')) return;
    const names = [...code.matchAll(/^function (\w+Screen)\(/gm)].map(match => match[1]);
    return `${code}\nexport { ${names.join(', ')} };`;
  } }, react()], server: { host: '127.0.0.1', port: 5207, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } } });
  await server.listen();
  const output = path.join(repo, 'dump/battle-capture-feedback');
  await fs.mkdir(output, { recursive: true });
  const win = new BrowserWindow({ show: false, width: 844, height: 390, useContentSize: true, webPreferences: { offscreen: true, backgroundThrottling: false, partition: `feedback-${process.pid}` } });
  win.webContents.setFrameRate(60);
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) { errors.push(message); console.error(message); } });
  await win.loadURL('http://127.0.0.1:5207/tools/mobile-layout/index.html');
  const js = code => win.webContents.executeJavaScript(code, true);
  for (let i = 0; i < 100 && !await js('!!window.preview'); i++) await new Promise(resolve => setTimeout(resolve, 100));
  const cases = ['capture-preview','capture-feed','capture-success','capture-fail'];
  const sizes = [[640,320],[640,360],[740,360],[844,390],[915,412],[1024,600],[1600,900]];
  const report = [];
  for (const [width,height] of sizes) {
    const mobile = width < 1200;
    win.setContentSize(width,height);
    win.webContents.enableDeviceEmulation({ screenPosition: 'mobile', screenSize: { width,height }, viewPosition: { x:0,y:0 }, deviceScaleFactor:1, viewSize:{ width,height }, scale:1 });
    for (const kind of cases) {
      const name = `battle-feedback-${kind}`;
      await js(`window.preview.render('${name}',${mobile})`);
      await js('Promise.all([document.fonts.ready,...[...document.images].map(image=>image.decode().catch(()=>{}))])');
      await new Promise(resolve=>setTimeout(resolve,80));
      await js('window.preview.resumeFeedback()');
      await js(`window.preview.startFeedback('${name}')`);
      if (kind === 'capture-preview' && !mobile) {
        const point = await js(`(() => { const r=document.querySelector('.tame-target').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; })()`);
        win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
      }
      await new Promise(resolve=>setTimeout(resolve,kind==='capture-success'||kind==='capture-fail'?520:205));
      await js('window.preview.pauseFeedback()');
      await js(`(async () => {
        document.querySelector('.battle-screen').style.setProperty('--battle-fx-play','paused');
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        document.querySelectorAll('.battle-screen .dmg-pop, .battle-sprite, .battle-sprite > *').forEach(element=>element.getAnimations().forEach(animation=>{animation.pause();animation.currentTime=element.matches('.dmg-pop')?250:100;}));
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      })()`);
      await win.webContents.capturePage();
      await new Promise(resolve=>setTimeout(resolve,35));
      const state = await js(`(() => {
        const field=document.querySelector('.battle-field').getBoundingClientRect();
        const pops=[...document.querySelectorAll('.dmg-pop,.tame-tip')].map(pop=>{const r=pop.getBoundingClientRect();return {text:pop.textContent,kind:pop.className,x:r.x,y:r.y,w:r.width,h:r.height,inside:r.x>=field.x-1&&r.right<=field.right+1&&r.y>=field.y-1&&r.bottom<=field.bottom+1};});
        const end=[...document.querySelectorAll('button')].find(button=>button.textContent.includes('结束回合'));
        return {pops,viewport:[innerWidth,innerHeight],endVisible:!!end&&end.getBoundingClientRect().bottom<=innerHeight};
      })()`);
      const file = `${kind}-${width}x${height}.png`;
      await fs.writeFile(path.join(output,file),(await win.webContents.capturePage()).toPNG());
      report.push({kind,width,height,file,...state});
      // 代表性连击额外保存连续帧，核对动作、数字与血量变化。
      if (kind !== 'capture-preview' && (width === 844 || width === 1600)) {
        await js(`window.preview.resumeFeedback();document.querySelectorAll('.battle-screen .dmg-pop, .battle-sprite, .battle-sprite > *').forEach(element=>element.getAnimations().forEach(animation=>animation.play()))`);
        for (let frame = 1; frame <= 4; frame++) {
          await new Promise(resolve=>setTimeout(resolve,120));
          await fs.writeFile(path.join(output,`${kind}-${width}x${height}-frame${frame}.png`),(await win.webContents.capturePage()).toPNG());
        }
      }
    }
  }
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify({cases:report,errors},null,2));
  const failures=report.filter(test=>(!test.pops.length&&test.kind!=='capture-feed')||test.pops.some(pop=>!pop.inside)||!test.endVisible);
  console.log(JSON.stringify({cases:report.length,failures:failures.map(test=>({kind:test.kind,width:test.width,height:test.height})),errors}));
  win.destroy(); await server.close(); app.exit(failures.length||errors.length?2:0);
}).catch(error=>{console.error(error);app.exit(1);});
