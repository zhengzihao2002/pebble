'use client';

import { Switch } from '@/components/shared/Switch';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface AppearanceControlProps {
  darkMode: boolean;
  onChange: (value: boolean) => void;
}

export function AppearanceControl({ darkMode, onChange }: AppearanceControlProps) {
  const { d } = useTranslation();

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '1rem' }}>{d.appearance.title}</h3>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {/* Its own key rather than d.sidebar.darkMode: that one labels the
              sidebar toggle's CURRENT STATE and flips to 'Light Mode', whereas
              this is a fixed setting name beside a switch. Sharing them would
              couple two labels that must be free to differ. */}
          <p style={{ fontSize: '0.87rem', fontWeight: 500 }}>{d.appearance.darkMode}</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>{d.appearance.hint}</p>
        </div>
        <Switch checked={darkMode} onChange={onChange} />
      </div>
    </div>
  );
}
