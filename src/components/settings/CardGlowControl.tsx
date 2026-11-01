'use client';

import { useId } from 'react';
import { SunDim } from 'lucide-react';
import { Switch } from '@/components/shared/Switch';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SettingsRow } from './SettingsRow';

export function CardGlowControl() {
  const { d } = useTranslation();
  const enabled = usePebbleStore(s => s.showCardGlow) !== false;
  const setEnabled = usePebbleStore(s => s.setShowCardGlow);
  const titleId = useId();
  return <SettingsRow icon={SunDim} title={d.cardGlow.title} hint={d.cardGlow.hint} titleId={titleId} layout="side">
    <Switch checked={enabled} onChange={setEnabled} labelledBy={titleId} className="pb-settings-switch"/>
  </SettingsRow>;
}
