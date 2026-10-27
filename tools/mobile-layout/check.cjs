/* 实际 Chromium 渲染验收；不使用 agent-browser，不连接用户浏览器或存档。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const repo = path.resolve(__dirname, '../..');
const output = path.join(repo, process.argv.find(arg => arg.startsWith('--output='))?.slice(9) ?? 'dump/mobile-layout');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('touch-events', 'enabled');
app.whenReady().then(async () => {
  const port = Number(process.argv.find(arg => arg.startsWith('--port='))?.slice(7)) || (process.argv.includes('--desktop') ? 5199 : 5198);
  const { createServer } = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;
  const server = await createServer({ root: repo, configFile: false, plugins: [{
    name: 'preview-private-screens', enforce: 'pre',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/src/ui/App.tsx')) return;
      const names = [...code.matchAll(/^function (\w+Screen)\(/gm)].map(m => m[1]);
      return `${code}\nexport { ${names.join(', ')} };`;
    },
  }, react()], server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } } });
  await server.listen();
  await fs.mkdir(output, { recursive: true });
  const win = new BrowserWindow({ show: false, width: 640, height: 320, useContentSize: true, webPreferences: { backgroundThrottling: false, partition: `mobile-layout-${process.pid}` } });
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) { errors.push(message); console.error(message); } });
  await win.loadURL(`http://127.0.0.1:${port}/tools/mobile-layout/index.html`);
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  const js = code => Promise.race([win.webContents.executeJavaScript(code, true), new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('Renderer check timed out')), 15000); timer.unref(); })]);
  for (let i = 0; i < 100 && !await js('!!window.preview'); i++) await new Promise(r => setTimeout(r, 100));
  const names = await js(`window.preview?.${process.argv.includes('--desktop') ? 'desktopNames' : 'names'}`);
  if (!names) throw Error('Preview did not load: ' + errors.join('\n'));
  const requested = process.argv.find(a => a.startsWith('--scenes='))?.slice(9).split(',');
  const sizes = process.argv.includes('--desktop') ? [[1280, 720], [1600, 900], [1920, 1080]] : process.argv.includes('--quick') ? [[640, 320]] : [[640, 320], [640, 360], [740, 360], [844, 390], [915, 412], [1024, 600]];
  const mobile = !process.argv.includes('--desktop');
  const oneScreen = new Set(['title', 'difficulty-select', 'starter', 'proficiency-select', 'formation', 'gauntlet-order', 'battle', 'reward', 'recruit', 'roster', 'postbattle', 'shop', 'shop-prof', 'rest', 'rest-fusion', 'rest-fusion-skill', 'revive-select', 'event', 'special', 'custom', 'boost', 'evolve', 'special-target', 'gameover', 'victory', 'inter_act', 'chest', 'tame-overflow', 'skill-pick', 'growth-menu', 'growth-transfer', 'blacksmith', 'enhance-stone', 'enhance-reset', 'arena3', 'proficiency-result', 'save-management', 'backpack-empty', 'battle-selected', 'battle-ally-shield-target', 'battle-ally-heal-target', 'roster-long', 'toast-recruit', 'toast-long', 'growth-selected', 'growth-return', 'skill-pick-long', 'event-long', 'revive-empty', 'chest-empty', 'proficiency-lost', 'skill-replace']);
  for (const name of ['postbattle-cursed', 'roster-cursed', 'tame-overflow-long', 'gauntlet-empty']) oneScreen.add(name);
  oneScreen.delete('proficiency-select'); // 此页按用户要求保留原有布局与内容。
  for (const name of ['battle-mirror-selected', 'battle-mirror-queued', 'battle-mirror-used']) oneScreen.add(name);
  oneScreen.add('battle-five-skills');
  oneScreen.add('battle-crystal-selected');
  for (const name of ['chest-creature', 'chest-creature-overflow']) oneScreen.add(name);
  oneScreen.add('battle-summary-long');
  oneScreen.add('watchtower-cards');
  for (const name of ['watchtower-utilities', 'watchtower-challenges', 'watchtower-training']) oneScreen.add(name);
  const results = [];
  for (const [width, height] of sizes) {
    win.setContentSize(width, height);
    // Windows 最小窗口宽度和 DPI 舍入不能决定验收视口；由 Chromium 显式模拟 CSS 尺寸。
    if (mobile) win.webContents.enableDeviceEmulation({ screenPosition: 'mobile', screenSize: { width, height }, viewPosition: { x: 0, y: 0 }, deviceScaleFactor: 1, viewSize: { width, height }, scale: 1 });
    await new Promise(r => setTimeout(r, 50));
    for (const name of requested ?? names) {
      errors.length = 0;
      try {
        const setup = await js(`window.preview.render(${JSON.stringify(name)},${mobile})`);
        await new Promise(r => setTimeout(r, 150));
        if (name.startsWith('battle-order-')) {
          await js('Promise.all([document.fonts.ready, ...[...document.images].map(i => i.decode().catch(() => {}))])');
          await win.webContents.capturePage();
          await new Promise(r => setTimeout(r, 100));
        }
        if (setup) for (const step of setup.split('|')) {
          if (step.startsWith('hold:')) {
            const selector = JSON.stringify(step.slice(5));
            await js(`(() => { const el = document.querySelector(${selector}); if (!el) throw Error('Missing hold target'); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true, pointerId: 1 })); })()`);
            await new Promise(r => setTimeout(r, 500));
            await js(`document.querySelector(${selector}).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', isPrimary: true, pointerId: 1 }))`);
            continue;
          }
          await js(`(() => { const step = ${JSON.stringify(step)}; if(step==='file:backup') { const input=document.querySelector('input[type=file]'); const transfer=new DataTransfer(); transfer.items.add(new File([window.preview.backupJson],'preview.json',{type:'application/json'})); input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true})); return; } if(step.startsWith('range:')) { const el=document.querySelector('input[type=range]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,step.slice(6)); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return; } const el = step.startsWith('.') ? document.querySelector(step) : [...document.querySelectorAll('button')].find(b => b.textContent.includes(step)); if (!el) throw Error('Missing setup: ' + step); el.click(); })()`);
          await new Promise(r => setTimeout(r, 60));
        }
        if (name.startsWith('battle-order-')) {
          const feedback = await js(`({ ready: !!document.querySelector('.battle-order-ready'), target: !!document.querySelector('.order-target-mark'), slots: [...document.querySelectorAll('.player-area .formation-slot:not(.empty)')].map(el => el.className) })`);
          if (!feedback.ready || !feedback.target) throw Error('Missing order feedback: ' + JSON.stringify(feedback));
          const pulse = await js(`(() => { const ring = document.querySelector('.order-confirm-ring'); ring?.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = 120; }); return !!ring; })()`);
          if (!pulse) throw Error('Missing confirmation ring');
          await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
          await win.webContents.capturePage();
          await new Promise(r => setTimeout(r, 50));
          await fs.writeFile(path.join(output, `${name}-${width}x${height}-confirm.png`), (await win.webContents.capturePage()).toPNG());
        }
        if (height > width) await js(`document.querySelector('.mobile-rotate-hint button')?.click()`);
        await js('Promise.all([document.fonts.ready, ...[...document.images].map(i => i.decode().catch(() => {}))])');
        const toastFrames = await js(`(async () => {
          const toast = document.querySelector('.toast');
          if (!toast) return [];
          const inlineAnimation = toast.style.animation;
          toast.style.animation = 'none';
          void toast.offsetHeight;
          toast.style.animation = inlineAnimation;
          void toast.offsetHeight;
          const animations = toast.getAnimations();
          animations.forEach(animation => animation.pause());
          const frames = [];
          for (const time of [0, 16, 80, 150, 299, 320, 2200, 2350]) {
            animations.forEach(animation => { animation.currentTime = time; });
            await new Promise(requestAnimationFrame);
            const rect = toast.getBoundingClientRect();
            frames.push({ time, x: rect.x, y: rect.y, w: rect.width, h: rect.height });
          }
          animations.forEach(animation => { animation.currentTime = 320; });
          await new Promise(requestAnimationFrame);
          return frames;
        })()`);
        const resizeChecks = [];
        if (mobile && process.argv.includes('--resize')) {
          const selection = await js(`JSON.stringify([...document.querySelectorAll('[aria-pressed=true]')].map(el => el.getAttribute('aria-label') || el.textContent))`);
          for (const [rw, rh] of [[915, 412], [740, 360], [width, height]]) {
            win.webContents.enableDeviceEmulation({ screenPosition: 'mobile', screenSize: { width: rw, height: rh }, viewPosition: { x: 0, y: 0 }, deviceScaleFactor: 1, viewSize: { width: rw, height: rh }, scale: 1 });
            await new Promise(r => setTimeout(r, 120));
            const resized = await js(`(() => { const selected = JSON.stringify([...document.querySelectorAll('[aria-pressed=true]')].map(el => el.getAttribute('aria-label') || el.textContent)); return { width: innerWidth, height: innerHeight, selectionStable: selected === ${JSON.stringify(selection)}, documentOverflow: document.documentElement.scrollWidth > innerWidth + 2 }; })()`);
            const screenshot = `${name}-runtime-${rw}x${rh}.png`;
            await fs.writeFile(path.join(output, screenshot), (await win.webContents.capturePage()).toPNG());
            resizeChecks.push({ ...resized, file: screenshot });
          }
        }
        const metrics = await js(`(() => {
          const rect = el => { const r = el.getBoundingClientRect(); return { x:r.x, y:r.y, w:r.width, h:r.height }; };
          const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
          const outside = el => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth+1 || r.top < -1 || r.bottom > innerHeight+1; };
          const scrollParent = el => { for(let p=el.parentElement; p && p!==document.body; p=p.parentElement) if(/auto|scroll/.test(getComputedStyle(p).overflowY) && p.scrollHeight>p.clientHeight+1) return p; return null; };
          const masks = [...document.querySelectorAll('.confirm-overlay,.save-mgmt-overlay,.battle-overlay-mask,.growth-modal-overlay,.overlay,.mobile-system-overlay,.mobile-log-open,.watchtower-detail-overlay')].filter(visible).sort((a,b)=>Number(getComputedStyle(a).zIndex||0)-Number(getComputedStyle(b).zIndex||0));
          const topMask = document.querySelector('dialog:modal') ?? masks.at(-1);
          const buttons = [...(topMask??document).querySelectorAll('button')].filter(visible);
          const concealed = buttons.filter(b => { if (scrollParent(b)) return false; const r=b.getBoundingClientRect(); for(let p=b.parentElement; p && p!==document.body; p=p.parentElement) { const s=getComputedStyle(p); if(!/hidden|clip/.test(s.overflowY)) continue; const a=p.getBoundingClientRect(); if(r.bottom>a.bottom+2 || r.top<a.top-2) return true; } return false; }).map(b=>({text:b.textContent.trim().slice(0,40),...rect(b)}));
          const clipped = buttons.filter(b => outside(b) && !scrollParent(b)).map(b => ({text:b.textContent.trim().slice(0,40), ...rect(b)}));
          const horizontal = [...document.querySelectorAll('#root *')].filter(visible).filter(el => { const r=el.getBoundingClientRect(); return (r.left < -2 || r.right > innerWidth+2) && !el.closest('.map-canvas') && !/fixed|absolute/.test(getComputedStyle(el).position) && !scrollParent(el); }).slice(0,12).map(el=>({tag:el.tagName,cls:el.className,...rect(el)}));
          const scrolls = [...document.querySelectorAll('#root *')].filter(el=>visible(el)&&/auto|scroll/.test(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+2).map(el=>({cls:el.className,h:el.clientHeight,content:el.scrollHeight}));
          const smallTargets = buttons.filter(b=>{const r=b.getBoundingClientRect();return r.width<43.5||r.height<43.5}).map(b=>({text:b.textContent.trim().slice(0,30),...rect(b)}));
          const blocked = buttons.filter(b=> !b.disabled && !outside(b) && !scrollParent(b)).filter(b=>{ const r=b.getBoundingClientRect(); const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2); return hit && !b.contains(hit); }).map(b=>b.textContent.trim().slice(0,30));
          const scrollTails = [...document.querySelectorAll('#root *')].filter(el=>visible(el)&&/auto|scroll/.test(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+2).map(el=>{ const initial=el.scrollTop; el.scrollTop=el.scrollHeight; const atEnd=Math.abs(el.scrollTop+el.clientHeight-el.scrollHeight)<=2; el.scrollTop=initial; return {cls:el.className,atEnd,usable:el.clientHeight>0}; });
          const toast = document.querySelector('.toast');
          const toastBounds = toast ? rect(toast) : null;
          const toastTooLarge = toast && (outside(toast) || toast.getBoundingClientRect().height > innerHeight * .4);
          const rosterActions = [...document.querySelectorAll('.ordinary-detail-actions button')].filter(visible);
          const overlappingActions = rosterActions.flatMap((a, index) => rosterActions.slice(index + 1).filter(b => { const x = a.getBoundingClientRect(), y = b.getBoundingClientRect(); return Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1; }).map(b => [a.textContent.trim(), b.textContent.trim()]));
          const oneScreenOverflow = ${mobile && height < width && oneScreen.has(name)} && !topMask ? scrolls : [];
          const portraitOverlap = [...document.querySelectorAll('.postbattle-detail-portrait canvas, .postbattle-detail-portrait img')].filter(visible).filter(el => {
            const box = el.parentElement.getBoundingClientRect(), art = el.getBoundingClientRect();
            const stats = document.querySelector('.postbattle-detail-stats')?.getBoundingClientRect();
            const outsideBox = art.top < box.top - 1 || art.bottom > box.bottom + 1;
            const hitsStats = stats && Math.min(art.right, stats.right) - Math.max(art.left, stats.left) > 1 && Math.min(art.bottom, stats.bottom) - Math.max(art.top, stats.top) > 1;
            return outsideBox || hitsStats;
          }).map(el => rect(el));
          return {viewport:[innerWidth,innerHeight],mobile:document.documentElement.classList.contains('mobile-ui'),clipped,concealed,horizontal,scrolls,oneScreenOverflow,overlappingActions,portraitOverlap,scrollTails,smallTargets,blocked,toastBounds,toastTooLarge,buttons:buttons.length, text:document.getElementById('root').textContent.slice(0,160)};
        })()`);
        const file = `${name}-${width}x${height}${mobile ? '' : '-desktop'}.png`;
        await fs.writeFile(path.join(output, file), (await win.webContents.capturePage()).toPNG());
        results.push({ name, width, height, file, ...metrics, toastFrames, resizeChecks, errors: [...errors] });
        console.log(`${name} ${width}x${height}: clipped=${metrics.clipped.length} concealed=${metrics.concealed.length} horizontal=${metrics.horizontal.length} errors=${errors.length}`);
      } catch (error) { results.push({ name, width, height, error: String(error), errors: [...errors] }); console.error(name, String(error)); }
    }
  }
  const reportPath = path.join(output, mobile ? 'report.json' : 'desktop-report.json');
  const previous = process.argv.includes('--merge') ? JSON.parse(await fs.readFile(reportPath, 'utf8')) : [];
  const merged = [...previous.filter(old=>!results.some(r=>r.name===old.name&&r.width===old.width&&r.height===old.height)), ...results];
  await fs.writeFile(reportPath, JSON.stringify(merged, null, 2));
  const failures = merged.filter(r => r.error || r.errors?.length || r.clipped?.length || r.concealed?.length || r.horizontal?.length || r.portraitOverlap?.length || r.toastTooLarge
    || r.resizeChecks?.some(check => !check.selectionStable || check.documentOverflow)
    || r.toastFrames?.some(frame => frame.h > r.height * .4 || frame.x < -2 || frame.y < -2 || frame.x + frame.w > r.width + 2 || frame.y + frame.h > r.height + 2)
    || (mobile && (r.smallTargets?.length || r.blocked?.length || r.overlappingActions?.length || r.oneScreenOverflow?.length || r.scrollTails?.some(s=>!s.atEnd||!s.usable)))
    || r.buttons === 0 || Math.abs(r.viewport?.[0] - r.width) > 1 || Math.abs(r.viewport?.[1] - r.height) > 1);
  const cssHash = require('node:crypto').createHash('sha256').update(await fs.readFile(path.join(repo, 'src/ui/mobile.css'))).digest('hex');
  const stylesHash = require('node:crypto').createHash('sha256').update(await fs.readFile(path.join(repo, 'src/ui/styles.css'))).digest('hex');
  await fs.writeFile(path.join(output, mobile ? 'run.json' : 'desktop-run.json'), JSON.stringify({ cssHash, stylesHash, cases: merged.length, freshCases: results.length, retainedCases: previous.length ? merged.length - results.length : 0, failures: failures.map(r=>({name:r.name,width:r.width,height:r.height})), sizes }, null, 2));
  const escape = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const rows = merged.map(r=>`<tr><td>${escape(r.name)}</td><td>${r.width}×${r.height}</td><td>${r.error ? escape(r.error) : `越界 ${r.clipped.length} / 裁切 ${r.concealed.length} / 横溢 ${r.horizontal.length} / 小触点 ${r.smallTargets.length} / 遮挡 ${r.blocked.length}`}</td><td>${r.file ? `<a href="${escape(r.file)}">截图</a>` : ''}</td></tr>`).join('');
  await fs.writeFile(path.join(output, mobile ? 'index.html' : 'desktop.html'), `<!doctype html><meta charset="UTF-8"><title>布局验收</title><style>body{font:14px system-ui;margin:20px;background:#fff9e9;color:#101c2c}table{border-collapse:collapse}td,th{border:1px solid #8a979b;padding:6px;text-align:left}</style><h1>${mobile ? '手机' : '桌面'}实际渲染验收</h1><p>此报告检查已列出的夹具，不代表 Android 真机系统栏、字体放大或原生分享流程已经验收。</p><table><tr><th>页面／状态</th><th>CSS视口</th><th>自动几何检查</th><th>视觉证据</th></tr>${rows}</table>`);
  console.log(`Rendered ${results.length} cases to ${output}; report=${merged.length}, failed=${failures.length}`);
  win.destroy();
  await server.close();
  app.exit(failures.length ? 2 : 0);
}).catch(error => { console.error(error); app.exit(1); });
