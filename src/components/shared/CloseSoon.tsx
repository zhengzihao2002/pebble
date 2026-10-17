'use client';

import { useEffect } from 'react';

/**
 * Closes a ModalFrame dialog once the render that made it busy-free has
 * committed. ModalFrame reads `busy` through a ref refreshed in an effect, so
 * a close() timed from the action handler itself can fire while the frame
 * still believes it is busy - it is then ignored and the dialog stays open
 * over a row that no longer exists. Rendering this after the busy flag has
 * cleared schedules close() from that settled render instead.
 */
export function CloseSoon({ close }: { close: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(close, 0);
    return () => window.clearTimeout(id);
  }, [close]);
  return null;
}
