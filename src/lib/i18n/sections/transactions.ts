/**
 * Strings for the redesigned transactions UI, reached as d.ux.transactions.<key>.
 *
 * Kept in its own file (mounted under `ux` in en.ts / zh.ts) so each area's
 * new text lives beside the others without editing the two big dictionaries.
 * Same rules as en.ts: labels only - never a stored or compared value - and
 * {braces} for interpolation through t(). The Chinese object is typed as the
 * English one, so a missing translation is a compile error.
 */
export const transactionsEn = {
  // Zone labels: today's figures and the month's are different things.
  todayZone: 'Today',
  thisMonth: 'This month',
  lensEyebrow: 'This month · {account}',
  deltaThisMonth: '{amount} this month',
  bridgeLabel: 'How the balance moved this month',
  // Month strip.
  months: 'Months',
  noActivityShort: 'No activity',
  // Balance chart.
  balanceChart: 'Balance this month',
  chartHint: 'Pick a day to jump to it.',
  endOfDay: 'End of day {amount}',
  inAmount: 'In {amount}',
  outAmount: 'Out {amount}',
  netAmount: 'Net {amount}',
  countOne: '1 transaction',
  countOther: '{count} transactions',
  low: 'Low · {date}',
  // Day-grouped statement.
  statement: 'Statement',
  today: 'Today',
  yesterday: 'Yesterday',
  closingOn: 'Closing balance · {date}',
  openingOn: 'Opening balance · {date}',
  colTransaction: 'Transaction',
  colCategory: 'Category',
  colAccount: 'Account',
  colAmount: 'Amount',
  colBalance: 'Balance after',
  colTotal: 'Total after',
  // Search.
  clearFilters: 'Clear filters',
  noMatchBody: 'Try another word, or clear the filters.',
  olderHint: 'Older months: ⌘K searches everything.',
  spendingMix: 'Spending by category',
  moreCategories: '+{count} more',
  // Account lens.
  lensTitle: '{account} statement',
  showStatement: 'Show statement',
  backToAll: 'Back to all accounts',
  total: 'Total',
  lensAdjInfo: 'Includes transfers in and out of this account. Within one account the two halves of a transfer no longer cancel.',
  lensAdjInfoLabel: 'About balance adjustments',
};

export const transactionsZh: typeof transactionsEn = {
  todayZone: '今天',
  thisMonth: '本月',
  lensEyebrow: '本月 · {account}',
  deltaThisMonth: '本月 {amount}',
  bridgeLabel: '本月余额变动',
  months: '月份',
  noActivityShort: '无活动',
  balanceChart: '本月余额',
  chartHint: '点选某一天即可跳到当天。',
  endOfDay: '当日结余 {amount}',
  inAmount: '收入 {amount}',
  outAmount: '支出 {amount}',
  netAmount: '净额 {amount}',
  countOne: '1 笔交易',
  countOther: '{count} 笔交易',
  low: '最低 · {date}',
  statement: '对账单',
  today: '今天',
  yesterday: '昨天',
  closingOn: '期末余额 · {date}',
  openingOn: '期初余额 · {date}',
  colTransaction: '交易',
  colCategory: '分类',
  colAccount: '账户',
  colAmount: '金额',
  colBalance: '交易后余额',
  colTotal: '交易后总额',
  clearFilters: '清除筛选',
  noMatchBody: '换个关键词试试，或清除筛选。',
  olderHint: '更早的月份：按 ⌘K 搜索全部记录。',
  spendingMix: '各分类支出',
  moreCategories: '另有 {count} 项',
  lensTitle: '{account} 对账单',
  showStatement: '查看对账单',
  backToAll: '返回全部账户',
  total: '合计',
  lensAdjInfo: '包含转入和转出此账户的转账。只看一个账户时，同一笔转账的转出和转入不再相互抵消。',
  lensAdjInfoLabel: '关于余额调整',
};
