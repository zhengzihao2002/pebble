'use client';

import { useState } from 'react';
import { Switch } from '@/components/shared/Switch';
import { ComingSoonOverlay } from '@/components/shared/ComingSoonOverlay';
import { useTranslation } from '@/lib/i18n/useTranslation';

export function NotificationsCard() {
  const { d } = useTranslation();
  const [budgetAlerts, setBudgetAlerts] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(true);
  const [largeTxnAlerts, setLargeTxnAlerts] = useState(false);

  return (
    <div className="card" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '1rem' }}>{d.notifications.title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', pointerEvents: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div>
            <p style={{ fontSize: '0.87rem', fontWeight: 500 }}>{d.notifications.budgetAlerts}</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>{d.notifications.budgetAlertsHint}</p>
          </div>
          <Switch checked={budgetAlerts} onChange={setBudgetAlerts} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div>
            <p style={{ fontSize: '0.87rem', fontWeight: 500 }}>{d.notifications.weeklySummary}</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>{d.notifications.weeklySummaryHint}</p>
          </div>
          <Switch checked={weeklySummary} onChange={setWeeklySummary} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div>
            <p style={{ fontSize: '0.87rem', fontWeight: 500 }}>{d.notifications.largeTxn}</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>{d.notifications.largeTxnHint}</p>
          </div>
          <Switch checked={largeTxnAlerts} onChange={setLargeTxnAlerts} />
        </div>
      </div>
      <ComingSoonOverlay label={d.notifications.comingSoon} />
    </div>
  );
}
