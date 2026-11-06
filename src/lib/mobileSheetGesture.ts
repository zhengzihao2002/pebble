/** Quarter-height dismissal and 0.4 px/ms flicks follow Vaul's drawer defaults.
 * Cap travel at 128 CSS pixels so tall forms remain easy to dismiss with a thumb.
 * A flick still needs 40 pixels, keeping small accidental movements harmless. */
export function shouldDismissSheet(distance: number, height: number, velocity: number): boolean {
  return distance >= Math.max(48, Math.min(height * .25, 128)) || (distance >= 40 && velocity >= .4);
}

export interface SheetMotionSample { distance: number; time: number }

/** Use recent movement, rather than the whole gesture: holding or reversing
 * before release must not turn an earlier quick movement into a flick. */
export function sheetReleaseVelocity(samples: SheetMotionSample[], releasedAt: number): number {
  const first = samples.find(sample => sample.time >= releasedAt - 120);
  const last = samples.at(-1);
  const elapsed = first ? releasedAt - first.time : 0;
  return first && last && elapsed > 0 ? (last.distance - first.distance) / elapsed : 0;
}
