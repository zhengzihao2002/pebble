'use client';

import { useId } from 'react';
import { Waves } from 'lucide-react';
import { Switch } from '@/components/shared/Switch';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SettingsRow } from './SettingsRow';

export function AmbientBackgroundControl() {
  const { d } = useTranslation();
  const enabled = usePebbleStore(s => s.ambientBackground) === true;
  const setEnabled = usePebbleStore(s => s.setAmbientBackground);
  const titleId = useId();
  return <SettingsRow icon={Waves} title={d.ambientBackground.title} hint={d.ambientBackground.hint} titleId={titleId} layout="side">
    <Switch checked={enabled} onChange={setEnabled} labelledBy={titleId} className="pb-settings-switch" />
  </SettingsRow>;
}
