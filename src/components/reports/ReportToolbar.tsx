'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, Copy, Download, Ellipsis, RotateCcw } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { PeriodGroup } from './types';

interface ReportToolbarProps {
  /** The resolved period, long form ("October 2026"). */
  label: string;
  /** The same, short, for a phone ("Oct 2026"). */
  shortLabel: string;
  /** False for All time and the rolling windows, which are anchored to today. */
  steppable: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Away from the current period: offer the way back. */
  showCurrent: boolean;
  onCurrent: () => void;
  periodGroup: PeriodGroup;
  onModeChange: (mode: PeriodGroup) => void;
  showExpand: boolean;
  anyExpanded: boolean;
  onToggleAll: () => void;
  onExport: () => void;
  canExport: boolean;
  onCopy: () => Promise<boolean>;
  /** Privacy mode: copying or exporting figures would bypass the blur. */
  copyBlocked: boolean;
}

/**
 * The report's control strip, sticky under the glass header: a period stepper
 * (‹ October 2026 ›), the period mode, Expand all / Collapse all and a small
 * tools menu (Export CSV, Copy summary).
 *
 * Every control here is a second entry point to state the Filters panel
 * already owns - the Time period section is unchanged - so persistence, the
 * 'All' sentinel and the year fallback behave exactly as they do there.
 *
 * The mode is a native select (the owner's "selects, not pill rows" rule for
 * period pickers), painted over a face so it is only as wide as its choice.
 * The tools menu is a plain disclosure, not a dialog, so the app's single-key
 * shortcuts keep working while it is open.
 */
