/**
 * Strings for the redesigned budgets UI, reached as d.ux.budgets.<key>.
 *
 * Kept in its own file (mounted under `ux` in en.ts / zh.ts) so each area's
 * new text lives beside the others without editing the two big dictionaries.
 * Same rules as en.ts: labels only - never a stored or compared value - and
 * {braces} for interpolation through t(). The Chinese object is typed as the
 * English one, so a missing translation is a compile error.
 */
export const budgetsEn = {
};

export const budgetsZh: typeof budgetsEn = {
};
