'use client';

import { usePebbleStore } from '@/store/usePebbleStore';
import { TextSizeControl } from '@/components/settings/TextSizeControl';
import { AppearanceControl } from '@/components/settings/AppearanceControl';
import { NotificationsCard } from '@/components/settings/NotificationsCard';
import { AccountCard } from '@/components/settings/AccountCard';

export default function SettingsPage() {
  const textSize = usePebbleStore((s) => s.textSize);
  const setTextSize = usePebbleStore((s) => s.setTextSize);
  const darkMode = usePebbleStore((s) => s.darkMode);
  const setDarkMode = usePebbleStore((s) => s.setDarkMode);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 560 }}>
      <TextSizeControl textSize={textSize} onChange={setTextSize} />
      <AppearanceControl darkMode={darkMode} onChange={setDarkMode} />
      <NotificationsCard />
      <AccountCard />
    </div>
  );
}
