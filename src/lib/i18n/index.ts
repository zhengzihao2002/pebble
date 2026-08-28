import { en } from './en';
import { zh } from './zh';
import { DEFAULT_LOCALE, isLocale, type Locale } from './locale';

export * from './locale';

export type Dictionary = typeof en;

const dictionaries: Record<Locale, Dictionary> = { en, zh };

/**
 * Resolves a dictionary, tolerating anything.
 *
 * The locale can arrive from localStorage or a cookie, both of which can hold
 * a value written by an older build or by hand. Falling back is always
 * correct here: the worst case is English text, never a crash.
 */
export function getDictionary(locale?: Locale | string | null): Dictionary {
  return isLocale(locale) ? dictionaries[locale] : dictionaries[DEFAULT_LOCALE];
}

/**
 * Interpolation only. There is deliberately no key-path lookup: dictionary
 * entries are reached as plain properties (d.goals.emptyTitle), which gives
 * compile-time checking and editor autocomplete for free, with no recursive
 * path type and no runtime string parsing.
 *
 * NO PLURAL ENGINE, deliberately. Chinese has no plural inflection, and where
 * English needs one the dictionary carries both forms as separate keys and
 * the call site picks. That is honest about the handful of real cases instead
 * of pretending they do not exist or building rules machinery for them.
 *
 * An unmatched {placeholder} is left verbatim rather than blanked, so a
 * missing variable shows up in the UI instead of hiding.
 */
export function t(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole,
  );
}
