/**
 * Strings for the redesigned scheduled UI, reached as d.ux.scheduled.<key>.
 *
 * Kept in its own file (mounted under `ux` in en.ts / zh.ts) so each area's
 * new text lives beside the others without editing the two big dictionaries.
 * Same rules as en.ts: labels only - never a stored or compared value - and
 * {braces} for interpolation through t(). The Chinese object is typed as the
 * English one, so a missing translation is a compile error.
 */
export const scheduledEn = {
  // Summary hero
  heroTitle: 'Every month, on schedule',
  heroNote: 'Active repeating schedules as a monthly average. One-offs and paused schedules are left out.',
  aboutHero: 'About these figures',
  perMonthIn: 'In per month',
  perMonthOut: 'Out per month',
  perMonthNet: 'Net per month',
  windowTotals: 'Next {days} days: {in} in · {out} out',
  nextUp: 'Next up',
  inDays: 'in {count} days',
  cumulativeLabel: 'Scheduled cash flow, next {days} days',
  netBy: 'Net by {date}',

  // Calendar
  calendar: 'Calendar',
  calendarSub: 'Pick a day to jump to it',
  calDay: '{date}: {count} scheduled',
  calDayOne: '{date}: 1 scheduled',
  prevMonth: 'Previous month',
  nextMonth: 'Next month',
  legendIn: 'Money in',
  legendOut: 'Money out',
  showCalendar: 'Show calendar',
  hideCalendar: 'Hide calendar',

  // Timeline
  showAll: 'Show all {count}',
  showLess: 'Show less',
  dayCountOne: '1 item',
  dayCount: '{count} items',

  // Schedule list
  howItWorks: 'How schedules work',
  countSub: '{count} schedules · {active} active',
  countSubOne: '1 schedule',
  filterLabel: 'Show schedules',
  filterAll: 'All',
  filterActive: 'Active',
  filterPaused: 'Paused',
  filterFinished: 'Finished',
  filterEmpty: 'No schedules in this view.',
  sectionIncome: 'Income',
  sectionPayments: 'Payments',
  perMonthApprox: '≈ {amount} / month',
  nextOn: 'Next {date}',
  progress: '{done} of {total} done',
  emptyTitle: 'No schedules yet',
  oneOff: 'One-off',
  repeating: 'Repeating',

  // Rule dialog
  previewTitle: 'What this does',
  previewNextDates: 'Next dates',
  previewTotal: '{count} payments, {amount} in total',
  previewCount: '{count} payments',
  previewLastOn: 'last on {date}',
  previewMonthly: 'about {amount} a month, with no end date',
  previewIncomplete: 'Fill in the dates to see when this runs.',
  previewNone: 'No payment falls on or before the end date.',
  quickNextMonth: '1st of next month',
  quickPicks: 'Quick picks',
  quickCountAria: 'Set {count} payments',
  endModeShort: { never: 'Never', after: 'By count', on: 'By date' },
};

export const scheduledZh: typeof scheduledEn = {
  heroTitle: '每月固定收支',
  heroNote: '按月平均计算进行中的重复日程，不含一次性和已暂停的日程。',
  aboutHero: '关于这些数字',
  perMonthIn: '每月收入',
  perMonthOut: '每月支出',
  perMonthNet: '每月净额',
  windowTotals: '未来 {days} 天：收入 {in}，支出 {out}',
  nextUp: '即将到来',
  inDays: '{count} 天后',
  cumulativeLabel: '未来 {days} 天的计划现金流',
  netBy: '截至 {date} 净额',

  calendar: '日历',
  calendarSub: '点选某天即可跳转',
  calDay: '{date}：{count} 项计划',
  calDayOne: '{date}：1 项计划',
  prevMonth: '上个月',
  nextMonth: '下个月',
  legendIn: '收入',
  legendOut: '支出',
  showCalendar: '显示日历',
  hideCalendar: '收起日历',

  showAll: '显示全部 {count} 项',
  showLess: '收起',
  dayCountOne: '1 项',
  dayCount: '{count} 项',

  howItWorks: '日程如何运作',
  countSub: '共 {count} 个日程 · {active} 个进行中',
  countSubOne: '1 个日程',
  filterLabel: '筛选日程',
  filterAll: '全部',
  filterActive: '进行中',
  filterPaused: '已暂停',
  filterFinished: '已完成',
  filterEmpty: '这里没有日程。',
  sectionIncome: '收入',
  sectionPayments: '支出',
  perMonthApprox: '约 {amount}/月',
  nextOn: '下次 {date}',
  progress: '已完成 {done}/{total}',
  emptyTitle: '还没有日程',
  oneOff: '一次性',
  repeating: '重复',

  previewTitle: '这个日程会做什么',
  previewNextDates: '接下来的日期',
  previewTotal: '共 {count} 笔，合计 {amount}',
  previewCount: '共 {count} 笔',
  previewLastOn: '最后一笔在 {date}',
  previewMonthly: '约每月 {amount}，没有结束日期',
  previewIncomplete: '填好日期即可查看执行时间。',
  previewNone: '结束日期之前没有任何一笔。',
  quickNextMonth: '下月 1 日',
  quickPicks: '快捷选择',
  quickCountAria: '设为 {count} 笔',
  endModeShort: { never: '永不', after: '按次数', on: '按日期' },
};
