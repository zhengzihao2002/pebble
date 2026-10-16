'use client';

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface SegmentOption<T extends string> {
  /** The stored value - never translated. */
  value: T;
  /** The label shown - translated by the caller. */
  label: string;
  icon?: LucideIcon;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Read aloud for the group; the visible labels name each option. */
  ariaLabel: string;
  size?: 'sm' | 'md';
  /** Stretch to the container, every segment the same width. */
  fullWidth?: boolean;
  className?: string;
}

/**
 * A row of mutually exclusive choices with one thumb that slides to the
 * chosen segment - the same idea as the Expense / Income switch, for any
 * number of options. A radiogroup: Tab reaches the chosen option, the arrow
 * keys move the choice (and focus) along the row.
 *
 * The thumb is positioned from the chosen button's measured box, kept in step
 * by a ResizeObserver (labels change width with the language and text size).
 * It moves by transform; the global reduced-motion rule makes that instant.
 */
export function SegmentedControl<T extends string>({
  options, value, onChange, ariaLabel, size = 'md', fullWidth = false, className,
}: SegmentedControlProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  // No slide on the first placement: the thumb appears under the choice.
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const place = () => {
      const active = root.querySelector<HTMLElement>('[aria-checked="true"]');
      if (!active) { setThumb(null); return; }
      setThumb({ x: active.offsetLeft, w: active.offsetWidth });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(root);
    root.querySelectorAll('button').forEach((b) => ro.observe(b));
    const id = requestAnimationFrame(() => setReady(true));
    return () => { ro.disconnect(); cancelAnimationFrame(id); };
  }, [value, options]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = Math.max(0, options.findIndex((o) => o.value === value));
    const last = options.length - 1;
    const next = e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i === 0 ? last : i - 1)
      : (i === last ? 0 : i + 1);
    onChange(options[next].value);
    rootRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus();
  };

  return (
    <div
      ref={rootRef}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={`pb-seg pb-seg-${size}${fullWidth ? ' pb-seg-full' : ''}${className ? ` ${className}` : ''}`}
    >
      {thumb && (
        <span
          className={`pb-seg-thumb${ready ? ' pb-seg-thumb-ready' : ''}`}
          aria-hidden="true"
          style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }}
        />
      )}
      {options.map((o, i) => {
        const Icon = o.icon;
        const checked = o.value === value;
        return (
          <button
            key={o.value} type="button" role="radio" data-index={i}
            aria-checked={checked} tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.value)}
            className="pb-seg-btn"
          >
            {Icon && <Icon size={size === 'sm' ? 13 : 15} aria-hidden="true" />}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
