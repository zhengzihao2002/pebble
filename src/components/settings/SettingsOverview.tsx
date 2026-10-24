'use client';

import { Eye, EyeOff, Languages, Lock, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCurrentUser } from '@/lib/auth/useCurrentUser';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { Appearance } from '@/lib/appearance';
import type { ThemeChoice } from '@/lib/themeChoice';
import type { Locale } from '@/lib/i18n';
import { THEME_PREVIEW } from './ThemeControl';

interface SettingsOverviewProps {
  /** Already normalised by the caller (unknown stored values -> fallbacks). */
  theme: ThemeChoice;
  appearance: Appearance;
  locale: Locale;
  blurOnLaunch: boolean;
  locksOn: number;
  locksTotal: number;
  /** Scrolls to a section (the shared useSectionJump). */
  onJump: (sectionId: string) => void;
  sectionIds: { appearance: string; language: string; behavior: string; account: string };
}

const APPEARANCE_ICONS: Record<Appearance, LucideIcon> = { light: Sun, dark: Moon, system: Monitor };

/**
 * The top of Settings: who is signed in, and the handful of choices that
 * change how the whole app looks and behaves, each as a chip that jumps to
 * the section holding it. Read-only - every change still happens in its
 * section, so there is exactly one control per setting.
 */
export function SettingsOverview({
  theme, appearance, locale, blurOnLaunch, locksOn, locksTotal, onJump, sectionIds,
}: SettingsOverviewProps) {
  const { d, t } = useTranslation();
  // Pending until mounted (hydration-safe), like the Pebble account card.
  const { name, email, initials } = useCurrentUser();

  const swatch = THEME_PREVIEW[theme];
  const AppearanceIcon = APPEARANCE_ICONS[appearance];
  const languageName = locale === 'zh' ? d.settings.language.chinese : d.settings.language.english;

  const chips: { key: string; label: string; value: string; mark: ReactNode; target: string }[] = [
    {
      key: 'theme', label: d.theme.title, value: d.theme[theme], target: sectionIds.appearance,
      // The theme's own colours, like its tile in the gallery.
      mark: (
        <span className="pb-settings-ov-swatch" style={{ backgroundColor: swatch.paper }}>
          <span style={{ backgroundColor: swatch.pine }} />
          <span style={{ backgroundColor: swatch.gold }} />
        </span>
      ),
    },
    { key: 'appearance', label: d.appearance.title, value: d.appearance[appearance], target: sectionIds.appearance, mark: <AppearanceIcon size={14} /> },
    { key: 'language', label: d.settings.language.title, value: languageName, target: sectionIds.language, mark: <Languages size={14} /> },
    {
      key: 'amounts', label: d.ux.settings.overviewAmounts, target: sectionIds.behavior,
      value: blurOnLaunch ? d.ux.settings.amountsBlurred : d.ux.settings.amountsShown,
      mark: blurOnLaunch ? <EyeOff size={14} /> : <Eye size={14} />,
    },
    {
      key: 'locks', label: d.safetyLocks.title, target: sectionIds.account,
      value: t(d.ux.settings.locksOn, { count: locksOn, total: locksTotal }), mark: <Lock size={14} />,
    },
  ];

  return (
    // A plain block, not a <section>: the page's regions stay the five
    // settings sections, each named by its heading.
    <div className="card pb-settings-ov">
      <div className="pb-settings-ov-id">
        <div className="pb-settings-avatar is-large" aria-hidden="true">{initials}</div>
        <div style={{ minWidth: 0 }}>
          {/* Fixed line heights, so the card does not grow when the name
              arrives after mount. */}
          <p className="pb-settings-ov-name">{name || ' '}</p>
          <p className="pb-settings-ov-email">{email || ' '}</p>
        </div>
      </div>
      <ul className="pb-settings-ov-chips" aria-label={d.ux.settings.overviewLabel}>
        {chips.map((c) => (
          <li key={c.key}>
            <button type="button" className="pb-settings-ov-chip" onClick={() => onJump(c.target)}>
              <span className="pb-settings-ov-mark" aria-hidden="true">{c.mark}</span>
              <span className="pb-settings-ov-text">
                <span className="pb-settings-ov-label">{c.label}</span>
                <span className="pb-settings-ov-value pb-tnum">{c.value}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
