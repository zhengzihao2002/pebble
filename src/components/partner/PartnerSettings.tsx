'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, Copy, KeyRound, Shield, UsersRound } from 'lucide-react';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { LoadingBlock } from '@/components/shared/Spinner';
import { callAction } from '@/lib/actions/callAction';
import {
  acceptPartnerInviteAction, createPartnerInviteAction, enterPartnerViewAction, leavePartnerViewAction, readPartnerSettingsAction,
  revokePartnerInviteAction, savePartnerPermissionsAction,
} from '@/lib/actions/partner';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { INCOME_SHARING_KEYS, PARTNER_PERMISSIONS, PARTNER_VIEW_PERMISSIONS, PARTNER_ADD_PERMISSIONS, PARTNER_EDIT_PERMISSIONS, type PartnerPermissions, type PartnerSettingsData } from '@/lib/partner';
import { SETTING_TARGETS } from '@/components/settings/settingsTargets';
import { PartnerDisconnectDialog } from './PartnerDisconnectDialog';
import { partnerError } from './partnerError';

export function PartnerSettings() {
  const { d, t, locale } = useTranslation();
  const x = d.partner;
  const [settings, setSettings] = useState<PartnerSettingsData | null>(null);
  const [invite, setInvite] = useState<{ code: string; expires: string } | null>(null);
  const [enteredCode, setEnteredCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [disconnect, setDisconnect] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<{ error: string; reason?: string } | null>(null);

  const reload = useCallback((showFailure = false) => callAction(readPartnerSettingsAction).then(result => {
    if (result.ok) setSettings(result.data);
    else if (showFailure) setError(result);
  }), []);

  useEffect(() => {
    void reload(true);
  }, [reload]);

  useEffect(() => {
    if (!invite || settings?.partnerName) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, 5000);
    const expires = window.setTimeout(() => { setInvite(null); void reload(); }, Math.max(0, Date.parse(invite.expires) - Date.now()));
    return () => { window.clearInterval(timer); window.clearTimeout(expires); };
  }, [invite, settings?.partnerName, reload]);

  const waitingForPartner = !!settings?.pairId && !settings.partnerConfigured;
  useEffect(() => {
    if (!waitingForPartner) return;
    const check = () => { if (document.visibilityState === 'visible') void reload(); };
    const timer = window.setInterval(check, 5000);
    window.addEventListener('focus', check);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', check); };
  }, [waitingForPartner, reload]);

  const run = async <T extends { ok: true }>(action: () => Promise<T | { ok: false; error: string; reason?: string }>) => {
    setBusy(true);
    setError(null);
    setStatus('');
    const result = await callAction(action);
    setBusy(false);
    if (!result.ok) { setError(result); return null; }
    return result;
  };

  const generate = async () => {
    const result = await run<{ ok: true; code: string; expires: string }>(createPartnerInviteAction);
    if (result) {
      setCopied(false);
      setInvite({ code: result.code, expires: result.expires });
    }
  };

  const accept = async () => {
    if (await run(() => acceptPartnerInviteAction(enteredCode))) {
      setEnteredCode('');
      setInvite(null);
      await reload(true);
    }
  };

  const switchView = async (leave: boolean) => {
    if (await run(leave ? leavePartnerViewAction : () => enterPartnerViewAction(settings?.pairId ?? ''))) {
      // Drop the previous workspace's client state at the mode boundary.
      window.location.assign(new URL(leave ? '/settings#settings-partner' : '/partner', window.location.origin));
    }
  };

  const revoke = async () => {
    if (await run(revokePartnerInviteAction)) {
      setInvite(null);
      await reload(true);
    }
  };

  const displayedInvite = invite?.expires ?? settings?.inviteExpires;
  const partnerName = settings?.partnerName;
  const expiration = displayedInvite
    ? new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(displayedInvite))
    : '';

  return (
    <section id={SETTING_TARGETS.partner} className="card pb-partner-card">
      {settings === null ? (
        error ? <><p role="alert">{partnerError(d, error)}</p><button type="button" className="pill" onClick={() => void reload(true)}>{x.refresh}</button></> : <LoadingBlock minHeight={90} />
      ) : partnerName ? (
        <>
          <SectionHeader icon={UsersRound} title={t(x.pairedWith, { name: partnerName })} subtitle={x.ownSpace} />
          {(!settings.configured || !settings.partnerConfigured) && (
            <div className="pb-partner-setup" role="status">
              <p>{x.setupRequired}</p>
              <ul className="pb-partner-list">
                <li className="pb-partner-list-row"><span>{x.yourSharing}</span><strong>{settings.configured ? x.confirmed : x.pending}</strong></li>
                <li className="pb-partner-list-row"><span>{x.partnerSharing}</span><strong>{settings.partnerConfigured ? x.confirmed : x.pending}</strong></li>
              </ul>
            </div>
          )}
          <div className="pb-partner-actions">
            <button type="button" disabled={busy || (!settings.viewingPartner && (!settings.configured || !settings.partnerConfigured))}
              className="pill active" onClick={() => void switchView(settings.viewingPartner)}>
              <ArrowLeftRight size={16} aria-hidden="true" />{settings.viewingPartner ? x.returnOwn : x.viewPartner}
            </button>
            <button type="button" className="pill" disabled={busy} onClick={() => setDisconnect(true)}>{x.unpair}</button>
          </div>
          <SharingPermissions key={JSON.stringify([settings.pairId, settings.permissions, settings.sharedCategories])} settings={settings}
            busy={busy} save={async (permissions, categoryIds) => {
              if (await run(() => savePartnerPermissionsAction(settings.pairId ?? '', permissions, categoryIds))) {
                setStatus(x.saved);
                await reload(true);
              }
            }} />
        </>
      ) : (
        <>
          <SectionHeader icon={KeyRound} title={x.connect} subtitle={x.connectHelp} />
          {settings.viewingPartner && (
            <button type="button" className="pill" disabled={busy} onClick={() => void switchView(true)}>{x.returnOwn}</button>
          )}
          <div className="pb-partner-invite">
            <div className="pb-partner-actions">
              <button type="button" className="pill" disabled={busy} onClick={() => void generate()}>
                {displayedInvite ? x.replaceCode : x.createCode}
              </button>
              {displayedInvite && <button type="button" className="pill" disabled={busy} onClick={() => void revoke()}>{x.revoke}</button>}
            </div>
            {invite && (
              <div className="pb-partner-invite-code">
                <input className="pb-partner-input pb-partner-code" value={invite.code} aria-label={x.codeLabel} readOnly
                  onFocus={event => event.target.select()} />
                <button type="button" className="pill" onClick={async () => {
                  try { await navigator.clipboard.writeText(invite.code); setCopied(true); } catch { /* The code remains selectable. */ }
                }}><Copy size={14} aria-hidden="true" />{copied ? x.copied : x.copy}</button>
              </div>
            )}
            {displayedInvite && <p className="pb-partner-note">{t(x.expires, { time: expiration })} · {x.waiting}</p>}
          </div>
          <form className="pb-partner-invite-code" onSubmit={event => { event.preventDefault(); void accept(); }}>
            <input className="pb-partner-input pb-partner-code" value={enteredCode} onChange={event => setEnteredCode(event.target.value)}
              placeholder={x.enterCode} aria-label={x.enterCode} maxLength={32} required autoComplete="off" autoCapitalize="none" spellCheck={false} />
            <button type="submit" className="pill active" disabled={busy || enteredCode.trim().length !== 22}>{x.pair}</button>
          </form>
          <button type="button" className="link-btn pb-partner-refresh" disabled={busy} onClick={() => void reload(true)}>{x.refresh}</button>
        </>
      )}
      {error && settings && !disconnect && <p className="pb-partner-error" role="alert">{partnerError(d, error)}</p>}
      <div className="pb-partner-note" role="status">{status}</div>
      {disconnect && partnerName && settings?.pairId && <PartnerDisconnectDialog name={partnerName} pairId={settings.pairId} onClose={() => setDisconnect(false)}
        onUnpaired={() => { setInvite(null); void reload(true); }} />}
    </section>
  );
}

