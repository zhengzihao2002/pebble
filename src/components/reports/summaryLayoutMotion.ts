const ANCHORS = '.pb-rep-eyebrow, .pb-rep-figure-label, .pb-rep-figure';
const SUPPORT = '.pb-rep-subline, .pb-rep-flow, .pb-rep-stats, .pb-rep-hero-side';

export interface SummaryCapture {
  hero: HTMLElement;
  columns: boolean;
  anchors: { element: HTMLElement; before: DOMRect }[];
  support: { element: HTMLElement; opacity: number }[];
}

export function captureSummary(page: HTMLElement): SummaryCapture | null {
  const hero = page.querySelector<HTMLElement>('.pb-rep-hero');
  const main = hero?.querySelector<HTMLElement>('.pb-rep-hero-main');
  const side = hero?.querySelector<HTMLElement>('.pb-rep-hero-side');
  if (!hero || !main || !side) return null;
  return {
    hero, columns: Math.abs(main.getBoundingClientRect().top - side.getBoundingClientRect().top) < 2,
    anchors: [...hero.querySelectorAll<HTMLElement>(ANCHORS)].map(element => ({ element, before: element.getBoundingClientRect() })),
    support: [...hero.querySelectorAll<HTMLElement>(SUPPORT)].map(element => ({ element, opacity: Number(getComputedStyle(element).opacity) })),
  };
}

/** Predict only the column boundary, without changing layout or resizing charts. */
export function summaryWillReflow(summary: SummaryCapture, grid: HTMLElement) {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const style = getComputedStyle(summary.hero);
  const gridStyle = getComputedStyle(grid);
  const trackChange = (parseFloat(gridStyle.getPropertyValue('--pb-rep-expanded-w')) - parseFloat(gridStyle.getPropertyValue('--pb-rep-collapsed-w'))) * rem;
  const targetWidth = summary.hero.offsetWidth + (grid.classList.contains('has-inspector') ? 1 : -1) * trackChange;
  const contentWidth = targetWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
  const columnMin = parseFloat(style.getPropertyValue('--pb-rep-hero-column-min')) * rem;
  const columns = contentWidth >= 2 * columnMin + parseFloat(style.columnGap) - 0.5;
  return columns !== summary.columns;
}

export function fadeSummaryOut(summary: SummaryCapture) {
  return summary.support.map(({ element, opacity }) => element.animate(
    [{ opacity }, { opacity: 0 }], { duration: 70, easing: 'ease-out', fill: 'both' },
  ));
}

/** Cancel the parent card's scale for the headline; only supporting content
 * dissolves at a column change. Precomputed keyframes need no per-frame JS. */
export function animateSummary(summary: SummaryCapture, before: DOMRect, after: DOMRect, duration: number, delay: number, easing: string) {
  const current = captureSummary(summary.hero.parentElement!);
  if (!current || (current.columns === summary.columns && summary.support.every(item => item.opacity >= .99))) return [];
  const animations: Animation[] = [];
  const mix = (a: number, b: number, progress: number) => a + (b - a) * progress;
  const targets = summary.anchors.map(anchor => ({ ...anchor, after: anchor.element.getBoundingClientRect() }));
  for (const target of targets) {
    if (!target.after.width || !target.after.height) continue;
    const frames = Array.from({ length: 33 }, (_, index) => {
      const progress = index / 32;
      const parentX = mix(before.left, after.left, progress), parentY = mix(before.top, after.top, progress);
      const parentScaleX = mix(before.width, after.width, progress) / after.width;
      const parentScaleY = mix(before.height, after.height, progress) / after.height;
      const x = (mix(target.before.left, target.after.left, progress) - parentX) / parentScaleX - (target.after.left - after.left);
      const y = (mix(target.before.top, target.after.top, progress) - parentY) / parentScaleY - (target.after.top - after.top);
      const sx = mix(target.before.width, target.after.width, progress) / target.after.width / parentScaleX;
      const sy = mix(target.before.height, target.after.height, progress) / target.after.height / parentScaleY;
      return { offset: progress, transform: `translate(${x}px, ${y}px) scale(${sx}, ${sy})` };
    });
    const animation = target.element.animate(frames, { duration, delay, easing, fill: 'both' });
    animation.id = 'pb-report-summary-anchor'; animations.push(animation);
  }
  for (const { element } of summary.support) {
    const animation = element.animate([
      { opacity: 0 }, { opacity: 0 },
    ], { duration, delay, fill: 'both' });
    animation.id = 'pb-report-summary-mask'; animations.push(animation);
  }
  return animations;
}
