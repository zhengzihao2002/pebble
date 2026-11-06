/** Self-contained so the same validated restore can run before React loads. */
export function bottomNavSnapshot() {
  const prefix = 'pebble-bottom-nav:v1:';
  interface Geometry { key: string; savedAt: number; height: number; left: number; top: number; width: number; itemHeight: number }
  function identity() {
    return document.querySelector<HTMLMetaElement>('meta[name="pebble-session"]')?.content.split('|')[0].slice(0,128);
  }
  function profile(nav: HTMLElement) {
    const html = document.documentElement;
    return JSON.stringify([location.pathname, nav.clientWidth, innerWidth, getComputedStyle(html).fontSize,
      html.lang, html.getAttribute('data-pebble-font'), html.getAttribute('data-pebble-cjk'), getComputedStyle(nav).paddingBottom]);
  }
  function entries(user: string): Geometry[] {
    try {
      const raw = localStorage.getItem(prefix+user);
      if (!raw || raw.length > 30000) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((e): e is Geometry => {
        const finite = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
        return !!e && typeof e.key === 'string' && e.key.length < 500
          && finite(e.savedAt,Date.now()-30*86400000,Date.now()+60000)
          && finite(e.height,24,500) && finite(e.itemHeight,16,e.height)
          && finite(e.width,16,300) && finite(e.left,0,10000) && finite(e.top,0,e.height)
          && e.top+e.itemHeight <= e.height+1;
      }).slice(0,32);
    } catch { return []; }
  }
  function restore(nav: HTMLElement) {
    const user = identity();
    if (!user || innerWidth >= 760 || !nav.clientWidth) return;
    const saved = entries(user).find(e=>e.key===profile(nav));
    const indicator = nav.querySelector<HTMLElement>('.pb-nav-glass-indicator');
    if (!saved || !indicator || saved.left+saved.width > nav.clientWidth+1) return;
    nav.style.minHeight = saved.height+'px';
    Object.assign(indicator.style,{width:saved.width+'px',height:saved.itemHeight+'px',transform:`translate3d(${saved.left}px, ${saved.top}px, 0)`});
    nav.dataset.pbGlassReady = 'true';
    nav.dataset.pbNavRestored = 'true';
  }
  function capture(nav: HTMLElement) {
    const user = identity();
    if (!user || innerWidth >= 760 || document.fonts?.status === 'loading') return;
    const target = nav.querySelector<HTMLElement>('[data-pb-nav-selected="true"]');
    if (!target) return;
    const box = nav.getBoundingClientRect(), item = target.getBoundingClientRect();
    if (box.width < 100 || item.width < 1 || box.height < 24) return;
    const width = Math.min(item.width,parseFloat(getComputedStyle(document.documentElement).fontSize)*4.75);
    const entry: Geometry = {key:profile(nav),savedAt:Date.now(),height:box.height,width,itemHeight:item.height,
      left:item.left-box.left-nav.clientLeft+(item.width-width)/2,top:item.top-box.top-nav.clientTop};
    const previous = entries(user);
    const same = previous.find(e=>e.key===entry.key);
    if (same && Date.now()-same.savedAt<86400000 && ['height','width','itemHeight','left','top'].every(k=>same[k as keyof Geometry]===entry[k as keyof Geometry])) return;
    try { localStorage.setItem(prefix+user,JSON.stringify([entry,...previous.filter(e=>e.key!==entry.key)].slice(0,32))); } catch { /* Optional geometry cache. */ }
  }
  return {restore,capture};
}

export const bottomNavTools = bottomNavSnapshot();
export const bottomNavBootstrap = `(${bottomNavSnapshot.toString()})().restore(document.currentScript.parentElement);`;
