'use client';

import { useSyncExternalStore } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { onlineServerSnapshot, readOffline, subscribeConnectivity } from '@/lib/offline/connectivity';
import { quietSyncIsEnabled, subscribeQuietPreference } from '@/lib/offline/quietSync';

export function QuietSyncActionNote({ kind = 'sync' }: { kind?: 'sync' | 'connection' | 'undo' }) {
  const enabled = useSyncExternalStore(subscribeQuietPreference, quietSyncIsEnabled, onlineServerSnapshot);
  const offline = useSyncExternalStore(subscribeConnectivity, readOffline, onlineServerSnapshot);
  const { d } = useTranslation();
  if (!enabled) return null;

  const notes = d.ux.offline.quietSync.actionNote;
  return <small className="pb-quiet-action-note">{offline ? notes.offline : notes[kind]}</small>;
}
