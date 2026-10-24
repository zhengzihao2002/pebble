'use client';

import { TextSelect } from 'lucide-react';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { SettingsRow } from './SettingsRow';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * Whether text in the app can be highlighted and copied. Off by default, so a
 * stray long-press on a phone does not select the page. Text fields and
 * search boxes always stay selectable (globals.css, .pb-no-select).
 * The kit SegmentedControl, like PrivacyControl; only exactly true allows.
 */
export function TextSelectControl() {
  const { d } = useTranslation();
  const allow = usePebbleStore((s) => s.allowTextSelect) === true;
  const setAllow = usePebbleStore((s) => s.setAllowTextSelect);
  return (
    <SettingsRow icon={TextSelect} title={d.selectMode.textSelectTitle} hint={d.selectMode.textSelectHint}>
      <SegmentedControl
        options={[
          { value: 'off', label: d.selectMode.textSelectOff },
          { value: 'on', label: d.selectMode.textSelectOn },
        ]}
        value={allow ? 'on' : 'off'}
        onChange={(v) => setAllow(v === 'on')}
        ariaLabel={d.selectMode.textSelectTitle}
      />
    </SettingsRow>
  );
}
