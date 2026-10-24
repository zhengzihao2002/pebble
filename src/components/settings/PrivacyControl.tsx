'use client';

import { EyeOff } from 'lucide-react';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { SettingsRow } from './SettingsRow';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * Whether amounts start blurred when Pebble opens. The header eye switches
 * privacy for the session; this only sets where each launch starts.
 * The kit SegmentedControl, like SelectModeControl. Its values are strings,
 * so the stored boolean is mapped at the edge; only exactly true blurs.
 */
export function PrivacyControl() {
  const { d } = useTranslation();
  const privacyOnLaunch = usePebbleStore((s) => s.privacyOnLaunch);
  const setPrivacyOnLaunch = usePebbleStore((s) => s.setPrivacyOnLaunch);
  // Anything but exactly true is "show", so a value from another build
  // never leaves both options unselected.
  const current = privacyOnLaunch === true;

  return (
    <SettingsRow icon={EyeOff} title={d.privacyMode.title} hint={d.privacyMode.hint}>
      <SegmentedControl
        options={[
          { value: 'show', label: d.privacyMode.optionShow },
          { value: 'blur', label: d.privacyMode.optionBlur },
        ]}
        value={current ? 'blur' : 'show'}
        onChange={(v) => setPrivacyOnLaunch(v === 'blur')}
        ariaLabel={d.privacyMode.title}
      />
    </SettingsRow>
  );
}
