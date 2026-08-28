import type { ServerErrorCode } from '@/lib/actions/errorCodes';

/**
 * The English dictionary. This is the SOURCE OF TRUTH for the shape:
 * zh.ts is typed as `typeof en`, so a key added here and forgotten there is
 * a compile error rather than a blank label at runtime.
 *
 * ⚠️ WHAT DOES NOT BELONG IN HERE.
 * Only labels. Never a value that is written to, read from, or compared in
 * the database. Payment methods ('Checking', 'Cash'), income categories
 * ('Standard Income', 'Side Cash'), recurring frequencies, end modes,
 * statuses, transaction kinds, icon keys, category names and 'YYYY-MM-DD'
 * dates are all load-bearing strings. A <select> may DISPLAY a translated
 * label while its value attribute stays English - that is the pattern. The
 * moment a translated string reaches Postgres or a comparison, something
 * silently breaks.
 *
 * ⚠️ NO `as const` ON THIS OBJECT, DELIBERATELY - do not add one back.
 * It was here once and broke the build on the first compile: `as const` types
 * every value as its own string LITERAL, so `zh: typeof en` then demanded the
 * Chinese dictionary contain the English text verbatim. Twelve errors, one per
 * translated key. Widened to `string`, `typeof en` checks exactly what it is
 * meant to - that zh has every key, no extra keys, and the same nesting.
 *
 * Interpolation uses {braces} and is applied by t(). Placeholder names must
 * match across locales; the positions may differ, and for Chinese they often
 * do, which is exactly why these are templates rather than concatenation.
 */
