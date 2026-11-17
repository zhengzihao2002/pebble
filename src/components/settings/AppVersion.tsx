import release from '@/lib/releaseSnapshot.json';
import type { Locale } from '@/lib/i18n/locale';

/** The version travels with the app, including source-only local downloads. */
export function AppVersion({ locale }: { locale: Locale }) {
  return <footer className="pb-settings-version" aria-label={locale === 'zh' ? '应用版本' : 'App version'}>
    <span className="pb-settings-version-brand">Pebble</span>
    <span>{locale === 'zh' ? '版本' : 'Version'} {release.version}</span>
  </footer>;
}
