'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Upload } from 'lucide-react';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { SaveSuccess } from '@/components/shared/SaveSuccess';
import { ActionError } from '@/components/shared/ActionError';
import { LoadingBlock, LoadingOverlay } from '@/components/shared/Spinner';
import { getAccountsAction, getAllocationSummaryAction, getSearchTransactionsAction, importTransactionsAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { parseCsv, parseCsvAmountCents, parseCsvDate, type DateFormat } from '@/lib/csvParse';
import { formatCurrency, formatDate } from '@/lib/format';
import { chargeOverdueSince } from '@/lib/creditCards';
import { composeDescription } from '@/lib/transactionDescription';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { Account, CategoryItem } from '@/lib/data/mappers';
import type { BalanceAdjustment, CategoryMeta, ExpenseTransaction, IncomeTransaction, LedgerRecord, Transaction } from '@/types';
import { computeRecentTransactions } from '@/lib/stats';
import { StatementRow } from '@/components/shared/StatementRow';
import type { StatementEntry } from '@/components/transactions/StatementList';
import { ImportStepper } from '@/components/importCsv/ImportStepper';
import { DropZone } from '@/components/importCsv/DropZone';
import { ColumnPreview, type ColumnRole, type ReadRow } from '@/components/importCsv/ColumnPreview';
import { BalanceDelta, ReviewFilterBar, StatusChip, type ReviewFilter, type RowStatus } from '@/components/importCsv/ReviewParts';
import { useLeavingRows } from '@/components/importCsv/useLeavingRows';
import { useScrollPin } from '@/components/importCsv/useScrollPin';

const MAX_ROWS = 500;
const MAX_SKIP = 100;
const INCOME_CATEGORIES = ['Standard Income', 'Side Cash'] as const;

type Step = 'file' | 'map' | 'preview';
type AmountMode = 'single' | 'split';

const fieldStyle: React.CSSProperties = {
  padding: '0.55rem 0.7rem', borderRadius: '0.6rem', border: '1px solid var(--line)', fontSize: '0.88rem',
  color: 'var(--ink)', backgroundColor: 'var(--paper)', boxSizing: 'border-box', width: '100%', minWidth: 0,
};
const smallField: React.CSSProperties = { ...fieldStyle, fontSize: '0.78rem', padding: '0.4rem 0.5rem' };
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.78rem', color: 'var(--ink-soft)', minWidth: 0 };
const twoCol: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.7rem' };

interface PreviewRow {
  idx: number;
  date: string | null;
  description: string;
  cents: number | null; // signed
  problem: boolean;
  shifted: boolean;
}

/** The button for the Transactions page (with its beta tag); owns its dialog. */
const DATE_FORMATS: DateFormat[] = ['ymd', 'mdy', 'dmy'];

const isDateCell = (c: string) => DATE_FORMATS.some((f) => parseCsvDate(c, f) !== null);
const isNumberCell = (c: string) => parseCsvAmountCents(c) !== null;

// A data row has a date, some text (the description) and a number (the
// amount), each in its own cell. Returns where they are, or null. The FIRST
// number counts as the amount: banks list it before the running balance.
function analyzeRow(r: string[] | undefined): { date: number; desc: number; amount: number } | null {
  if (!r) return null;
  let date = -1;
  let desc = -1;
  let amount = -1;
  r.forEach((cell, i) => {
    const c = cell.trim();
    if (c === '') return;
    if (isDateCell(c)) { if (date < 0) date = i; return; }
    if (isNumberCell(c)) { if (amount < 0) amount = i; return; }
    if (desc < 0) desc = i;
  });
  return date >= 0 && desc >= 0 && amount >= 0 ? { date, desc, amount } : null;
}

const isBlankRow = (r: string[] | undefined) => !r || r.every((c) => c.trim() === '');

// A header row: two or more text cells and no date or number anywhere.
function looksLikeHeader(r: string[] | undefined): boolean {
  if (!r) return false;
  const cells = r.map((c) => c.trim()).filter((c) => c !== '');
  return cells.length >= 2 && !cells.some((c) => isDateCell(c) || isNumberCell(c));
}

// The header for the rows starting at idx: the nearest header-like row up to
// three rows above, stepping over blank lines and summary lines (Bank of
// America puts a dated "Beginning balance" line between its header and the
// first transaction).
function findNamesRow(rows: string[][], idx: number): string[] | null {
  for (let k = idx - 1; k >= 0 && k >= idx - 3; k--) {
    const r = rows[k];
    if (looksLikeHeader(r)) return r;
    if (isBlankRow(r) || analyzeRow(r)) continue;
    return null;
  }
  return null;
}

// Header names that mark a money column. The same patterns applyGuess uses for
// the amount, debit and credit columns, so the two cannot disagree. A running
// balance ("Running Bal.") matches none of them, on purpose.
const MONEY_HEADER = /^(amount|amt|value)|debit|withdraw|paid out|money out|credit|deposit|paid in|money in/;

// Banks often put account details above the table. Finds the first DATA row
// (date + text + number), confirmed by the row after it (also data, blank, or
// the end) so a stray dated line in the preamble is not taken for the table.
// Skip lands ON that row: every row before the first transaction is skipped,
// the header included. The header's names are still read, from the row just
// above (namesAbove / applyGuess). Falls back to the most common row width
// when no row qualifies. Capped at MAX_SKIP either way.
function detectLayout(rows: string[][]): { skip: number; header: boolean } {
  for (let i = 0; i < rows.length && i <= MAX_SKIP + 1; i++) {
    const here = analyzeRow(rows[i]);
    if (!here) continue;
    const names = findNamesRow(rows, i);
    const moneyCols = (names ?? []).flatMap((n, k) => (MONEY_HEADER.test(n.trim().toLowerCase()) ? [k] : []));
    if (moneyCols.length > 0) {
      // The header says where the money is: the row needs a number there. A
      // summary line with only a running balance has none, so it is skipped.
      if (!moneyCols.some((k) => isNumberCell((rows[i][k] ?? '').trim()))) continue;
    } else {
      // No header to go by: the next row must be blank, the end, or a data row
      // with its date, description and amount in the same columns.
      const next = rows[i + 1];
      if (!isBlankRow(next)) {
        const there = analyzeRow(next);
        if (!there || there.date !== here.date || there.desc !== here.desc || there.amount !== here.amount) continue;
      }
    }
    if (i > MAX_SKIP) break;
    return { skip: i, header: false };
  }
  const counts = new Map<number, number>();
  rows.forEach((r) => { if (r.length >= 2) counts.set(r.length, (counts.get(r.length) ?? 0) + 1); });
  let width = 0;
  let best = 0;
  counts.forEach((n, w) => { if (n > best || (n === best && w > width)) { best = n; width = w; } });
  const found = rows.findIndex((r) => r.length === width);
  const skip = Math.max(0, Math.min(MAX_SKIP, found < 0 ? 0 : found, rows.length - 1));
  return { skip, header: !(rows[skip] ?? []).some((c) => isDateCell(c.trim())) };
}

// MM/DD/YYYY unless the data proves otherwise: YYYY-MM-DD when every value
// starts with a four-digit year, DD/MM/YYYY only when MM/DD/YYYY cannot read
// every value and DD/MM/YYYY can. Uses the import's own date parser.
function detectDateFormat(samples: string[]): DateFormat {
  const vals = samples.map((s) => s.trim()).filter((s) => s !== '');
  if (vals.length === 0) return 'mdy';
  const reads = (f: DateFormat) => vals.every((v) => parseCsvDate(v, f) !== null);
  if (vals.every((v) => /^\d{4}\D/.test(v)) && reads('ymd')) return 'ymd';
  if (reads('mdy')) return 'mdy';
  if (reads('dmy')) return 'dmy';
  return 'mdy';
}

/** What the Transactions page already has, for the PC preview pane. */
export interface ImportPreviewData {
  entries: StatementEntry[];
  transactions: Transaction[];
  adjustments: BalanceAdjustment[];
  accounts: Account[];
  categoryMeta: CategoryMeta;
}

export function ImportCsvButton({ preview }: { preview?: ImportPreviewData } = {}) {
  const { d } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <span style={{ position: 'relative', display: 'inline-block', marginLeft: 'auto' }}>
        <button
          type="button" className="pill" onClick={() => setOpen(true)}
          style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Upload size={14} aria-hidden="true" />{d.importCsv.button}
        </button>
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', top: -7, right: -6, padding: '1px 5px', borderRadius: 99,
            fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
            backgroundColor: 'var(--pine)', color: 'var(--paper)', pointerEvents: 'none', lineHeight: 1.4,
          }}
        >
          {d.importCsv.beta}
        </span>
      </span>
      {open && <ImportCsvModal onClose={() => setOpen(false)} preview={preview} />}
    </>
  );
}

