// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RegionScreen } from '../src/ui/RegionScreen';
import { createInitialState } from '../src/game/state/reducer';

const images = vi.hoisted(() => ({ pending: [] as (() => void)[], sources: [] as string[][] }));
vi.mock('../src/ui/imageCache', () => ({
  getDecodedImage: () => undefined,
  preloadImages: (sources: string[]) => { images.sources.push(sources); return new Promise<void>(resolve => images.pending.push(resolve)); },
}));
afterEach(() => {
  cleanup(); images.pending = []; images.sources = [];
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

it('进入地区页提前准备小图；打开后整组解码完成才统一展示，不逐张出现', async () => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute('open'); } });
  render(createElement(RegionScreen, { state: { ...createInitialState(), region: 'emerald_forest' }, dispatch: vi.fn() }));
  expect(images.sources[0]).toHaveLength(27);
  expect(images.sources[0].every(src => src.startsWith('/ecology/'))).toBe(true);
  expect(images.sources[0]).toEqual(expect.arrayContaining(['/ecology/time_sand_beast.png', '/ecology/mimic_beast.png', '/ecology/mirror_beast.png', '/ecology/crystal_core_beast.png']));
  fireEvent.click(screen.getByRole('button', { name: '查看生态详情' }));
  const body = screen.getByRole('dialog').querySelector('.region-ecology-body')!;
  expect(body.classList.contains('is-loading')).toBe(true);
  expect(body.getAttribute('aria-busy')).toBe('true');
  expect(screen.getByRole('status').textContent).toContain('展开生态图鉴');
  await act(async () => { images.pending.forEach(resolve => resolve()); });
  expect(body.classList.contains('is-loading')).toBe(false);
  expect(body.getAttribute('aria-busy')).toBe('false');
  expect(screen.queryByRole('status')).toBeNull();
});
