const SUPPORT = '.pb-rep-subline, .pb-rep-flow, .pb-rep-stats, .pb-rep-hero-side';

export interface SummaryCapture {
  hero: HTMLElement;
  columns: boolean;
  support: { element: HTMLElement; opacity: number }[];
}

export function captureSummary(page: HTMLElement): SummaryCapture | null {
  const hero = page.querySelector<HTMLElement>('.pb-rep-hero');
  const main = hero?.querySelector<HTMLElement>('.pb-rep-hero-main');
  const side = hero?.querySelector<HTMLElement>('.pb-rep-hero-side');
  if (!hero || !main || !side) return null;
  return {
    hero, columns: Math.abs(main.getBoundingClientRect().top - side.getBoundingClientRect().top) < 2,
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
  return summary.support.map(({ element, opacity }, index) => element.animate(
    [{ opacity }, { opacity: 0 }], { duration: 110, delay: index * 15, easing: 'ease-in-out', fill: 'both' },
  ));
}

/** Only actual arrangement changes hide supporting content. Native grid
 * resizing leaves headline and supporting typography unscaled. */
export function animateSummary(summary: SummaryCapture, before: DOMRect, after: DOMRect, duration: number, delay: number) {
  const current = captureSummary(summary.hero.parentElement!);
  if (!current || (current.columns === summary.columns && summary.support.every(item => item.opacity >= .99))) return [];
  const animations: Animation[] = [];
  for (const { element } of summary.support) {
    const animation = element.animate([
      { opacity: 0 }, { opacity: 0 },
    ], { duration, delay, fill: 'both' });
    animation.id = 'pb-report-summary-mask'; animations.push(animation);
  }
  return animations;
}


/** The chart is already fully masked for an arrangement change. Lay its SVG
 * out once at the destination width, rather than redraw invisible axes/bars
 * on every grid frame. Release before the existing stagger reveals it. */
export function holdSummaryChart(summary: SummaryCapture) {
  const plot = summary.hero.querySelector<HTMLElement>('[data-pb-report-plot]');
  if (!plot) return () => {};
  const width = plot.getBoundingClientRect().width;
  if (!width) return () => {};
  const previous = plot.style.width;
  plot.style.width = `${width}px`;
  return () => { plot.style.width = previous; };
}
