'use client';

import { useEffect, useMemo, useState } from 'react';
import { Globe, Globe2 } from 'lucide-react';
import { SettingsRow } from './SettingsRow';
import { setTimeZoneOverrideAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { LoadingOverlay } from '@/components/shared/Spinner';
import { SelectField, type SelectFieldOption } from '@/components/shared/SelectField';
import { resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';

interface TimeZoneCardProps {
  /** The stored override column value - null means "follow browser detection".
   *  This is NOT the resolved effective zone; it is exactly user_account.time_zone. */
  timeZoneOverride: string | null;
}

const DEVICE_SENTINEL = '__device__';

/**
 * Pins a timezone for finances, independent of wherever the browser
 * currently reports - useful for someone travelling who wants dates anchored
 * to home. null clears the override; resolution then falls through to the
 * pebble-tz cookie (see resolveUserTimeZone()).
 *
 * ⚠️ HYDRATION: resolveBrowserTimeZone() reads the real browser zone. This
 * component is 'use client' but Next still renders it once on the server
 * first, where that call would report the container's zone (UTC on Vercel)
 * instead - producing a label that mismatches between server and client HTML.
 * Read in a mount effect instead, same as AppShell's own pebble-tz write, with
 * the label staying zone-free until then.
 */
export function TimeZoneCard({ timeZoneOverride }: TimeZoneCardProps) {
  const { d, locale } = useTranslation();

  const [deviceZone, setDeviceZone] = useState<string | null>(null);
  useEffect(() => {
    setDeviceZone(resolveBrowserTimeZone());
  }, []);

  const options = useMemo<SelectFieldOption[]>(() => {
    const zones = Intl.supportedValuesOf('timeZone');
    return [
      {
        value: DEVICE_SENTINEL,
        label: deviceZone
          ? d.settings.timeZone.deviceOption.replace('{zone}', deviceZone)
          : d.settings.timeZone.deviceOptionGeneric,
        icon: Globe,
      },
      ...zones.map((z) => ({ value: z, label: z })),
    ];
  }, [deviceZone, d]);

  const [selected, setSelected] = useState(timeZoneOverride ?? DEVICE_SENTINEL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  const dirty = selected !== (timeZoneOverride ?? DEVICE_SENTINEL);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const zone = selected === DEVICE_SENTINEL ? null : selected;
    const result = await callAction(() => setTimeZoneOverrideAction(zone));
    setSaving(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); return; }
    setSaved(true);
  };

  // A row in the Language & region group. The row is position: relative
  // (settings.css), so the saving overlay covers just this setting.
  return (
    <SettingsRow icon={Globe2} title={d.settings.timeZone.title} hint={d.settings.timeZone.hint} layout="stack">
      {saving && <LoadingOverlay label={d.common.saving} />}
      <div className="pb-settings-tz">
        <div className="pb-settings-tz-field">
          <SelectField
            value={selected}
            onChange={(v) => { setSelected(v); setSaved(false); }}
            options={options}
            ariaLabel={d.settings.timeZone.label}
          />
        </div>
        <button
          onClick={handleSave} disabled={saving || !dirty} className="btn-primary"
          style={{ padding: '0.6rem 1.1rem', opacity: saving || !dirty ? 0.6 : 1 }}
        >
          {saving ? d.common.saving : d.settings.timeZone.save}
        </button>
      </div>

      <ActionError message={error} kind={errorKind} onRetry={handleSave} busy={saving} style={{ marginTop: '0.75rem' }} />
      {saved && !dirty && (
        <p className="pb-settings-saved" role="status">{d.settings.timeZone.saved}</p>
      )}
    </SettingsRow>
  );
}
