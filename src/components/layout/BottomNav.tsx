'use client';

import { useEffect, useRef } from 'react';
import Link from '@/components/loading/PendingLink';
import { useNavigationPathname as usePathname } from '@/components/loading/navigation';
import { ArrowRightLeft, CalendarClock, MoreHorizontal, Plus, Receipt, Target, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { primaryNavItems, secondaryNavItems, isNavItemActive, type NavItem } from './navItems';
import { pageAction, type PageActionKind } from './pageActions';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useBottomNavPanels } from './useBottomNavPanels';
import { useBudgetPlanNavigation } from '@/components/budgets/BudgetPlanNavigation';
import { useNavGlass } from './useNavGlass';

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
  const { d, t } = useTranslation();
  const budgetPlanYear = useBudgetPlanNavigation();
  // The entry must exist even before the streamed budget page registers its
  // server-resolved year. Only its label depends on that registration.
  const showBudgetPlan = pathname === '/budgets' || pathname === '/budgets/plan';
  const budgetPlanLabel = budgetPlanYear === null ? d.ux.annualBudgets.openPlanner
    : t(d.ux.annualBudgets.planNextYear, { year: String(budgetPlanYear) });
  const addPanelRef = useRef<HTMLDivElement>(null);
  const morePanelRef = useRef<HTMLDivElement>(null);
  const { open, addOpen, engaged, toggle, close } = useBottomNavPanels(addPanelRef, morePanelRef);
  const { ref: navRef, indicatorRef } = useNavGlass<HTMLElement>(`${pathname}:${open}`, true);

  // Navigating must collapse both - the destination is a Link away and
  // leaving either expanded would cover the page the user just chose.
  useEffect(() => { close(); }, [pathname, close]);

  useEffect(() => {
    if (!engaged) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [engaged, close]);

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
  const actionIcon: Record<PageActionKind | 'transfer', LucideIcon> = {
    addTransaction: Receipt,
    addGoal: Target,
    addSchedule: CalendarClock,
    transfer: ArrowRightLeft,
  };
  const actions: { kind: PageActionKind | 'transfer'; label: string }[] = [
    ...(own && own !== 'addTransaction' ? [{ kind: own, label: actionLabel[own] }] : []),
    { kind: 'addTransaction', label: d.header.addTransaction },
    { kind: 'transfer', label: d.transfer.title },
  ];

  // While the More column is open, More is the one lit tab: lighting the
  // current page's tab as well showed two selected at once.
  const renderLink = (item: NavItem) => {
    const active = isNavItemActive(pathname, item.href) && !open;
    return (
      <Link
        key={item.href} href={item.href} prefetch={false}
        className={`bottom-nav-btn ${active ? 'active' : ''}`}
        aria-current={isNavItemActive(pathname, item.href) ? 'page' : undefined}
        data-pb-nav-link data-pb-nav-selected={active || undefined}
        style={{ textDecoration: 'none' }}
      >
        <item.icon size={20} className={`bottom-nav-icon ${active ? 'active' : ''}`} />
        <span className="bottom-nav-label">{d.nav[item.labelKey]}</span>
      </Link>
    );
  };

  return (
    <>
      {/* Dims the page and gives tap-away a target. Kept mounted so it can
          fade rather than blink out; pointerEvents follows the open state so
          it never swallows taps while invisible. */}
      <div
        onClick={close}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 19,
          backgroundColor: 'rgba(15,20,18,0.4)',
          opacity: engaged ? 1 : 0,
          pointerEvents: engaged ? 'auto' : 'none',
          transition: 'opacity 0.28s ease',
        }}
      />

      <nav ref={navRef} className="pebble-bottom-nav pb-nav-glass-host pb-nav-glass-bottom" style={{ position: 'fixed' }}>
        <span ref={indicatorRef} className="pb-nav-glass-indicator" aria-hidden="true" />
        {primaryNavItems.slice(0, 2).map(renderLink)}

        {/* The centre cell. Same equal width as every other cell; the button
            rises above the bar so it reads as its own thing. */}
        <div className="pb-nav-add-cell" style={{ display: 'flex', justifyContent: 'center' }}>
          {/* Clipped at the bar's top edge; the panel slides up from beneath it
              and back down behind it (.pebble-add-menu in globals.css). */}
          {/* An action sheet of icon tiles: the page's own action first (pine,
              the one this page is for), then Add transaction and Transfer.
              Same clip window and slide as before; only the panel's contents
              changed. */}
          <div className={`pebble-add-menu pb-shell-sheet-clip ${addOpen ? 'open' : ''}`}>
            <div ref={addPanelRef} className="pebble-bottom-nav-stack-panel pb-shell-sheet">
              <p className="pb-shell-sheet-title" aria-hidden="true">{d.ux.shell.addTitle}</p>
              <div className="pb-shell-sheet-grid" data-count={actions.length + (showBudgetPlan ? 1 : 0)}>
                {showBudgetPlan && <Link href="/budgets/plan" prefetch={false} onClick={close} tabIndex={addOpen ? 0 : -1} className="pb-shell-tile pb-shell-tile-primary" style={{textDecoration:'none'}}>
                  <span className="pb-shell-tile-icon" aria-hidden="true"><CalendarClock size={20} strokeWidth={2} /></span>
                  <span className="pb-shell-tile-label">{budgetPlanLabel}</span>
                </Link>}
                {actions.map((a, i) => {
                  const Icon = actionIcon[a.kind];
                  return (
                    <button
                      key={a.kind} type="button"
                      onClick={() => { close(); run[a.kind](); }}
                      // Not keyboard-reachable while collapsed, like the More items.
                      tabIndex={addOpen ? 0 : -1}
                      className={`pb-shell-tile${i === 0 && !showBudgetPlan ? ' pb-shell-tile-primary' : ''}`}
                    >
                      <span className="pb-shell-tile-icon" aria-hidden="true">
                        <Icon size={20} strokeWidth={2} />
                        {a.kind !== 'transfer' && <Plus size={11} strokeWidth={3} className="pb-shell-tile-plus" />}
                      </span>
                      <span className="pb-shell-tile-label">{a.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => toggle('add')}
            aria-expanded={addOpen}
            aria-label={addOpen ? d.common.close : d.header.addTransaction}
            className="bottom-nav-add"
          >
            <Plus size={24} strokeWidth={2.25} />
          </button>
        </div>

        {primaryNavItems.slice(2).map(renderLink)}

        {/* The cell stays unpositioned: both sheets anchor to the bar itself,
            giving their clipping windows the same edge. */}
        <div className="pb-nav-more-cell" style={{ display: 'flex' }}>
          {/* A two-column grid of icon tiles rather than one tall column:
              every page behind More is visible at once, in a sheet the width
              of the bar, centered above it. Still the same clip
              window sliding up from beneath the bar, still no horizontal
              scrolling, still not focusable while closed.

              While it is open More is the ONE lit tab. The current page's
              tile is marked quietly (a dot and aria-current) instead of with
              the bar's highlight tile, so two things never look selected. */}
          <div className={`pebble-bottom-nav-stack pb-shell-sheet-clip pb-shell-more-clip ${open ? 'open' : ''}`}>
            <div ref={morePanelRef} className="pebble-bottom-nav-stack-inner">
              <div className="pebble-bottom-nav-stack-panel pb-shell-sheet">
                <p className="pb-shell-sheet-title" aria-hidden="true">{d.ux.shell.moreTitle}</p>
                <div className="pb-shell-sheet-grid pb-shell-more-grid">
                  {secondaryNavItems.map((item) => {
                    const here = isNavItemActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href} href={item.href} prefetch={false}
                        className={`pb-shell-tile pb-shell-tile-row${here ? ' pb-shell-tile-here' : ''}`}
                        aria-current={here ? 'page' : undefined}
                        // Not keyboard-reachable while collapsed: the element
                        // stays mounted so it can animate, but it is not a
                        // control until it is visible.
                        tabIndex={open ? 0 : -1}
                        style={{ textDecoration: 'none' }}
                      >
                        <span className="pb-shell-tile-icon" aria-hidden="true"><item.icon size={19} strokeWidth={2} /></span>
                        <span className="pb-shell-tile-label">{d.nav[item.labelKey]}</span>
                        {here && <span className="pb-shell-tile-dot" aria-hidden="true" />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => toggle('more')}
            aria-expanded={open}
            aria-label={open ? d.common.close : d.nav.more}
            className={`bottom-nav-btn ${open || inSecondary ? 'active' : ''}`}
            data-pb-nav-link data-pb-nav-selected={(open || inSecondary) || undefined}
            style={{ background: 'none', border: 'none', flex: 1, minWidth: 0 }}
          >
            {open
              ? <X size={20} className="bottom-nav-icon active" />
              : <MoreHorizontal size={20} className={`bottom-nav-icon ${inSecondary ? 'active' : ''}`} />}
            <span className="bottom-nav-label">{d.nav.more}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
