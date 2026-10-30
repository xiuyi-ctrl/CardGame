// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, fireEvent } from '@testing-library/react';
import { readFileSync, existsSync } from 'node:fs';
import { CREATURE_IMAGES, getCreatureImage } from '../src/game/data/creature-art';
import { MONSTERS, getMonster } from '../src/game/data/monsters';
import { makeUnit } from '../src/game/core/battle';
import { createInitialState, migrateGameState } from '../src/game/state/reducer';
import { PetIcon, PixelCreature, UnitCard } from '../src/ui/components';
import { FlowPet } from '../src/ui/MainFlowArt';
import { RegionScreen } from '../src/ui/RegionScreen';
import { formationSprite } from '../src/ui/formationSprites';

afterEach(() => { cleanup(); vi.restoreAllMocks(); Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close'); });

it('所有已配置生物图片存在，物种定义与统一图片表一致', () => {
  for (const [id, path] of Object.entries(CREATURE_IMAGES)) {
    expect(MONSTERS[id]).toBeTruthy();
    expect(getMonster(id).image).toBe(path);
    expect(existsSync(`public${path}`)).toBe(true);
  }
});
it.each([['lulu', 'home-paopao.png'], ['fifi', 'home-zhuozhuo.png'], ['kiki', 'starter-tiedun.png']])('%s 统一采用已确认的64像素开局立绘', (id, file) => {
  const runtime = readFileSync(`public${getCreatureImage(id)}`);
  expect(runtime.equals(readFileSync(`src/ui/assets/${file}`))).toBe(true);
  expect(runtime.equals(readFileSync(`美术素材${getCreatureImage(id)}`))).toBe(true);
  expect(runtime.readUInt32BE(16)).toBe(64);
});
it('只改一处配置后，新生物、旧存档和通用显示入口全部使用新图片', () => {
  const old = { ...makeUnit('momo', true, 0, false), image: '/outdated-creature.png', hp: 3, spd: 7, bonusStats: { hp: 5 }, curse: 'spdDown' as const };
  vi.spyOn(CREATURE_IMAGES, 'momo', 'get').mockReturnValue('/latest-creature.png');
  expect(formationSprite('momo')).toBe('/latest-creature.png');
  expect(makeUnit('momo', true, 0, false).image).toBe('/latest-creature.png');
  const saved = { ...createInitialState(), roster: [old], deadPets: [old], tameOverflow: [old] };
  const loaded = migrateGameState(saved)!;
  for (const unit of [...loaded.roster, ...loaded.deadPets!, ...loaded.tameOverflow!]) {
    expect(unit).toEqual({ ...old, image: '/latest-creature.png' });
  }
  const { container } = render(createElement('div', null,
    createElement(PixelCreature, { unit: old }), createElement(UnitCard, { unit: old }),
    createElement(FlowPet, { unit: old }), createElement(PetIcon, { speciesId: old.speciesId, image: old.image, name: old.name, emoji: old.emoji })));
  expect(container.querySelectorAll('img[src="/latest-creature.png"]')).toHaveLength(4);
  expect(container.querySelector('img[src="/outdated-creature.png"]')).toBeNull();
});
it('生态已遇见图片与未遇见轮廓都取统一配置', () => {
  vi.spyOn(CREATURE_IMAGES, 'momo', 'get').mockReturnValue('/latest-creature.png');
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
  const { container } = render(createElement(RegionScreen, { state: { ...createInitialState(), region: 'emerald_forest' }, dispatch: vi.fn() }));
  fireEvent.click([...container.querySelectorAll('button')].find(button => button.textContent === '查看生态详情')!);
  const image = container.querySelector('img[src="/latest-creature.png"]');
  expect(image?.closest('.region-ecology-creature')?.classList.contains('undiscovered')).toBe(true);
});
it('未知物种和没有立绘的造物保留原有图片／emoji兜底', () => {
  expect(getCreatureImage('custom_guardian')).toBeUndefined();
  expect(getCreatureImage('unknown', '/custom.png')).toBe('/custom.png');
});
