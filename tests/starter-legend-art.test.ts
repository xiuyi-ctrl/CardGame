import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getMonster } from '../src/game/data/monsters';
import { makeUnit } from '../src/game/core/battle';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PixelCreature } from '../src/ui/components';

describe('御三家最高进化像素立绘接入', () => {
  it.each([
    ['momo_god', '01-2.png', 'xuntian-pixel-v2'],
    ['lulu_god', '03-2.png', 'paopaolongshen-pixel-v2'],
    ['fifi_god', '02-2.png', 'zhuotian-pixel-v2'],
  ])('%s 沿用原路径，使用图四同套高清透明原稿并同步素材归档', (species, filename, folder) => {
    expect(getMonster(species).image).toBe(`/${filename}`);
    const runtime = readFileSync(`public/${filename}`);
    expect(runtime.equals(readFileSync(`design/creatures/${folder}/export/raw-sheet-clean.png`))).toBe(true);
    expect(runtime.equals(readFileSync(`美术素材/${filename}`))).toBe(true);
    expect(runtime.subarray(1, 4).toString()).toBe('PNG');
    expect(runtime.readUInt32BE(16)).toBeGreaterThan(64);
    expect(runtime.readUInt32BE(20)).toBeGreaterThan(64);
    expect(runtime[25]).toBe(6); // RGBA，不是无透明通道的RGB。
    const markup = renderToStaticMarkup(createElement(PixelCreature, { unit: makeUnit(species, true, 0, false) }));
    expect(markup).toContain('native-creature-art');
    expect(markup).toContain(`src="/${filename}"`);
    expect(markup).not.toContain('<canvas');
  });
});
