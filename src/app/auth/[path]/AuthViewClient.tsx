'use client';

import dynamic from 'next/dynamic';
import { LoadingBlock } from '@/components/shared/Spinner';

/**
 * Some of the auth library's views render differently on the server and in
 * the browser - email-verification drew a <div> on the server and a <form>
 * in the browser, a hydration mismatch. The same fix AccountViewClient
 * already uses for the account views: skip the server render of the form
 * only. The brand panel around it stays server-rendered and appears at once.
 */
const AuthView = dynamic(
  () => import('@neondatabase/auth-ui').then((m) => m.AuthView),
  { ssr: false, loading: () => <LoadingBlock minHeight={320} /> },
);

export function AuthViewClient({ path }: { path: string }) {
  return <AuthView path={path} />;
}
