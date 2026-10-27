'use client';

import { useId } from 'react';
import { ACCOUNT_SORT_MODES, accountSortMode } from '@/lib/accountOrder';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { useAccountOrdering } from '@/lib/useAccountOrdering';
import { SelectField } from './SelectField';

export function AccountOrderControl({ ordering }: { ordering: ReturnType<typeof useAccountOrdering> }) {
  const { d } = useTranslation();
  const x = d.ux.accounts;
  const id = useId();
  const mode = accountSortMode(usePebbleStore((s) => s.accountSort));
  const setMode = usePebbleStore((s) => s.setAccountSort);
  return (
    <div className="pb-account-order">
      <div className="pb-account-order-select">
        <label htmlFor={id}>{x.sortAccounts}</label>
        <SelectField id={id} ariaLabel={x.sortAccounts} value={ordering.editing ? 'manual' : mode}
          options={ACCOUNT_SORT_MODES.map((value) => ({ value, label: x.sortModes[value] }))}
          onChange={(value) => {
            const next = accountSortMode(value);
            if (next === 'manual') ordering.begin();
            else { ordering.cancel(); setMode(next); }
          }} />
      </div>
      {ordering.editing ? <>
        <p className="pb-account-order-hint">{x.orderHint}</p>
        <div className="pb-account-order-actions">
          <button type="button" className="pill" onClick={ordering.cancel}>{x.cancelOrder}</button>
          <button type="button" className="btn-primary" onClick={ordering.save}>{x.saveOrder}</button>
        </div>
      </> : mode === 'manual' && <button type="button" className="pill" onClick={ordering.begin}>{x.reorderAccounts}</button>}
    </div>
  );
}
