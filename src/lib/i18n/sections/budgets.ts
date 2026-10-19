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

  unbSummaryOne: '今年有 1 个类别未设预算，共支出 {amount}',
  unbSummaryOther: '今年有 {count} 个类别未设预算，共支出 {amount}',
};
