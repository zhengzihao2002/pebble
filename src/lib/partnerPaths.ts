export const PARTNER_VIEW_COOKIE = 'pebble-partner-view';
export const PARTNER_SECTIONS = ['dashboard', 'accounts', 'transactions', 'reports', 'analysis', 'insights', 'budgets', 'goals', 'scheduled', 'settings'] as const;
export type PartnerSection = (typeof PARTNER_SECTIONS)[number];

export function isPartnerSection(value: string): value is PartnerSection {
  return PARTNER_SECTIONS.some(section => section === value);
}

export function isPartnerPath(path: string) {
  return path === '/partner' || path.startsWith('/partner/');
}

export function workspacePath(path: string) {
  return isPartnerPath(path) ? path.slice('/partner'.length) || '/dashboard' : path;
}

export function partnerSectionPath(path: string) {
  if (!path.startsWith('/') || path.startsWith('//') || isPartnerPath(path)) return path;
  const section = path.split(/[/?#]/)[1];
  if (section === 'account') return '/partner/settings';
  if (!isPartnerSection(section)) return path;
  // The annual planner and owner settings are reached only from the owner's workspace.
  return path.startsWith('/budgets/') ? '/partner/budgets' : '/partner' + path;
}

export function selectedPartnerPair(userId: string, value: string | undefined) {
  const prefix = userId + ':';
  const pair = value?.startsWith(prefix) ? value.slice(prefix.length) : '';
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(pair) ? pair : null;
}
