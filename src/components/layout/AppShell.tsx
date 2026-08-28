'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { TIME_ZONE_COOKIE, resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { HTML_LANG, LOCALE_COOKIE } from '@/lib/i18n';
import { usePebbleStore } from '@/store/usePebbleStore';
import { playEventSound } from '@/lib/sound/useSound';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { Header } from './Header';
import { AddTransactionModal } from '@/components/modals/AddTransactionModal';
import { ModifyBudgetModal } from '@/components/modals/ModifyBudgetModal';
import { GoalModal } from '@/components/modals/GoalModal';
import { RecurringRuleModal } from '@/components/modals/RecurringRuleModal';

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const darkMode = usePebbleStore((s) => s.darkMode);
  const textSize = usePebbleStore((s) => s.textSize);
  const locale = usePebbleStore((s) => s.locale);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showModifyBudgetModal, setShowModifyBudgetModal] = useState(false);
  // Mounted here rather than on the goals page because its trigger lives in
  // Header, which AppShell renders. This is also why every mutation calls
  // revalidatePath(route, 'layout') - a page-scoped revalidate would not reach
  // a modal that lives above the page.
  const [showAddGoalModal, setShowAddGoalModal] = useState(false);
  // Same reasoning as the goal modal: the trigger lives in Header, which
  // AppShell renders, so the modal has to be mounted here too.
  const [showAddScheduleModal, setShowAddScheduleModal] = useState(false);

  // Same effect the original top-level App component had: text-size
  // setting scales the document's root font size, which every rem-based
  // measurement throughout Pebble is relative to.
  useEffect(() => {
    document.documentElement.style.fontSize = `${(textSize / 100) * 16}px`;
  }, [textSize]);

  // Mirrors darkMode onto <html> so the class the pre-paint script set stays
  // truthful after a toggle. .pebble-root also carries it (see globals.css) -
  // this keeps the two in step rather than replacing either.
  useEffect(() => {
    document.documentElement.classList.toggle('pebble-dark', darkMode);
  }, [darkMode]);

  // Tells the server what timezone the user is actually in.
  //
  // The server cannot work this out for itself: new Date() gives the container's
  // zone, which is UTC on Vercel, and IP geolocation is wrong for anyone
  // travelling or on a VPN. Only the browser knows, so the browser writes it.
  //
  // NOT __Secure- prefixed, deliberately: that prefix is exactly what makes the
  // Neon Auth cookies fail on http://localhost in Safari. A timezone is not a
  // credential - forging it only changes your own dates - and the server
  // validates the value before using it.
  //
  // On the very first load of a session the cookie does not exist yet, so
  // recurring catch-up skipped rather than guessing. One refresh, guarded by a
  // ref so it can never loop, re-runs that render with the zone known.
  const rootRef = useRef<HTMLDivElement>(null);
  const tzRef = useRef(false);
  useEffect(() => {
    if (tzRef.current) return;
    tzRef.current = true;

    const zone = resolveBrowserTimeZone();
    const existing = document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${TIME_ZONE_COOKIE}=`))
      ?.split('=')[1];

    if (existing === encodeURIComponent(zone)) return;

    document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(zone)}; Path=/; Max-Age=31536000; SameSite=Lax`;

    // Only when the zone was previously absent or stale - a correct cookie
    // needs no refresh, so the common case costs nothing.
    router.refresh();
  }, [router]);

  // Tells the server which language to render the one server-rendered page in
  // (goals), and keeps <html lang> truthful after a toggle - the pre-paint
  // script sets it before React exists, this maintains it afterwards.
  //
  // NOT guarded by a run-once ref, unlike the timezone effect above: a zone is
  // discovered once and never changes mid-session, whereas the language is a
  // control the user can flip at any moment. The equality check is what keeps
  // the common case free, and it cannot loop - router.refresh() re-renders
  // Server Components without remounting this client component or touching
  // the store, so the deps do not change and the effect does not re-run.
  useEffect(() => {
    document.documentElement.lang = HTML_LANG[locale];

    const existing = document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
      ?.split('=')[1];

    if (existing === locale) return;

    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    router.refresh();
  }, [locale, router]);

  // Click feedback, delegated from one listener rather than wired into every
  // button. Scoped to interactive elements: clicking blank space and hearing a
  // confirmation makes the sound meaningless.
  //
  // Capture phase, so a handler calling stopPropagation() (the modal cards do)
  // cannot suppress it. pointerdown rather than click, so it fires at press and
  // feels immediate. Bound to the root div, not document: everything lives
  // inside it, including SearchableSelect's dropdown, which portals into
  // .pebble-root - this same element.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const INTERACTIVE = 'button, a[href], select, summary, [role="button"], [role="option"], [role="tab"], input[type="checkbox"], input[type="radio"]';
    const handle = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest) return;
      const hit = target.closest(INTERACTIVE) as HTMLElement | null;
      if (!hit) return;
      // Disabled controls do nothing, so they should sound like nothing.
      if (hit.hasAttribute('disabled') || hit.getAttribute('aria-disabled') === 'true') return;
      // Controls that produce their own sound opt out, or pressing them
      // plays the click AND their own - the Settings preview buttons being
      // the case this exists for.
      if (hit.closest('[data-no-click-sound]')) return;
      playEventSound('click');
    };
    root.addEventListener('pointerdown', handle, true);
    return () => root.removeEventListener('pointerdown', handle, true);
  }, []);

  // Releases the transition freeze one frame after mount. Waiting for a frame
  // rather than clearing it immediately means any hydration-time class change
  // has already painted, so nothing left to animate is still pending.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      document.documentElement.classList.remove('no-theme-transition');
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div ref={rootRef} className={`pebble-root themed-scroll ${darkMode ? 'dark' : ''}`}>
      <div className="pebble-shell">
        <Sidebar />
        <div className="pebble-main-content">
          <Header
            onAddTransactionClick={() => setShowAddModal(true)}
            onModifyBudgetClick={() => setShowModifyBudgetModal(true)}
            onAddGoalClick={() => setShowAddGoalModal(true)}
            onAddScheduleClick={() => setShowAddScheduleModal(true)}
          />
          <main className="pebble-main">{children}</main>
        </div>
        <BottomNav />
      </div>

      {showAddModal && <AddTransactionModal onClose={() => setShowAddModal(false)} />}
      {showModifyBudgetModal && <ModifyBudgetModal onClose={() => setShowModifyBudgetModal(false)} />}
      {showAddGoalModal && <GoalModal onClose={() => setShowAddGoalModal(false)} />}
      {showAddScheduleModal && <RecurringRuleModal onClose={() => setShowAddScheduleModal(false)} />}
    </div>
  );
}
