import { useRef, useState } from 'react';
import { exportSave, importSave, parseDualSave } from './persistence';
import { useMobileLayout, useBackAction } from './mobile';

export function SaveBackup({ slot, onImported }: { slot?: number; onImported: () => void }) {
  const mobile = useMobileLayout();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ slot: number; json: string } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useBackAction(!!pending, () => { if (!busy) setPending(null); }, 2);
  if (!mobile) return null;
  return <div className="mobile-backup">
    <p>选择一个槽位，再备份或导入。导入会覆盖该槽位的两个模式。</p>
    <button disabled={!slot || busy} onClick={async () => {
      if (!slot) return;
      setBusy(true);
      try { await exportSave(slot); setMessage('已打开备份保存或分享入口'); }
      catch (error) { setMessage(error instanceof Error ? error.message : '备份未完成'); }
      finally { setBusy(false); }
    }}>导出备份</button>
    <button disabled={!slot || busy} onClick={() => input.current?.click()}>导入备份</button>
    <input ref={input} type="file" accept=".json,application/json" hidden onChange={async event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file || !slot) return;
      setBusy(true);
      try {
        const json = await file.text();
        const parsed = parseDualSave(json);
        if (!parsed || (!parsed.main && !parsed.proficiency)) throw new Error('备份损坏、内容为空或版本不兼容');
        setPending({ slot, json });
      } catch (error) { setMessage(error instanceof Error ? error.message : '读取备份失败'); }
      finally { setBusy(false); }
    }} />
    {message && <p role="status">{message}</p>}
    {pending && <div className="mobile-system-overlay" role="alertdialog" aria-modal="true" aria-label="确认导入存档" onClick={event => event.stopPropagation()}>
      <section className="mobile-system-panel"><h2>覆盖存档 {pending.slot}？</h2><p>该槽位原有主模式与熟练度存档将被替换，操作不可撤销。</p>
        <button disabled={busy} onClick={async () => {
          setBusy(true);
          try { await importSave(pending.slot, pending.json); setPending(null); setMessage('存档导入完成'); onImported(); }
          catch { setMessage('导入失败，请检查可用存储空间'); }
          finally { setBusy(false); }
        }}>确认覆盖</button>
        <button disabled={busy} onClick={() => setPending(null)}>取消</button>
      </section>
    </div>}
  </div>;
}
