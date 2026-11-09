'use client';

import { useId } from 'react';
import { MousePointer2 } from 'lucide-react';
import { Switch } from '@/components/shared/Switch';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SettingsRow } from './SettingsRow';
import { SETTING_TARGETS } from './settingsTargets';

export function SoftCursorControl() {
  const { d } = useTranslation();
  const enabled = usePebbleStore(state => state.softCursor) === true;
  const setEnabled = usePebbleStore(state => state.setSoftCursor);
  const id = useId();
  return <SettingsRow id={SETTING_TARGETS.softCursor} icon={MousePointer2} title={d.softCursor.title} hint={d.softCursor.hint} titleId={id} layout="side">
    <Switch checked={enabled} onChange={setEnabled} labelledBy={id} className="pb-settings-switch" />
  </SettingsRow>;
}
