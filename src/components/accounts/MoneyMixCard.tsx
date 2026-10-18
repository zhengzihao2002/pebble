'use client';

import { useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, PieChart, Equal } from 'lucide-react';
import type { Account } from '@/lib/data/mappers';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { mouseOnly, useTapPopover } from './useTapPopover';

// Segment colours by rank, from theme tokens only (account colours are not
// user data here, so a fixed ramp keeps neighbours distinct in every palette).
const ASSET_RAMP = [
  'var(--pine)',
  'color-mix(in oklch, var(--pine) 55%, var(--gold))',
  'var(--gold)',
  'color-mix(in oklch, var(--pine) 55%, var(--ink))',
  'color-mix(in oklch, var(--gold) 50%, var(--ink-soft))',
  'var(--ink-soft)',
];
const OWED_RAMP = ['var(--wine)', 'color-mix(in oklch, var(--wine) 62%, var(--mist))', 'color-mix(in oklch, var(--wine) 60%, var(--ink))'];

interface Seg { id: string; name: string; last4: string | null; amount: number; color: string; sleeping: boolean; owed: boolean }

/**
 * Where the money sits today. The total nets card debt against bank
 * balances, so on its own it is less than the bank tiles add up to; this
 * card says why: Assets, Owed and Net (= the total), then one bar of the
 * assets by account and, at the same dollars per pixel, a wine bar of what
 * is owed - debt against assets at a glance.
 *
 * The legend's share column uses the tiles' rule (of the net total, the
 * same "{pct}% of total" an account's tile shows), so one account never
 * reads two different percentages on one screen; only the popover, which
 * says so in words, gives the share of assets. The bars wear
 * pb-chart-fade, so the proportions blur in privacy mode with the figures.
 * Hidden with one account, which would only repeat the total.
 */
