interface NumberEntry {
  element: HTMLElement;
  started: boolean;
  path: string | null;
  token: number;
  onStart: () => void;
  onFinish: () => void;
  onReplay: () => void;
}

// A single page handoff starts every mounted amount, including offscreen cards.
// Late-mounted sections settle immediately instead of rolling during scrolling.
const entries = new Map<HTMLElement, NumberEntry>();
const landed = new WeakMap<HTMLElement, string>();
let mutations: MutationObserver | null = null;
let frame = 0;
let mounted = false;
const pathname = () => window.location.pathname;
const canStart = (entry: NumberEntry) => {
  if (document.hidden || entry.started || !entry.element.isConnected) return false;
  if (!entry.element.hasAttribute('data-pb-roll-entry') || !entry.element.querySelector('.pb-rolling-cell')) return false;
  if (entry.element.closest('[data-pb-sidebar-phase]')) return false;
  const content = entry.element.closest<HTMLElement>('.pb-navigation-content');
  return !content || content.dataset.pbPageVisible === 'true';
};

function flush() {
  cancelAnimationFrame(frame); frame = 0;
  const starting = [...entries.values()].filter(canStart);
  // Batch DOM writes before asking for CSS animations, avoiding one style
  // flush per digit/amount on a populated dashboard.
  for (const entry of starting) {
    entry.started = true; entry.path = pathname();
    entry.element.dataset.pbRollVisible = 'true';
  }
  const waiting = starting.map(entry => ({ entry, token: entry.token,
    animations: typeof entry.element.getAnimations === 'function'
      ? entry.element.getAnimations({ subtree: true }).filter(animation =>
        'animationName' in animation && String(animation.animationName).startsWith('pb-money-')) : [],
  }));
  for (const { entry, token, animations } of waiting) {
    entry.onStart();
    void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (entries.get(entry.element) !== entry || entry.token !== token) return;
      entry.onFinish();
    });
  }
}
function queue() { if (!frame && !document.hidden) frame = requestAnimationFrame(flush); }
function pageVisible(event: Event) {
  const content = (event as CustomEvent<{ content?: HTMLElement }>).detail?.content;
  if (!content) return;
  for (const entry of entries.values()) {
    if (!content.contains(entry.element)) continue;
    if (!entry.started && !entry.element.querySelector('.pb-rolling-cell')) {
      entry.started = true; entry.path = pathname(); entry.onFinish();
      continue;
    }
    if (entry.started && entry.path !== pathname()) {
      entry.token++; entry.started = false;
      delete entry.element.dataset.pbRollVisible;
      entry.onReplay();
    }
  }
  landed.set(content, pathname());
  flush();
}
function visible() { if (!document.hidden) queue(); }
function mount() {
  if (mounted) return;
  mounted = true;
  if (typeof MutationObserver !== 'undefined') {
    mutations = new MutationObserver(queue);
    mutations.observe(document.documentElement, { subtree: true, attributes: true,
      attributeFilter: ['data-pb-sidebar-phase', 'data-pb-roll-entry'] });
  }
  window.addEventListener('pebble:page-visible', pageVisible);
  document.addEventListener('visibilitychange', visible);
}
function stop() {
  mutations?.disconnect(); mutations = null;
  cancelAnimationFrame(frame); frame = 0; mounted = false;
  window.removeEventListener('pebble:page-visible', pageVisible);
  document.removeEventListener('visibilitychange', visible);
}

/** Registers page entry only; regular value updates remain local to
 * RollingAmount and sidebar fade/reveal never restarts a completed amount. */
export function observeNumberEntry(element: HTMLElement, callbacks: Pick<NumberEntry, 'onStart' | 'onFinish' | 'onReplay'>) {
  mount();
  const entry: NumberEntry = { element, started: false, path: null, token: 0, ...callbacks };
  entries.set(element, entry);
  const content = element.closest<HTMLElement>('.pb-navigation-content');
  // Amounts mounted later by lazy sections must arrive already settled.
  if (content && (landed.get(content) === pathname() || content.dataset.pbPageVisible === 'true')) {
    entry.started = true; entry.path = pathname(); entry.onFinish();
  } else queue();
  return () => {
    if (entries.get(element) !== entry) return;
    entries.delete(element);
    if (!entries.size) stop();
  };
}

/** A placeholder may resolve during the page handoff. */
export function refreshNumberEntry(element: HTMLElement) {
  const entry = entries.get(element);
  if (entry && !entry.started) queue();
}
