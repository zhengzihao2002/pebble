'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, CalendarClock, CornerDownLeft, Receipt, Eye, EyeOff, Plus, Search, SearchX, Settings as SettingsIcon, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { EmptyState } from '@/components/kit/EmptyState';
import { navItems } from './navItems';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { getSearchTransactionsAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import { formatCurrency, formatDate, formatFullDate } from '@/lib/format';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import type { CategoryMeta, LedgerRecord, Transaction } from '@/types';

/**
 * Keeps an option visible by scrolling ONLY its own list. scrollIntoView also
 * scrolls every ancestor - including the dialog overlay while the phone sheet
 * is still sliding in, which threw the whole sheet up the screen until it
 * snapped back. Finds the nearest scrollable list and adjusts just that.
 * (Jumping the Settings page to a section still uses scrollIntoView: there,
 * scrolling the page is the point.)
 */
function scrollNearestWithin(el: Element | null | undefined) {
  if (!(el instanceof HTMLElement)) return;
  let box = el.parentElement;
  while (box) {
    const oy = getComputedStyle(box).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && box.scrollHeight > box.clientHeight) break;
    box = box.parentElement;
  }
  if (!box) return;
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  // Group captions stick to the top of the list, so an option is only in
  // view once it clears its own group's caption.
  const cap = el.closest('[role="group"]')?.querySelector<HTMLElement>('.pb-shell-pal-cap');
  const top = b.top + (cap ? cap.offsetHeight : 0);
  if (r.top < top) box.scrollTop -= top - r.top;
  else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom;
}

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
  /** The single-key shortcut AppShell already binds, shown as a hint. */
  key?: string;
}

type Row =
  | { key: string; group: 'actions' | 'pages' | 'settings'; cmd: Command }
  | { key: string; group: 'transactions'; txn: Transaction };

type SearchState = 'idle' | 'loading' | 'ready' | 'error';

const MAX_TXN_RESULTS = 20;

/**
 * The query's first occurrence in `text` wrapped in <mark>, case-insensitively.
 * Display only: matching itself is the plain substring test below.
 */
