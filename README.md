# Pebble

**Personal budgeting, simplified.** A full-stack, multi-user budgeting app built with Next.js, TypeScript, and Postgres.

🔗 **Live:** [pebble-olive.vercel.app](https://pebble-olive.vercel.app)

Pebble tracks expenses, income, budgets, savings goals, and recurring payments, then turns three years of transaction history into readable analysis. It's bilingual (English / 中文), installable as a PWA, and every figure it shows is derived from a single source of truth rather than stored and re-stored.

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Getting started](#getting-started)
- [Database changes](#database-changes)
- [Project structure](#project-structure)
- [Design system](#design-system)
- [Internationalization](#internationalization)
- [Sounds](#sounds)
- [PWA](#pwa)
- [Deployment](#deployment)
- [Development notes](#development-notes)
- [Known limitations](#known-limitations)

---

## Features

Eight pages, all behind authentication, all scoped strictly to the signed-in user.

### Dashboard
Current balance derived live from opening balances plus every transaction. Income / Spending / Savings rate / Saved tiles with a period selector (30d, 90d, 6m, 12m, or a specific month, quarter, or year). Income-vs-spending area chart, category donut chart, budget attention list, recent activity. Every window is labelled, and a goal-overspend notice appears whenever allocated savings exceed the real balance.

### Transactions
A month-by-month statement with running Checking and Cash balances after each row, a 13-month navigator, and full add / edit / delete. Multi-line descriptions render as a title plus itemized detail. Single click opens a detail modal.

### Reports
Expenses and income viewed separately, grouped by month / quarter / year (year-qualified, so "August" means one specific August), optionally grouped by category, with four sort orders, description search, and a category multi-select. Every section carries a subtotal.

### Analysis
21 metrics across four groups, each with an info tooltip explaining exactly how it's calculated:

- **Income** — estimated annual income, average monthly income, effective deduction rate, income stability, deductions over time
- **Spending** — average monthly spend, top categories, biggest single expenses, top-3 concentration, month-by-month chart
- **Cash flow** — savings rate, average monthly net, runway, months of expenses covered, overspent months, fixed monthly commitments
- **Comparison & outlook** — year-over-year, flat and seasonally-adjusted year-end projections, budget pace, upcoming commitments

An analysis window is always a whole number of **complete** calendar months; the month in progress gets its own card rather than being silently mixed into averages.

### Budgets
Annual budgets per category with year-to-date progress, over/under indicators, and a bulk edit dialog that shows your estimated annual income alongside the total you're budgeting.

### Goals
Savings goals with progress bars, icon and colour pickers, and soft allocation against your real balance — `allocated` and `unallocated` are shown, and a warning fires when a transaction would eat into money you've set aside.

### Scheduled
Recurring rules — once, weekly, biweekly, monthly, yearly — with month-end clamping (a rule for the 31st fires Feb 28, then returns to the 31st), three end conditions (never / after N / on a date), pause and soft delete. Occurrences materialize on app load, not via cron.

### Settings
Text size, dark mode, language, timezone override, category manager (create / rename / recolour / delete with reassignment), opening or adjusting balances, per-event sound effects, and account details.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.3 (App Router, Turbopack, React 19) |
| Language | TypeScript, strict |
| Database | Neon Postgres (serverless) |
| ORM | Drizzle ORM via `@neondatabase/serverless` (neon-http driver) |
| Auth | Neon Managed Better Auth |
| Client state | Zustand (UI preferences only) |
| Charts | Recharts |
| Icons | lucide-react |
| Hosting | Vercel |

`shadcn/ui`, Tailwind, and their supporting packages are installed and configured, but Pebble's own interface uses a hand-built CSS-custom-property design system instead — see [Design system](#design-system).

---

## Architecture

Every page follows the same shape:

```
Server Component page.tsx
  export const dynamic = 'force-dynamic'
  ├─ getSessionUserIdOrRedirect()          ← session first
  ├─ await runRecurringCatchUp(userId)     ← then catch-up, BEFORE any reads
  ├─ src/lib/data/queries.ts               ← server-only, every query filters by userId
  ├─ src/lib/data/mappers.ts               ← DB row → app type
  └─ serializable props
        ↓
  PageClient.tsx ('use client')
    └─ src/lib/actions/pebble.ts ('use server')
         withSessionUser(handler)          ← session resolved server-side
         validate → write → revalidatePath(route, 'layout')
```

### Design rules the codebase depends on

**`withSessionUser` is structural, not conventional.** In `src/lib/actions/pebble.ts`, handlers are non-exported functions taking `userId` as their first parameter. Every one of the 23 exports at the bottom of the file is a `withSessionUser(...)` call. **No action accepts a `userId` from the client** — it's resolved from the session inside the wrapper, so an action physically cannot be written without a session check.

This matters because `src/proxy.ts` bypasses auth middleware for `Next-Action` requests (a Server Action POST expects an action response, not an HTML redirect). That makes `withSessionUser` the sole guard on every write path. An unwrapped export in that file would be an unauthenticated write endpoint. The reasoning is documented in full at the top of `proxy.ts`.

**Auth proves *who*; ownership is checked separately.** Actions that take a row id from the client run a `SELECT` scoped to `userId` before writing.

**Nothing derived is stored.** Current balances, per-transaction running balances, category spend, and goal progress are all computed on read. There is exactly one derivation of any figure, so two pages can't drift apart.

**Icons never cross the RSC boundary.** `LucideIcon` is a function and isn't serializable. The data layer emits `iconKey: string`; client components resolve it below the boundary.

**No SQL aggregates.** Drizzle's `mode: 'number'` converts `numeric` at the driver boundary, but that doesn't apply to computed SQL — `sum()` returns a string regardless. Rows are fetched and aggregated in memory.

**Recurring catch-up runs on page load, not on a schedule.** Neon bills wall-clock compute time with a 5-minute autosuspend, so a daily cron would wake the database whether or not anyone used the app. Catch-up runs only when the database is already awake, is idempotent (guarded by a `UNIQUE (recurring_rule_id, occurrence_date)` constraint), never throws, and advances a `materialized_through` high-water mark that no code path can write below — which is what structurally enforces "edits affect future occurrences only."

**Timezone is resolved, never assumed.** `getToday()` returns container-local time, which is UTC on Vercel. The browser writes its IANA zone to a `pebble-tz` cookie; a per-user override in `user_account.time_zone` takes precedence. When the zone is unknown, date-dependent features **skip rather than guess** — there is no UTC fallback anywhere.

---

## Data model

Nine tables, all foreign-keyed to `neon_auth.user` with `ON DELETE CASCADE`.

| Table | Purpose |
|---|---|
| `expense` | `amount` always ≤ 0 (CHECK-enforced) |
| `income` | `gross_amount` and `net_amount`; no `tag` column |
| `category` | Per-user taxonomy; `name` is the join key, `UNIQUE (user_id, name)` |
| `budget` | Annual budget per category, composite PK |
| `goal` | Savings goals; `icon_key` is a string, not a component |
| `user_account` | **Opening** balances, plus timezone override |
| `balance_adjustment` | Signed manual corrections; deliberately a separate table |
| `recurring_rule` | Rule templates with seven CHECK constraints enforcing shape |
| `neon_auth.user` | Managed by Neon Auth; read-only from the app |

### The money model

```
current_checking = checking_opening
                 + Σ(expense.amount            where payment_method = 'Checking')   [negative]
                 + Σ(income.net_amount         where payment_method = 'Checking')   [NET, never gross]
                 + Σ(balance_adjustment.amount where payment_method = 'Checking')

current_cash     = same with payment_method = 'Cash'
current_total    = current_checking + current_cash
```

`user_account` stores **opening** balances — the balance before any recorded transaction — so balance and transaction history can never silently drift apart. Income contributes `net_amount`; `gross_amount` exists only for the deduction calculation.

### Two rules that are easy to get wrong

**Side Cash** (`'Side Cash'` vs `'Standard Income'` — string literals in code, not category rows) counts toward balance and appears in Reports, but is excluded from the Income tile, savings rate, income-vs-spending trend, and annual income estimate. It's real money, but it isn't earnings.

**Balance adjustments** sit deliberately *outside* the `Transaction` union. Reports classifies with a catch-all (`isExpense(t) ? … : income`), so anything non-expense added to that union would land in the income branch. A separate table can't reach Reports at all, because it's never in the array Reports receives.

`user_id` has **no default** on any table. An insert that omits it fails loudly rather than silently misattributing financial data.

---

## Getting started

### Prerequisites
- Node.js 20+
- A [Neon](https://neon.tech) account (free tier is fine)

### 1. Clone and install
```bash
git clone <your-repo-url> pebble
cd pebble
npm install
```

### 2. Create a Neon project
In the [Neon Console](https://console.neon.tech), create a project, then enable **Managed Better Auth** on it (Auth → Enable). This provisions the `neon_auth` schema alongside your app tables.

### 3. Create the application schema
Pebble's tables are **not** created by an ORM migration — see [Database changes](#database-changes). Run the DDL by hand in the Neon SQL Editor, matching `src/db/schema.ts`. Every table needs:
- `user_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE`
- no default on `user_id`
- the CHECK constraints declared in `schema.ts`

### 4. Environment variables
Create `.env.local` in the project root:

```env
DATABASE_URL="postgresql://...-pooler.<region>.aws.neon.tech/<db>?sslmode=require"
NEON_AUTH_BASE_URL="https://ep-<id>.neonauth.<region>.aws.neon.tech/neondb/auth"
NEON_AUTH_COOKIE_SECRET="<openssl rand -base64 32>"
```

- Use the **pooled** connection string (`-pooler` in the hostname) — correct for serverless.
- `NEON_AUTH_BASE_URL` is Neon's hosted auth endpoint, **not** your app's URL. It's identical in local and production.
- `.env.local` is git-ignored. Never commit it — `DATABASE_URL` contains a plaintext database password.

### 5. Run
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) and sign up.

> ⚠️ **Use Chrome or Firefox locally.** Neon Auth issues `__Secure-` prefixed session cookies. Chrome and Firefox treat `http://localhost` as a secure context; **Safari does not**, so it silently discards the cookie and sign-in loops forever. Production over real HTTPS is unaffected.

### Scripts
```bash
npm run dev      # dev server
npm run build    # production build
npm run start    # serve the production build
npm run lint     # eslint
npm run sounds   # regenerate src/lib/sound/manifest.ts from public/sounds/
```

---

## Database changes

**Migrations are hand-written SQL, reviewed, and run manually in the Neon SQL Editor.** `src/db/schema.ts` is then updated by hand to match.

`drizzle-kit push` and `drizzle-kit generate` are **never** run against this project. `drizzle-kit pull` (read-only introspection) is used to verify the checked-in schema against the live database, but its output is never committed directly — every pull needs the same four manual fixes, listed at the top of `schema.ts`:

1. `.default(')` → `.default('')` — six sites where Postgres `DEFAULT ''` renders as an unterminated string literal
2. `mode: 'number'` re-applied to every `numeric(12,2)` column, or money silently becomes strings
3. `user_id` index opclass renders as `date_ops`; correct value is `uuid_ops`
4. All nine `neon_auth` tables are re-emitted; only `user` is kept

Before any schema change against real data: **create a Neon branch** as a point-in-time backup. It takes seconds.

> The Neon SQL Editor has been observed to **silently fail** on large pastes — no error, no rows affected. For anything sizeable, use `psql`:
> ```bash
> set -a && source .env.local && set +a
> "$(brew --prefix libpq)/bin/psql" "$DATABASE_URL" -v ON_ERROR_STOP=1 -f file.sql
> ```

---

## Project structure

```
src/
├── app/
│   ├── layout.tsx              fonts, auth provider, pre-paint theme + lang script
│   ├── (app)/
│   │   ├── layout.tsx          locale + timezone providers, AppShell
│   │   ├── loading.tsx         Suspense fallback for the whole group
│   │   ├── error.tsx           error boundary (re-throws NEXT_REDIRECT)
│   │   └── dashboard | transactions | reports | analysis
│   │       | budgets | goals | scheduled | settings
│   ├── auth/[path]  account/[path]     Neon Auth views, rendered outside AppShell
│   └── api/auth/[...path]/route.ts
├── components/
│   ├── layout/     AppShell, Sidebar, BottomNav, Header, nav
│   ├── shared/     TransactionRow, StatementRow, SearchableSelect, InfoTooltip,
│   │               Spinner, ActionError, Switch, StatTab, …
│   ├── modals/     AddTransaction, TransactionDetail, Goal, ModifyBudget, RecurringRule
│   ├── dashboard | analysis | reports | budgets | goals | transactions | settings
│   └── ui/         shadcn primitives (largely unused)
├── lib/
│   ├── actions/    pebble.ts (23 actions), withSessionUser, callAction, failureKind, errorCodes
│   ├── data/       queries (server-only), mappers, icons, categoryMeta
│   ├── analysis/   windows, months, spending, cashflow, income, projection, upcoming, …
│   ├── recurring/  occurrences (pure, dependency-free), catchUp
│   ├── i18n/       en, zh, dictionary plumbing, LocaleProvider, serverLocale
│   ├── time/       timeZone, serverTimeZone, TimeZoneOverrideContext
│   ├── sound/      manifest (generated), events, play, useSound
│   ├── auth/       server, client, getSessionUser, useCurrentUser
│   └── format.ts   stats.ts   ids.ts
├── db/             schema.ts (hand-maintained), index.ts
├── store/          usePebbleStore.ts, storageKeys.ts
├── types/          index.ts
├── data/           seed.ts (category defaults, icon/colour palettes, constants)
└── proxy.ts        route protection (Next 16 renamed middleware.ts → proxy.ts)
```

Roughly 17,000 lines of TypeScript across ~140 files.

---

## Design system

Pebble uses a hand-built design system on CSS custom properties, scoped under `.pebble-root`. Not Tailwind utilities.

**Concept:** a warm "ledger" aesthetic — sage-paper backgrounds, deep pine green as the brand and positive colour, honey-gold as a secondary accent, and muted wine-red reserved specifically for negative and over-budget states.

| Token | Light | Dark |
|---|---|---|
| `--paper` (page) | `#F1F3EE` | `#121C18` |
| `--mist` (card) | `#FFFFFF` | `#1A2621` |
| `--ink` / `--ink-soft` | `#17241F` / `#5B6660` | `#ECEFEA` / `#8FA097` |
| `--pine` (brand, positive) | `#1F5A45` | `#57A487` |
| `--gold` (accent) | `#AD7B2E` | `#DFA657` |
| `--wine` (negative) | `#8C3D42` | `#D48A8F` |
| `--line` (borders) | `#E1E4DD` | `#2A3830` |

**Typography:** Fraunces for headings and hero figures, Work Sans for UI text, and IBM Plex Mono with tabular numerals for **every** dollar amount, date, and percentage — a deliberate "money is monospace" rule. A `--cjk` fallback stack is threaded into all three so Chinese text renders in a proper system CJK face while Latin digits still resolve to IBM Plex Mono.

**Dark mode** is animated by transitioning the custom properties themselves, registered via `@property` as typed `<color>` values. Safari doesn't reliably animate colours that depend on a custom property changing higher in the tree, and this works around it. A pre-paint inline script sets the theme class before React hydrates, so there's no flash.

Two details worth knowing if you're editing:

- **The theme class on `<html>` is `pebble-dark`, not `dark`.** `dark` is the standard class for next-themes, shadcn, and Tailwind, and a third-party provider setting it was overriding the user's stored choice. Selectors reaching above the component root use the namespaced class.
- **Portals must render into `.pebble-root`, never `document.body`.** Every rule in `globals.css` — including the theme custom properties — is scoped under `.pebble-root`, so a body portal comes out transparent and unstyled.

---

## Internationalization

English and Chinese, via a typed dictionary pair in `src/lib/i18n/`. `zh` is typed as `typeof en`, so **a missing translation key is a compile error**, not a blank label in production.

The locale lives in the Zustand store and is mirrored into a `pebble-lang` cookie, which `(app)/layout.tsx` reads server-side and threads through a `LocaleProvider`. That's what eliminates the language flash — the server emits the correct language from the first byte, rather than English being painted and corrected after hydration.

**Language affects display only.** Every value written to, read from, or compared in Postgres stays canonical in both locales — `'Checking'` / `'Cash'`, `'Standard Income'` / `'Side Cash'`, `'expense'` / `'income'`, the frequency, end-mode and status enums, icon keys, category names (user data), and every `YYYY-MM-DD` date. A `<select>` may show 银行账户 while its `value` remains `Checking`. Currency also stays pinned to `en-US` — these are real US dollars, and showing ¥ would misrepresent them.

---

## Sounds

Optional per-event sound feedback: expense saved, income saved, save failed, click, goal reached. **Every event ships set to "No sound"** — nothing plays until it's chosen in Settings.

Drop audio files in `public/sounds/`, then:
```bash
npm run sounds
```
That regenerates `src/lib/sound/manifest.ts`, which is what the Settings dropdowns read. Files are **not** discovered at runtime — `public/` is CDN-served in production and isn't reliably readable from server code, so the list is baked in at build time. See `public/sounds/README.md` for naming, format, and sourcing notes.

Playback fails silently on a missing file, and save sounds fire only after a successful write.

---

## PWA

Installable on iOS and Android via `public/manifest.json` — standalone display, `#1F5A45` theme colour, `/dashboard` start URL, with standard, maskable, and Apple touch icons.

**Deliberately no service worker.** Every `(app)` page is `force-dynamic` and database-backed, so there is no meaningful data to render offline. A service worker's only benefit here would be a nicer offline error page, against a permanent risk of stale or cross-session cached data and a shell that could defeat sign-out. Manifest plus icons delivers installability on both platforms without it.

---

## Deployment

Deployed on Vercel, auto-deploying from `main`.

1. Import the repo into Vercel
2. Add `DATABASE_URL`, `NEON_AUTH_BASE_URL`, and `NEON_AUTH_COOKIE_SECRET` as environment variables
3. Register the production domain in **Neon Console → Auth → Configuration → Domains**, or sign-in fails with an `invalid origin` error

**Preview deployments:** Vercel mints a new URL per push, and those aren't trusted domains, so auth doesn't work on previews. Neon supports wildcard trusted domains if you need them, but `https://*.vercel.app` is very broad.

**Before going fully live:** disable Neon's **Allow Localhost** setting (Settings → Auth), per Neon's own production checklist.

---

## Development notes

Things that will cost you time if you don't know them.

**Always run `npx tsc --noEmit` bare.** Passing a filename bypasses `tsconfig.json` — including `skipLibCheck` — and produces ~70 bogus errors from drizzle-orm's other SQL dialects.

**`npm run build` is the arbiter for `'use server'` questions**, not `tsc`.

**`neon-http` cannot hold an interactive transaction.** `transaction()` exists in the types but throws at runtime — it's a stateless HTTP driver. Use `batch()`, which runs its statements in one transaction.

**`recurringRule` must stay declared above `expense` in `schema.ts`.** The `(table) => [...]` extras callback executes at `pgTable()` call time, so a `foreignKey` pointing at a `const` declared later is a TDZ crash on import — and `tsc` passes.

**A ref-based liveness flag must be re-armed on mount.** `useRef(true)` with a cleanup-only effect is permanently cleared by Strict Mode's dev double-invoke, because refs survive remounts. This caused a real, silent infinite spinner once.

**Hydration:** initial `useState` values stay static and date-free; a mount effect applies stored preferences and date-based defaults. Reading the clock or the store during render causes mismatches — most visibly at year boundaries.

**The Zustand store's `partialize` lists fields explicitly.** A field omitted there silently fails to persist, with no error. Adding a preference means updating four places: the interface, initial state, the setter, and `partialize`. The storage key lives in `src/store/storageKeys.ts` and is imported by both the store and the pre-paint script — keep them in sync there rather than hardcoding.

**`getCategories()` writes on read.** It lazily seeds default categories for a user who has none, which also backfills accounts created before categories existed. Safe only because every `(app)` page is `force-dynamic` — any new page must be too.

**Two transaction ID formats coexist** — imported (`YYYYMMDD_NNNNNNNNN`) and app-generated (`YYYYMMDDHHMMSSmmm-rrrr`). They share the first eight date digits, so a naive `localeCompare` decides at position 9, where `_` (0x5F) sorts above any digit. `compareSameDayIds()` in `stats.ts` handles it. Don't introduce a third format.

**Leaving `next dev` running wakes the Neon compute on every hot reload** — a billing consideration, not a correctness one.

---

## Known limitations

- **No automated test suite.** Verification has been manual, plus `tsc` and `npm run build` gates.
- **No error tracking.** Sentry was scoped and deliberately deferred; a production failure is currently invisible unless witnessed.
- **`getToday()` returns UTC on Vercel.** All current callers are client-side and `src/lib/analysis/` is entirely clock-free (`today` is always a parameter), so this is contained — but don't add server-side callers.
- **`proxy.ts`'s matcher omits `/analysis` and `/scheduled`.** Both pages call `getSessionUserIdOrRedirect()` themselves, so they do redirect when signed out, but they lack the middleware layer the other six routes have. Worth adding.
- **Timezone search matches IANA zone names only** — typing "Beijing" returns nothing; the correct entry is `Asia/Shanghai`. No city-alias table.
- **Dashboard and Analysis use deliberately different windows.** Dashboard's "Last 12 months" includes the month in progress; Analysis's "Last 12 complete months" doesn't. Both are labelled. This is intentional — they answer different questions, and forcing them to match caused real problems.
- **Recurring occurrences appear late** if the app isn't opened, since catch-up runs on page load rather than on a schedule. An accepted trade for not waking the database daily.
- **No offline support**, by design — see [PWA](#pwa).
- **Four near-identical restore/persist blocks** exist across client components. Extraction into a shared hook was evaluated and deferred as more regression risk than benefit.

---
