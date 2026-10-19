/**
 * Strings for the redesigned dashboard UI, reached as d.ux.dashboard.<key>.
 *
 * Kept in its own file (mounted under `ux` in en.ts / zh.ts) so each area's
 * new text lives beside the others without editing the two big dictionaries.
 * Same rules as en.ts: labels only - never a stored or compared value - and
 * {braces} for interpolation through t(). The Chinese object is typed as the
 * English one, so a missing translation is a compile error.
 */
export const dashboardEn = {
  // Hero
  seeAllAccounts: 'See all accounts',
  allocationLabel: 'How much of your balance is set aside for goals',
  overAllocated: 'More than your balance',
  balanceHistory: 'Balance history',
  balanceHistoryLink: 'Balance history over the last {period}, on the Accounts page',

  // Period command bar
  periodType: 'Period type',
  periodPick: 'Period',
  // A quarter's short name for a narrow phone (Chinese only; English keeps its label).
  quarterShort: '{year} Q{q}',
  prevPeriod: 'Previous period',
  nextPeriod: 'Next period',
  inProgressQuarter: '· includes this quarter so far',
  inProgressYear: '· includes this year so far',
  inProgressToday: '· includes today',

  // Figure tiles: change against the previous comparable period. Labels
  // never carry an amount - they double as the chip's hover title.
  vsRange: 'vs {range}',
  deltaMore: '{pct} more than {range}',
  deltaLess: '{pct} less than {range}',
  deltaSame: 'Same as {range}',
  ptsText: '{pts} pts',
  ptsHigher: '{pts} points higher than {range}',
  ptsLower: '{pts} points lower than {range}',
  savedMore: 'More saved than {range}',
  savedLess: 'Less saved than {range}',
  noEarlier: 'No earlier period yet',
  // The comparison's own explanation (hover on a Mac, tap on a phone).
  // A hidden suffix to the chip's visible text, which stays its name.
  compareOpen: '(show the figures)',
  compareTitle: 'Compared with {range}',
  compareNow: 'This period so far',
  compareNowDone: 'This period',

  // Income vs spending
  savedSoFar: 'Saved so far',
  inProgress: 'In progress',
  mostSpentWeek: 'Most spent: week of {label}',
  mostSpentMonth: 'Most spent: {label}',
  flowFacts: 'Averages for this period',
  avgIncome: 'Income per full {unit}',
  avgSpending: 'Spending per full {unit}',
  unitWeek: 'week',

  // Where it went
  uncategorised: 'Uncategorised',
  shareOfSpending: '{share} of spending',

  // Upcoming
  cardPayments: 'Card payments',
  upcomingTotals: 'In {income} · Out {expense} over the next 14 days',
  upcomingTotalsNote: 'Scheduled amounts as stored, not a projected balance.',
  showLess: 'Show less',
  railLabel: 'Next 14 days, day by day',
  railDay: '{date}: {count} scheduled',
  railDayOne: '{date}: 1 scheduled',
  railDayNone: '{date}: nothing scheduled',
  showAllDays: 'Show all days',
  nothingThatDay: 'Nothing scheduled that day.',

  // Spending pace
  paceTitle: 'Spending pace',
  spentSoFar: 'Spent {amount} so far',
  spentTotal: 'Spent {amount}',
  paceLess: '{amount} less than this point last {unit}',
  paceMore: '{amount} more than this point last {unit}',
  paceSame: 'About the same as this point last {unit}',
  paceLessDone: '{amount} less than last {unit}',
  paceMoreDone: '{amount} more than last {unit}',
  paceSameDone: 'About the same as last {unit}',
  paceNoPrev: 'Nothing earlier to compare with yet.',
  unitMonth: 'month',
  unitQuarter: 'quarter',
  unitYear: 'year',
  unitPeriod: 'period',
  legendLast: 'Last period',
  legendBudget: 'Budget pace',
  paceEmpty: 'No spending yet this period',
  paceEmptyBody: 'Spending you record is drawn here day by day, beside the period before.',
  paceChartLabel: 'Cumulative spending this period, compared with the period before',
  dayN: 'Day {n}',
  paceFacts: 'This period in numbers',
  paceDailyAvg: 'Daily average',
  paceLastTotal: "Last {unit}'s total",
  paceBudget: 'Budget this {unit}',
  paceDaysLeft: 'Days left',

  // Needs attention and goals
  noBudget: 'No budget',
  setBudgets: 'Set budgets',
  paceMarker: 'Where spending would be by today, on an even pace',
  goalOf: '{current} of {target}',
  reached: 'Reached',
  noGoalsBody: 'Set money aside for something and watch it fill up here.',
  // Footer under one or two goals.
  goalsTogether: 'All goals together',

  // Recent activity
  yesterday: 'Yesterday',
  showMoreRecent: 'Show more',
  noTxnTitle: 'No transactions yet',
  noTxnBody: 'Add your first one and it will show up here.',
};

