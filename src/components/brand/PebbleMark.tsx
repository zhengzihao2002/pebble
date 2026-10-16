import { MARK_PATHS, MARK_SIZE, MARK_STROKE } from './pebbleMark';

interface PebbleMarkProps {
  /** Pixels, square. */
  size?: number;
  /**
   * 'theme' (default): the tile follows the chosen colour theme and dark
   * mode, like the rest of the app. 'brand': Original's pine in every theme -
   * for the welcome animation and the sign-in pages, which are a constant
   * signature.
   */
  tone?: 'theme' | 'brand';
  className?: string;
}

/**
 * The mark on its tile. Decoration only: it always sits beside the word
 * "Pebble", so it is hidden from assistive technology.
 *
 * No hooks and no gradient ids, so it renders the same on the server and the
 * client and any number of copies can share a page. The tile's gradient is
 * CSS (.pb-mark in globals.css); the strokes are flat colours. pathLength
 * lets CSS draw each stroke on by percentage (the welcome animation).
 */
export function PebbleMark({ size = 32, tone = 'theme', className }: PebbleMarkProps) {
  return (
    <span
      className={`pb-mark${tone === 'brand' ? ' pb-mark-brand' : ''}${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`} width="100%" height="100%" focusable="false" fill="none" strokeWidth={MARK_STROKE}>
        <path className="pb-mark-ring" d={MARK_PATHS.ring} pathLength={100} />
        <path className="pb-mark-share" d={MARK_PATHS.share} pathLength={100} />
        <path className="pb-mark-stem" d={MARK_PATHS.stem} strokeLinecap="round" pathLength={100} />
      </svg>
    </span>
  );
}