function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q);
  if (i === -1) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="pb-shell-mark">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

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
  useEffect(() => { // Touch screens: no auto-focus. On a phone it raises the keyboard while the
    // sheet is still sliding in, and iOS pans the screen mid-animation (the
    // sheet overshoots the top and a gap opens below). Tap the field to type.
    if (!window.matchMedia('(pointer: coarse)').matches) inputRef.current?.focus({ preventScroll: true }); }, []);

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
    { id: 'add', label: d.header.addTransaction, icon: Plus, group: 'actions', run: onAddTransaction, key: 'N' },
    { id: 'transfer', label: d.transfer.title, icon: ArrowRightLeft, group: 'actions', run: onTransfer, key: 'T' },
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
    scrollNearestWithin(document.getElementById(`pb-palette-opt-${index}`));
  }, [index, q, rows.length]);

  // Consecutive rows of one group, for the sticky captions. The row order
  // (and so every option's index) is unchanged.
  const groups: { group: Row['group']; items: { row: Row; i: number }[] }[] = [];
  rows.forEach((row, i) => {
    const last = groups[groups.length - 1];
    if (last && last.group === row.group) last.items.push({ row, i });
    else groups.push({ group: row.group, items: [{ row, i }] });
  });
  const activeRow: Row | undefined = rows[index];

  const groupLabel = (g: Row['group']) =>
    g === 'actions' ? d.palette.actions : g === 'pages' ? d.palette.pages : g === 'settings' ? d.palette.settings : d.palette.transactions;

  return (
    <ModalFrame
      onClose={() => { onClose(); const run = pending.current; pending.current = null; run?.(); }}
      labelledBy="pb-palette-title"
      // Wide enough on a desktop for the results and a preview of the active
      // one side by side (the split appears from a 720px card, shell.css).
      // Phones are a full-width sheet either way.
      maxWidth={780}
      // Nothing pinned at the bottom, so the keyboard simply covers the lower
      // part of the sheet instead of shrinking it and leaving a gap.
      keyboardResize={false}
      cardClassName="pb-palette-card"
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
              {/* The search field and, on phones, a close button beside it (the
                  sheet fills the screen and there is no Escape key). */}
              <div className="pb-palette-searchrow">
              <div className="pb-palette-search" style={{ position: 'relative' }}>
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
                <div className="pb-palette-closerow">
                  <ModalCloseButton onClick={close} />
                </div>
              </div>
            </div>

            <div className="pb-modal-body themed-scroll pb-shell-pal-body">
              <div className={`pb-shell-pal-split${rows.length > 0 ? ' pb-shell-pal-has-rows' : ''}`}>
              <div className="pb-shell-pal-results">
              {rows.length > 0 && (
                // Options are grouped (role=group, labelled by the caption) so
                // each caption can stick to the top of the list while its rows
                // scroll under it. Option ids keep one running index across
                // groups for aria-activedescendant.
                <div id="pb-palette-list" role="listbox" aria-label={d.palette.title} className="pb-shell-pal-list">
                  {groups.map((g) => (
                    <div key={g.group} role="group" aria-labelledby={`pb-palette-cap-${g.group}`} className="pb-shell-pal-group">
                      <p id={`pb-palette-cap-${g.group}`} aria-hidden="true" className="pb-shell-pal-cap">{groupLabel(g.group)}</p>
                      {g.items.map(({ row, i }) => {
                        const on = i === index;
                        let body: React.ReactNode;
                        if ('cmd' in row) {
                          const Icon = row.cmd.icon;
                          body = (
                            <>
                              <span className="pb-shell-pal-icon" aria-hidden="true"><Icon size={16} /></span>
                              <span className="pb-shell-pal-text">
                                <span className="pb-shell-pal-title">{highlight(row.cmd.label, q)}</span>
                              </span>
                              {/* Display only: AppShell binds N and T itself. */}
                              {row.cmd.key && <kbd className="pb-shell-kbd" aria-hidden="true">{row.cmd.key}</kbd>}
                            </>
                          );
                        } else {
                          const x = row.txn;
                          const m = meta[x.category];
                          // A category with no meta (deleted, or not loaded) still gets a tile.
                          const Icon = m?.icon ?? Receipt;
                          // Description and category are USER DATA and render as stored;
                          // only the two income literals get a translated label.
                          const title = x.description.split('\n')[0] || categoryLabel(d, x.category);
                          const catText = categoryLabel(d, x.category);
                          const tag = x.type === 'expense' && x.tag ? x.tag : '';
                          // Matched by amount alone: say so, since nothing in
                          // the words is highlighted to explain the hit.
                          // The whole description, as the filter tests it: a hit on
                          // a later line is still a text match, not an amount one.
                          const textHit = x.description.toLowerCase().includes(q) || catText.toLowerCase().includes(q)
                            || x.category.toLowerCase().includes(q) || tag.toLowerCase().includes(q);
                          const amountHit = !textHit && amountQuery && Math.abs(x.amount).toFixed(2).includes(qAmount);
                          body = (
                            <>
                              <span
                                className="pb-shell-pal-icon" aria-hidden="true"
                                style={m ? { color: m.color, backgroundColor: `color-mix(in srgb, ${m.color} 13%, transparent)` } : undefined}
                              >
                                <Icon size={16} />
                              </span>
                              <span className="pb-shell-pal-text">
                                <span className="pb-shell-pal-title">{highlight(title, q)}</span>
                                <span className="pb-shell-pal-sub">
                                  <span className="pb-tnum">{formatDate(x.date, locale)}</span> · {highlight(catText, q)}
                                  {tag && <> · {highlight(tag, q)}</>}
                                </span>
                              </span>
                              <span className="pb-shell-pal-end">
                                <span className={`font-mono-tab pb-shell-pal-amt${x.amount > 0 ? ' pb-shell-pal-in' : ''}`}>
                                  {x.amount > 0 ? '+' : ''}{formatCurrency(x.amount)}
                                </span>
                                {amountHit && <span className="pb-shell-pal-badge">{d.ux.shell.matchedAmount}</span>}
                              </span>
                            </>
                          );
                        }
                        return (
                          <div
                            key={row.key}
                            id={`pb-palette-opt-${i}`}
                            role="option"
                            aria-selected={on}
                            onMouseMove={() => { if (!on) setActive(i); }}
                            onClick={() => pick(row)}
                            className={`pb-shell-pal-opt${on ? ' pb-shell-pal-on' : ''}`}
                          >
                            {body}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}

              {q && searchState === 'loading' && (
                <p role="status" style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', margin: '0.7rem 0 0', textAlign: 'center' }}>{d.palette.searching}</p>
              )}
              {q && searchState === 'error' && searchError && (
                <p role="status" style={{ fontSize: '0.8rem', color: 'var(--wine)', margin: '0.7rem 0 0', textAlign: 'center' }}>{searchError}</p>
              )}
              {rows.length === 0 && searchState !== 'loading' && searchState !== 'error' && (
                <EmptyState compact icon={SearchX} title={d.palette.empty} body={d.ux.shell.emptyHint} />
              )}
              </div>

              {/* Desktop only (hidden below a 720px card): what Enter will
                  open. Decorative for assistive tech - the active option is
                  already announced through aria-activedescendant. */}
              {activeRow && (
                <aside className="pb-shell-pal-preview" aria-hidden="true">
                  {'cmd' in activeRow ? (() => {
                    const Icon = activeRow.cmd.icon;
                    return (
                      <>
                        <span className="pb-shell-pal-prev-tile"><Icon size={22} /></span>
                        <p className="pb-shell-pal-prev-kind">
                          {activeRow.group === 'actions' ? d.ux.shell.previewAction : activeRow.group === 'pages' ? d.ux.shell.previewPage : d.ux.shell.previewSetting}
                        </p>
                        <p className="pb-shell-pal-prev-title">{activeRow.cmd.label}</p>
                        {activeRow.cmd.key && (
                          <p className="pb-shell-pal-prev-line">{d.ux.shell.shortcutHint} <kbd className="pb-shell-kbd">{activeRow.cmd.key}</kbd></p>
                        )}
                      </>
                    );
                  })() : (() => {
                    const x = activeRow.txn;
                    const m = meta[x.category];
                    // A category with no meta (deleted, or not loaded) still gets a tile.
                    const Icon = m?.icon ?? Receipt;
                    const title = x.description.split('\n')[0] || categoryLabel(d, x.category);
                    return (
                      <>
                        <span
                          className="pb-shell-pal-prev-tile"
                          style={m ? { color: m.color, backgroundColor: `color-mix(in srgb, ${m.color} 13%, transparent)` } : undefined}
                        >
                          <Icon size={22} />
                        </span>
                        <p className="pb-shell-pal-prev-kind">{d.enums.kind[x.type]}</p>
                        <p className="pb-shell-pal-prev-title">{title}</p>
                        <p className={`font-mono-tab pb-shell-pal-prev-amt${x.amount > 0 ? ' pb-shell-pal-in' : ''}`}>
                          {x.amount > 0 ? '+' : ''}{formatCurrency(x.amount)}
                        </p>
                        <dl className="pb-shell-pal-prev-rows">
                          <div><dt>{d.addTxn.date}</dt><dd className="pb-tnum">{formatFullDate(x.date, locale)}</dd></div>
                          <div><dt>{d.addTxn.category}</dt><dd>{categoryLabel(d, x.category)}</dd></div>
                          {x.type === 'expense' && x.tag && <div><dt>{d.addTxn.tag}</dt><dd>{x.tag}</dd></div>}
                        </dl>
                      </>
                    );
                  })()}
                  <p className="pb-shell-pal-prev-hint"><CornerDownLeft size={13} /> {d.ux.shell.previewOpen}</p>
                </aside>
              )}
              </div>
            </div>

            {/* Keyboard legend: desktop only (shell.css hides it on phones,
                which have no arrow keys or Escape). */}
            <div className="pb-shell-pal-legend" aria-hidden="true">
              <span><kbd className="pb-shell-kbd">↑</kbd><kbd className="pb-shell-kbd">↓</kbd> {d.ux.shell.legendMove}</span>
              <span><kbd className="pb-shell-kbd"><CornerDownLeft size={11} strokeWidth={2.4} /></kbd> {d.ux.shell.legendOpen}</span>
              <span><kbd className="pb-shell-kbd">esc</kbd> {d.ux.shell.legendClose}</span>
            </div>
          </>
        );
      }}
    </ModalFrame>
  );
}
