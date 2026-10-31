'use client';

import Link from '@/components/loading/PendingLink';
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
  //
  // ONE grid, laid out by named areas (settings.css), so the same elements sit
  // differently by width without being repeated: on a wide card the identity
  // is on the left with Sign out opposite it, the two links sit side by side
  // and the footer has the privacy notice on the left and the danger action on
  // the right; on a phone Sign out and Delete are an equal pair of buttons,
  // Delete visually distinct and last. The body is a size container, so the
  // dialog (a fixed overlay rendered in place) is a SIBLING of it - a size
  // container would pin the dialog inside the card.
  return (
    <div className="card pb-settings-card pb-settings-me">
      <div className="pb-settings-me-body">
        <div className="pb-settings-me-grid">
          <div className="pb-settings-me-id">
            <div className="pb-settings-avatar" aria-hidden="true">{initials}</div>
            <div style={{ minWidth: 0 }}>
              <p className="pb-settings-me-name">{name}</p>
              <p className="pb-settings-me-email">{email}</p>
            </div>
          </div>

          <div className="pb-settings-me-signout">
            <SignOutButton className="pill pb-settings-pill" iconSize={15} />
          </div>

          <div className="pb-settings-me-links">
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

          {/* display: contents on a phone (the privacy link and the danger
              group are cells of the grid); one flex row on a wide card. */}
          <div className="pb-settings-me-foot">
            {/* One grid cell / flex item holding both legal links, so the
                grid areas stay as they were. */}
            <span className="pb-settings-legal">
              <a href="/auth/terms" target="_blank" rel="noopener noreferrer" className="pb-settings-privacy">
                {d.ux.settings.termsLink}
              </a>
              <a href="/auth/privacy" target="_blank" rel="noopener noreferrer" className="pb-settings-privacy">
                {d.privacy.link}
              </a>
            </span>

            {/* display: contents on a phone, so the hint and the button can take
                their own cells of the grid; one flex group on a wide card. */}
            <div className="pb-settings-me-danger">
              <span className="pb-settings-row-hint pb-settings-me-hint">{deleteLocked ? d.safetyLocks.lockedHint : d.deleteMe.hint}</span>
              <button
                type="button" onClick={() => setShowDelete(true)} disabled={deleteLocked} className="pill pb-settings-pill pb-settings-danger pb-settings-me-delete"
                style={{ opacity: deleteLocked ? 0.45 : 1, cursor: deleteLocked ? 'not-allowed' : 'pointer' }}
              >
                <Trash2 size={14} aria-hidden="true" />{d.deleteMe.button}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showDelete && <DeletePebbleAccountDialog onClose={() => setShowDelete(false)} />}
    </div>
  );
}
