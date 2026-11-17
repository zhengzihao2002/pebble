/** Reference-counted so closing a nested dialog never unlocks its parent. */
const locks = new Map<HTMLElement, { count: number; values: string[] }>();
const properties = ['overflow', 'overscroll-behavior', 'scrollbar-gutter'];
export function lockModalBackground(host: HTMLElement): () => void {
  const elements = [...new Set([host, document.scrollingElement, document.body])].filter((el): el is HTMLElement => el instanceof HTMLElement);
  for (const element of elements) {
    const held = locks.get(element);
    if (held) { held.count++; continue; }
    locks.set(element, { count: 1, values: properties.map(key => element.style.getPropertyValue(key)) });
    element.style.setProperty('overflow', 'hidden');
    element.style.setProperty('overscroll-behavior', 'none');
    element.style.setProperty('scrollbar-gutter', 'stable');
  }
  return () => {
    for (const element of elements) {
      const held = locks.get(element);
      if (!held || --held.count) continue;
      properties.forEach((key, index) => held.values[index] ? element.style.setProperty(key, held.values[index]) : element.style.removeProperty(key));
      locks.delete(element);
    }
  };
}
