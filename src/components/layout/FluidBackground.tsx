'use client';
import { useEffect, useRef } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { startFluidBackground } from '@/lib/fluidBackground';

function FluidCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) return startFluidBackground(ref.current);
  }, []);
  return <div className="pb-fluid-background" aria-hidden="true"><canvas ref={ref} /></div>;
}

/** AppShell persists across routes; only explicitly disabling the setting
 * unmounts the canvas. No renderer or animation loop exists while off. */
export function FluidBackground() {
  const enabled = usePebbleStore(s=>s.fluidBackground) === true;
  return enabled ? <FluidCanvas /> : null;
}
