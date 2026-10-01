'use client';

import { X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface ModalCloseButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

/**
 * The close control for every Pebble dialog: a soft wine dot with a cross that
 * is always visible (hover fills it solid). The hit area is about 44px on every
 * device (all in globals.css, .pb-close-dot).
 *
 * Pass ModalFrame's close() as onClick and the save flag as disabled.
 */
export function ModalCloseButton({ onClick, disabled = false }: ModalCloseButtonProps) {
  const { d } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={d.common.close}
      className="pb-close-dot"
    >
      <X size={14} strokeWidth={2.75} aria-hidden="true" />
    </button>
  );
}
