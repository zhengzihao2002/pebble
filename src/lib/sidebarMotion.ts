const CARDS = '.card, [data-slot="card"], .pb-hero, .pb-accounts-tile, .pb-accounts-cc, .pb-settings-tile, .add-goal-tile, .stat-tab';
const PLOTS = '.recharts-responsive-container, .pb-spark';
const LAYOUT = /width|height|blockSize|inlineSize|gridTemplate|flexBasis|padding|margin|^top$|^left$/i;

/** Fade data, resize the real card shells, then reveal only settled content.
 * Nothing is cloned or scaled, and only hidden plot internals are held still. */
export function createSidebarMotion(sidebar: HTMLElement, read: () => boolean, write: (collapsed: boolean) => void) {
  const main = sidebar.closest('.pebble-shell')?.querySelector<HTMLElement>('.pebble-main');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = window.matchMedia('(min-width: 760px) and (min-height: 600px)');
  let desired = read(), phase: 'idle' | 'exit' | 'resize' | 'reveal' = 'idle';
  let generation = 0, frame = 0, disposed = false, wasInert = false;
  let animations: Animation[] = [];
  const held = new Map<HTMLElement, { width: string; height: string; widthPriority: string; heightPriority: string }>();
  const cards = () => main ? [...main.querySelectorAll<HTMLElement>(CARDS)].filter(card => !card.parentElement?.closest(CARDS)) : [];
  const bodies = () => cards().flatMap((card, index) => [...card.children].map(element => ({ element, index })));
  const cancel = () => {
    cancelAnimationFrame(frame); frame = 0;
    for (const animation of animations) animation.cancel();
    animations = [];
  };
  const holdPlots = () => {
    if (!main) return;
    const plots = [...main.querySelectorAll<HTMLElement>(PLOTS)].filter(plot => !held.has(plot));
    const sizes = plots.map(plot => ({ plot, rect: plot.getBoundingClientRect() }));
    for (const { plot, rect } of sizes) {
      if (!rect.width || !rect.height) continue;
      held.set(plot, { width: plot.style.getPropertyValue('width'), height: plot.style.getPropertyValue('height'),
        widthPriority: plot.style.getPropertyPriority('width'), heightPriority: plot.style.getPropertyPriority('height') });
      plot.style.setProperty('width', `${rect.width}px`);
      plot.style.setProperty('height', `${rect.height}px`);
    }
  };
  const releasePlots = () => {
    for (const [plot, style] of held) {
      for (const key of ['width', 'height'] as const) {
        if (style[key]) plot.style.setProperty(key, style[key], style[key === 'width' ? 'widthPriority' : 'heightPriority']);
        else plot.style.removeProperty(key);
      }
    }
    held.clear();
  };
  const layoutAnimations = () => [sidebar, ...(main ? [main, ...cards()] : [])].flatMap(element => element.getAnimations())
    .filter(animation => animation.playState === 'running' && (animation.effect as KeyframeEffect | null)?.getKeyframes()
      .some(key => Object.keys(key).some(property => LAYOUT.test(property))));
  const clear = () => {
    const active = phase !== 'idle';
    cancel(); releasePlots();
    if (main) { delete main.dataset.pbSidebarPhase; if (active && !wasInert) main.removeAttribute('inert'); }
    phase = 'idle';
  };
  const finish = () => {
    if (disposed || phase === 'idle') return;
    generation++;
    write(desired);
    for (const animation of layoutAnimations()) {
      try { animation.finish(); } catch { /* An unrelated infinite effect keeps its own lifecycle. */ }
    }
    clear();
  };
  const reveal = (fromCurrent = false) => {
    if (!main) return;
    const token = ++generation;
    const targets = bodies().map(target => ({ ...target, from: fromCurrent ? Number(getComputedStyle(target.element).opacity) : 0 }));
    cancel(); releasePlots();
    const values = targets.map(target => ({ ...target, to: Number(getComputedStyle(target.element).opacity) }));
    animations = values.map(({ element, index, from, to }) => {
      const animation = element.animate([{ opacity: from }, { opacity: to }],
        { duration: 140, delay: Math.min(index, 4) * 12, easing: 'ease-out', fill: 'both' });
      animation.id = 'pb-sidebar-content-reveal';
      return animation;
    });
    phase = 'reveal'; main.dataset.pbSidebarPhase = phase;
    void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (!disposed && generation === token) clear();
    });
  };
  const resize = () => {
    if (!main) return;
    const token = ++generation;
    cancel();
    phase = 'resize'; main.dataset.pbSidebarPhase = phase;
    holdPlots(); write(desired);
    let released = false, stable = 0, previous = '';
    const started = performance.now();
    const check = () => {
      frame = 0;
      if (disposed || generation !== token) return;
      if (document.hidden || reduced.matches || !desktop.matches) { finish(); return; }
      const shapes = [sidebar, main, ...cards()].map(element => {
        const rect = element.getBoundingClientRect(); return `${rect.width.toFixed(2)},${rect.height.toFixed(2)}`;
      }).join('|');
      const moving = layoutAnimations().length > 0;
      stable = !moving && shapes === previous ? stable + 1 : 0;
      previous = shapes;
      // Give responsive plots their final dimensions while still invisible,
      // then wait for their observers/React updates and any card height tween.
      if (stable >= 2 && !released) { releasePlots(); released = true; stable = 0; }
      else if (stable >= 2 && released) {
        const ready = [...main.querySelectorAll<HTMLElement>('.recharts-responsive-container')].every(plot => {
          const width = plot.getBoundingClientRect().width;
          if (!width || plot.closest('[hidden]')) return true;
          const svg = plot.querySelector<SVGSVGElement>('.recharts-surface');
          return !svg || Math.abs(Number(svg.getAttribute('width')) - Math.round(width)) <= 1;
        });
        if (ready) { reveal(); return; }
      }
      // A route change or unrelated layout loop must never strand blank cards.
      if (performance.now() - started > 1800) {
        for (const animation of layoutAnimations()) {
          try { animation.finish(); } catch { /* Ignore unrelated infinite effects. */ }
        }
        releasePlots();
        frame = requestAnimationFrame(() => {
          if (disposed || generation !== token) return;
          frame = requestAnimationFrame(() => { if (!disposed && generation === token) reveal(); });
        });
        return;
      }
      frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
  };
  const exit = () => {
    if (!main) return;
    const token = ++generation;
    const values = bodies().map(target => ({ ...target, opacity: Number(getComputedStyle(target.element).opacity) }));
    if (phase === 'idle') wasInert = main.hasAttribute('inert');
    cancel();
    main.setAttribute('inert', ''); phase = 'exit'; main.dataset.pbSidebarPhase = phase;
    animations = values.map(({ element, opacity }) => {
      const animation = element.animate([{ opacity }, { opacity: 0 }], { duration: 90, easing: 'ease-out', fill: 'both' });
      animation.id = 'pb-sidebar-content-exit'; return animation;
    });
    void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (!disposed && generation === token) {
        if (desired === read()) reveal(); else resize();
      }
    });
  };
  const onHidden = () => { if (document.hidden) finish(); };
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', finish);
  window.addEventListener('resize', finish);
  reduced.addEventListener('change', finish);
  return {
    toggle() {
      if (disposed) return;
      desired = !(phase === 'idle' ? read() : desired);
      if (!main || document.hidden || reduced.matches || !desktop.matches || typeof main.animate !== 'function') {
        if (phase === 'idle') write(desired); else finish();
      } else if (phase === 'resize') resize();
      else if (phase === 'exit' && desired === read()) reveal(true);
      else exit();
    },
    dispose() {
      disposed = true; generation++; clear();
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', finish); window.removeEventListener('resize', finish);
      reduced.removeEventListener('change', finish);
    },
  };
}
