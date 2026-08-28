'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { authClient } from '@/lib/auth/client';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface SignOutButtonProps {
  className?: string;
  style?: React.CSSProperties;
  iconSize?: number;
}

export function SignOutButton({ className = 'nav-btn', style, iconSize = 18 }: SignOutButtonProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const { d } = useTranslation();

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } catch (err) {
      console.error('Sign out failed:', err);
    } finally {
      router.push('/auth/sign-in');
      router.refresh();
    }
  };

  return (
    <button onClick={handleSignOut} className={className} style={style} disabled={signingOut}>
      <LogOut size={iconSize} />
      {signingOut ? d.auth.signingOut : d.auth.signOut}
    </button>
  );
}
