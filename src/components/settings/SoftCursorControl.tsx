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
    {enabled && <label className="pb-cursor-size">
      <span>{d.softCursor.size}</span>
      <input aria-label={d.softCursor.size} type="range" min="24" max="48" step="8" value={size} onChange={event => setSize(Number(event.target.value))} className="pb-settings-range" />
      <output className="pb-tnum">{size}px</output>
    </label>}
  </SettingsRow>;
}
