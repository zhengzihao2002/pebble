'use client';

import { Link2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

/** Where each follower jumps to. The control element carries this id. */
const TARGETS = { dashboard: 'pb-period-control', accounts: 'pb-accounts-range' } as const;
type Control = keyof typeof TARGETS;
/** One pending clean-up per control, so repeat taps never cut a ring short. */
const pulseTimers = new WeakMap<HTMLElement, number>();

/** Marks a control that sets other cards. The same dot appears on their chips. */
export function PeriodDot() {
  return <span className="pb-period-dot" aria-hidden="true" />;
}

/**
 * A follower card's time label, shown as a quiet chip. Tapping it scrolls to
 * the control that sets it and pulses that control once, so the link is
 * learned by doing - no per-card selectors.
 */
export function PeriodLink({ label, control }: { label: string; control: Control }) {
  const { d, t } = useTranslation();
  const name = control === 'dashboard' ? d.dashboard.periodTitle : d.accountsPage.rangeLabel;
  const jump = () => {
    const el = document.getElementById(TARGETS[control]);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const r = el.getBoundingClientRect();
    const inView = r.top >= 0 && r.bottom <= window.innerHeight;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    // One pending timer per control (start delay or clean-up). Cancelling it
    // first means repeat taps restart the wave instead of cutting it short.
    window.clearTimeout(pulseTimers.get(el));
    const start = () => {
      el.classList.remove('pb-period-pulse');
      void el.offsetWidth; // restart the animation
      el.classList.add('pb-period-pulse');
      pulseTimers.set(el, window.setTimeout(() => el.classList.remove('pb-period-pulse'), 2000));
    };
    // Off screen: wait for the smooth scroll to settle so the whole wave is seen.
    if (inView || reduce) start();
    else pulseTimers.set(el, window.setTimeout(start, 420));
  };
  return (
    <button
      type="button" className="pb-period-chip" onClick={jump}
      aria-label={t(d.dashboard.periodLinkAria, { label, control: name })}
      title={t(d.dashboard.periodLinkTitle, { control: name })}
    >
      <PeriodDot />
      <span>{label}</span>
      <Link2 size={12} aria-hidden="true" />
    </button>
  );
}
