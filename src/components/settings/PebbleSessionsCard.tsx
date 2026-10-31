'use client';

import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Laptop, MapPin, Smartphone } from 'lucide-react';
import { authClient } from '@/lib/auth/client';
import { isInvalidPassword, requiresFreshSignIn } from '@/lib/auth/sessionErrors';
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
 * signed-in user's rows. Tokens are used only for revocation and are never
 * persisted or logged by this component.
 */
export function PebbleSessionsCard() {
  const { d, t, locale } = useTranslation();
  const { data: current, refetch } = authClient.useSession();
  const currentId = current?.session?.id;
  const passwordId = useId();

  const [sessions, setSessions] = useState<ListedSession[] | null>(null);
  const [locations, setLocations] = useState<Record<string, SessionLocation>>({});
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Refresh both Neon’s independent memory cache and the React hook.
      // This also makes a retry after successful confirmation use the new ID.
      await authClient.getSession({ fetchOptions: { headers: { 'X-Force-Fetch': 'true' } } });
      await refetch();
      const list = await authClient.listSessions();
      setError(null);
      // Freshness is based on sign-in time, not session expiry. Refreshing
      // cookies cannot satisfy this check; the user must confirm credentials.
      if (requiresFreshSignIn(list.error)) {
        setNeedsConfirmation(true);
        setSessions(null);
        setLocations({});
        return;
      }
      if (list.error || !Array.isArray(list.data)) {
        setError(d.sessions.loadFailed);
        setSessions((prev) => prev ?? []);
        return;
      }
      setNeedsConfirmation(false);
      setConfirmationError(null);
      const rows = [...(list.data as unknown as ListedSession[])].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      setSessions(rows);
      const locs = await callAction(getSessionLocationsAction, d.sessions.loadFailed);
      if (locs.ok) {
        setLocations(Object.fromEntries(locs.locations.map((l) => [l.sessionId, l])));
      } else {
        setError(translateActionError(d, locale, locs));
      }
    } catch (failure) {
      if (requiresFreshSignIn(failure)) {
        setError(null);
        setNeedsConfirmation(true);
        setSessions(null);
        setLocations({});
      } else {
        setError(d.sessions.loadFailed);
        setSessions((prev) => prev ?? []);
      }
    }
  }, [d, locale, refetch]);

  useEffect(() => {
    // Strict Mode's discarded mount must not start a duplicate auth request.
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void load(); });
    return () => { cancelled = true; };
  }, [load]);

  const confirmAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = current?.user?.email;
    if (!email || confirming) return;
    const form = event.currentTarget;
    const password = String(new FormData(form).get('password') ?? '');
    if (!password) return;
    form.reset();
    const previousId = current?.session?.id;
    setConfirming(true);
    setConfirmationError(null);
    try {
      // Use the normal auth gate, keeping the same account and app state.
      // No sign-out, cache clearing, navigation, or weakened freshness policy.
      const result = await authClient.signIn.email({ email, password });
      if (result.error || !result.data?.token) {
        setConfirmationError(isInvalidPassword(result.error)
          ? d.sessionsStale.invalidPassword : d.sessionsStale.confirmFailed);
        return;
      }
      // Sign-in creates a new session. Retire the replaced one after success
      // so each confirmation does not leave another active session behind.
      let revokeFailed = false;
      if (previousId) {
        try {
          // useSession().session.token can be a JWT injected by Neon. The
          // now-authorized list supplies the revocation token for the old ID.
          const list = await authClient.listSessions();
          if (list.error || !Array.isArray(list.data)) throw new Error('Session list unavailable');
          const previous = list.data.find(session => session.id === previousId);
          if (previous && previous.token !== result.data.token) {
            const revoked = await authClient.revokeSession({ token: previous.token });
            revokeFailed = Boolean(revoked.error);
          }
        } catch { revokeFailed = true; }
      }
      setNeedsConfirmation(false);
      await load();
      if (revokeFailed) setError(d.sessions.revokeFailed);
    } catch (failure) {
      setConfirmationError(isInvalidPassword(failure) ? d.sessionsStale.invalidPassword : d.sessionsStale.confirmFailed);
    } finally {
      setConfirming(false);
    }
  };

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

  // Vercel cannot see an exact model: browsers send one user agent for every
  // iPhone. Android sometimes names its model, and Chrome often hides it.
  const deviceModel = (ua?: string | null): string | null => {
    if (!ua) return null;
    if (/iPhone|iPod/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) {
      const m = /Android [\d.]+; ([^;)]+?)(?: Build|[;)])/.exec(ua);
      const model = m?.[1]?.trim();
      return model && model !== 'K' && model.length > 1 ? model : 'Android';
    }
    if (/Mac OS X|Macintosh/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Linux/.test(ua)) return 'Linux';
    return null;
  };

  return (
    <div className="card" aria-busy={sessions === null && !error && !needsConfirmation} style={{ padding: '1.5rem' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>{d.sessions.title}</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.1rem', lineHeight: 1.5 }}>{d.sessions.blurb}</p>

      {error && <ActionError message={error} kind="auth" onRetry={() => void load()} style={{ marginBottom: '0.9rem' }} />}

      {needsConfirmation ? (
        <form onSubmit={confirmAccess} aria-busy={confirming} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.75rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>{d.sessionsStale.title}</h4>
          <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>{d.sessionsStale.hint}</p>
          <input type="hidden" name="email" autoComplete="username" value={current?.user?.email ?? ''} />
          <label htmlFor={passwordId} style={{ fontSize: '0.84rem', fontWeight: 600 }}>{d.sessionsStale.password}</label>
          <input id={passwordId} name="password" type="password" autoComplete="current-password" required disabled={confirming}
            aria-describedby={confirmationError ? `${passwordId}-error` : undefined}
            style={{ width: '100%', maxWidth: '24rem', padding: '0.6rem 0.75rem', borderRadius: '0.6rem', border: '1px solid var(--line)', fontSize: '0.9rem', color: 'var(--ink)', backgroundColor: 'var(--paper)' }} />
          {confirmationError && <p id={`${passwordId}-error`} role="alert" style={{ margin: 0, color: 'var(--wine)', fontSize: '0.8rem' }}>{confirmationError}</p>}
          <button type="submit" className="btn-primary" disabled={confirming || !current?.user?.email}>
            {confirming ? d.sessionsStale.confirming : d.sessionsStale.confirm}
          </button>
        </form>
      ) : sessions === null ? (
        <LoadingBlock label={d.sessions.loading} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {sessions.map((s, i) => {
            const dev = device(s.userAgent);
            const model = deviceModel(s.userAgent);
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
                  {model && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ink-soft)' }}>{model}</p>}
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
