import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { persistSave } from './persistence';
import { isAndroid } from './platform';
import { MobileVersion } from './MobileVersion';

const backActions: { run: () => void; priority: number }[] = [];

export function useBackAction(active: boolean, run: () => void, priority = 0): void {
  const latest = useRef(run);
  useLayoutEffect(() => { latest.current = run; });
  useEffect(() => {
    if (!active) return;
    const action = { run: () => latest.current(), priority };
    backActions.push(action);
    return () => { const index = backActions.indexOf(action); if (index >= 0) backActions.splice(index, 1); };
  }, [active, priority]);
}

export function useMobileLayout(): boolean {
  const query = '(pointer: coarse) and (max-width: 1200px)';
  const [mobile, setMobile] = useState(() => isAndroid() || (typeof matchMedia !== 'undefined' && matchMedia(query).matches));
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const media = matchMedia(query);
    const update = () => setMobile(isAndroid() || media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return mobile;
}

export function MobileShell({ state, dispatch, canSave }: { state: GameState; dispatch: Dispatch<GameAction>; canSave: boolean }) {
  const mobile = useMobileLayout();
  const [menu, setMenu] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const latest = useRef({ state, canSave });
  useLayoutEffect(() => { latest.current = { state, canSave }; });
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('mobile-ui', mobile);
    return () => document.documentElement.classList.remove('mobile-ui');
  }, [mobile]);

  useEffect(() => {
    if (!mobile) return;
    let start: { x: number; y: number } | null = null;
    let moved = false;
    const down = (event: PointerEvent) => { start = { x: event.clientX, y: event.clientY }; moved = false; };
    const move = (event: PointerEvent) => {
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) moved = true;
    };
    const cancel = () => { moved = true; };
    const click = (event: MouseEvent) => {
      if (moved && event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
      start = null;
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('click', click, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointercancel', cancel, true);
      document.removeEventListener('click', click, true);
    };
  }, [mobile]);

  useEffect(() => {
    const save = () => {
      if (latest.current.canSave) void persistSave(latest.current.state);
    };
    const visibility = () => { if (document.hidden) save(); };
    const error = () => setSaveError(true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', save);
    window.addEventListener('petcard-save-error', error);
    let disposed = false;
    let removeNative: (() => void) | undefined;
    if (isAndroid()) void import('@capacitor/app').then(async ({ App }) => {
      const handle = await App.addListener('appStateChange', ({ isActive }) => {
        document.documentElement.classList.toggle('app-inactive', !isActive);
        window.dispatchEvent(new CustomEvent('petcard-visibility', { detail: isActive }));
        if (!isActive) save();
      });
      if (disposed) void handle.remove();
      else removeNative = () => { void handle.remove(); };
    });
    return () => {
      disposed = true;
      removeNative?.();
      document.documentElement.classList.remove('app-inactive');
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', save);
      window.removeEventListener('petcard-save-error', error);
    };
  }, []);

  useEffect(() => {
    const back = () => {
      if (saveError) { setSaveError(false); return; }
      if (menu) { setMenu(false); return; }
      const actions = [...backActions].sort((a, b) => a.priority - b.priority);
      const action = actions[actions.length - 1];
      if (action && action.priority > 0) { action.run(); return; }
      // 这些遮罩均已有点击关闭规则；不触碰不可关闭的胜负结算遮罩。
      const overlays = [...document.querySelectorAll<HTMLElement>('.confirm-overlay, .save-mgmt-overlay, .battle-overlay-mask')];
      const visible = overlays.filter(el => el.getClientRects().length > 0).sort((a, b) =>
        (Number(getComputedStyle(a).zIndex) || 0) - (Number(getComputedStyle(b).zIndex) || 0));
      const overlay = visible[visible.length - 1];
      if (overlay) { overlay.click(); return; }
      if (action) { action.run(); return; }
      if (latest.current.state.screen === 'achievements') { dispatch({ type: 'TITLE' }); return; }
      setExiting(latest.current.state.screen === 'title');
      setMenu(true);
    };
    const exit = () => { setExiting(true); setMenu(true); };
    window.addEventListener('petcard-back', back);
    window.addEventListener('petcard-exit-request', exit);
    let disposed = false;
    let removeNative: (() => void) | undefined;
    if (isAndroid()) void import('@capacitor/app').then(async ({ App }) => {
      const handle = await App.addListener('backButton', back);
      if (disposed) void handle.remove();
      else removeNative = () => { void handle.remove(); };
    });
    return () => {
      disposed = true;
      removeNative?.();
      window.removeEventListener('petcard-back', back);
      window.removeEventListener('petcard-exit-request', exit);
    };
  }, [menu, saveError]);

  async function leave() {
    if (latest.current.canSave && !await persistSave(latest.current.state)) return;
    // 保存失败时不退出；保留原地重试机会。
    if (exiting && isAndroid()) {
      const { App } = await import('@capacitor/app');
      await App.exitApp();
    } else { setMenu(false); dispatch({ type: 'TITLE' }); }
  }

  return <>
    {isAndroid() && <MobileVersion visible={state.screen === 'title'} />}
    {mobile && <div className="mobile-rotate-hint" role="status"><span>请旋转手机，横屏游玩</span></div>}
    {mobile && state.screen === 'battle' && <button type="button" className="mobile-menu-toggle" aria-label="打开游戏菜单" onClick={() => { setExiting(false); setMenu(true); }}>菜单</button>}
    {menu && <div className="mobile-system-overlay" role="dialog" aria-modal="true" aria-label={exiting ? '退出游戏' : '游戏菜单'}>
      <section className="mobile-system-panel"><h2>{exiting ? '退出游戏？' : '游戏菜单'}</h2>
        <p>存档保存在本机，卸载或清除数据前请先备份。</p>
        <button onClick={() => { setMenu(false); }}>继续游戏</button>
        <button onClick={() => { void leave(); }}>{exiting ? '保存并退出' : '保存并返回首页'}</button>
      </section>
    </div>}
    {saveError && <div className="mobile-system-overlay save-error-overlay" role="alertdialog" aria-modal="true" aria-label="保存失败">
      <section className="mobile-system-panel"><h2>存档保存失败</h2><p>请检查设备可用空间，先不要退出或清除应用数据。</p>
        <button onClick={() => { setSaveError(false); if (latest.current.canSave) void persistSave(latest.current.state); }}>重试保存</button>
        <button onClick={() => setSaveError(false)}>返回游戏</button>
      </section>
    </div>}
  </>;
}
