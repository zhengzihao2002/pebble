import type { LucideIcon } from 'lucide-react';

interface StatTabProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sublabel?: string;
  color: string;
}

export function StatTab({ icon: Icon, label, value, sublabel, color }: StatTabProps) {
  return (
    <div className="stat-tab">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Icon size={13} style={{ color }} />
        <span style={{ fontSize: '0.68rem', color: 'var(--ink-soft)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      </div>
      <div className="font-mono-tab" style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--ink)' }}>{value}</div>
      {sublabel && <div style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', marginTop: 2 }}>{sublabel}</div>}
    </div>
  );
}
