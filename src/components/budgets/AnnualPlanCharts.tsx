'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { formatCurrency } from '@/lib/format';
import type { CategoryItem } from '@/lib/data/mappers';
import { SectionHeader } from '@/components/kit/SectionHeader';

type ChartRow = { id: string; name: string; color: string; current: number; next: number };
/** Omit the whole label when either line would truncate; the segment still has its tooltip. */
function AllocationLabel({ row, total }: { row: ChartRow; total: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const label = ref.current;
    if (!label) return;
    const measure = () => {
      const lines = Array.from(label.children) as HTMLElement[];
      label.style.visibility = lines.every(line => line.scrollWidth <= line.clientWidth) ? 'visible' : 'hidden';
    };
    const observer = new ResizeObserver(measure);
    observer.observe(label);
    document.fonts.addEventListener('loadingdone', measure);
    measure();
    return () => { observer.disconnect(); document.fonts.removeEventListener('loadingdone', measure); };
  }, [row.name, row.next, total]);
  return <span ref={ref} style={{ flexGrow: row.next, visibility: 'hidden' }}>{row.next / total >= .1 && <><span className="pb-bud-ribbon-name">{row.name}</span><span className="pb-bud-ribbon-share font-mono-tab">{share(row.next,total)}</span></>}</span>;
}
function share(amount: number, total: number): string {
  const value = total > 0 ? amount / total * 100 : 0;
  return value > 0 && value < .1 ? '<0.1%' : `${value.toFixed(1)}%`;
}

/** Positioned against the actual segment and measured popup, including long category names. */
function AllocationTip({ row, total, anchor, id }: { row: ChartRow; total: number; anchor: HTMLElement; id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const tip = ref.current;
    const wrap = tip?.parentElement;
    if (!tip || !wrap) return;
    const position = () => {
      const box = wrap.getBoundingClientRect();
      const segment = anchor.getBoundingClientRect();
      const width = tip.getBoundingClientRect().width;
      const middle = segment.left - box.left + segment.width / 2;
      tip.style.left = `${Math.max(4, Math.min(box.width - width - 4, middle - width / 2))}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(wrap);
    observer.observe(tip);
    window.addEventListener('resize', position);
    return () => { observer.disconnect(); window.removeEventListener('resize', position); };
  }, [anchor, row.name, row.next, total]);
  return <div ref={ref} id={id} role="tooltip" className="pb-plan-pop pb-annual-allocation-pop">
    <div className="pb-plan-pop-title"><span className="pb-donut-dot" style={{ backgroundColor: row.color }} aria-hidden="true" /><span>{row.name}</span></div>
    <div className="font-mono-tab pb-plan-pop-figs pb-money">{formatCurrency(row.next)} · {share(row.next, total)}</div>
  </div>;
}

export function AnnualPlanCharts({ categories, current, proposed }: { categories: CategoryItem[]; current: Record<string, number>; proposed: Record<string, number> }) {
  const { d } = useTranslation();
  const x = d.ux.annualBudgets;
  const [active, setActive] = useState<{ id: string; element: HTMLElement } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const rows: ChartRow[] = categories.map(c => ({ id: c.id, name: categoryLabel(d, c.name), color: c.color, current: current[c.id] ?? 0, next: Number.isFinite(proposed[c.id]) ? Math.max(0, proposed[c.id]) : 0 }))
    .filter(c => c.current > 0 || c.next > 0).sort((a,b) => Math.max(b.current,b.next)-Math.max(a.current,a.next));
  const allocation = rows.filter(c => c.next > 0);
  // Resolve the current value by ID on every render: edits never leave an old amount in a popup.
  const activeRow = active?.element.isConnected ? allocation.find(c => c.id === active.id) : undefined;
  const activeId = activeRow?.id ?? null;
  const visible = rows.slice(0, 6);
  if (rows.length > 6) visible.push({ id: '__comparison_other__', name: x.otherCategories, color: 'var(--ink-soft)', current: rows.slice(6).reduce((s,c)=>s+c.current,0), next: rows.slice(6).reduce((s,c)=>s+c.next,0) });
  const total = rows.reduce((s,c)=>s+c.next,0);
  const max = Math.max(1,...visible.flatMap(c=>[c.current,c.next]));
  useLayoutEffect(() => {
    if (!activeId) return;
    const closeOutside = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setActive(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [activeId]);
  return <section className="card pb-annual-charts">
    <SectionHeader title={x.chartTitle} subtitle={x.chartNote} />
    <div className="pb-annual-chart-key"><span><i className="pb-annual-chart-old" />{x.chartCurrent}</span><span><i />{x.chartNext}</span></div>
    <div className="pb-chart-fade">
      <div ref={wrapRef} className={`pb-plan-barwrap pb-annual-allocation-wrap${activeRow ? ' has-active' : ''}`}>
        <div className="pb-bar-track pb-annual-allocation" role="group" aria-label={x.allocation}>
          {allocation.map((c,index) => {
            const show = (element: HTMLElement) => setActive({ id: c.id, element });
            return <button key={c.id} type="button" className={`pb-bar-seg pb-plan-seg${activeRow?.id === c.id ? ' active' : ''}`}
              style={{ flexGrow: c.next, backgroundColor: c.color }}
              aria-label={`${c.name}: ${formatCurrency(c.next)}, ${share(c.next,total)}`}
              aria-describedby={activeRow?.id === c.id ? tooltipId : undefined}
              onPointerEnter={e => { if (e.pointerType === 'mouse') show(e.currentTarget); }}
              onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null); }}
              onFocus={e => show(e.currentTarget)} onClick={e => show(e.currentTarget)}
              onBlur={() => setActive(null)}
              onKeyDown={e => {
                if (e.key === 'Escape') { e.preventDefault(); setActive(null); return; }
                const nextIndex = e.key === 'ArrowRight' ? (index + 1) % allocation.length : e.key === 'ArrowLeft' ? (index + allocation.length - 1) % allocation.length : e.key === 'Home' ? 0 : e.key === 'End' ? allocation.length - 1 : null;
                if (nextIndex !== null) { e.preventDefault(); e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[nextIndex]?.focus(); }
              }} />;
          })}
        </div>
        {total > 0 && <div className="pb-bud-ribbon-labels pb-annual-allocation-labels" aria-hidden="true">
          {allocation.map(c => <AllocationLabel key={c.id} row={c} total={total} />)}
        </div>}
        {activeRow && active && <AllocationTip key={activeRow.id} row={activeRow} total={total} anchor={active.element} id={tooltipId} />}
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
