'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { GOAL_ICON_OPTIONS, GOAL_COLOR_OPTIONS } from '@/data/seed';

interface AddGoalModalProps {
  onClose: () => void;
}

// NOTE: nothing in the app currently triggers this modal — same as the
// original source. Goals page is gated behind "Coming Soon" and no button
// calls the open-state setter. Kept as-is per the port's ground rules
// rather than inventing a trigger that wasn't there.
export function AddGoalModal({ onClose }: AddGoalModalProps) {
  const addGoal = usePebbleStore((s) => s.addGoal);

  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('');
  const [date, setDate] = useState('');
  const [iconKey, setIconKey] = useState(GOAL_ICON_OPTIONS[0].key);
  const [color, setColor] = useState(GOAL_COLOR_OPTIONS[0]);

  const inputStyle: React.CSSProperties = { padding: '0.6rem 0.75rem', borderRadius: '0.6rem', border: '1px solid var(--line)', fontSize: '0.9rem', color: 'var(--ink)', backgroundColor: 'var(--paper)', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--ink-soft)' };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !target || Number(target) <= 0 || !date.trim()) return;
    const iconMatch = GOAL_ICON_OPTIONS.find((o) => o.key === iconKey) || GOAL_ICON_OPTIONS[0];
    addGoal({
      name: name.trim(), target: Number(target), current: current ? Number(current) : 0,
      date: date.trim(), icon: iconMatch.icon, color,
    });
    onClose();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,20,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50, overflowY: 'auto' }}
      onClick={onClose}
    >
      <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: 420, boxSizing: 'border-box', margin: '1rem 0' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.3rem' }}>
          <h2 className="font-display" style={{ fontSize: '1.2rem', fontWeight: 600 }}>Add goal</h2>
          <button onClick={onClose} className="icon-btn" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none' }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <label style={labelStyle}>
            Goal name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New Car" required style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Target amount
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>$</span>
              <input
                type="number" min="0" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0.00" required
                className="font-mono-tab" style={{ ...inputStyle, width: '100%', paddingLeft: '1.6rem' }}
              />
            </div>
          </label>

          <label style={labelStyle}>
            Already saved <span style={{ opacity: 0.7 }}>(optional)</span>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>$</span>
              <input
                type="number" min="0" step="0.01" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="0.00"
                className="font-mono-tab" style={{ ...inputStyle, width: '100%', paddingLeft: '1.6rem' }}
              />
            </div>
          </label>

          <label style={labelStyle}>
            Target date
            <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="e.g. Dec 2026" required style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Icon
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {GOAL_ICON_OPTIONS.map(({ key, icon: OptIcon }) => (
                <button
                  key={key} type="button" onClick={() => setIconKey(key)}
                  style={{
                    width: 38, height: 38, borderRadius: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: iconKey === key ? `2px solid ${color}` : '1px solid var(--line)',
                    backgroundColor: iconKey === key ? `${color}20` : 'transparent', color: iconKey === key ? color : 'var(--ink-soft)',
                  }}
                >
                  <OptIcon size={17} />
                </button>
              ))}
            </div>
          </label>

          <label style={labelStyle}>
            Color
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {GOAL_COLOR_OPTIONS.map((c) => (
                <button
                  key={c} type="button" onClick={() => setColor(c)}
                  style={{
                    width: 30, height: 30, borderRadius: '50%', backgroundColor: c,
                    border: color === c ? '2px solid var(--ink)' : '2px solid transparent', outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </label>

          <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem', padding: '0.72rem' }}>
            Add goal
          </button>
        </form>
      </div>
    </div>
  );
}
