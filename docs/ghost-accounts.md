# Ghost accounts

Ghost mode is an independent account flag, available for cash and bank accounts, including
seeded accounts. Credit cards cannot enable it. Credit cards that were already
in ghost mode can still use **Include again** to return to normal finances. It does not hibernate, pause, settle or
delete an account. Existing active schedules continue posting to their account.

Enable it from the account controls in Settings or the Accounts page. The
confirmation explains the full-history effect. Ghost accounts live in their
own visually marked section and keep their individual balance and ledger.
Turning ghost mode off includes the account and its history again. Enabling
it clears its preferred-account status; restoring it does not silently make
it preferred again.

Normal balances, income/spending, savings, reports/exports, charts, budgets,
recommendations, forecasts, goal funding capacity, search and category quick
picks exclude ghost accounts. Budgets and existing goal allocations are not
erased; review allocations if excluding funds leaves them over-allocated.

Transactions and Scheduled have a **Show ghost accounts** checkbox, off by
default. It reveals separate ghost history or schedule controls without
combining ghost money into the normal totals or charts. New transaction,
recurrence, import and transfer forms require explicit ghost-account opt-in.
Editing an existing ghost record preserves its account. Hibernated accounts
retain their existing restrictions independently of this flag.

A transfer across the boundary changes the included account's balance while
the ghost account keeps the other leg. It is not income or spending. Credit
payoff retains Pebble's existing record-move behavior: moving charges from a
ghost card to a normal account includes those original expenses in normal
history, as the payoff dialog explains.

## Deployment and invariants

`account.is_ghost` is stored server-side, defaults to false, and is independent
of account status. User-scoped queries exclude ghost rows by default; the few
management/history paths explicitly request `includeGhost: true`. Recurring
catch-up deliberately does not filter ghost rules. Per-account balance maps
retain account-local figures; combined totals exclude ghost IDs defensively.

Before a production build, `scripts/migrate-ghost-accounts.mjs` applies only
`migrations/20261117_ghost_accounts.sql`. This additive migration runs in one
bounded transaction, leaves ledgers intact and enforces that ghosts cannot be
preferred. It is idempotent. A migration failure stops the new build while the
previous deployment continues serving. Local builds with dummy credentials
may set `PEBBLE_SKIP_MIGRATIONS=1`; Vercel builds refuse that bypass.

Run `scripts/test-ghost-accounts-db.sh` for isolated PostgreSQL integration
checks. No production credentials or data are used by that test.
