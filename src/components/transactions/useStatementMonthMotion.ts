'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import { capturePeriodCardHeights, settleCardResizes } from '@/lib/cardResize';

type ScrollPosition = {
  month: number;
  port: HTMLElement;
  top: number;
  atEnd: boolean;
};

export function useStatementMonthMotion(month: number) {
  const statementRef = useRef<HTMLDivElement>(null);
  const scrollPosition = useRef<ScrollPosition | null>(null);
  const restoreAnchoring = useRef<(() => void) | null>(null);

  const prepare = useCallback((nextMonth: number) => {
    restoreAnchoring.current?.();
    const statement = statementRef.current;
    const root = statement?.closest<HTMLElement>('.pebble-root');
    if (!statement || !root) return;

    const pane = statement.closest<HTMLElement>('.pb-txn-pane-right');
    const split = pane && getComputedStyle(pane).display !== 'contents';
    const port = split ? pane : root;
    const top = port.scrollTop;
    const end = Math.max(0, port.scrollHeight - port.clientHeight);
    const atEnd = end > 2 && top >= end - 2;
    const area = port.getBoundingClientRect();
    const toolbar = statement.previousElementSibling;
    const readingTop = Math.max(area.top, root.querySelector('.pebble-header')?.getBoundingClientRect().bottom ?? area.top,
      toolbar?.getBoundingClientRect().bottom ?? area.top);
    const insideStatement = top > 2 && statement.getBoundingClientRect().top < readingTop - 2;
    const preserveScroll = atEnd || insideStatement;

    // Resize the card only when its moving edge can actually be seen.
    capturePeriodCardHeights(statement, preserveScroll ? null : area.top + port.clientHeight);
    scrollPosition.current = preserveScroll ? { month: nextMonth, port, top, atEnd } : null;
    if (!preserveScroll) return;

    // Hold browser scroll anchoring through the layout commit. The old
    // rows have no matching anchor in the next month.
    const previous = port.style.overflowAnchor;
    port.style.overflowAnchor = 'none';
    restoreAnchoring.current = () => {
      port.style.overflowAnchor = previous;
      restoreAnchoring.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const saved = scrollPosition.current;
    const statement = statementRef.current;
    if (!saved || saved.month !== month || !statement) return;
    scrollPosition.current = null;
    settleCardResizes(statement);
    const { port, atEnd, top } = saved;
    const end = Math.max(0, port.scrollHeight - port.clientHeight);
    port.scrollTo({ top: atEnd ? end : Math.min(top, end), behavior: 'instant' });

    // Keep anchoring suspended until the new rows have painted.
    const restore = restoreAnchoring.current;
    let afterPaint = 0;
    const beforePaint = requestAnimationFrame(() => { afterPaint = requestAnimationFrame(() => {
      if (restoreAnchoring.current === restore) restore?.();
    }); });
    return () => {
      cancelAnimationFrame(beforePaint);
      cancelAnimationFrame(afterPaint);
      if (restoreAnchoring.current === restore) restore?.();
    };
  }, [month]);

  return { statementRef, prepare };
}