// PC only: at least 1024px wide with a mouse or trackpad. A media query rather
// than a container query because the dialog overlay sits outside the content
// container. Read in an effect: matchMedia does not exist on the server.
function useWideImport(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px) and (pointer: fine)');
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return wide;
}

// Phones (the bottom-sheet width): review rows fold to one line and open on
// demand. The same breakpoint as the sheet itself; read in an effect, like
// useWideImport, so the server and first client render agree.
function useNarrowImport(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 559.98px)');
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return narrow;
}

// On PC the dialog renders two cards side by side inside ONE ModalFrame, so
// the focus trap, Escape and the backdrop behave as one dialog. Elsewhere it
// renders the import exactly as before.
function ImportLayout({ split, side, children }: { split: boolean; side: React.ReactNode; children: React.ReactNode }) {
  if (!split) return <>{children}</>;
  return (
    <>
      <div className="card pb-import-pane">{children}</div>
      {side}
    </>
  );
}

/** A ticked import row, as the If imported pane needs it. */
interface PendingImport {
  idx: number;
  date: string;
  /** Signed: money in is positive. */
  cents: number;
  accountId: string | undefined;
  category: string;
  description: string;
  tag: string;
}

// One highlight for every pending row, in the app's gold, so it reads as "new"
// rather than as money in or out (the amount keeps its own colour for that).
// The theme's own light-yellow background, defined for every palette.
const PENDING_TINT = 'var(--gold-soft)';

// How long a preview row takes to grow in or collapse out (--pb-dur-std).
const PREVIEW_ROW_MS = 220;

// A ticked row with no account chosen yet still belongs in the preview. It is
// counted in this stand-in account so the TOTAL balance includes it;
// StatementRow lists only real accounts, so the stand-in never shows by name.
const UNASSIGNED_ACCOUNT = '__pending_unassigned__';

// A real import takes ONE generateTransId stamp, newer than anything stored,
// and numbers its rows -0000, -0001... in date then file order (see
// importTransactions). This stamp sorts after every real id the same way, so a
// pending row lands where the imported row will.
const PENDING_STAMP = '99999999999999999';

function pendingRecord(p: PendingImport, id: string): ExpenseTransaction | IncomeTransaction {
  const amount = p.cents / 100;
  const base = { id, description: p.description, date: p.date, paymentMethod: '', accountId: p.accountId ?? UNASSIGNED_ACCOUNT };
  if (p.cents > 0) {
    return { ...base, type: 'income', category: p.category as IncomeTransaction['category'], grossAmount: amount, netAmount: amount, amount };
  }
  return { ...base, type: 'expense', category: p.category, ...(p.tag ? { tag: p.tag } : {}), amount };
}

