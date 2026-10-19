import type { ReactNode } from 'react';

export interface TipRow {
  name: string;
  value: ReactNode;
  /** The series' colour, shown as a dot beside the name (never on the text). */
  color?: string;
  /** Money: blurred in privacy mode with the rest of the tooltip. */
  money?: boolean;
  strong?: boolean;
}

/**
 * The Analysis charts' hover panel, for charts whose tooltip says more than
 * one series' value. A custom `content` loses Recharts' default panel, so
 * analysis.css gives .pb-ana-tip the same surface as .recharts-default-tooltip
 * (mist panel, ink text, tabular figures). It still renders inside
 * .recharts-tooltip-wrapper, so privacy mode blurs it like any other.
 */
export function ChartTooltip({ title, rows, foot }: { title: ReactNode; rows: TipRow[]; foot?: ReactNode }) {
  return (
    <div className="pb-ana-tip">
      <p className="pb-ana-tip-title">{title}</p>
      {rows.map((r) => (
        <p key={r.name} className={`pb-ana-tip-row${r.strong ? ' is-strong' : ''}`}>
          <span>{r.color && <i style={{ background: r.color }} />}{r.name}</span>
          <span className={r.money === false ? 'pb-tnum' : 'font-mono-tab'}>{r.value}</span>
        </p>
      ))}
      {foot && <p className="pb-ana-tip-foot">{foot}</p>}
    </div>
  );
}
