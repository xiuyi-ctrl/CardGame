import { useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { uiAudio } from './uiAudio';
import { useBackAction } from './mobile';
import './audioSettings.css';

export function AudioSettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useSyncExternalStore(uiAudio.subscribe, uiAudio.getSettings);
  const back = () => { uiAudio.play('back'); onClose(); };
  useBackAction(true, back, 110);
  return createPortal(<div className="mobile-system-overlay audio-settings-overlay" onClick={back}>
    <section className="audio-settings-panel" role="dialog" aria-modal="true" aria-label="界面音效设置" onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); back(); } }}>
      <header><h2>界面音效</h2><button autoFocus onClick={onClose}>关闭</button></header>
      <label className="audio-settings-enable"><input type="checkbox" checked={settings.enabled} onChange={event => uiAudio.setSettings({ enabled: event.target.checked })} />开启界面音效</label>
      <label className="audio-settings-volume">音量 <input aria-label="界面音效音量" type="range" min="0" max="100" disabled={!settings.enabled} value={Math.round(settings.volume * 100)} onChange={event => uiAudio.setSettings({ volume: Number(event.target.value) / 100 })} /><output>{Math.round(settings.volume * 100)}%</output></label>
      <p>设置保存在本机，所有存档共用。</p>
      <footer><button data-ui-sound="none" disabled={!settings.enabled || settings.volume === 0} onClick={() => uiAudio.play('confirm')}>试听</button><button data-ui-sound="back" onClick={onClose}>完成</button></footer>
    </section>
  </div>, document.body);
}

export function AudioSettingsButton() {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="audio-settings-trigger" onClick={() => setOpen(true)}>音效设置</button>{open && <AudioSettingsPanel onClose={() => setOpen(false)} />}</>;
}
