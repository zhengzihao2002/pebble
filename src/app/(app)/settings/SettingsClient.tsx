'use client';

import { usePebbleStore } from '@/store/usePebbleStore';
import { TextSizeControl } from '@/components/settings/TextSizeControl';
import { AppearanceControl } from '@/components/settings/AppearanceControl';
import { OpeningBalanceCard } from '@/components/settings/OpeningBalanceCard';
import { ModifyBalanceCard } from '@/components/settings/ModifyBalanceCard';
import { CategoryManagerCard } from '@/components/settings/CategoryManagerCard';
import { NotificationsCard } from '@/components/settings/NotificationsCard';
import { AccountCard } from '@/components/settings/AccountCard';

interface SettingsClientProps {
  checkingOpening: number;
  cashOpening: number;
  checkingTransactionTotal: number;
  cashTransactionTotal: number;
  hasTransactions: boolean;
}

// Mixed page: textSize and darkMode are device preferences and stay in the
// store (localStorage). Opening balances are financial data and come from
// Postgres.
export function SettingsClient({
  checkingOpening, cashOpening, checkingTransactionTotal, cashTransactionTotal, hasTransactions,
}: SettingsClientProps) {
  const textSize = usePebbleStore((s) => s.textSize);
  const setTextSize = usePebbleStore((s) => s.setTextSize);
  const darkMode = usePebbleStore((s) => s.darkMode);
  const setDarkMode = usePebbleStore((s) => s.setDarkMode);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 560 }}>
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
      <NotificationsCard />
      <AccountCard />
    </div>
  );
}
