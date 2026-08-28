'use client';

import { useCurrentUser } from '@/lib/auth/useCurrentUser';
import { SignOutButton } from '@/components/layout/SignOutButton';
import { useTranslation } from '@/lib/i18n/useTranslation';

export function AccountCard() {
  const { name, email, initials } = useCurrentUser();
  // name, email and initials are the signed-in user's own data - never
  // translated, never transformed.
  const { d } = useTranslation();

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '1rem' }}>{d.account.title}</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: 'var(--gold-soft)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 600, flexShrink: 0 }}>
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>{name}</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>{email}</p>
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--line)', marginTop: '1.25rem', paddingTop: '1rem' }}>
        <SignOutButton />
      </div>
    </div>
  );
}
