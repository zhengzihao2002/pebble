'use client';

import { useRef } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface TitleDescriptionFieldsProps {
  title: string;
  description: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  /** Each form passes its own styling - the four forms differ slightly in size. */
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
  /** The form's existing "optional" wording, so this marker matches its other fields. */
  optionalLabel: string;
  titlePlaceholder?: string;
  /** Native required attribute. Only has an effect inside a <form>. */
  required?: boolean;
  /** Shown under the title input. Used by the edit form, which is not a <form>. */
  titleError?: string | null;
}

/**
 * Title (one line) above Description (multi-line), shared by every form that
 * writes a description. One component on purpose: four forms each carrying
 * their own copy is four places for the Enter handling or the IME guard to
 * drift apart.
 *
 * The parent owns both values and joins them with composeDescription() from
 * src/lib/transactionDescription.ts - this component never sees the stored
 * string.
 */
export function TitleDescriptionFields({
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  inputStyle,
  labelStyle,
  optionalLabel,
  titlePlaceholder,
  required = true,
  titleError,
}: TitleDescriptionFieldsProps) {
  const { d } = useTranslation();
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Enter in the title moves to the description instead of submitting the
  // form. Skipped while an IME is composing: Chinese input confirms a
  // candidate with Enter. isComposing covers modern browsers; keyCode 229
  // covers Safari, which fires the confirming keydown after compositionend.
  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    descriptionRef.current?.focus();
  };

  return (
    <>
      <label style={labelStyle}>
        {d.titleDescription.title}
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={handleTitleKeyDown}
          required={required}
          placeholder={titlePlaceholder ?? d.titleDescription.titlePlaceholder}
          aria-invalid={titleError ? true : undefined}
          style={{ ...inputStyle, ...(titleError ? { border: '1px solid var(--wine)' } : {}) }}
        />
        {titleError && (
          <span style={{ fontSize: '0.75rem', color: 'var(--wine)', lineHeight: 1.45 }}>{titleError}</span>
        )}
      </label>

      <label style={labelStyle}>
        <span>{d.titleDescription.description} <span style={{ opacity: 0.7 }}>{optionalLabel}</span></span>
        <textarea
          ref={descriptionRef}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          rows={3}
          placeholder={d.titleDescription.descriptionPlaceholder}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </label>
    </>
  );
}
