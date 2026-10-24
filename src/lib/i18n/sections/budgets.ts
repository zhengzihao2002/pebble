/**
 * Strings for the redesigned budgets UI, reached as d.ux.budgets.<key>.
 *
 * Kept in its own file (mounted under `ux` in en.ts / zh.ts) so each area's
 * new text lives beside the others without editing the two big dictionaries.
 * Same rules as en.ts: labels only - never a stored or compared value - and
 * {braces} for interpolation through t(). The Chinese object is typed as the
 * English one, so a missing translation is a compile error.
 */
export const budgetsEn = {
  // Year at a glance (plan card hero). Labels that double as an aria-label
  // never carry an amount.
  ringLabel: '{used}% of your budgets used, {year}% of the year gone',
  used: 'used',
  yearGone: '{pct}% of the year gone',
  todayTick: 'Today',
  forecastLabel: 'At this pace',
  forecastBy: '{amount} by Dec 31',
  forecastOver: '{amount} more than your budgets',
  forecastUnder: '{amount} less than your budgets',
  forecastEven: 'Right on your budgets',
  forecastEarly: 'Too early in the year for a forecast.',
  includesUnbudgeted: 'Includes {amount} spent in categories without a budget.',
  avgMonthly: '{amount} a month so far',
  leftPerMonth: '{amount} a month to year end',

  // Expected income switch
  modeSystem: 'Last 12 months',
  modeManual: 'Manual',

  // Budget list
  rowsTitle: 'Category budgets',
  paceKey: 'Even pace for today',
  groupOver: 'Over budget',
  groupCount: '{count} budgets',
  groupCountOne: '1 budget',
  loading: 'Loading your budgets…',

  // Details drawer
  viewLabel: 'Chart view',
  viewMonth: 'By month',
  viewCumulative: 'Year to date',
  evenPace: 'Even pace',
  cumulativeLabel: '{name}, spending added up through {year}',
  endOf: 'End of {month}',
  aboutMonthly: 'about {amount} a month',

  // Placeholders: a new account still sees every card, with what it needs.
  forecastNeedsBudget: 'Set a budget to see where the year is heading.',
  ribbonNeeds: 'Set at least one budget to see how your income is split between your budgets and savings.',
  incomeNeeds: 'Needs one finished month of recorded transactions to estimate. Add your income, or switch to Manual.',
  rowsEmptyTitle: 'No category budgets yet',
  rowsEmptyBody: 'Give a category a yearly budget and it shows up here with its pace through the year. Pick one from the list below.',
  unbEmptyTitle: 'Nothing is going untracked',
  unbEmptyBody: 'Spending in a category that has no budget will be listed here, so nothing slips by.',

  // Spending without a budget
  unbSummaryOne: '1 category, {amount} without a budget this year',
  unbSummaryOther: '{count} categories, {amount} without a budget this year',
};

export const budgetsZh: typeof budgetsEn = {
  ringLabel: '预算已用 {used}%，今年已过 {year}%',
  used: '已用',
  yearGone: '今年已过 {pct}%',
  todayTick: '今天',
  forecastLabel: '按当前速度',
  forecastBy: '年底约花 {amount}',
  forecastOver: '比预算多 {amount}',
  forecastUnder: '比预算少 {amount}',
  forecastEven: '与预算基本持平',
  forecastEarly: '年初数据还少，暂不预测。',
  includesUnbudgeted: '其中 {amount} 花在未设预算的类别上。',
  avgMonthly: '目前平均每月 {amount}',
  leftPerMonth: '到年底每月可用 {amount}',

  modeSystem: '近 12 个月',
  modeManual: '手动',

  rowsTitle: '分类预算',
  paceKey: '按均匀进度今天应到的位置',
  groupOver: '已超预算',
  groupCount: '{count} 项预算',
  groupCountOne: '1 项预算',
  loading: '正在加载预算…',

  viewLabel: '图表视图',
  viewMonth: '按月',
  viewCumulative: '年初至今',
  evenPace: '均匀进度',
  cumulativeLabel: '{name}，{year} 年累计支出',
  endOf: '{month}底',
  aboutMonthly: '约每月 {amount}',

  forecastNeedsBudget: '设置预算后，这里会预测全年的走向。',
  ribbonNeeds: '至少设置一项预算后，这里会展示收入如何分配到各项预算和储蓄。',
  incomeNeeds: '需要至少一个已结束月份的记录才能估算。可以先记下你的收入，或切换到“手动”。',
  rowsEmptyTitle: '还没有分类预算',
  rowsEmptyBody: '给某个类别设一个年度预算，它就会连同全年的进度出现在这里。可以从下方的列表中选一个。',
  unbEmptyTitle: '没有遗漏的支出',
  unbEmptyBody: '如果某个类别有支出却没设预算，会列在这里，避免遗漏。',

  unbSummaryOne: '今年有 1 个类别未设预算，共支出 {amount}',
  unbSummaryOther: '今年有 {count} 个类别未设预算，共支出 {amount}',
};
