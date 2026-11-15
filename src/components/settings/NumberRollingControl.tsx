'use client';

import { useId } from 'react';
import { Sparkles } from 'lucide-react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Switch } from '@/components/shared/Switch';
import { SettingsRow } from './SettingsRow';
import { SETTING_TARGETS } from './settingsTargets';

export function NumberRollingControl() {
  const { d } = useTranslation();
  const enabled = usePebbleStore(state => state.numberRolling);
  const setEnabled = usePebbleStore(state => state.setNumberRolling);
  const id = useId();
  return <SettingsRow id={SETTING_TARGETS.numberRolling} icon={Sparkles} title={d.numberRolling.title} hint={d.numberRolling.hint} titleId={id} layout="side">
    <Switch checked={enabled} onChange={setEnabled} labelledBy={id} className="pb-settings-switch" />
  </SettingsRow>;
}
