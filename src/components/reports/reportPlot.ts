/** Stable coordinates for the report plot. Browser layout handles its width;
 * no chart redraw or React state update is needed when the inspector moves. */
export function reportScale(values: number[]) {
  const low = Math.min(0, ...values), high = Math.max(0, ...values);
  const raw = (high - low || 1) / 4;
  const unit = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find(n => n * unit >= raw)! * unit;
  const min = Math.floor(low / step) * step, max = Math.ceil((high || (low < 0 ? 0 : step)) / step) * step;
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step);
  return { ticks, y: (value: number) => (max - value) / (max - min) * 100 };
}

export function reportNetPath(values: (number | null)[], y: (value: number) => number) {
  let connected = false;
  return values.map((value, i) => {
    if (value === null) { connected = false; return ''; }
    const command = connected ? 'L' : 'M'; connected = true;
    return `${command}${(i + .5) / values.length * 1000},${y(value) * 10}`;
  }).join(' ');
}
