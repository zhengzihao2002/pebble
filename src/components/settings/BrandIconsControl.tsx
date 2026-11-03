'use client';

import { useId } from 'react';
import { Image, Store } from 'lucide-react';
import { Switch } from '@/components/shared/Switch';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SettingsRow } from './SettingsRow';

export function BrandIconsControl() {
  const { d } = useTranslation();
  const enabled = usePebbleStore(s => s.showBrandIcons) !== false;
  const setEnabled = usePebbleStore(s => s.setShowBrandIcons);
  const size = usePebbleStore(s => s.brandIconSize) === 'large' ? 'large' : 'default';
  const setSize = usePebbleStore(s => s.setBrandIconSize);
  const titleId = useId();
  return <><SettingsRow icon={Store} title={d.brandIcons.title} hint={d.brandIcons.hint} titleId={titleId} layout="side">
    <Switch checked={enabled} onChange={setEnabled} labelledBy={titleId} className="pb-settings-switch" />
  </SettingsRow>
    <SettingsRow icon={Image} title={d.brandIcons.sizeTitle} hint={d.brandIcons.sizeHint}>
      <SegmentedControl
        options={(['default', 'large'] as const).map(value => ({ value, label: d.brandIcons[value] }))}
        value={size} onChange={setSize} ariaLabel={d.brandIcons.sizeTitle}
      />
    </SettingsRow>
  </>;
}
