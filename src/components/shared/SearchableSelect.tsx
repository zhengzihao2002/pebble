'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

// Structural rather than lucide-react's LucideIcon: this component should not
// care where an icon component came from, and CategoryMeta's icons satisfy it.
type OptionIcon = React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>;

export interface SearchableSelectOption {
  value: string;
  label: string;
  icon?: OptionIcon;
  color?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
  /** Merged into the input, so a call site can match its own form's metrics. */
  style?: React.CSSProperties;
  id?: string;
  ariaLabel?: string;
}

// Prefix matches rank above mid-string ones, so typing "car" puts Car above
// Childcare. Substring, not fuzzy: with short, known category names fuzzy
// matching mostly produces surprising NON-matches ranked above obvious ones.
function filterOptions(options: SearchableSelectOption[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  const prefix: SearchableSelectOption[] = [];
  const contains: SearchableSelectOption[] = [];
  options.forEach((o) => {
    const l = o.label.toLowerCase();
    if (l.startsWith(q)) prefix.push(o);
    else if (l.includes(q)) contains.push(o);
  });
  return [...prefix, ...contains];
}

export function SearchableSelect({
  value, onChange, options, placeholder, disabled,
  emptyMessage, style, id, ariaLabel,
}: SearchableSelectProps) {
  const { d } = useTranslation();
  // Default resolved here, not in the parameter list: a default parameter
  // cannot call a hook, and an English literal there would be permanently
  // untranslatable for every caller that omits the prop.
  const emptyText = emptyMessage ?? d.select.noMatches;
  const reactId = useId();
  const baseId = id ?? `ss-${reactId}`;
  const listboxId = `${baseId}-listbox`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Until the user actually types, the full list shows even though the input
  // is prefilled with the current selection - otherwise opening the dropdown
  // would show exactly one option, the one already chosen.
  const [dirty, setDirty] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  // Every rule in globals.css is scoped under .pebble-root, and the theme's
  // custom properties are declared there - portalling to document.body drops
  // out of that scope entirely, so .card stops matching and --paper resolves
  // to nothing (a transparent, unstyled panel). Mounting inside .pebble-root
  // still escapes the modal's scroll container, which is the whole point.
  const portalTarget = typeof document === 'undefined'
    ? null
    : (document.querySelector('.pebble-root') ?? document.body);
  const listRef = useRef<HTMLUListElement>(null);
  // Arrowing through the list scrolls rows under a stationary pointer, and each
  // one fires mouseenter - so hover would snap the highlight back to wherever
  // the mouse happens to rest, fighting the arrow keys. While this is set,
  // hover is ignored; a real mousemove (which scrolling alone cannot produce)
  // clears it and hands control back to the pointer.
  const keyboardNavRef = useRef(false);

  // Fixed-position coordinates for the portalled list, measured from the input
  // on open and kept in step with scroll and resize.
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);

  const measure = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const GAP = 4, MARGIN = 8, PREFERRED = 240;
    const below = window.innerHeight - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;
    // Flips up only when below is genuinely cramped AND above is roomier, so
    // the list does not jitter between sides on small scroll changes.
    const dropUp = below < 160 && above > below;
    setPos({
      left: r.left,
      width: r.width,
      top: dropUp ? undefined : r.bottom + GAP,
      bottom: dropUp ? window.innerHeight - r.top + GAP : undefined,
      maxHeight: Math.max(120, Math.min(PREFERRED, dropUp ? above : below)),
    });
  };

  useEffect(() => {
    if (!open) return;
    // capture: true because scroll does not bubble - a listener on window
    // would miss scrolling inside an ancestor container, and RecurringRuleModal
    // scrolls its own form body.
    const handle = () => measure();
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(
    () => (dirty ? filterOptions(options, query) : options),
    [options, query, dirty],
  );

  // Keyboard-only: hovering must not move aria-activedescendant, or the
  // highlight jumps whenever the pointer happens to rest over the list.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`#${CSS.escape(optionId(highlight))}`);
    // 'nearest' nudges the list minimally instead of re-centring every keypress.
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const openList = () => {
    if (disabled) return;
    keyboardNavRef.current = false;
    measure();
    setOpen(true);
    setDirty(false);
    setQuery(selected?.label ?? '');
    const i = options.findIndex((o) => o.value === value);
    setHighlight(i >= 0 ? i : 0);
  };

  // Reverts rather than clears: a category picker that empties itself because
  // you clicked away mid-type is a way to submit a transaction with no category.
  const closeAndRevert = () => {
    setOpen(false);
    setDirty(false);
    setQuery('');
  };

  const commit = (option: SearchableSelectOption) => {
    onChange(option.value);
    setOpen(false);
    setDirty(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // ⚠️ IME COMPOSITION GUARD. Everything below must be skipped while a
    // Chinese, Japanese or Korean input method is composing.
    //
    // A pinyin IME opens its own candidate list: ArrowUp/ArrowDown page
    // through candidates and Enter confirms the chosen one. Without this
    // guard those keys were intercepted here instead, so typing a category
    // name in Chinese moved the dropdown highlight and committed the wrong
    // option before the word was finished. Latin typing never produces a
    // composition, so this changes nothing in English.
    if (e.nativeEvent.isComposing) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { openList(); return; }
      if (filtered.length === 0) return;
      keyboardNavRef.current = true;
      // Wrapping, not clamping: 16 items is short enough that wrapping reads
      // as convenient rather than disorienting. Consistent in both directions.
      setHighlight((h) => {
        const next = e.key === 'ArrowDown' ? h + 1 : h - 1;
        return (next + filtered.length) % filtered.length;
      });
      return;
    }

    if (e.key === 'Enter') {
      if (!open) return; // let the surrounding form submit as usual
      // Without this the Enter that picks a category also submits the form.
      e.preventDefault();
      const option = filtered[highlight];
      if (option) commit(option);
      return;
    }

    if (e.key === 'Escape') {
      if (!open) return; // closed: let the modal's own handler take it
      // Modals listen for Escape on window. Without this, choosing to dismiss
      // the dropdown would close the whole modal and discard the form.
      e.stopPropagation();
      e.preventDefault();
      closeAndRevert();
      inputRef.current?.blur();
      return;
    }

    if (e.key === 'Tab' && open) closeAndRevert();
  };

  const inputStyle: React.CSSProperties = {
    padding: '0.6rem 2.1rem 0.6rem 0.75rem', borderRadius: '0.6rem',
    border: '1px solid var(--line)', fontSize: '0.9rem', color: 'var(--ink)',
    backgroundColor: 'var(--paper)', boxSizing: 'border-box', width: '100%',
    opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'text',
    ...style,
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {selected?.icon && !open && (
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', pointerEvents: 'none' }}>
          <selected.icon size={15} style={{ color: selected.color ?? 'var(--ink-soft)' }} />
        </span>
      )}
      <input
        ref={inputRef}
        id={baseId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[highlight] ? optionId(highlight) : undefined}
        aria-label={ariaLabel}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={open ? query : (selected?.label ?? '')}
        onChange={(e) => { setQuery(e.target.value); setDirty(true); setHighlight(0); if (!open) setOpen(true); }}
        // Select-all on focus so typing replaces the current value rather than
        // appending to it.
        // Focus alone does NOT open the list - a click, typing, or ArrowDown
        // does. Opening on any focus means Tab-focus and forwarded clicks
        // both pop the dropdown unexpectedly.
        onFocus={() => { requestAnimationFrame(() => inputRef.current?.select()); }}
        onClick={() => { if (!open) openList(); }}
        onBlur={closeAndRevert}
        onKeyDown={handleKeyDown}
        style={{ ...inputStyle, paddingLeft: selected?.icon && !open ? '2rem' : '0.75rem' }}
      />
      {/* A real toggle rather than a decorative glyph. Deliberately not wired to
          the input's own onClick: clicking the text area is how you reposition
          the cursor while editing a search, and closing the list on that would
          make the field unusable. tabIndex -1 keeps Tab landing on the combobox
          input, per the ARIA combobox pattern. mousedown, not click, so the
          input never blurs and reverts before this runs. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        onMouseDown={(e) => {
          e.preventDefault();
          if (open) { closeAndRevert(); } else { openList(); inputRef.current?.focus(); }
        }}
        style={{
          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 26, height: 26, padding: 0, border: 'none', borderRadius: '0.4rem',
          background: 'transparent', cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <ChevronDown size={15} style={{ color: 'var(--ink-soft)', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }} />
      </button>

      {open && createPortal(
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="card themed-scroll"
          // Portalled to document.body so an ancestor's overflow cannot clip it -
          // overflow clips absolutely positioned descendants regardless of
          // z-index. Containment still holds: React portals bubble events through
          // the REACT tree, so a click here still reaches the modal card's
          // stopPropagation and never reaches the backdrop.
          //
          // mousedown is prevented so clicking an option does not blur the input
          // first, which would revert and close before onClick fires.
          onMouseDown={(e) => e.preventDefault()}
          onMouseMove={() => { keyboardNavRef.current = false; }}
          style={{
            position: 'fixed',
            left: pos?.left ?? 0,
            width: pos?.width ?? 0,
            top: pos?.top,
            bottom: pos?.bottom,
            zIndex: 60,
            maxHeight: pos?.maxHeight ?? 240,
            overflowY: 'auto', padding: '0.3rem', margin: 0, listStyle: 'none',
            // Hidden for the frame before the first measurement lands, so it
            // never flashes at the top-left corner.
            visibility: pos ? 'visible' : 'hidden',
            // Belt and braces: if .pebble-root is ever absent the panel falls
            // back to document.body, where .card would not match. These keep it
            // legible rather than transparent.
            backgroundColor: 'var(--paper, #ffffff)',
            border: '1px solid var(--line, #e2e2e2)',
            borderRadius: '0.6rem',
            boxShadow: 'var(--shadow, 0 8px 24px rgba(0,0,0,0.12))',
          }}
        >
          {filtered.length === 0 ? (
            <li style={{ padding: '0.6rem 0.7rem', fontSize: '0.85rem', color: 'var(--ink-soft)' }}>{emptyText}</li>
          ) : (
            filtered.map((o, i) => {
              const OptionIconComponent = o.icon;
              const isHighlighted = i === highlight;
              return (
                <li
                  key={o.value}
                  id={optionId(i)}
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => commit(o)}
                  onMouseEnter={() => { if (!keyboardNavRef.current) setHighlight(i); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    padding: '0.5rem 0.7rem', borderRadius: '0.45rem', cursor: 'pointer',
                    fontSize: '0.88rem',
                    // Two signals, not one: --mist on a .card (--paper) is too
                    // slight a step to find at a glance while looking at the
                    // input. The bar stays legible in dark mode too. Kept as a
                    // transparent border when inactive so rows do not shift
                    // sideways as the highlight moves.
                    backgroundColor: isHighlighted ? 'var(--pine-soft)' : 'transparent',
                    borderLeft: `3px solid ${isHighlighted ? 'var(--pine)' : 'transparent'}`,
                    paddingLeft: 'calc(0.7rem - 3px)',
                    fontWeight: o.value === value ? 600 : 400,
                  }}
                >
                  {OptionIconComponent && (
                    <span style={{
                      width: 24, height: 24, borderRadius: '0.45rem', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backgroundColor: o.color ? `${o.color}20` : 'var(--mist)',
                    }}>
                      <OptionIconComponent size={13} style={{ color: o.color ?? 'var(--ink-soft)' }} />
                    </span>
                  )}
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.label}</span>
                </li>
              );
            })
          )}
        </ul>,
        portalTarget ?? document.body,
      )}
    </div>
  );
}
