/**
 * A small CSV reader for bank exports: quoted fields, doubled quotes,
 * delimiters inside quotes, CRLF or LF, a leading BOM. The delimiter
 * (comma, semicolon or tab) is guessed from the first line.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const counts = [',', ';', '\t'].map((c) => ({ c, n: first.split(c).length }));
  counts.sort((a, b) => b.n - a.n);
  const delim = counts[0].c;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export type DateFormat = 'ymd' | 'mdy' | 'dmy';

/** 'YYYY-MM-DD' for a real calendar date in the given format, else null. */
export function parseCsvDate(raw: string, format: DateFormat): string | null {
  const m = /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/.exec(raw.trim());
  if (!m) return null;
  let y: number, mo: number, d: number;
  if (format === 'ymd') { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if (format === 'mdy') { mo = +m[1]; d = +m[2]; y = +m[3]; }
  else { d = +m[1]; mo = +m[2]; y = +m[3]; }
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (y < 1900 || y > 2100 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Signed whole cents, or null when the text is not an amount. */
export function parseCsvAmountCents(raw: string): number | null {
  let s = raw.trim().replace(/[\u2212\u2013]/g, '-').replace(/[$€£¥\s,]/g, '');
  if (s === '') return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  if (!Number.isFinite(cents) || cents > 1e12) return null;
  return neg ? -cents : cents;
}
