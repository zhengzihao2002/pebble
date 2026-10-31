import { flushSync } from 'react-dom';

let activeTransition: ViewTransition | undefined;

/** Snapshot finished layouts instead of reflowing charts at every animation frame. */
export function animateReportLayout(page: HTMLElement | null, update: () => void) {
  if (!page || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update(); return;
  }
  const rail = page.querySelector('.pb-rep-rail');
  if (!rail || getComputedStyle(rail).display === 'none') { update(); return; }
  if (document.startViewTransition && !document.documentElement.classList.contains('pb-theme-vt')) {
    activeTransition?.skipTransition();
    document.documentElement.classList.add('pb-report-transition');
    const transition = document.startViewTransition(() => { flushSync(update); });
    activeTransition = transition;
    void transition.finished.catch(() => {}).finally(() => {
      if (activeTransition === transition) { activeTransition = undefined; document.documentElement.classList.remove('pb-report-transition'); }
    });
    return;
  }
  const elements = [...page.querySelectorAll<HTMLElement>('.pb-rep-hero, .pb-rep-side-col')];
  const before = elements.map(el => el.getBoundingClientRect());
  flushSync(update);
  elements.forEach((el,index) => {
    const old = before[index], next = el.getBoundingClientRect();
    if (!next.width || !next.height) return;
    el.animate([{ transformOrigin:'top left', transform:`translate(${old.left-next.left}px,${old.top-next.top}px) scale(${old.width/next.width},${old.height/next.height})` },{ transformOrigin:'top left', transform:'none' }], { duration:520, easing:'cubic-bezier(.22,.78,.22,1)' });
  });
}
