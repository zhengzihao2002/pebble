'use client';

import { Play } from 'lucide-react';
import { Switch } from '@/components/shared/Switch';
import { usePebbleStore } from '@/store/usePebbleStore';
import { WELCOME_PREVIEW_EVENT } from '@/components/layout/WelcomeOverlay';
import { useTranslation } from '@/lib/i18n/useTranslation';

export function WelcomeAnimationControl() {
  const { d } = useTranslation();
  const enabled = usePebbleStore((s) => s.showWelcome);
  const setShowWelcome = usePebbleStore((s) => s.setShowWelcome);

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div>
          <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem' }}>{d.welcome.settingTitle}</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>{d.welcome.settingHint}</p>
        </div>
        <Switch checked={enabled !== false} onChange={setShowWelcome} />
      </div>
      <button
        type="button" className="pill"
        onClick={() => window.dispatchEvent(new Event(WELCOME_PREVIEW_EVENT))}
        style={{ marginTop: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
      >
        <Play size={13} />{d.welcome.preview}
      </button>
    </div>
  );
}
