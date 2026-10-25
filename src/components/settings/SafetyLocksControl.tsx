'use client';

import { useId } from 'react';
import { Landmark, Lock, Receipt, Tags, UserX, type LucideIcon } from 'lucide-react';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { SettingsRow } from './SettingsRow';
import { SETTING_TARGETS } from './settingsTargets';
import { Switch } from '@/components/shared/Switch';
import { usePebbleStore } from '@/store/usePebbleStore';
import { SAFETY_LOCK_KEYS, isLocked, type SafetyLockKey } from '@/lib/safetyLocks';
import { useTranslation } from '@/lib/i18n/useTranslation';

// What each lock guards, as a mark beside its name.
const LOCK_ICONS: Record<SafetyLockKey, LucideIcon> = {
  deletePebbleAccount: UserX,
  deleteAccounts: Landmark,
  deleteTransactions: Receipt,
  deleteCategories: Tags,
};

export function SafetyLocksControl() {
  const { d, t } = useTranslation();
  const locks = usePebbleStore((s) => s.safetyLocks);
  const setSafetyLock = usePebbleStore((s) => s.setSafetyLock);

  const baseId = useId();
  const onCount = SAFETY_LOCK_KEYS.filter((key) => isLocked(locks, key)).length;

  return (
    <div id={SETTING_TARGETS.locks} className="card pb-settings-card pb-settings-target">
      <SectionHeader
        icon={Lock} title={d.safetyLocks.title} subtitle={d.safetyLocks.blurb}
        actions={(
          <span className="pb-settings-count pb-tnum">
            {t(d.ux.settings.locksOn, { count: onCount, total: SAFETY_LOCK_KEYS.length })}
          </span>
        )}
      />
      <div className="pb-settings-rows">
        {SAFETY_LOCK_KEYS.map((key) => (
          <SettingsRow key={key} icon={LOCK_ICONS[key]} title={d.safetyLocks[key]} titleId={`${baseId}-${key}`} layout="side">
            <Switch
              checked={isLocked(locks, key)} onChange={(value) => setSafetyLock(key, value)}
              labelledBy={`${baseId}-${key}`} className="pb-settings-switch"
            />
          </SettingsRow>
        ))}
      </div>
    </div>
  );
}
