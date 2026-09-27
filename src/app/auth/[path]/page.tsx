import { redirect } from 'next/navigation';
import { AuthView } from '@neondatabase/auth-ui';

export const dynamicParams = false;

export default async function AuthPage({ params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  // Email-code sign-in is off (see src/app/api/auth). The library keeps the
  // view registered because password reset uses email codes.
  if (path === 'email-otp') redirect('/auth/sign-in');
  return (
    <main className="pebble-auth container mx-auto flex grow flex-col items-center justify-center gap-3 self-center p-4 md:p-6">
      <AuthView path={path} />
    </main>
  );
}
