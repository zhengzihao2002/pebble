import type { ReactNode } from 'react';

/**
 * Renders a dictionary template whose placeholders are ELEMENTS, not text.
 *
 * t() returns a plain string, which is fine when a whole sentence is text.
 * It is not fine when part of the sentence carries markup - a bold clause, a
 * monospaced amount, a code path - because the markup would be lost.
 *
 * Splitting on the CAPTURE GROUP keeps the delimiters, so the parts come back
 * in the order that language puts them. That is the whole point: English and
 * Chinese place the same emphasis in different positions, and neither
 * concatenation nor a single .split() can serve both.
 *
 * Lived in TransactionDetailModal until the dashboard tooltips needed it too.
 * Extracted rather than copied - the Analysis page has 21 more tooltips.
 *
 * An unmatched placeholder is left verbatim rather than blanked, so a missing
 * value shows up in the UI instead of hiding.
 */
export function renderTemplate(template: string, nodes: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const match = /^\{(\w+)\}$/.exec(part);
    if (match && match[1] in nodes) return <span key={i}>{nodes[match[1]]}</span>;
    return <span key={i}>{part}</span>;
  });
}
