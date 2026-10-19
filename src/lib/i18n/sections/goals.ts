/**
 * Strings for the redesigned goals UI, reached as d.ux.goals.<key>.
 *
 * Kept in its own file (mounted under `ux` in en.ts / zh.ts) so each area's
 * new text lives beside the others without editing the two big dictionaries.
 * Same rules as en.ts: labels only - never a stored or compared value - and
 * {braces} for interpolation through t(). The Chinese object is typed as the
 * English one, so a missing translation is a compile error.
 */
export const goalsEn = {
  // Allocation hero. Labels that double as an aria-label never carry an amount.
  aboutAllocation: 'How goals use your balance',
  allocBarLabel: 'How your balance is set aside',
  shareSetAside: '{pct}% of your balance is set aside for {count} goals',
  shareSetAsideOne: '{pct}% of your balance is set aside for 1 goal',
  noneSetAside: 'Nothing set aside yet — all of your balance is free to plan.',
  ofBalance: '{pct} of your balance',
  ofClaims: '{pct} of what goals claim',
  overBy: 'Over by {amount}',
  overShort: 'Beyond your balance',

  // Goals list
  yourGoals: 'Your goals',
  countInProgress: '{count} in progress',
  countReached: '{count} reached',
  // After a card's large current amount. Chinese uses the slash the
  // timeline and editor preview use, so it stays on one line.
  cardOfTarget: 'of {total}',
  reached: 'Reached',
  viewLabel: 'Show goals as',
  viewCards: 'Cards',
  viewTimeline: 'Timeline',

  // Time to target. {n} is a plain number.
  dueToday: 'due today',
  dueTomorrow: 'due tomorrow',
  inDays: 'in {n} days',
  inOneMonth: 'in 1 month',
  inMonths: 'in {n} months',
  inYears: 'in about {n} years',
  targetPassed: 'Target passed',
  monthlyPace: 'Set aside about {amount} a month to make it',
  monthlyPaceShort: 'about {amount} a month',

  // Timeline
  timelineLabel: 'Goals by target date',
  today: 'Today',
  pastDue: 'Past target date',
  goalAria: '{name}, {pct}% there, target {date}',
  addAmountTo: 'Add amount to {name}',
  edit: 'Edit',

  // Goal editor preview
  previewName: 'Your goal',
  previewNoDate: 'Pick a target date',

  // Empty grid
  emptyBody: 'Name something you are saving for and set part of your balance aside for it. No money moves; each goal tracks its share and how much a month gets you there.',
};

export const goalsZh: typeof goalsEn = {
  aboutAllocation: '目标如何使用你的余额',
  allocBarLabel: '余额的分配情况',
  shareSetAside: '余额的 {pct}% 已为 {count} 个目标预留',
  shareSetAsideOne: '余额的 {pct}% 已为 1 个目标预留',
  noneSetAside: '还没有预留任何金额，全部余额都可自由规划。',
  ofBalance: '占余额 {pct}',
  ofClaims: '占目标预留总额 {pct}',
  overBy: '超出 {amount}',
  overShort: '超出余额的部分',

  yourGoals: '你的目标',
  countInProgress: '{count} 个进行中',
  countReached: '{count} 个已达成',
  cardOfTarget: '/ {total}',
  reached: '已达成',
  viewLabel: '目标显示方式',
  viewCards: '卡片',
  viewTimeline: '时间线',

  dueToday: '今天到期',
  dueTomorrow: '明天到期',
  inDays: '{n} 天后',
  inOneMonth: '1 个月后',
  inMonths: '{n} 个月后',
  inYears: '约 {n} 年后',
  targetPassed: '已过目标日期',
  monthlyPace: '每月约存 {amount} 即可按时达成',
  monthlyPaceShort: '约每月 {amount}',

  timelineLabel: '按目标日期排列的目标',
  today: '今天',
  pastDue: '已过目标日期',
  goalAria: '{name}，已完成 {pct}%，目标日期 {date}',
  addAmountTo: '为「{name}」添加金额',
  edit: '编辑',

  previewName: '你的目标',
  previewNoDate: '请选择目标日期',

  emptyBody: '为想存钱实现的事设一个目标，从余额中划出一部分给它。资金不会转移，每个目标只记录自己的份额，以及每月需存多少才能按时达成。',
};
