/**
 * Strings for the redesigned analysis UI, reached as d.ux.analysis.<key>.
 *
 * Kept in its own file (mounted under `ux` in en.ts / zh.ts) so each area's
 * new text lives beside the others without editing the two big dictionaries.
 * Same rules as en.ts: labels only - never a stored or compared value - and
 * {braces} for interpolation through t(). The Chinese object is typed as the
 * English one, so a missing translation is a compile error.
 */
export const analysisEn = {
  // Period bar
  windowShort: {
    '3m': '3M',
    '6m': '6M',
    '12m': '12M',
    ytd: 'YTD',
    all: 'All',
  },
  jumpTo: 'Jump to a section',
  overview: 'Overview',
  outlook: 'Outlook',
  loading: 'Loading analysis',

  // Scope badges
  followsPeriod: 'Follows the period: {range}',
  periodLinkAria: '{label} - set by the analysis period. Go to it',
  allHistory: 'All history',
  next3Months: 'Next 3 months',
  estimate: 'Estimate',

  // At a glance
  atAGlance: 'At a glance',
  heroKept: 'Over {range} you kept {pct} of your take-home pay, about {amount} a month.',
  heroOverspent: 'Over {range} you spent about {amount} a month more than you earned.',
  heroNoIncome: 'No take-home pay was recorded over {range}, so there is no savings rate yet.',
  avgIncome: 'Avg monthly income',
  avgSpend: 'Avg monthly spend',
  monthsRecorded: 'Months recorded',
  monthsOf: '{count} of {total}',
  vsAvgPct: '{pct} vs avg',
  lastMonthMore: 'Last month ({month}) was {value} above your average',
  lastMonthLess: 'Last month ({month}) was {value} below your average',
  lastMonthSame: 'Last month ({month}) matched your average',
  lastMonthNote: 'last month vs average',
  monthRecorded: '{month}: recorded',
  monthDormant: '{month}: nothing recorded',
  trendLabel: '{name}, month by month over the period',

  // Month so far
  dayOf: 'of {total}',
  dayRing: 'Day {day} of {total}',
  typicalByNow: 'Typical by today',
  moreThanUsual: 'About {amount} more than usual by now',
  lessThanUsual: 'About {amount} less than usual by now',
  aboutUsual: 'About the same as usual by now',
  typicalMonth: 'Typical month',
  thisMonth: 'This month',
  cumulativeLabel: 'Spending so far this month, day by day, against a typical month',
  dayTick: 'Day {day}',

  // Charts
  chartView: 'Chart view',
  viewNet: 'Net',
  viewInOut: 'In & out',
  viewRate: 'Rate',
  viewPaycheck: 'Paycheck',
  inOutTooltip: 'In & out shows each month’s income above the line and spending below it, with the net as a line.',
  paycheckTooltip: 'Paycheck shows each month’s gross pay split into take-home and withheld.',
  avgLine: 'avg {amount}',
  vsAverage: '{pct} vs average',
  takeHome: 'Take-home',
  withheld: 'Withheld',
  gross: 'Gross',
  savingsRate: 'Savings rate',
  net: 'Net',
  income: 'Income',
  spending: 'Spending',
  noPay: 'No pay this month',

  // Year by year table
  year: 'Year',
  saved: 'Saved',
  soFar: 'so far',

  // Seasonality heatmap
  heatTitle: 'Every month, every year',
  heatTooltipLabel: 'How to read this grid',
  heatTooltip: 'Each square is one month of your history. In Net, green months kept money and wine months drew it down; the stronger the colour, the bigger the amount. In Spending, the stronger the colour, the more you spent. The month in progress is outlined and never coloured, because it is not finished.',
  heatNet: 'Net',
  heatSpending: 'Spending',
  keptMore: 'Kept more',
  spentMore: 'Spent more',
  lessSpent: 'Less',
  moreSpent: 'More',
  inProgress: 'In progress',
  noActivity: 'No activity',
  notYet: 'Not yet',
  cellNet: '{month}: net {amount}',
  cellSpend: '{month}: spent {amount}',
  cellProgress: '{month}: in progress',
  cellEmpty: '{month}: no activity',
  cellFuture: '{month}: not yet',
  heatHint: 'Point at or tap a month for its figures.',
  heatPrev: 'Previous month',
  heatNext: 'Next month',
  heatGrid: 'Monthly net by year',
  heatGridSpend: 'Monthly spending by year',

  // Projection
  today: 'Today',
  flat: 'Flat',
  seasonal: 'Seasonal',
  seasonalGap: 'Seasonal exposure',
  pathLabel: 'Balance today and both year-end estimates on one scale',
  yearDone: '{pct} of the year gone',

  // Budget pace
  overBudget: 'Over budget',
  aheadOfPace: 'Ahead of pace',
  onPace: 'On pace',
  paceMarker: 'You are {pct} through the year',

  // Coming up
  showMore: 'Show {count} more',
  showLess: 'Show less',
  inOutSplit: 'Due in compared with due out',
  monthTotals: '{label} totals',

  // Income
  stabilityMeter: 'Income variation {pct}%, on a scale from very steady to highly variable',
  splitLabel: 'Take-home {net}% and withheld {withheld}% of gross pay',

  // Cushion and commitments
  cushion: 'Cushion',
  cushionSub: 'How long your balance lasts',
  fixedShare: 'Fixed costs are about {pct} of your average monthly spend (a standing figure against the period’s average).',
  commitSplit: 'Committed out compared with committed in',

  // Top categories
  other: 'Other',
  otherCount: '{count} more categories',

  // Empty states
  noCompleteTitle: 'Your first month is still under way',
  incomeEmptyTitle: 'No income here',
  spendingEmptyTitle: 'No spending here',
  nothingDueTitle: 'Nothing coming up',
  addTransaction: 'Add transaction',
  addSchedule: 'Add schedule',
};

