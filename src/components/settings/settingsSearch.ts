import type { Dictionary } from '@/lib/i18n';
import { SAFETY_LOCK_KEYS } from '@/lib/safetyLocks';
import { SOUND_EVENTS } from '@/lib/sound/events';
import { LOCK_SETTING_TARGETS, SETTING_TARGETS, SOUND_SETTING_TARGETS } from './settingsTargets';

export interface SettingsSearchEntry {
  id: string;
  label: string;
  section: string;
  hint: string;
  target: string;
  href?: string;
  keywords: string[];
}

/** Display text follows the current dictionary; bilingual aliases help people
 * find a setting even when they have changed the interface language. */
function settingsEntries(d: Dictionary): SettingsSearchEntry[] {
  const money = d.settingsSections.money;
  const appearance = d.settingsSections.appearance;
  const language = d.settingsSections.languageRegion;
  const behavior = d.settingsSections.behavior;
  const account = d.account.title;
  const entry = (id: keyof typeof SETTING_TARGETS, label: string, section: string, hint: string, keywords: string[] = []): SettingsSearchEntry =>
    ({ id, label, section, hint, target: SETTING_TARGETS[id], keywords });
  return [
    entry('balances', d.modifyBalance.title, money, d.modifyBalance.blurb, ['balance adjustment correction 余额 调整']),
    entry('accounts', d.accounts.title, money, d.accounts.blurb, ['bank cash credit card add account default hibernate 银行 现金 信用卡 账户 默认 休眠']),
    { ...entry('accounts', d.ux.accounts.sortAccounts, money, d.ux.accounts.orderHint,
      [...Object.values(d.ux.accounts.sortModes), 'account order sort manual drag reorder balance high low 排序 手动 拖动 余额 高 低']), id: 'accountOrder' },
    entry('categories', d.categoryManager.title, money, d.categoryManager.blurb, ['category icon colour color rename budget 分类 图标 颜色 重命名']),
    entry('theme', d.theme.title, appearance, d.theme.blurb, ['theme palette colour color 主题 配色', ...Object.values(d.theme)]),
    entry('textSize', d.textSize.title, appearance, d.textSize.blurb, ['text size small large zoom 字号 文字 大小 缩放']),
    entry('font', d.font.title, appearance, d.font.blurb,
      [d.font.latinTitle, d.font.cjkTitle, d.font.default, d.font.system, d.font.rounded, d.font.serif, d.font.legible, 'font typeface letters numbers Chinese 字体 英文 数字 中文 黑体 宋体 楷体']),
    entry('appearance', d.appearance.title, appearance, d.appearance.blurb, ['appearance light dark system mode 外观 浅色 深色 自动']),
    entry('cardGlow', d.cardGlow.title, appearance, d.cardGlow.hint, ['card glow highlight 卡片 发光 高光']),
    entry('ambientBackground', d.ambientBackground.title, appearance, d.ambientBackground.hint, ['living background ambient fluid motion balls breathing route orbit weave sweep frost blur softness speed colour color number count 灵动 背景 流动 呼吸 光球 动画 路线 环绕 交织 扫掠 雾化 磨砂 模糊 柔和 速度 颜色 数量']),
    entry('ambientRoute', `${d.ambientBackground.title} · ${d.ambientBackground.routesTitle}`, appearance, Object.values(d.ambientBackground.routes).join(' · '), ['background route orbit weave sweep 背景 路线 环绕 交织 扫掠']),
    entry('ambientSpeed', `${d.ambientBackground.title} · ${d.ambientBackground.speedTitle}`, appearance, `${d.ambientBackground.speedSlow} → ${d.ambientBackground.speedFast}`, ['background speed slow fast 背景 速度 慢 快']),
    entry('ambientFrost', `${d.ambientBackground.title} · ${d.ambientBackground.frostTitle}`, appearance, `${d.ambientBackground.frostClear} → ${d.ambientBackground.frostSoft}`, ['background frost blur soft clear 背景 磨砂 模糊 柔和 清晰']),
    entry('ambientCount', `${d.ambientBackground.title} · ${d.ambientBackground.countTitle}`, appearance, '1 – 6', ['background balls number count 背景 光球 数量']),
    entry('ambientColours', `${d.ambientBackground.title} · ${d.ambientBackground.coloursTitle}`, appearance, d.ambientBackground.coloursHint, ['background ball colours colors theme custom 背景 光球 颜色 主题 自定']),
    entry('brandIcons', d.brandIcons.title, appearance, d.brandIcons.hint, ['brand merchant logos icons 品牌 商家 标志 图标']),
    entry('healthBar', d.healthBar.settingTitle, appearance, d.healthBar.settingHint, ['health status savings dashboard bar 健康 状态 储蓄 概览']),
    entry('chartType', d.chartType.title, appearance, d.chartType.hint, [d.chartType.donut, d.chartType.bar, 'spending chart donut bar pie 支出 图表 环形 条形']),
    entry('loadingStyle', d.ux.settings.loadingStyle, appearance, d.ux.settings.loadingStyleHint,
      [d.ux.settings.loadingSpinner, d.ux.settings.loadingCached, 'loading spinner cached cards 页面 加载 转圈 缓存 卡片']),
    entry('welcome', d.welcome.settingTitle, appearance, d.welcome.settingHint, ['welcome animation sign in 欢迎 动画 登录']),
    entry('language', d.settings.language.title, language, d.settings.language.hint, ['language English Chinese 语言 英文 中文']),
    entry('timeZone', d.settings.timeZone.title, language, d.settings.timeZone.hint, ['timezone time zone dates device travel 时区 日期 设备 旅行']),
    entry('dropdowns', d.selectMode.title, behavior, d.selectMode.hint, [d.selectMode.searchable, d.selectMode.plain, 'dropdown picker search simple 下拉 列表 搜索 简单']),
    entry('privacy', d.privacyMode.title, behavior, d.privacyMode.hint, ['privacy blur hide show amounts launch 隐私 模糊 隐藏 显示 金额 启动']),
    entry('textSelection', d.selectMode.textSelectTitle, behavior, d.selectMode.textSelectHint, ['text selection copy highlight 文字 选择 复制']),
    entry('sounds', d.sounds.title, behavior, d.sounds.blurb, ['sounds audio feedback mute volume 声音 提示音 静音 音量']),
    ...SOUND_EVENTS.map(({ key }): SettingsSearchEntry => ({
      id: `sound-${key}`, label: `${d.sounds.title} · ${d.sounds.events[key]}`, section: behavior,
      hint: d.sounds.hints[key], target: SOUND_SETTING_TARGETS[key], keywords: [
        'sounds audio feedback 声音 提示音', key.replace(/([A-Z])/g, ' $1'),
        { expenseSaved: '支出 已保存', incomeSaved: '收入 已保存', saveFailed: '保存 失败', click: '按钮 点击', goalReached: '目标 达成' }[key],
      ],
    })),
    entry('locks', d.safetyLocks.title, account, d.safetyLocks.blurb, ['safety locks prevent deletion 安全锁 删除 保护']),
    ...SAFETY_LOCK_KEYS.map((key): SettingsSearchEntry => ({
      id: `lock-${key}`, label: `${d.safetyLocks.title} · ${d.safetyLocks[key]}`, section: account,
      hint: d.safetyLocks.blurb, target: LOCK_SETTING_TARGETS[key], keywords: [
        'safety lock delete prevent 安全锁 删除 保护', key.replace(/([A-Z])/g, ' $1'),
        { deletePebbleAccount: 'Pebble 账户', deleteAccounts: '银行 现金 账户', deleteTransactions: '交易 转账 调整', deleteCategories: '分类' }[key],
      ],
    })),
    { ...entry('pebbleAccount', d.account.profileLink, account, d.account.profileHint,
      ['profile name email 个人资料 姓名 邮箱']), id: 'profile', href: '/account/settings' },
    { ...entry('pebbleAccount', d.account.securityLink, account, d.account.securityHint,
      ['security password active sessions 安全 密码 活跃 会话']), id: 'security', href: '/account/security' },
    entry('pebbleAccount', d.account.title, account, d.ux.settings.accountHint, ['sign out delete account 退出 删除账户']),
  ];
}

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().trim();

/** Detailed controls are query-only, keeping the unopened palette compact.
 * Multiple words may match different fields, e.g. "loading spinner". */
export function searchSettings(d: Dictionary, query: string): SettingsSearchEntry[] {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(/\s+/);
  return settingsEntries(d).filter((entry) => {
    const text = normalize([entry.label, entry.section, entry.hint, ...entry.keywords].join(' '));
    return words.every((word) => text.includes(word));
  }).sort((a, b) => {
    const rank = (entry: SettingsSearchEntry) => normalize(entry.label) === q ? 3 : normalize(entry.label).startsWith(q) ? 2 : normalize(entry.label).includes(q) ? 1 : 0;
    return rank(b) - rank(a);
  });
}
