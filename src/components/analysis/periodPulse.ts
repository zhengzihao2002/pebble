const activePulses = new WeakMap<HTMLElement, () => void>();

/** Draw outside the sticky shelf's stacking/clipping contexts. The normal
 * content width and four rounded corners stay constant after it expands. */
export function pulseAnalysisPeriod(bar: HTMLElement) {
  activePulses.get(bar)?.();
  const halo = document.createElement('span');
  halo.className = 'pb-ana-period-halo';
  halo.setAttribute('aria-hidden', 'true');
  const style = getComputedStyle(bar);
  const color = style.getPropertyValue('--pine').trim();
  Object.assign(halo.style, {
    position: 'fixed', display: 'block', pointerEvents: 'none', zIndex: '30',
    borderRadius: style.getPropertyValue('--pb-ana-pulse-radius').trim() || '1.15rem',
    boxSizing: 'border-box', opacity: '.45',
  });
  // All styling is explicit: the body is outside the themed app root.
  document.body.append(halo);
  let frame = 0;
  let timer = 0;
  let animation: Animation | null = null;
  const stop = () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    if (animation) { animation.onfinish = null; animation.cancel(); }
    halo.remove();
    activePulses.delete(bar);
  };
  activePulses.set(bar, stop);
  const follow = () => {
    if (!bar.isConnected) { stop(); return; }
    const rect = bar.getBoundingClientRect();
    const content = bar.parentElement?.getBoundingClientRect() ?? rect;
    Object.assign(halo.style, {
      left: content.left + 'px', top: rect.top + 'px',
      width: content.width + 'px', height: rect.height + 'px',
    });
    frame = requestAnimationFrame(follow);
  };
  follow();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    halo.style.boxShadow = `0 0 0 3px ${color}`;
    timer = window.setTimeout(stop, 1800);
  } else {
    animation = halo.animate([
      { boxShadow: `0 0 0 0 ${color}`, opacity: .45 },
      { boxShadow: `0 0 0 16px ${color}`, opacity: 0 },
    ], { duration: 1800, easing: 'ease-out' });
    animation.onfinish = stop;
  }
}
