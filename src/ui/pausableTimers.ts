/** 仅控制表现层计时；暂停和恢复都不重新执行战斗逻辑。 */
export class PausableTimers {
  private paused = false;
  private entries = new Set<{ callback: () => void; remaining: number; started: number; id?: number }>();

  set(callback: () => void, delay: number): void {
    const entry = { callback, remaining: delay, started: Date.now(), id: undefined as number | undefined };
    this.entries.add(entry);
    if (!this.paused) this.start(entry);
  }

  private start(entry: { callback: () => void; remaining: number; started: number; id?: number }): void {
    entry.started = Date.now();
    entry.id = window.setTimeout(() => { this.entries.delete(entry); entry.callback(); }, entry.remaining);
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    for (const entry of this.entries) {
      window.clearTimeout(entry.id);
      entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.started));
    }
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    for (const entry of this.entries) this.start(entry);
  }

  clear(): void {
    for (const entry of this.entries) window.clearTimeout(entry.id);
    this.entries.clear();
  }

  /** 改变播放速度只缩放剩余时间，不重新执行已经发生的回调。 */
  scaleRemaining(factor: number): void {
    for (const entry of this.entries) {
      window.clearTimeout(entry.id);
      const elapsed = this.paused ? 0 : Date.now() - entry.started;
      entry.remaining = Math.max(0, entry.remaining - elapsed) * factor;
      if (!this.paused) this.start(entry);
    }
  }
}
