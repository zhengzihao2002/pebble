/** Browser-only geometry. Never read or serialize text, HTML, amounts or data IDs. */
export interface LayoutBox {
  x: number; y: number; width: number; height: number; radius: number;
  kind: 'card' | 'hero' | 'bar'; flat: boolean;
}
export interface PageLayout {
  key: string; savedAt: number; width: number; height: number; boxes: LayoutBox[];
}
export const LAYOUT_CACHE_PREFIX = 'pebble-layout-sizes:v1:';
const TTL = 30 * 86400000;
const MAX_ENTRIES = 48;
const MAX_BOXES = 80;
const pages = new Set(['dashboard','transactions','accounts','analysis','insights','reports','budgets','budgets/plan','goals','scheduled','settings','account/settings','account/security']);
const candidates = '.card, .pb-dash-hero, .pb-accounts-tile, .pb-ins-bar, .pb-ana-bar, .pb-rep-bar, .pb-rep-rail, .pb-settings-jump, .account-subnav';
const loading = '.pb-page-skeleton,.pb-dash-loading,.pb-txn-skel-page,.pb-rep-skel,.pb-ana-skel,.pb-accounts-skel,.pb-cached-layout,[aria-busy="true"]';
const clearedOwners = new Set<string>();
const memory = new Map<string, { raw: string | null; entries: PageLayout[] }>();
const rounded = (value: number) => Math.round(value * 10) / 10;

function owner() {
  return document.querySelector<HTMLMetaElement>('meta[name="pebble-session"]')?.content.split('|')[0].slice(0,128) || null;
}
export function layoutProfile(pathname: string, main: HTMLElement): string | null {
  const path = pathname.replace(/^\/+|\/+$/g, '');
  if (!pages.has(path)) return null;
  const style = getComputedStyle(main);
  const width = main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  if (width < 100) return null;
  const html = document.documentElement;
  return JSON.stringify([path, Math.round(width), window.innerWidth, window.innerHeight,
    getComputedStyle(html).fontSize, html.lang, html.getAttribute('data-pebble-font'), html.getAttribute('data-pebble-cjk')]);
}
function valid(entry: unknown): entry is PageLayout {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as PageLayout;
  const bounded = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  return typeof e.key === 'string' && e.key.length < 500 && bounded(e.savedAt, 0, Date.now() + 60000)
    && bounded(e.width, 100, 10000) && bounded(e.height, 1, 200000)
    && Array.isArray(e.boxes) && e.boxes.length > 0 && e.boxes.length <= MAX_BOXES
    && e.boxes.every(b => b && bounded(b.x,0,e.width) && bounded(b.y,0,200000)
      && bounded(b.width,1,e.width + 1) && b.x + b.width <= e.width + 2
      && bounded(b.height,1,20000) && b.y + b.height <= e.height + 2
      && bounded(b.radius,0,200) && ['card','hero','bar'].includes(b.kind) && typeof b.flat === 'boolean');
}
function store(user: string) {
  let raw: string | null = null;
  try { raw = localStorage.getItem(LAYOUT_CACHE_PREFIX + user); } catch { return memory.get(user) ?? { raw:null, entries:[] }; }
  const previous = memory.get(user);
  if (previous && previous.raw === raw) return previous;
  let entries: PageLayout[] = [];
  try {
    if (raw && raw.length < 500000) {
      const parsed = JSON.parse(raw);
      if (parsed.version === 1 && Array.isArray(parsed.entries)) entries = parsed.entries.filter(valid)
        .filter((e: PageLayout) => Date.now() - e.savedAt < TTL).slice(0,MAX_ENTRIES);
    }
  } catch { /* corrupt or unavailable storage is only a cache miss */ }
  const result = { raw, entries };
  memory.set(user,result);
  return result;
}
export function readPageLayout(pathname: string, main: HTMLElement): PageLayout | null {
  const user = owner(), key = layoutProfile(pathname,main);
  if (!user || !key || clearedOwners.has(user)) return null;
  return store(user).entries.find(e => e.key === key && Date.now() - e.savedAt < TTL) ?? null;
}
export function capturePageLayout(pathname: string): void {
  const content = document.querySelector<HTMLElement>('.pb-navigation-content');
  const main = content?.closest<HTMLElement>('.pebble-main');
  const user = owner();
  if (!content || !main || !user || clearedOwners.has(user) || content.hidden || pathname !== window.location.pathname
    || content.querySelector(loading) || (main.closest('.pebble-root')?.scrollTop ?? 0) > 2) return;
  const key = layoutProfile(pathname,main);
  if (!key) return;
  const bounds = main.getBoundingClientRect(), style = getComputedStyle(main);
  const origin = { x:bounds.left + parseFloat(style.paddingLeft), y:bounds.top + parseFloat(style.paddingTop) };
  const width = rounded(main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
  const elements = [...content.querySelectorAll<HTMLElement>(candidates)].slice(0,500).filter(el => !el.closest('[role="dialog"],.pb-modal-overlay'));
  const visible = elements.filter(el => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden'; });
  const visibleSet = new Set(visible);
  const boxes: LayoutBox[] = [];
  for (const el of visible) {
    let nested = false;
    for (let parent = el.parentElement; parent && parent !== content; parent = parent.parentElement) {
      if (visibleSet.has(parent)) { nested = true; break; }
    }
    if (nested) continue;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, rounded(rect.left - origin.x)), y = Math.max(0, rounded(rect.top - origin.y));
    if (x >= width || y > 180000) continue;
    const s = getComputedStyle(el);
    boxes.push({ x, y, width:Math.min(rounded(rect.width),width-x), height:Math.min(20000,rounded(rect.height)),
      radius:Math.min(200,parseFloat(s.borderTopLeftRadius)||0),
      kind:el.matches('.pb-dash-hero') ? 'hero' : el.matches('.pb-ins-bar,.pb-ana-bar,.pb-rep-bar,.pb-rep-rail,.pb-settings-jump,.account-subnav') ? 'bar' : 'card', flat:s.boxShadow === 'none' });
    if (boxes.length === MAX_BOXES) break;
  }
  if (!boxes.length) return;
  const entry: PageLayout = { key, width, height:rounded(Math.max(...boxes.map(b=>b.y+b.height))), savedAt:Date.now(), boxes };
  if (!valid(entry)) return;
  const saved = store(user);
  const previous = saved.entries.find(e=>e.key===key);
  if (previous && Date.now()-previous.savedAt < 86400000 && previous.width===width && previous.height===entry.height && JSON.stringify(previous.boxes)===JSON.stringify(boxes)) return;
  const entries = [entry,...saved.entries.filter(e=>e.key!==key && Date.now()-e.savedAt<TTL)].slice(0,MAX_ENTRIES);
  const raw = JSON.stringify({version:1,entries});
  memory.set(user,{raw,entries});
  try { localStorage.setItem(LAYOUT_CACHE_PREFIX+user,raw); } catch { /* quota/private browsing: keep the normal fallback */ }
}
export function clearLayoutCache() {
  const user = owner();
  if (!user) return;
  // The pagehide observer must not recreate the cache after sign-out.
  clearedOwners.add(user);
  memory.delete(user);
  try { localStorage.removeItem(LAYOUT_CACHE_PREFIX+user); } catch { /* optional cache */ }
}
