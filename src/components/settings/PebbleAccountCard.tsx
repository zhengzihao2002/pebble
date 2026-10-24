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

  // No card title: the section heading above already reads "Pebble account",
  // and the card repeated it word for word.
  return (
    <div className="card pb-settings-card pb-settings-me">
      <div className="pb-settings-me-id">
        <div className="pb-settings-avatar" aria-hidden="true">{initials}</div>
        <div style={{ minWidth: 0 }}>
          <p className="pb-settings-me-name">{name}</p>
          <p className="pb-settings-me-email">{email}</p>
        </div>
      </div>

      <div className="pb-settings-rows">
        {links.map(({ href, icon: Icon, label, hint }) => (
          <Link key={href} href={href} prefetch={false} className="pb-settings-link">
            <span className="pb-settings-row-icon" aria-hidden="true"><Icon size={16} /></span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="pb-settings-row-title">{label}</span>
              <span className="pb-settings-row-hint">{hint}</span>
            </span>
            <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
          </Link>
        ))}
      </div>

      <div className="pb-settings-me-foot">
        <SignOutButton className="pill pb-settings-pill" iconSize={15} />
        <div className="pb-settings-me-delete">
          <button
            type="button" onClick={() => setShowDelete(true)} disabled={deleteLocked} className="pill pb-settings-pill pb-settings-danger"
            style={{ opacity: deleteLocked ? 0.45 : 1, cursor: deleteLocked ? 'not-allowed' : 'pointer' }}
          >
            <Trash2 size={14} aria-hidden="true" />{d.deleteMe.button}
          </button>
          <span className="pb-settings-row-hint">{deleteLocked ? d.safetyLocks.lockedHint : d.deleteMe.hint}</span>
        </div>
      </div>

      <a href="/auth/privacy" target="_blank" rel="noopener noreferrer" className="pb-settings-privacy">
        {d.privacy.link}
      </a>

      {showDelete && <DeletePebbleAccountDialog onClose={() => setShowDelete(false)} />}
    </div>
  );
}
