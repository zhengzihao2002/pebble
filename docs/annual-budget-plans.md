# Annual budget planning

`/budgets/plan` always prepares the next calendar year. Open it from the desktop Budgets header or the mobile center + menu on either budget screen. The center button always opens its action menu. Each category requires an explicit choice: Suggested, the last six completed months’ average annualized, last twelve completed months’ spending, Keep same, a custom percentage, or an entered amount. The global starting-point control is removed. Drafts can save partial progress; before scheduling a reloaded draft, choose a basis or edit each category’s amount. Scheduled amounts remain editable until January 1; review and save updates the same scheduled plan using its current revision. Yearly plans contain fixed category amounts, not a percentage rule that repeats indefinitely. Drafts never affect live budgets. Scheduled plans take effect at midnight January 1 in the timezone shown on the plan. The budget page and planner refresh at that boundary and re-check on focus, reconnect, and return from the browser's back/forward cache.

## Production setup

The repository requires schema migrations to be reviewed SQL run manually in Neon's SQL Editor (see `src/db/schema.ts`). Run the entire `migrations/20261030_annual_budget_plans.sql` file against the app's database. It is transactional and rerunnable. It adds two tables, a revision sequence, and three atomic mutation functions; it does not replace or delete existing budgets, transactions, accounts, or auth records. Do not run the synthetic test fixtures against Neon.

The app safely reads existing budgets while this migration is absent. The planner clearly reports that saving is unavailable. Once the migration succeeds, reload Budgets; no environment variable or cron configuration is needed.

The application connects as the restricted `pebble_app` role, which can differ from the SQL Editor owner. The migration grants that role access only to the new annual tables, revision sequence, and functions. If an earlier copy was installed and logs show SQLSTATE `42501` / `permission denied for table annual_budget_plan`, run `migrations/20261030_annual_budget_permissions.sql` in the SQL Editor, then reload the app. This repair changes privileges only and does not change stored data. Do not restore the database snapshot for this permission error.

Before migration, preserve the existing Neon snapshot. Do not drop the new tables as a rollback after people have started saving plans: they hold the authoritative annual history. Older application builds only read legacy budgets, so rolling code back after annual adoption can show stale amounts. Prefer a forward fix that preserves the annual tables.

If the editor reports `unterminated dollar-quoted string`, it received an incomplete function body. A function includes all statements from `CREATE OR REPLACE FUNCTION` through its matching `END $$;`; intermediate `END IF;` lines are not the end. In that editor, run `ROLLBACK;` separately to clear a failed open transaction, then replace the editor contents with the entire migration file. Select all its SQL and run it together, including the final `COMMIT;`. The file ends with `-- END OF COMPLETE ANNUAL BUDGET MIGRATION`. Do not try to repair an incomplete fragment by adding a closing delimiter: that would omit the actual budget-writing logic.

## Data and concurrency

Every read and write is scoped to the authenticated user. A per-user transaction lock serializes saves, cancellations, and current-budget edits. A sequence-backed revision prevents stale tabs from editing a plan that was canceled and recreated. Future-plan saves capture a current-year baseline without changing legacy rows. Current-year edits materialize a new year if the amounts were carried forward, preserving previous years.

Category IDs link amounts to live names. Renaming follows the category; deleting a category leaves its historical name and amount intact. Newly created categories start unbudgeted. Zero amounts in an annual plan are authoritative and do not fall back to legacy amounts. A missed year carries the latest effective plan forward and is marked for review; percentage increases never repeat without approval.

Older years without a captured plan show spending without inventing historical budget reference lines. Existing historical values cannot be reconstructed from the yearless legacy table.

## Recommendations

Suggestions use recorded complete months, sustained changes in spending, and a disclosed 10% allowance. Sparse history, seasonal concentration, dormant recording periods, and unusual large purchases receive conservative handling and explanations. Proposed reductions need a full observed year and are limited to 20% per planning session. Each suggestion disclosure presents three boxes: the calculation basis with its period, 10% breathing room, and the result. Annualized or adjusted bases are labeled explicitly; a short note explains a 70% recent / 30% historical blend or an excluded purchase when applicable. If a retained-budget floor, the within-5% keep rule, or the maximum amount changes the result, the calculation remains a true equation and a separate short line shows the final suggestion. Rounding uses an approximation sign. Spending history and suggestion disclosures animate independently and respect Reduced Motion. Allocation labels are omitted when either line would truncate; each segment remains available by hover, focus, or tap. A zero budget is suggested only for a previously used category with 24 complete months of monthly recording activity but no category spending, no current/future recorded expenses, and no active or paused expense rules; missing rule data or a recording gap blocks that suggestion. These are optional planning estimates, not predictions; the user reviews and schedules the actual amounts.

## Spending charts

Both Budgets and the planner use the same monthly/cumulative category charts. Current-year charts estimate remaining spending from up to six completed months, requiring at least three months with positive category spending. The current month contributes only its remaining days; December 31 contributes no forecast. Future estimates use striped bars and a dashed cumulative continuation with an explicit monthly basis/window. Historical years have no forecast. Currency Y-axis ticks use equal monetary increments and include every visible series/budget line. Estimates are optional context, not recorded expenses, and do not change budget or transaction data.

## Verification

- `node --test tests/annualBudgetCalendar.test.cjs tests/annualBudgetRecommendations.test.cjs tests/budgetSpendingProjection.test.cjs`
- `bash scripts/test-annual-budgets-db.sh` (local Docker required; creates and removes its own PostgreSQL container with synthetic fixtures, no Neon connection or production credentials)
- `npx tsc --noEmit`
- `npm run build` with database and auth URLs overridden to unused localhost ports during isolated verification

Browser fixtures also verify English/Chinese, light/dark, mobile/desktop, large amounts, save/review/schedule/cancel/conflicts, recorded yearly budget charts, and New Year rollover/offline recovery. No production sign-in or test account is needed.
