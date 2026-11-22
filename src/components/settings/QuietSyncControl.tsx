'use client';

import { useId } from 'react';
import { RefreshCw } from 'lucide-react';
import { useQuietSync } from '@/components/offline/QuietSyncProvider';
import { InfoTooltip } from '@/components/shared/InfoTooltip';
import { Switch } from '@/components/shared/Switch';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { QUIET_SYNC_MAX_AGE_HOURS } from '@/lib/offline/quietSync';
import { SettingsRow } from './SettingsRow';
import { SETTING_TARGETS } from './settingsTargets';

export function QuietSyncControl() {
  const { d, t } = useTranslation();
  const { enabled, setEnabled, problem } = useQuietSync();
  const q = d.ux.offline.quietSync;
  const id = useId();

  return (
    <SettingsRow
      id={SETTING_TARGETS.quietSync}
      icon={RefreshCw}
      title={<span className="pb-quiet-title">
        <span id={id}>{q.title}</span>
        <span className="pb-quiet-beta">{q.beta}</span>
        <InfoTooltip label={q.aboutLabel} pressOnly width={360}>
          <div className="pb-quiet-help">
            <div>
              <p className="pb-quiet-help-heading">{q.aboutData}</p>
              <dl>
                <dt>{q.aboutSyncLabel}</dt>
                <dd>{t(q.aboutSync, { hours: QUIET_SYNC_MAX_AGE_HOURS })}</dd>
                <dt>{q.aboutSavedDataLabel}</dt>
                <dd>{q.aboutSavedData}</dd>
              </dl>
            </div>
            <div>
              <p className="pb-quiet-help-heading">{q.aboutApp}</p>
              <dl>
                <dt>{q.aboutDownloadLabel}</dt>
                <dd>{q.aboutDownload}</dd>
                <dt>{q.aboutSavedAppLabel}</dt>
                <dd>{q.aboutSavedApp}</dd>
              </dl>
            </div>
            <p className="pb-quiet-help-note">{t(q.aboutOffline, { hours: QUIET_SYNC_MAX_AGE_HOURS })}</p>
          </div>
        </InfoTooltip>
      </span>}
      hint={<>{q.settingHint}{problem && <span className="pb-quiet-problem" role="status">{q.problem[problem]}</span>}</>}
      layout="side"
    >
      <Switch checked={enabled} onChange={setEnabled} labelledBy={id} className="pb-settings-switch" />
    </SettingsRow>
  );
}
