'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MonthNavigatorProps {
  label: string;
  canGoOlder: boolean;
  canGoNewer: boolean;
  onOlder: () => void;
  onNewer: () => void;
}

export function MonthNavigator({ label, canGoOlder, canGoNewer, onOlder, onNewer }: MonthNavigatorProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
      <button
        onClick={() => canGoOlder && onOlder()}
        disabled={!canGoOlder}
        className="icon-btn"
        style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, opacity: canGoOlder ? 1 : 0.35, cursor: canGoOlder ? 'pointer' : 'default' }}
        aria-label="Previous month"
      >
        <ChevronLeft size={16} />
      </button>
      <p className="font-display" style={{ fontSize: '1.05rem', fontWeight: 600, minWidth: 160, textAlign: 'center' }}>
        {label}
      </p>
      <button
        onClick={() => canGoNewer && onNewer()}
        disabled={!canGoNewer}
        className="icon-btn"
        style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, opacity: canGoNewer ? 1 : 0.35, cursor: canGoNewer ? 'pointer' : 'default' }}
        aria-label="Next month"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
