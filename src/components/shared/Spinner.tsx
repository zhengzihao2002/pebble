'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * Loading indicators.
 *
 * Pure inline SVG and inline styles - no global CSS is touched, per the
 * project's no-restyling rule. The keyframes are injected once via a <style>
 * tag rather than added to globals.css.
 */

const KEYFRAMES = `
@keyframes pebble-spin { to { transform: rotate(360deg); } }
@keyframes pebble-fade-in { from { opacity: 0; } to { opacity: 1; } }
`;

interface SpinnerProps {
  size?: number;
  color?: string;
}

/** Small inline spinner, sized to sit next to or inside button text. */
export function Spinner({ size = 15, color = 'currentColor' }: SpinnerProps) {
  const { d } = useTranslation();
  return (
    <>
      <style>{KEYFRAMES}</style>
      <svg
        width={size} height={size} viewBox="0 0 24 24" fill="none"
        role="status" aria-label={d.common.loadingAria}
        style={{ animation: 'pebble-spin 0.7s linear infinite', flexShrink: 0 }}
      >
        <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2.5" opacity="0.22" />
        <path
          d="M21 12a9 9 0 0 0-9-9" stroke={color} strokeWidth="2.5" strokeLinecap="round"
        />
      </svg>
    </>
  );
}

/**
 * Covers its nearest positioned ancestor while a server call is in flight.
 * Blocks every click underneath, so the user cannot fire a second mutation or
 * close a dialog mid-write.
 *
 * The parent must have position: relative or fixed.
 */
export function LoadingOverlay({ label }: { label?: string }) {
  const { d } = useTranslation();
  // Default resolved HERE, not in the parameter list: a default parameter
  // cannot call a hook, and leaving English there would have made every
  // caller that omits the prop permanently untranslatable.
  const text = label ?? d.common.working;
  return (
    <>
      <style>{KEYFRAMES}</style>
      <div
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
        style={{
          position: 'absolute', inset: 0, zIndex: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: '0.6rem', borderRadius: 'inherit',
          cursor: 'wait', animation: 'pebble-fade-in 0.12s ease',
        }}
      >
        {/*
          The scrim is its own layer so opacity applies to the backdrop only -
          putting opacity on the parent would fade the spinner and label too.
          It uses var(--paper) rather than a hardcoded white so it dims in dark
          mode instead of flashing bright.
        */}
        <div
          style={{
            position: 'absolute', inset: 0, borderRadius: 'inherit',
            backgroundColor: 'var(--paper)', opacity: 0.72,
            backdropFilter: 'blur(1.5px)',
          }}
        />
        <Spinner size={26} color="var(--pine)" />
        <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', fontWeight: 500, position: 'relative' }}>{text}</span>
      </div>
    </>
  );
}

/** Centred spinner for a region whose content has not arrived yet. */
export function LoadingBlock({
  label,
  minHeight = 120,
  // 22 suits a region inside a card. A full page body needs considerably
  // more before it reads as "working" rather than as decoration, so the
  // (app) route fallback passes its own value.
  size = 22,
  labelSize = '0.8rem',
}: { label?: string; minHeight?: number; size?: number; labelSize?: string }) {
  const { d } = useTranslation();
  const text = label ?? d.common.loading;
  return (
    <div style={{ minHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.8rem' }}>
      <Spinner size={size} color="var(--pine)" />
      <span style={{ fontSize: labelSize, color: 'var(--ink-soft)' }}>{text}</span>
    </div>
  );
}
