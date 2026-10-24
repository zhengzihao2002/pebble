'use client';

import type { ReactNode } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { TextSizeControl } from '@/components/settings/TextSizeControl';
import { FontControl } from '@/components/settings/FontControl';
import { ThemeControl } from '@/components/settings/ThemeControl';
import { AppearanceControl } from '@/components/settings/AppearanceControl';
import { HealthBarControl } from '@/components/settings/HealthBarControl';
import { ChartTypeControl } from '@/components/settings/ChartTypeControl';
import { WelcomeAnimationControl } from '@/components/settings/WelcomeAnimationControl';
import { LanguageControl } from '@/components/settings/LanguageControl';
import { SelectModeControl } from '@/components/settings/SelectModeControl';
import { PrivacyControl } from '@/components/settings/PrivacyControl';
import { TextSelectControl } from '@/components/settings/TextSelectControl';
import { TimeZoneCard } from '@/components/settings/TimeZoneCard';
import { AccountsCard } from '@/components/settings/AccountsCard';
import type { Account } from '@/lib/data/mappers';
import { ModifyBalanceCard } from '@/components/settings/ModifyBalanceCard';
import { CategoryManagerCard } from '@/components/settings/CategoryManagerCard';
import { SoundSettingsCard } from '@/components/settings/SoundSettingsCard';
import { PebbleAccountCard } from '@/components/settings/PebbleAccountCard';
import { SafetyLocksControl } from '@/components/settings/SafetyLocksControl';
import { SettingsJumpBar, SettingsSectionNav } from '@/components/settings/SettingsSectionNav';
import { SettingsOverview } from '@/components/settings/SettingsOverview';
import { useSectionJump } from '@/components/settings/useSectionJump';
import { SAFETY_LOCK_KEYS, isLocked } from '@/lib/safetyLocks';
import { isThemeChoice } from '@/lib/themeChoice';
import { isAppearance } from '@/lib/appearance';

interface SettingsClientProps {
  timeZoneOverride: string | null;
  accounts: Account[];
  balancesByAccount: Record<string, number>;
  /** accountId -> true when the account has records that could be moved. */
  hasRecords: Record<string, boolean>;
}

interface SettingsSection {
  /** Stable DOM id the section nav scrolls to. A fixed string, never translated. */
  id: string;
  title: string;
  /** Short name for the phone jump bar. */
  short: string;
  /** One quiet line under the section title. */
  hint: string;
  cards: ReactNode;
}

// Ids of the sections the overview chips point at. Fixed strings, never
// translated (the command palette and NoAccountsNotice link to them too).
const SECTION_IDS = {
  money: 'settings-money',
  appearance: 'settings-appearance',
  language: 'settings-language-region',
  behavior: 'settings-behavior',
  account: 'settings-pebble-account',
} as const;

