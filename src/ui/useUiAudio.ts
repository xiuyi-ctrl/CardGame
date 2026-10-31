import { useEffect, useRef } from 'react';
import { uiAudio, type UiSound } from './uiAudio';
import type { GameState } from '../game/state/game';

export function uiSoundFor(control: HTMLElement): UiSound | 'none' {
  const explicit = control.dataset.uiSound;
  if (explicit && ['none', 'click', 'confirm', 'back', 'select', 'unavailable'].includes(explicit)) return explicit as UiSound | 'none';
  if (control.matches('[aria-pressed], [aria-selected], [role="tab"], [role="radio"], [role="option"]')) return 'select';
  const label = (control.getAttribute('aria-label') ?? control.textContent ?? '').trim().replace(/^[←↩✕×✓✅⬅️\s]+/, '');
  if (/^(返回|关闭|取消|离开|退出|收起|放弃)/.test(label)) return 'back';
  if (/^(确认|确定|领取|购买|开始|出发|进入战斗|应用修改|融合进化|结束回合|继续前进)/.test(label)) return 'confirm';
  return 'click';
}

export function useUiAudio(toast: GameState['toast']): void {
  const pending = useRef<UiSound | undefined>();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>();
  const lastToast = useRef(toast);
  const priority: Record<UiSound, number> = { click: 0, select: 1, back: 2, confirm: 3, unavailable: 4 };
  const enqueue = (sound: UiSound) => {
    if (!pending.current || priority[sound] > priority[pending.current]) pending.current = sound;
    if (timer.current !== undefined) return;
    timer.current = setTimeout(() => {
      const next = pending.current; pending.current = undefined; timer.current = undefined;
      if (next) uiAudio.play(next);
    }, 0);
  };

  useEffect(() => {
    let active = true;
    uiAudio.preload();
    const unlock = () => uiAudio.unlock();
    const click = (event: MouseEvent) => {
      const control = event.composedPath().find(node => node instanceof HTMLElement && node.matches('button, [role="button"], [role="tab"], [role="radio"], [role="option"]')) as HTMLElement | undefined;
      if (!control || control.matches(':disabled, [aria-disabled="true"]') || event.button !== 0) return;
      const sound = uiSoundFor(control);
      const pressed = control.getAttribute('aria-pressed') ?? control.getAttribute('aria-selected');
      unlock();
      queueMicrotask(() => {
        if (!active || event.defaultPrevented || sound === 'none') return;
        const after = control.getAttribute('aria-pressed') ?? control.getAttribute('aria-selected');
        if (sound === 'select' && pressed === 'true' && after === 'true') return;
        enqueue(sound);
      });
    };
    const change = (event: Event) => {
      const control = event.target;
      if (control instanceof HTMLSelectElement || control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type)) {
        if (control.disabled || control.closest('[data-ui-sound="none"]')) return;
        unlock(); enqueue('select');
      }
    };
    const visibility = (event?: Event) => {
      pending.current = undefined;
      uiAudio.setPaused(event instanceof CustomEvent ? event.detail !== true : document.hidden);
    };
    const saveError = () => enqueue('unavailable');
    visibility();
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('click', click, true);
    document.addEventListener('change', change);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('petcard-visibility', visibility);
    window.addEventListener('petcard-save-error', saveError);
    return () => {
      active = false;
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('change', change);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('petcard-visibility', visibility);
      window.removeEventListener('petcard-save-error', saveError);
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = undefined; pending.current = undefined; uiAudio.stop();
    };
  }, []);

  useEffect(() => {
    if (toast !== lastToast.current) {
      if (toast?.kind === 'error' || toast?.kind === 'warning') enqueue('unavailable');
      else if (toast?.kind === 'success') enqueue('confirm');
    }
    lastToast.current = toast;
  }, [toast]);
}
