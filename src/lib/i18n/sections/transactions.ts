/**
 * Strings for the redesigned transactions UI, reached as d.ux.transactions.<key>.
 *
 * Kept in its own file (mounted under `ux` in en.ts / zh.ts) so each area's
 * new text lives beside the others without editing the two big dictionaries.
 * Same rules as en.ts: labels only - never a stored or compared value - and
 * {braces} for interpolation through t(). The Chinese object is typed as the
 * English one, so a missing translation is a compile error.
 */
export const transactionsEn = {
};

export const transactionsZh: typeof transactionsEn = {
};
