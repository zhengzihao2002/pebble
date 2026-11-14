'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { createSidebarMotion } from '@/lib/sidebarMotion';
import { usePebbleStore } from '@/store/usePebbleStore';

export function useSidebarMotion(ref: RefObject<HTMLElement | null>) {
  const motion = useRef<ReturnType<typeof createSidebarMotion> | null>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const controller = createSidebarMotion(ref.current,
      () => usePebbleStore.getState().sidebarCollapsed,
      collapsed => usePebbleStore.getState().setSidebarCollapsed(collapsed));
    motion.current = controller;
    return () => { motion.current = null; controller.dispose(); };
  }, [ref]);
  return () => motion.current?.toggle();
}
