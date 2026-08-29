'use client';

import { usePebbleStore } from '@/store/usePebbleStore';
import { TextSizeControl } from '@/components/settings/TextSizeControl';
import { AppearanceControl } from '@/components/settings/AppearanceControl';
import { LanguageControl } from '@/components/settings/LanguageControl';
import { TimeZoneCard } from '@/components/settings/TimeZoneCard';
import { OpeningBalanceCard } from '@/components/settings/OpeningBalanceCard';
import { ModifyBalanceCard } from '@/components/settings/ModifyBalanceCard';
import { CategoryManagerCard } from '@/components/settings/CategoryManagerCard';
import { NotificationsCard } from '@/components/settings/NotificationsCard';
import { SoundSettingsCard } from '@/components/settings/SoundSettingsCard';
import { AccountCard } from '@/components/settings/AccountCard';

interface SettingsClientProps {
  checkingOpening: number;
  cashOpening: number;
  checkingTransactionTotal: number;
  cashTransactionTotal: number;
  hasTransactions: boolean;
  timeZoneOverride: string | null;
}

// Mixed page: textSize and darkMode are device preferences and stay in the
// store (localStorage). Opening balances are financial data and come from
// Postgres.
export function SettingsClient({
  checkingOpening, cashOpening, checkingTransactionTotal, cashTransactionTotal, hasTransactions, timeZoneOverride,
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
      {hasTransactions ? (
        <ModifyBalanceCard
          checkingBalance={checkingOpening + checkingTransactionTotal}
          cashBalance={cashOpening + cashTransactionTotal}
        />
      ) : (
        <OpeningBalanceCard
          checkingOpening={checkingOpening}
          cashOpening={cashOpening}
          checkingTransactionTotal={checkingTransactionTotal}
          cashTransactionTotal={cashTransactionTotal}
        />
      )}
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
      <AccountCard />
    </div>
  );
}
