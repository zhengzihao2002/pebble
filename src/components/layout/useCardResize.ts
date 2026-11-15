'use client';

import { useLayoutEffect, type RefObject } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { observeCardResizes } from '@/lib/cardResize';

export function useCardResize(ref: RefObject<HTMLDivElement | null>) {
  const locale = usePebbleStore(state => state.locale);
  useLayoutEffect(() => {
    if (ref.current) return observeCardResizes(ref.current);
  }, [ref]);
  // Parent layout effects run after translated descendants commit, before paint.
  // A MutationObserver can fire earlier for unrelated shell updates.
  useLayoutEffect(() => {
    window.dispatchEvent(new Event('pebble:after-language-change'));
  }, [locale]);
}
