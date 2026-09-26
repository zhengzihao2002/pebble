'use client';

import { Switch } from '@/components/shared/Switch';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface HealthBarControlProps {
  enabled: boolean;
  onChange: (value: boolean) => void;
}

// Same shape as AppearanceControl: a device preference, off by default.
export function HealthBarControl({ enabled, onChange }: HealthBarControlProps) {
  const { d } = useTranslation();

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '1rem' }}>{d.healthBar.settingTitle}</h3>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div>
          <p style={{ fontSize: '0.87rem', fontWeight: 500 }}>{d.healthBar.settingLabel}</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', lineHeight: 1.45 }}>{d.healthBar.settingHint}</p>
        </div>
        <Switch checked={enabled} onChange={onChange} />
      </div>
    </div>
  );
}
