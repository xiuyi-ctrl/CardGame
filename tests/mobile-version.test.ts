// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const native = vi.hoisted(() => ({ getInfo: vi.fn(), get: vi.fn() }));
vi.mock('@capacitor/app', () => ({ App: { getInfo: native.getInfo } }));
vi.mock('@capacitor/core', () => ({ CapacitorHttp: { get: native.get } }));
import { latestAndroidRelease, MobileVersion } from '../src/ui/MobileVersion';

afterEach(() => { cleanup(); vi.resetAllMocks(); });

function release(version: string, apk = true) {
  return { tag_name: version, html_url: `https://github.com/xiuyi-ctrl/CardGame/releases/tag/${version}`,
    assets: apk ? [{ name: 'game.apk', browser_download_url: `https://github.com/xiuyi-ctrl/CardGame/releases/download/${version}/game.apk` }] : [] };
}

describe('Android 启动版本提示', () => {
  it('按数字比较版本，仅选择带 APK 的正式新版', () => {
    const data = [release('v0.4.2'), release('v0.4.10'), release('v0.5.0', false),
      { ...release('v0.6.0'), prerelease: true }, { ...release('v0.7.0'), draft: true },
      release('v0.8.0-beta.1'), { ...release('v0.9.0'), html_url: 'https://example.com' }];
    expect(latestAndroidRelease(data, '0.4.1')?.version).toBe('0.4.10');
    expect(latestAndroidRelease(data, '0.4.10')).toBeNull();
  });

  it('断网时可重试，成功后显示已安装版本及更新入口', async () => {
    native.getInfo.mockResolvedValue({ version: '0.4.1' });
    native.get.mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ status: 200, data: [release('v0.4.2')] });
    render(createElement(MobileVersion, { visible: true }));
    fireEvent.click(await screen.findByRole('button', { name: '检查失败，点击重试' }));
    const link = await screen.findByRole('link', { name: '发现 v0.4.2 · 前往更新' });
    expect(link.getAttribute('href')).toBe('https://github.com/xiuyi-ctrl/CardGame/releases/tag/v0.4.2');
    expect(screen.getByText('当前 v0.4.1')).toBeTruthy();
  });

  it('切换页面不重复请求，无新版时显示状态', async () => {
    native.getInfo.mockResolvedValue({ version: '0.4.1' });
    native.get.mockResolvedValue({ status: 200, data: [release('v0.4.1')] });
    const view = render(createElement(MobileVersion, { visible: true }));
    await screen.findByText('暂无新版本');
    view.rerender(createElement(MobileVersion, { visible: false }));
    expect(screen.queryByText('当前 v0.4.1')).toBeNull();
    view.rerender(createElement(MobileVersion, { visible: true }));
    await waitFor(() => expect(native.get).toHaveBeenCalledTimes(1));
  });
});
