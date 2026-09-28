'use client';

import { Lock } from 'lucide-react';
import { Switch } from '@/components/shared/Switch';
import { usePebbleStore } from '@/store/usePebbleStore';
import { SAFETY_LOCK_KEYS, isLocked } from '@/lib/safetyLocks';
import { useTranslation } from '@/lib/i18n/useTranslation';

export function SafetyLocksControl() {
  const { d } = useTranslation();
  const locks = usePebbleStore((s) => s.safetyLocks);
  const setSafetyLock = usePebbleStore((s) => s.setSafetyLock);

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>
        <Lock size={15} />{d.safetyLocks.title}
      </h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1rem', lineHeight: 1.5 }}>{d.safetyLocks.blurb}</p>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {SAFETY_LOCK_KEYS.map((key, i) => (
          <div
            key={key}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '0.7rem 0', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}
          >
            <span style={{ fontSize: '0.87rem' }}>{d.safetyLocks[key]}</span>
            <Switch checked={isLocked(locks, key)} onChange={(value) => setSafetyLock(key, value)} />
          </div>
        ))}
      </div>
    </div>
  );
}
