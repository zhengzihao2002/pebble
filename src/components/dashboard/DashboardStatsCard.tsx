'use client';

import { ArrowDownRight, ArrowUpRight, Percent, Wallet } from 'lucide-react';
import { InfoTooltip } from '@/components/shared/InfoTooltip';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { PeriodDot, PeriodLink } from '@/components/shared/PeriodLink';

interface ModeOption { value: string; label: string }
interface PeriodOption { key: string; label: string }

interface DashboardStatsCardProps {
  modes: ModeOption[];
  statsMode: string;
  onModeChange: (mode: string) => void;
  periods: PeriodOption[];
  statsPeriod: string | null;
  onPeriodChange: (key: string) => void;
  rangeLabel: string;
  inProgress: boolean;
  /** Computed by computeStatsForPeriod - never recomputed here. */
  income: number;
  spending: number;
  savingsRate: number;
  saved: number;
}

const selectStyle: React.CSSProperties = {
  fontSize: '0.72rem', padding: '0.28rem 0.5rem', borderRadius: '0.5rem',
  border: '1px solid var(--line)', color: 'var(--ink-soft)', backgroundColor: 'var(--mist)',
};

/**
 * The four period figures in one card, separated by hairlines, with the
 * period controls and range line in its header. The controls here are the
 * Dashboard's ONE period control: Income vs spending and Where it went follow
 * them too. Dashboard only: the shared StatTab / .stat-tabs used by other
 * pages are untouched.
 */
export function DashboardStatsCard({
  modes, statsMode, onModeChange, periods, statsPeriod, onPeriodChange,
  rangeLabel, inProgress, income, spending, savingsRate, saved,
}: DashboardStatsCardProps) {
  const { d } = useTranslation();

  const cells = [
    {
      key: 'income', icon: ArrowUpRight, color: 'var(--pine)', label: d.dashboard.income,
      value: formatCurrency(income), note: d.dashboard.standardIncomeOnly,
      info: (
        <InfoTooltip label={d.dashboard.incomeTooltipLabel}>
          {renderTemplate(d.dashboard.incomeTooltip, { emphasis: <strong>{d.dashboard.incomeEmphasis}</strong> })}
        </InfoTooltip>
      ),
    },
    {
      key: 'spending', icon: ArrowDownRight, color: 'var(--wine)', label: d.dashboard.spending,
      value: formatCurrency(spending), note: '',
      info: <InfoTooltip label={d.dashboard.spendingTooltipLabel}>{d.dashboard.spendingTooltip}</InfoTooltip>,
    },
    {
      key: 'rate', icon: Percent, color: 'var(--gold)', label: d.dashboard.savingsRate,
      value: `${savingsRate.toFixed(2)}%`, note: '',
      info: (
        <InfoTooltip label={d.dashboard.savingsTooltipLabel}>
          {renderTemplate(d.dashboard.savingsTooltip, { emphasis: <strong>{d.dashboard.savingsEmphasis}</strong> })}
        </InfoTooltip>
      ),
    },
    {
      key: 'saved', icon: Wallet, color: 'var(--pine)', label: d.dashboard.saved,
      value: formatCurrency(saved), note: '',
      info: <InfoTooltip label={d.dashboard.savedTooltipLabel}>{d.dashboard.savedTooltip}</InfoTooltip>,
    },
  ];

  return (
    <div className="card pb-stats-card">
      <div className="pb-stats-head">
        <h3 className="pb-stats-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}><PeriodDot />{d.dashboard.periodTitle}</h3>
        <div className="pb-stats-controls" id="pb-period-control">
          <select value={statsMode} onChange={(e) => onModeChange(e.target.value)} style={selectStyle} aria-label={d.dashboard.periodTitle}>
            {/* value is the stored mode key; only the text is translated. */}
            {modes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {periods.length > 0 && (
            <select value={statsPeriod || ''} onChange={(e) => onPeriodChange(e.target.value)} style={selectStyle} aria-label={d.dashboard.periodTitle}>
              {periods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          )}
        </div>
      </div>
      <p className="pb-stats-range">
        <span className="font-mono-tab">{rangeLabel}</span>
        {inProgress && <span>&nbsp;{d.dashboard.inProgressNote}</span>}
        <InfoTooltip label={d.dashboard.periodTooltipLabel}>
          {renderTemplate(d.dashboard.periodCover, { emphasis: <strong>{d.dashboard.periodCoverEmphasis}</strong> })}
          {inProgress && (
            <>
              {' '}{renderTemplate(d.dashboard.periodInProgress, { emphasis: <strong>{d.dashboard.periodInProgressEmphasis}</strong> })}
            </>
          )}
          {' '}{renderTemplate(d.dashboard.periodAnalysis, { emphasis: <strong>{d.dashboard.periodAnalysisEmphasis}</strong> })}
        </InfoTooltip>
      </p>
      <div className="pb-stats-grid">
        {cells.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.key} className="pb-stats-cell">
              <div className="pb-stats-label">
                <Icon size={14} style={{ color: c.color, flex: 'none' }} aria-hidden="true" />
                <span>{c.label}</span>
                {c.info}
              </div>
              <div className="font-mono-tab pb-stats-value">{c.value}</div>
              {/* Every tile reserves the note row, so a tile without a note
                  matches the height of the one that has it. */}
              <div className="pb-stats-note" aria-hidden={c.note ? undefined : true} style={c.note ? undefined : { visibility: 'hidden' }}>{c.note || '\u00a0'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
