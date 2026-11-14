'use client';

import { Languages, Moon, Sun, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useNavigationPathname as usePathname } from '@/components/loading/navigation';
import { PebbleMark } from '@/components/brand/PebbleMark';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useResolvedDark } from '@/lib/useResolvedDark';
import { useCurrentUser } from '@/lib/auth/useCurrentUser';
import { NavButton } from './NavButton';
import { SignOutButton } from './SignOutButton';
import { NAV_GROUPS, navItems } from './navItems';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useNavGlass } from './useNavGlass';

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = usePebbleStore(state => state.sidebarCollapsed);
  const setCollapsed = usePebbleStore(state => state.setSidebarCollapsed);
  const { ref, indicatorRef } = useNavGlass<HTMLElement>(pathname);
  const setAppearance = usePebbleStore((s) => s.setAppearance);
  const darkMode = useResolvedDark();
  const { name, email, initials } = useCurrentUser();
  const { d, locale } = useTranslation();
  const setLocale = usePebbleStore(state => state.setLocale);
  const nextLocale = locale === 'en' ? 'zh' : 'en';
  const nextLanguage = nextLocale === 'zh' ? d.settings.language.chinese : d.settings.language.english;
  const byHref = new Map(navItems.map((i) => [i.href, i]));
  const settings = byHref.get('/settings');

  return (
    <aside ref={ref} className="pebble-sidebar pb-nav-glass-host pb-nav-glass-side">
      <span ref={indicatorRef} className="pb-nav-glass-indicator" aria-hidden="true" />
      <div className="pb-sidebar-brand">
        <span className="pb-sidebar-brand-identity"><PebbleMark size={34} />
          <span className="font-display pb-sidebar-wordmark">Pebble</span></span>
        <button type="button" className="pb-sidebar-collapse" aria-expanded={!collapsed}
          aria-label={collapsed ? d.sidebar.expand : d.sidebar.collapse} title={collapsed ? d.sidebar.expand : d.sidebar.collapse}
          onClick={() => setCollapsed(!usePebbleStore.getState().sidebarCollapsed)}>
          <PanelLeftClose size={18} className="pb-sidebar-collapse-icon" aria-hidden="true" />
          <PanelLeftOpen size={18} className="pb-sidebar-expand-icon" aria-hidden="true" />
        </button>
      </div>
      {/* Grouped for scanning (NAV_GROUPS); the links themselves are the same
          NavButtons in the same order. Each caption labels its group, so a
          screen reader hears the grouping too. */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="pb-shell-side-group" role="group" aria-labelledby={`pb-side-${group.id}`}>
            <p id={`pb-side-${group.id}`} className="pb-shell-side-cap">{d.ux.shell[group.labelKey]}</p>
            {group.hrefs.map((href) => {
              const item = byHref.get(href);
              return item ? <NavButton key={href} href={href} icon={item.icon} label={d.nav[item.labelKey]} /> : null;
            })}
          </div>
        ))}
      </nav>
      {/* Settings is pinned above the account block, apart from the pages -
          still a link inside a <nav>, so it keeps the panel look. */}
      {settings && (
        <nav className="pb-shell-side-pinned" aria-label={d.nav[settings.labelKey]} style={{ display: 'flex', flexDirection: 'column', flex: 'none' }}>
          <NavButton href={settings.href} icon={settings.icon} label={d.nav[settings.labelKey]} />
        </nav>
      )}
      <div className="pb-shell-side-foot" style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <button onClick={() => setAppearance(darkMode ? 'light' : 'dark')} className="nav-btn" title={darkMode ? d.sidebar.lightMode : d.sidebar.darkMode} aria-label={darkMode ? d.sidebar.lightMode : d.sidebar.darkMode}>
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          <span className="nav-label">{darkMode ? d.sidebar.lightMode : d.sidebar.darkMode}</span>
        </button>
        <button type="button" onClick={() => setLocale(nextLocale)} className="nav-btn"
          title={nextLanguage} aria-label={`${d.settings.language.label}: ${nextLanguage}`}>
          <Languages size={18} aria-hidden="true" />
          <span className="nav-label" lang={nextLocale}>{nextLanguage}</span>
        </button>
        <SignOutButton />
        <div className="pb-sidebar-profile" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem' }}>
          <div className="pb-sidebar-avatar" style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: 'var(--gold-soft)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0, lineHeight: 1 }}>
            <span className="pb-sidebar-initials">{initials}</span>
          </div>
          <div style={{ fontSize: '0.85rem', minWidth: 0 }}>
            <div className="pb-sidebar-profile-name" style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
            <div className="pb-sidebar-profile-email" style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
