// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PausableTimers } from '../src/ui/pausableTimers';

afterEach(() => vi.useRealTimers());
describe('移动端动画计时', () => {
  it('切后台冻结剩余时长，恢复后继续且只执行一次', () => {
    vi.useFakeTimers();
    const timers = new PausableTimers();
    const callback = vi.fn();
    timers.set(callback, 1000);
    vi.advanceTimersByTime(400);
    timers.pause();
    vi.advanceTimersByTime(6000);
    expect(callback).not.toHaveBeenCalled();
    timers.resume();
    vi.advanceTimersByTime(599);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledOnce();
    timers.resume();
    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledOnce();
  });

  it('暂停期间新建的子动画不启动，清理后不会在恢复时复活', () => {
    vi.useFakeTimers();
    const timers = new PausableTimers();
    const callback = vi.fn();
    timers.pause();
    timers.set(callback, 100);
    vi.advanceTimersByTime(500);
    expect(callback).not.toHaveBeenCalled();
    timers.clear();
    timers.resume();
    vi.advanceTimersByTime(500);
    expect(callback).not.toHaveBeenCalled();
  });
});
