/**
 * Strings for the redesigned settings UI, reached as d.ux.settings.<key>.
 *
 * Kept in its own file (mounted under `ux` in en.ts / zh.ts) so each area's
 * new text lives beside the others without editing the two big dictionaries.
 * Same rules as en.ts: labels only - never a stored or compared value - and
 * {braces} for interpolation through t(). The Chinese object is typed as the
 * English one, so a missing translation is a compile error.
 */
export const settingsEn = {
  // Overview card at the top of the page. Each chip names a setting and its
  // current value; pressing it scrolls to the section that holds it.
  overviewLabel: 'Settings at a glance',
  overviewAmounts: 'Amounts at launch',
  amountsBlurred: 'Blurred',
  amountsShown: 'Shown',
  locksOn: '{count} of {total} on',
  // The phone jump bar: short names so all five fit on one line.
  jumpTo: 'Jump to section',
  jumpMoney: 'Money',
  jumpAppearance: 'Look',
  jumpLanguage: 'Language',
  jumpBehavior: 'Behavior',
  jumpAccount: 'Account',
  // One quiet line under each section title.
  moneyHint: 'Balances, accounts and categories',
  appearanceHint: 'Theme, text and how the dashboard looks',
  languageHint: 'Language and the timezone dates follow',
  behaviorHint: 'Dropdowns, privacy, text selection and sounds',
  accountHint: 'Safety locks, sign-in and your data',
  // Accounts card.
  acrossAccounts: 'Across {count} accounts',
  acrossOne: 'Across 1 account',
  sleepingCount: '{count} sleeping',
  utilisation: '{pct}% used',
  dueInDays: 'Due in {count} days',
  dueTomorrow: 'Due tomorrow',
  dueToday: 'Due today',
  // Adjust a balance: the before -> after pair.
  balanceAfter: 'After',
  // Shown in the action row until an amount gives a change to preview.
  adjustIdle: 'Enter an amount to see the change and the new balance.',
  // Categories card.
  filterCategories: 'Filter categories',
  noCategoryMatch: 'No categories match “{query}”.',
  categoryCount: '{count} categories',
  categoryOne: '1 category',
  previewChip: 'Preview',
};

export const settingsZh: typeof settingsEn = {
  overviewLabel: '设置概览',
  overviewAmounts: '启动时的金额',
  amountsBlurred: '模糊',
  amountsShown: '显示',
  locksOn: '已开启 {count}/{total}',
  jumpTo: '跳转到分区',
  jumpMoney: '财务',
  jumpAppearance: '外观',
  jumpLanguage: '语言',
  jumpBehavior: '行为',
  jumpAccount: '账户',
  moneyHint: '余额、账户与分类',
  appearanceHint: '主题、文字与总览的显示方式',
  languageHint: '界面语言与日期所用的时区',
  behaviorHint: '下拉列表、隐私、文字选择与声音',
  accountHint: '安全锁、登录与你的数据',
  acrossAccounts: '共 {count} 个账户',
  acrossOne: '共 1 个账户',
  sleepingCount: '{count} 个休眠',
  utilisation: '已用 {pct}%',
  dueInDays: '{count} 天后还款',
  dueTomorrow: '明天还款',
  dueToday: '今天还款',
  balanceAfter: '调整后',
  adjustIdle: '输入金额后，这里会显示变动和调整后的余额。',
  filterCategories: '筛选分类',
  noCategoryMatch: '没有与“{query}”匹配的分类。',
  categoryCount: '{count} 个分类',
  categoryOne: '1 个分类',
  previewChip: '预览',
};
