'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * Shown by the transaction, transfer and scheduled-payment forms when the
 * user has no accounts. There are no default accounts: every account is one
 * the user created, and a brand-new user starts with none. onNavigate closes
 * the modal - modals mount in AppShell and would otherwise stay open over
 * Settings.
 */
export function NoAccountsNotice({ onNavigate }: { onNavigate: () => void }) {
  const { d } = useTranslation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', padding: '0.8rem 0.9rem', borderRadius: '0.7rem', backgroundColor: 'var(--gold-soft)', border: '1px solid var(--line)' }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--ink)', lineHeight: 1.45 }}>{d.noAccounts.body}</span>
      <Link
        href="/settings#settings-money" onClick={onNavigate} className="pill"
        style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.4rem 0.8rem', fontSize: '0.8rem', textDecoration: 'none', color: 'var(--ink)' }}
      >
        <Plus size={14} />{d.noAccounts.action}
      </Link>
    </div>
  );
}
