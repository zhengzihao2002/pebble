'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Copy, KeyRound, Shield, UsersRound } from 'lucide-react';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { LoadingBlock } from '@/components/shared/Spinner';
import { callAction } from '@/lib/actions/callAction';
import { quietSyncIsPaused } from '@/lib/offline/quietSync';
import { useQuietSync } from '@/components/offline/QuietSyncProvider';
import {
  acceptPartnerInviteAction, createPartnerInviteAction, enterPartnerViewAction, leavePartnerViewAction, readPartnerSettingsAction,
  revokePartnerInviteAction, savePartnerPermissionsAction,
} from '@/lib/actions/partner';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { normalizeCensoredWords } from '@/lib/partnerCensorship';
import { INCOME_SHARING_KEYS, PARTNER_PERMISSIONS, PARTNER_VIEW_PERMISSIONS, PARTNER_ADD_PERMISSIONS, PARTNER_EDIT_PERMISSIONS, type PartnerPermissions, type PartnerSettingsData } from '@/lib/partner';
import { SETTING_TARGETS } from '@/components/settings/settingsTargets';
import { PartnerDisconnectDialog } from './PartnerDisconnectDialog';
import { partnerDisplayName } from '@/lib/partnerDisplay';
import { PARTNER_LEGACY_CODE_LENGTH, parsePartnerMatchCode } from '@/lib/partnerMatchCode';
import { partnerError } from './partnerError';

const PERMISSION_TABS = ['view', 'add', 'edit'] as const;
type PermissionTab = (typeof PERMISSION_TABS)[number];

