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

Validation uses synthetic unit/action tests and isolated PostgreSQL/browser fixtures; it must never run against production Neon.
