import { AMBIENT_MOTION, sampleAmbientMotion } from './ambientMotion';
import { ambientColourMatrix, ambientEnvelope, AMBIENT_DIAMETERS } from './ambientRenderer';
import { AMBIENT_ROUTES, DEFAULT_AMBIENT_SETTINGS } from './ambientSettings';
import { CURSOR_SIZES } from './cursorSize';

// Derive the startup picture from the live renderer's geometry and envelope.
// Only this small, static description is serialized into the parser-time script.
export const VISUAL_STARTUP_CONFIG = {
  cursorSizes: CURSOR_SIZES,
  arrow: 'M6 5.5C6 3.4 8.4 2.5 10 4L28 22C29.4 23.4 28.5 25.8 26.5 25.8H18.8L12.1 31C9.5 32.9 6 31.1 6 28Z',
  defaults: DEFAULT_AMBIENT_SETTINGS,
  diameters: AMBIENT_DIAMETERS,
  routes: Object.fromEntries(AMBIENT_ROUTES.map(route => [route, AMBIENT_MOTION.map(orb => {
    const point = sampleAmbientMotion(orb, 0, route);
    return { x: point.x, y: point.y };
  })])),
  matrices: AMBIENT_MOTION.map(orb => ambientColourMatrix(sampleAmbientMotion(orb, 0).hue)),
  envelopes: [1, 1.35].map(extent => Array.from({ length: 41 }, (_, i) =>
    [0, 50, 100].map(frost => ambientEnvelope(i / 40 * extent, frost)))),
};

/** Self-contained because the same code runs in the head before React loads.
 * Keep all runtime dependencies inside this factory or in its config argument. */
