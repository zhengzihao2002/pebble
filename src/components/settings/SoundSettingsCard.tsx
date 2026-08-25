'use client';

import { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { SOUND_EVENTS, emptySoundPrefs, type SoundEvent } from '@/lib/sound/events';
import { SOUND_FILES } from '@/lib/sound/manifest';
import { playSound } from '@/lib/sound/play';

export function SoundSettingsCard() {
  const soundPrefs = usePebbleStore((s) => s.soundPrefs);
  const setSoundPref = usePebbleStore((s) => s.setSoundPref);

  // persist rehydrates AFTER mount, so reading soundPrefs during the first
  // render would give all-null on the server and the stored values on the
  // client - a hydration mismatch. Render the defaults until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const prefs = mounted ? soundPrefs : emptySoundPrefs();

  const hasFiles = SOUND_FILES.length > 0;

  const selectStyle: React.CSSProperties = {
    padding: '0.5rem 0.6rem', borderRadius: '0.6rem', border: '1px solid var(--line)',
    fontSize: '0.85rem', color: 'var(--ink)', backgroundColor: 'var(--paper)',
    boxSizing: 'border-box', flex: 1, minWidth: 0,
    opacity: hasFiles ? 1 : 0.6,
  };

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h2 className="font-display" style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.35rem' }}>Sounds</h2>
      <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: '1.1rem' }}>
        Optional audio feedback. Everything is off until you choose a sound.
      </p>

      {!hasFiles && (
        <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: '1.1rem', padding: '0.7rem 0.8rem', backgroundColor: 'var(--mist)', borderRadius: '0.6rem' }}>
          No sound files found. Add audio to <span className="font-mono-tab">public/sounds</span> and run{' '}
          <span className="font-mono-tab">npm run sounds</span> — see the README in that folder.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {SOUND_EVENTS.map((event) => {
          const current = prefs[event.key as SoundEvent] ?? '';
          return (
            <div key={event.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label htmlFor={`sound-${event.key}`} style={{ fontSize: '0.82rem', fontWeight: 500 }}>
                {event.label}
              </label>
              <p style={{ fontSize: '0.73rem', color: 'var(--ink-soft)', lineHeight: 1.45, margin: 0 }}>
                {event.hint}
              </p>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.15rem' }}>
                <select
                  id={`sound-${event.key}`}
                  value={current}
                  disabled={!hasFiles}
                  onChange={(e) => setSoundPref(event.key as SoundEvent, e.target.value || null)}
                  style={selectStyle}
                >
                  <option value="">No sound</option>
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
                  className="icon-btn"
                  disabled={!current}
                  onClick={() => playSound(current)}
                  aria-label={`Preview ${event.label} sound`}
                  data-no-click-sound
                  style={{
                    width: 34, height: 34, borderRadius: '0.6rem', flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    opacity: current ? 1 : 0.35, cursor: current ? 'pointer' : 'not-allowed',
                  }}
                >
                  <Volume2 size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
