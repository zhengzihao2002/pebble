'use client';

import { Switch } from '@/components/shared/Switch';
import { useId } from 'react';
import { HeartPulse } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SettingsRow } from './SettingsRow';

interface HealthBarControlProps {
  enabled: boolean;
  onChange: (value: boolean) => void;
}

// Same shape as AppearanceControl: a device preference, off by default.
export function HealthBarControl({ enabled, onChange }: HealthBarControlProps) {
  const { d } = useTranslation();

  const titleId = useId();

  // The card used to repeat its title as a near-identical label above the
  // switch ("Health status bar" / "Show on dashboard"). The row shows the
  // title once; the switch is named by it.
  return (
    <SettingsRow icon={HeartPulse} title={d.healthBar.settingTitle} hint={d.healthBar.settingHint} titleId={titleId} layout="side">
      <Switch checked={enabled} onChange={onChange} labelledBy={titleId} className="pb-settings-switch" />
    </SettingsRow>
  );
}
