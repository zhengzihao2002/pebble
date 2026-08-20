'use client';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Switch({ checked, onChange }: SwitchProps) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      style={{
        width: 42, height: 24, borderRadius: 99, border: 'none', padding: 2, flexShrink: 0,
        backgroundColor: checked ? 'var(--pine)' : 'var(--line)',
        display: 'flex', justifyContent: checked ? 'flex-end' : 'flex-start',
        transition: 'background-color 0.3s ease',
      }}
    >
      <span style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: 'var(--mist)', display: 'block', boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }} />
    </button>
  );
}
