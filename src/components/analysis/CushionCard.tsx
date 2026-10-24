'use client';

import { Repeat, LifeBuoy } from 'lucide-react';
import { requestShell } from '@/components/layout/shellEvents';
import { formatCurrency } from '@/lib/format';
import { renderTemplate } from '@/lib/i18n/RichText';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { CashflowSummary, Commitments } from '@/lib/analysis/cashflow';
import { CardHead, PeriodChip, Tile, monthsLabel } from './parts';

/** Months on the cushion scale; longer runs end in an overflow arrow. */
const SCALE = 24;

function CushionBar({ months, tone }: { months: number; tone: 'pine' | 'gold' }) {
  const over = months > SCALE;
  return (
    <span className="pb-ana-cush-bar pb-chart-fill" aria-hidden="true">
      <span className={`pb-ana-cush-fill is-${tone}${over ? ' is-over' : ''}`} style={{ width: `${(Math.min(months, SCALE) / SCALE) * 100}%` }} />
    </span>
  );
}

/**
 * Runway and Months of expenses covered, the cash-flow cushion pair, on ONE
 * months scale (0-24, longer runs end in an arrow and "24+ months") so the
 * two compare at a glance. Both tiles keep their label, exact value, '—'
 * state, note and explanation; when income covers spending, runway's row
 * says so in words, in pine.
 */
export function CushionCard({ cashflow, range }: { cashflow: CashflowSummary; range: string }) {
  const { d, t } = useTranslation();
  const x = d.ux.analysis;
  const cf = d.analysis.cashflow;
  const runway = cashflow.runwayMonths;
  const cover = cashflow.expenseCoverMonths;
  const ticks = [0, 6, 12, 18, 24];

  return (
    <section className="card pb-ana-card pb-ana-cushion" aria-labelledby="pb-ana-cushion-title">
      <CardHead id="pb-ana-cushion-title" icon={<LifeBuoy size={15} />} title={x.cushion} scope={x.cushionSub} badge={<PeriodChip range={range} />} />
      <div className="pb-ana-cush">
        <div className="pb-ana-cush-row">
          <Tile
            money={false}
            label={cf.runwayLabel}
            tooltipLabel={cf.runwayTooltipLabel}
            value={runway === null ? '—' : monthsLabel(runway, d, t)}
            note={runway === null ? <span style={{ color: 'var(--pine)', fontWeight: 600 }}>{cf.runwayCovered}</span> : cf.runwayNote}
          >
            {cf.runwayTooltip}
          </Tile>
          {runway !== null && <CushionBar months={runway} tone="gold" />}
        </div>
        <div className="pb-ana-cush-row">
          <Tile
            money={false}
            label={cf.coverLabel}
            tooltipLabel={cf.coverTooltipLabel}
            value={cover === null ? '—' : monthsLabel(cover, d, t)}
            note={cf.coverNote}
          >
            {renderTemplate(cf.coverTooltip, { emphasis: <strong>{cf.coverEmphasis}</strong> })}
          </Tile>
          {cover !== null && <CushionBar months={cover} tone="pine" />}
        </div>
        {(runway !== null || cover !== null) && (
          <div className="pb-ana-cush-axis pb-tnum" aria-hidden="true">
            {ticks.map((m) => <span key={m} style={{ left: `${(m / SCALE) * 100}%` }}>{m === SCALE ? '24+' : m}</span>)}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Fixed monthly commitments: both figures with their rule counts, a split
 * bar of out against in, and - new - how much of a typical month's spending
 * is already spoken for (labelled as a standing figure set against the
 * period's average, since it mixes the two).
 */
export function CommitmentsCard({ commitments, monthlyAverage }: { commitments: Commitments; monthlyAverage: number | null }) {
  const { d, t } = useTranslation();
  const x = d.ux.analysis;
  const cf = d.analysis.cashflow;
  const total = commitments.expenseMonthly + commitments.incomeMonthly;
  const share = monthlyAverage && monthlyAverage > 0 && commitments.expenseMonthly > 0
    ? Math.round((commitments.expenseMonthly / monthlyAverage) * 100) : null;
  return (
    <section className="card pb-ana-card pb-ana-commit" aria-labelledby="pb-ana-commit-title">
      <CardHead
        id="pb-ana-commit-title"
        icon={<Repeat size={15} />}
        title={cf.commitmentsTitle}
        tooltipLabel={cf.commitmentsTooltipLabel}
        tooltip={cf.commitmentsTooltip}
        scope={cf.commitmentsScope}
      />
      {total > 0 && (
        <span className="pb-ana-split is-thick pb-chart-fill" role="img" aria-label={x.commitSplit}>
          {commitments.expenseMonthly > 0 && <span className="is-out" style={{ flexGrow: commitments.expenseMonthly }} />}
          {commitments.incomeMonthly > 0 && <span className="is-in" style={{ flexGrow: commitments.incomeMonthly }} />}
        </span>
      )}
      <div className="stat-tabs pb-ana-pair">
        <Tile
          label={cf.committedOut}
          value={formatCurrency(commitments.expenseMonthly)}
          note={<span className="pb-tnum">{t(commitments.expenseCount === 1 ? d.analysis.activeRuleOne : d.analysis.activeRuleOther, { count: commitments.expenseCount })}</span>}
          className="is-out"
        />
        <Tile
          label={cf.committedIn}
          value={formatCurrency(commitments.incomeMonthly)}
          note={<span className="pb-tnum">{t(commitments.incomeCount === 1 ? d.analysis.activeRuleOne : d.analysis.activeRuleOther, { count: commitments.incomeCount })}</span>}
          className="is-in"
        />
      </div>
      {/* No scheduled rules: the zeros alone read as broken, so say why and how to fill them. */}
      {total === 0 && (
        <p className="pb-ana-foot">
          {x.noRulesNote}{' '}
          <button type="button" className="link-btn pb-ana-needs-link" onClick={() => requestShell('addSchedule')}>{x.addSchedule}</button>
        </p>
      )}
      {share !== null && <p className="pb-ana-foot pb-tnum">{t(x.fixedShare, { pct: `${share}%` })}</p>}
    </section>
  );
}

