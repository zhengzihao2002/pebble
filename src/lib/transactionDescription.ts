/**
 * Title / description encoding for a single stored description string.
 *
 * Deliberately dependency-free. The database keeps ONE text column; the first
 * line is the title and everything after the first '\n' is the description.
 * This convention predates the two-field form: list rows already render only
 * the first line, and the detail view already splits at the first '\n'.
 *
 * No schema change and no wire-format change: every action still receives
 * and stores one string, exactly as before.
 */

export interface DescriptionParts {
  title: string;
  description: string;
}

/** Splits at the FIRST '\n' only; the description may hold further newlines. */
export function parseDescription(stored: string): DescriptionParts {
  const i = stored.indexOf('\n');
  if (i === -1) return { title: stored, description: '' };
  return { title: stored.slice(0, i), description: stored.slice(i + 1) };
}

/**
 * Joins the two fields into the stored form. A newline inside the title would
 * silently move text into the description on the next read, so any is turned
 * into a space. A single-line input cannot produce one; this is a backstop.
 */
export function composeDescription(title: string, description: string): string {
  const t = title.replace(/[\r\n]+/g, ' ').trim();
  const d = description.trim();
  return d ? `${t}\n${d}` : t;
}

/** The title alone, for list rows and labels. */
export function descriptionTitle(stored: string): string {
  return parseDescription(stored).title;
}

/** True once either field differs from what the stored string parsed to. */
export function isDescriptionEdited(original: string, title: string, description: string): boolean {
  const initial = parseDescription(original);
  return title !== initial.title || description !== initial.description;
}

/**
 * What an EDIT form sends back. Untouched fields return the original string
 * unchanged, byte for byte, whatever whitespace the stored value holds;
 * compose-then-parse alone is not an exact inverse for every string (a
 * trailing '\n' is lost, for one). Only a real edit writes a newly composed
 * value.
 */
export function resolveEditedDescription(original: string, title: string, description: string): string {
  return isDescriptionEdited(original, title, description)
    ? composeDescription(title, description)
    : original;
}
