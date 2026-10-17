'use client';

import { formatCurrency, formatDate } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';

export type ColumnRole = 'date' | 'desc' | 'amount' | 'debit' | 'credit';

/** One data row as the current settings read it. */
export interface ReadRow {
  idx: number;
  /** Parsed 'YYYY-MM-DD', or null when the date cell cannot be read. */
  date: string | null;
  /** The raw date cell, shown in wine when it cannot be read. */
  rawDate: string;
  description: string;
  /** Signed cents, or null when the amount cannot be read. */
  cents: number | null;
  rawAmount: string;
}

// A cell that reads as a number may be money (an amount or a running
// balance), so it wears font-mono-tab and privacy mode blurs it.
const looksNumeric = (c: string) => /^[\s($€£¥+\-−–]*\d[\d,.\s]*\)?[-−]?$/.test(c.trim());

/**
 * The Columns step's live check: the first rows exactly as the import will
 * read them with the settings above, and the file's own first rows with the
 * mapped columns badged. Read-only; every change above re-renders it.
 */
export function ColumnPreview({ readRows, rawRows, headerRow, width, roles }: {
  readRows: ReadRow[];
  /** The first raw data rows, after the skipped rows and the header. */
  rawRows: string[][];
  /** The header row, when the file has one. */
  headerRow: string[] | null;
  width: number;
  roles: Partial<Record<number, ColumnRole>>;
}) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.transactionDialogs;
  const roleLabel: Record<ColumnRole, string> = {
    date: x.roleDate, desc: x.roleDesc, amount: x.roleAmount, debit: x.roleDebit, credit: x.roleCredit,
  };
  const cols = Array.from({ length: Math.min(width, 12) }, (_, i) => i);

  return (
    <div className="pb-tdlg-colprev">
      <div>
        <p className="pb-tdlg-label">{x.firstRows}</p>
        {readRows.length === 0 ? (
          <p className="pb-tdlg-colprev-empty">{x.noDataRows}</p>
        ) : (
          <table className="pb-tdlg-read">
            <thead>
              <tr><th scope="col">{x.colDate}</th><th scope="col">{x.colDesc}</th><th scope="col" className="pb-tdlg-num">{x.colAmount}</th></tr>
            </thead>
            <tbody>
              {readRows.map((r) => {
                const badAmount = r.cents === null || r.cents === 0;
                return (
                  <tr key={r.idx}>
                    <td className="pb-tnum">
                      {r.date ? formatDate(r.date, locale) : r.rawDate.trim() ? (
                        <span className="pb-tdlg-bad" title={x.cantRead}>{r.rawDate.trim()}</span>
                      ) : (
                        // Nothing there to underline: a plain wine dash.
                        <span className="pb-tdlg-missing" title={x.cantRead}>—</span>
                      )}
                    </td>
                    <td><span className="pb-tdlg-read-desc">{r.description || '—'}</span></td>
                    <td className="pb-tdlg-num">
                      {badAmount ? (
                        r.rawAmount.trim() ? (
                          <span className={`pb-tdlg-bad${looksNumeric(r.rawAmount) ? ' font-mono-tab' : ''}`}>{r.rawAmount.trim()}</span>
                        ) : <span className="pb-tdlg-missing">—</span>
                      ) : (
                        <span className="font-mono-tab" style={{ color: (r.cents as number) > 0 ? 'var(--pine)' : 'var(--wine)' }}>
                          {(r.cents as number) > 0 ? '+' : '−'}{formatCurrency(Math.abs(r.cents as number) / 100)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="pb-tdlg-colprev-hint">{x.firstRowsHint}</p>
      </div>

      {rawRows.length > 0 && cols.length > 0 && (
        <div>
          <p className="pb-tdlg-label">{x.rawRows}</p>
          {/* Scrolls sideways on its own; the dialog body never does. */}
          <div className="pb-tdlg-raw themed-scroll" tabIndex={0} role="region" aria-label={x.rawRows}>
            <table>
              <thead>
                <tr>
                  {cols.map((i) => {
                    const role = roles[i];
                    return (
                      <th key={i} scope="col" className={role ? 'pb-tdlg-raw-mapped' : undefined}>
                        <span className="pb-tdlg-raw-n pb-tnum">{t(d.importCsv.column, { n: i + 1 })}</span>
                        {role && <span className={`pb-tdlg-badge pb-tdlg-badge-${role}`}>{roleLabel[role]}</span>}
                        {headerRow && <span className="pb-tdlg-raw-name">{(headerRow[i] ?? '').trim()}</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rawRows.map((r, k) => (
                  <tr key={k}>
                    {cols.map((i) => {
                      const c = (r[i] ?? '').trim();
                      return (
                        <td key={i} className={roles[i] ? 'pb-tdlg-raw-mapped' : undefined}>
                          <span className={looksNumeric(c) ? 'font-mono-tab' : undefined}>{c}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
