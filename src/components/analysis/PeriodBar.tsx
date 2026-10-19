'use client';

import { useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { InfoTooltip } from '@/components/shared/InfoTooltip';
import { PeriodDot } from '@/components/shared/PeriodLink';
import { renderTemplate } from '@/lib/i18n/RichText';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { ANALYSIS_WINDOW_KEYS, type AnalysisWindow, type AnalysisWindowKey } from '@/lib/analysis/windows';
import { PERIOD_BAR_ID } from './parts';

export interface RailItem { id: string; label: string }

interface PeriodBarProps {
  windowKey: AnalysisWindowKey;
  onChange: (key: AnalysisWindowKey) => void;
  /** Null until today resolves; the range line waits for it. */
  analysisWindow: AnalysisWindow | null;
  rail: RailItem[];
  active: string | null;
  onJump: (id: string) => void;
}

/**
 * The page's one control, sticky under the glass header: the period, the
 * range it resolves to (with the complete-months explanation), and a rail of
 * the page's sections.
 *
 * The period has two faces bound to the same state: a segmented control
 * (short labels; the full name is each option's aria-label) and, on a narrow
 * bar or at very large text, the original native select - which keeps the
 * id "analysis-window" and its <label htmlFor>. CSS shows one at a time.
 *
 * The bar publishes its own height as --pb-ana-bar-h, so section headings
 * scroll to just below it rather than under it.
 */
export function PeriodBar({ windowKey, onChange, analysisWindow, rail, active, onJump }: PeriodBarProps) {
  const { d, t } = useTranslation();
  const x = d.ux.analysis;
  const ref = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const host = el?.closest<HTMLElement>('.pb-ana');
    if (!el || !host) return;
    const publish = () => host.style.setProperty('--pb-ana-bar-h', `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the lit rail chip in view when the rail scrolls sideways (phone).
  useEffect(() => {
    const rl = railRef.current;
    const on = rl?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!rl || !on) return;
    const left = on.offsetLeft - rl.clientWidth / 2 + on.offsetWidth / 2;
    rl.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [active]);

  const options = ANALYSIS_WINDOW_KEYS.map((k) => ({ value: k, label: x.windowShort[k] }));
  const count = analysisWindow?.calendarMonths ?? 0;

  return (
    <div ref={ref} id={PERIOD_BAR_ID} className="pb-ana-bar">
      <div className="pb-ana-bar-period">
        <label className="filter-label pb-ana-bar-label" htmlFor="analysis-window" id="analysis-window-label">
          <PeriodDot />
          {d.analysis.period.label}
        </label>
        {/* Wide bar: short labels. Each option's full name ("Last 12 complete
            months") is read out through the group's title line beside it. */}
        <div className="pb-ana-seg-wrap">
          <SegmentedControl<AnalysisWindowKey>
            options={options} value={windowKey} onChange={onChange}
            ariaLabel={`${d.analysis.period.label}: ${d.analysis.windowLabels[windowKey]}`}
            size="sm" className="pb-ana-seg"
          />
        </div>
        {/* Narrow bar or huge text: the original select, same id and label. */}
        <span className="pb-ana-select">
          <select id="analysis-window" value={windowKey} onChange={(e) => onChange(e.target.value as AnalysisWindowKey)}>
            {/* value is the stored AnalysisWindowKey; only the text is translated. */}
            {ANALYSIS_WINDOW_KEYS.map((k) => (
              <option key={k} value={k}>{d.analysis.windowLabels[k]}</option>
            ))}
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </span>
      </div>

      <p className="pb-ana-bar-range">
        <span className="pb-ana-bar-name">{d.analysis.windowLabels[windowKey]}</span>
        {analysisWindow && (
          <>
            <span className="pb-ana-bar-sep is-first" aria-hidden="true">·</span>
            {/* A date range and a count, not money: tabular, never blurred. */}
            <span className="pb-tnum">{analysisWindow.rangeLabel || d.analysis.noCompleteRange}</span>
            {analysisWindow.hasCompleteMonth && (
              <>
                <span className="pb-ana-bar-sep" aria-hidden="true">·</span>
                {/* The whole translated phrase, rather than the number
                    stripped out of it with .replace() - that broke in any
                    locale where the count is not written as its digits. */}
                <span className="pb-tnum">
                  {t(count === 1 ? d.analysis.completeMonthsOne : d.analysis.completeMonthsOther, { count })}
                </span>
              </>
            )}
            <InfoTooltip label={d.analysis.period.tooltipLabel}>
              {renderTemplate(d.analysis.period.tooltip, {
                exactly: <strong>{d.analysis.period.exactly}</strong>,
                excluded: <strong>{t(d.analysis.period.excluded, { month: analysisWindow.currentMonthLabel })}</strong>,
              })}
            </InfoTooltip>
          </>
        )}
      </p>

      {rail.length > 1 && (
        <nav className="pb-ana-rail" aria-label={x.jumpTo}>
          <div ref={railRef} className="pb-ana-rail-track">
            {rail.map((r) => (
              <button
                key={r.id} type="button" className="pb-ana-rail-btn"
                aria-current={active === r.id ? 'true' : undefined}
                onClick={() => onJump(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
