'use client';

import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChartNoAxesCombined, Lightbulb } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

/** A collapsible tab strip with one measured, animated panel and lazy chart mounting. */
export function CategoryPlanDetails({ name, history, suggested }: { name: string; history: ReactNode; suggested: ReactNode | null }) {
  const { d } = useTranslation();
  const x = d.ux.annualBudgets;
  const id = useId();
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [visited, setVisited] = useState<number[]>([]);
  const [height, setHeight] = useState(0);
  const content = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const tabs = [
    { label: x.history, icon: ChartNoAxesCombined, content: history },
    ...(suggested ? [{ label: x.categorySuggested, icon: Lightbulb, content: suggested }] : []),
  ];
  useLayoutEffect(() => {
    const node = content.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setHeight(node.getBoundingClientRect().height));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const select = (index: number, toggle = false) => {
    setActive(index);
    setOpen(previous => toggle && active === index ? !previous : true);
    setVisited(previous => previous.includes(index) ? previous : [...previous, index]);
  };
  return <div className="pb-category-details" data-open={open}>
    <div ref={strip} className="pb-category-detail-tabs" role="tablist" aria-label={`${name}: ${x.history} / ${x.categorySuggested}`}
      data-open={open} style={{ '--detail-count': tabs.length, '--detail-active': active } as CSSProperties}>
      {tabs.map((tab, index) => <button key={index} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`}
        aria-selected={open && active === index} aria-expanded={open && active === index} tabIndex={(open ? active === index : index === 0) ? 0 : -1}
        onClick={() => select(index, true)} onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
          if (next !== null) { event.preventDefault(); select(next); strip.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus(); }
        }}><tab.icon size={15} aria-hidden="true" /><span>{tab.label}</span></button>)}
    </div>
    <div className="pb-category-detail-window" style={{ height: open ? height : 0 }} inert={!open} aria-hidden={!open}>
      <div ref={content}>
        {tabs.map((tab, index) => <div key={index} id={`${id}-panel-${index}`} className="pb-category-detail-panel" role="tabpanel"
          aria-labelledby={`${id}-tab-${index}`} hidden={active !== index} tabIndex={0}>{visited.includes(index) ? tab.content : null}</div>)}
      </div>
    </div>
  </div>;
}
