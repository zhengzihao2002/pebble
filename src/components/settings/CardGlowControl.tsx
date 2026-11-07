'use client';

import { useId } from 'react';
import { Sparkles } from 'lucide-react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Switch } from '@/components/shared/Switch';
import { SettingsRow } from './SettingsRow';
import { SETTING_TARGETS } from './settingsTargets';

export function CardGlowControl() {
  const { d } = useTranslation();
  const enabled = usePebbleStore(state => state.cardGlow);
  const setEnabled = usePebbleStore(state => state.setCardGlow);
  const id = useId();
  return <SettingsRow id={SETTING_TARGETS.cardGlow} icon={Sparkles} title={d.cardGlow.title} hint={d.cardGlow.hint} titleId={id} layout="side">
    <Switch checked={enabled} onChange={setEnabled} labelledBy={id} className="pb-settings-switch" />
  </SettingsRow>;
}
