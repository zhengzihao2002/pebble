'use client';

import { LayoutTemplate, LoaderCircle } from 'lucide-react';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { usePebbleStore } from '@/store/usePebbleStore';
import { SettingsRow } from './SettingsRow';

export function LoadingStyleControl() {
  const { d } = useTranslation();
  const u = d.ux.settings;
  const style = usePebbleStore(s => s.loadingStyle);
  const setStyle = usePebbleStore(s => s.setLoadingStyle);
  return <SettingsRow icon={LoaderCircle} title={u.loadingStyle} hint={u.loadingStyleHint}>
    <SegmentedControl
      options={[
        { value: 'spinner', label: u.loadingSpinner, icon: LoaderCircle },
        { value: 'cached', label: u.loadingCached, icon: LayoutTemplate },
      ]}
      value={style === 'spinner' ? 'spinner' : 'cached'}
      onChange={setStyle}
      ariaLabel={u.loadingStyle}
    />
  </SettingsRow>;
}
