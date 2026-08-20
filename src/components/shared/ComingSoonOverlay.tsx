import { Cloud } from 'lucide-react';

interface ComingSoonOverlayProps {
  label: string;
}

export function ComingSoonOverlay({ label }: ComingSoonOverlayProps) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0, backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        backgroundColor: 'var(--overlay-tint)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '0.5rem', borderRadius: 'inherit', zIndex: 5,
      }}
    >
      <Cloud size={22} style={{ color: 'var(--ink-soft)' }} />
      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink)' }}>{label}</span>
    </div>
  );
}