function SharingPermissions({ settings, busy, save }: {
  settings: PartnerSettingsData;
  busy: boolean;
  save: (permissions: PartnerPermissions, categoryIds: string[]) => Promise<void>;
}) {
  const { d } = useTranslation();
  const x = d.partner;
  const [permissions, setPermissions] = useState(settings.permissions);
  const [categoryIds, setCategoryIds] = useState(() => new Set(settings.sharedCategories));
  const [section, setSection] = useState<'view' | 'add' | 'edit'>('view');
  const groups = {
    view: { label: x.see, keys: PARTNER_VIEW_PERMISSIONS },
    add: { label: x.add, keys: PARTNER_ADD_PERMISSIONS },
    edit: { label: x.act, keys: PARTNER_EDIT_PERMISSIONS },
  };
  const categories = [...settings.categories, ...INCOME_SHARING_KEYS.map(id => ({ id, name: categoryLabel(d, id.slice(7)) }))];
  const dirty = PARTNER_PERMISSIONS.some(key => Boolean(permissions[key]) !== Boolean(settings.permissions[key]))
    || categoryIds.size !== settings.sharedCategories.length || settings.sharedCategories.some(id => !categoryIds.has(id));
  const locked = busy || settings.viewingPartner;
  return (
    <form className="pb-partner-permissions" onSubmit={event => { event.preventDefault(); if (!locked) void save(permissions, [...categoryIds]); }}>
      <SectionHeader title={x.privacy} subtitle={x.privacyHelp} icon={Shield} />
      {settings.viewingPartner && <p className="pb-partner-note">{x.errors.settingsOwnOnly}</p>}
      <div className="pb-partner-permission-panel">
        <div className="pb-partner-permission-switch" role="group" aria-label={x.privacy}>
          {(['view', 'add', 'edit'] as const).map(group => {
            const { label, keys } = groups[group];
            const enabled = keys.filter(key => permissions[key] === true).length;
            return <button key={group} type="button" aria-pressed={section === group} onClick={() => setSection(group)}>
              {label}{enabled > 0 && <span>{enabled}</span>}
            </button>;
          })}
        </div>
        <fieldset className="pb-partner-permission-grid" aria-label={groups[section].label} disabled={locked}>
          {groups[section].keys.map(key => <label className="pb-partner-toggle" key={key}>
            <span><strong>{x.permission[key][0]}</strong><small>{x.permission[key][1]}</small></span>
            <input type="checkbox" checked={permissions[key] === true}
              onChange={event => setPermissions({ ...permissions, [key]: event.target.checked })} />
          </label>)}
        </fieldset>
      </div>
      <fieldset className="pb-partner-fieldset" disabled={locked}>
        <legend>{x.chooseCategories}</legend>
        <p className="pb-partner-note">{x.categoriesHelp}</p>
        <div className="pb-partner-actions">
          <button type="button" className="link-btn" onClick={() => setCategoryIds(new Set(categories.map(category => category.id)))}>{x.allCategories}</button>
          <button type="button" className="link-btn" onClick={() => setCategoryIds(new Set())}>{x.noCategories}</button>
        </div>
        <div className="pb-partner-choices">
          {categories.map(category => <label className="pb-partner-check" key={category.id}>
            <input type="checkbox" checked={categoryIds.has(category.id)} onChange={event => {
              const next = new Set(categoryIds);
              if (event.target.checked) next.add(category.id);
              else next.delete(category.id);
              setCategoryIds(next);
            }} />
            <bdi>{category.name}</bdi>
          </label>)}
        </div>
      </fieldset>
      <button type="submit" className="pill active pb-partner-save" disabled={(settings.configured && !dirty) || locked}>
        {settings.configured ? x.savePermissions : x.confirmPermissions}
      </button>
    </form>
  );
}
