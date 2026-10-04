'use client';

import { useEffect, useRef, useState, type InputHTMLAttributes, type Ref } from 'react';
import { evaluateAmount, isAmountExpression } from '@/lib/amountExpression';

type AmountInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  /** The form's value: always a plain number string, or '' - never an expression. */
  value: string;
  onValueChange: (value: string) => void;
  /** Only for fields that can hold a negative figure (a balance correction). */
  allowNegative?: boolean;
  /** Rounds the result to whole dollars (yearly category budgets). */
  wholeDollars?: boolean;
  ref?: Ref<HTMLInputElement>;
};

/**
 * An amount field that accepts arithmetic ("12.5+8").
 *
 * Shows what was typed, but hands the form ONLY the result, live, or '' while
 * the text is incomplete or invalid - so a form's submit, validation and
 * payload never see an expression, and pressing Enter submits the right
 * number. On blur an expression collapses to its result. Must sit inside a
 * position: relative wrapper, which the "= result" hint is placed against.
 *
 * Room for the hint comes from a CLASS (pb-amount-has-hint in globals.css),
 * never from the inline style: callers pass a padding shorthand, and adding
 * or removing paddingRight beside it makes React warn and can mis-style.
 */
export function AmountInput({
  value, onValueChange, allowNegative = false, wholeDollars = false, onBlur, className, ref, ...rest
}: AmountInputProps) {
  const [text, setText] = useState(value);
  // What this field last handed the form, so a change from OUTSIDE (a chip,
  // an import button, a reset) can be told apart from our own echo and shown.
  const lastEmitted = useRef(value);
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setText(value);
    }
  }, [value]);

  const evaluate = (t: string): string | null => {
    const r = evaluateAmount(t, allowNegative);
    if (r === null) return null;
    return wholeDollars ? String(Math.round(Number(r))) : r;
  };

  const result = isAmountExpression(text) ? evaluate(text) : null;

  const emit = (next: string) => {
    lastEmitted.current = next;
    onValueChange(next);
  };

  const classes = [className, result !== null ? 'pb-amount-has-hint' : null].filter(Boolean).join(' ');

  return (
    <>
      <input
        {...rest}
        ref={ref}
        className={classes || undefined}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={text}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          emit(t.trim() === '' ? '' : (evaluate(t) ?? ''));
        }}
        onBlur={(e) => {
          if (result !== null) setText(result);
          onBlur?.(e);
        }}
      />
      {result !== null && (
        <span
          aria-hidden="true"
          className="font-mono-tab"
          style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            fontSize: '0.8rem', color: 'var(--ink-soft)', pointerEvents: 'none', whiteSpace: 'nowrap',
          }}
        >
          = {result}
        </span>
      )}
    </>
  );
}
