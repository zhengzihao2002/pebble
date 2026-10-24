'use client';

import { Plus } from 'lucide-react';
import { requestShell } from '@/components/layout/shellEvents';
import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * The action every "not enough data yet" card carries: the data these cards
 * wait for is transactions, so the fix is one tap away (opens the shell's
 * Add transaction dialog, as Top places' empty state always did).
 */
export function AddTransactionAction({ primary = false }: { primary?: boolean }) {
  const { d } = useTranslation();
  // Several cards can ask at once on a new account: only the headline's is
  // the filled button, the rest are quiet pills so the page stays calm.
  return (
    <button type="button" className={primary ? 'btn-primary pb-ins-cta' : 'pill pb-ins-cta pb-ins-cta-quiet'} onClick={() => requestShell('addTransaction')}>
      <Plus size={15} aria-hidden="true" />{d.ux.insights.addFirstTransaction}
    </button>
  );
}
