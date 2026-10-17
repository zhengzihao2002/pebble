import type { ReactNode } from 'react';

/**
 * Marks every case-insensitive occurrence of `query` in `text` with
 * <mark className="pb-hit">. The marks sit directly inside the caller's
 * element and carry the original characters, so textContent is unchanged and
 * the ellipsis element (which AppShell's truncation tooltip looks for within
 * a few ancestor levels) is still the one that truncates.
 *
 * `query` is expected trimmed and lower-cased, as the page's search keeps it.
 */
export function highlight(text: string, query: string | undefined): ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  // toLowerCase can change length for a few characters (e.g. 'İ'); marking
  // by index would then drift, so such text is left unmarked.
  if (lower.length !== text.length) return text;
  const parts: ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(query);
  if (at === -1) return text;
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(<mark key={at} className="pb-hit">{text.slice(at, at + query.length)}</mark>);
    from = at + query.length;
    at = lower.indexOf(query, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}
