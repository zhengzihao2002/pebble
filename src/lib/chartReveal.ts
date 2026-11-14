const CHARTS = '.pb-chart-fade, .pb-chart-fill, [data-pb-chart-load], .pb-goals-tl-plot, .pb-ins-year-inner, .pb-ins-cal-grid, .pb-sched-month-grid, .pb-plan-barwrap, .pb-ana-meter, .pb-ana-split, .pb-txn-mix-strip';
const EXCLUDED = '.pb-layout-skeleton-host, .pb-navigation-preview, .pb-cached-layout, [data-slot="skeleton"], [aria-busy="true"]';
interface Entry { hold: Animation | null; animation: Animation | null; opacity: number }

/** One chart entry per actual page visit, including charts mounted by later
 * client data or first shown in a section. Resize and hover never replay it. */
export function createPageChartReveal(content: HTMLElement) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scroll = content.closest<HTMLElement>('.pebble-root');
  const main = content.closest<HTMLElement>('.pebble-main');
  const seen = new WeakSet<Element>();
  const pending = new Set<HTMLElement>();
  const entries = new Map<HTMLElement, Entry>();
  const intersecting = new Set<Element>();
  let active = false, disposed = false, frame = 0, order = 0;
  const finishEntry = (element: HTMLElement) => {
    const entry = entries.get(element);
    if (!entry) return;
    for (const animation of [entry.hold, entry.animation]) {
      if (animation) { animation.onfinish = null; animation.cancel(); }
    }
    entries.delete(element);
  };
  const visible = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  function start(element: HTMLElement) {
    const entry = entries.get(element);
    if (!entry || seen.has(element)) return;
    seen.add(element); pending.delete(element); intersections?.unobserve(element); intersecting.delete(element);
    entry.hold?.cancel(); entry.hold = null;
    // Individual translate preserves a ring/plot's existing transform. Avoid
    // introducing a containing block around HTML tooltips or sticky controls.
    const settle = element.namespaceURI === 'http://www.w3.org/2000/svg' && getComputedStyle(element).translate === 'none';
    const animation = element.animate([
      { opacity: 0, ...(settle ? { translate: '0 4px' } : {}) },
      { opacity: entry.opacity, ...(settle ? { translate: '0 0' } : {}) },
    ], { duration: 460, delay: Math.min(order++, 4) * 35, easing: 'cubic-bezier(.22,.78,.22,1)', fill: 'both' });
    animation.id = 'pb-chart-page-entry'; entry.animation = animation;
    animation.onfinish = () => finishEntry(element);
  }
  function inspect() {
    frame = 0;
    if (disposed || !active || document.hidden || content.hidden || content.closest('[hidden]') || main?.hasAttribute('data-pb-sidebar-phase')) return;
    for (const element of pending) {
      if (!element.isConnected) { finishEntry(element); pending.delete(element); intersections?.unobserve(element); continue; }
      if (element.closest(EXCLUDED) || element.closest('[hidden]') || !visible(element)) continue;
      if (!intersections || intersecting.has(element)) start(element);
    }
  }
  const queue = () => { if (!disposed && !frame) frame = requestAnimationFrame(inspect); };
  const intersections = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(records => {
    for (const record of records) {
      if (record.isIntersecting) intersecting.add(record.target); else intersecting.delete(record.target);
    }
    queue();
  }, { root: scroll, threshold: .01 });
  function prepare(element: HTMLElement) {
    const ancestor = element.parentElement?.closest(CHARTS);
    if (seen.has(element) || pending.has(element) || element.closest(EXCLUDED) || (ancestor && content.contains(ancestor))) return;
    if (reduced.matches || typeof element.animate !== 'function') { seen.add(element); return; }
    // The old generic CSS fade often elapsed behind a skeleton. Complete it
    // while preparing this replacement so the final opacity remains natural.
    for (const animation of element.getAnimations()) {
      if ('animationName' in animation && ['pb-chart-in', 'pb-fade-in'].includes(String(animation.animationName))) {
        try { animation.finish(); } catch { /* Preserve unsupported animation types. */ }
      }
    }
    const opacity = Number(getComputedStyle(element).opacity);
    const hold = element.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'both' });
    hold.id = 'pb-chart-page-hold'; hold.pause();
    entries.set(element, { hold, animation: null, opacity }); pending.add(element); intersections?.observe(element);
  }
  function discover(node: Node) {
    if (!(node instanceof Element)) return;
    if (node.matches(CHARTS)) prepare(node as HTMLElement);
    node.querySelectorAll<HTMLElement>(CHARTS).forEach(prepare);
  }
  const changes = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') record.addedNodes.forEach(discover);
      else if (record.target instanceof Element && content.contains(record.target)) discover(record.target);
    }
    queue();
  });
  changes.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-busy'] });
  if (main) changes.observe(main, { attributes: true, attributeFilter: ['data-pb-sidebar-phase'] });
  const onMotion = () => {
    if (!reduced.matches) return;
    for (const element of entries.keys()) { seen.add(element); finishEntry(element); }
    pending.clear(); intersections?.disconnect(); intersecting.clear();
  };
  const onVisibility = () => {
    if (document.hidden) {
      for (const [element, entry] of entries) if (entry.animation) finishEntry(element);
    } else queue();
  };
  reduced.addEventListener('change', onMotion);
  document.addEventListener('visibilitychange', onVisibility);
  discover(content);
  return {
    reveal() { if (disposed) return; active = true; order = 0; queue(); },
    pause() { active = false; },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); changes.disconnect(); intersections?.disconnect();
      for (const element of entries.keys()) finishEntry(element);
      pending.clear(); intersecting.clear();
      reduced.removeEventListener('change', onMotion); document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
