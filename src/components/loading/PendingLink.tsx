'use client';
import Link, { useLinkStatus } from 'next/link';
import { forwardRef, useEffect, useRef, type ComponentProps } from 'react';
import { beginNavigation, finishNavigation } from './navigation';

function PendingStatus({ pathname }: { pathname: string }) {
  const { pending } = useLinkStatus();
  const wasPending = useRef(false);
  useEffect(() => {
    if (pending) wasPending.current = true;
    else if (wasPending.current) { wasPending.current = false; finishNavigation(pathname); }
  }, [pending, pathname]);
  return null;
}
/** Shows the destination's own outline immediately, without waking unused routes. */
const PendingLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof Link>>(function PendingLink({ onNavigate, href, children, ...props }, ref) {
  const path = typeof href === 'string' ? href : href.pathname ?? '';
  return <Link {...props} href={href} ref={ref} onNavigate={event => {
    let cancelled = false;
    onNavigate?.({ preventDefault: () => { cancelled = true; event.preventDefault(); } });
    if (!cancelled) beginNavigation(path);
  }}><PendingStatus pathname={path.split(/[?#]/)[0]}/>{children}</Link>;
});
export default PendingLink;
