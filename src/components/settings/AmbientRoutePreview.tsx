'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Pause, Play } from 'lucide-react';
import { AMBIENT_MOTION, sampleAmbientMotion } from '@/lib/ambientMotion';
import { useTranslation } from '@/lib/i18n/useTranslation';

const SPEED = 8;
const subscribeViewport = (notify: () => void) => {
  window.addEventListener('resize', notify, { passive: true });
  return () => window.removeEventListener('resize', notify);
};
const viewportSnapshot = () => `${window.innerWidth}:${window.innerHeight}`;
const subscribeReducedMotion = (notify: () => void) => {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
const reducedSnapshot = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Small, clear route markers explain motion without enabling the background. */
export function AmbientRoutePreview() {
  const { d } = useTranslation();
  const copy = d.ambientBackground;
  const viewport = useSyncExternalStore(subscribeViewport, viewportSnapshot, () => '16:9');
  const [width, height] = viewport.split(':').map(Number);
  const reduced = useSyncExternalStore(subscribeReducedMotion, reducedSnapshot, () => true);
  const [requested, setRequested] = useState<{ playing: boolean; reduced: boolean } | null>(null);
  // A changed device preference takes precedence over an older play request.
  // Someone with Reduced Motion can still deliberately play this preview.
  const playing = requested?.reduced === reduced ? requested.playing : !reduced;
  const frameRef = useRef<SVGSVGElement>(null);
  const markersRef = useRef<(SVGCircleElement | null)[]>([]);
  const trailsRef = useRef<(SVGPathElement | null)[]>([]);
  const elapsedRef = useRef(0);
  const clipId = `ambient-route-${useId().replace(/:/g, '')}`;
  const radius = Math.max(width, height) * .035;

  useEffect(() => {
    const svg = frameRef.current;
    if (!svg) return;
    let frame = 0, previous = 0, lastPaint = 0;
    let visible = typeof IntersectionObserver === 'undefined';
    const paint = () => {
      AMBIENT_MOTION.forEach((orb, index) => {
        const marker = markersRef.current[index];
        const trail = trailsRef.current[index];
        const point = sampleAmbientMotion(orb, elapsedRef.current);
        marker?.setAttribute('cx', String(point.x * width));
        marker?.setAttribute('cy', String(point.y * height));
        marker?.setAttribute('style', `filter: hue-rotate(${point.hue}deg)`);
        let path = '';
        for (let step = 0; step <= 12; step++) {
          const p = sampleAmbientMotion(orb, elapsedRef.current - 12 + step);
          path += `${step ? 'L' : 'M'}${p.x * width},${p.y * height}`;
        }
        trail?.setAttribute('d', path);
      });
    };
    const tick = (now: number) => {
      frame = 0;
      if (previous) elapsedRef.current += Math.min((now - previous) / 1000, .1) * SPEED;
      previous = now;
      if (now - lastPaint >= 1000 / 30) { paint(); lastPaint = now; }
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      const running = playing && visible && !document.hidden;
      svg.dataset.running = String(running);
      if (running && !frame) { previous = 0; frame = requestAnimationFrame(tick); }
      else if (!running && frame) { cancelAnimationFrame(frame); frame = 0; previous = 0; }
    };
    paint();
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer?.observe(svg);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [playing, width, height]);

  return <figure className="pb-ambient-route-preview">
    <div className="pb-ambient-route-head">
      <div><span className="pb-ambient-route-title">{copy.previewTitle}</span><span className="pb-ambient-route-speed">{copy.previewSpeed}</span></div>
      <button type="button" className="pill pb-settings-pill" aria-pressed={playing} onClick={() => setRequested({ playing: !playing, reduced })}>
        {playing ? <Pause size={12} aria-hidden="true" /> : <Play size={12} aria-hidden="true" />}
        {playing ? copy.previewPause : copy.previewPlay}
      </button>
    </div>
    <div className="pb-ambient-route-stage">
      <svg ref={frameRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={copy.previewLabel}>
        <defs><clipPath id={clipId}><rect width={width} height={height} rx={Math.min(width, height) * .045} /></clipPath></defs>
        <rect className="pb-ambient-route-screen" x="1" y="1" width={Math.max(0, width - 2)} height={Math.max(0, height - 2)} rx={Math.min(width, height) * .045} vectorEffect="non-scaling-stroke" />
        <g clipPath={`url(#${clipId})`}>
          {AMBIENT_MOTION.map((orb, index) => {
            const point = sampleAmbientMotion(orb, 0);
            return <g key={orb.key} className={`pb-ambient-route-orb is-${orb.key}`}>
              <path ref={node => { trailsRef.current[index] = node; }} className="pb-ambient-route-trail" fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <circle ref={node => { markersRef.current[index] = node; }} cx={point.x * width} cy={point.y * height} r={radius} />
            </g>;
          })}
        </g>
      </svg>
    </div>
    <figcaption>{reduced && !playing ? copy.previewReduced : copy.previewHint}</figcaption>
  </figure>;
}