// "If imported": this month and the two before, as the statement would look
// with the ticked rows added. Balances come from the same computeRecentTransactions
// the Transactions page uses - never a second calculation. Same StatementRow,
// read-only: a row opens nothing.
function ImportPreviewPane({ preview, pending }: { preview: ImportPreviewData; pending: PendingImport[] }) {
  const { d, t } = useTranslation();
  const x = d.ux.transactionDialogs;
  // The device's local date, the same basis the Transactions navigator uses.
  const windowStart = useMemo(() => {
    const n = new Date();
    const s = new Date(n.getFullYear(), n.getMonth() - 2, 1);
    return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-01`;
  }, []);

  // Every ticked row is shown, with or without an account or category.
  const placed = pending;
  const older = placed.filter((p) => p.date < windowStart).length;

  // Only what moves money re-runs the ledger: a title or tag edit does not.
  const balanceKey = placed.map((p) => `${p.idx}|${p.date}|${p.cents}|${p.accountId}`).join(',');
  const { ledger, idByIdx } = useMemo(() => {
    const ordered = [...placed].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.idx - b.idx));
    const ids = new Map<number, string>();
    ordered.forEach((p, i) => ids.set(p.idx, `${PENDING_STAMP}-${i.toString(36).padStart(4, '0')}`));
    const expenses = preview.transactions.filter((x): x is ExpenseTransaction => x.type === 'expense');
    const income = preview.transactions.filter((x): x is IncomeTransaction => x.type === 'income');
    ordered.forEach((p) => {
      const r = pendingRecord(p, ids.get(p.idx) as string);
      if (r.type === 'income') income.push(r); else expenses.push(r);
    });
    const balanceAccounts = [...preview.accounts, { id: UNASSIGNED_ACCOUNT }];
    return { ledger: computeRecentTransactions(expenses, income, balanceAccounts, preview.adjustments), idByIdx: ids };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceKey, preview.transactions, preview.accounts, preview.adjustments]);

  const { entries, pendingById } = useMemo(() => {
    const byId = new Map<string, LedgerRecord>();
    preview.transactions.forEach((x) => byId.set(x.id, x));
    preview.adjustments.forEach((a) => byId.set(a.id, a));
    const pend = new Map<string, PendingImport>();
    placed.forEach((p) => {
      const id = idByIdx.get(p.idx);
      if (!id) return;
      byId.set(id, pendingRecord(p, id));
      pend.set(id, p);
    });
    const list = ledger.flatMap((e) => {
      const record = byId.get(e.transId);
      return record && record.date >= windowStart ? [{ ...e, record }] : [];
    });
    return { entries: list, pendingById: pend };
  }, [ledger, idByIdx, placed, preview.transactions, preview.adjustments, windowStart]);

  // Ticking or unticking a row must never move what the reader is looking
  // at: rows keep stable keys (the pending row's file index, not its ledger
  // id, which is renumbered as rows come and go), so nothing is re-created;
  // a new row grows in and an unticked one collapses out; and the scroll
  // position is pinned to the first row in view while they do (useScrollPin).
  //
  // It used to scroll the pane to a newly ticked row instead, which pulled a
  // reader who had scrolled down back to the top for a recent row. Now, when
  // ONE row is ticked and it lands out of view, a small button offers to go
  // to it; it goes away once that row is in view or the list changes again.
  // Set all (several rows at once) offers nothing, as before.
  const bodyRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => entries.map((e) => {
    const p = pendingById.get(e.transId);
    return { key: p ? `p${p.idx}` : e.transId, value: { e, p } };
  }), [entries, pendingById]);
  const shown = useLeavingRows(rows, (v) => !!v.p, PREVIEW_ROW_MS);
  const shownKey = shown.map((r) => (r.leaving ? `-${r.key}` : r.key)).join(',');
  useScrollPin(bodyRef, shownKey, PREVIEW_ROW_MS + 80);
  // Rows on screen when the pane opened do not grow in; any row ticked (or
  // ticked again) after that does.
  const [initialKeys, setInitialKeys] = useState(() => new Set(rows.map((r) => r.key)));
  const departed = shown.filter((r) => r.leaving && initialKeys.has(r.key));
  if (departed.length > 0) {
    setInitialKeys((s) => {
      const next = new Set(s);
      departed.forEach((r) => next.delete(r.key));
      return next;
    });
  }
  const [jump, setJump] = useState<{ idx: number; up: boolean } | null>(null);
  const placedSig = placed.map((p) => p.idx).join(',');
  const seenIdx = useRef<Set<number> | null>(null);
  useEffect(() => {
    const now = new Set(placedSig === '' ? [] : placedSig.split(',').map(Number));
    const before = seenIdx.current;
    seenIdx.current = now;
    const body = bodyRef.current;
    if (!before || !body || typeof IntersectionObserver === 'undefined') return;
    const added = [...now].filter((i) => !before.has(i));
    if (added.length !== 1) return;
    const idx = added[0];
    const el = body.querySelector<HTMLElement>(`[data-pending-idx="${idx}"]`);
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setJump((j) => (j?.idx === idx ? null : j));
        io.disconnect();
      } else {
        setJump({ idx, up: entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0) });
      }
    }, { root: body });
    io.observe(el);
    return () => { io.disconnect(); setJump(null); };
  }, [placedSig]);
  const goToJump = () => {
    if (!jump) return;
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-pending-idx="${jump.idx}"]`);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  };

  const noteStyle: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--ink-soft)', margin: '0.25rem 0 0' };

  return (
    <section className="card pb-import-pane pb-tdlg-preview" aria-labelledby="pb-import-preview-title">
      <div className="pb-modal-head">
        <div>
          <h2 id="pb-import-preview-title" className="font-display" style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>{d.importCsv.previewTitle}</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', margin: '0.3rem 0 0' }}>{d.importCsv.previewHint}</p>
          {older > 0 && <p style={noteStyle}>{t(d.importCsv.previewOlder, { count: older })}</p>}
        </div>
      </div>
      {/* Rows run edge to edge, like the statement card. The scroller is
          always this one element (never swapped for the empty note), so its
          scroll position survives every change. */}
      <div ref={bodyRef} className="pb-modal-body themed-scroll pb-tdlg-preview-body" style={{ margin: '0 -1.75rem', padding: 0, borderTop: '1px solid var(--line)' }}>
        {shown.length === 0 && (
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', textAlign: 'center', padding: '2rem 1.5rem', margin: 0 }}>{d.importCsv.previewEmpty}</p>
        )}
        {shown.map(({ key, value: { e, p }, leaving }) => {
          const motion = leaving ? ' pb-tdlg-prow-leave' : p && !initialKeys.has(key) ? ' pb-tdlg-prow-enter' : '';
          return (
            <div
              key={key} data-row-key={key} data-leaving={leaving ? 'true' : undefined}
              data-pending-idx={p && !leaving ? p.idx : undefined}
              className={`pb-tdlg-prow${motion}`}
              aria-hidden={leaving || undefined} inert={leaving || undefined}
            >
              <div style={p ? { background: PENDING_TINT } : undefined}>
                <StatementRow
                  txn={e.record}
                  balancesAfter={e.balancesAfter} accounts={preview.accounts} totalBalanceAfter={e.totalBalanceAfter}
                  onOpenDetail={() => {}} categoryMeta={preview.categoryMeta}
                />
              </div>
            </div>
          );
        })}
      </div>
      {jump && (
        <button type="button" className="pb-tdlg-preview-jump" onClick={goToJump}>
          {jump.up ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />}
          {x.previewShowAdded}
        </button>
      )}
    </section>
  );
}

