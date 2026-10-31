import click from './assets/audio/ui/ui_click.wav';
import confirm from './assets/audio/ui/ui_confirm.wav';
import back from './assets/audio/ui/ui_back.wav';
import select from './assets/audio/ui/ui_select.wav';
import unavailable from './assets/audio/ui/ui_unavailable.wav';

export const UI_SOUNDS = { click, confirm, back, select, unavailable };
export type UiSound = keyof typeof UI_SOUNDS;
export interface UiAudioSettings { enabled: boolean; volume: number }
export const UI_AUDIO_STORAGE = 'petcard-ui-audio-v1';

function readSettings(): UiAudioSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(UI_AUDIO_STORAGE) ?? 'null');
    return { enabled: typeof saved?.enabled === 'boolean' ? saved.enabled : true,
      volume: typeof saved?.volume === 'number' && Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : .65 };
  } catch { return { enabled: true, volume: .65 }; }
}

/** UI-only audio: no game RNG, timers, actions, or save data. */
export class UiAudioPlayer {
  private settings = readSettings();
  private listeners = new Set<() => void>();
  private context?: AudioContext;
  private gain?: GainNode;
  private buffers = new Map<UiSound, AudioBuffer>();
  private loading?: Promise<void>;
  private source?: AudioBufferSourceNode;
  private paused = false;
  private request = 0;
  private lastTap = -Infinity;
  private lastUnavailable = -Infinity;
  getSettings = () => this.settings;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  setSettings(patch: Partial<UiAudioSettings>): void {
    this.settings = { enabled: patch.enabled ?? this.settings.enabled,
      volume: patch.volume !== undefined && Number.isFinite(patch.volume) ? Math.max(0, Math.min(1, patch.volume)) : this.settings.volume };
    try { localStorage.setItem(UI_AUDIO_STORAGE, JSON.stringify(this.settings)); } catch { /* Sound still works without storage. */ }
    if (this.gain) this.gain.gain.value = this.settings.volume;
    if (!this.settings.enabled || !this.settings.volume) this.stop();
    else this.preload();
    this.listeners.forEach(listener => listener());
  }

  preload(): void {
    if (this.context || !this.settings.enabled || typeof AudioContext === 'undefined') return;
    try {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = this.settings.volume;
      this.gain.connect(this.context.destination);
      this.loading = Promise.all((Object.entries(UI_SOUNDS) as [UiSound, string][]).map(async ([id, url]) => {
        try {
          const response = await fetch(url);
          if (response.ok) this.buffers.set(id, await this.context!.decodeAudioData(await response.arrayBuffer()));
        } catch { /* Missing audio must not block controls. */ }
      })).then(() => {});
    } catch { this.context = undefined; }
  }

  /** Call directly from user input so Android/browser autoplay rules are respected. */
  unlock(): void {
    if (this.paused || !this.settings.enabled || !this.settings.volume) return;
    this.preload();
    if (this.context?.state === 'suspended') void this.context.resume().catch(() => {});
  }

  play(id: UiSound): void {
    if (this.paused || !this.settings.enabled || !this.settings.volume) return;
    const now = Date.now();
    if ((id === 'click' || id === 'select') && now - this.lastTap < 60) return;
    if (id === 'unavailable' && now - this.lastUnavailable < 250) return;
    this.unlock();
    if (!this.context) return;
    if (id === 'click' || id === 'select') this.lastTap = now;
    if (id === 'unavailable') this.lastUnavailable = now;
    const request = ++this.request;
    void this.loading?.then(() => {
      if (request !== this.request || this.paused || !this.settings.enabled || !this.settings.volume
        || this.context?.state !== 'running' || Date.now() - now > 300) return;
      const buffer = this.buffers.get(id);
      if (!buffer) return;
      this.stopSource();
      const source = this.context.createBufferSource();
      source.buffer = buffer; source.connect(this.gain!); this.source = source;
      source.onended = () => { source.disconnect(); if (this.source === source) this.source = undefined; };
      source.start();
    }).catch(() => {});
  }

  private stopSource(): void { if (this.source) { this.source.stop(); this.source = undefined; } }
  stop(): void { ++this.request; this.stopSource(); }
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) { this.stop(); if (this.context?.state === 'running') void this.context.suspend().catch(() => {}); }
    // Resume only on the next user input; never replay background input.
  }
}

export const uiAudio = new UiAudioPlayer();
