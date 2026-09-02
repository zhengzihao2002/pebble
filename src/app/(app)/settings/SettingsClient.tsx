'use client';

import { usePebbleStore } from '@/store/usePebbleStore';
import { TextSizeControl } from '@/components/settings/TextSizeControl';
import { AppearanceControl } from '@/components/settings/AppearanceControl';
import { LanguageControl } from '@/components/settings/LanguageControl';
import { TimeZoneCard } from '@/components/settings/TimeZoneCard';
import { AccountsCard } from '@/components/settings/AccountsCard';
import type { Account } from '@/lib/data/mappers';
import { ModifyBalanceCard } from '@/components/settings/ModifyBalanceCard';
import { CategoryManagerCard } from '@/components/settings/CategoryManagerCard';
import { NotificationsCard } from '@/components/settings/NotificationsCard';
import { SoundSettingsCard } from '@/components/settings/SoundSettingsCard';
import { PebbleAccountCard } from '@/components/settings/PebbleAccountCard';

interface SettingsClientProps {
  timeZoneOverride: string | null;
  accounts: Account[];
  balancesByAccount: Record<string, number>;
  /** accountId -> true when the account has records that could be moved. */
  hasRecords: Record<string, boolean>;
}

// Mixed page: textSize and darkMode are device preferences and stay in the
// store (localStorage). Opening balances are financial data and come from
// Postgres.
export function SettingsClient({
  timeZoneOverride, accounts, balancesByAccount, hasRecords,
}: SettingsClientProps) {
  const textSize = usePebbleStore((s) => s.textSize);
  const setTextSize = usePebbleStore((s) => s.setTextSize);
  const darkMode = usePebbleStore((s) => s.darkMode);
  const setDarkMode = usePebbleStore((s) => s.setDarkMode);
  const locale = usePebbleStore((s) => s.locale);
  const setLocale = usePebbleStore((s) => s.setLocale);

  return (
    // Card order matters here: the two tall cards (balance, categories) lead so
    // they pair with each other in a two-column layout, leaving the four short
    // preference cards to pair off below. Reordering can open a large gap.
    <div className="settings-grid">
      {/* Opening balances are only settable on a fresh account. Once any
          transaction exists, changing them would silently rewrite every
          historical running balance, so corrections are recorded as dated
          adjustments instead. */}
      {/* Always shown. Opening balances were removed outright: every account
          starts at zero and a starting figure is recorded here as a dated
          adjustment, so nothing moves a balance without a visible row. */}
      <ModifyBalanceCard accounts={accounts} balancesByAccount={balancesByAccount} />
      <AccountsCard accounts={accounts} balancesByAccount={balancesByAccount} hasRecords={hasRecords} />
      <CategoryManagerCard />
      <TextSizeControl textSize={textSize} onChange={setTextSize} />
      <AppearanceControl darkMode={darkMode} onChange={setDarkMode} />
      {/* Grouped with the other device preferences. Takes the card count from
          seven to eight, which pairs evenly in the two-column layout rather
          than opening the gap the comment above warns about. */}
      <LanguageControl locale={locale} onChange={setLocale} />
      {/* Takes the preference-card count from 8 to 9 (odd) - opens the pairing
          gap the comment above warns about. Accepted: no clean pairing exists
          without a layout change, which is out of scope. */}
      <TimeZoneCard timeZoneOverride={timeZoneOverride} />
      {/* Grouped with the other device preferences, and short enough not to
          disturb the tall/short pairing described above. */}
      <SoundSettingsCard />
      <NotificationsCard />
      <PebbleAccountCard />
    </div>
  );
}