export const analysisZh: typeof analysisEn = {
  windowShort: {
    '3m': '3个月',
    '6m': '6个月',
    '12m': '12个月',
    ytd: '今年',
    all: '全部',
  },
  jumpTo: '跳转到板块',
  overview: '概览',
  outlook: '展望',
  loading: '正在加载分析',

  followsPeriod: '随时间段变化：{range}',
  periodLinkAria: '{label}，由分析时间段决定。前往设置',
  allHistory: '全部历史',
  next3Months: '未来三个月',
  estimate: '估算',

  atAGlance: '一览',
  heroKept: '在{range}期间，你留下了到手收入的{pct}，约每月{amount}。',
  heroOverspent: '在{range}期间，你平均每月比收入多花约{amount}。',
  heroNoIncome: '{range}期间没有记录到手收入，暂无储蓄率。',
  avgIncome: '月均收入',
  avgSpend: '月均支出',
  monthsRecorded: '已记录月数',
  monthsOf: '{count} / {total}',
  vsAvgPct: '较平均 {pct}',
  lastMonthMore: '上月（{month}）比平均高 {value}',
  lastMonthLess: '上月（{month}）比平均低 {value}',
  lastMonthSame: '上月（{month}）与平均持平',
  lastMonthNote: '上月对比平均',
  monthRecorded: '{month}：有记录',
  monthDormant: '{month}：无记录',
  trendLabel: '{name}，本时间段逐月走势',

  dayOf: '/ {total} 天',
  dayRing: '第 {day} 天，共 {total} 天',
  typicalByNow: '往常此时',
  moreThanUsual: '比往常此时多约 {amount}',
  lessThanUsual: '比往常此时少约 {amount}',
  aboutUsual: '与往常此时差不多',
  typicalMonth: '典型月份',
  thisMonth: '本月',
  cumulativeLabel: '本月逐日累计支出，与典型月份对比',
  dayTick: '{day}日',

  chartView: '图表视图',
  viewNet: '净额',
  viewInOut: '收支',
  viewRate: '比率',
  viewPaycheck: '工资',
  inOutTooltip: '“收支”视图把每月收入画在零线上方、支出画在下方，净额以折线表示。',
  paycheckTooltip: '“工资”视图把每月税前工资拆分为到手部分和预扣部分。',
  avgLine: '平均 {amount}',
  vsAverage: '较平均 {pct}',
  takeHome: '到手',
  withheld: '预扣',
  gross: '税前',
  savingsRate: '储蓄率',
  net: '净额',
  income: '收入',
  spending: '支出',
  noPay: '本月无工资',

  year: '年份',
  saved: '结余',
  soFar: '截至目前',

  heatTitle: '历年每月',
  heatTooltipLabel: '如何解读这张图',
  heatTooltip: '每格代表你历史中的一个月。在“净额”下，绿色表示当月有结余，酒红色表示动用了存款；颜色越深，金额越大。在“支出”下，颜色越深表示花得越多。进行中的月份只画轮廓、不着色，因为它还没结束。',
  heatNet: '净额',
  heatSpending: '支出',
  keptMore: '结余更多',
  spentMore: '支出更多',
  lessSpent: '较少',
  moreSpent: '较多',
  inProgress: '进行中',
  noActivity: '无记录',
  notYet: '尚未到来',
  cellNet: '{month}：净额 {amount}',
  cellSpend: '{month}：支出 {amount}',
  cellProgress: '{month}：进行中',
  cellEmpty: '{month}：无记录',
  cellFuture: '{month}：尚未到来',
  heatHint: '指向或轻点某个月份查看数字。',
  heatPrev: '上个月',
  heatNext: '下个月',
  heatGrid: '按年份排列的每月净额',
  heatGridSpend: '按年份排列的每月支出',

  today: '今天',
  flat: '平均估算',
  seasonal: '季节性调整',
  seasonalGap: '季节性差额',
  pathLabel: '今天的余额与两种年末估算，画在同一刻度上',
  yearDone: '今年已过去 {pct}',

  overBudget: '超出预算',
  aheadOfPace: '快于进度',
  onPace: '进度正常',
  paceMarker: '今年已过去 {pct}',

  showMore: '再显示 {count} 项',
  showLess: '收起',
  inOutSplit: '应收与应付对比',
  monthTotals: '{label}合计',

  stabilityMeter: '收入波动 {pct}%，刻度从非常稳定到波动很大',
  splitLabel: '到手占税前 {net}%，预扣占 {withheld}%',

  cushion: '缓冲',
  cushionSub: '你的余额能撑多久',
  fixedShare: '固定支出约占你月均支出的 {pct}（固定数值与本时间段平均值的对比）。',
  commitSplit: '固定支出与固定收入对比',

  other: '其他',
  otherCount: '另外 {count} 个类别',

  noCompleteTitle: '第一个月还没结束',
  incomeEmptyTitle: '这里没有收入',
  spendingEmptyTitle: '这里没有支出',
  nothingDueTitle: '近期没有安排',
  addTransaction: '添加交易',
  addSchedule: '添加定期',
};