export function MoneyMixCard({ items, total }: {
  /** Every shown account with its balance today. */
  items: { a: Account; now: number }[];
  total: number;
}) {
  const { d, t } = useTranslation();
  const x = d.ux.accounts;
  const [active, setActive] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const tapFor = useTapPopover(rootRef, active, setActive);
  if (items.length < 2) return null;

  const assetsList = items.filter((i) => i.now > 0.004).sort((p, q) => q.now - p.now);
  const owedList = items.filter((i) => i.now < -0.004).sort((p, q) => p.now - q.now);
  const assets = assetsList.reduce((s, i) => s + i.now, 0);
  const owed = owedList.reduce((s, i) => s - i.now, 0);
  // Nothing anywhere yet (no records): nothing to show where it sits.
  if (assetsList.length + owedList.length === 0) return null;
  const segs: Seg[] = [
    ...assetsList.map((i, k) => ({ id: i.a.id, name: i.a.name, last4: i.a.last4, amount: i.now, color: ASSET_RAMP[k % ASSET_RAMP.length], sleeping: i.a.status === 'hibernated', owed: false })),
    ...owedList.map((i, k) => ({ id: i.a.id, name: i.a.name, last4: i.a.last4, amount: -i.now, color: OWED_RAMP[k % OWED_RAMP.length], sleeping: i.a.status === 'hibernated', owed: true })),
  ];
  // Same dollars per pixel on both bars: the larger side fills the width.
  const scale = Math.max(assets, owed, 0.01);
  const pctOf = (v: number, of: number) => (of > 0 ? `${Math.round((v / of) * 100)}%` : '0%');
  // The tiles' "share of total" rule: Math.round(now / total * 100), shown
  // only when both are positive.
  const shareOfTotal = (v: number) => (total > 0 && v > 0 ? `${Math.round((v / total) * 100)}%` : '');
  const activeSeg = segs.find((s) => s.id === active) ?? null;
  // Centre of the active segment along its bar (same scale for both bars),
  // so the popover sits over the part it describes.
  const activeAt = (() => {
    if (!activeSeg) return 0;
    let before = 0;
    for (const s of segs) {
      if (s.owed !== activeSeg.owed) continue;
      if (s.id === activeSeg.id) break;
      before += s.amount;
    }
    return ((before + activeSeg.amount / 2) / scale) * 100;
  })();

  const bar = (list: Seg[], sum: number, owedBar: boolean) => (
    <div className={`pb-accounts-mix-bar${owedBar ? ' is-owed' : ''}`} style={{ width: `${(sum / scale) * 100}%` }}>
      {list.map((s) => (
        <span
          key={s.id}
          className={`pb-accounts-mix-seg${s.sleeping ? ' is-sleeping' : ''}${active && active !== s.id ? ' is-dim' : ''}`}
          style={{ flexGrow: s.amount, ['--pb-seg' as string]: s.color }}
          onPointerEnter={mouseOnly(() => setActive(s.id))}
          onPointerLeave={mouseOnly(() => setActive(null))}
          // Decorative (the legend buttons are the controls), so no click sound.
          data-no-click-sound
          {...tapFor(s.id)}
        />
      ))}
    </div>
  );

  return (
    <section ref={rootRef} className="card pb-accounts-mix pb-rise" style={{ ['--pb-i' as string]: 1 }} aria-labelledby="pb-accounts-mix-title">
      <SectionHeader id="pb-accounts-mix-title" icon={PieChart} title={x.mixTitle} subtitle={t(x.mixSub, { count: items.length })} />

      <dl className="pb-accounts-strip">
        <div>
          <dt><ArrowUpRight size={13} aria-hidden="true" className="is-in" />{x.assets}</dt>
          <dd className="font-mono-tab">{formatCurrency(assets)}</dd>
          <dd className="pb-accounts-strip-hint">{x.assetsHint}</dd>
        </div>
        <div>
          <dt><ArrowDownRight size={13} aria-hidden="true" className="is-out" />{x.owed}</dt>
          <dd className="font-mono-tab">{formatCurrency(owed)}</dd>
          <dd className="pb-accounts-strip-hint">{x.owedHint}</dd>
        </div>
        <div className="is-net">
          <dt><Equal size={13} aria-hidden="true" />{x.net}</dt>
          <dd className="font-mono-tab">{formatCurrency(total)}</dd>
          <dd className="pb-accounts-strip-hint">{x.netHint}</dd>
        </div>
      </dl>

      <div className="pb-accounts-mix-body">
        <div className="pb-accounts-mix-bars pb-chart-fade" aria-hidden="true">
          <div className="pb-accounts-mix-track">
            <span className="pb-accounts-mix-cap">{x.barAssets}</span>
            {assets > 0 ? bar(segs.filter((s) => !s.owed), assets, false) : <div className="pb-accounts-mix-bar is-empty" />}
          </div>
          {owed > 0 && (
            <div className="pb-accounts-mix-track">
              <span className="pb-accounts-mix-cap">{x.barOwed}</span>
              {bar(segs.filter((s) => s.owed), owed, true)}
            </div>
          )}
          {activeSeg && (
            <div className={`pb-accounts-pop pb-accounts-mix-pop${activeSeg.owed ? ' is-owed' : ''}`} style={{ left: `clamp(5.5rem, ${activeAt}%, calc(100% - 5.5rem))` }}>
              <span className="pb-accounts-pop-title">
                {activeSeg.name}
                {activeSeg.last4 && <span className="font-mono-tab pb-accounts-last4"> ····{activeSeg.last4}</span>}
              </span>
              <span className="font-mono-tab pb-accounts-pop-amount">{formatCurrency(activeSeg.owed ? -activeSeg.amount : activeSeg.amount)}</span>
              <span className="pb-accounts-pop-meta font-mono-tab">
                {activeSeg.owed ? t(x.segOwed, { pct: pctOf(activeSeg.amount, owed) }) : t(x.segShare, { pct: pctOf(activeSeg.amount, assets) })}
              </span>
            </div>
          )}
        </div>

        <ul className="pb-accounts-legend">
          {segs.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={`pb-accounts-legend-row${active === s.id ? ' is-active' : active ? ' is-dim' : ''}`}
                {...tapFor(s.id)}
                onPointerEnter={mouseOnly(() => setActive(s.id))} onPointerLeave={mouseOnly(() => setActive(null))}
                onFocus={() => setActive(s.id)} onBlur={() => setActive(null)}
              >
                <i className={`pb-accounts-legend-dot${s.sleeping ? ' is-sleeping' : ''}`} style={{ ['--pb-seg' as string]: s.color }} aria-hidden="true" />
                <span className="pb-accounts-legend-name">
                  {s.name}
                  {/* The last four are a figure: blurred in privacy mode. */}
                  {s.last4 && <span className="font-mono-tab pb-accounts-last4"> ····{s.last4}</span>}
                </span>
                <span className="font-mono-tab pb-accounts-legend-amt">{formatCurrency(s.owed ? -s.amount : s.amount)}</span>
                <span className="font-mono-tab pb-accounts-legend-pct">{s.owed ? '' : shareOfTotal(s.amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
