// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CodexScreen } from '../src/ui/App';
import { MONSTERS } from '../src/game/data/monsters';
import { FORMATION_SPRITES } from '../src/ui/formationSprites';

const images = vi.hoisted(() => ({ cached: false, sources: [] as string[], finish: () => {} }));
vi.mock('../src/ui/imageCache', () => ({
  getDecodedImage: () => images.cached ? {} : undefined,
  preloadImages: (sources: string[]) => {
    images.sources = sources;
    return new Promise<void>(resolve => { images.finish = resolve; });
  },
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); images.cached = false; images.sources = []; });

it.each([false, true])('背景和全部立绘解码完成后才显示图鉴，切换详情无需重新加载 mobile=%s', async mobile => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const { container } = render(createElement(CodexScreen, { onClose: vi.fn() }));
  expect(screen.getByRole('status').textContent).toContain('正在准备生物图鉴');
  expect(container.querySelector('.codex-root')).toBeNull();
  expect(container.querySelector('img')).toBeNull();
  expect(images.sources).toContain('/formation-camp.png');
  expect(images.sources.some(src => src.includes('popup-terminal-frame.svg'))).toBe(true);
  for (const species of Object.values(MONSTERS)) {
    const image = FORMATION_SPRITES[species.id] ?? (species.id === 'momo' ? '/battle-momo.png' : species.image);
    if (image) expect(images.sources).toContain(image);
  }
  await act(async () => { images.finish(); });
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByRole('navigation', { name: '生物目录' })).toBeTruthy();
  fireEvent.click(container.querySelector<HTMLButtonElement>('[data-codex-id="mirror_beast"]')!);
  expect(container.querySelector('.codex-detail-name')?.textContent).toContain('镜影兽');
  expect(screen.queryByRole('status')).toBeNull();
});

it('已缓存时直接展示；冷启动加载期间可以返回', () => {
  images.cached = true;
  const first = render(createElement(CodexScreen, { onClose: vi.fn() }));
  expect(screen.queryByRole('status')).toBeNull();
  first.unmount();
  images.cached = false;
  const onClose = vi.fn();
  render(createElement(CodexScreen, { onClose }));
  fireEvent.click(screen.getByRole('button', { name: '返回' }));
  expect(onClose).toHaveBeenCalledOnce();
});