export const ReportToolbar = forwardRef<HTMLDivElement, ReportToolbarProps>(function ReportToolbar({
  label, shortLabel, steppable, canPrev, canNext, onPrev, onNext, showCurrent, onCurrent,
  periodGroup, onModeChange, showExpand, anyExpanded, onToggleAll, onExport, canExport, onCopy, copyBlocked,
}, ref) {
  const { d } = useTranslation();
  const x = d.ux.reports;
  const r = d.reports;
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // A tap anywhere else, or Escape, closes the menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMenuOpen(false);
      menuRef.current?.querySelector<HTMLElement>('.pb-rep-tool-more')?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);
  useEffect(() => {
    if (!status) return;
    const id = window.setTimeout(() => setStatus(null), 2400);
    return () => window.clearTimeout(id);
  }, [status]);

  const modes: [PeriodGroup, string][] = [
    ['month', r.month], ['quarter', r.quarter], ['year', r.year], ['all', r.allTime],
    ['last3', r.last3], ['last6', r.last6], ['last12', r.last12], ['custom', r.custom],
  ];
  const modeLabel = modes.find(([v]) => v === periodGroup)?.[1] ?? '';

  const stepBtn = (dir: 'prev' | 'next') => {
    const can = dir === 'prev' ? canPrev : canNext;
    const hint = dir === 'prev' ? x.noEarlier : x.noLater;
    return (
      <button
        type="button"
        className="pb-rep-step"
        aria-label={dir === 'prev' ? x.prevPeriod : x.nextPeriod}
        aria-disabled={!can || undefined}
        title={can ? undefined : hint}
        onClick={() => { if (can) (dir === 'prev' ? onPrev : onNext)(); }}
        onKeyDown={(e) => {
          // Arrows step while either chevron has focus.
          if (e.key === 'ArrowLeft' && canPrev) { e.preventDefault(); onPrev(); }
          if (e.key === 'ArrowRight' && canNext) { e.preventDefault(); onNext(); }
        }}
      >
        {dir === 'prev' ? <ChevronLeft size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
      </button>
    );
  };

  return (
    <div ref={ref} className="pb-rep-bar" role="toolbar" aria-label={x.reportTools}>
      <div className={`pb-rep-stepper${steppable ? '' : ' is-fixed'}`}>
        {steppable && stepBtn('prev')}
        {/* aria-live so stepping is announced; the label is the period name. */}
        <p className="pb-rep-step-label font-display" aria-live="polite">
          {/* The visible names are CSS-swapped (one is display:none on each
              width), so the live region speaks through its own hidden copy. */}
          <span className="pb-rep-sr">{label}</span>
          <span className="pb-rep-step-long" aria-hidden="true">{label}</span>
          <span className="pb-rep-step-short" aria-hidden="true">{shortLabel}</span>
        </p>
        {steppable && stepBtn('next')}
      </div>
      {showCurrent && (
        <button type="button" className="pb-rep-current" onClick={onCurrent} aria-label={x.backToCurrent}>
          <RotateCcw size={13} aria-hidden="true" />
          <span>{x.currentPeriod}</span>
        </button>
      )}
      <div className="pb-rep-tools">
        <label className="pb-rep-mode">
          <span className="pb-rep-sr">{x.periodMode}</span>
          {/* On a phone the face is an icon: the period name beside it
              already says which mode it is ("Oct 2026", "Last 3 months"). */}
          <span className="pb-rep-mode-face" aria-hidden="true">
            <CalendarRange size={16} className="pb-rep-mode-icon" />
            <span className="pb-rep-mode-text">{modeLabel}</span>
            <ChevronDown size={14} className="pb-rep-mode-chev" />
          </span>
          <select value={periodGroup} onChange={(e) => onModeChange(e.target.value as PeriodGroup)}>
            {modes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {showExpand && (
          <button
            type="button" className="pb-rep-tool" onClick={onToggleAll}
            aria-label={anyExpanded ? r.collapseAll : r.expandAll}
          >
            {anyExpanded ? <ChevronsDownUp size={16} aria-hidden="true" /> : <ChevronsUpDown size={16} aria-hidden="true" />}
            <span className="pb-rep-tool-text">{anyExpanded ? r.collapseAll : r.expandAll}</span>
          </button>
        )}
        <div className="pb-rep-menu-wrap" ref={menuRef}>
          <button
            type="button" className="pb-rep-tool pb-rep-tool-more" aria-label={x.more} aria-haspopup="menu" aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Ellipsis size={18} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="pb-rep-menu" role="menu" aria-label={x.more}>
              {/* The narrowest phones drop the Expand all button from the
                  bar (the period name needs the room); it lives here instead. */}
              {showExpand && (
                <button
                  type="button" role="menuitem" className="pb-rep-menu-expand"
                  onClick={() => { onToggleAll(); setMenuOpen(false); }}
                >
                  {anyExpanded ? <ChevronsDownUp size={15} aria-hidden="true" /> : <ChevronsUpDown size={15} aria-hidden="true" />}
                  <span>{anyExpanded ? r.collapseAll : r.expandAll}</span>
                </button>
              )}
              <button
                type="button" role="menuitem" disabled={!canExport} aria-disabled={(canExport && copyBlocked) || undefined}
                onClick={() => {
                  if (copyBlocked) { setStatus(x.privacyNoCopy); return; }
                  onExport(); setMenuOpen(false);
                }}
              >
                <Download size={15} aria-hidden="true" /><span>{x.exportCsv}</span>
              </button>
              <button
                type="button" role="menuitem" aria-disabled={copyBlocked || undefined}
                onClick={async () => {
                  if (copyBlocked) { setStatus(x.privacyNoCopy); return; }
                  const ok = await onCopy();
                  setStatus(ok ? x.copied : x.copyFailed);
                  setMenuOpen(false);
                }}
              >
                <Copy size={15} aria-hidden="true" /><span>{x.copySummary}</span>
              </button>
              {copyBlocked && <p className="pb-rep-menu-hint">{x.privacyNoCopy}</p>}
            </div>
          )}
        </div>
      </div>
      <span className="pb-rep-status" role="status">{status}</span>
    </div>
  );
});