// Mixed page: textSize, darkMode, locale and selectMode are device preferences
// and stay in the store (localStorage). Balances and accounts are financial
// data and come from Postgres. Every card is props-only; this component owns
// all store reads.
export function SettingsClient({
  timeZoneOverride, accounts, balancesByAccount, hasRecords,
}: SettingsClientProps) {
  const { d } = useTranslation();
  const textSize = usePebbleStore((s) => s.textSize);
  const setTextSize = usePebbleStore((s) => s.setTextSize);
  const appearance = usePebbleStore((s) => s.appearance);
  const setAppearance = usePebbleStore((s) => s.setAppearance);
  const locale = usePebbleStore((s) => s.locale);
  const setLocale = usePebbleStore((s) => s.setLocale);
  const selectMode = usePebbleStore((s) => s.selectMode);
  const setSelectMode = usePebbleStore((s) => s.setSelectMode);
  const fontChoice = usePebbleStore((s) => s.fontChoice);
  const setFontChoice = usePebbleStore((s) => s.setFontChoice);
  const cjkFontChoice = usePebbleStore((s) => s.cjkFontChoice);
  const setCjkFontChoice = usePebbleStore((s) => s.setCjkFontChoice);
  const showHealthBar = usePebbleStore((s) => s.showHealthBar) === true;
  const breakdownChart = usePebbleStore((s) => s.breakdownChart) === 'bar' ? 'bar' : 'donut';
  const setBreakdownChart = usePebbleStore((s) => s.setBreakdownChart);
  const setShowHealthBar = usePebbleStore((s) => s.setShowHealthBar);
  const themeChoice = usePebbleStore((s) => s.themeChoice);
  const setThemeChoice = usePebbleStore((s) => s.setThemeChoice);
  // Read for the overview chips only; their controls read them themselves.
  const privacyOnLaunch = usePebbleStore((s) => s.privacyOnLaunch) === true;
  const safetyLocks = usePebbleStore((s) => s.safetyLocks);
  const locksOn = SAFETY_LOCK_KEYS.filter((key) => isLocked(safetyLocks, key)).length;
  const u = d.ux.settings;

  // ONE list, rendered below as the page content and by the section nav, so
  // the two can never disagree about what exists or in what order.
  const sections: SettingsSection[] = [
    {
      id: SECTION_IDS.money,
      title: d.settingsSections.money,
      short: u.jumpMoney,
      hint: u.moneyHint,
      cards: (
        <>
          {/* Always shown. Opening balances were removed outright: every account
              starts at zero and a starting figure is recorded here as a dated
              adjustment, so nothing moves a balance without a visible row. */}
          <ModifyBalanceCard accounts={accounts} balancesByAccount={balancesByAccount} />
          <AccountsCard accounts={accounts} balancesByAccount={balancesByAccount} hasRecords={hasRecords} />
          <CategoryManagerCard />
        </>
      ),
    },
    {
      id: SECTION_IDS.appearance,
      title: d.settingsSections.appearance,
      short: u.jumpAppearance,
      hint: u.appearanceHint,
      // The theme gallery keeps a card of its own; the rest are rows of one
      // grouped card, in the same order as before.
      cards: (
        <>
          <ThemeControl theme={themeChoice} onChange={setThemeChoice} />
          <div className="card pb-settings-group">
            <TextSizeControl textSize={textSize} onChange={setTextSize} />
            <FontControl
              fontChoice={fontChoice} onChange={setFontChoice}
              cjkFontChoice={cjkFontChoice} onCjkChange={setCjkFontChoice}
            />
            <AppearanceControl appearance={appearance} onChange={setAppearance} />
            <HealthBarControl enabled={showHealthBar} onChange={setShowHealthBar} />
            <ChartTypeControl value={breakdownChart} onChange={setBreakdownChart} />
            <WelcomeAnimationControl />
          </div>
        </>
      ),
    },
    {
      id: SECTION_IDS.language,
      title: d.settingsSections.languageRegion,
      short: u.jumpLanguage,
      hint: u.languageHint,
      cards: (
        <div className="card pb-settings-group">
          <LanguageControl locale={locale} onChange={setLocale} />
          <TimeZoneCard timeZoneOverride={timeZoneOverride} />
        </div>
      ),
    },
    {
      id: SECTION_IDS.behavior,
      title: d.settingsSections.behavior,
      short: u.jumpBehavior,
      hint: u.behaviorHint,
      cards: (
        <>
          <div className="card pb-settings-group">
            <SelectModeControl selectMode={selectMode} onChange={setSelectMode} />
            <PrivacyControl />
            <TextSelectControl />
          </div>
          <SoundSettingsCard />
        </>
      ),
    },
    {
      id: SECTION_IDS.account,
      // Reuses the card's own title rather than a near-duplicate key.
      title: d.account.title,
      short: u.jumpAccount,
      hint: u.accountHint,
      cards: (
        <>
          <SafetyLocksControl />
          <PebbleAccountCard />
        </>
      ),
    },
  ];

  // ONE set of observers and one click lock for the side nav, the phone jump
  // bar and the overview chips, so they always agree on where you are.
  const navItems = sections.map(({ id, title, short }) => ({ id, title, short }));
  const { activeId, jump } = useSectionJump(navItems.map((i) => i.id));

  return (
    <div className="settings-layout pb-settings">
      {/* Rendered at every width; CSS hides it below the container breakpoint. */}
      <SettingsSectionNav
        items={navItems}
        label={d.settingsSections.navLabel}
        activeId={activeId}
        onSelect={jump}
      />
      <div className="settings-column">
        <SettingsOverview
          theme={isThemeChoice(themeChoice) ? themeChoice : 'original'}
          appearance={isAppearance(appearance) ? appearance : 'system'}
          locale={locale === 'zh' ? 'zh' : 'en'}
          blurOnLaunch={privacyOnLaunch}
          locksOn={locksOn}
          locksTotal={SAFETY_LOCK_KEYS.length}
          onJump={jump}
          sectionIds={SECTION_IDS}
        />
        {/* The narrow-column counterpart of the side nav (CSS shows one or
            the other). Sticky under the header. */}
        <SettingsJumpBar items={navItems} label={u.jumpTo} activeId={activeId} onSelect={jump} />
        {sections.map((section) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="settings-section">
            <div className="pb-settings-sec-head">
              <h2 id={`${section.id}-title`} className="font-display settings-section-title">{section.title}</h2>
              <p className="pb-settings-sec-hint">{section.hint}</p>
            </div>
            <div className="settings-section-cards">{section.cards}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
