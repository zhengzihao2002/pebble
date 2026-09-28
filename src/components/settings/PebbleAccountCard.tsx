'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSafetyLock } from '@/lib/useSafetyLock';
import { ChevronRight, Shield, Trash2, User } from 'lucide-react';
import { useCurrentUser } from '@/lib/auth/useCurrentUser';
import { SignOutButton } from '@/components/layout/SignOutButton';
import { DeletePebbleAccountDialog } from '@/components/settings/DeletePebbleAccountDialog';
import { useTranslation } from '@/lib/i18n/useTranslation';

export function PebbleAccountCard() {
  const { name, email, initials } = useCurrentUser();
  // name, email and initials are the signed-in user's own data - never
  // translated, never transformed.
  const { d } = useTranslation();
  const [showDelete, setShowDelete] = useState(false);
  const deleteLocked = useSafetyLock('deletePebbleAccount');

  // Both destinations are Better Auth UI's own account views, rendered by
  // src/app/(app)/account/[path]/page.tsx. Nothing linked to them before, so
  // change-password and session revocation shipped but were unreachable.
  // Deliberately NOT reimplemented here: a second credential path beside a
  // working built-in one is worse than none.
  const links = [
    { href: '/account/settings', icon: User, label: d.account.profileLink, hint: d.account.profileHint },
    { href: '/account/security', icon: Shield, label: d.account.securityLink, hint: d.account.securityHint },
  ];

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

      <div style={{ borderTop: '1px solid var(--line)', marginTop: '1.25rem', paddingTop: '0.5rem', display: 'flex', flexDirection: 'column' }}>
        {links.map(({ href, icon: Icon, label, hint }) => (
          <Link
            key={href}
            href={href}
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0', color: 'var(--ink)', textDecoration: 'none' }}
          >
            <Icon size={18} style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: '0.88rem', fontWeight: 500 }}>{label}</span>
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--ink-soft)' }}>{hint}</span>
            </span>
            <ChevronRight size={16} style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
          </Link>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--line)', marginTop: '0.5rem', paddingTop: '1rem' }}>
        <SignOutButton />
      </div>

      <div style={{ borderTop: '1px solid var(--line)', marginTop: '1rem', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <button
          type="button" onClick={() => setShowDelete(true)} disabled={deleteLocked} className="pill"
          style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 0.9rem', color: 'var(--wine)', borderColor: 'var(--wine)', opacity: deleteLocked ? 0.45 : 1, cursor: deleteLocked ? 'not-allowed' : 'pointer' }}
        >
          <Trash2 size={14} />{d.deleteMe.button}
        </button>
        <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>{deleteLocked ? d.safetyLocks.lockedHint : d.deleteMe.hint}</span>
      </div>

      <a href="/auth/privacy" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '1rem', fontSize: '0.78rem', color: 'var(--pine)' }}>
        {d.privacy.link}
      </a>

      {showDelete && <DeletePebbleAccountDialog onClose={() => setShowDelete(false)} />}
    </div>
  );
}
