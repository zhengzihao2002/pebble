'use client';

import { useId } from 'react';
import { Play, Sparkles } from 'lucide-react';
import { SettingsRow } from './SettingsRow';
import { Switch } from '@/components/shared/Switch';
import { usePebbleStore } from '@/store/usePebbleStore';
import { WELCOME_PREVIEW_EVENT } from '@/components/layout/WelcomeOverlay';
import { useTranslation } from '@/lib/i18n/useTranslation';

export function WelcomeAnimationControl() {
  const { d } = useTranslation();
  const enabled = usePebbleStore((s) => s.showWelcome);
  const setShowWelcome = usePebbleStore((s) => s.setShowWelcome);

  const titleId = useId();

  return (
    <SettingsRow icon={Sparkles} title={d.welcome.settingTitle} hint={d.welcome.settingHint} titleId={titleId}>
      <div className="pb-settings-inline">
        <button
          type="button" className="pill pb-settings-pill"
          onClick={() => window.dispatchEvent(new Event(WELCOME_PREVIEW_EVENT))}
        >
          <Play size={13} aria-hidden="true" />{d.welcome.preview}
        </button>
        <Switch checked={enabled !== false} onChange={setShowWelcome} labelledBy={titleId} className="pb-settings-switch" />
      </div>
    </SettingsRow>
  );
}
