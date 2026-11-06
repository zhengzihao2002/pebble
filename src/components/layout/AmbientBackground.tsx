'use client';

import { useEffect, useRef } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';

function AmbientLight() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const layer = ref.current;
    if (!layer) return;
    const sync = () => { layer.dataset.paused = String(document.hidden); };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  return <div ref={ref} className="pb-ambient-background" aria-hidden="true">
    <span className="pb-ambient-orb is-near" />
    <span className="pb-ambient-orb is-middle" />
    <span className="pb-ambient-orb is-far" />
  </div>;
}

/** AppShell owns the layer, so route transitions never restart its motion. */
export function AmbientBackground() {
  const enabled = usePebbleStore(s => s.ambientBackground) === true;
  return enabled ? <AmbientLight /> : null;
}
