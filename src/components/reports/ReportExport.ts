/**
 * Client-side CSV of the rows in the report, in the order shown. Read-only:
 * no server, no new action - a Blob and an object URL.
 *
 * Amounts are raw numbers (expenses negative, as stored); dates stay
 * 'YYYY-MM-DD'. Column headings and the type word follow the language;
 * category names, tags and account names are user data and pass through.
 */
import type { Transaction } from '@/types';
import type { Account } from '@/lib/data/mappers';
import { parseDescription } from '@/lib/transactionDescription';

function cell(v: string | number): string {
  const s = String(v);
  // Quote anything with a delimiter, quote or line break; a leading = + - @
  // gets an apostrophe so a spreadsheet never runs it as a formula.
  // Plain numbers (the amounts, "-12.50") are left as they are.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export interface CsvLabels {
  header: string;
  expense: string;
  income: string;
  category: (c: string) => string;
}

export function buildReportCsv(rows: Transaction[], accounts: Account[], labels: CsvLabels): string {
  const names = new Map(accounts.map((a) => [a.id, a.last4 ? `${a.name} ····${a.last4}` : a.name]));
  const lines = [labels.header];
  for (const t of rows) {
    const { title, description } = parseDescription(t.description);
    lines.push([
      t.date,
      title,
      description,
      t.type === 'income' ? labels.income : labels.expense,
      labels.category(t.category),
      t.type === 'expense' ? t.tag ?? '' : '',
      names.get(t.accountId) ?? t.paymentMethod ?? '',
      t.amount.toFixed(2),
      t.type === 'income' ? t.grossAmount.toFixed(2) : '',
      t.type === 'income' ? t.netAmount.toFixed(2) : '',
    ].map(cell).join(','));
  }
  // BOM so Excel opens UTF-8 (Chinese headings, accents) correctly.
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