function ImportCsvModal({ onClose, preview }: { onClose: () => void; preview?: ImportPreviewData }) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.transactionDialogs;
  const wide = useWideImport();
  const narrow = useNarrowImport();
  const split = wide && !!preview;
  const [step, setStep] = useState<Step>('file');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);

  const [parsed, setParsed] = useState<string[][]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [existing, setExisting] = useState<Transaction[]>([]);

  const [skip, setSkip] = useState(0);
  // What the box shows, as typed. skip is the number derived from it, so
  // clearing the box or typing over a 0 never leaves a stuck leading zero.
  const [skipText, setSkipText] = useState('0');
  const [hasHeader, setHasHeader] = useState(true);
  const [dateCol, setDateCol] = useState('');
  const [descCol, setDescCol] = useState('');
  const [amountMode, setAmountMode] = useState<AmountMode>('single');
  const [amountCol, setAmountCol] = useState('');
  const [debitCol, setDebitCol] = useState('');
  const [creditCol, setCreditCol] = useState('');
  const [flip, setFlip] = useState(false);
  const [dateFormat, setDateFormat] = useState<DateFormat>('mdy');

  // Per-row choices, set in the preview. Nothing is preselected.
  const [accOverride, setAccOverride] = useState<Record<number, string>>({});
  const [catOverride, setCatOverride] = useState<Record<number, string>>({});
  const [includeOverride, setIncludeOverride] = useState<Record<number, boolean>>({});
  const [tagOverride, setTagOverride] = useState<Record<number, string>>({});
  const [titleOverride, setTitleOverride] = useState<Record<number, string>>({});
  const [descOverride, setDescOverride] = useState<Record<number, string>>({});
  const [descOpen, setDescOpen] = useState<Record<number, boolean>>({});
  // Review presentation only - none of it changes what is imported.
  // The filter keeps the rows it matched when it was chosen, so a row does
  // not vanish from "Needs a choice" the moment its last choice is made; the
  // chip on the row turns to Ready instead.
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [filterRows, setFilterRows] = useState<Set<number> | null>(null);
  // Phone: which review rows are unfolded. Rows that still need a choice
  // open when the Review step starts and after a Set all; a tap overrides.
  const [openSeed, setOpenSeed] = useState<Set<number>>(new Set());
  const [openOverride, setOpenOverride] = useState<Record<number, boolean>>({});
  // Current total balance in cents, for the before / after preview. Null when it could not be read.
  const [balanceCents, setBalanceCents] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  const [done, setDone] = useState<number | null>(null);

  // Defaults: date in column 1 (MM/DD/YYYY), description in column 2, amount
  // in column 3. A header row that names a column wins over the default for
  // it. Debit and credit are only ever found by name. The date format follows
  // the data only when the data proves it is not MM/DD/YYYY.
  const applyGuess = (rows: string[][], skipN: number, header: boolean) => {
    const names = header
      ? (rows[skipN] ?? [])
      : (findNamesRow(rows, skipN) ?? []);
    const width = rows.slice(skipN).reduce((m, r) => Math.max(m, r.length), 0);
    const guess = (re: RegExp, fallback = '') => {
      const i = names.findIndex((n) => re.test(n.toLowerCase()));
      if (i >= 0) return String(i);
      return fallback !== '' && Number(fallback) < width ? fallback : '';
    };
    const firstData = skipN + (header ? 1 : 0);
    // Where the first real data row keeps its date, description and amount.
    // The fixed columns 1, 2, 3 apply only when no row in the first 20 shows it.
    const seen = rows.slice(firstData, firstData + 20).map(analyzeRow).find((x) => x !== null) ?? null;
    const date = guess(/date/, seen ? String(seen.date) : '0');
    setDateCol(date);
    setDateFormat(detectDateFormat(
      rows.slice(firstData, firstData + 20).map((r) => (date === '' ? '' : (r[Number(date)] ?? ''))),
    ));
    setDescCol(guess(/desc|memo|payee|detail|narrat|name/, seen ? String(seen.desc) : '1'));
    setAmountCol(guess(/^(amount|amt|value)/, seen ? String(seen.amount) : '2'));
    setDebitCol(guess(/debit|withdraw|paid out|money out/));
    setCreditCol(guess(/credit|deposit|paid in|money in/));
    setAmountMode(guess(/debit|withdraw/) !== '' && guess(/credit|deposit/) !== '' ? 'split' : 'single');
  };

  const loadData = async (): Promise<boolean> => {
    setLoading(true);
    setLoadError(null);
    const [acc, all, sum] = await Promise.all([
      callAction(getAccountsAction, d.addTxn.accountsFailed),
      callAction(getSearchTransactionsAction, d.palette.searchFailed),
      callAction(getAllocationSummaryAction),
    ]);
    setLoading(false);
    if (!acc.ok) { setLoadError(translateActionError(d, locale, acc)); return false; }
    if (!all.ok) { setLoadError(translateActionError(d, locale, all)); return false; }
    setAccounts(acc.accounts);
    setCategories(all.categories);
    setExisting(all.transactions);
    setBalanceCents(sum.ok ? Math.round(sum.totalBalance * 100) : null);
    return true;
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    fileRef.current = file;
    let rows: string[][];
    try {
      rows = parseCsv(await file.text());
    } catch {
      setFileError(d.importCsv.fileError);
      return;
    }
    if (rows.length < 1 || rows[0].length < 2) { setFileError(d.importCsv.fileError); return; }
    setParsed(rows);
    const layout = detectLayout(rows);
    setSkip(layout.skip);
    setSkipText(String(layout.skip));
    setHasHeader(layout.header);
    applyGuess(rows, layout.skip, layout.header);
    setAccOverride({});
    setCatOverride({});
    setIncludeOverride({});
    setTagOverride({});
    setTitleOverride({});
    setDescOverride({});
    setDescOpen({});
    if (await loadData()) setStep('map');
  };

  const changeSkip = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 3);
    const n = Math.max(0, Math.min(MAX_SKIP, Number(digits) || 0, Math.max(0, parsed.length - 1)));
    setSkipText(digits === '' ? '' : String(n));
    setSkip(n);
    applyGuess(parsed, n, hasHeader);
    setAccOverride({});
    setCatOverride({});
    setIncludeOverride({});
    setTagOverride({});
    setTitleOverride({});
    setDescOverride({});
    setDescOpen({});
  };

  const afterSkip = useMemo(() => parsed.slice(skip), [parsed, skip]);
  // Column names when the header sits just above the first transaction, since
  // rows to skip counts every row before it, the header included.
  const namesAbove = useMemo(
    () => findNamesRow(parsed, skip),
    [parsed, skip],
  );

  const colOptions = useMemo(() => {
    const width = afterSkip.reduce((m, r) => Math.max(m, r.length), 0);
    return Array.from({ length: width }, (_, i) => {
      // What the first transaction holds in this column, so each choice shows
      // real content. The header's name only when that cell is empty.
      const sample = (afterSkip[hasHeader ? 1 : 0]?.[i] ?? '').trim();
      const headerName = (hasHeader ? afterSkip[0]?.[i] : namesAbove?.[i])?.trim() ?? '';
      const raw = sample || headerName;
      const name = raw.length > 32 ? `${raw.slice(0, 31)}…` : raw;
      const base = t(d.importCsv.column, { n: i + 1 });
      return { value: String(i), label: name ? `${base} · ${name}` : base };
    });
  }, [afterSkip, hasHeader, namesAbove, d, t]);

  const dataRows = useMemo(() => afterSkip.slice(hasHeader ? 1 : 0), [afterSkip, hasHeader]);
  const truncated = dataRows.length > MAX_ROWS;

  // Same account + date + amount, or - while no account is chosen - the same
  // date + amount in any account.
  const { exactKeys, anyKeys } = useMemo(() => {
    const exact = new Set<string>();
    const any = new Set<string>();
    existing.forEach((x) => {
      const c = Math.round(x.amount * 100);
      exact.add(`${x.accountId}|${x.date}|${c}`);
      any.add(`${x.date}|${c}`);
    });
    return { exactKeys: exact, anyKeys: any };
  }, [existing]);

  const rows: PreviewRow[] = useMemo(() => {
    const cell = (r: string[], col: string) => (col === '' ? '' : (r[Number(col)] ?? ''));
    // An unquoted comma inside a description pushes the rest of it into the
    // amount column. If that cell is text but the NEXT one is an amount, use
    // the next one and keep the text as part of the description.
    const amountAt = (r: string[], col: string) => {
      const own = cell(r, col);
      const c = parseCsvAmountCents(own);
      if (c !== null || col === '' || own.trim() === '') return { cents: c, spill: '', bad: false };
      const next = parseCsvAmountCents(r[Number(col) + 1] ?? '');
      return next !== null
        ? { cents: next, spill: own.trim(), bad: false }
        : { cents: null as number | null, spill: '', bad: true };
    };
    return dataRows.slice(0, MAX_ROWS).map((r, idx) => {
      const date = parseCsvDate(cell(r, dateCol), dateFormat);
      let cents: number | null;
      let spill = '';
      let bad = false;
      if (amountMode === 'single') {
        const a = amountAt(r, amountCol);
        cents = a.cents;
        spill = a.spill;
        bad = a.bad;
        if (cents !== null && flip) cents = -cents;
      } else {
        const dr = amountAt(r, debitCol);
        const cr = amountAt(r, creditCol);
        spill = dr.spill || cr.spill;
        bad = dr.bad || cr.bad;
        cents = Math.abs(cr.cents ?? 0) - Math.abs(dr.cents ?? 0);
      }
      const problem = bad || date === null || cents === null || cents === 0;
      const description = `${cell(r, descCol)}${spill ? ` ${spill}` : ''}`.trim().slice(0, 200);
      return { idx, date, description, cents, problem, shifted: spill !== '' && !problem };
    });
  }, [dataRows, dateCol, descCol, amountMode, amountCol, debitCol, creditCol, flip, dateFormat]);

  const isDup = (r: PreviewRow) => {
    if (r.problem) return false;
    const acc = accOverride[r.idx];
    return acc ? exactKeys.has(`${acc}|${r.date}|${r.cents}`) : anyKeys.has(`${r.date}|${r.cents}`);
  };
  const isIncluded = (r: PreviewRow) => !r.problem && (includeOverride[r.idx] ?? !isDup(r));
  const selected = rows.filter(isIncluded);
  const incomplete = selected.filter((r) => !accOverride[r.idx] || !catOverride[r.idx]);
  const mappingOk = dateCol !== '' && (amountMode === 'single' ? amountCol !== '' : debitCol !== '' || creditCol !== '');
  const canImport = selected.length > 0 && incomplete.length === 0;
  // Money in minus spending, for the ticked rows only. Integer cents.
  const netCents = selected.reduce((s, r) => s + (r.cents as number), 0);

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.last4 ? `${a.name} ····${a.last4}` : a.name }));
  // Credit cards take charges only: not offered for income rows, nor in Set all
  // (which applies to income rows too).
  const nonCardOptions = accountOptions.filter((o) => accounts.find((a) => a.id === o.value)?.kind !== 'credit');
  // A spending row put on a credit card that has already missed its due date
  // (shared statement rule) is flagged in the preview before it is imported.
  const importToday = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  })();
  const overdueOnCard = (accountId: string | undefined, date: string | undefined, isIncome: boolean): string | null => {
    if (!accountId || !date || isIncome) return null;
    const card = accounts.find((a) => a.id === accountId);
    return card ? chargeOverdueSince(card, date, importToday) : null;
  };

  // ---- Review presentation (status chips, filter, phone folding) -------
  // Derived from the same isIncluded / isDup / incomplete / overdueOnCard as
  // the import itself; nothing here feeds the payload.
  const needsChoice = (r: PreviewRow, acc = accOverride, cat = catOverride) =>
    isIncluded(r) && (!acc[r.idx] || !cat[r.idx]);
  const rowStatus = (r: PreviewRow): RowStatus => {
    if (r.problem) return 'bad';
    // Unticked: a likely duplicate says so (it starts unticked for that
    // reason); anything else was simply left out.
    if (!isIncluded(r)) return isDup(r) ? 'dup' : 'skipped';
    if (overdueOnCard(accOverride[r.idx], r.date as string, (r.cents ?? 0) > 0)) return 'overdue';
    const noAcc = !accOverride[r.idx];
    const noCat = !catOverride[r.idx];
    return noAcc && noCat ? 'needsBoth' : noAcc ? 'needsAccount' : noCat ? 'needsCategory' : 'ready';
  };
  const matchesFilter = (f: ReviewFilter, r: PreviewRow) =>
    f === 'needs' ? needsChoice(r) : f === 'dups' ? isDup(r) : f === 'bad' ? r.problem : true;
  const filterCounts: Record<ReviewFilter, number> = {
    all: rows.length,
    needs: incomplete.length,
    dups: rows.filter(isDup).length,
    bad: rows.filter((r) => r.problem).length,
  };
  const chooseFilter = (f: ReviewFilter) => {
    setFilter(f);
    setFilterRows(f === 'all' ? null : new Set(rows.filter((r) => matchesFilter(f, r)).map((r) => r.idx)));
  };
  // Rows matched when the filter was chosen stay, and rows that start to match
  // since (a new duplicate once an account is picked) join, so the list never
  // disagrees with the live count on the pill. Display only.
  const visibleRows = filterRows ? rows.filter((r) => filterRows.has(r.idx) || matchesFilter(filter, r)) : rows;
  const seedOpen = (acc: Record<number, string>, cat: Record<number, string>) => {
    setOpenSeed(new Set(rows.filter((r) => needsChoice(r, acc, cat)).map((r) => r.idx)));
    setOpenOverride({});
  };
  const isOpen = (r: PreviewRow) => openOverride[r.idx] ?? openSeed.has(r.idx);
  const goReview = () => {
    setFilter('all');
    setFilterRows(null);
    seedOpen(accOverride, catOverride);
    setStep('preview');
  };

  // The next maps are built here rather than in updater functions so the
  // phone's folding can be re-seeded from them in the same event; what each
  // row receives is unchanged (readable rows only; categories by kind).
  const setAll = (kind: 'account' | 'expense' | 'income', value: string) => {
    if (!value) return;
    let nextAcc = accOverride;
    let nextCat = catOverride;
    if (kind === 'account') {
      nextAcc = { ...accOverride };
      rows.forEach((r) => { if (!r.problem) nextAcc[r.idx] = value; });
      setAccOverride(nextAcc);
    } else {
      nextCat = { ...catOverride };
      rows.forEach((r) => {
        if (r.problem) return;
        const income = (r.cents ?? 0) > 0;
        if ((kind === 'income') === income) nextCat[r.idx] = value;
      });
      setCatOverride(nextCat);
    }
    seedOpen(nextAcc, nextCat);
  };

  const doImport = async () => {
    if (saving || !canImport) return;
    setSaving(true);
    setError(null);
    const payload = selected.map((r) => ({
      date: r.date as string,
      description: composeDescription((titleOverride[r.idx] ?? r.description).trim().slice(0, 200), (descOverride[r.idx] ?? '').trim().slice(0, 500)),
      amount: Math.abs(r.cents as number) / 100,
      kind: ((r.cents as number) > 0 ? 'income' : 'expense') as 'income' | 'expense',
      category: catOverride[r.idx],
      accountId: accOverride[r.idx],
      tag: (r.cents as number) < 0 ? (tagOverride[r.idx] ?? '').trim().slice(0, 50) : '',
    }));
    const result = await callAction(() => importTransactionsAction({ rows: payload }));
    setSaving(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); return; }
    setDone(payload.length);
  };

  // The ticked rows for the If imported pane, with the same description and
  // tag the import itself would send.
  const previewPending = selected.map((r) => ({
    idx: r.idx,
    date: r.date as string,
    cents: r.cents as number,
    accountId: accOverride[r.idx] || undefined,
    category: catOverride[r.idx] ?? '',
    description: composeDescription((titleOverride[r.idx] ?? r.description).trim().slice(0, 200), (descOverride[r.idx] ?? '').trim().slice(0, 500)),
    tag: (r.cents as number) < 0 ? (tagOverride[r.idx] ?? '').trim().slice(0, 50) : '',
  }));

  // Columns step: the first rows as currently read, and the file's own rows
  // with the mapped columns marked.
  const rawCell = (r: string[] | undefined, col: string) => (col === '' || !r ? '' : (r[Number(col)] ?? ''));
  const readRows: ReadRow[] = rows.slice(0, 3).map((r) => {
    const raw = dataRows[r.idx];
    const rawAmount = amountMode === 'single'
      ? rawCell(raw, amountCol)
      : (rawCell(raw, debitCol).trim() || rawCell(raw, creditCol));
    // A readable date on a row that still cannot be read means the amount is
    // what failed (split columns compute a number even then).
    const amountBad = r.cents === null || r.cents === 0 || (r.problem && r.date !== null);
    return { idx: r.idx, date: r.date, rawDate: rawCell(raw, dateCol), description: r.description, cents: amountBad ? null : r.cents, rawAmount };
  });
  const colWidth = afterSkip.reduce((m, r) => Math.max(m, r.length), 0);
  const roles: Partial<Record<number, ColumnRole>> = {};
  const mark = (col: string, role: ColumnRole) => { if (col !== '' && roles[Number(col)] === undefined) roles[Number(col)] = role; };
  mark(dateCol, 'date');
  mark(descCol, 'desc');
  if (amountMode === 'single') mark(amountCol, 'amount');
  else { mark(debitCol, 'debit'); mark(creditCol, 'credit'); }
  const headerRow = hasHeader ? (afterSkip[0] ?? null) : namesAbove;

  // PC: the If imported pane appears only at the Preview step, and goes away
  // once the import has finished.
  const showPreview = split && step === 'preview' && done === null;

  // A file dropped anywhere but the drop zone - the dialog head, a later step,
  // the backdrop - would make the browser open the CSV in place of the app and
  // lose the import. While the dialog is open such drops are swallowed; the
  // drop zone reads its own drop first (and stops it there).
  useEffect(() => {
    const isFileDrag = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const guard = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      // The drop zone handles its own drag and shows "copy"; leave it be.
      if (e.target instanceof Element && e.target.closest('.pb-tdlg-file')) return;
      e.preventDefault();
      // Elsewhere the cursor says nothing will happen, and nothing does.
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    };
    window.addEventListener('dragover', guard);
    window.addEventListener('drop', guard);
    return () => {
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
    };
  }, []);

  const select = (value: string, onChange: (v: string) => void, options: { value: string; label: string }[]) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={fieldStyle}>
      <option value="">{d.importCsv.none}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <ModalFrame
      onClose={onClose} busy={saving} labelledBy="pb-import-title"
      maxWidth={showPreview ? 1240 : 640}
      cardClassName={split ? `pb-import-split${showPreview ? ' pb-import-open' : ''}` : undefined}
    >
      {(close) => (
        <ImportLayout split={split} side={showPreview && preview ? <ImportPreviewPane preview={preview} pending={previewPending} /> : null}>
          {saving && <LoadingOverlay label={d.importCsv.importing} />}
          <div className="pb-modal-head">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 id="pb-import-title" className="font-display" style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>{d.importCsv.title}</h2>
              <ModalCloseButton onClick={close} disabled={saving} />
            </div>
            <ImportStepper step={step === 'file' ? 0 : step === 'map' ? 1 : 2} complete={done !== null} />
          </div>

          {done !== null ? (
            <div className="pb-modal-body">
              <SaveSuccess title={d.importCsv.done} body={t(d.importCsv.doneBody, { count: done })} onDone={close} />
            </div>
          ) : step === 'file' ? (
            <div key={step} className="pb-modal-body themed-scroll" style={{ overflowX: 'hidden' }}>
              {loading ? <LoadingBlock label={d.common.loading} minHeight={160} /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                  <DropZone onFile={(f) => void onFile(f)} />
                  {fileError && <p role="status" style={{ fontSize: '0.8rem', color: 'var(--wine)', margin: 0 }}>{fileError}</p>}
                  {loadError && <ActionError message={loadError} onRetry={() => { if (fileRef.current) void onFile(fileRef.current); }} />}
                </div>
              )}
            </div>
          ) : step === 'map' ? (
            <>
              <div key={step} className="pb-modal-body themed-scroll" style={{ overflowX: 'hidden' }}>
                <div className="pb-tdlg-map">
                  <fieldset className="pb-tdlg-group">
                    <legend className="pb-tdlg-label">{x.tableStarts}</legend>
                    <div style={twoCol}>
                      <label style={labelStyle}>{d.importCsv.skipRows}
                        <input type="text" inputMode="numeric" value={skipText} onChange={(e) => changeSkip(e.target.value)} onBlur={() => setSkipText(String(skip))} className="font-mono-tab" style={fieldStyle} />
                      </label>
                      <label className="pb-tdlg-check">
                        <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
                        {d.importCsv.hasHeader}
                      </label>
                    </div>
                    <p className="pb-tdlg-hint">{d.importCsv.skipHint}</p>
                  </fieldset>
                  <fieldset className="pb-tdlg-group">
                    <legend className="pb-tdlg-label">{x.columnsGroup}</legend>
                    <div style={twoCol}>
                      <label style={labelStyle}>{d.importCsv.dateCol}{select(dateCol, setDateCol, colOptions)}</label>
                      <label style={labelStyle}>{d.importCsv.dateFormat}
                        <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)} style={fieldStyle}>
                          <option value="ymd">YYYY-MM-DD</option>
                          <option value="mdy">MM/DD/YYYY</option>
                          <option value="dmy">DD/MM/YYYY</option>
                        </select>
                      </label>
                      <label style={labelStyle}>{d.importCsv.descCol}{select(descCol, setDescCol, colOptions)}</label>
                      <label style={labelStyle}>{d.importCsv.amountLayout}
                        <select value={amountMode} onChange={(e) => setAmountMode(e.target.value as AmountMode)} style={fieldStyle}>
                          <option value="single">{d.importCsv.amountSingle}</option>
                          <option value="split">{d.importCsv.amountSplit}</option>
                        </select>
                      </label>
                      {amountMode === 'single' ? (
                        <>
                          <label style={labelStyle}>{d.importCsv.amountCol}{select(amountCol, setAmountCol, colOptions)}</label>
                          <label className="pb-tdlg-check">
                            <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} />
                            {d.importCsv.flipSigns}
                          </label>
                        </>
                      ) : (
                        <>
                          <label style={labelStyle}>{d.importCsv.debitCol}{select(debitCol, setDebitCol, colOptions)}</label>
                          <label style={labelStyle}>{d.importCsv.creditCol}{select(creditCol, setCreditCol, colOptions)}</label>
                        </>
                      )}
                    </div>
                    <p className="pb-tdlg-hint">{d.importCsv.pickLater}</p>
                    {truncated && <p className="pb-tdlg-hint">{d.importCsv.truncated}</p>}
                  </fieldset>
                  <ColumnPreview
                    readRows={readRows}
                    rawRows={dataRows.slice(0, 3)}
                    headerRow={headerRow}
                    width={colWidth}
                    roles={roles}
                  />
                </div>
              </div>
              <div className="pb-modal-foot">
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="pill" onClick={() => setStep('file')} style={{ flex: 1, padding: '0.65rem' }}>{d.importCsv.back}</button>
                  <button type="button" className="btn-primary" disabled={!mappingOk} onClick={goReview} style={{ flex: 1.4, padding: '0.65rem', opacity: mappingOk ? 1 : 0.6 }}>{d.importCsv.next}</button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div key={step} className="pb-modal-body themed-scroll" style={{ overflowX: 'hidden' }}>
                {rows.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', textAlign: 'center', padding: '1.5rem 0', margin: 0 }}>{d.importCsv.noRows}</p>
                ) : (
                  <>
                    <div style={{ ...twoCol, marginBottom: '0.8rem' }}>
                      <select value="" onChange={(e) => setAll('account', e.target.value)} aria-label={d.importCsv.setAllAccounts} style={smallField}>
                        <option value="">{d.importCsv.setAllAccounts}</option>
                        {nonCardOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <select value="" onChange={(e) => setAll('expense', e.target.value)} aria-label={d.importCsv.setAllSpending} style={smallField}>
                        <option value="">{d.importCsv.setAllSpending}</option>
                        {categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                      <select value="" onChange={(e) => setAll('income', e.target.value)} aria-label={d.importCsv.setAllIncome} style={smallField}>
                        <option value="">{d.importCsv.setAllIncome}</option>
                        {INCOME_CATEGORIES.map((c) => <option key={c} value={c}>{d.enums.incomeCategory[c]}</option>)}
                      </select>
                    </div>
                    <ReviewFilterBar value={filter} counts={filterCounts} onChange={chooseFilter} />
                    {visibleRows.length === 0 && (
                      <div className="pb-tdlg-filter-empty">
                        <p>{x.filterEmpty}</p>
                        <button type="button" className="link-btn" onClick={() => chooseFilter('all')}>{x.filterShowAll}</button>
                      </div>
                    )}
                    <ul className={`pb-tdlg-review${narrow ? ' pb-tdlg-review-compact' : ''}`}>
                      {visibleRows.map((r) => {
                        const on = isIncluded(r);
                        const income = (r.cents ?? 0) > 0;
                        const dup = isDup(r);
                        const overdue = r.problem ? null : overdueOnCard(accOverride[r.idx], r.date as string, income);
                        const status = rowStatus(r);
                        const open = !narrow || isOpen(r);
                        const panelId = `pb-import-row-${r.idx}`;
                        // The label only widens the box's hit area on touch.
                        const checkbox = (
                          <label className="pb-tdlg-review-hit">
                            <input
                              type="checkbox" checked={on} disabled={r.problem} className="pb-tdlg-review-check"
                              onChange={(e) => setIncludeOverride((m) => ({ ...m, [r.idx]: e.target.checked }))}
                              aria-label={r.description || String(r.idx + 1)}
                            />
                          </label>
                        );
                        const titleInput = (
                          <input
                            type="text" value={titleOverride[r.idx] ?? r.description} maxLength={200}
                            onChange={(e) => setTitleOverride((m) => ({ ...m, [r.idx]: e.target.value }))}
                            placeholder={d.importCsv.titlePlaceholder} aria-label={d.importCsv.titlePlaceholder}
                            style={{ ...smallField, fontSize: '0.86rem', height: '2.1rem', marginBottom: '0.2rem' }}
                          />
                        );
                        // The chip beside it already names an unreadable row
                        // ("Can't read this row") and an unticked duplicate, so
                        // the line does not say it twice. A duplicate ticked
                        // back in shows Ready, so the line still flags it.
                        const metaLine = !r.problem && (
                          <span className="pb-tdlg-review-meta pb-tnum" style={{ color: dup || overdue ? 'var(--wine)' : 'var(--ink-soft)' }}>
                            {`${formatDate(r.date as string, locale)}${dup && status !== 'dup' ? ` · ${d.importCsv.dup}` : ''}${r.shifted ? ` · ${d.importCsv.shifted}` : ''}`}
                            {overdue && (
                              <>{' · '}{d.importCsv.cardOverdue.replace('{date}', formatDate(overdue, locale))}</>
                            )}
                          </span>
                        );
                        const amount = !r.problem && (
                          <span className="font-mono-tab pb-tdlg-review-amount" style={{ color: income ? 'var(--pine)' : 'var(--wine)' }}>
                            {income ? '+' : '−'}{formatCurrency(Math.abs(r.cents as number) / 100)}
                          </span>
                        );
                        const controls = !r.problem && (
                          <>
                            <div style={twoCol}>
                              <select
                                value={accOverride[r.idx] ?? ''}
                                onChange={(e) => setAccOverride((m) => ({ ...m, [r.idx]: e.target.value }))}
                                aria-label={d.importCsv.account} style={smallField}
                              >
                                <option value="">{d.importCsv.chooseAccount}</option>
                                {(income ? nonCardOptions : accountOptions).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                              <select
                                value={catOverride[r.idx] ?? ''}
                                onChange={(e) => setCatOverride((m) => ({ ...m, [r.idx]: e.target.value }))}
                                aria-label={d.importCsv.spendingCategory} style={smallField}
                              >
                                <option value="">{d.importCsv.chooseCategory}</option>
                                {income
                                  ? INCOME_CATEGORIES.map((c) => <option key={c} value={c}>{d.enums.incomeCategory[c]}</option>)
                                  : categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                              </select>
                              {!income && (
                                <input
                                  type="text" value={tagOverride[r.idx] ?? ''} maxLength={50}
                                  onChange={(e) => setTagOverride((m) => ({ ...m, [r.idx]: e.target.value }))}
                                  placeholder={d.importCsv.tagPlaceholder} aria-label={d.importCsv.tagPlaceholder}
                                  style={smallField}
                                />
                              )}
                            </div>
                            <div className="pb-tdlg-review-desc">
                              {descOpen[r.idx] ? (
                                <input
                                  type="text" value={descOverride[r.idx] ?? ''} maxLength={500} autoFocus
                                  onChange={(e) => setDescOverride((m) => ({ ...m, [r.idx]: e.target.value }))}
                                  placeholder={d.importCsv.descPlaceholder} aria-label={d.importCsv.descPlaceholder}
                                  style={smallField}
                                />
                              ) : (
                                <button
                                  type="button" onClick={() => setDescOpen((m) => ({ ...m, [r.idx]: true }))}
                                  className="pb-tdlg-review-add"
                                >
                                  + {d.importCsv.descAdd}
                                </button>
                              )}
                            </div>
                          </>
                        );

                        if (!narrow) {
                          return (
                            <li key={r.idx} className="pb-tdlg-review-row" style={{ opacity: r.problem ? 0.6 : 1 }}>
                              <div className="pb-tdlg-review-top">
                                {checkbox}
                                <span style={{ flex: 1, minWidth: 0 }}>
                                  {r.problem ? (
                                    <span className="pb-tdlg-review-title">{r.description || '—'}</span>
                                  ) : titleInput}
                                  <span className="pb-tdlg-review-line">
                                    <StatusChip status={status} />
                                    {metaLine}
                                  </span>
                                </span>
                                <span className="pb-tdlg-review-end">{amount}</span>
                              </div>
                              {controls && <div className="pb-tdlg-review-body">{controls}</div>}
                            </li>
                          );
                        }

                        // Phone: one line - tick, title and date, amount and
                        // status - that unfolds to the title field and choices.
                        return (
                          <li key={r.idx} className="pb-tdlg-review-row" style={{ opacity: r.problem ? 0.6 : 1 }}>
                            <div className="pb-tdlg-review-top">
                              {checkbox}
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span className="pb-tdlg-review-title">{(titleOverride[r.idx] ?? r.description) || '—'}</span>
                                {/* The chip sits under the title, beside the
                                    date, so the title keeps the row's width. */}
                                <span className="pb-tdlg-review-line">
                                  <StatusChip status={status} compact />
                                  {metaLine}
                                </span>
                              </span>
                              <span className="pb-tdlg-review-end">
                                {amount}
                              </span>
                              {r.problem ? <span className="pb-tdlg-review-toggle" aria-hidden="true" /> : (
                                <button
                                  type="button" className="pb-tdlg-review-toggle"
                                  aria-expanded={open} aria-controls={panelId}
                                  aria-label={open ? x.hideDetails : x.showDetails}
                                  onClick={() => setOpenOverride((m) => ({ ...m, [r.idx]: !open }))}
                                >
                                  <ChevronDown size={18} aria-hidden="true" />
                                </button>
                              )}
                            </div>
                            {!r.problem && (
                              <div id={panelId} className={`collapsible-rows${open ? ' expanded' : ''}`} inert={!open}>
                                <div className="collapsible-rows-inner">
                                  <div className="pb-tdlg-review-body">
                                    {titleInput}
                                    {controls}
                                  </div>
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
              <div className="pb-modal-foot">
                {balanceCents !== null && <BalanceDelta beforeCents={balanceCents} afterCents={balanceCents + netCents} />}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.84rem' }}>
                  {balanceCents !== null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <span style={{ color: 'var(--ink-soft)' }}>{d.importCsv.beforeAmount}</span>
                      <span className="font-mono-tab">{formatCurrency(balanceCents / 100)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <span style={{ color: 'var(--ink-soft)' }}>{d.importCsv.importAmount}</span>
                    <span className="font-mono-tab" style={{ fontWeight: 600, color: netCents > 0 ? 'var(--pine)' : netCents < 0 ? 'var(--wine)' : 'var(--ink)' }}>
                      {netCents > 0 ? '+' : ''}{formatCurrency(netCents / 100)}
                    </span>
                  </div>
                  {balanceCents !== null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', borderTop: '1px solid var(--line)', paddingTop: '0.3rem' }}>
                      <span style={{ color: 'var(--ink-soft)' }}>{d.importCsv.afterAmount}</span>
                      <span className="font-mono-tab" style={{ fontWeight: 600 }}>{formatCurrency((balanceCents + netCents) / 100)}</span>
                    </div>
                  )}
                </div>
                <p role="status" style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', margin: 0 }}>
                  {t(d.importCsv.selected, { count: selected.length, total: rows.length })}
                  {incomplete.length > 0 && <span style={{ color: 'var(--wine)' }}>{' · '}{t(d.importCsv.needChoice, { count: incomplete.length })}</span>}
                </p>
                <ActionError message={error} kind={errorKind} onRetry={() => void doImport()} busy={saving} />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="pill" onClick={() => setStep('map')} disabled={saving} style={{ flex: 1, padding: '0.65rem' }}>{d.importCsv.back}</button>
                  <button type="button" className="btn-primary" disabled={saving || !canImport} onClick={() => void doImport()} style={{ flex: 1.4, padding: '0.65rem', opacity: saving || !canImport ? 0.6 : 1 }}>
                    {t(d.importCsv.importBtn, { count: selected.length })}
                  </button>
                </div>
              </div>
            </>
          )}
        </ImportLayout>
      )}
    </ModalFrame>
  );
}
