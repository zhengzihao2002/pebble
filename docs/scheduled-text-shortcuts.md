# Scheduled title and description shortcuts

Shortcuts stay in the schedule template and expand only when an income or expense transaction is created. Both the title and multiline description support them. Existing transactions are not rewritten; no migration is needed.

| Shortcut | Example for 2026-11-06 | Aliases |
| --- | --- | --- |
| `{MONTH}` | November | `{MMMM}` |
| `{MONTH_SHORT}` | Nov | `{MMM}` |
| `{MONTH_NUMBER}` | 11 | `{MM}` |
| `{YEAR}` | 2026 | `{YYYY}` |
| `{YY}` | 26 | |
| `{DAY}` | 06 | `{DD}` |
| `{DATE}` | 2026-11-06 | |

Names are case insensitive. `{{month}}` and `{ MONTH }` also work. Unknown tokens and other text stay unchanged. Month names are deterministic English; Chinese wording can compose numeric shortcuts, such as `{YEAR}年{MM}月工资`.

Automatic catch-up uses each occurrence's recorded transaction date, including historical backfills. The schedule form previews the first upcoming generated text. For early Receive/Charge now, a template with recognized shortcuts requires the user to choose **Processing date** or **Original scheduled date**, with full previews. The choice affects text only: transaction_date remains today, occurrence_date remains the scheduled date, and the original compare-and-set/idempotency protections remain in place. A processing-date rollover refuses a stale dialog rather than silently changing its preview. Older clients without a choice keep the processing-date default.

The editor's compact shortcut hint shows examples for today in the user's selected timezone (or browser timezone). It refreshes every minute and when the window regains focus, so an open editor follows a date change. The examples in the reference table above are illustrative, not the values stored in the UI.

To correct an accidental early payment, delete that transaction if appropriate, then edit the schedule's **Next payment date**. Deleting a transaction alone never resets schedule progress. The selected date must be today or later and an occurrence on the schedule's cadence, within its end/count limits. To change the billing day itself, edit the first payment date. Saving a next-date change preserves existing transactions and takes the shared user-write lock; it refuses stale progress or any linked income/expense on or after the requested date. No migration is required.

Validation uses synthetic unit/action tests and isolated PostgreSQL/browser fixtures; it must never run against production Neon.
