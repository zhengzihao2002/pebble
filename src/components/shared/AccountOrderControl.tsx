'use client';

import { useId } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { Account } from '@/lib/data/mappers';
import { ACCOUNT_SORT_MODES, accountSortMode, accountOrderGroup, manualAccountIds } from '@/lib/accountOrder';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SelectField } from './SelectField';

/** Shared display preference; never writes financial data or account records. */
export function AccountOrderControl({ accounts }: { accounts: Account[] }) {
  const { d, t } = useTranslation();
  const x = d.ux.accounts;
  const id = useId();
  const mode = accountSortMode(usePebbleStore((s) => s.accountSort));
  const savedIds = usePebbleStore((s) => s.manualAccountOrder);
  const setMode = usePebbleStore((s) => s.setAccountSort);
  const setOrder = usePebbleStore((s) => s.setManualAccountOrder);
  const groups = [0, 1, 2, 3].map((group) => ({
    label: `${group >= 2 ? `${d.accounts.hibernated} · ` : ''}${group % 2 ? x.sectionCards : x.sectionBankCash}`,
    accounts: accounts.filter((a) => accountOrderGroup(a) === group),
  })).filter((group) => group.accounts.length > 0);
  const move = (account: Account, neighbor: Account) => {
    const ids = groups.flatMap((group) => group.accounts.map((a) => a.id));
    const from = ids.indexOf(account.id), to = ids.indexOf(neighbor.id);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    setOrder(ids);
  };
  return (
    <div className="pb-account-order">
      <div className="pb-account-order-select">
        <label htmlFor={id}>{x.sortAccounts}</label>
        <SelectField id={id} ariaLabel={x.sortAccounts} value={mode}
          options={ACCOUNT_SORT_MODES.map((value) => ({ value, label: x.sortModes[value] }))}
          onChange={(value) => {
            const next = accountSortMode(value);
            if (next === 'manual' && manualAccountIds(savedIds).length === 0) setOrder(accounts.map((a) => a.id));
            else setMode(next);
          }} />
      </div>
      {mode === 'manual' && (
        <details className="pb-account-order-editor">
          <summary>{x.reorderAccounts}</summary>
          <p className="pb-account-order-hint">{x.orderHint}</p>
          {groups.map((group) => (
            <div key={group.label}>
              <h4>{group.label}</h4>
              <ul>
                {group.accounts.map((a, i) => (
                  <li key={a.id}>
                    <span className="pb-account-order-name">{a.name}</span>
                    <button type="button" className="pill" disabled={i === 0}
                      aria-label={t(x.moveUp, { name: a.name })} onClick={() => move(a, group.accounts[i - 1])}>
                      <ArrowUp size={16} aria-hidden="true" />
                    </button>
                    <button type="button" className="pill" disabled={i === group.accounts.length - 1}
                      aria-label={t(x.moveDown, { name: a.name })} onClick={() => move(a, group.accounts[i + 1])}>
                      <ArrowDown size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
