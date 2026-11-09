'use client';

import { useLayoutEffect, useRef } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { AMBIENT_FRAME_INTERVAL, createAmbientRenderer, type AmbientColour } from '@/lib/ambientRenderer';

function AmbientLight({ enabled }: { enabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    const layer = ref.current, canvas = canvasRef.current;
    if (!layer || !canvas) return;
    let renderer = createAmbientRenderer(canvas);
    const colourCanvas = document.createElement('canvas');
    colourCanvas.width = 3; colourCanvas.height = 1;
    const colourContext = colourCanvas.getContext('2d', { willReadFrequently: true });
    const probes = [...layer.querySelectorAll<HTMLElement>('.pb-ambient-palette')];
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let settings = usePebbleStore.getState().ambientSettings;
    let frame = 0, elapsed = 0, previous = 0, lastPaint = -Infinity, lost = false;
    let colourKey = '', colours: AmbientColour[] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const paint = () => {
      if (!renderer || !colourContext || document.hidden || lost) return;
      const key = probes.map(probe => getComputedStyle(probe).color);
      if (key.join('|') !== colourKey) {
        key.forEach((colour, i) => {
          colourContext.clearRect(i, 0, 1, 1);
          colourContext.fillStyle = colour;
          colourContext.fillRect(i, 0, 1, 1);
        });
        const pixels = colourContext.getImageData(0, 0, 3, 1).data;
        colours = key.map((_, i) => [pixels[i * 4] / 255, pixels[i * 4 + 1] / 255, pixels[i * 4 + 2] / 255]);
        colourKey = key.join('|');
      }
      renderer.draw({
        width: Math.max(1, layer.clientWidth), height: Math.max(1, layer.clientHeight),
        seconds: elapsed, colours,
        opacity: parseFloat(getComputedStyle(layer).getPropertyValue('--ambient-core')) / 100,
        still: reduce.matches,
        settings,
      });
      layer.dataset.renderer = renderer.kind;
    };
    const tick = (now: number) => {
      frame = 0;
      if (document.hidden || reduce.matches || lost) return;
      if (previous) elapsed += (now - previous) / 1000 * settings.speed;
      previous = now;
      if (now - lastPaint >= AMBIENT_FRAME_INTERVAL) { paint(); lastPaint = now; }
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame); frame = 0; previous = 0; lastPaint = performance.now();
      layer.dataset.paused = String(document.hidden);
      layer.dataset.motion = reduce.matches ? 'still' : 'running';
      if (document.hidden || lost) return;
      paint();
      if (!reduce.matches) frame = requestAnimationFrame(tick);
    };
    const refresh = () => {
      if (!document.hidden && reduce.matches && !frame) frame = requestAnimationFrame(() => { frame = 0; paint(); });
    };
    const unsubscribeSettings = usePebbleStore.subscribe((state, before) => {
      if (state.ambientSettings === before.ambientSettings) return;
      settings = state.ambientSettings;
      refresh();
    });
    const contextLost = (event: Event) => {
      event.preventDefault(); lost = true; cancelAnimationFrame(frame); frame = 0; previous = 0;
      delete layer.dataset.renderer;
    };
    const contextRestored = () => {
      renderer = createAmbientRenderer(canvas); lost = false; sync();
    };
    const resize = new ResizeObserver(refresh);
    resize.observe(layer);
    const palette = new MutationObserver(refresh);
    palette.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-pebble-theme'] });
    const root = layer.closest('.pebble-root');
    if (root) palette.observe(root, { attributes: true, attributeFilter: ['class'] });
    const paletteSettled = (event: Event) => {
      if (event.target === root) refresh();
    };
    root?.addEventListener('transitionend', paletteSettled);
    sync();
    document.addEventListener('visibilitychange', sync);
    reduce.addEventListener('change', sync);
    canvas.addEventListener('webglcontextlost', contextLost);
    canvas.addEventListener('webglcontextrestored', contextRestored);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect(); palette.disconnect();
      unsubscribeSettings();
      root?.removeEventListener('transitionend', paletteSettled);
      document.removeEventListener('visibilitychange', sync);
      reduce.removeEventListener('change', sync);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', contextRestored);
      renderer?.dispose();
      delete layer.dataset.renderer;
    };
  }, [enabled]);

  return <div ref={ref} className="pb-ambient-background" aria-hidden="true">
    <canvas ref={canvasRef} className="pb-ambient-canvas" />
    <span className="pb-ambient-palette" style={{ color: 'var(--pine)' }} />
    <span className="pb-ambient-palette" style={{ color: 'color-mix(in oklch, var(--pine) 68%, var(--gold))' }} />
    <span className="pb-ambient-palette" style={{ color: 'color-mix(in oklch, var(--pine) 84%, var(--gold))' }} />
  </div>;
}

/** AppShell owns one bounded canvas, so navigation retains the scene and clock. */
export function AmbientBackground() {
  const enabled = usePebbleStore(s => s.ambientBackground) === true;
  // The startup sheet paints the saved scene in streamed HTML. Hydration
  // starts its animation without adding/removing the background's markup.
  return <AmbientLight enabled={enabled} />;
}
