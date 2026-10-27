'use client';

import { useId } from 'react';
import { Wind } from 'lucide-react';
import { SettingsRow } from './SettingsRow';
import { Switch } from '@/components/shared/Switch';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';

export function BreathingBackgroundControl() {
  const { d } = useTranslation();
  const enabled = usePebbleStore((s) => s.breathingBackground);
  const setEnabled = usePebbleStore((s) => s.setBreathingBackground);
  const id = useId();
  return (
    <SettingsRow icon={Wind} title={d.breathingBackground.title} hint={d.breathingBackground.hint} titleId={id}>
      <Switch checked={enabled === true} onChange={setEnabled} labelledBy={id} className="pb-settings-switch" />
    </SettingsRow>
  );
}
