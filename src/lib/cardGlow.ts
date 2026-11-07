const NS = 'http://www.w3.org/2000/svg';
export const CARD_GLOW_PAD = 88;
const CARDS = '.card,[data-slot="card"],.pb-hero,.pb-accounts-tile,.pb-accounts-cc,.add-goal-tile,.stat-tab';
const EXCLUDED = '[role="dialog"],.pb-modal-overlay,[aria-busy="true"],.pb-layout-skeleton-host,.pb-navigation-preview,.pb-cached-layout';
const IGNORED = '.pb-card-glows,.pb-ambient-background,.pb-ambient-studio';
const MOTION = /^(opacity|transform|translate|scale|width|height|padding|margin|border.*radius)$/i;

/** A finite, oversized filter region is fully transparent before its boundary. */
export function cardGlowPath(width: number, height: number, radii: readonly number[]) {
  const [a, b, c, d] = radii.map(radius => Math.max(0, Math.min(radius, width / 2, height / 2)));
  return `M${a} 0H${width - b}A${b} ${b} 0 0 1 ${width} ${b}V${height - c}A${c} ${c} 0 0 1 ${width - c} ${height}H${d}A${d} ${d} 0 0 1 0 ${height - d}V${a}A${a} ${a} 0 0 1 ${a} 0Z`;
}

function svgNode<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string> = {}) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

interface Glow {
  target: HTMLElement;
  frame: HTMLDivElement;
  svg: SVGSVGElement;
  filters: SVGFilterElement[];
  mask: SVGMaskElement;
  background: SVGRectElement;
  paths: SVGPathElement[];
  previousAnchor: string;
  geometry: string;
}

/** The layer belongs to the actual scroll surface. No viewport canvas or scroll
 * listener chases cards, so compositor scrolling cannot leave a trailing halo. */
