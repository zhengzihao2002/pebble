'use client';

import { useEffect, useRef } from 'react';
import { useNavGlass } from '@/components/layout/useNavGlass';
import { useSectionJump } from './useSectionJump';

export interface SettingsNavItem {
  id: string;
  title: string;
  /** A shorter name for the phone jump bar; falls back to the title. */
  short?: string;
}

interface SettingsSectionNavProps {
  items: SettingsNavItem[];
  label: string;
  /** Controlled by a shared useSectionJump (SettingsClient), so the nav, the
      phone jump bar and the overview chips agree. Without these the nav runs
      its own observers, exactly as before. */
  activeId?: string;
  onSelect?: (id: string) => void;
}

/**
 * Jump list for the Settings sections, shown beside the column on wide
 * screens (CSS decides when - see .settings-nav in globals.css).
 *
 * Buttons, not links: there are no URLs. A hash link would push a history
 * entry per click, so Back would walk through sections instead of leaving.
 *
 * The observer and click-lock logic lives in useSectionJump.
 */
export function SettingsSectionNav({ items, label, activeId, onSelect }: SettingsSectionNavProps) {
  const controlled = onSelect !== undefined;
  // Always called (hooks cannot be conditional); watches nothing when the
  // parent supplies the state.
  const own = useSectionJump(controlled ? [] : items.map((i) => i.id));
  const current = controlled ? activeId : own.activeId;
  const select = controlled ? onSelect : own.jump;
  const { ref: glassRef, indicatorRef } = useNavGlass<HTMLDivElement>(current ?? '');

  return (
    <nav className="settings-nav" aria-label={label}>
      <div ref={glassRef} className="pb-nav-glass-host pb-settings-glass">
        <span ref={indicatorRef} className="pb-nav-glass-indicator" aria-hidden="true" />
      <ul className="settings-nav-list">
        {items.map((item) => {
          const active = item.id === current;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => select(item.id)}
                aria-current={active ? 'true' : undefined}
                data-pb-nav-link data-pb-nav-selected={active || undefined}
                className={`settings-nav-btn ${active ? 'active' : ''}`}
              >
                {item.title}
              </button>
            </li>
          );
        })}
      </ul></div>
    </nav>
  );
}

interface SettingsJumpBarProps {
  items: SettingsNavItem[];
  label: string;
  activeId: string;
  onSelect: (id: string) => void;
}

/**
 * The phone (narrow column) counterpart of SettingsSectionNav: a sticky row
 * of short section names under the glass header. It WRAPS rather than
 * scrolling sideways - a horizontal swipe there fights the page and, near the
 * bottom edge, the iOS app switcher. CSS shows it only below the width where
 * the side nav appears.
 *
 * Publishes its own height as --pb-settings-jump-h on .pb-settings, so a
 * section jumped to clears both the header and this bar (scroll-margin-top).
 */
export function SettingsJumpBar({ items, label, activeId, onSelect }: SettingsJumpBarProps) {
  const ref = useRef<HTMLElement>(null);
  const { ref: glassRef, indicatorRef } = useNavGlass<HTMLDivElement>(activeId);

  useEffect(() => {
    const el = ref.current;
    const host = el?.closest<HTMLElement>('.pb-settings');
    if (!el || !host || typeof ResizeObserver === 'undefined') return;
    const publish = () => host.style.setProperty('--pb-settings-jump-h', `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <nav ref={ref} className="pb-settings-jump" aria-label={label}>
      <div ref={glassRef} className="pb-nav-glass-host pb-settings-glass">
        <span ref={indicatorRef} className="pb-nav-glass-indicator" aria-hidden="true" />
      <ul className="pb-settings-jump-list">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={active ? 'true' : undefined}
                data-pb-nav-link data-pb-nav-selected={active || undefined}
                className={`pb-settings-jump-btn${active ? ' is-active' : ''}`}
              >
                {item.short ?? item.title}
              </button>
            </li>
          );
        })}
      </ul></div>
    </nav>
  );
}
