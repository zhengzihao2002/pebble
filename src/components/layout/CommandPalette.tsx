'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, CalendarClock, Eye, EyeOff, Plus, Search, Settings as SettingsIcon, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { navItems } from './navItems';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { getSearchTransactionsAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import { formatCurrency, formatDate } from '@/lib/format';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import type { CategoryMeta, LedgerRecord, Transaction } from '@/types';

interface CommandPaletteProps {
  onClose: () => void;
  onAddTransaction: () => void;
  onTransfer: () => void;
  onAddGoal: () => void;
  onAddSchedule: () => void;
  onOpenTransaction: (txn: LedgerRecord, categoryMeta: CategoryMeta) => void;
}

interface Command {
  id: string;
  label: string;
  icon: LucideIcon;
  group: 'actions' | 'pages' | 'settings';
  run: () => void;
}

type Row =
  | { key: string; group: 'actions' | 'pages' | 'settings'; cmd: Command }
  | { key: string; group: 'transactions'; txn: Transaction };

type SearchState = 'idle' | 'loading' | 'ready' | 'error';

const MAX_TXN_RESULTS = 20;

const hidden: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
};

/**
 * ⌘K / Ctrl+K. Actions reuse AppShell's own handlers and pages use the
 * router. Transaction search loads every expense and income row ONCE per
 * palette session, on the first keystroke, and keeps it in memory only -
 * never in storage. Opening the palette to jump somewhere sends nothing.
 *
 * Whatever is picked runs AFTER the palette's exit, from the frame's
 * onClose: a dialog it opens then takes focus last, instead of the palette
 * handing focus back to whatever was focused before it.
 */