export function PartnerSettings() {
  const { d, t, locale } = useTranslation();
  const x = d.partner;
  const { enabled: readsPaused } = useQuietSync();
  const [settings, setSettings] = useState<PartnerSettingsData | null>(null);
  const [invite, setInvite] = useState<{ code: string; expires: string } | null>(null);
  const [enteredCode, setEnteredCode] = useState('');
  const matchCode = parsePartnerMatchCode(enteredCode);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [disconnect, setDisconnect] = useState(false);
  const [permissionTab, setPermissionTab] = useState<PermissionTab>('view');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<{ error: string; reason?: string } | null>(null);

  const reload = useCallback((showFailure = false) => callAction(readPartnerSettingsAction).then(result => {
    if (result.ok) setSettings(result.data);
    else if (showFailure) setError(result);
  }), []);

  useEffect(() => {
    if (!readsPaused && !quietSyncIsPaused()) void reload(true);
  }, [reload, readsPaused]);

  const displayedInvite = invite?.expires ?? settings?.inviteExpires;
  useEffect(() => {
    if (!displayedInvite || settings?.pairId) return;
    const expires = window.setTimeout(() => {
      setInvite(null);
      setSettings(previous => previous?.inviteExpires === displayedInvite ? { ...previous, inviteExpires: null } : previous);
    }, Math.max(0, Date.parse(displayedInvite) - Date.now()));
    return () => window.clearTimeout(expires);
  }, [displayedInvite, settings?.pairId]);

  const waitingForPartner = !!settings?.pairId && !settings.partnerConfigured;
  const awaitingInvite = !!displayedInvite && !settings?.pairId;
  useEffect(() => {
    if (!waitingForPartner && !awaitingInvite) return;
    const check = () => { if (document.visibilityState === 'visible' && !quietSyncIsPaused()) void reload(); };
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [waitingForPartner, awaitingInvite, reload]);

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
    if (!matchCode || busy) return;
    if (await run(() => acceptPartnerInviteAction(matchCode.code))) {
      setEnteredCode('');
      setInvite(null);
      await reload(true);
    }
  };

  const switchView = async (leave: boolean) => {
    if (!leave && quietSyncIsPaused()) return;
    if (await run(leave ? leavePartnerViewAction : () => enterPartnerViewAction(settings?.pairId ?? ''))) {
      // Drop the previous workspace's client state at the mode boundary.
      window.location.assign(new URL(leave ? '/settings#settings-partner' : '/partner/dashboard', window.location.origin));
    }
  };

  const revoke = async () => {
    if (await run(revokePartnerInviteAction)) {
      setInvite(null);
      await reload(true);
    }
  };

  const partnerName = settings?.pairId ? partnerDisplayName(settings.partnerName, x.partnerName) : null;
  const expiration = displayedInvite
    ? new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(displayedInvite))
    : '';

  return (
    <section id={SETTING_TARGETS.partner} className="card pb-partner-card">
      {settings === null ? (
        readsPaused ? <>
          <SectionHeader icon={UsersRound} title={x.title} />
          <p className="pb-partner-note">{d.ux.offline.quietSync.needsLive}</p>
        </> : error ? <><p role="alert">{partnerError(d, error)}</p><button type="button" className="pill" onClick={() => void reload(true)}>{x.refresh}</button></> : <LoadingBlock minHeight={90} />
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
            <button type="button" disabled={busy || (!settings.viewingPartner && (readsPaused || !settings.configured || !settings.partnerConfigured))}
              className="pill active" onClick={() => void switchView(settings.viewingPartner)}>
              <ArrowLeftRight size={16} aria-hidden="true" />{settings.viewingPartner ? x.returnOwn : x.viewPartner}
            </button>
            <button type="button" className="pill" disabled={busy} onClick={() => setDisconnect(true)}>{x.unpair}</button>
            {waitingForPartner && <button type="button" className="link-btn" disabled={busy} onClick={() => void reload(true)}>{x.refresh}</button>}
          </div>
          {readsPaused && !settings.viewingPartner && <p className="pb-partner-note">{d.ux.offline.quietSync.needsLive}</p>}
          <SharingPermissions key={JSON.stringify([settings.pairId, settings.permissions, settings.sharedCategories, settings.censoredWords])} settings={settings}
            section={permissionTab} onSection={setPermissionTab} busy={busy} save={async (permissions, categoryIds, words) => {
              if (await run(() => savePartnerPermissionsAction(settings.pairId ?? '', permissions, categoryIds, words))) {
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
              placeholder={x.enterCode} aria-label={x.enterCode} maxLength={PARTNER_LEGACY_CODE_LENGTH}
              required autoComplete="off" autoCapitalize="none" spellCheck={false} />
            <button type="submit" className="pill active" disabled={busy || !matchCode}>{x.pair}</button>
          </form>
          <button type="button" className="link-btn pb-partner-refresh" disabled={busy} onClick={() => void reload(true)}>{x.refresh}</button>
        </>
      )}
      {error && settings && !disconnect && <p className="pb-partner-error" role="alert">{partnerError(d, error)}</p>}
      <div className="pb-partner-note" role="status">{status}</div>
      {disconnect && partnerName && settings?.pairId && <PartnerDisconnectDialog name={partnerName} pairId={settings.pairId} onClose={() => setDisconnect(false)}
        onUnpaired={() => { setInvite(null); setPermissionTab('view'); void reload(true); }} />}
    </section>
  );
}

function SharingPermissions({ settings, section, onSection, busy, save }: {
  settings: PartnerSettingsData;
  section: PermissionTab;
  onSection: (tab: PermissionTab) => void;
  busy: boolean;
  save: (permissions: PartnerPermissions, categoryIds: string[], words?: string[]) => Promise<void>;
}) {
  const { d } = useTranslation();
  const x = d.partner;
  const [permissions, setPermissions] = useState(settings.permissions);
  const [categoryIds, setCategoryIds] = useState(() => new Set(settings.sharedCategories));
  const savedWords = settings.censoredWords ?? [];
  const [wordsDraft, setWordsDraft] = useState(() => savedWords.join('\n'));
  const viewportRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const panel = viewport?.querySelector<HTMLElement>('[data-open="true"]');
    if (!viewport || !panel) return;

    const fit = () => { viewport.style.height = `${panel.offsetHeight}px`; };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [section]);

  const words = normalizeCensoredWords(wordsDraft.split(/\r?\n/).map(line => line.trim()).filter(Boolean));
  const wordsChanged = words !== null && JSON.stringify(words) !== JSON.stringify(savedWords);
  const groups = {
    view: { label: x.see, keys: PARTNER_VIEW_PERMISSIONS },
    add: { label: x.add, keys: PARTNER_ADD_PERMISSIONS },
    edit: { label: x.act, keys: PARTNER_EDIT_PERMISSIONS },
  };
  const categories = [...settings.categories, ...INCOME_SHARING_KEYS.map(id => ({ id, name: categoryLabel(d, id.slice(7)) }))];
  const dirty = wordsChanged || PARTNER_PERMISSIONS.some(key => Boolean(permissions[key]) !== Boolean(settings.permissions[key]))
    || categoryIds.size !== settings.sharedCategories.length || settings.sharedCategories.some(id => !categoryIds.has(id));
  const locked = busy || settings.viewingPartner;
  return (
    <form className="pb-partner-permissions" onSubmit={event => { event.preventDefault(); if (!locked && words) void save(permissions, [...categoryIds], wordsChanged ? words : undefined); }}>
      <SectionHeader title={x.privacy} subtitle={x.privacyHelp} icon={Shield} />
      {settings.viewingPartner && <p className="pb-partner-note">{x.errors.settingsOwnOnly}</p>}
      <div className="pb-partner-permission-panel" data-active={section}>
        <div className="pb-partner-permission-switch" role="group" aria-label={x.privacy}>
          <span className="pb-partner-permission-thumb" aria-hidden="true" />
          {PERMISSION_TABS.map(group => {
            const { label, keys } = groups[group];
            const enabled = keys.filter(key => permissions[key] === true).length;
            return <button key={group} type="button" aria-pressed={section === group} onClick={() => onSection(group)}>
              {label}{enabled > 0 && <span>{enabled}</span>}
            </button>;
          })}
        </div>
        <div className="pb-partner-permission-viewport" ref={viewportRef}>
          <div className="pb-partner-permission-track">
            {PERMISSION_TABS.map(tab => (
              <div key={tab} className="pb-partner-permission-content" data-open={section === tab}
                aria-hidden={section !== tab} inert={section !== tab}>
                <fieldset className="pb-partner-permission-grid" aria-label={groups[tab].label} disabled={locked}>
                  {groups[tab].keys.map(key => <label className="pb-partner-toggle" key={key}>
                    <span><strong>{x.permission[key][0]}</strong><small>{x.permission[key][1]}</small></span>
                    <input type="checkbox" checked={permissions[key] === true}
                      onChange={event => setPermissions({ ...permissions, [key]: event.target.checked })} />
                  </label>)}
                </fieldset>
              </div>
            ))}
          </div>
        </div>
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
      <fieldset id={SETTING_TARGETS.partnerCensoredWords} className="pb-partner-fieldset pb-settings-target" disabled={locked}>
        <legend>{x.censoredWords}</legend>
        <p className="pb-partner-note" id="pb-partner-censored-words-help">{x.censoredWordsHelp}</p>
        <textarea className="pb-partner-input pb-partner-censored-words" aria-label={x.censoredWords}
          aria-describedby={words ? 'pb-partner-censored-words-help' : 'pb-partner-censored-words-help pb-partner-censored-words-error'}
          aria-invalid={words === null} rows={3} value={wordsDraft} placeholder={x.censoredWordsPlaceholder}
          spellCheck={false} onChange={event => setWordsDraft(event.target.value)} />
        {words === null && <p className="pb-partner-error" id="pb-partner-censored-words-error">{x.censoredWordsLimit}</p>}
      </fieldset>
      <button type="submit" className="pill active pb-partner-save" disabled={(settings.configured && !dirty) || locked || words === null}>
        {settings.configured ? x.savePermissions : x.confirmPermissions}
      </button>
    </form>
  );
}
