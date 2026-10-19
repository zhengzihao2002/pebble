/**
 * NEW: a word-sized month-by-month strip for one budget row - January to
 * December of this year, one thin bar per month, the current month lighter
 * (in progress, as in the details chart) and later months a faint dot on the
 * baseline. A hairline marks the monthly share of the budget, so a month
 * that ran hot stands above it. The bars wear the category colour as an
 * identity mark only - never wine or pine.
 *
 * Fixed size and no measuring, so it renders identically on the server.
 * Wrapped in pb-chart-fade: privacy mode blurs it like every chart.
 */
const W = 72;
const H = 26;
const BAR = 4;
const GAP = (W - BAR * 12) / 11;

export function MiniSpark({ values, currentIndex, color, monthlyBudget }: {
  /** Twelve months, January first; null for months still to come. */
  values: (number | null)[];
  /** Index of the month in progress (0-11). */
  currentIndex: number;
  /** The category's colour (user data). */
  color: string;
  /** The yearly budget / 12, or 0 for none. */
  monthlyBudget: number;
}) {
  const max = Math.max(monthlyBudget, ...values.map((v) => v ?? 0)) || 1;
  const y = (v: number) => H - (v / max) * (H - 2);
  return (
    <span className="pb-bud-spark pb-chart-fade" aria-hidden="true">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} focusable="false">
        {values.map((v, i) => {
          const x = i * (BAR + GAP);
          if (v === null) return <rect key={i} className="pb-bud-spark-future" x={x + BAR / 2 - 1} y={H - 2} width={2} height={2} rx={1} />;
          const h = v > 0 ? Math.max(1.5, H - y(v)) : 0;
          return h > 0 ? (
            <rect key={i} x={x} y={H - h} width={BAR} height={h} rx={1.5} fill={color} fillOpacity={i === currentIndex ? 0.5 : 1} />
          ) : (
            <rect key={i} className="pb-bud-spark-future" x={x} y={H - 1} width={BAR} height={1} />
          );
        })}
        {monthlyBudget > 0 && <line className="pb-bud-spark-ref" x1={0} x2={W} y1={y(monthlyBudget)} y2={y(monthlyBudget)} />}
      </svg>
    </span>
  );
}
