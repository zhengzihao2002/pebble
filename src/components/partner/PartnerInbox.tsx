'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Inbox } from 'lucide-react';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { SETTING_TARGETS } from '@/components/settings/settingsTargets';
import { callAction } from '@/lib/actions/callAction';
import { readPartnerInboxAction, readPartnerInboxItemAction } from '@/lib/actions/partner';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { PartnerInboxItem } from '@/lib/partner';
import { partnerError } from './partnerError';

export function PartnerInbox() {
  const { d, t, locale } = useTranslation();
  const x = d.partner.inbox;
  const [items, setItems] = useState<PartnerInboxItem[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const request = useRef(0);
  const reload = useCallback(async () => {
    const attempt = ++request.current;
    const result = await callAction(readPartnerInboxAction);
    if (attempt !== request.current) return;
    if (result.ok) { setItems(result.items); setError(''); }
    else { setItems(null); setError(partnerError(d, result)); }
  }, [d]);

  useEffect(() => {
    const initialLoad = window.setTimeout(reload, 0);
    window.addEventListener('focus', reload);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener('focus', reload);
    };
  }, [reload]);

  useEffect(() => {
    if (!items?.length) return;
    const nextExpiry = items.reduce((earliest, item) => Math.min(earliest, Date.parse(item.expiresAt)), Infinity);
    const timer = window.setTimeout(() => {
      setItems(previous => previous?.filter(item => Date.parse(item.expiresAt) > Date.now()) ?? []);
    }, Math.max(0, nextExpiry - Date.now()));
    return () => window.clearTimeout(timer);
  }, [items]);

  const markRead = async (id: string) => {
    setBusy(id);
    setError('');
    const result = await callAction(() => readPartnerInboxItemAction(id));
    setBusy(null);
    if (!result.ok) { setError(partnerError(d, result)); return; }
    request.current++;
    setItems(previous => previous?.filter(item => item.id !== id) ?? []);
  };

  return <section id={SETTING_TARGETS.partnerInbox} className="card pb-partner-card">
    <SectionHeader title={x.title} subtitle={x.hint} icon={Inbox}
      actions={items?.length ? <span className="pill">{items.length}</span> : undefined} />
    {error && <p className="pb-partner-error" role="alert">{error}</p>}
    {!error && items?.length === 0 && <p className="pb-partner-note">{x.empty}</p>}
    {!!items?.length && <ul className="pb-partner-list">
      {items.map(item => <li key={item.id} className="pb-partner-list-row">
        <div>
          <strong>{t(x[item.operation], { resource: x.resources[item.resource] })}{item.label && <> · <bdi>{item.label}</bdi></>}</strong>
          <p className="pb-partner-note">{item.guestName ?? x.guest} · {new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium', timeStyle: 'short',
          }).format(new Date(item.createdAt))}</p>
        </div>
        <button className="pill" type="button" disabled={busy !== null} onClick={() => void markRead(item.id)}>{x.read}</button>
      </li>)}
    </ul>}
  </section>;
}
