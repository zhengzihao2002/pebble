import { layoutTools, type LayoutBox, type PageLayout } from './layoutSnapshot';
export type { LayoutBox, PageLayout } from './layoutSnapshot';
export const LAYOUT_CACHE_PREFIX = layoutTools.prefix;
const TTL = 30 * 86400000;
const MAX_ENTRIES = 48;
const MAX_BOXES = 80;
const candidates = '[data-slot="card"], .add-goal-tile, .pb-annual-footer, .card, .pb-dash-hero, .pb-accounts-tile, .pb-ins-bar, .pb-ana-bar, .pb-rep-bar, .pb-rep-rail, .pb-settings-jump, .account-subnav';
const loading = '.pb-page-skeleton,.pb-dash-loading,.pb-txn-skel-page,.pb-rep-skel,.pb-ana-skel,[data-slot="skeleton"],.pb-accounts-skel,.pb-cached-layout,[aria-busy="true"]';
const clearedOwners = new Set<string>();
const rounded = (value: number) => Math.round(value * 100) / 100;
const { owner, valid } = layoutTools;
export const layoutProfile = layoutTools.profile;
export function readPageLayout(pathname: string, main: HTMLElement): PageLayout | null {
  const user = owner(), key = layoutProfile(pathname,main);
  if (!user || !key || clearedOwners.has(user)) return null;
  return layoutTools.read(pathname,main);
}
export function capturePageLayout(pathname: string): void {
  const content = document.querySelector<HTMLElement>('.pb-navigation-content');
  const main = content?.closest<HTMLElement>('.pebble-main');
  const user = owner();
  if (!content || !main || !user || clearedOwners.has(user) || content.hidden || pathname !== window.location.pathname
    || document.fonts?.status==='loading' || content.querySelector(loading) || (main.closest('.pebble-root')?.scrollTop ?? 0) > 2) return;
  const key = layoutProfile(pathname,main);
  if (!key || [...content.querySelectorAll('.pb-rise')].some(el=>el.getAnimations().some(a=>a.playState==='running'))) return;
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
    const x = rounded(rect.left-origin.x), y = Math.max(0,rounded(rect.top-origin.y));
    if (x < -100 || x >= width || y > 180000) continue;
    const s = getComputedStyle(el);
    boxes.push({ x, y, width:rounded(rect.width), height:Math.min(20000,rounded(rect.height)),
      radius:Math.min(200,parseFloat(s.borderTopLeftRadius)||0),
      kind:el.matches('.pb-dash-hero') ? 'hero' : el.matches('.pb-ins-bar,.pb-ana-bar,.pb-rep-bar,.pb-rep-rail,.pb-settings-jump,.pb-annual-footer,.account-subnav') ? 'bar' : 'card', flat:s.boxShadow === 'none' });
    if (boxes.length === MAX_BOXES) break;
  }
  if (!boxes.length) return;
  const entry: PageLayout = { key, width, height:rounded(Math.max(...boxes.map(b=>b.y+b.height), ...[...content.children].map(el=>el.getBoundingClientRect().bottom-origin.y))), savedAt:Date.now(), boxes };
  if (!valid(entry)) return;
  const saved = {entries:layoutTools.entries(user)};
  const previous = saved.entries.find(e=>e.key===key);
  if (previous && Date.now()-previous.savedAt < 86400000 && previous.width===width && previous.height===entry.height && JSON.stringify(previous.boxes)===JSON.stringify(boxes)) return;
  const entries = [entry,...saved.entries.filter(e=>e.key!==key && Date.now()-e.savedAt<TTL)].slice(0,MAX_ENTRIES);
  const raw = JSON.stringify({version:2,entries});
  try { localStorage.setItem(LAYOUT_CACHE_PREFIX+user,raw); } catch { /* quota/private browsing: keep the normal fallback */ }
}
export function clearLayoutCache() {
  const user = owner();
  if (!user) return;
  // The pagehide observer must not recreate the cache after sign-out.
  clearedOwners.add(user);
  try { localStorage.removeItem(LAYOUT_CACHE_PREFIX+user); localStorage.removeItem('pebble-layout-sizes:v1:'+user); } catch { /* optional cache */ }
}
