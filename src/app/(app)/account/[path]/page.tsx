import { notFound } from 'next/navigation';
import { accountViewPaths } from '@neondatabase/auth-ui/server';
import { AccountViewClient } from './AccountViewClient';

/**
 * Better Auth UI's account views (profile, change password, active sessions
 * with revoke), rendered INSIDE the (app) group so they get the sidebar,
 * header and .pebble-root theme scope like every other page.
 *
 * Path validation happens here rather than via generateStaticParams /
 * dynamicParams, which cannot coexist with force-dynamic - required by
 * invariant 5, and forced anyway by (app)/layout.tsx reading cookies.
 *
 * Not a URL change - (app) is a route group, so /account/security still
 * resolves here.
 */
export const dynamic = 'force-dynamic';

const VALID_PATHS = new Set<string>(Object.values(accountViewPaths));

export default async function AccountPage({ params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  if (!VALID_PATHS.has(path)) notFound();

  return <AccountViewClient path={path} />;
}
