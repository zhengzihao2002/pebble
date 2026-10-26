'use client';

import { useMemo } from 'react';
import type { Account } from '@/lib/data/mappers';
import { usePebbleStore } from '@/store/usePebbleStore';
import { accountSortMode, manualAccountIds, orderAccounts } from './accountOrder';

export function useOrderedAccounts(accounts: Account[], balances: Record<string, number>, defaultOrder: 'stored' | 'balance') {
  const mode = usePebbleStore((s) => s.accountSort);
  const ids = usePebbleStore((s) => s.manualAccountOrder);
  return useMemo(() => orderAccounts(accounts, balances, accountSortMode(mode), manualAccountIds(ids), defaultOrder), [accounts, balances, mode, ids, defaultOrder]);
}
