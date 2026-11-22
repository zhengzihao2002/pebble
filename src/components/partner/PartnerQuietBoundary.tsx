'use client';

import { useLayoutEffect, useState, type ReactNode } from 'react';
import { useQuietSync } from '@/components/offline/QuietSyncProvider';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useCurrentUser } from '@/lib/auth/useCurrentUser';
import { quietWorkerCommand } from '@/lib/offline/quietSync';
import { PartnerViewBar } from './PartnerViewBar';

export function PartnerQuietBoundary({ pair, expiresAt, accessVersion, children }: {
  pair: string; expiresAt: number; accessVersion?: string; children: ReactNode;
}) {
  const { d } = useTranslation();
  const { id } = useCurrentUser();
  const { enabled, partnerExpiresAt, partnerAccessVersion, status, problem, syncNow } = useQuietSync();
  const deadline = Math.min(expiresAt, partnerExpiresAt ?? expiresAt);
  const [now, setNow] = useState(0);
  const [wasQuiet, setWasQuiet] = useState(false);

  useLayoutEffect(() => {
    if (!enabled) return;
    setWasQuiet(true);
    const update = () => setNow(Date.now());
    const timeout = window.setTimeout(update, Math.max(0, deadline - Date.now()));
    update();
    window.addEventListener('pageshow', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('pageshow', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [deadline, enabled]);

  const expired = enabled && deadline <= now;
  const accessChanged = enabled && partnerAccessVersion !== undefined && partnerAccessVersion !== accessVersion;
  const turnedOff = wasQuiet && !enabled;
  useLayoutEffect(() => {
    if (expired) void quietWorkerCommand({ type: 'QUIET_STATUS', user: id, pair, onDemand: true });
  }, [expired, id, pair]);

  if (!expired && !accessChanged && !turnedOff) return children;

  return (
    <div className="pebble-root">
      <main className="pb-partner-expired">
        <section className="card pb-partner-card">
          <h1>{d.partner.savedViewExpired}</h1>
          <p>{turnedOff ? d.partner.liveViewHelp : d.partner.savedViewExpiredHelp}</p>
          {problem && <p role="status">{d.ux.offline.quietSync.problem[problem]}</p>}
          <div className="pb-partner-actions">
            {enabled && <button className="pill active" type="button" disabled={status !== 'paused'} onClick={syncNow}>
              {status === 'syncing' ? d.ux.offline.quietSync.status.syncing : d.ux.offline.quietSync.syncNow}
            </button>}
            {turnedOff && <a className="pill active" href={location.pathname}>{d.partner.openLiveView}</a>}
            {enabled && (partnerExpiresAt ?? 0) > now && <a className="pill" href={location.pathname}>{d.partner.openSavedView}</a>}
          </div>
          <PartnerViewBar name={null} pathname="/settings" />
        </section>
      </main>
    </div>
  );
}