export function createVisualPreferenceTools(config: typeof VISUAL_STARTUP_CONFIG) {
  const put = (style: CSSStyleDeclaration, key: string, value: string) => {
    if (style.getPropertyValue(key) !== value) style.setProperty(key, value);
  };
  const numberIn = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  function cursorProperties(value: unknown) {
    const size = value === 40 ? 48 : config.cursorSizes.includes(value as 24 | 32 | 48) ? value as number : 32;
    const properties: Record<string, string> = {};
    for (const [tone, colour] of [['light', '#55595e'], ['dark', '#d9d9d9']]) {
      for (const kind of ['arrow', 'text', 'text-pressed']) {
        const arrow = kind === 'arrow', long = kind === 'text', height = long ? 48 : 36;
        const path = arrow ? config.arrow : long ? 'M16 6V42' : 'M16 2V34';
        const ink = arrow ? `fill="${colour}" fill-opacity=".9"`
          : `fill="none" stroke="${colour}" stroke-opacity=".9" stroke-width="3" stroke-linecap="round"`;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * height / 32}" viewBox="0 0 32 ${height}"><path d="${path}" ${ink}/></svg>`;
        const x = Math.round(size * (arrow ? 6 : 16) / 32), y = Math.round(size * (arrow ? 4 : height / 2) / 32);
        properties[`--pb-${kind}-${tone}`] = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, ${arrow ? 'auto' : 'text'}`;
      }
    }
    return properties;
  }
  function ambientProperties(value: unknown, still = false) {
    const saved = value && typeof value === 'object' ? value as Partial<typeof config.defaults> : {};
    const frost = numberIn(saved.frost, config.defaults.frost, 0, 100);
    const count = Math.round(numberIn(saved.count, config.defaults.count, 1, config.diameters.length));
    const route = typeof saved.route === 'string' && Object.prototype.hasOwnProperty.call(config.routes, saved.route) ? saved.route : 'default';
    const points = config.routes[route];
    const extent = frost > 50 ? 1.35 : 1, blend = Math.min(1, frost / 50);
    const steps = config.envelopes[frost > 50 ? 1 : 0];
    const properties: Record<string, string> = {}, gradients: string[] = [];
    const bases = ['var(--pine)', 'color-mix(in oklch, var(--pine) 68%, var(--gold))', 'color-mix(in oklch, var(--pine) 84%, var(--gold))'];
    for (let i = 0; i < count; i++) {
      const custom = Array.isArray(saved.colours) ? saved.colours[i] : null;
      let colour = bases[i % bases.length];
      if (typeof custom === 'string' && /^#[0-9a-f]{6}$/i.test(custom)) colour = custom;
      else if (!still) {
        const channels = config.matrices[i].map(row => `calc(${row.map((n, j) => `${n.toFixed(7)} * ${['r', 'g', 'b'][j]}`).join(' + ')})`);
        colour = `rgb(from ${colour} ${channels.join(' ')})`;
      }
      properties[`--pb-ambient-start-colour-${i}`] = colour;
      const stops = steps.filter((_, j) => frost !== 50 || j % 2 === 0).map((profile, j, list) => {
        const alpha = frost <= 50 ? profile[0] + (profile[1] - profile[0]) * frost / 50
          : profile[1] + (profile[2] - profile[1]) * (frost - 50) / 50;
        return `color-mix(in srgb, var(--pb-ambient-start-colour-${i}) calc(var(--ambient-core) * ${(alpha * Math.min(1, 3 / count)).toFixed(7)}), transparent) ${j / (list.length - 1) * 100}%`;
      });
      // Query the fixed layer itself, matching clientWidth/clientHeight even
      // when mobile browser chrome changes the visible viewport height.
      const radius = `calc((min(100cqw, 100cqh) * ${.72 * (1 - blend)} + max(100cqw, 100cqh) * ${blend}) * ${config.diameters[i] / 2 * extent})`;
      gradients.unshift(`radial-gradient(circle ${radius} at ${points[i].x * 100}% ${points[i].y * 100}%, ${stops.join(',')})`);
    }
    properties['background-image'] = gradients.join(',');
    return properties;
  }
  let lastCursor: unknown, cursor: Record<string, string> | undefined;
  let lastAmbient: unknown, lastStill: boolean | undefined, ambient: Record<string, string> | undefined;
  function apply(root: HTMLElement, preferences: unknown, onAuth = false, still = false) {
    const prefs = preferences && typeof preferences === 'object' ? preferences as Record<string, unknown> : {};
    const enabledCursor = !onAuth && prefs.softCursor === true, enabledAmbient = !onAuth && prefs.ambientBackground === true;
    for (const [attribute, enabled] of [['data-pb-soft-cursor', enabledCursor], ['data-pb-ambient', enabledAmbient]] as const) {
      if (enabled && root.getAttribute(attribute) === null) root.setAttribute(attribute, '');
      else if (!enabled && root.getAttribute(attribute) !== null) root.removeAttribute(attribute);
    }
    if (enabledCursor) {
      if (!cursor || lastCursor !== prefs.cursorSize) { cursor = cursorProperties(prefs.cursorSize); lastCursor = prefs.cursorSize; }
      for (const [key, value] of Object.entries(cursor)) put(root.style, key, value);
    } else if (cursor) {
      for (const key of Object.keys(cursor)) {
        if (root.style.getPropertyValue(key)) root.style.removeProperty(key);
      }
    }
    if (enabledAmbient) {
      // CSSOM edits survive hydration without changing React's style-tag text.
      const sheet = root.ownerDocument.getElementById('pb-visual-startup') as HTMLStyleElement | null;
      if (sheet?.sheet) {
        if (!sheet.sheet.cssRules.length) sheet.sheet.insertRule('.pebble-root > .pb-ambient-background::before {}');
        const style = (sheet.sheet.cssRules[0] as CSSStyleRule).style;
        if (!ambient || lastAmbient !== prefs.ambientSettings || lastStill !== still) {
          ambient = ambientProperties(prefs.ambientSettings, still); lastAmbient = prefs.ambientSettings; lastStill = still;
        }
        for (const [key, value] of Object.entries(ambient)) put(style, key, value);
      }
    }
  }
  return { cursorProperties, ambientProperties, apply };
}

export const visualPreferenceTools = createVisualPreferenceTools(VISUAL_STARTUP_CONFIG);
export const VISUAL_PREINIT_SCRIPT = `(${createVisualPreferenceTools.toString()})(${JSON.stringify(VISUAL_STARTUP_CONFIG)}).apply(e,p,au,matchMedia('(prefers-reduced-motion: reduce)').matches);`;