export function CommandPalette({
  onClose, onAddTransaction, onTransfer, onAddGoal, onAddSchedule, onOpenTransaction,
}: CommandPaletteProps) {
  const { d, locale } = useTranslation();
  const router = useRouter();
  const privacyOn = usePebbleStore((s) => s.privacyOn);
  const setPrivacyOn = usePebbleStore((s) => s.setPrivacyOn);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const pending = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [meta, setMeta] = useState<CategoryMeta>({});
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  // After ModalFrame's own effect, which focuses the card (child effects run
  // first), so the filter box ends up focused.
  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);

  const loadOnce = () => {
    if (searchState !== 'idle') return;
    setSearchState('loading');
    void callAction(getSearchTransactionsAction, d.palette.searchFailed).then((result) => {
      if (!aliveRef.current) return;
      if (!result.ok) {
        setSearchError(translateActionError(d, locale, result));
        setSearchState('error');
        return;
      }
      setTxns(result.transactions);
      setMeta(buildCategoryMeta(result.categories, result.budgets));
      setSearchState('ready');
    });
  };

  // Settings is one page; its sections are found by id (SettingsClient). Going
  // there from elsewhere waits briefly for the page to mount, then scrolls.
  const goToSection = (id: string) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scroll = () => {
      const el = document.getElementById(id);
      if (!el) return false;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      return true;
    };
    if (window.location.pathname !== '/settings') router.push('/settings');
    let tries = 0;
    const tick = () => { if (scroll() || ++tries > 40) return; window.setTimeout(tick, 50); };
    window.setTimeout(tick, 0);
  };

  const commands: Command[] = [
    { id: 'add', label: d.header.addTransaction, icon: Plus, group: 'actions', run: onAddTransaction },
    { id: 'transfer', label: d.transfer.title, icon: ArrowRightLeft, group: 'actions', run: onTransfer },
    { id: 'goal', label: d.common.addGoal, icon: Target, group: 'actions', run: onAddGoal },
    { id: 'schedule', label: d.header.addSchedule, icon: CalendarClock, group: 'actions', run: onAddSchedule },
    {
      id: 'privacy', label: privacyOn ? d.privacyMode.showAmounts : d.privacyMode.hideAmounts,
      icon: privacyOn ? Eye : EyeOff, group: 'actions', run: () => setPrivacyOn(!privacyOn),
    },
    ...navItems.map((item): Command => ({
      id: item.href, label: d.nav[item.labelKey], icon: item.icon, group: 'pages',
      run: () => router.push(item.href),
    })),
    { id: 's-money', label: d.settingsSections.money, icon: SettingsIcon, group: 'settings', run: () => goToSection('settings-money') },
    { id: 's-appearance', label: d.settingsSections.appearance, icon: SettingsIcon, group: 'settings', run: () => goToSection('settings-appearance') },
    { id: 's-language', label: d.settingsSections.languageRegion, icon: SettingsIcon, group: 'settings', run: () => goToSection('settings-language-region') },
    { id: 's-behavior', label: d.settingsSections.behavior, icon: SettingsIcon, group: 'settings', run: () => goToSection('settings-behavior') },
    { id: 's-account', label: d.account.title, icon: SettingsIcon, group: 'settings', run: () => goToSection('settings-pebble-account') },
    { id: 's-privacy', label: d.privacyMode.title, icon: SettingsIcon, group: 'settings', run: () => goToSection('settings-behavior') },
    { id: 's-dropdowns', label: d.selectMode.title, icon: SettingsIcon, group: 'settings', run: () => goToSection('settings-behavior') },
    { id: 's-sessions', label: d.sessions.title, icon: SettingsIcon, group: 'settings', run: () => router.push('/account/security') },
  ];

  const q = query.trim().toLowerCase();
  // Amount search ignores $, commas and spaces, and only runs on queries
  // that contain a digit, so typing a word never matches every amount.
  const qAmount = q.replace(/[$,\s]/g, '');
  const amountQuery = /[0-9]/.test(qAmount);

  const shownCommands = q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
  const shownTxns = q && searchState === 'ready'
    ? txns.filter((x) => {
        const tag = x.type === 'expense' && x.tag ? x.tag.toLowerCase() : '';
        return (
          x.description.toLowerCase().includes(q)
          || x.category.toLowerCase().includes(q)
          || categoryLabel(d, x.category).toLowerCase().includes(q)
          || (tag !== '' && tag.includes(q))
          || (amountQuery && Math.abs(x.amount).toFixed(2).includes(qAmount))
        );
      }).slice(0, MAX_TXN_RESULTS)
    : [];

  const rows: Row[] = [
    ...shownCommands.map((cmd): Row => ({ key: `c-${cmd.id}`, group: cmd.group, cmd })),
    ...shownTxns.map((txn): Row => ({ key: `t-${txn.id}`, group: 'transactions', txn })),
  ];
  const index = Math.min(active, Math.max(0, rows.length - 1));

  useEffect(() => {
    document.getElementById(`pb-palette-opt-${index}`)?.scrollIntoView({ block: 'nearest' });
  }, [index, q, rows.length]);

  const groupLabel = (g: Row['group']) =>
    g === 'actions' ? d.palette.actions : g === 'pages' ? d.palette.pages : g === 'settings' ? d.palette.settings : d.palette.transactions;

  return (
    <ModalFrame
      onClose={() => { onClose(); const run = pending.current; pending.current = null; run?.(); }}
      labelledBy="pb-palette-title"
      maxWidth={560}
    >
      {(close) => {
        const pick = (row: Row | undefined) => {
          if (!row) return;
          if ('cmd' in row) pending.current = row.cmd.run;
          else { const txn = row.txn; const categoryMeta = meta; pending.current = () => onOpenTransaction(txn, categoryMeta); }
          close();
        };
        return (
          <>
            <div className="pb-modal-head">
              <h2 id="pb-palette-title" style={hidden}>{d.palette.title}</h2>
              <div style={{ position: 'relative' }}>
                <Search size={17} aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                    if (e.target.value.trim()) loadOnce();
                  }}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, rows.length - 1)); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                    else if (e.key === 'Enter') { e.preventDefault(); pick(rows[index]); }
                  }}
                  placeholder={d.palette.placeholder}
                  aria-label={d.palette.title}
                  aria-controls="pb-palette-list"
                  aria-activedescendant={rows.length > 0 ? `pb-palette-opt-${index}` : undefined}
                  autoComplete="off" spellCheck={false}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '0.75rem 0.9rem 0.75rem 2.4rem',
                    borderRadius: '0.75rem', border: '1px solid var(--line)', fontSize: '1rem',
                    color: 'var(--ink)', backgroundColor: 'var(--paper)',
                  }}
                />
              </div>
            </div>

            <div className="pb-modal-body themed-scroll">
              {rows.length > 0 && (
                <ul id="pb-palette-list" role="listbox" aria-label={d.palette.title} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {rows.map((row, i) => {
                    const on = i === index;
                    const firstOfGroup = i === 0 || rows[i - 1].group !== row.group;
                    const optionStyle: React.CSSProperties = {
                      display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.6rem 0.75rem',
                      borderRadius: '0.6rem', cursor: 'pointer', fontSize: '0.9rem',
                      backgroundColor: on ? 'var(--pine-soft)' : 'transparent',
                      color: on ? 'var(--pine)' : 'var(--ink)',
                    };
                    let body: React.ReactNode;
                    if ('cmd' in row) {
                      const Icon = row.cmd.icon;
                      body = (
                        <>
                          <Icon size={16} aria-hidden="true" style={{ flex: 'none' }} />
                          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.cmd.label}</span>
                        </>
                      );
                    } else {
                      const x = row.txn;
                      const m = meta[x.category];
                      const Icon = m?.icon;
                      // Description and category are USER DATA and render as stored;
                      // only the two income literals get a translated label.
                      const title = x.description.split('\n')[0] || categoryLabel(d, x.category);
                      body = (
                        <>
                          <span aria-hidden="true" style={{ width: 16, flex: 'none', display: 'inline-flex', color: m ? m.color : 'var(--ink-soft)' }}>
                            {Icon && <Icon size={16} />}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                            <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {formatDate(x.date, locale)} · {categoryLabel(d, x.category)}
                            </span>
                          </span>
                          <span className="font-mono-tab" style={{ flex: 'none', fontWeight: 600, color: x.amount > 0 ? 'var(--pine)' : 'var(--ink)' }}>
                            {x.amount > 0 ? '+' : ''}{formatCurrency(x.amount)}
                          </span>
                        </>
                      );
                    }
                    return (
                      <li key={row.key} role="presentation">
                        {firstOfGroup && (
                          <p aria-hidden="true" style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-soft)', margin: i === 0 ? '0 0 0.3rem' : '0.7rem 0 0.3rem' }}>
                            {groupLabel(row.group)}
                          </p>
                        )}
                        <div
                          id={`pb-palette-opt-${i}`}
                          role="option"
                          aria-selected={on}
                          onMouseMove={() => { if (!on) setActive(i); }}
                          onClick={() => pick(row)}
                          style={optionStyle}
                        >
                          {body}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {q && searchState === 'loading' && (
                <p role="status" style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', margin: '0.7rem 0 0', textAlign: 'center' }}>{d.palette.searching}</p>
              )}
              {q && searchState === 'error' && searchError && (
                <p role="status" style={{ fontSize: '0.8rem', color: 'var(--wine)', margin: '0.7rem 0 0', textAlign: 'center' }}>{searchError}</p>
              )}
              {rows.length === 0 && searchState !== 'loading' && searchState !== 'error' && (
                <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', textAlign: 'center', padding: '1.5rem 0', margin: 0 }}>{d.palette.empty}</p>
              )}
            </div>
          </>
        );
      }}
    </ModalFrame>
  );
}
