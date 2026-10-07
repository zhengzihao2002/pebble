'use client';

import { Moon } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * Marks a hibernated account, everywhere one appears: a small rounded
 * rectangle with a slowly breathing moon. Border and fill come from the
 * surrounding text colour (currentColor), so it suits plain cards and the
 * pine Dashboard hero alike. Grey, never gold.
 */
export function SleepingBadge({ onHero = false }: { onHero?: boolean }) {
  const { d } = useTranslation();
  return (
    <span className={`pb-sleep-badge${onHero ? ' pb-sleep-badge-hero' : ''}`}>
      <Moon size={10} aria-hidden="true" className="pb-sleep-moon" />
      {d.accounts.hibernated}
    </span>
  );
}
