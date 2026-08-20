'use client';

import { Switch } from '@/components/shared/Switch';

interface AppearanceControlProps {
  darkMode: boolean;
  onChange: (value: boolean) => void;
}

export function AppearanceControl({ darkMode, onChange }: AppearanceControlProps) {
  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '1rem' }}>Appearance</h3>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: '0.87rem', fontWeight: 500 }}>Dark mode</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>Switch to a darker color scheme</p>
        </div>
        <Switch checked={darkMode} onChange={onChange} />
      </div>
    </div>
  );
}
