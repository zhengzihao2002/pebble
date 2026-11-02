'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { IMPORT_ROW_REVEALED } from './useImportRowReveal';

// One observer for the whole review, so offscreen descriptions do no animation
// work. Intersection also respects the modal's clipped, scrolling body.
const viewers = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | null = null;
function watch(element: Element, notify: (visible: boolean) => void) {
  if (typeof IntersectionObserver === 'undefined') { notify(true); return () => {}; }
  observer ??= new IntersectionObserver(entries => {
    entries.forEach(entry => viewers.get(entry.target)?.(entry.isIntersecting));
  });
  viewers.set(element, notify); observer.observe(element);
  return () => {
    observer?.unobserve(element); viewers.delete(element);
    if (viewers.size === 0) { observer?.disconnect(); observer = null; }
  };
}

/** The input always owns the complete value. Only its decorative text reveals,
 * without changing the import model or re-rendering the review per character. */
export function ImportTitleField({ value, onChange, label, style }: {
  value: string; onChange: (value: string) => void; label: string; style: CSSProperties;
}) {
  const [revealing, setRevealing] = useState(value.length > 0);
  const field = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!revealing || !field.current || !text.current) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finish = () => setRevealing(false);
    media.addEventListener('change', finish);
    if (media.matches) return () => media.removeEventListener('change', finish);
    const characters = typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value), part => part.segment)
      : Array.from(value);
    const duration = Math.min(1800, Math.max(300, characters.length * 18));
    // Change character data instead of replacing child nodes each frame:
    // page layout/shadow observers must not run for every revealed character.
    const target = document.createTextNode('');
    text.current.replaceChildren(target);
    const row = field.current.closest<HTMLElement>('.pb-import-row-reveal');
    let faded = !row || row.hasAttribute('data-import-revealed'), visible = false;
    let frame = 0, elapsed = 0, started = 0;
    const draw = (now: number) => {
      const count = Math.min(characters.length, Math.floor((elapsed + now - started) / duration * characters.length));
      target.data = characters.slice(0, count).join('');
      if (count < characters.length) frame = requestAnimationFrame(draw);
      else { frame = 0; setRevealing(false); }
    };
    const begin = () => {
      if (visible && faded && !frame) { started = performance.now(); frame = requestAnimationFrame(draw); }
    };
    const revealed = () => { faded = true; begin(); };
    row?.addEventListener(IMPORT_ROW_REVEALED, revealed);
    const stop = watch(field.current, onScreen => {
      visible = onScreen;
      if (!visible && frame) { cancelAnimationFrame(frame); frame = 0; elapsed += performance.now() - started; }
      begin();
    });
    return () => { stop(); cancelAnimationFrame(frame); row?.removeEventListener(IMPORT_ROW_REVEALED, revealed); media.removeEventListener('change', finish); };
  }, [revealing, value]);

  return <div ref={field} className="pb-import-title-field">
    <input type="text" value={value} maxLength={200} placeholder={label} aria-label={label}
      onFocus={() => setRevealing(false)} onChange={event => onChange(event.target.value)}
      style={{ ...style, color: revealing ? 'var(--pb-import-title-ink, transparent)' : style.color, fontSize: '0.86rem', height: '2.1rem' }} />
    {revealing && <span ref={text} className="pb-import-title-text" aria-hidden="true" style={{ padding: style.padding }} />}
  </div>;
}
