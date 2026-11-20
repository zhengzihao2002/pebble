'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDownToLine, Pause, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { INTL_LOCALE } from '@/lib/i18n/locale';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useQuietSync } from './QuietSyncProvider';

const statusIcons = {
  paused: Pause,
  preparing: ArrowDownToLine,
  syncing: RefreshCw,
  live: Wifi,
  offline: WifiOff,
} as const;
const startupStatuses = ['paused', 'live', 'offline'] as const;

export function QuietSyncStatus() {
  const { d, t, locale } = useTranslation();
  const { enabled, preferenceReady, status, syncNow, goOnline, liveUntil, lastSyncedAt, problem } = useQuietSync();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!enabled || !open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [enabled, open]);

  const q = d.ux.offline.quietSync;
  if (!enabled) {
    if (preferenceReady) return null;
    return startupStatuses.map(startupStatus => {
      const Icon = statusIcons[startupStatus];
      return (
        <div
          key={startupStatus} className="pb-quiet-status pb-quiet-status-startup"
          data-status={startupStatus} aria-hidden="true"
        >
          <span className="pb-quiet-trigger">
            <Icon className="pb-quiet-status-icon" size={16} />
            <span>{q.status[startupStatus]}</span>
          </span>
        </div>
      );
    });
  }
  const label = `${q.title} · ${q.status[status]}`;
  const StatusIcon = statusIcons[status];
  const offline = status === 'offline';

  return (
    <div
      ref={root} className="pb-quiet-status" data-status={status}
      onBlur={event => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <span role="status" className="sr-only">{label}</span>
      <button
        ref={trigger} type="button" className="pb-quiet-trigger" aria-label={label}
        title={label} aria-expanded={open} aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(value => !value)}
      >
        <StatusIcon className="pb-quiet-status-icon" size={16} aria-hidden="true" />
        <span>{q.status[status]}</span>
      </button>
      {open && (
        <div className="pb-quiet-panel" id={panelId} role="group" aria-label={q.title}>
          <p className="pb-quiet-panel-title">
            <span>{q.title}</span>
            <span className="pb-quiet-panel-state">{q.status[status]}</span>
          </p>
          <p className="pb-quiet-panel-detail">{q.detail[status]}</p>
          {problem && <p className="pb-quiet-problem">{q.problem[problem]}</p>}
          {status === 'live' && liveUntil !== null && (
            <p className="pb-quiet-panel-meta">
              {t(q.onlineUntil, { time: new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeStyle: 'short' }).format(liveUntil) })}
            </p>
          )}
          {lastSyncedAt !== null && (
            <p className="pb-quiet-panel-meta">
              {t(q.lastSynced, {
                time: new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: 'medium', timeStyle: 'short' }).format(lastSyncedAt),
              })}
            </p>
          )}
          <div className="pb-quiet-actions">
            <button type="button" className="btn-primary" onClick={syncNow} disabled={offline || status === 'syncing'}>
              <RefreshCw size={15} aria-hidden="true" />{q.syncNow}
            </button>
            <button type="button" className="pill" onClick={goOnline} disabled={offline}>
              <Wifi size={15} aria-hidden="true" />{q.stayOnline}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
