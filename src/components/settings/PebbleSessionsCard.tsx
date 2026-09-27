'use client';

import { useCallback, useEffect, useState } from 'react';
import { Laptop, MapPin, Smartphone } from 'lucide-react';
import { authClient } from '@/lib/auth/client';
import { getSessionLocationsAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { SessionLocation } from '@/lib/data/sessionLocation';
import { ActionError } from '@/components/shared/ActionError';
import { LoadingBlock } from '@/components/shared/Spinner';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';

interface ListedSession {
  id: string;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/**
 * Replaces the auth library's SessionsCard on /account/security: that card
 * cannot show a location. The list and revoke still come from the library's
 * own client (listSessions / revokeSession) - no second auth path. Locations
 * come from Pebble's getSessionLocationsAction, which returns ONLY the
 * signed-in user's rows. The session token stays inside the auth client,
 * used only to revoke.
 */
export function PebbleSessionsCard() {
  const { d, t, locale } = useTranslation();
  const { data: current } = authClient.useSession();
  const currentId = current?.session?.id;

  const [sessions, setSessions] = useState<ListedSession[] | null>(null);
  const [locations, setLocations] = useState<Record<string, SessionLocation>>({});
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, locs] = await Promise.all([
        authClient.listSessions(),
        callAction(getSessionLocationsAction, d.sessions.loadFailed),
      ]);
      if (list.error || !list.data) {
        setError(d.sessions.loadFailed);
        setSessions((prev) => prev ?? []);
        return;
      }
      const rows = [...(list.data as unknown as ListedSession[])].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      setSessions(rows);
      if (locs.ok) {
        setLocations(Object.fromEntries(locs.locations.map((l) => [l.sessionId, l])));
      } else {
        setError(translateActionError(d, locale, locs));
      }
    } catch {
      setError(d.sessions.loadFailed);
      setSessions((prev) => prev ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  const revoke = async (s: ListedSession) => {
    setRevoking(s.id);
    setError(null);
    try {
      const res: unknown = await authClient.revokeSession({ token: s.token });
      if (res && typeof res === 'object' && (res as { error?: unknown }).error) throw new Error('revoke failed');
      await load();
    } catch {
      setError(d.sessions.revokeFailed);
    }
    setRevoking(null);
  };

  const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
  const dateFmt = new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short' });
  let regionNames: Intl.DisplayNames | null = null;
  try { regionNames = new Intl.DisplayNames([tag], { type: 'region' }); } catch { regionNames = null; }

  // "Ithaca, NY · United States" - the country name in the interface language.
  const place = (l?: SessionLocation): string | null => {
    if (!l) return null;
    const country = l.country ? (regionNames?.of(l.country) ?? l.country) : null;
    const local = [l.city, l.region].filter(Boolean).join(', ');
    return [local, country].filter(Boolean).join(' · ') || null;
  };

  // A plain, readable user-agent check - enough for "Chrome on macOS". iOS is
  // tested first because iPhone user agents also contain "Mac OS X".
  const device = (ua?: string | null): { label: string; mobile: boolean } => {
    if (!ua) return { label: d.sessions.unknownDevice, mobile: false };
    const browser =
      /Edg\//.test(ua) ? 'Edge'
      : /OPR\/|Opera/.test(ua) ? 'Opera'
      : /FxiOS\/|Firefox\//.test(ua) ? 'Firefox'
      : /CriOS\/|Chrome\//.test(ua) ? 'Chrome'
      : /Safari\//.test(ua) ? 'Safari'
      : d.sessions.unknownBrowser;
    const os =
      /iPhone|iPad|iPod/.test(ua) ? 'iOS'
      : /Android/.test(ua) ? 'Android'
      : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
      : /Windows/.test(ua) ? 'Windows'
      : /Linux/.test(ua) ? 'Linux'
      : null;
    const mobile = /iPhone|iPod|Android.*Mobile|Mobile\//.test(ua);
    return { label: os ? t(d.sessions.browserOn, { browser, os }) : browser, mobile };
  };

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>{d.sessions.title}</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.1rem', lineHeight: 1.5 }}>{d.sessions.blurb}</p>

      {error && <ActionError message={error} onRetry={() => void load()} style={{ marginBottom: '0.9rem' }} />}

      {sessions === null ? (
        <LoadingBlock label={d.sessions.loading} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {sessions.map((s, i) => {
            const dev = device(s.userAgent);
            const where = place(locations[s.id]);
            const isCurrent = s.id === currentId;
            const DeviceIcon = dev.mobile ? Smartphone : Laptop;
            const details = [
              s.ipAddress || null,
              t(d.sessions.signedIn, { date: dateFmt.format(new Date(s.createdAt)) }),
              t(d.sessions.lastActive, { date: dateFmt.format(new Date(s.updatedAt)) }),
            ].filter(Boolean).join(' · ');
            return (
              <div key={s.id} style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start', padding: '0.9rem 0', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}>
                <span style={{ width: 36, height: 36, borderRadius: '0.6rem', backgroundColor: 'var(--pine-soft)', color: 'var(--pine)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <DeviceIcon size={17} />
                </span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {dev.label}
                    {isCurrent && (
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--pine)', backgroundColor: 'var(--pine-soft)', borderRadius: 99, padding: '0.1rem 0.5rem' }}>
                        {d.sessions.thisDevice}
                      </span>
                    )}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: where ? 'var(--ink)' : 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <MapPin size={13} style={{ flexShrink: 0, color: where ? 'var(--pine)' : 'var(--ink-soft)' }} />
                    {where ?? d.sessions.notRecorded}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--ink-soft)', overflowWrap: 'anywhere' }}>{details}</p>
                </div>
                {!isCurrent && (
                  <button
                    type="button" className="pill" disabled={revoking !== null} onClick={() => void revoke(s)}
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.78rem', color: 'var(--wine)', flexShrink: 0, opacity: revoking !== null ? 0.6 : 1 }}
                  >
                    {revoking === s.id ? d.sessions.signingOut : d.sessions.signOut}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
