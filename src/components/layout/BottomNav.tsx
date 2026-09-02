'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal, X } from 'lucide-react';
import { primaryNavItems, secondaryNavItems, isNavItemActive } from './navItems';
import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * Four fixed destinations plus "More", which expands the bar upward.
 *
 * NOTHING SCROLLS HERE, deliberately. The bar previously held all eight items
 * with overflow-x: auto, and reaching the later ones meant swiping
 * horizontally along the bottom edge of the screen - the same gesture iOS uses
 * to switch apps. Users were ejected from Pebble mid-navigation.
 *
 * The extra items live INSIDE this element rather than in a portalled sheet:
 * the bar is already fixed to the bottom, so adding height grows it upward,
 * and one element changing shape reads better than a panel sliding over it.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { d } = useTranslation();
  const [open, setOpen] = useState(false);

  // Navigating must collapse it - the destination is a Link away and leaving
  // the bar expanded would cover the page the user just chose.
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Lit when the current page lives behind More, so the user is never left
  // with no indication of where they are.
  const inSecondary = secondaryNavItems.some((i) => isNavItemActive(pathname, i.href));

  return (
    <>
      {/* Dims the page and gives tap-away a target. Kept mounted so it can
          fade rather than blink out; pointerEvents follows `open` so it never
          swallows taps while invisible. */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 19,
          backgroundColor: 'rgba(15,20,18,0.4)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.28s ease',
        }}
      />

      <nav className="pebble-bottom-nav" style={{ position: 'fixed' }}>
        {primaryNavItems.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          return (
            <Link
              key={item.href} href={item.href}
              className={`bottom-nav-btn ${active ? 'active' : ''}`}
              style={{ textDecoration: 'none' }}
            >
              <item.icon size={20} className={`bottom-nav-icon ${active ? 'active' : ''}`} />
              <span className="bottom-nav-label" style={{ fontSize: active ? '0.7rem' : '0.63rem' }}>{d.nav[item.labelKey]}</span>
            </Link>
          );
        })}

        {/* Wrapper is position: relative so the stack anchors to THIS cell
            rather than the whole bar - that is what puts the column directly
            above More. */}
        <div style={{ position: 'relative', display: 'flex' }}>
          <div className={`pebble-bottom-nav-stack ${open ? 'open' : ''}`} style={{ left: 0, right: 0 }}>
            <div className="pebble-bottom-nav-stack-inner">
              <div className="pebble-bottom-nav-stack-panel">
                {secondaryNavItems.map((item) => {
                  const active = isNavItemActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href} href={item.href}
                      className={`bottom-nav-btn ${active ? 'active' : ''}`}
                      // Not keyboard-reachable while collapsed: the element
                      // stays mounted so it can animate, but it is not a
                      // control until it is visible.
                      tabIndex={open ? 0 : -1}
                      style={{ textDecoration: 'none' }}
                    >
                      <item.icon size={20} className={`bottom-nav-icon ${active ? 'active' : ''}`} />
                      <span className="bottom-nav-label" style={{ fontSize: active ? '0.7rem' : '0.63rem' }}>{d.nav[item.labelKey]}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? d.common.close : d.nav.more}
            className={`bottom-nav-btn ${open || inSecondary ? 'active' : ''}`}
            style={{ background: 'none', border: 'none', flex: 1, minWidth: 0 }}
          >
            {open
              ? <X size={20} className="bottom-nav-icon active" />
              : <MoreHorizontal size={20} className={`bottom-nav-icon ${inSecondary ? 'active' : ''}`} />}
            <span className="bottom-nav-label" style={{ fontSize: open || inSecondary ? '0.7rem' : '0.63rem' }}>{d.nav.more}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
