// @vitest-environment jsdom
import { createElement, useState } from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UiAudioPlayer, UI_AUDIO_STORAGE, uiAudio } from '../src/ui/uiAudio';
import { useUiAudio, uiSoundFor } from '../src/ui/useUiAudio';
import { AudioSettingsPanel } from '../src/ui/AudioSettings';
import type { GameState } from '../src/game/state/game';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear(); });
beforeEach(() => { localStorage.clear(); });
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function audioMocks() {
  const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const gain = { gain: { value: 0 }, connect: vi.fn() };
  class Context {
    state = 'suspended'; destination = {};
    createGain = () => gain;
    decodeAudioData = vi.fn(async () => ({}));
    resume = vi.fn(async () => { this.state = 'running'; });
    suspend = vi.fn(async () => { this.state = 'suspended'; });
    createBufferSource = () => { const source = { start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), connect: vi.fn(), buffer: null, onended: null }; sources.push(source); return source; };
  }
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })));
  return { sources, gain };
}

describe('界面音效播放器', () => {
  it('只加载五种资源，播放不重叠，快速轻点限频', async () => {
    vi.useFakeTimers();
    const { sources } = audioMocks(), player = new UiAudioPlayer();
    player.preload(); await settle();
    expect(fetch).toHaveBeenCalledTimes(5);
    player.play('click'); await settle();
    expect(sources).toHaveLength(1);
    player.play('select'); await settle();
    expect(sources).toHaveLength(1);
    vi.advanceTimersByTime(61);
    player.play('select'); await settle();
    expect(sources).toHaveLength(2);
    expect(sources[0].stop).toHaveBeenCalledOnce();
  });

  it('音量和静音持久化，本机设置不进入游戏存档', async () => {
    const { sources, gain } = audioMocks(), player = new UiAudioPlayer();
    player.setSettings({ volume: .3 }); await settle();
    player.play('confirm'); await settle();
    expect(gain.gain.value).toBe(.3);
    player.setSettings({ enabled: false });
    expect(sources[0].stop).toHaveBeenCalledOnce();
    player.play('confirm'); await settle();
    expect(sources).toHaveLength(1);
    expect(new UiAudioPlayer().getSettings()).toEqual({ enabled: false, volume: .3 });
    expect(Object.keys(localStorage)).toEqual([UI_AUDIO_STORAGE]);
  });

  it('后台立刻停止且不补播，返回后须新的用户输入', async () => {
    const { sources } = audioMocks(), player = new UiAudioPlayer();
    player.preload(); await settle();
    player.play('confirm'); await settle();
    player.setPaused(true);
    expect(sources[0].stop).toHaveBeenCalledOnce();
    player.play('back'); await settle();
    player.setPaused(false); await settle();
    expect(sources).toHaveLength(1);
    player.play('back'); await settle();
    expect(sources).toHaveLength(2);
  });

  it('静音、零音量、损坏设置及不支持音频时不阻塞界面', async () => {
    localStorage.setItem(UI_AUDIO_STORAGE, '{broken');
    const player = new UiAudioPlayer();
    expect(player.getSettings()).toEqual({ enabled: true, volume: .65 });
    vi.stubGlobal('AudioContext', undefined);
    expect(() => player.play('click')).not.toThrow();
    audioMocks();
    player.setSettings({ volume: 0 });
    player.play('confirm'); await settle();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('界面操作音效接入', () => {
  function setup() {
    vi.useFakeTimers();
    const play = vi.spyOn(uiAudio, 'play').mockImplementation(() => {});
    vi.spyOn(uiAudio, 'preload').mockImplementation(() => {});
    vi.spyOn(uiAudio, 'unlock').mockImplementation(() => {});
    vi.spyOn(uiAudio, 'stop').mockImplementation(() => {});
    const paused = vi.spyOn(uiAudio, 'setPaused').mockImplementation(() => {});
    function Harness() {
      const [selected, setSelected] = useState(false);
      const [toast, setToast] = useState<GameState['toast']>();
      useUiAudio(toast);
      return createElement('div', null,
        createElement('button', null, '普通按钮'),
        createElement('button', null, '确认领取'),
        createElement('button', null, '返回地图'),
        createElement('button', { 'aria-pressed': selected, onClick: () => setSelected(true) }, '选择伙伴'),
        createElement('button', { disabled: true }, '禁用按钮'),
        createElement('button', { onClick: (event: React.MouseEvent) => event.preventDefault() }, '拖动后的点击'),
        createElement('button', { onClick: () => setToast({ kind: 'error', msg: '金币不足' }) }, '购买商品'),
        createElement('button', { 'data-ui-sound': 'none' }, '不要发声'),
        createElement('select', { 'aria-label': '难度' }, createElement('option', { value: 'normal' }, '普通'), createElement('option', { value: 'hard' }, '困难')));
    }
    render(createElement(Harness));
    return { play, paused };
  }
  async function flush() { await act(async () => { await settle(); vi.runOnlyPendingTimers(); }); }

  it.each([['普通按钮', 'click'], ['确认领取', 'confirm'], ['返回地图', 'back'], ['选择伙伴', 'select']])('%s只播放对应%s一次', async (label, sound) => {
    const { play } = setup();
    fireEvent.click(screen.getByRole('button', { name: label })); await flush();
    expect(play.mock.calls).toEqual([[sound]]);
  });

  it('失败提示覆盖同次购买确认，不叠播轻点和确认', async () => {
    const { play } = setup();
    fireEvent.click(screen.getByRole('button', { name: '购买商品' })); await flush();
    expect(play.mock.calls).toEqual([['unavailable']]);
  });

  it('悬停、禁用、拖动取消、重复选中及显式静默不发声', async () => {
    const { play } = setup();
    fireEvent.mouseEnter(screen.getByText('普通按钮'));
    for (const name of ['禁用按钮', '拖动后的点击', '不要发声']) fireEvent.click(screen.getByRole('button', { name }));
    await flush(); expect(play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '选择伙伴' })); await flush();
    play.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '选择伙伴' })); await flush();
    expect(play).not.toHaveBeenCalled();
  });

  it('原生选择器发切换声，后台事件清空待播且清理监听器', async () => {
    const { play, paused } = setup();
    fireEvent.change(screen.getByLabelText('难度'), { target: { value: 'hard' } }); await flush();
    expect(play.mock.calls).toEqual([['select']]);
    play.mockClear();
    fireEvent.click(screen.getByText('确认领取'));
    await act(async () => { await settle(); window.dispatchEvent(new CustomEvent('petcard-visibility', { detail: false })); vi.runOnlyPendingTimers(); });
    expect(play).not.toHaveBeenCalled(); expect(paused).toHaveBeenLastCalledWith(true);
    cleanup();
    document.body.innerHTML = '<button>确认领取</button>';
    fireEvent.click(screen.getByText('确认领取')); await flush();
    expect(play).not.toHaveBeenCalled();
  });

  it('设置面板音量、静音与关闭可用，退出不改变游戏动作', () => {
    vi.spyOn(uiAudio, 'preload').mockImplementation(() => {});
    uiAudio.setSettings({ enabled: true, volume: .65 });
    const onClose = vi.fn();
    render(createElement(AudioSettingsPanel, { onClose }));
    fireEvent.change(screen.getByLabelText('界面音效音量'), { target: { value: '25' } });
    expect(uiAudio.getSettings().volume).toBe(.25);
    fireEvent.click(screen.getByRole('checkbox', { name: '开启界面音效' }));
    expect(uiAudio.getSettings().enabled).toBe(false);
    expect((screen.getByRole('button', { name: '试听' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole('button', { name: '关闭' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

it('五份运行资源与原创设计、素材副本逐字节一致', () => {
  for (const id of ['click', 'confirm', 'back', 'select', 'unavailable']) {
    const source = readFileSync(`design/audio/ui-sfx-v1/ui_${id}.wav`);
    expect(readFileSync(`src/ui/assets/audio/ui/ui_${id}.wav`)).toEqual(source);
    expect(readFileSync(`美术素材/audio/ui-sfx-v1/ui_${id}.wav`)).toEqual(source);
    expect(source.subarray(0, 4).toString()).toBe('RIFF');
  }
  const button = document.createElement('button'); button.dataset.uiSound = '__proto__';
  expect(uiSoundFor(button)).toBe('click');
});
