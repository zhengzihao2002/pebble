'use client';

import { useLayoutEffect, type RefObject } from 'react';
import { observeCardResizes } from '@/lib/cardResize';

export function useCardResize(ref: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    if (ref.current) return observeCardResizes(ref.current);
  }, [ref]);
}
