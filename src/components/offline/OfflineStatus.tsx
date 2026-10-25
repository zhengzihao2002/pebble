'use client';

import { useEffect, useState } from 'react';
import { UploadCloud, WifiOff } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useOfflineQueue } from './OfflineProvider';

/**
 * The header's quiet status line: "Offline — showing saved data" while there
 * is no connection, and a badge with the number of transactions waiting to
 * upload for as long as any are. Tapping the badge opens the same dialog the
 * prompt does.
 *
 * Absent from the DOM until it is first needed, then it folds open and shut
 * (grid-template-rows, the accepted collapse technique) rather than popping,
 * and stays mounted while folded so its text does not vanish mid-fold. Folded,
 * it is inert and hidden from assistive tech.
 *
 * Rendered by Header as a direct child, so the header's width cap applies and
 * its measured height (--pb-header-h) follows the fold.
 */
export function OfflineStatus() {
  const { d, t } = useTranslation();
  const o = d.ux.offline;
  const { offline, items, openList } = useOfflineQueue();
  const count = items.length;
  const wanted = offline || count > 0;

  const [everShown, setEverShown] = useState(false);
  // Derived during render (React re-renders at once): once it has been needed
  // it stays in the DOM.
  if (wanted && !everShown) setEverShown(true);
  // Follows `wanted` one frame later, so the first fold animates from closed
  // and a change never lands mid-render.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(wanted));
    return () => cancelAnimationFrame(id);
  }, [wanted]);

  if (!everShown) return null;

  const waiting = count === 1 ? o.waitingOne : t(o.waitingMany, { count });

  return (
    <div className="pb-off-strip" data-open={open} aria-hidden={!open} {...(!open ? { inert: true } : {})}>
      <div className="pb-off-strip-inner">
        <div className="pb-off-strip-row">
          <span className="pb-off-indicator" role="status" aria-live="polite">
            {offline && (
              <>
                <WifiOff size={14} aria-hidden="true" />
                <span className="pb-off-long">{o.indicator}</span>
                <span className="pb-off-short">{o.indicatorShort}</span>
              </>
            )}
          </span>
          {count > 0 && (
            <button type="button" className="pb-off-badge" onClick={openList} aria-label={`${waiting}. ${o.waitingAria}`}>
              <UploadCloud size={14} aria-hidden="true" />
              <span className="pb-tnum">{waiting}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
