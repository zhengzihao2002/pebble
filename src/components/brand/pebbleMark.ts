/**
 * Pebble's mark: a "P" whose bowl is a two-part ring chart - most of it cream,
 * one share of it gold, split by a hairline gap the way the Dashboard's "Where
 * it went" ring separates its slices. A monogram for the name, a chart for
 * what the app does.
 *
 * ONE geometry for every place the mark appears: the in-app PebbleMark
 * component and scripts/generate-icons.mjs (home-screen icons, favicon). The
 * script imports this file directly (Node strips the types), so it must stay
 * dependency-free and use only erasable TypeScript syntax.
 *
 * Drawn on a 512 x 512 canvas, all strokes: the stem has round ends, the two
 * ring segments have square ends so the gap between them is a clean cut. The
 * stem is drawn last, over the point where both segments start.
 */
export const MARK_SIZE = 512;

/** Stroke width shared by the stem and the ring. */
export const MARK_STROKE = 46;

const RADIUS = 72;
const STEM_LENGTH = 244;
// Centred OPTICALLY, not by its box. The stem puts most of the ink on the
// left (box centred, the ink's centre of mass sat 27 units left of the
// middle), so the letter is nudged right by about half of that - centred by
// the box it read as sitting a couple of pixels left. Vertically, a touch
// above the middle (252), where a letter looks centred.
const OPTICAL_SHIFT_X = 14;
const STEM_X = 256 - RADIUS + OPTICAL_SHIFT_X;
const TOP = 252 - STEM_LENGTH / 2;
const BOTTOM = TOP + STEM_LENGTH;
const CX = STEM_X + RADIUS;
const CY = TOP + RADIUS;

/** Clockwise from 12 o'clock. The stem meets the ring at 270 (9 o'clock). */
const JOIN = 270;
const SPLIT = 118;
const GAP = 7;

const round = (n: number) => Math.round(n * 10) / 10;

function pointAt(deg: number): string {
  const a = (deg * Math.PI) / 180;
  return `${round(CX + RADIUS * Math.sin(a))} ${round(CY - RADIUS * Math.cos(a))}`;
}

function arc(from: number, to: number): string {
  const sweep = (((to - from) % 360) + 360) % 360;
  return `M${pointAt(from)}A${RADIUS} ${RADIUS} 0 ${sweep > 180 ? 1 : 0} 1 ${pointAt(to)}`;
}

export const MARK_PATHS = {
  /** Cream: from the stem, over the top, down to the split. */
  ring: arc(JOIN, SPLIT - GAP / 2),
  /** Gold: from the split, under the bowl, back into the stem. */
  share: arc(SPLIT + GAP / 2, JOIN),
  stem: `M${round(STEM_X)} ${round(TOP)}V${round(BOTTOM)}`,
};

/**
 * Fixed brand colours, for places that do not follow the chosen theme: the
 * home-screen icons, the favicon and the welcome animation. Original's pine,
 * deepened at the far corner, with a cream letter and a warm gold share.
 */
export const BRAND_COLORS = {
  tileLight: '#27704F',
  tile: '#1F5A45',
  tileDeep: '#123A2C',
  cream: '#F7F2E7',
  gold: '#F2CF85',
  goldDeep: '#C8933F',
} as const;
