'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { observeNumberEntry, refreshNumberEntry } from '@/lib/numberEntryMotion';

/** Animate an already-formatted numeric value without changing its precision.
 * The current value remains the only accessible/copyable text. Digits roll
 * on first visible page entry and after an update; signs, currency and grouping stay still.
 */
export function RollingAmount({ value, className = '', fractionClassName }: { value: string; className?: string; fractionClassName?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [frame, setFrame] = useState({ value, previous: value, revision: 0, entry: true, visible: false });
  useLayoutEffect(() => {
    if (!ref.current) return;
    return observeNumberEntry(ref.current, {
      onStart: () => setFrame(current => current.visible ? current : { ...current, visible: true }),
      onFinish: () => setFrame(current => current.entry ? { ...current, previous: current.value, entry: false } : current),
      onReplay: () => setFrame(current => ({ ...current, previous: current.value, revision: current.revision + 1, entry: true, visible: false })),
    });
  }, []);
  useLayoutEffect(() => { if (ref.current) refreshNumberEntry(ref.current); }, [value]);
  if (frame.value !== value) {
    setFrame({ value, previous: frame.value, revision: frame.revision + 1, entry: frame.entry && !frame.visible, visible: frame.visible });
  }
  const current = [...value];
  const previous = [...frame.previous];
  const hadDigits = previous.some(character => /\d/.test(character));
  const fewerDigits = current.filter(character => /\d/.test(character)).length < previous.filter(character => /\d/.test(character)).length;
  const firstDigit = current.findIndex(character => /\d/.test(character));
  const number = (text: string) => Number(text.replace(/−/g, '-').replace(/[^\d.\-]/g, ''));
  const down = number(value) < number(frame.previous);
  const decimal = fractionClassName ? value.lastIndexOf('.') : -1;
  const glyphs = current.map((character, index) => {
    // Align from the decimal/right edge, including when a new digit appears.
    const aligned = previous[previous.length - current.length + index];
    const old = frame.entry ? character : aligned !== undefined && /\d/.test(aligned) ? aligned : '';
    // A disappearing leading digit can leave all retained digits unchanged
    // ($109 → $9). Give the leading retained digit one turn in that case.
    const changed = /\d/.test(character) && (frame.entry || !hadDigits || old !== character || (fewerDigits && index === firstDigit));
    if (!changed) return <span key={current.length - index}>{character}</span>;
    return <span className={`pb-rolling-cell${down ? ' is-down' : ''}`} key={current.length - index}>
      {/* The first grid item supplies the inline baseline. It must always
          contain a glyph, including newly added leading places. */}
      <span className="pb-rolling-next" key={`next-${frame.revision}`}>{character}</span>
      <span className="pb-rolling-old" key={`old-${frame.revision}`}>{old}</span>
    </span>;
  });

  return <span ref={ref} className={`pb-rolling-amount${className ? ` ${className}` : ''}`} data-pb-roll-entry={frame.entry ? '' : undefined}>
    <span className="pb-rolling-accessible">{value}</span>
    <span className="pb-rolling-visual" aria-hidden="true">
      {decimal < 0 ? glyphs : <>{glyphs.slice(0, decimal)}<span className={fractionClassName}>{glyphs.slice(decimal)}</span></>}
    </span>
  </span>;
}

/** Roll only dollar amounts inside a sentence/badge, leaving dates and rates still. */
export function RollingMoneyText({ value }: { value: string }) {
  return <>{value.split(/([−+]?\$\d[\d,]*(?:\.\d+)?)/g).map((part, index) =>
    index % 2 ? <RollingAmount key={index} value={part} /> : part,
  )}</>;
}
