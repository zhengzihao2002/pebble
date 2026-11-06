/** This factory is also serialized into the streamed fallback. Keep it
 * self-contained: the same validation and renderer run before hydration. */
export interface LayoutBox {
  x: number; y: number; width: number; height: number; radius: number;
  kind: 'card' | 'hero' | 'bar'; flat: boolean;
}
export interface PageLayout {
  key: string; savedAt: number; width: number; height: number; boxes: LayoutBox[];
}
export function snapshotTools() {
  const prefix = 'pebble-layout-sizes:v2:';
  const ttl = 30 * 86400000;
  function owner() {
    return document.querySelector<HTMLMetaElement>('meta[name="pebble-session"]')?.content.split('|')[0].slice(0,128) || null;
  }
  function canonicalProfile(key: string): string {
    try {
      const parts: unknown = JSON.parse(key);
      // Phone pages flow vertically. Browser chrome, the keyboard and PWA
      // launches change height without changing any card's layout. Normalize
      // existing v2 profiles too, so a saved visit survives the next launch.
      if (Array.isArray(parts) && parts.length === 8 && typeof parts[2] === 'number' && parts[2] < 760) {
        parts[3] = null;
        return JSON.stringify(parts);
      }
    } catch { /* Unrecognized keys cannot match a generated profile. */ }
    return key;
  }
  function sameProfile(first: string, second: string) {
    return canonicalProfile(first) === canonicalProfile(second);
  }
  function profile(pathname: string, main: HTMLElement): string | null {
    if (!/^\/(dashboard|transactions|accounts|analysis|insights|reports|budgets(?:\/plan)?|goals|scheduled|settings|account\/(?:settings|security))\/?$/.test(pathname)) return null;
    const style = getComputedStyle(main);
    const width = main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    if (width < 100) return null;
    const html = document.documentElement;
    return canonicalProfile(JSON.stringify([pathname.replace(/^\/+|\/+$/g,''), Math.round(width), window.innerWidth, window.innerHeight,
      getComputedStyle(html).fontSize, html.lang, html.getAttribute('data-pebble-font'), html.getAttribute('data-pebble-cjk')]));
  }
  function valid(entry: unknown): entry is PageLayout {
    if (!entry || typeof entry !== 'object') return false;
    const e = entry as PageLayout;
    const bounded = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
    return typeof e.key === 'string' && e.key.length < 500 && bounded(e.savedAt,0,Date.now()+60000)
      && bounded(e.width,100,10000) && bounded(e.height,1,200000)
      && Array.isArray(e.boxes) && e.boxes.length > 0 && e.boxes.length <= 80
      && e.boxes.every(b => b && bounded(b.x,-100,e.width) && bounded(b.y,0,200000)
        && bounded(b.width,1,e.width+200) && b.x+b.width <= e.width+100
        && bounded(b.height,1,20000) && b.y+b.height <= e.height+2
        && bounded(b.radius,0,200) && ['card','hero','bar'].includes(b.kind) && typeof b.flat==='boolean');
  }
  function entries(user: string): PageLayout[] {
    try {
      const raw = localStorage.getItem(prefix+user);
      if (!raw || raw.length > 500000) return [];
      const parsed = JSON.parse(raw);
      if (parsed.version !== 2 || !Array.isArray(parsed.entries)) return [];
      return parsed.entries.filter(valid).filter((e: PageLayout)=>Date.now()-e.savedAt<ttl).slice(0,48);
    } catch { return []; }
  }
  function read(pathname: string, main: HTMLElement): PageLayout | null {
    const user = owner(), key = profile(pathname,main);
    return user && key ? entries(user).filter(e=>sameProfile(e.key,key)).sort((a,b)=>b.savedAt-a.savedAt)[0] ?? null : null;
  }
  function restore(host: HTMLElement, layout?: PageLayout | null) {
    const main = host.closest<HTMLElement>('.pebble-main');
    const surface = host.querySelector<HTMLElement>('.pb-layout-restored');
    // Streamed React segments can be parsed in a hidden staging container.
    // That is not a cache miss: wait until the real main column has a width.
    if (!main || !surface || main.clientWidth < 100 || !owner()) return false;
    // Every spinner uses the available viewport height. Measure the rendered
    // header before showing it, rather than recentering after Header hydrates.
    // Transactions' viewport-height panes use the same calibration.
    const header = main.closest<HTMLElement>('.pebble-root')?.querySelector<HTMLElement>('.pebble-header');
    const height = header?.getBoundingClientRect().height;
    if (height && height > 0) {
      const html = document.documentElement, value = height + 'px';
      if (html.style.getPropertyValue('--pb-header-layout-h') !== value) html.style.setProperty('--pb-header-layout-h', value);
    }
    const spinner = document.documentElement.getAttribute('data-pb-loading-style') === 'spinner';
    if (spinner) {
      const stage = host.closest<HTMLElement>('.pb-navigation-stage');
      // Show the persistent ring in streamed HTML before React starts. A
      // hidden staging segment must not start a second loading sequence.
      if (stage && host.getBoundingClientRect().width > 0 && !host.closest('[hidden]')) stage.setAttribute('data-pb-spinner-loading','true');
    }
    const saved = spinner ? null : layout === undefined ? read(host.dataset.layoutPath ?? '',main) : layout;
    if (!saved) {
      host.removeAttribute('data-layout-restored'); surface.replaceChildren(); delete surface.dataset.geometry;
      host.setAttribute('data-layout-ready','true');
      return true;
    }
    // Repeated observer notifications should not restart the pulse.
    const signature = JSON.stringify(saved);
    if (surface.dataset.geometry !== signature) {
      const canvas = document.createElement('div');
      canvas.className = 'pb-cached-layout';
      canvas.setAttribute('aria-hidden','true');
      canvas.dataset.layoutCache = 'true';
      canvas.style.height = saved.height+'px';
      for (const box of saved.boxes) {
        const card = document.createElement('div');
        card.className = 'card pb-cached-layout-box is-'+box.kind;
        Object.assign(card.style,{left:box.x+'px',top:box.y+'px',width:box.width+'px',height:box.height+'px',borderRadius:box.radius+'px'});
        if (box.flat) card.style.boxShadow='none';
        for (const [width,height] of [['38%','.7rem'],...(box.kind!=='bar' && box.height>90 ? [['60%','1.3rem']] : []),...(box.kind!=='bar' && box.height>180 ? [['100%','45%']] : [])]) {
          const line = document.createElement('span');
          line.className = 'pb-skel';
          Object.assign(line.style,{width,height,borderRadius:'.6rem'});
          card.append(line);
        }
        canvas.append(card);
      }
      surface.replaceChildren(canvas);
      surface.dataset.geometry=signature;
    }
    host.setAttribute('data-layout-restored','true');
    host.setAttribute('data-layout-ready','true');
    return true;
  }
  function prepare(host: HTMLElement): () => void {
    if (restore(host)) return () => {};
    // A later stream chunk moves the host into AppShell. Restore in that
    // mutation's microtask, before the browser can paint the fallback.
    const changes = new MutationObserver(retry);
    const sizes = new ResizeObserver(retry);
    let observed: HTMLElement | null = null;
    const stop = () => { changes.disconnect(); sizes.disconnect(); };
    function retry() {
      if (!host.isConnected || restore(host)) { stop(); return; }
      const main = host.closest<HTMLElement>('.pebble-main');
      if (main && main !== observed) { sizes.disconnect(); sizes.observe(main); observed=main; }
    }
    changes.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','style','class']});
    retry();
    return stop;
  }
  return {prefix,owner,profile,sameProfile,valid,entries,read,restore,prepare};
}
export const layoutTools = snapshotTools();
// An empty, React-unmanaged surface lets streamed HTML restore the saved
// geometry before its first paint, without waiting for the React bundle.
export const layoutBootstrap = `(${snapshotTools.toString()})().prepare(document.currentScript.parentElement);`;
