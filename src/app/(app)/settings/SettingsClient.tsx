'use client';

import type { ReactNode } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { TextSizeControl } from '@/components/settings/TextSizeControl';
import { AppearanceControl } from '@/components/settings/AppearanceControl';
import { LanguageControl } from '@/components/settings/LanguageControl';
import { SelectModeControl } from '@/components/settings/SelectModeControl';
import { TimeZoneCard } from '@/components/settings/TimeZoneCard';
import { AccountsCard } from '@/components/settings/AccountsCard';
import type { Account } from '@/lib/data/mappers';
import { ModifyBalanceCard } from '@/components/settings/ModifyBalanceCard';
import { CategoryManagerCard } from '@/components/settings/CategoryManagerCard';
import { SoundSettingsCard } from '@/components/settings/SoundSettingsCard';
import { PebbleAccountCard } from '@/components/settings/PebbleAccountCard';
import { SettingsSectionNav } from '@/components/settings/SettingsSectionNav';

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
  cards: ReactNode;
}

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
  const darkMode = usePebbleStore((s) => s.darkMode);
  const setDarkMode = usePebbleStore((s) => s.setDarkMode);
  const locale = usePebbleStore((s) => s.locale);
  const setLocale = usePebbleStore((s) => s.setLocale);
  const selectMode = usePebbleStore((s) => s.selectMode);
  const setSelectMode = usePebbleStore((s) => s.setSelectMode);

  // ONE list, rendered below as the page content and by the section nav, so
  // the two can never disagree about what exists or in what order.
  const sections: SettingsSection[] = [
    {
      id: 'settings-money',
      title: d.settingsSections.money,
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
      id: 'settings-appearance',
      title: d.settingsSections.appearance,
      cards: (
        <>
          <TextSizeControl textSize={textSize} onChange={setTextSize} />
          <AppearanceControl darkMode={darkMode} onChange={setDarkMode} />
        </>
      ),
    },
    {
      id: 'settings-language-region',
      title: d.settingsSections.languageRegion,
      cards: (
        <>
          <LanguageControl locale={locale} onChange={setLocale} />
          <TimeZoneCard timeZoneOverride={timeZoneOverride} />
        </>
      ),
    },
    {
      id: 'settings-behavior',
      title: d.settingsSections.behavior,
      cards: (
        <>
          <SelectModeControl selectMode={selectMode} onChange={setSelectMode} />
          <SoundSettingsCard />
        </>
      ),
    },
    {
      id: 'settings-pebble-account',
      // Reuses the card's own title rather than a near-duplicate key.
      title: d.account.title,
      cards: <PebbleAccountCard />,
    },
  ];

  return (
    <div className="settings-layout">
      {/* Rendered at every width; CSS hides it below the container breakpoint. */}
      <SettingsSectionNav
        items={sections.map(({ id, title }) => ({ id, title }))}
        label={d.settingsSections.navLabel}
      />
      <div className="settings-column">
        {sections.map((section) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="settings-section">
            <h2 id={`${section.id}-title`} className="font-display settings-section-title">{section.title}</h2>
            <div className="settings-section-cards">{section.cards}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
