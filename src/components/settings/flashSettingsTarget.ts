/** Mount on the card itself so the ring includes its padding and escapes
 * nested size containers. Returns cleanup for repeated jumps and unmount. */
export function flashSettingsTarget(row: HTMLElement) {
  const card = row.closest<HTMLElement>('.card') ?? row;
  const ring = document.createElement('div');
  ring.className = 'pb-settings-jump-ring';
  ring.setAttribute('aria-hidden', 'true');
  card.classList.add('pb-settings-flash-surface');
  const oldMargin = row.style.scrollMarginTop;
  const margin = parseFloat(getComputedStyle(row).scrollMarginTop) || 0;
  const measure = () => {
    const c = card.getBoundingClientRect(), r = row.getBoundingClientRect();
    const style = getComputedStyle(card);
    const first = r.top - c.top <= (parseFloat(style.paddingTop) || 0) + 3;
    const last = c.bottom - r.bottom <= (parseFloat(style.paddingBottom) || 0) + 3;
    const top = first ? 2 : Math.max(2, r.top - c.top - card.clientTop);
    const bottom = last ? card.clientHeight - 2 : Math.min(card.clientHeight - 2, r.bottom - c.top - card.clientTop);
    ring.style.top = `${top}px`;
    ring.style.height = `${Math.max(0, bottom - top)}px`;
    row.style.scrollMarginTop = `${margin + Math.max(0, r.top - c.top - top)}px`;
  };
  measure();
  card.append(ring);
  const observer = new ResizeObserver(measure);
  observer.observe(card);
  if (row !== card) observer.observe(row);
  return () => {
    observer.disconnect();
    ring.remove();
    card.classList.remove('pb-settings-flash-surface');
    row.style.scrollMarginTop = oldMargin;
  };
}
