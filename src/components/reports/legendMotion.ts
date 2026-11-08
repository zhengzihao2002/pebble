/** Animate flex-wrap jumps with translation only. Measure layout coordinates,
 * rather than transformed rectangles, so reversals start at the visible spot. */
export function observeLegendMotion(legend: HTMLElement) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const positions = new Map<HTMLElement, { left: number; top: number; animation: Animation | null }>();
  let frame = 0;
  const measure = () => {
    cancelAnimationFrame(frame); frame = 0;
    const side = legend.closest<HTMLElement>('.pb-rep-hero-side');
    // Move the chart beneath the legend smoothly when a new row adds height.
    const following = side ? [...(side.children ?? [])].filter(element => element !== legend.parentElement) : [];
    const items = [...legend.children, ...following] as HTMLElement[];
    const next = items.map(element => ({ element, left: element.offsetLeft, top: element.offsetTop }));
    const changes = next.filter(({ element, left, top }) => {
      const before = positions.get(element);
      return before && (Math.abs(left - before.left) > .5 || Math.abs(top - before.top) > .5);
    });
    const hidden = document.hidden || reduced.matches || (changes.length > 0
      && Number(getComputedStyle(legend.closest('.pb-rep-hero-side') ?? legend).opacity) < .01);
    // Batch reads before cancelling or installing any transform animations.
    const moves = changes.map(({ element, left, top }) => {
      const before = positions.get(element)!;
      const transform = before.animation ? getComputedStyle(element).transform : 'none';
      const matrix = transform === 'none' ? null : new DOMMatrixReadOnly(transform);
      return { element, x: before.left + (matrix?.m41 ?? 0) - left, y: before.top + (matrix?.m42 ?? 0) - top };
    });
    for (const [element, state] of positions) {
      if (!items.includes(element) || hidden) { state.animation?.cancel(); state.animation = null; }
      if (!items.includes(element)) positions.delete(element);
    }
    for (const { element, left, top } of next) {
      const state = positions.get(element) ?? { left, top, animation: null };
      state.left = left; state.top = top; positions.set(element, state);
    }
    if (hidden) return;
    for (const { element, x, y } of moves) {
      const state = positions.get(element)!;
      state.animation?.cancel();
      const animation = element.animate([
        { transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0px, 0px)' },
      ], { duration: 240, easing: 'cubic-bezier(.22,.78,.22,1)' });
      state.animation = animation;
      void animation.finished.then(() => { if (state.animation === animation) state.animation = null; }, () => {});
    }
  };
  const queue = () => { if (!frame) frame = requestAnimationFrame(measure); };
  const resize = new ResizeObserver(measure);
  const mutation = new MutationObserver(queue);
  resize.observe(legend);
  mutation.observe(legend, { childList: true, subtree: true, characterData: true });
  reduced.addEventListener('change', measure);
  document.addEventListener('visibilitychange', measure);
  document.fonts?.addEventListener('loadingdone', queue);
  measure();
  return () => {
    cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect();
    reduced.removeEventListener('change', measure);
    document.removeEventListener('visibilitychange', measure);
    document.fonts?.removeEventListener('loadingdone', queue);
    positions.forEach(state => state.animation?.cancel());
  };
}
