'use client';

import { useState } from 'react';
import { Switch } from '@/components/shared/Switch';
import { ComingSoonOverlay } from '@/components/shared/ComingSoonOverlay';

export function NotificationsCard() {
  const [budgetAlerts, setBudgetAlerts] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(true);
  const [largeTxnAlerts, setLargeTxnAlerts] = useState(false);

  return (
    <div className="card" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '1rem' }}>Notifications</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', pointerEvents: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div>
            <p style={{ fontSize: '0.87rem', fontWeight: 500 }}>Budget alerts</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>Get notified when a category nears its limit</p>
          </div>
          <Switch checked={budgetAlerts} onChange={setBudgetAlerts} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div>
            <p style={{ fontSize: '0.87rem', fontWeight: 500 }}>Weekly summary</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>A recap of your spending every Monday</p>
          </div>
          <Switch checked={weeklySummary} onChange={setWeeklySummary} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div>
            <p style={{ fontSize: '0.87rem', fontWeight: 500 }}>Large transaction alerts</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>Notify me for transactions over $500</p>
          </div>
          <Switch checked={largeTxnAlerts} onChange={setLargeTxnAlerts} />
        </div>
      </div>
      <ComingSoonOverlay label="Notifications coming soon" />
    </div>
  );
}
