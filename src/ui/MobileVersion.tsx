import { useEffect, useState } from 'react';
import { CapacitorHttp } from '@capacitor/core';

const releaseRoot = 'https://github.com/xiuyi-ctrl/CardGame/releases/';

function versionParts(version: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left: number[], right: number[]): number {
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function latestAndroidRelease(data: unknown, currentVersion: string): { version: string; url: string } | null {
  const current = versionParts(currentVersion);
  if (!current || !Array.isArray(data)) throw new Error('无效版本信息');
  let latest: { version: string; url: string; parts: number[] } | null = null;
  for (const release of data) {
    if (!release || release.draft || release.prerelease || typeof release.tag_name !== 'string') continue;
    const parts = versionParts(release.tag_name);
    if (!parts || compareVersions(parts, current) <= 0 || (latest && compareVersions(parts, latest.parts) <= 0)) continue;
    if (typeof release.html_url !== 'string' || !release.html_url.startsWith(`${releaseRoot}tag/`)) continue;
    const hasApk = Array.isArray(release.assets) && release.assets.some((asset: { name?: unknown; browser_download_url?: unknown }) =>
      typeof asset?.name === 'string' && /\.apk$/i.test(asset.name) &&
      typeof asset.browser_download_url === 'string' && asset.browser_download_url.startsWith(`${releaseRoot}download/`));
    if (hasApk) latest = { version: release.tag_name.replace(/^v/, ''), url: release.html_url, parts };
  }
  return latest ? { version: latest.version, url: latest.url } : null;
}

export function MobileVersion({ visible }: { visible: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const [current, setCurrent] = useState('');
  const [status, setStatus] = useState<'checking' | 'ready' | 'error'>('checking');
  const [update, setUpdate] = useState<{ version: string; url: string } | null>(null);

  useEffect(() => {
    let disposed = false;
    setStatus('checking');
    async function check() {
      try {
        const { App } = await import('@capacitor/app');
        const info = await App.getInfo();
        if (disposed) return;
        setCurrent(info.version);
        const response = await CapacitorHttp.get({
          url: 'https://api.github.com/repos/xiuyi-ctrl/CardGame/releases?per_page=100',
          headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
          connectTimeout: 8000, readTimeout: 8000, responseType: 'json',
        });
        if (response.status !== 200) throw new Error('版本检查失败');
        const available = latestAndroidRelease(response.data, info.version);
        if (!disposed) { setUpdate(available); setStatus('ready'); }
      } catch {
        if (!disposed) setStatus('error');
      }
    }
    void check();
    return () => { disposed = true; };
  }, [attempt]);

  if (!visible) return null;
  return <div className="mobile-version" aria-live="polite">
    <span>{current ? `当前 v${current}` : '游戏版本'}</span>
    {status === 'checking' ? <span>正在检查更新…</span>
      : status === 'error' ? <button onClick={() => setAttempt(value => value + 1)}>检查失败，点击重试</button>
        : update ? <a href={update.url}>发现 v{update.version} · 前往更新</a>
          : <span>暂无新版本</span>}
  </div>;
}
