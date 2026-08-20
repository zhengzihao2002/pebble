'use client';

import { SignOutButton } from '@/components/layout/SignOutButton';

export function AccountCard() {
  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '1rem' }}>Account</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: 'var(--gold-soft)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 600, flexShrink: 0 }}>
          ZZ
        </div>
        <div>
          <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>Zihao Zheng</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>zhengzihao2002@gmail.com</p>
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--line)', marginTop: '1.25rem', paddingTop: '1rem' }}>
        <SignOutButton />
      </div>
    </div>
  );
}
