'use client';

import { useId } from 'react';
import { Store } from 'lucide-react';
import { Switch } from '@/components/shared/Switch';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SettingsRow } from './SettingsRow';

export function BrandIconsControl() {
  const { d } = useTranslation();
  const enabled = usePebbleStore(s => s.showBrandIcons) !== false;
  const setEnabled = usePebbleStore(s => s.setShowBrandIcons);
  const titleId = useId();
  return <SettingsRow icon={Store} title={d.brandIcons.title} hint={d.brandIcons.hint} titleId={titleId} layout="side">
    <Switch checked={enabled} onChange={setEnabled} labelledBy={titleId} className="pb-settings-switch" />
  </SettingsRow>;
}
