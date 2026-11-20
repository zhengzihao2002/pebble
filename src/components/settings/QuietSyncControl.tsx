'use client';

import { useId } from 'react';
import { RefreshCw } from 'lucide-react';
import { useQuietSync } from '@/components/offline/QuietSyncProvider';
import { Switch } from '@/components/shared/Switch';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SettingsRow } from './SettingsRow';
import { SETTING_TARGETS } from './settingsTargets';

export function QuietSyncControl() {
  const { d } = useTranslation();
  const { enabled, setEnabled, problem } = useQuietSync();
  const q = d.ux.offline.quietSync;
  const id = useId();

  return (
    <SettingsRow
      id={SETTING_TARGETS.quietSync}
      icon={RefreshCw}
      title={<>{q.title} <span className="pb-quiet-beta">{q.beta}</span></>}
      hint={<>{q.settingHint}{problem && <span className="pb-quiet-problem" role="status">{q.problem[problem]}</span>}</>}
      titleId={id}
      layout="side"
    >
      <Switch checked={enabled} onChange={setEnabled} labelledBy={id} className="pb-settings-switch" />
    </SettingsRow>
  );
}