export function mountCardGlows(layer: HTMLDivElement, prefix: string, anchors =
  typeof CSS !== 'undefined' && CSS.supports('position-anchor: --pb-glow')
  && CSS.supports('left: anchor(left)') && CSS.supports('width: anchor-size(width)')) {
  const root = layer.closest<HTMLElement>('.pebble-root');
  if (!root || typeof ResizeObserver === 'undefined') return () => {};
  const glows = new Map<HTMLElement, Glow>();
  let nextId = 0, frame = 0, disposed = false;
  const resize = new ResizeObserver(() => paint());

  const eligible = (target: HTMLElement) => {
    if (target.closest(EXCLUDED) || target.parentElement?.closest(CARDS)) return false;
    if (!anchors) {
      // Older browsers still get native scrolling for flow cards. Sticky/fixed
      // surfaces require native CSS anchors; never approximate them per frame.
      for (let node: HTMLElement | null = target; node && node !== root; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (/fixed|sticky/.test(style.position)) return false;
        if (node !== target && /auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return false;
      }
    }
    return true;
  };

  function add(target: HTMLElement) {
    const id = `${prefix}-${nextId++}`;
    const frame = document.createElement('div');
    frame.className = `pb-card-glow-frame${anchors ? ' is-anchored' : ''}`;
    const svg = svgNode('svg', { class: 'pb-card-glow', 'aria-hidden': 'true', focusable: 'false' });
    const defs = svgNode('defs');
    const filters = [18, 7].map((blur, index) => {
      const filter = svgNode('filter', { id: `${id}-blur-${index}`, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' });
      filter.append(svgNode('feGaussianBlur', { stdDeviation: String(blur) }));
      defs.append(filter);
      return filter;
    });
    const mask = svgNode('mask', { id: `${id}-outside`, maskUnits: 'userSpaceOnUse' });
    const background = svgNode('rect', { fill: 'white' });
    const interior = svgNode('path', { fill: 'black' });
    mask.append(background, interior); defs.append(mask); svg.append(defs);
    const group = svgNode('g', { mask: `url(#${id}-outside)` });
    const paths = filters.map((_, index) => {
      const path = svgNode('path', { fill: 'currentColor', opacity: index ? '.10' : '.14', filter: `url(#${id}-blur-${index})` });
      group.append(path); return path;
    });
    svg.append(group);
    const previousAnchor = target.style.getPropertyValue('anchor-name');
    if (anchors) {
      const anchor = `--${id}`;
      const currentAnchor = getComputedStyle(target).getPropertyValue('anchor-name');
      target.style.setProperty('anchor-name', currentAnchor && currentAnchor !== 'none' ? `${currentAnchor}, ${anchor}` : anchor);
      frame.style.setProperty('position-anchor', anchor);
    }
    const glow = { target, frame, svg, filters, mask, background, paths: [...paths, interior], previousAnchor, geometry: '' };
    frame.append(svg);
    glows.set(target, glow); layer.append(frame); resize.observe(target);
  }
  function remove(glow: Glow) {
    resize.unobserve(glow.target); glow.frame.remove();
    if (anchors) {
      if (glow.previousAnchor) glow.target.style.setProperty('anchor-name', glow.previousAnchor);
      else glow.target.style.removeProperty('anchor-name');
    }
    glows.delete(glow.target);
  }
  function sync() {
    const targets = new Set([...root!.querySelectorAll<HTMLElement>(CARDS)].filter(eligible));
    for (const glow of glows.values()) if (!targets.has(glow.target)) remove(glow);
    for (const target of targets) if (!glows.has(target)) add(target);
  }
  function paint() {
    cancelAnimationFrame(frame); frame = 0;
    if (disposed || document.hidden) return;
    sync();
    const origin = root!.getBoundingClientRect();
    const styles = new Map<HTMLElement, CSSStyleDeclaration>();
    const moving = new Map<HTMLElement, boolean>();
    let active = false;
    // Read layout together, then write only changed SVG geometry.
    const measurements = [...glows.values()].map(glow => {
      const rect = glow.target.getBoundingClientRect();
      let opacity = 1;
      for (let node: HTMLElement | null = glow.target; node && node !== root; node = node.parentElement) {
        let style = styles.get(node);
        if (!style) { style = getComputedStyle(node); styles.set(node, style); }
        opacity *= Number(style.opacity);
        if (style.visibility === 'hidden' || style.display === 'none') opacity = 0;
        if (!moving.has(node)) moving.set(node, node.getAnimations().some(animation =>
          animation.playState === 'running' && (animation.effect as KeyframeEffect | null)?.getKeyframes().some(key => Object.keys(key).some(property => MOTION.test(property))),
        ));
        active ||= moving.get(node) ?? false;
      }
      const style = styles.get(glow.target)!;
      const radii = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
        .map(value => parseFloat(value) * (value.endsWith('%') ? Math.min(rect.width, rect.height) / 100 : 1));
      return { glow, rect, opacity, radii };
    });
    for (const { glow, rect, opacity, radii } of measurements) {
      const width = Math.round(rect.width * 100) / 100, height = Math.round(rect.height * 100) / 100;
      glow.frame.style.setProperty('--pb-card-opacity', String(opacity));
      glow.frame.style.display = width && height && opacity ? '' : 'none';
      if (!anchors) {
        glow.frame.style.left = `${rect.left - origin.left + root!.scrollLeft}px`;
        glow.frame.style.top = `${rect.top - origin.top + root!.scrollTop}px`;
        glow.frame.style.width = `${width}px`; glow.frame.style.height = `${height}px`;
      }
      const geometry = `${width}|${height}|${radii.join('|')}`;
      if (!width || !height || geometry === glow.geometry) continue;
      glow.geometry = geometry;
      glow.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      for (const element of [...glow.filters, glow.mask, glow.background]) {
        element.setAttribute('x', String(-CARD_GLOW_PAD)); element.setAttribute('y', String(-CARD_GLOW_PAD));
        element.setAttribute('width', String(width + CARD_GLOW_PAD * 2)); element.setAttribute('height', String(height + CARD_GLOW_PAD * 2));
      }
      const path = cardGlowPath(width, height, radii);
      glow.paths.forEach(element => element.setAttribute('d', path));
    }
    if (active) queue();
  }
  function queue() { if (!disposed && !document.hidden && !frame) frame = requestAnimationFrame(paint); }
  const mutation = new MutationObserver(records => {
    if (records.some(record => {
      const element = record.target instanceof Element ? record.target : record.target.parentElement;
      return element && !element.closest(IGNORED);
    })) queue();
  });
  mutation.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-busy'] });
  const visibility = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else queue(); };
  for (const event of ['animationstart', 'animationend', 'animationcancel', 'transitionrun', 'transitionend', 'transitioncancel']) root.addEventListener(event, queue, true);
  window.addEventListener('resize', queue, { passive: true });
  document.addEventListener('visibilitychange', visibility);
  resize.observe(root); paint();
  return () => {
    disposed = true; cancelAnimationFrame(frame); mutation.disconnect(); resize.disconnect();
    for (const glow of [...glows.values()]) remove(glow);
    for (const event of ['animationstart', 'animationend', 'animationcancel', 'transitionrun', 'transitionend', 'transitioncancel']) root.removeEventListener(event, queue, true);
    window.removeEventListener('resize', queue); document.removeEventListener('visibilitychange', visibility);
  };
}
