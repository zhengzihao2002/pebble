/** One route definition for the live background and its accelerated preview.
 * Delays preserve the deliberately staggered starting composition. */
export const AMBIENT_MOTION = [
  { key: 'near', xPeriod: 31, yPeriod: 47, colourPeriod: 43, xDelay: -3.0293, yDelay: -32.8369, colourDelay: -9 },
  { key: 'middle', xPeriod: 43, yPeriod: 59, colourPeriod: 57, xDelay: -26.3754, yDelay: -6.9741, colourDelay: -48 },
  { key: 'far', xPeriod: 53, yPeriod: 71, colourPeriod: 71, xDelay: -11.9084, yDelay: -47.6416, colourDelay: -88 },
] as const;

export type AmbientMotion = typeof AMBIENT_MOTION[number];

/** CSS cubic-bezier(x1, 0, x2, 1), with x inverted before evaluating y. */
function eased(progress: number, x1: number, x2: number) {
  let low = 0, high = 1;
  for (let i = 0; i < 20; i++) {
    const t = (low + high) / 2;
    const x = 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t ** 2 * x2 + t ** 3;
    if (x < progress) low = t;
    else high = t;
  }
  const t = (low + high) / 2;
  return 3 * (1 - t) * t ** 2 + t ** 3;
}

function axis(seconds: number, period: number, delay: number, x1 = .37, x2 = .63) {
  const phase = (((seconds - delay) / period) % 1 + 1) % 1;
  return eased(phase < .5 ? phase * 2 : (1 - phase) * 2, x1, x2);
}

/** Normalized centres are shared by the live renderer and the route preview. */
export function sampleAmbientMotion(orb: AmbientMotion, seconds: number) {
  return {
    x: axis(seconds, orb.xPeriod, orb.xDelay),
    y: axis(seconds, orb.yPeriod, orb.yDelay),
    hue: -42 + 84 * axis(seconds, orb.colourPeriod, orb.colourDelay, .42, .58),
  };
}
