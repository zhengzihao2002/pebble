'use client';

import { useId, type CSSProperties, type MouseEvent } from 'react';
import { RotateCcw } from 'lucide-react';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { AMBIENT_MAX_BALLS, AMBIENT_ROUTES, type AmbientRoute } from '@/lib/ambientSettings';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { usePebbleStore } from '@/store/usePebbleStore';
import { AmbientRoutePreview } from './AmbientRoutePreview';
import { SETTING_TARGETS } from './settingsTargets';

export const AMBIENT_THEME_COLOURS = [
  'var(--pine)',
  'color-mix(in oklch, var(--pine) 68%, var(--gold))',
  'color-mix(in oklch, var(--pine) 84%, var(--gold))',
] as const;

const routePaths: Record<AmbientRoute, string> = {
  default: 'M4 24C14 2 21 4 30 18S46 30 60 8M6 9C18 29 43 0 57 24',
  orbit: 'M55 16C55 31 9 31 9 16S55 1 55 16Z',
  weave: 'M32 16C6-8 2 39 32 16S62-8 62 16S48 40 32 16Z',
  sweep: 'M7 27L57 5M7 5L57 27',
};
const countOptions = Array.from({ length: AMBIENT_MAX_BALLS }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

function themePickerValue(event: MouseEvent<HTMLInputElement>, custom: string | null) {
  if (custom) return;
  const swatch = event.currentTarget.parentElement;
  if (!swatch) return;
  // Resolve the actual current palette at the user gesture, so a Theme swatch
  // opens the native picker at its visible colour rather than a stale default.
  const canvas = document.createElement('canvas');
  canvas.width = 1; canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  ctx.fillStyle = getComputedStyle(swatch).backgroundColor;
  ctx.fillRect(0, 0, 1, 1);
  const pixels = ctx.getImageData(0, 0, 1, 1).data;
  event.currentTarget.value = `#${[pixels[0], pixels[1], pixels[2]].map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

export function AmbientBackgroundStudio() {
  const { d, locale } = useTranslation();
  const copy = d.ambientBackground;
  const settings = usePebbleStore(s => s.ambientSettings);
  const setSettings = usePebbleStore(s => s.setAmbientSettings);
  const reset = usePebbleStore(s => s.resetAmbientSettings);
  const id = useId();
  const ballLabel = (index: number) => copy.ballLabel.replace('{number}', String(index + 1));
  const colourLabel = (index: number) => copy.ballColour.replace('{number}', String(index + 1));
  const isDefault = settings.route === 'default' && settings.speed === 1 && settings.frost === 50
    && settings.count === 3 && settings.colours.every(colour => colour === null);
  const colourFor = (index: number, colour: string | null) => colour ?? AMBIENT_THEME_COLOURS[index % AMBIENT_THEME_COLOURS.length];

  return <div className="pb-ambient-studio">
    <fieldset id={SETTING_TARGETS.ambientRoute} className="pb-ambient-routes pb-settings-target">
      <legend>{copy.routesTitle}</legend>
      <div className="pb-ambient-route-choices">
        {AMBIENT_ROUTES.map(route => <label key={route} className={`pb-ambient-route-choice${settings.route === route ? ' is-selected' : ''}`}>
          <input type="radio" name={`${id}-route`} value={route} checked={settings.route === route} onChange={() => setSettings({ route })} />
          <svg viewBox="0 0 64 32" aria-hidden="true"><path d={routePaths[route]} /></svg>
          <span>{copy.routes[route]}</span>
          <small>{copy.routeHints[route]}</small>
        </label>)}
      </div>
    </fieldset>
    <div className="pb-ambient-studio-body">
      <AmbientRoutePreview />
      <div className="pb-ambient-controls">
        <div className="pb-ambient-sliders">
          <div id={SETTING_TARGETS.ambientSpeed} className="pb-ambient-control pb-settings-target">
            <div className="pb-ambient-control-title"><label htmlFor={`${id}-speed`}>{copy.speedTitle}</label><output htmlFor={`${id}-speed`}>{settings.speed.toLocaleString(locale)}×</output></div>
            <input id={`${id}-speed`} type="range" min="0.25" max="3" step="0.25" value={settings.speed} onChange={event => setSettings({ speed: Number(event.target.value) })} className="pb-settings-range" />
            <div className="pb-ambient-control-scale"><span>{copy.speedSlow}</span><span>{copy.speedFast}</span></div>
          </div>
          <div id={SETTING_TARGETS.ambientFrost} className="pb-ambient-control pb-settings-target">
            <div className="pb-ambient-control-title"><label htmlFor={`${id}-frost`}>{copy.frostTitle}</label><output htmlFor={`${id}-frost`}>{settings.frost}%</output></div>
            <input id={`${id}-frost`} type="range" min="0" max="100" step="5" value={settings.frost} onChange={event => setSettings({ frost: Number(event.target.value) })} className="pb-settings-range" />
            <div className="pb-ambient-control-scale"><span>{copy.frostClear}</span><span>{copy.frostSoft}</span></div>
          </div>
        </div>
        <div id={SETTING_TARGETS.ambientCount} className="pb-ambient-control pb-settings-target">
          <span className="pb-ambient-control-label">{copy.countTitle}</span>
          <SegmentedControl options={countOptions} value={String(settings.count)} onChange={value => setSettings({ count: Number(value) })} ariaLabel={copy.countTitle} size="sm" fullWidth className="pb-ambient-count" />
        </div>
        <div id={SETTING_TARGETS.ambientColours} className="pb-ambient-control pb-settings-target">
          <span className="pb-ambient-control-label">{copy.coloursTitle}</span>
          <div className="pb-ambient-colours">
            {settings.colours.slice(0, settings.count).map((colour, index) => <div key={index} className="pb-ambient-colour">
              <span>{ballLabel(index)}</span>
              <div>
                <label className="pb-ambient-colour-swatch" style={{ backgroundColor: colourFor(index, colour) } as CSSProperties}>
                  <input type="color" aria-label={colourLabel(index)} value={colour ?? '#1f5a45'} onClick={event => themePickerValue(event, colour)} onChange={event => {
                    const colours = [...settings.colours]; colours[index] = event.target.value; setSettings({ colours });
                  }} />
                </label>
                <button type="button" className="pb-ambient-theme-colour" aria-label={`${copy.themeColour} · ${ballLabel(index)}`} disabled={colour === null} onClick={() => {
                  const colours = [...settings.colours]; colours[index] = null; setSettings({ colours });
                }}>{copy.themeColour}</button>
              </div>
            </div>)}
          </div>
          <p className="pb-ambient-colours-hint">{copy.coloursHint}</p>
        </div>
      </div>
    </div>
    <div className="pb-ambient-studio-foot"><button type="button" className="pill pb-settings-pill" disabled={isDefault} onClick={reset}><RotateCcw size={12} aria-hidden="true" />{copy.resetDefaults}</button></div>
  </div>;
}