export const en = {
  common: {
    addGoal: 'Add goal',
    loading: 'Loading…',
    // No ellipsis: this is an aria-label read aloud by a screen reader, where
    // a trailing "dot dot dot" is noise rather than a hint that time passes.
    loadingAria: 'Loading',
    seeAll: 'See all',
    transportError: "Couldn't reach the server. Your change may not have been saved — check before trying again.",
    working: 'Working…',
    saving: 'Saving…',
  },

  // Nav labels double as the page TITLES in Header - they are the same words
  // in English, and keeping one entry means a rename cannot leave the sidebar
  // and the page heading disagreeing.
  nav: {
    dashboard: 'Dashboard',
    transactions: 'Transactions',
    reports: 'Reports',
    analysis: 'Analysis',
    budgets: 'Budgets',
    goals: 'Goals',
    scheduled: 'Scheduled',
    settings: 'Settings',
  },

  header: {
    // Keyed, not sentences: getGreetingKey() returns the time-of-day key and
    // the caller looks it up here. format.ts must not own prose.
    greeting: {
      morning: 'Good morning',
      afternoon: 'Good afternoon',
      evening: 'Good evening',
    },
    // Was string concatenation with a hardcoded ', '. Chinese needs a
    // fullwidth comma, so the separator has to live in the dictionary.
    greetingWithName: '{greeting}, {name}',
    subtitles: {
      // ⚠️ 'Checking' and 'Cash' appear here as PROSE, not as values. They are
      // safe to translate in this one sentence. The identical words in
      // payment_method are Postgres CHECK constraint values and must never be.
      transactions: 'Checking & Cash statements',
      reports: 'Filter and group your expenses and income',
      analysis: 'Trends, comparisons and projections',
      budgets: 'This year',
      goals: 'Money set aside for what is next',
      scheduled: 'Recurring payments and income',
      settings: 'Manage your preferences',
    },
    addTransaction: 'Add transaction',
    modifyBudget: 'Modify Budget',
    addSchedule: 'Add schedule',
    notifications: 'Notifications',
  },

  sidebar: {
    // These describe the CURRENT state, not the action taken on click, which
    // is how the toggle already reads. Do not turn them into imperatives.
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode',
  },

  auth: {
    signOut: 'Sign Out',
    signingOut: 'Signing out…',
  },

  settings: {
    language: {
      title: 'Language',
      label: 'Display language',
      // States the guarantee plainly, because it is the thing a user would
      // reasonably worry about when switching a finance app's language.
      hint: 'Changes what you see only. Your categories, amounts and dates are stored exactly as they are.',
      // Each option is written in its OWN language, in both locales - the
      // universal convention for language pickers, and the only way someone
      // stranded in the wrong locale can find their way back.
      english: 'English',
      chinese: '中文',
    },
  },

  // The (app) route error boundary. Deliberately says nothing about the cause:
  // in production Next redacts the message and passes only a digest, so the
  // wording has to be true whatever actually failed.
  error: {
    title: "Couldn't load your data",
    body: 'Pebble reached this page but could not read from the database. Nothing has been changed or lost — this is a problem getting your data, not with your data.',
    retry: 'Try again',
    reference: 'Reference:',
  },

  // ⚠️ DISPLAY LABELS FOR STORED VALUES. Read this before adding anything.
  //
  // The KEY of each entry is the exact string in Postgres. The VALUE is only
  // ever rendered. Nothing here may be written back, compared, or used to
  // look anything up - payment_method carries a CHECK constraint, so a
  // translated value fails the insert outright.
  //
  // Keys are deliberately capitalised to match the stored values rather than
  // camelCased like every other key in this file: the mismatch is the point.
  // It should be obvious at a glance that these are database strings.
  enums: {
    paymentMethod: {
      Checking: 'Checking',
      Cash: 'Cash',
    },
    // recurring_rule.kind and the Transaction.type discriminant.
    kind: {
      expense: 'Expense',
      income: 'Income',
    },
    // ⚠️ THE MOST LOAD-BEARING PAIR IN THE APP. These are matched as string
    // literals by isSideCash() and by the income filters in stats.ts. If a
    // translated value ever reached income.category, Side Cash exclusion
    // breaks everywhere at once - savings rate, the Income tile, the trend
    // chart and the annual estimate - and nothing would throw.
    incomeCategory: {
      'Standard Income': 'Standard Income',
      'Side Cash': 'Side Cash',
    },
  },

  txn: {
    gross: 'Gross {amount}',
    balanceAfter: 'Bal {amount}',
    balanceAdjustment: 'Balance adjustment',
  },

  catchUp: {
    failedTitle: 'Some scheduled payments could not be added.',
    failedBody: 'They will be retried next time you open Pebble — nothing has been duplicated or lost. If it keeps happening, the details are in the server logs.',
    // ⚠️ EXPLICIT PLURAL PAIRS, not a plural-rules engine. English needs two
    // forms, Chinese needs one and maps both keys to the same string. Four
    // keys is the honest cost of the two real cases in this app.
    truncatedTitleOne: 'Added {count} scheduled transaction, with more to come.',
    truncatedTitleOther: 'Added {count} scheduled transactions, with more to come.',
    truncatedBody: 'There were too many to create at once. Reload the page to continue where it left off.',
    addedOne: 'Added {count} scheduled transaction that came due since your last visit.',
    addedOther: 'Added {count} scheduled transactions that came due since your last visit.',
    dismiss: 'Dismiss',
  },

  select: {
    noMatches: 'No matches',
    unavailable: 'Unavailable',
    searchCategories: 'Search categories…',
  },

  addTxn: {
    title: 'Add transaction',
    saving: 'Saving transaction…',
    categoriesFailed: "Couldn't load your categories.",
    dipsTitle: 'This dips into your goals',
    // {amount} is rendered as a .font-mono-tab element, not spliced in as
    // text - see the note at the call site.
    dipsBody: 'This transaction spends {amount} you had set aside for goals. That is fine to do — your goals will just be counting on money that is not there yet.',
    goBack: 'Go back',
    proceed: 'Continue',
    description: 'Description',
    descriptionPlaceholder: 'e.g. Coffee shop\nOptional notes on the next line',
    category: 'Category',
    tag: 'Tag',
    tagHint: '(sub-category, optional)',
    tagPlaceholder: 'e.g. Groceries',
    amount: 'Amount',
    sideCashNote: 'Side cash counts toward your balance and appears in Reports, but is left out of the Income and Savings rate figures on your dashboard — those track standard income only.',
    payBefore: 'Pay before deductions',
    payAfter: 'Pay after deductions',
    netExceedsGross: 'Pay after deductions cannot be more than pay before deductions.',
    deductions: 'Deductions',
    date: 'Date',
    paymentMethod: 'Payment method',
  },

  recurring: {
    // Six keys rather than one sentence with a spliced noun. English tolerated
    // `Edit scheduled ${noun}`; Chinese does not - 定期收入 and 定期支出 are
    // compounds, and the delete question puts its verb elsewhere.
    titleEditExpense: 'Edit scheduled payment',
    titleEditIncome: 'Edit scheduled income',
    titleNewExpense: 'New scheduled payment',
    titleNewIncome: 'New scheduled income',
    deleteConfirmExpense: 'Delete this scheduled payment?',
    deleteConfirmIncome: 'Delete this scheduled income?',
    deleteBody: 'will stop creating new transactions. Everything it has already created stays exactly where it is — those are real transactions that have happened.',
    keepIt: 'Keep it',
    delete: 'Delete',
    deleting: 'Deleting…',
    savingSchedule: 'Saving schedule…',
    deletingSchedule: 'Deleting schedule…',

    type: 'Type',
    typeLocked: 'Type cannot be changed. Delete this and create a new one instead.',
    description: 'Description',
    descriptionPlaceholderIncome: 'e.g. Salary',
    descriptionPlaceholderExpense: 'e.g. Car loan',
    category: 'Category',
    tag: 'Tag',
    tagHint: '(optional)',
    tagPlaceholder: 'e.g. Fixed',
    paidFrom: 'Paid from',
    // Income lands IN an account rather than being paid out of one. "into",
    // not "to": the field names the destination account, and "paid to" reads
    // as a recipient - which for income would be the user themselves.
    paidInto: 'Paid into',
    grossAmount: 'Gross amount',
    netAmount: 'Net amount (what actually lands)',
    amount: 'Amount',
    netHint: 'Only the net amount affects your balance. Gross is recorded for reference.',
    frequency: 'Frequency',
    frequencies: {
      once: 'Once (a single future payment)',
      weekly: 'Weekly',
      biweekly: 'Every 2 weeks',
      monthly: 'Monthly',
      yearly: 'Yearly',
    },
    dateOnce: 'Date',
    startsOn: 'Starts on',
    monthEndHint: 'Months shorter than this date use their last day — the 31st becomes the 28th in February, then returns to the 31st in March.',
    ends: 'Ends',
    endModes: {
      never: 'Never',
      after: 'After a number of payments',
      on: 'On a date',
    },
    endCount: 'Number of payments',
    endCountPlaceholder: 'e.g. 48',
    endDate: 'Last payment on or before',
    backfillLabel: 'Also create the payments that already happened',
    backfillHint: 'This start date is in the past. By default only future payments are created — tick this only if these transactions are not already in Pebble.',
    saveChanges: 'Save changes',
    addIncomeSchedule: 'Add income schedule',
    addPaymentSchedule: 'Add payment schedule',
  },

  txnDetail: {
    savingChanges: 'Saving changes…',
    deletingOverlay: 'Deleting…',
    rowType: 'Type',
    rowCategory: 'Category',
    rowTag: 'Tag / sub-category',
    rowDate: 'Date',
    rowAccount: 'Account',
    rowPaymentMethod: 'Payment method',
    // Income uses this instead - "Payment method" implies the user is
    // spending, which is backwards for a deposit.
    rowDepositedTo: 'Deposited to',
    rowAmount: 'Amount',
    rowPayBefore: 'Pay before deductions',
    rowPayAfter: 'Pay after deductions',
    rowDeductions: 'Deductions',
    adjustmentNote: 'A manual correction to your balance. It appears here in your statement but is left out of Reports, since it is not real spending or income.',
    edit: 'Edit',
    delete: 'Delete',
    description: 'Description',
    tag: 'Tag',
    optional: '(optional)',
    sideCashNote: 'Side cash counts toward your balance and appears in Reports, but is left out of the Income and Savings rate figures on your dashboard — those track standard income only.',
    netExceedsGross: 'Pay after deductions cannot be more than pay before deductions.',
    cancel: 'Cancel',
    saveChanges: 'Save changes',
    dipsTitle: 'This dips into your goals',
    dipsBody: 'This change spends {amount} you had set aside for goals. That is fine to do — your goals will just be counting on money that is not there yet.',
    goBack: 'Go back',
    proceed: 'Continue',
    deleteConfirm: 'Delete this transaction?',
    // Three placeholders, two of which are rendered as elements rather than
    // text. Word order differs between the languages, which is why this is one
    // template rather than concatenated fragments.
    deleteBody: '{description} for {amount} on {date} will be removed as if it had never been recorded. Your balances will adjust. This cannot be undone.',
    keepIt: 'Keep it',
    deleting: 'Deleting…',
  },

  textSize: {
    title: 'Text size',
    blurb: 'Adjust how large text appears throughout Pebble.',
    small: 'Small',
    default: 'Default',
    large: 'Large',
    extraLarge: 'Extra large',
  },

  notifications: {
    title: 'Notifications',
    comingSoon: 'Notifications coming soon',
    budgetAlerts: 'Budget alerts',
    budgetAlertsHint: 'Get notified when a category nears its limit',
    weeklySummary: 'Weekly summary',
    weeklySummaryHint: 'A recap of your spending every Monday',
    largeTxn: 'Large transaction alerts',
    // The $500 is an illustrative figure in prose, not a stored amount. It
    // stays in dollars in both locales, like every other figure in Pebble.
    largeTxnHint: 'Notify me for transactions over $500',
  },

  account: {
    title: 'Account',
  },

  openingBalance: {
    title: 'Starting balances',
    blurb: 'What each account held before your first recorded transaction. Your balance today is worked out from this plus everything you have recorded since. Negative values are fine for an overdrawn account.',
    saving: 'Saving balances…',
    projectedLabel: 'Balance today, with these values',
    // Both account names come from d.enums.paymentMethod so this line tracks
    // the labels used everywhere else. The figures are elements, not text.
    projectedValue: '{checking} checking · {cash} cash',
    saved: 'Saved.',
    save: 'Save starting balances',
  },

  modifyBalance: {
    title: 'Adjust a balance',
    blurb: 'If Pebble and your real account disagree, record the difference here. It shows up in your statement as an adjustment, but is left out of Reports — it is a correction, not spending or income.',
    saving: 'Recording adjustment…',
    // {account} is filled from d.enums.paymentMethod, so this line tracks the
    // account labels used everywhere else.
    balanceNow: '{account} balance now',
    setTo: 'Set to amount',
    changeBy: 'Add or subtract',
    newBalance: 'New balance',
    // The − is a MINUS SIGN (U+2212), not a hyphen. Kept as-is in Chinese.
    changeByLabel: 'Change by (use − to subtract)',
    note: 'Note',
    optional: '(optional)',
    notePlaceholder: 'e.g. Bank interest, missed cash spend',
    adjustment: 'Adjustment',
    recorded: 'Adjustment recorded.',
    record: 'Record adjustment',
  },

  categoryManager: {
    title: 'Categories',
    blurb: 'Rename, restyle, add or remove your expense categories. Deleting one asks where its transactions should go — they are never lost.',
    loading: 'Loading your categories…',
    loadFailed: "Couldn't load your categories.",
    namePlaceholder: 'Category name',
    newNamePlaceholder: 'New category name',
    systemHint: 'This is the fallback category — its name is fixed, but you can change its icon and colour.',
    fallbackTag: 'fallback',
    save: 'Save',
    cancel: 'Cancel',
    adding: 'Adding…',
    addCategory: 'Add category',
    newCategory: 'New category',
    // {name} is a CATEGORY NAME - user data, inserted untranslated.
    editAria: 'Edit {name}',
    deleteAria: 'Delete {name}',
  },

  categoryDelete: {
    // {name} is a category name - user data, inserted untranslated.
    title: 'Delete {name}',
    deleting: 'Deleting category…',
    checking: 'Checking what uses this category…',
    usageFailed: "Couldn't check what uses this category.",
    noUsage: 'Nothing is using this category, so it can be removed safely. Its budget will be cleared too. This cannot be undone.',
    // ⚠️ Whole sentences, not fragments. English inflects the noun AND the
    // verb here ("1 transaction uses" / "2 transactions use"), which cannot be
    // assembled from parts in a way that also works for Chinese.
    usageOne: '{count} transaction still uses this category. Choose where it should go — nothing is deleted, only recategorised.',
    usageOther: '{count} transactions still use this category. Choose where they should go — nothing is deleted, only recategorised.',
    moveAll: 'Move all together',
    oneByOne: 'Choose one by one',
    moveAllTo: 'Move all {count} to',
    noDescription: 'No description',
    cancel: 'Cancel',
    confirm: 'Delete category',
  },

  sounds: {
    title: 'Sounds',
    blurb: 'Optional audio feedback. Everything is off until you choose a sound.',
    // The two spans are file paths and a shell command - rendered as elements
    // and never translated, hence the placeholders.
    noFiles: 'No sound files found. Add audio to {path} and run {command} — see the README in that folder.',
    noSound: 'No sound',
    preview: 'Preview {event} sound',
    // Keys here are SOUND EVENT KEYS, which are also field names in the
    // persisted soundPrefs store object. They are values, not labels - the
    // text beside them is the only translated part.
    events: {
      expenseSaved: 'Expense saved',
      incomeSaved: 'Income saved',
      saveFailed: 'Save failed',
      click: 'Button click',
      goalReached: 'Goal reached',
    },
    hints: {
      expenseSaved: 'Plays after an expense is successfully recorded.',
      incomeSaved: 'Plays after income is successfully recorded.',
      saveFailed: 'Plays when a save could not be completed.',
      click: 'Plays on primary buttons. Fires often — worth trying before keeping.',
      goalReached: 'Plays when a savings goal hits its target.',
    },
  },

  appearance: {
    title: 'Appearance',
    darkMode: 'Dark mode',
    hint: 'Switch to a darker color scheme',
  },

  transactions: {
    totalBalanceToday: 'Total balance, today',
    openingBalance: 'Opening balance',
    closingBalance: 'Closing balance',
    deposits: 'Deposits',
    withdrawals: 'Withdrawals',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    noActivity: 'No activity this month',
    carriedForward: 'Balance carried forward at {amount}.',
  },

  statsModes: {
    '30d': 'Last 30 days',
    '90d': 'Last 90 days',
    last6: 'Last 6 months',
    last12: 'Last 12 months',
    month: 'Month',
    quarter: 'Quarter',
    year: 'Year',
  },

  dashboard: {
    balanceTitle: 'Your balance, today',
    balanceTooltipLabel: 'How your balance is calculated',
    balanceTooltip: 'Your opening balances plus every transaction since — expenses, income and any manual balance corrections, across both {checking} and {cash}. {emphasis}: it is left out of income figures, but it is still money you have. This is a live figure, not tied to the period selected below.',
    balanceEmphasis: 'Side Cash is included here',
    inProgressNote: '· includes this month so far',
    periodTooltipLabel: 'What this period covers',
    periodCover: 'The four figures below cover {emphasis}.',
    periodCoverEmphasis: 'exactly this range',
    periodInProgress: 'It runs up to today, so the month in progress is included and these numbers change as soon as you add a transaction — the dashboard shows where you are {emphasis}.',
    periodInProgressEmphasis: 'right now',
    periodAnalysis: 'The Analysis page uses only {emphasis} months, so its figures for the same period will differ: an average over a half-finished month understates spending and makes your runway look longer than it is.',
    periodAnalysisEmphasis: 'complete',
    income: 'Income',
    spending: 'Spending',
    savingsRate: 'Savings rate',
    saved: 'Saved',
    standardIncomeOnly: 'Standard income only',
    sublabelWithNote: '{period} · {note}',
    incomeTooltipLabel: 'How income is calculated',
    incomeTooltip: 'Take-home pay received in the selected period. {emphasis} — only Standard Income counts. This is net pay, what actually reached your account, never the gross figure before deductions.',
    incomeEmphasis: 'Side Cash is excluded',
    spendingTooltipLabel: 'How spending is calculated',
    spendingTooltip: 'Every expense dated in the selected period, including this month so far. Balance adjustments are excluded — they correct your balance rather than record spending.',
    savingsTooltipLabel: 'How savings rate is calculated',
    savingsTooltip: 'Income minus spending, as a share of income, over the selected period. Side Cash is excluded from income. {emphasis}, so it moves as soon as you add a transaction today — the dashboard shows where you are right now. The Analysis page shows a different figure because it uses only complete months: an average over a half-finished month understates spending.',
    savingsEmphasis: 'This includes the month in progress',
    savedTooltipLabel: 'How saved is calculated',
    savedTooltip: 'Income minus spending over the selected period — the money left over, in dollars rather than as a percentage. Side Cash is excluded from income. A negative figure means you spent more than you earned in this period.',
  },

  trendChart: {
    title: 'Income vs. spending',
    noData: 'No data for this period',
  },

  donutChart: {
    title: 'Where it went',
    noData: 'No spending for this period',
    total: 'Total',
  },

  needsAttention: {
    title: 'Needs attention',
  },

  recentActivity: {
    title: 'Recent activity',
  },

  goalOverspend: {
    title: 'Your goals claim more than your balance',
    // {shortfall} is rendered as a bold element, hence the template.
    body: 'You have set aside {allocated} across your goals but your balance is {balance} — a shortfall of {shortfall}. Nothing is broken; it just means some of that money is no longer there.',
    reviewGoals: 'Review goals',
  },

  months: {
    January: 'January', February: 'February', March: 'March', April: 'April',
    May: 'May', June: 'June', July: 'July', August: 'August',
    September: 'September', October: 'October', November: 'November', December: 'December',
  },

  quarters: { Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', Q4: 'Q4' },

  reports: {
    filters: 'Filters',
    expenses: 'Expenses',
    income: 'Income',
    timePeriod: 'Time period',
    month: 'Month', quarter: 'Quarter', year: 'Year', allTime: 'All time',
    whichYear: 'Which year', whichMonth: 'Which month', whichQuarter: 'Which quarter',
    allYears: 'All years', allMonths: 'All months', allQuarters: 'All quarters',
    groupBy: 'Group by', groupCategory: 'Category', groupNone: 'None',
    sort: 'Sort',
    sortHighest: 'Highest first', sortLowest: 'Lowest first',
    sortNewest: 'Newest first', sortOldest: 'Oldest first',
    description: 'Description',
    descriptionPlaceholder: 'Optional — search description',
    onlyCategories: 'Only include categories',
    all: 'All',
    subCategoryOf: '{category} sub-category',
    byMonth: 'By month', byQuarter: 'By quarter', byYear: 'By year',
    groupedByCategory: 'grouped by category',
    categoriesOne: '{count} category', categoriesOther: '{count} categories',
    // Group header for a quarter bucket.
    quarterOfYear: '{quarter} {year}',
    transactionsOne: '{count} transaction', transactionsOther: '{count} transactions',
    grandTotal: '{amount} total',
    expandAll: 'Expand all', collapseAll: 'Collapse all',
    noMatch: 'No transactions match',
    noMatchHint: 'Try adjusting your filters.',
  },

  phrasing: {
    overBudget: '{amount} over',
    leftBudget: '{amount} left',
    pastTarget: '{amount} past target',
    toGo: '{amount} to go',
    ofAmount: '{spent} of {total}',
    ofTarget: 'of {total}',
  },

  budgetsPage: {
    totalAnnual: 'Total annual budget',
    spentYtd: 'Spent year to date',
    // {diff} is the money figure, {rest} is 'over budget this year' or
    // 'left this year' - kept apart because overUnderLabel already produces
    // 'X over' / 'Y left' and this needs the year qualifier appended, not
    // duplicated inside a second template.
    overThisYear: '{amount} over budget this year',
    leftThisYear: '{amount} left this year',
    noBudgetSet: '{amount} spent — no budget set',
  },

  goalCard: {
    target: 'Target {date}',
    // {pct} is a plain number with a literal '%', {rest} is overUnderLabel's
    // output - two independent facts, not one sentence to translate whole.
    thereSuffix: '{pct}% there — {rest}',
    editAria: 'Edit {name}',
  },

  scheduled: {
    title: 'Your schedules',
    blurb: 'Payments and income Pebble creates for you. They appear when you open the app after their date, so nothing runs while Pebble is closed. Editing a schedule only affects what comes next — transactions it has already created are left exactly as they are, and deleting one you did not want is permanent. Pausing skips that period entirely rather than catching up on it later.',
    emptyHint: 'Nothing scheduled yet. Use {action} above to set up a recurring payment like a car loan or your salary.',
    finished: 'finished',
    paused: 'paused',
    // Deliberately NOT reusing d.recurring.frequencies - those are verbose
    // dropdown option text ('Once (a single future payment)'), wrong tone for
    // an inline sentence like 'One-off on Aug 21'. Same five keys, compact
    // wording.
    frequencyShort: {
      once: 'One-off', weekly: 'Weekly', biweekly: 'Every 2 weeks',
      monthly: 'Monthly', yearly: 'Yearly',
    },
    onceOn: '{freq} on {date}',
    afterCount: '{freq}, {count} payments from {date}',
    until: '{freq} until {date}',
    from: '{freq} from {date}',
    resumeAria: 'Resume {description}',
    pauseAria: 'Pause {description}',
    editAria: 'Edit {description}',
    comingUp: 'Coming up',
    nextDays: 'next {days} days',
    upcomingHint: 'These have not happened yet, so they are not in your balance. Paused schedules are not shown.',
    nothingDue: 'Nothing due in the next {days} days.',
  },

  analysis: {
    windowLabels: {
      '3m': 'Last 3 complete months',
      '6m': 'Last 6 complete months',
      '12m': 'Last 12 complete months',
      ytd: 'This year to date',
      all: 'All time',
    },
    noCompleteRange: 'no complete months yet',
    completeMonthsOne: '{count} complete month',
    completeMonthsOther: '{count} complete months',
    // Reuses d.reports.transactionsOne/Other, d.budgetModal.recordedMonthsOne/
    // Other and d.reports.categoriesOne/Other elsewhere in this file - the
    // wording is identical, so those are called directly rather than
    // duplicated here.
    monthsOne: '{n} month',
    monthsOther: '{n} months',
    dormantSkippedOne: ', {count} dormant month skipped',
    dormantSkippedOther: ', {count} dormant months skipped',
    activeRuleOne: '{count} active rule',
    activeRuleOther: '{count} active rules',
    overspentMonthOne: 'Spending exceeded income in {count} month: {list}',
    overspentMonthOther: 'Spending exceeded income in {count} months: {list}',
    puttingAside: 'putting money aside',
    drawingDown: 'drawing down',

    period: {
      label: 'Period',
      tooltipLabel: 'What this period covers',
      tooltip: 'Every figure below covers {exactly}. Analysis only ever uses complete calendar months, so {excluded}. It has its own card just below instead. This is why these numbers differ from your dashboard: the dashboard shows where you are right now, including today. This page shows your settled patterns.',
      exactly: 'exactly these months',
      // {month} interpolates window.currentMonthLabel, which is now
      // localized in windows.ts itself.
      excluded: '{month} is not included anywhere',
    },

    currentMonth: {
      title: '{month} so far',
      tooltipLabel: 'How this month so far is calculated',
      scope: 'Day {day} of {total} · not counted anywhere else on this page',
      tooltip: 'Everything recorded from the 1st of this month up to today. Held apart from every other figure on the page because the month is not finished — mixing a part-month into an average understates it. Side Cash is excluded from the income figure, matching the rest of the page.',
      spent: 'Spent',
      earned: 'Earned',
      earnedNote: 'take-home, excludes Side Cash',
      net: 'Net',
    },

    noCompleteMonth: 'No complete month on record yet. Analysis fills in once your first calendar month finishes — until then, the card above is the whole picture.',

    stability: {
      veryStable: 'Very steady',
      stable: 'Steady',
      variable: 'Variable',
      highlyVariable: 'Highly variable',
    },

    income: {
      title: 'Income',
      empty: 'No income recorded in these months.',
      annualLabel: 'Estimated annual income',
      annualTooltipLabel: 'How estimated annual income is calculated',
      annualNote: 'take-home, an estimate',
      annualTooltip: '{emphasis} Side Cash is excluded, and this is take-home (net) pay, not salary before deductions. A month where you were recording but received no pay counts as zero; a stretch of 3 or more months with nothing recorded at all is skipped as time you were not using Pebble. The Modify Budget dialog shows this same calculation over a fixed 12 months, so the two agree when this period is set to Last 12 complete months.',
      annualEmphasis: 'Take-home Standard Income ÷ months you were recording × 12.',
      avgLabel: 'Average monthly income',
      avgTooltipLabel: 'How average monthly income is calculated',
      avgTooltip: 'Take-home Standard Income divided by the number of months you were recording. Months where you were recording but received no pay count as zero, because they are real. Side Cash is excluded.',
      deductionLabel: 'Effective deduction rate',
      deductionTooltipLabel: 'How the deduction rate is calculated',
      deductionNote: 'of gross pay withheld',
      deductionTooltip: 'The share of your gross pay that never reaches your account: total gross minus total take-home, divided by total gross. This covers {emphasis} — not just tax, but insurance and retirement contributions too. Side Cash is excluded, since it usually has nothing withheld.',
      deductionEmphasis: 'everything withheld',
      stabilityLabel: 'Income stability',
      stabilityTooltipLabel: 'How income stability is calculated',
      stabilityNeedsTwo: 'Needs two months',
      stabilityVariation: 'variation {pct}%',
      stabilityTooltip: 'How much your monthly take-home varies, measured as the typical distance from your average as a percentage of that average. Under 10% is very steady, under 25% steady, under 50% variable, above that highly variable. Months with no pay count as zero, because a missed month is instability.',
      deductionsChartTitle: 'Deductions over time',
      deductionsChartTooltipLabel: 'How the deductions over time chart is calculated',
      deductionsChartTooltip: 'The share of gross pay withheld in each month. Gaps are months with no Standard Income — the line breaks rather than dropping to zero, because no pay is not the same as no deductions. A rising line means more of your pay is being withheld.',
      // Short label for the chart's tooltip series name - distinct from
      // deductionLabel above, which is a full sentence and too long for an
      // inline 'name: value' tooltip row.
      rateSeriesName: 'Deduction rate',
    },

    spending: {
      title: 'Spending',
      empty: 'No spending in these months.',
      avgLabel: 'Average monthly spend',
      avgTooltipLabel: 'How average monthly spend is calculated',
      avgTooltip: 'Total spending divided by the number of months you were recording. Any stretch of 3 or more consecutive months with no transactions at all is treated as time you were not using Pebble and is skipped — counting those would make this look far lower than your real spending. Balance adjustments are corrections, not spending, so they are never included.',
      totalLabel: 'Total spend',
      totalTooltipLabel: 'How total spend is calculated',
      totalTooltip: 'Every expense in these months. Balance adjustments are excluded: they correct your balance rather than record spending.',
      top3Label: 'Top 3 concentration',
      top3TooltipLabel: 'How top 3 concentration is calculated',
      top3Note: 'share held by {categories}',
      top3Tooltip: 'The share of your total spending held by your three largest categories. A high figure means your spending is concentrated in a few places. With three or fewer categories in the period this is 100% by definition.',
      monthlyChartTitle: 'Month by month',
      monthlyChartTooltipLabel: 'How the month by month chart is calculated',
      monthlyChartTooltip: 'Total expenses in each month of the period. Months with no spending are shown as zero rather than skipped — a gap is information.',
      topCategoriesTitle: 'Top categories',
      topCategoriesTooltipLabel: 'How top categories are calculated',
      topCategoriesTooltip: 'Every expense in the period grouped by category and ranked by total. The percentage is that category\u2019s share of total spending. Colours are the ones set in your category settings, so they match the rest of Pebble.',
    },

    cashflow: {
      title: 'Cash flow',
      savingsLabel: 'Savings rate',
      savingsTooltipLabel: 'How savings rate is calculated',
      savingsNoIncome: 'No income recorded',
      savingsNote: 'income kept, not spent',
      savingsTooltip: 'Income minus spending, as a share of income, across these complete months. {emphasis} — only Standard Income counts. Income means take-home pay, never gross, and balance adjustments are excluded. Your dashboard shows a different number for the same period because it includes the month in progress; this page uses only finished months.',
      savingsEmphasis: 'Side Cash is excluded',
      avgNetLabel: 'Average monthly net',
      avgNetTooltipLabel: 'How average monthly net is calculated',
      avgNetNeedsOne: 'Needs one month',
      avgNetTooltip: 'Average income minus average spending per recorded month. Positive means you are adding to your balance. Side Cash is excluded from the income side.',
      runwayLabel: 'Runway',
      runwayTooltipLabel: 'How runway is calculated',
      runwayCovered: 'Income covers your spending',
      runwayNote: 'at your current net burn',
      runwayTooltip: 'Your current balance divided by how much more you spend than you earn each month. Shown only when you are spending more than you earn — when income covers spending your balance is not being drawn down, so there is no runway to report. Your balance is today\u2019s actual balance and includes Side Cash, since that is money you have.',
      coverLabel: 'Months of expenses covered',
      coverTooltipLabel: 'How months of expenses covered is calculated',
      coverNote: 'if income stopped entirely',
      coverTooltip: 'Your current balance divided by average monthly spending, ignoring income. A worst-case cushion figure: how long you could keep spending at your usual rate with nothing coming in. Your balance includes {emphasis} money you have, Side Cash included — it is left out of income figures, but it is still money in your account.',
      coverEmphasis: 'all',
      chartTitle: 'Money in versus out',
      chartTooltipLabel: 'How the money in versus out chart is calculated',
      chartTooltip: 'Income minus spending for each month. Green months added to your balance, wine months drew it down. Side Cash is excluded from income.',
      commitmentsTitle: 'Fixed monthly commitments',
      commitmentsTooltipLabel: 'How fixed monthly commitments are calculated',
      commitmentsScope: 'Standing figure — not affected by the period above',
      commitmentsTooltip: 'Your active scheduled rules converted to a monthly figure — weekly counts 52 times a year, every-two-weeks 26, yearly once. Paused rules, one-off rules and rules that have finished their run are all excluded.',
      committedOut: 'Committed out',
      committedIn: 'Committed in',
    },

    outlook: {
      title: 'Comparison & outlook',
      yoyTitle: 'Year by year',
      yoyTooltipLabel: 'How year by year is calculated',
      yoyScope: 'Every year on record — not affected by the period above',
      yoyTooltip: 'Total income and spending for each calendar year on record. Side Cash is excluded from income. The current year is marked {emphasis} because it is incomplete and will look smaller than a full year.',
      yoyEmphasis: '\u201cso far\u201d',
      yoySoFar: ' (so far)',
      yoySaved: 'saved {pct}',
      projectionTitle: 'Projected year-end balance',
      projectionTooltipLabel: 'How the year-end projection is calculated',
      projectionScope: 'Estimate only — {months} left this year',
      projectionTooltip: 'Your balance today plus your average monthly net flow for each month left in the year. {emphasis1} asks whether those particular months are typical for you: it looks at the same calendar months in past complete years and applies how they usually differ from an average month, so a habitually expensive December counts as one. The gap between the two figures is your seasonal exposure. Both are {emphasis2} from past behaviour, not predictions.',
      projectionEmphasis1: 'Seasonally adjusted',
      projectionEmphasis2: 'estimates',
      flatEstimate: 'Flat estimate',
      flatNote: 'every month treated the same',
      seasonalLabel: 'Seasonally adjusted',
      seasonalNeedsTwo: 'needs two full years of history',
      seasonalNote: 'weighted by past years',
      paceTitle: 'Budget pace',
      paceTooltipLabel: 'How budget pace is calculated',
      paceScope: 'This calendar year — you are {pct} through it',
      paceTooltip: 'What you have spent in each category so far this calendar year against its annual budget, {emphasis} — a budget is about money actually gone. The vertical marker shows how far through the year you are: a bar past the marker means you are ahead of pace.',
      paceEmphasis: 'including this month',
      comingUpTitle: 'Coming up',
      comingUpTooltipLabel: 'How coming up is calculated',
      comingUpScope: 'Through {date} — not affected by the period above',
      comingUpTooltip: 'Scheduled payments and income due over the next three months, worked out from your active rules. Paused rules and rules that have finished their run are left out. {emphasis} — unlike the fixed commitments figure above, which counts only repeating obligations. Anything already added to your ledger is not shown again.',
      comingUpEmphasis: 'One-off scheduled items are included here',
      nothingDue: 'Nothing scheduled in the next three months.',
      dueOut: 'Due out',
      dueIn: 'Due in',
    },
  },

  // Filled incrementally as pebble.ts action messages are converted to
  // codes (Phase 3d). `satisfies Record<ServerErrorCode, string>` means a
  // code added in pebble.ts without a matching entry here is a COMPILE
  // ERROR, not a silent English fallback found later - the same guard
  // `zh: typeof en` gives every other key in this file.
  serverErrors: {
    'session.expired': 'Your session has expired. Please sign in again.',
    'session.authUnavailable': "We couldn't verify your session right now. Please try again in a moment.",
    'session.unknown': 'Something went wrong. Please try again.',
    'action.databaseUnreachable': "Couldn't reach the database. Your change was not saved.",
    'action.unknownError': 'Something went wrong saving your changes. Please try again.',
    'loader.budgetModalFailed': "Couldn't reach the database to load your budgets.",
    'loader.allocationSummaryFailed': "Couldn't check your goal allocations.",
    'loader.categoriesFailed': "Couldn't reach the database to load your categories.",
    'loader.categoryUsageFailed': "Couldn't check that category.",
    'loader.balanceModeFailed': "Couldn't reach the database to load your balance settings.",
    'validation.dateFormat': 'Date must be in YYYY-MM-DD format.',
    'validation.paymentMethod': 'Payment method must be Cash or Checking.',
    'validation.expenseAmountPositive': 'Expense amount must be a positive number.',
    'validation.expenseCategoryRequired': 'An expense needs a category.',
    'validation.incomeCategory': 'Income category must be Standard Income or Side Cash.',
    'validation.grossAmountNonNegative': 'Gross amount must be zero or greater.',
    'validation.netAmountNonNegative': 'Net amount must be zero or greater.',
    'validation.netExceedsGross': 'Pay after deductions cannot be more than pay before deductions.',
    'notFound.transaction': 'That transaction no longer exists.',
    'validation.adjustmentAmountRequired': 'Enter an amount that actually changes the balance.',
    'notFound.adjustment': 'That adjustment no longer exists.',
    'validation.goalNameRequired': 'A goal needs a name.',
    'validation.goalTargetPositive': 'Target amount must be greater than zero.',
    'validation.goalSavedNonNegative': 'Saved amount cannot be negative.',
    'validation.goalDateInvalid': 'Target date must be a valid date.',
    'notFound.goal': 'That goal no longer exists.',
    'validation.budgetCategoryNameRequired': 'Budget category names cannot be empty.',
    // {category} is USER DATA - a category name - and is inserted exactly as
    // stored, never translated.
    'validation.budgetAmountNonNegative': 'Budget for {category} must be zero or greater.',
    'validation.checkingOpeningNumber': 'Checking opening balance must be a number.',
    'validation.cashOpeningNumber': 'Cash opening balance must be a number.',
    'validation.categoryNameRequired': 'A category needs a name.',
    'validation.categoryNameTooLong': 'Category names are limited to {max} characters.',
    // {name} is USER DATA and is inserted exactly as typed, never translated.
    'validation.categoryNameDuplicate': 'You already have a category called "{name}".',
    'notFound.category': 'That category no longer exists.',
    'validation.categoryFallbackCannotRename': 'The fallback category cannot be renamed, but you can change its icon and colour.',
    'validation.categoryFallbackCannotDelete': 'The fallback category cannot be deleted.',
    'validation.categoryDeleteChooseDestination': 'Choose where these transactions should go before deleting.',
    'notFound.categoryDestination': 'That destination category no longer exists.',
    'validation.categoryDeleteAllNeedDestination': 'Every transaction needs a destination category before deleting.',
    // {names} arrives as an ARRAY of rule descriptions (user data) and is
    // joined by translateActionError() with a locale-correct separator - the
    // server never pre-joins it.
    'validation.categoryRulesStillUse': 'These scheduled payments still use this category: {names}. Update or remove them first.',
    'validation.ruleDescriptionRequired': 'A scheduled payment needs a description.',
    'validation.ruleKindRequired': 'Select whether this is an expense or income.',
    'validation.rulePaymentMethod': 'Select a valid payment method.',
    'validation.ruleFrequency': 'Select a valid frequency.',
    'validation.ruleEndMode': 'Select a valid end condition.',
    'validation.ruleStartDateFormat': 'Start date must be in YYYY-MM-DD format.',
    'validation.ruleAmountPositive': 'Amount must be greater than zero.',
    'validation.ruleEndCountInteger': 'Number of payments must be a whole number of at least 1.',
    'validation.ruleEndCountMax': 'Number of payments cannot exceed {max}.',
    'validation.ruleEndDateFormat': 'End date must be in YYYY-MM-DD format.',
    'validation.ruleEndDateBeforeStart': 'End date cannot be before the start date.',
    'validation.ruleIncomeCategory': 'Income must be Standard Income or Side Cash.',
    'validation.ruleGrossAmountPositive': 'Gross amount must be greater than zero.',
    'validation.ruleNetExceedsGross': 'Net amount cannot be more than the gross amount.',
    'validation.ruleCategoryInvalid': 'Select a valid category.',
    'notFound.recurringRule': 'That scheduled payment no longer exists.',
    'validation.ruleKindLocked': 'A scheduled payment cannot be switched between expense and income. Delete it and create a new one.',
    'validation.ruleStatusInvalid': 'Invalid status.',
  } satisfies Record<ServerErrorCode, string>,

  goalModal: {
    titleAdd: 'Add goal',
    titleEdit: 'Edit goal',
    saving: 'Saving goal…',
    deletingOverlay: 'Deleting goal…',
    deleteConfirm: 'Delete this goal?',
    deleteBody: 'will be removed. No money moves — a goal only ever recorded a share of your balance you had set aside, so that amount simply goes back to unallocated.',
    keepIt: 'Keep it',
    delete: 'Delete',
    deleting: 'Deleting…',
    name: 'Goal name',
    namePlaceholder: 'e.g. New Car',
    targetAmount: 'Target amount',
    setAsideSoFar: 'Set aside so far',
    alreadySaved: 'Already saved',
    optional: '(optional)',
    targetDate: 'Target date',
    icon: 'Icon',
    color: 'Color',
    saveChanges: 'Save changes',
  },

  budgetModal: {
    title: 'Modify budget',
    saving: 'Saving budgets…',
    loadFailed: "Couldn't load your budgets.",
    loadingBudgets: 'Loading your budgets…',
    intro: 'Set an annual budget for each category. Leave a box blank for no budget — that category stays hidden on the Budgets page until you spend something in it.',
    estimatedIncome: 'Estimated annual income',
    tooltipLabel: 'How estimated annual income is calculated',
    // Split into parts because the original interleaves <strong> runs with
    // plain prose. Each part is a whole clause, so word order inside it is
    // free to differ between languages.
    tooltipHeadline: 'Take-home Standard Income over the last 12 months, divided by the number of months you were recording, × 12.',
    tooltipBody: 'Side Cash is excluded, and this is take-home (net) pay rather than salary before deductions. A month where you were recording but received no pay counts as zero; a stretch of 3 or more months with nothing recorded at all is skipped as time you were not using Pebble. The month in progress is left out until it finishes.',
    // {range} is server-generated and stays English - see the note at the
    // call site.
    tooltipCounts: 'Counts {range}.',
    tooltipRangeFallback: 'the last 12 complete months',
    tooltipFixed: 'Fixed to the last 12 months',
    tooltipFixedRest: '— recent enough to follow a change of job, long enough to cover a full year. The Analysis page shows the same calculation over whichever period you select there, so the two agree when that is set to Last 12 months.',
    recordedMonthsOne: '{count} recorded month',
    recordedMonthsOther: '{count} recorded months',
    incomeFallback: 'Based on your Standard Income history',
    totalBudgeted: 'Total budgeted',
    perYear: '/ yr',
    saveBudgets: 'Save budgets',
    estimateModeLabel: 'Income estimate',
    estimateModeSystem: 'System estimate (last 12 months)',
    estimateModeManual: 'Enter manually',
    manualAmountLabel: 'Paycheck amount',
    manualFrequencyLabel: 'How often',
    // Matches d.recurring.frequencies' wording for the four overlapping
    // options; semimonthly is new and exists only here - see the type's
    // own comment in usePebbleStore.ts.
    frequencies: {
      weekly: 'Weekly',
      biweekly: 'Every 2 weeks',
      semimonthly: 'Twice a month',
      monthly: 'Monthly',
      yearly: 'Yearly',
    },
    importButton: 'Import latest',
    importAria: 'Import your most recent paycheck amount',
    importNoData: 'No income transactions to import yet',
    manualTooltip: 'This estimate comes from the amount and frequency you enter below — it does not look at your transaction history.',
    manualAnnualNote: 'Annualized from your entry — not calculated from your transaction history.',
    estimatedSavings: 'Estimated savings',
    estimatedDeficit: 'Estimated shortfall',
    estMonthlyLabel: 'Est. monthly: {amount}',
  },

  goals: {
    allocatedTitle: 'Your money, allocated',
    allocatedBlurb:
      'Goals do not hold money of their own. Each one records a share of your existing balance that you have set aside, so the figures below always add up to what you actually have.',
    totalBalance: 'Total balance',
    setAside: 'Set aside for goals',
    unallocated: 'Unallocated',
    overAllocated:
      'You have set aside {amount} more than your balance holds. That is allowed — it just means the goals below are counting on money that is not there yet.',
    emptyTitle: 'No goals yet',
    // {action} is the header button's label, interpolated rather than
    // concatenated so the quoted name can sit anywhere in the sentence.
    emptyHint: 'Use “{action}” above to set one up.',
  },
};
