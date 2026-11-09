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
  const size = usePebbleStore(state => state.cursorSize);
  const setSize = usePebbleStore(state => state.setCursorSize);
  const id = useId();
  return <SettingsRow className="pb-cursor-setting" id={SETTING_TARGETS.softCursor} icon={MousePointer2} title={d.softCursor.title} hint={d.softCursor.hint} titleId={id} layout="side">
    <Switch checked={enabled} onChange={setEnabled} labelledBy={id} className="pb-settings-switch" />
    {enabled && <div className="pb-cursor-size" role="group" aria-label={d.softCursor.size}>
      {([{ value: 24, label: d.softCursor.small }, { value: 32, label: d.softCursor.default }, { value: 48, label: d.softCursor.large }]).map(option =>
        <button key={option.value} type="button" aria-pressed={size === option.value}
          className={`pb-settings-preset${size === option.value ? ' is-active' : ''}`} onClick={() => setSize(option.value)}>
          {option.label}
        </button>)}
    </div>}
  </SettingsRow>;
}
