/**
 * Strings for the redesigned shell UI, reached as d.ux.shell.<key>.
 *
 * Kept in its own file (mounted under `ux` in en.ts / zh.ts) so each area's
 * new text lives beside the others without editing the two big dictionaries.
 * Same rules as en.ts: labels only - never a stored or compared value - and
 * {braces} for interpolation through t(). The Chinese object is typed as the
 * English one, so a missing translation is a compile error.
 */
export const shellEn = {
  // Sidebar group captions (navItems.ts NAV_GROUPS).
  groupOverview: 'Overview',
  groupUnderstand: 'Understand',
  groupPlan: 'Plan',
  // The sidebar's search row and the header field's shortcut badge.
  searchShortcut: 'Search',
  shortcutHint: 'Shortcut',
  // Header subtitles. Accounts are user-defined now, so Transactions no
  // longer names two fixed ones.
  subtitleTransactions: 'Every account, in one ledger',
  subtitleAccount: 'Profile, sign-in and security',
  // Command palette.
  legendMove: 'move',
  legendOpen: 'open',
  legendClose: 'close',
  matchedAmount: 'Amount match',
  emptyHint: 'Try a page name, a category, or an amount like 42.50.',
  previewOpen: 'Press Enter to open',
  previewPage: 'Page',
  previewAction: 'Action',
  previewSetting: 'Settings section',
  // Phone bar sheets.
  moreTitle: 'More pages',
  addTitle: 'Add',
  // Add transaction dialog.
  today: 'Today',
  yesterday: 'Yesterday',
  quickCategories: 'Quick picks',
  // Route error.
  goDashboard: 'Go to Dashboard',
};

export const shellZh: typeof shellEn = {
  // Not 概览 / 分析: those are the names of pages inside the groups.
  groupOverview: '账目',
  groupUnderstand: '复盘',
  groupPlan: '规划',
  searchShortcut: '搜索',
  shortcutHint: '快捷键',
  subtitleTransactions: '所有账户，一本账',
  subtitleAccount: '个人资料、登录与安全',
  legendMove: '移动',
  legendOpen: '打开',
  legendClose: '关闭',
  matchedAmount: '金额匹配',
  emptyHint: '试试页面名称、分类，或像 42.50 这样的金额。',
  previewOpen: '按回车键打开',
  previewPage: '页面',
  previewAction: '操作',
  previewSetting: '设置分组',
  moreTitle: '更多页面',
  addTitle: '添加',
  today: '今天',
  yesterday: '昨天',
  quickCategories: '常用分类',
  goDashboard: '返回概览',
};
