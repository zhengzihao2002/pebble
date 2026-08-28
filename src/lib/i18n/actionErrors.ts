import type { Dictionary } from './index';
import { t } from './index';
import type { Locale } from './locale';

interface ServerFailure {
  error: string;
  code?: string;
  params?: Record<string, string | string[]>;
}

/**
 * Turns a server action's failure into a localized message.
 *
 * `code` is optional and additive. An action not yet converted (or a code
 * this dictionary build does not recognise) has no matching entry in
 * d.serverErrors, and this falls back to result.error - the server's own
 * English string - rather than showing nothing. A gap here is a visible
 * English sentence, never a broken UI.
 *
 * List params are joined HERE, not on the server, because the correct
 * separator is a display decision: 、for Chinese, ", " for English.
 */
export function translateActionError(d: Dictionary, locale: Locale, result: ServerFailure): string {
  if (!result.code) return result.error;

  const templates = d.serverErrors as Record<string, string> | undefined;
  const template = templates?.[result.code];
  if (!template) return result.error;

  const resolved: Record<string, string> = {};
  if (result.params) {
    const sep = locale === 'zh' ? '、' : ', ';
    for (const [key, value] of Object.entries(result.params)) {
      resolved[key] = Array.isArray(value) ? value.join(sep) : value;
    }
  }
  return t(template, resolved);
}
