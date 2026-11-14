interface NumberEntry {
  element: HTMLElement;
  inView: boolean;
  started: boolean;
  path: string | null;
  token: number;
  onStart: () => void;
  onFinish: () => void;
  onReplay: () => void;
}

// One set of observers for all amounts, including long transaction lists.
// Completed entries stop observing the viewport but remain registered until
// unmount so a reused component can enter again on a different page.
const entries = new Map<HTMLElement, NumberEntry>();
let intersection: IntersectionObserver | null = null;
let mutations: MutationObserver | null = null;
let frame = 0;
let mounted = false;
const pathname = () => window.location.pathname;
const canStart = (entry: NumberEntry) => {
  if (document.hidden || entry.started || !entry.inView || !entry.element.isConnected) return false;
  if (!entry.element.hasAttribute('data-pb-roll-entry') || !entry.element.querySelector('.pb-rolling-cell')) return false;
  if (entry.element.closest('[data-pb-sidebar-phase]')) return false;
  const content = entry.element.closest<HTMLElement>('.pb-navigation-content');
  return !content || content.dataset.pbPageVisible === 'true';
};

function flush() {
  frame = 0;
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
      intersection?.unobserve(entry.element);
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
    if (entry.started && entry.path !== pathname()) {
      entry.token++; entry.started = false;
      entry.inView = !intersection;
      delete entry.element.dataset.pbRollVisible;
      entry.onReplay(); intersection?.observe(entry.element);
    }
  }
  queue();
}
function visible() { if (!document.hidden) queue(); }
function mount() {
  if (mounted) return;
  mounted = true;
  if (typeof IntersectionObserver !== 'undefined') {
    intersection = new IntersectionObserver(changes => {
      for (const change of changes) {
        const entry = entries.get(change.target as HTMLElement);
        if (entry) entry.inView = change.isIntersecting;
      }
      queue();
    }, { rootMargin: '0px 0px 40px 0px' });
  }
  if (typeof MutationObserver !== 'undefined') {
    mutations = new MutationObserver(queue);
    mutations.observe(document.documentElement, { subtree: true, attributes: true,
      attributeFilter: ['data-pb-sidebar-phase', 'data-pb-roll-entry'] });
  }
  window.addEventListener('pebble:page-visible', pageVisible);
  document.addEventListener('visibilitychange', visible);
}
function stop() {
  intersection?.disconnect(); intersection = null;
  mutations?.disconnect(); mutations = null;
  cancelAnimationFrame(frame); frame = 0; mounted = false;
  window.removeEventListener('pebble:page-visible', pageVisible);
  document.removeEventListener('visibilitychange', visible);
}

/** Registers first-visible entry only; regular value updates remain local to
 * RollingAmount and sidebar fade/reveal never restarts a completed amount. */
export function observeNumberEntry(element: HTMLElement, callbacks: Pick<NumberEntry, 'onStart' | 'onFinish' | 'onReplay'>) {
  mount();
  const entry: NumberEntry = { element, inView: !intersection, started: false, path: null, token: 0, ...callbacks };
  entries.set(element, entry); intersection?.observe(element); queue();
  return () => {
    if (entries.get(element) !== entry) return;
    entries.delete(element); intersection?.unobserve(element);
    if (!entries.size) stop();
  };
}

/** A placeholder may resolve after its viewport observation already fired. */
export function refreshNumberEntry(element: HTMLElement) {
  const entry = entries.get(element);
  if (entry && !entry.started) queue();
}
