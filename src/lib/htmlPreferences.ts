import { usePebbleStore } from '@/store/usePebbleStore';
import { HTML_LANG } from '@/lib/i18n';
import { DARK_QUERY, isAppearance } from '@/lib/appearance';
import { THEME_ATTRIBUTE, resolveThemeChoice } from '@/lib/themeChoice';
import { CJK_FONT_ATTRIBUTE, FONT_ATTRIBUTE } from '@/lib/fontChoice';
import { runThemeChange, themeChangePending } from '@/lib/themeTransition';
import { visualPreferenceTools } from '@/lib/visualPreferences';

/** Read the hydrated store at application time, never a static SSR selector.
 * First application and DOM repairs are synchronous; only real changes fade. */
export function mountHtmlPreferences(onAuth: boolean) {
  let disposed = false;
  const root = document.documentElement;
  const system = window.matchMedia(DARK_QUERY);
  const desired = () => {
    const prefs = usePebbleStore.getState();
    const appearance = isAppearance(prefs.appearance) ? prefs.appearance : 'system';
    const theme = onAuth ? 'original' : resolveThemeChoice(prefs.themeChoice);
    return { dark: onAuth || appearance === 'system' ? system.matches : appearance === 'dark',
      palette: theme === 'original' ? null : theme, lang: HTML_LANG[prefs.locale] ?? HTML_LANG.en,
      loading: onAuth ? null : prefs.loadingStyle === 'spinner' ? 'spinner' : 'cached' };
  };
  const apply = () => {
    if (disposed) return;
    const { dark, palette, lang, loading } = desired();
    if (root.classList.contains('pebble-dark') !== dark) root.classList.toggle('pebble-dark', dark);
    const shell = document.querySelector('.pebble-root');
    if (shell && shell.classList.contains('dark') !== dark) shell.classList.toggle('dark', dark);
    for (const [attribute, value] of [[THEME_ATTRIBUTE, palette], ['lang', lang], ['data-pb-loading-style', loading]] as const) {
      if (root.getAttribute(attribute) === value) continue;
      if (value === null) root.removeAttribute(attribute); else root.setAttribute(attribute, value);
    }
    if (onAuth) { root.removeAttribute(FONT_ATTRIBUTE); root.removeAttribute(CJK_FONT_ATTRIBUTE); }
    visualPreferenceTools.apply(root, usePebbleStore.getState(), onAuth,
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  };
  const refresh = () => {
    const { dark, palette } = desired();
    if (themeChangePending() || root.classList.contains('pebble-dark') !== dark || root.getAttribute(THEME_ATTRIBUTE) !== palette) runThemeChange(apply);
    else apply();
  };
  // This must finish before the first hydrated frame; never snapshot defaults.
  apply();
  const unsubscribe = usePebbleStore.subscribe(refresh);
  system.addEventListener('change', refresh);
  const repair = new MutationObserver(() => { if (!themeChangePending()) apply(); });
  repair.observe(root, { attributes: true, attributeFilter: ['class', 'lang', 'style', THEME_ATTRIBUTE, 'data-pb-soft-cursor', 'data-pb-ambient', 'data-pb-sidebar-collapsed'] });
  return () => { disposed = true; unsubscribe(); system.removeEventListener('change', refresh); repair.disconnect(); };
}
