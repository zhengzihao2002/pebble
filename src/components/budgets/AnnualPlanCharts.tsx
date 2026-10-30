'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { formatCurrency } from '@/lib/format';
import type { CategoryItem } from '@/lib/data/mappers';
import { SectionHeader } from '@/components/kit/SectionHeader';

export function AnnualPlanCharts({ categories, current, proposed }: { categories: CategoryItem[]; current: Record<string, number>; proposed: Record<string, number> }) {
  const { d } = useTranslation();
  const x = d.ux.annualBudgets;
  const rows = categories.map(c => ({ id: c.id, name: categoryLabel(d, c.name), color: c.color, current: current[c.id] ?? 0, next: Number.isFinite(proposed[c.id]) ? Math.max(0, proposed[c.id]) : 0 }))
    .filter(c => c.current > 0 || c.next > 0).sort((a,b) => Math.max(b.current,b.next)-Math.max(a.current,a.next));
  const visible = rows.slice(0, 6);
  if (rows.length > 6) visible.push({ id: 'other', name: x.otherCategories, color: 'var(--ink-soft)', current: rows.slice(6).reduce((s,c)=>s+c.current,0), next: rows.slice(6).reduce((s,c)=>s+c.next,0) });
  const total = rows.reduce((s,c)=>s+c.next,0);
  const max = Math.max(1,...visible.flatMap(c=>[c.current,c.next]));
  return <section className="card pb-annual-charts">
    <SectionHeader title={x.chartTitle} subtitle={x.chartNote} />
    <div className="pb-annual-chart-key"><span><i className="pb-annual-chart-old" />{x.chartCurrent}</span><span><i />{x.chartNext}</span></div>
    <div className="pb-chart-fade">
      <div className="pb-annual-allocation" role="img" aria-label={x.allocation + ': ' + rows.filter(c=>c.next>0).map(c=>`${c.name} ${formatCurrency(c.next)}`).join(', ')}>
        {rows.filter(c=>c.next>0).map(c=><span key={c.id} style={{flexGrow:c.next,background:c.color}} />)}
      </div>
      {total === 0 && <p className="pb-annual-chart-empty">{x.noAllocation}</p>}
      <div className="pb-annual-chart-rows">{visible.map(c=><div key={c.id} className="pb-annual-chart-row">
        <span className="pb-annual-chart-name"><i style={{background:c.color}} />{c.name}</span>
        <div className="pb-annual-chart-series"><span className="pb-annual-chart-track"><i style={{width:`${c.current/max*100}%`,background:c.color,opacity:.3}} /></span><span className="font-mono-tab" aria-label={x.chartCurrent}>{formatCurrency(c.current)}</span></div>
        <div className="pb-annual-chart-series"><span className="pb-annual-chart-track"><i style={{width:`${c.next/max*100}%`,background:c.color}} /></span><span className="font-mono-tab" aria-label={x.chartNext}>{formatCurrency(c.next)}</span></div>
      </div>)}</div>
    </div>
  </section>;
}