export const dashboardZh: typeof dashboardEn = {
  seeAllAccounts: '查看全部账户',
  allocationLabel: '余额中为目标预留的部分',
  overAllocated: '超过了余额',
  balanceHistory: '余额走势',
  balanceHistoryLink: '近 {period}的余额走势，前往账户页查看',

  periodType: '周期类型',
  periodPick: '周期',
  quarterShort: '{year}年Q{q}',
  prevPeriod: '上一期',
  nextPeriod: '下一期',
  inProgressQuarter: '· 含本季度至今',
  inProgressYear: '· 含今年至今',
  inProgressToday: '· 含今天',

  vsRange: '对比{range}',
  deltaMore: '比{range}多 {pct}',
  deltaLess: '比{range}少 {pct}',
  deltaSame: '与{range}持平',
  ptsText: '{pts} 个点',
  ptsHigher: '比{range}高 {pts} 个百分点',
  ptsLower: '比{range}低 {pts} 个百分点',
  savedMore: '比{range}存得多',
  savedLess: '比{range}存得少',
  noEarlier: '暂无上一期可比',
  compareOpen: '（查看具体数字）',
  compareTitle: '对比{range}',
  compareNow: '本期至今',
  compareNowDone: '本期',

  savedSoFar: '累计结余',
  inProgress: '进行中',
  mostSpentWeek: '支出最多：{label}当周',
  mostSpentMonth: '支出最多：{label}',
  flowFacts: '本期平均数',
  avgIncome: '整{unit}平均收入',
  avgSpending: '整{unit}平均支出',
  unitWeek: '周',

  uncategorised: '未分类',
  shareOfSpending: '占支出 {share}',

  cardPayments: '信用卡还款',
  upcomingTotals: '未来 14 天：收入 {income} · 支出 {expense}',
  upcomingTotalsNote: '按计划中记录的金额计算，并非预测余额。',
  showLess: '收起',
  railLabel: '未来 14 天（按日）',
  railDay: '{date}：{count} 项计划',
  railDayOne: '{date}：1 项计划',
  railDayNone: '{date}：无计划',
  showAllDays: '显示全部日期',
  nothingThatDay: '这一天没有计划。',

  paceTitle: '支出节奏',
  spentSoFar: '目前已支出 {amount}',
  spentTotal: '共支出 {amount}',
  paceLess: '比上{unit}同期少 {amount}',
  paceMore: '比上{unit}同期多 {amount}',
  paceSame: '与上{unit}同期相当',
  paceLessDone: '比上{unit}少 {amount}',
  paceMoreDone: '比上{unit}多 {amount}',
  paceSameDone: '与上{unit}相当',
  paceNoPrev: '暂时还没有可对比的数据。',
  unitMonth: '月',
  unitQuarter: '季度',
  unitYear: '年',
  unitPeriod: '期',
  legendLast: '上期',
  legendBudget: '预算节奏',
  paceEmpty: '本期暂无支出',
  paceEmptyBody: '记录的支出会按天画在这里，并与上一期对比。',
  paceChartLabel: '本期累计支出与上一期对比',
  dayN: '第 {n} 天',
  paceFacts: '本期数据',
  paceDailyAvg: '日均支出',
  paceLastTotal: '上{unit}合计',
  paceBudget: '本{unit}预算',
  paceDaysLeft: '剩余天数',

  noBudget: '无预算',
  setBudgets: '设置预算',
  paceMarker: '按均匀进度，今天应支出到的位置',
  goalOf: '{current} / {target}',
  reached: '已达成',
  noGoalsBody: '为想做的事预留一笔钱，在这里看着它慢慢攒满。',
  goalsTogether: '全部目标合计',

  yesterday: '昨天',
  showMoreRecent: '显示更多',
  noTxnTitle: '还没有交易',
  noTxnBody: '添加第一笔交易后，它会显示在这里。',
};
