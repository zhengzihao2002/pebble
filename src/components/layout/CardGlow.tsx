'use client';

import { useId, useLayoutEffect, useRef } from 'react';
import { mountAdaptiveCardGlows } from '@/lib/cardGlow';
import { usePebbleStore } from '@/store/usePebbleStore';

export function CardGlow() {
  const enabled = usePebbleStore(state => state.cardGlow);
  const ref = useRef<HTMLDivElement>(null);
  const id = `pb-glow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  useLayoutEffect(() => {
    // The initial hydration snapshot uses defaults. Respect the saved OFF
    // value before painting, even before React updates that snapshot.
    if (enabled && usePebbleStore.getState().cardGlow && ref.current) return mountAdaptiveCardGlows(ref.current, id);
  }, [enabled, id]);
  return enabled ? <div ref={ref} className="pb-card-glows" aria-hidden="true" /> : null;
}
