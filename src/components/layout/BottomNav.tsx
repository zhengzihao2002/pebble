'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRightLeft, MoreHorizontal, Plus, X } from 'lucide-react';
import { primaryNavItems, secondaryNavItems, isNavItemActive, type NavItem } from './navItems';
import { pageAction, type PageActionKind } from './pageActions';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface BottomNavProps {
  onAddTransactionClick: () => void;
  onTransferClick: () => void;
  onAddGoalClick: () => void;
  onAddScheduleClick: () => void;
}

/**
 * Three fixed destinations, the centre add button, and "More", which expands
 * the bar upward.
 *
 * NOTHING SCROLLS HERE, deliberately. The bar previously held all eight items
 * with overflow-x: auto, and reaching the later ones meant swiping
 * horizontally along the bottom edge of the screen - the same gesture iOS uses
 * to switch apps. Users were ejected from Pebble mid-navigation.
 *
 * The extra items live INSIDE this element rather than in a portalled sheet:
 * the bar is already fixed to the bottom, so adding height grows it upward,
 * and one element changing shape reads better than a panel sliding over it.
 * The add button's menu is different: it slides up from beneath the bar's top
 * edge and back down behind it, rather than growing in place.
 *
 * THE ADD BUTTON is the header's add button, moved to where a thumb reaches
 * it: the header hides its own on phones (.header-actions). Its menu offers
 * the page's own action first when it has one (Modify budget, Add goal, Add
 * schedule), then Add transaction and Transfer on every page.
 */
export function BottomNav({ onAddTransactionClick, onTransferClick, onAddGoalClick, onAddScheduleClick }: BottomNavProps) {
  const pathname = usePathname();
  const { d } = useTranslation();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Navigating must collapse both - the destination is a Link away and
  // leaving either expanded would cover the page the user just chose.
  useEffect(() => { setOpen(false); setAddOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open && !addOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setAddOpen(false); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, addOpen]);

  // Lit when the current page lives behind More, so the user is never left
  // with no indication of where they are.
  const inSecondary = secondaryNavItems.some((i) => isNavItemActive(pathname, i.href));

  const own = pageAction(pathname);
  const actionLabel: Record<PageActionKind, string> = {
    addTransaction: d.header.addTransaction,
    addGoal: d.common.addGoal,
    addSchedule: d.header.addSchedule,
  };
  const run: Record<PageActionKind | 'transfer', () => void> = {
    addTransaction: onAddTransactionClick,
    addGoal: onAddGoalClick,
    addSchedule: onAddScheduleClick,
    transfer: onTransferClick,
  };
  const actions: { kind: PageActionKind | 'transfer'; label: string }[] = [
    ...(own && own !== 'addTransaction' ? [{ kind: own, label: actionLabel[own] }] : []),
    { kind: 'addTransaction', label: d.header.addTransaction },
    { kind: 'transfer', label: d.transfer.title },
  ];

  const renderLink = (item: NavItem) => {
    const active = isNavItemActive(pathname, item.href);
    return (
      <Link
        key={item.href} href={item.href} prefetch={false}
        className={`bottom-nav-btn ${active ? 'active' : ''}`}
        style={{ textDecoration: 'none' }}
      >
        <item.icon size={20} className={`bottom-nav-icon ${active ? 'active' : ''}`} />
        <span className="bottom-nav-label" style={{ fontSize: active ? '0.7rem' : '0.63rem' }}>{d.nav[item.labelKey]}</span>
      </Link>
    );
  };

  return (
    <>
      {/* Dims the page and gives tap-away a target. Kept mounted so it can
          fade rather than blink out; pointerEvents follows the open state so
          it never swallows taps while invisible. */}
      <div
        onClick={() => { setOpen(false); setAddOpen(false); }}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 19,
          backgroundColor: 'rgba(15,20,18,0.4)',
          opacity: open || addOpen ? 1 : 0,
          pointerEvents: open || addOpen ? 'auto' : 'none',
          transition: 'opacity 0.28s ease',
        }}
      />

      <nav className="pebble-bottom-nav" style={{ position: 'fixed' }}>
        {primaryNavItems.slice(0, 2).map(renderLink)}

        {/* The centre cell. Same equal width as every other cell; the button
            rises above the bar so it reads as its own thing. */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
          {/* Clipped at the bar's top edge; the panel slides up from beneath it
              and back down behind it (.pebble-add-menu in globals.css). */}
          <div className={`pebble-add-menu ${addOpen ? 'open' : ''}`}>
            <div className="pebble-bottom-nav-stack-panel" style={{ marginBottom: '1.9rem', minWidth: 200 }}>
              {actions.map((a, i) => (
                <button
                  key={a.kind} type="button"
                  onClick={() => { setAddOpen(false); run[a.kind](); }}
                  // Not keyboard-reachable while collapsed, like the More items.
                  tabIndex={addOpen ? 0 : -1}
                  className={i === 0 ? 'btn-primary' : 'pill'}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-start', gap: 6, padding: '0.6rem 0.85rem', whiteSpace: 'nowrap' }}
                >
                  {a.kind === 'transfer' ? <ArrowRightLeft size={15} /> : <Plus size={16} />} {a.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => { setOpen(false); setAddOpen((v) => !v); }}
            aria-expanded={addOpen}
            aria-label={addOpen ? d.common.close : d.header.addTransaction}
            className="bottom-nav-add"
          >
            <Plus size={24} strokeWidth={2.25} />
          </button>
        </div>

        {primaryNavItems.slice(2).map(renderLink)}

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
                      key={item.href} href={item.href} prefetch={false}
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
            onClick={() => { setAddOpen(false); setOpen((v) => !v); }}
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
