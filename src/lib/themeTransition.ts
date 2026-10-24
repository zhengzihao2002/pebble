/**
 * Runs a light/dark or palette change as a cross-fade of two snapshots.
 *
 * WHY: every colour in Pebble is an inherited, registered custom property on
 * .pebble-root (--paper, --ink, --pine ...). Fading them with a CSS
 * transition means the browser restyles EVERY element on EVERY frame of the
 * 300ms fade (about 2000 elements on the dashboard, 2500 on Transactions;
 * measured ~35ms a frame on a desktop and ~150ms a frame at 4x CPU slowdown),
 * and re-rasterises the frosted header and phone bar each time. That is the
 * lag of a theme switch: 5-9 slow frames instead of 18 smooth ones.
 *
 * A view transition does the same job for the price of ONE restyle: the
 * browser freezes a picture of the old page, the new colours are applied once
 * (token transitions held off by the existing no-theme-transition class), and
 * the compositor fades between the two pictures without touching the page.
 * Still a fade, never a flash, and it covers anything a CSS transition could
 * not reach (gradients, SVG charts, shadows).
 *
 * Where the API is missing (older Firefox/Safari) or the person asked for
 * reduced motion, the change is applied directly and the registered-token
 * fade in globals.css does the work as before.
 */

/**
 * Length of the cross-fade. Shorter than the 300ms token fade used where view
 * transitions are missing: the fade now costs nothing per frame, so there is no
 * reason to stretch it, and a quick ease-out reads as "crisp" (most of the
 * change lands in the first 80ms). Keep in step with globals.css
 * (html.pb-theme-vt ::view-transition-*).
 */
export const THEME_FADE_MS = 200;

let running = false;
// The no-theme-transition hold THIS module put up (as opposed to the load-time
// freeze from the pre-paint script) and the timer that lifts it.
let holding = false;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;
// Changes asked for before the browser has taken its "old" picture. The
// update callback runs after that picture, so every change requested in the
// same moment (AppShell and HtmlPreferenceSync both react to one toggle) has to
// wait for it, or the first one applied directly would be in the "old" picture
// and nothing would fade.
let pending: Array<() => void> | null = null;

/** True between asking for a change and the browser applying it. */
export function themeChangePending(): boolean {
  return pending !== null;
}

export function runThemeChange(apply: () => void): void {
  if (pending) {
    pending.push(apply);
    return;
  }
  const root = document.documentElement;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<unknown> } };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // no-theme-transition is also the load-time freeze (set by the pre-paint
  // script, released a frame after mount): a change while it is up is the
  // involuntary correction at startup, which must not animate at all.
  const loadFreeze = root.classList.contains('no-theme-transition') && !holding;
  if (typeof doc.startViewTransition !== 'function' || reduced || running || document.hidden || loadFreeze) {
    apply();
    return;
  }
  running = true;
  // A change right after the last one finished: its release is still queued.
  clearTimeout(releaseTimer);
  pending = [apply];
  // Only the marker for the ::view-transition rules goes up now. Holding the
  // colour transitions off is done INSIDE the update callback, in the same
  // restyle as the new colours: the class matches every element, so putting
  // it up earlier would cost a second whole-tree restyle before the old
  // picture is even taken.
  root.classList.add('pb-theme-vt');
  const flush = () => {
    const batch = pending ?? [];
    pending = null;
    for (const run of batch) run();
  };
  let transition: { finished: Promise<unknown> };
  try {
    transition = doc.startViewTransition(() => {
      // The new colours must not animate underneath the cross-fade: that would
      // bring the per-frame restyle straight back.
      holding = true;
      root.classList.add('no-theme-transition');
      flush();
    });
  } catch {
    root.classList.remove('pb-theme-vt');
    running = false;
    clearTimeout(releaseTimer);
    flush();
    return;
  }
  const done = () => {
    running = false;
    root.classList.remove('pb-theme-vt');
    // Lifting the hold restyles every element once. Do it after the fade has
    // settled, outside the frame that reveals the live page.
    releaseTimer = setTimeout(() => requestAnimationFrame(() => {
      holding = false;
      root.classList.remove('no-theme-transition');
    }), 100);
  };
  transition.finished.then(done, done);
}
