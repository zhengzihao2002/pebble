'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TIME_ZONE_COOKIE, resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { HTML_LANG, LOCALE_COOKIE } from '@/lib/i18n';
import { usePebbleStore, switchPebbleUser } from '@/store/usePebbleStore';
import { useResolvedDark } from '@/lib/useResolvedDark';
import { authClient } from '@/lib/auth/client';
import { CJK_FONT_ATTRIBUTE, FONT_ATTRIBUTE, isCjkFontChoice, isFontChoice } from '@/lib/fontChoice';
import { LEGACY_STORAGE_KEY, WELCOME_PENDING_KEY } from '@/store/storageKeys';
import { THEME_ATTRIBUTE, isThemeChoice } from '@/lib/themeChoice';
import { playEventSound } from '@/lib/sound/useSound';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { Header } from './Header';
import { AddTransactionModal } from '@/components/modals/AddTransactionModal';
import { GoalModal } from '@/components/modals/GoalModal';
import { RecurringRuleModal } from '@/components/modals/RecurringRuleModal';
import { TransferModal } from '@/components/modals/TransferModal';
import { CommandPalette } from './CommandPalette';
import { UndoDeleteProvider } from '@/components/shared/UndoDelete';
import { TransactionDetailModal } from '@/components/modals/TransactionDetailModal';
import type { CategoryMeta, LedgerRecord } from '@/types';
import { WelcomeOverlay, WELCOME_PREVIEW_EVENT } from './WelcomeOverlay';

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  // Resolved: Light, Dark, or the device's setting when on System.
  const darkMode = useResolvedDark();
  const textSize = usePebbleStore((s) => s.textSize);
  const locale = usePebbleStore((s) => s.locale);
  const fontChoice = usePebbleStore((s) => s.fontChoice);
  const cjkFontChoice = usePebbleStore((s) => s.cjkFontChoice);
  const themeChoice = usePebbleStore((s) => s.themeChoice);
  const privacyOn = usePebbleStore((s) => s.privacyOn);
  // Text selection is off unless the user turned it on (exactly true only).
  const allowTextSelect = usePebbleStore((s) => s.allowTextSelect);
  useEffect(() => {
    rootRef.current?.classList.toggle('pb-no-select', allowTextSelect !== true);
  }, [allowTextSelect]);

  // Truncated text ("…") shows its full text in a tooltip on hover (desktop):
  // a styled tooltip, larger than the browser's, after a short pause. Elements
  // with their own title keep it; amounts are skipped in privacy mode so a
  // tooltip never reveals a figure. Hidden on mouse-out, scroll and resize.
  const [truncTip, setTruncTip] = useState<{ text: string; left: number; top: number; below: boolean } | null>(null);
  useEffect(() => {
    let timer = 0;
    let current: HTMLElement | null = null;
    // Pressing on text cancels its tooltip until the pointer leaves it, so a
    // click that opens a dialog never flashes one first.
    let suppressed: HTMLElement | null = null;
    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setTruncTip(null);
    };
    const onOver = (e: MouseEvent) => {
      let el: Element | null = e.target instanceof Element ? e.target : null;
      for (let depth = 0; el && depth < 4; depth += 1, el = el.parentElement) {
        if (!(el instanceof HTMLElement) || getComputedStyle(el).textOverflow !== 'ellipsis') continue;
        if (el === current || el === suppressed) return;
        const truncated = el.scrollWidth > el.clientWidth + 1;
        const hiddenAmount = el.closest('.pb-private') !== null
          && el.closest('.pb-money, .font-mono-tab, .hero-balance, .pb-hero-account-amount') !== null;
        if (!truncated || hiddenAmount || el.title) return;
        hide();
        current = el;
        const target = el;
        timer = window.setTimeout(() => {
          // Never over an open dialog.
          if (current !== target || !target.isConnected || document.querySelector('.pb-modal-overlay')) return;
          const r = target.getBoundingClientRect();
          const below = r.top < 64;
          setTruncTip({
            text: (target.textContent ?? '').replace(/\s+/g, ' ').trim(),
            left: Math.max(8, Math.min(r.left, window.innerWidth - 368)),
            top: below ? r.bottom + 8 : r.top - 8,
            below,
          });
        }, 350);
        return;
      }
    };
    const onOut = (e: MouseEvent) => {
      const into = e.relatedTarget;
      if (suppressed && !(into instanceof Node && suppressed.contains(into))) suppressed = null;
      if (!current) return;
      const to = e.relatedTarget;
      if (to instanceof Node && current.contains(to)) return;
      hide();
    };
    const onDown = () => {
      const pressed = current;
      hide();
      if (pressed) suppressed = pressed;
    };
    document.addEventListener('mouseover', onOver, { passive: true });
    document.addEventListener('mouseout', onOut, { passive: true });
    document.addEventListener('pointerdown', onDown, { capture: true, passive: true });
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      hide();
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, []);
  const pathname = usePathname();

  // Loads THIS user's saved preferences (per-user storage - see
  // switchPebbleUser). Until the session resolves, the most recent user's are
  // shown, which on a single-user device is the same person.
  const { data: sessionData } = authClient.useSession();
  const sessionUserId = sessionData?.user?.id;
  useEffect(() => {
    if (sessionUserId) void switchPebbleUser(sessionUserId);
  }, [sessionUserId]);
  const [showAddModal, setShowAddModal] = useState(false);
  // Mounted here rather than on the goals page because its trigger lives in
  // Header, which AppShell renders. This is also why every mutation calls
  // revalidatePath(route, 'layout') - a page-scoped revalidate would not reach
  // a modal that lives above the page.
  const [showAddGoalModal, setShowAddGoalModal] = useState(false);
  // Same reasoning as the goal modal: the trigger lives in Header, which
  // AppShell renders, so the modal has to be mounted here too.
  const [showAddScheduleModal, setShowAddScheduleModal] = useState(false);
  // Same reasoning as the modals above: the trigger lives in Header.
  const [showTransferModal, setShowTransferModal] = useState(false);
  // Command palette (⌘K / Ctrl+K, or /).
  const [showPalette, setShowPalette] = useState(false);
  // A transaction picked from the palette's search, shown in its detail dialog.
  const [paletteTxn, setPaletteTxn] = useState<{ txn: LedgerRecord; categoryMeta: CategoryMeta } | null>(null);

  // Welcome animation: armed by the auth pages (WelcomeArm), played once on
  // the first app page after signing in, then the flag is cleared. The
  // pre-paint cover (html.pebble-welcoming) hides the app until it starts.
  const [welcome, setWelcome] = useState(false);
  const closeWelcome = useCallback(() => setWelcome(false), []);
  useEffect(() => {
    let pending = false;
    try {
      pending = window.sessionStorage.getItem(WELCOME_PENDING_KEY) === '1';
      window.sessionStorage.removeItem(WELCOME_PENDING_KEY);
    } catch { /* storage unavailable */ }
    if (pending && usePebbleStore.getState().showWelcome !== false) setWelcome(true);
    else document.documentElement.classList.remove('pebble-welcoming');
  }, []);
  // Settings' Preview button.
  useEffect(() => {
    const preview = () => setWelcome(true);
    window.addEventListener(WELCOME_PREVIEW_EVENT, preview);
    return () => window.removeEventListener(WELCOME_PREVIEW_EVENT, preview);
  }, []);

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

  // .dark on the root div is set HERE, not in its className: the resolved
  // mode can differ between the server render (which cannot see the device)
  // and the first client render, and React does not patch attribute
  // mismatches - it would leave a stale class it believes is current. React
  // renders a fixed className, so it never strips this one. Until this runs,
  // html.pebble-dark from the pre-paint script covers the palette.
  useEffect(() => {
    rootRef.current?.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Mirrors the font choice onto <html>, as darkMode is above: the pre-paint
  // script sets it before first paint, this keeps it truthful after a change.
  // An unknown stored value falls back to the default font.
  useEffect(() => {
    const root = document.documentElement;
    if (isFontChoice(fontChoice) && fontChoice !== 'default') root.setAttribute(FONT_ATTRIBUTE, fontChoice);
    else root.removeAttribute(FONT_ATTRIBUTE);
  }, [fontChoice]);

  // Same for the Chinese face. Unknown stored values fall back to sans.
  useEffect(() => {
    const root = document.documentElement;
    if (isCjkFontChoice(cjkFontChoice) && cjkFontChoice !== 'sans') root.setAttribute(CJK_FONT_ATTRIBUTE, cjkFontChoice);
    else root.removeAttribute(CJK_FONT_ATTRIBUTE);
  }, [cjkFontChoice]);

  // Same for the colour theme. Unknown stored values fall back to Original.
  useEffect(() => {
    const root = document.documentElement;
    if (isThemeChoice(themeChoice) && themeChoice !== 'original') root.setAttribute(THEME_ATTRIBUTE, themeChoice);
    else root.removeAttribute(THEME_ATTRIBUTE);
  }, [themeChoice]);

  // Removes the pre-migration store (transactions and balances from before
  // the database existed). Nothing reads it; it only sat on disk. A no-op
  // once gone, so running on every load costs nothing.
  useEffect(() => {
    try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* storage unavailable */ }
  }, []);

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

  // Privacy mode. The launch setting applies once this user's preferences
  // have loaded; after that the header eye switches it for the session.
  useEffect(() => {
    const apply = () => {
      const s = usePebbleStore.getState();
      s.setPrivacyOn(s.privacyOnLaunch === true);
    };
    if (usePebbleStore.persist.hasHydrated()) apply();
    return usePebbleStore.persist.onFinishHydration(apply);
  }, []);

  // The class drives the blur in globals.css. Amounts revealed by a tap
  // are hidden again when the mode changes or the page does.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.classList.toggle('pb-private', privacyOn);
    root.querySelectorAll('.pb-revealed').forEach((el) => el.classList.remove('pb-revealed'));
  }, [privacyOn, pathname]);

  // Tapping a blurred amount reveals that amount only. Capture phase, and
  // the tap is consumed, so it does not also open the row it sits in.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reveal = (e: MouseEvent) => {
      if (!root.classList.contains('pb-private')) return;
      const target = e.target as HTMLElement | null;
      // Figures, and charts: a whole-chart blur first, otherwise any chart whose
      // axis text is blurred. A tap reveals that one figure or chart.
      const amount = (target?.closest?.('.font-mono-tab:not(input), .pb-money, .hero-balance, .pb-hero-account-amount')
        ?? target?.closest?.('.pb-chart-fill, .pb-donut-ring, .pb-chart-fade')
        ?? target?.closest?.('.recharts-wrapper')) as HTMLElement | null;
      if (!amount || amount.classList.contains('pb-revealed')) return;
      e.preventDefault();
      e.stopPropagation();
      amount.classList.add('pb-revealed');
    };
    root.addEventListener('click', reveal, true);
    return () => root.removeEventListener('click', reveal, true);
  }, []);

  // Phones: no pinch zoom inside the app (the owner's call; Settings >
  // Text size is the way to enlarge things). touch-action in globals.css
  // covers most browsers; iOS Safari ignores it for pinch, so its own
  // gesture events and any two-finger move are cancelled too. One-finger
  // scrolling is never touched.
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const twoFinger = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    document.addEventListener('gesturestart', stop, { passive: false });
    document.addEventListener('gesturechange', stop, { passive: false });
    document.addEventListener('touchmove', twoFinger, { passive: false });
    return () => {
      document.removeEventListener('gesturestart', stop);
      document.removeEventListener('gesturechange', stop);
      document.removeEventListener('touchmove', twoFinger);
    };
  }, []);

  // Command palette and single-key shortcuts. None fire while typing,
  // during IME composition, on key repeat, with a modifier held (except the
  // palette's own ⌘K / Ctrl+K), or while any dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229 || e.defaultPrevented || e.repeat) return;
      const root = rootRef.current;
      if (!root) return;
      const dialogOpen = root.querySelector('[role="dialog"]') !== null;
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && key === 'k') {
        if (dialogOpen) return;
        e.preventDefault();
        setShowPalette(true);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || dialogOpen) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"], [role="combobox"]'))) return;
      if (key === 'n' && !e.shiftKey) { e.preventDefault(); setShowAddModal(true); }
      else if (key === 't' && !e.shiftKey) { e.preventDefault(); setShowTransferModal(true); }
      else if (e.key === '/') {
        e.preventDefault();
        // On Transactions, / goes to the page's own search field.
        const search = document.getElementById('pb-txn-search');
        if (search instanceof HTMLInputElement) search.focus();
        else setShowPalette(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div ref={rootRef} className="pebble-root themed-scroll">
      {/* Blur used by privacy mode on chart axis text: CSS blur() does not
          apply inside SVG, a url() filter does. */}
      <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
        <filter id="pb-svg-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </svg>
      {truncTip && (
        <div
          className="pb-tip" role="tooltip"
          style={{ left: truncTip.left, top: truncTip.top, transform: truncTip.below ? undefined : 'translateY(-100%)' }}
        >
          {truncTip.text}
        </div>
      )}
      <UndoDeleteProvider>
      <div className="pebble-shell">
        <Sidebar />
        <div className="pebble-main-content">
          <Header
            onAddTransactionClick={() => setShowAddModal(true)}
            onAddGoalClick={() => setShowAddGoalModal(true)}
            onAddScheduleClick={() => setShowAddScheduleModal(true)}
            onTransferClick={() => setShowTransferModal(true)}
            onSearchClick={() => setShowPalette(true)}
          />
          <main className="pebble-main">{children}</main>
        </div>
        <BottomNav
          onAddTransactionClick={() => setShowAddModal(true)}
          onTransferClick={() => setShowTransferModal(true)}
          onAddGoalClick={() => setShowAddGoalModal(true)}
          onAddScheduleClick={() => setShowAddScheduleModal(true)}
        />
      </div>

      {showAddModal && <AddTransactionModal onClose={() => setShowAddModal(false)} />}
      {showAddGoalModal && <GoalModal onClose={() => setShowAddGoalModal(false)} />}
      {showAddScheduleModal && <RecurringRuleModal onClose={() => setShowAddScheduleModal(false)} />}
      {showTransferModal && <TransferModal onClose={() => setShowTransferModal(false)} />}
      {showPalette && (
        <CommandPalette
          onClose={() => setShowPalette(false)}
          onAddTransaction={() => setShowAddModal(true)}
          onTransfer={() => setShowTransferModal(true)}
          onAddGoal={() => setShowAddGoalModal(true)}
          onAddSchedule={() => setShowAddScheduleModal(true)}
          onOpenTransaction={(txn, categoryMeta) => setPaletteTxn({ txn, categoryMeta })}
        />
      )}
      {paletteTxn && (
        <TransactionDetailModal txn={paletteTxn.txn} categoryMeta={paletteTxn.categoryMeta} onClose={() => setPaletteTxn(null)} />
      )}
      {welcome && <WelcomeOverlay onDone={closeWelcome} />}
      </UndoDeleteProvider>
    </div>
  );
}
