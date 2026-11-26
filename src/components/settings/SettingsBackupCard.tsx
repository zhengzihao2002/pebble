'use client';

import { useId, useRef, useState } from 'react';
import { ClipboardCopy, ClipboardPaste } from 'lucide-react';
import { SettingsRow } from './SettingsRow';
import { SETTING_TARGETS } from './settingsTargets';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { formatLongDate } from '@/lib/format';
import { createSettingsBackup, currentUserId, readSettingsBackup, restoreSettingsBackup } from '@/lib/settingsBackup';

/** iOS ignores select() on a read-only field; a full selection range works. */
function selectAll(field: HTMLTextAreaElement | null) {
  if (!field) return;
  field.focus();
  field.select();
  field.setSelectionRange(0, field.value.length);
}

type CopyState = 'idle' | 'copied' | 'manual' | 'empty' | 'failed';
type RestoreState = 'idle' | 'notCode' | 'damaged' | 'noUser' | 'failed' | 'applying';

/**
 * Copy every device setting as one code, and paste it back after a reinstall.
 * Two rows of one grouped card: copying, then restoring. The page reloads
 * after a restore so every part of the app starts from the restored values.
 */
export function SettingsBackupCard() {
  const { d, t, locale } = useTranslation();
  const x = d.ux.settings.backup;
  const pasteId = useId();
  const manualRef = useRef<HTMLTextAreaElement>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [manualCode, setManualCode] = useState('');
  const [pasted, setPasted] = useState('');
  const [restoreState, setRestoreState] = useState<RestoreState>('idle');

  const read = pasted.trim() ? readSettingsBackup(pasted) : null;
  const preview = read?.ok ? read.body : null;

  const copy = async () => {
    let code: string | null = null;
    try { code = createSettingsBackup(window.localStorage, currentUserId(window.localStorage)); } catch { setCopyState('failed'); return; }
    if (!code) { setCopyState('empty'); return; }
    // Never hand out a code that would not restore.
    if (!readSettingsBackup(code).ok) { setCopyState('failed'); return; }
    try {
      await navigator.clipboard.writeText(code);
      setManualCode('');
      setCopyState('copied');
    } catch {
      // No clipboard permission (or no clipboard API): show the code selected,
      // ready for the system Copy.
      setManualCode(code);
      setCopyState('manual');
      requestAnimationFrame(() => selectAll(manualRef.current));
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setPasted(text);
      setRestoreState('idle');
    } catch {
      // No clipboard read here (or permission refused): the field still
      // takes a normal long-press paste.
      document.getElementById(pasteId)?.focus();
    }
  };

  const apply = () => {
    let result;
    try { result = restoreSettingsBackup(window.localStorage, currentUserId(window.localStorage), pasted); }
    catch { setRestoreState('failed'); return; }
    if (!result.ok) { setRestoreState(result.reason === 'empty' ? 'notCode' : result.reason); return; }
    setRestoreState('applying');
    window.location.reload();
  };

  const copyStatus = copyState === 'copied' ? x.copied
    : copyState === 'manual' ? x.copyManually
    : copyState === 'empty' ? x.nothingToCopy
    : copyState === 'failed' ? x.copyFailed : '';
  const restoreStatus = restoreState === 'notCode' ? x.notCode
    : restoreState === 'damaged' ? x.damaged
    : restoreState === 'noUser' ? x.signInFirst
    : restoreState === 'failed' ? x.restoreFailed
    : restoreState === 'applying' ? x.applying
    : preview ? (/^\d{4}-\d{2}-\d{2}/.test(preview.at) ? t(x.ready, { date: formatLongDate(preview.at.slice(0, 10), locale) }) : x.readyUndated)
    : read && !read.ok ? (read.reason === 'damaged' ? x.damaged : x.notCode) : '';

  return (
    <div className="card pb-settings-group pb-set-backup" id={SETTING_TARGETS.backup}>
      <SettingsRow icon={ClipboardCopy} title={x.copyTitle} hint={x.copyHint} layout="stack">
        <div className="pb-set-backup-actions">
          <button type="button" className="btn-primary" onClick={copy}>{x.copy}</button>
          <p className="pb-set-backup-status" role="status">{copyStatus}</p>
        </div>
        {copyState === 'manual' && (
          <textarea ref={manualRef} className="pb-partner-input pb-set-backup-code" readOnly value={manualCode}
            aria-label={x.copyTitle} rows={3} onFocus={(e) => selectAll(e.currentTarget)} />
        )}
      </SettingsRow>
      <SettingsRow icon={ClipboardPaste} title={x.restoreTitle} hint={x.restoreHint} labelFor={pasteId} layout="stack">
        <textarea id={pasteId} className="pb-partner-input pb-set-backup-code" rows={3} value={pasted}
          placeholder={x.placeholder} spellCheck={false} autoCapitalize="off" autoCorrect="off"
          onChange={(e) => { setPasted(e.target.value); setRestoreState('idle'); }} />
        <div className="pb-set-backup-actions">
          <button type="button" className="pill" onClick={pasteFromClipboard}>{x.paste}</button>
          <button type="button" className="btn-primary" onClick={apply} disabled={!preview || restoreState === 'applying'}>{x.apply}</button>
          <p className="pb-set-backup-status" role="status">{restoreStatus}</p>
        </div>
      </SettingsRow>
    </div>
  );
}
