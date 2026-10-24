'use client';

import { useEffect, useState } from 'react';
import { BadgeDollarSign, CircleAlert, MousePointerClick, Receipt, Trophy, Volume2, type LucideIcon } from 'lucide-react';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { SettingsRow } from './SettingsRow';
import { usePebbleStore } from '@/store/usePebbleStore';
import { SOUND_EVENTS, emptySoundPrefs, type SoundEvent } from '@/lib/sound/events';
import { SOUND_FILES } from '@/lib/sound/manifest';
import { playSound } from '@/lib/sound/play';
import { useTranslation } from '@/lib/i18n/useTranslation';

// One mark per event, so the list scans by shape as well as by name.
const EVENT_ICONS: Record<SoundEvent, LucideIcon> = {
  expenseSaved: Receipt,
  incomeSaved: BadgeDollarSign,
  saveFailed: CircleAlert,
  click: MousePointerClick,
  goalReached: Trophy,
};

export function SoundSettingsCard() {
  const { d, t } = useTranslation();
  const soundPrefs = usePebbleStore((s) => s.soundPrefs);
  const setSoundPref = usePebbleStore((s) => s.setSoundPref);

  // persist rehydrates AFTER mount, so reading soundPrefs during the first
  // render would give all-null on the server and the stored values on the
  // client - a hydration mismatch. Render the defaults until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const prefs = mounted ? soundPrefs : emptySoundPrefs();

  const hasFiles = SOUND_FILES.length > 0;

  return (
    <div className="card pb-settings-card">
      {/* An h3 like every other card title: the section above is the h2.
          It used to be a second h2 in display type. */}
      <SectionHeader icon={Volume2} title={d.sounds.title} subtitle={d.sounds.blurb} />

      {!hasFiles && (
        <p className="pb-settings-note">
          {/* The path and the command are rendered as elements and are
              never translated, so the sentence is split on its placeholders
              and each language positions them itself. */}
          {d.sounds.noFiles
            .split(/(\{path\}|\{command\})/g)
            .map((part, i) =>
              part === '{path}'
                ? <span key={i} className="font-code">public/sounds</span>
                : part === '{command}'
                  ? <span key={i} className="font-code">npm run sounds</span>
                  : <span key={i}>{part}</span>,
            )}
        </p>
      )}

      <div className="pb-settings-rows">
        {SOUND_EVENTS.map((event) => {
          const current = prefs[event.key as SoundEvent] ?? '';
          return (
            <SettingsRow
              key={event.key}
              icon={EVENT_ICONS[event.key as SoundEvent] ?? Volume2}
              title={d.sounds.events[event.key]}
              hint={d.sounds.hints[event.key]}
              labelFor={`sound-${event.key}`}
            >
              <div className="pb-settings-sound">
                <select
                  id={`sound-${event.key}`}
                  value={current}
                  disabled={!hasFiles}
                  onChange={(e) => setSoundPref(event.key as SoundEvent, e.target.value || null)}
                  className="pb-settings-select"
                >
                  {/* value="" is the stored "silent" state - null in the
                      store. Only the text is translated. */}
                  <option value="">{d.sounds.noSound}</option>
                  {SOUND_FILES.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
                {/* Separate from the select rather than previewing on change:
                    arrowing through a native select fires change on some
                    platforms, which would play a sound per keystroke. This is
                    also the user gesture that satisfies autoplay policy. */}
                <button
                  type="button"
                  disabled={!current}
                  onClick={() => playSound(current)}
                  aria-label={t(d.sounds.preview, { event: d.sounds.events[event.key] })}
                  data-no-click-sound
                  className="icon-btn pb-settings-iconbtn"
                  style={{ opacity: current ? 1 : 0.35, cursor: current ? 'pointer' : 'not-allowed' }}
                >
                  <Volume2 size={15} />
                </button>
              </div>
            </SettingsRow>
          );
        })}
      </div>
    </div>
  );
}
