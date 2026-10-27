'use client';

import { useId } from 'react';
import { CaseSensitive } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SettingsRow } from './SettingsRow';
import {
  CJK_FONT_CHOICES, FONT_CHOICES, isCjkFontChoice, isFontChoice,
  type CjkFontChoice, type FontChoice,
} from '@/lib/fontChoice';

interface FontControlProps {
  fontChoice: FontChoice;
  onChange: (value: FontChoice) => void;
  cjkFontChoice: CjkFontChoice;
  onCjkChange: (value: CjkFontChoice) => void;
}

const LABEL_FAMILY = `var(--font-work-sans), "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
const FONT_LABELS: Record<FontChoice, string> = { default: 'Default', system: 'System', rounded: 'Rounded', serif: 'Serif', legible: 'High legibility' };
const CJK_LABELS: Record<CjkFontChoice, string> = { sans: '黑体', serif: '宋体', kai: '楷体' };

const LATIN_FAMILIES: Record<FontChoice, string> = {
  default: 'var(--font-work-sans)', system: 'system-ui, -apple-system, sans-serif',
  rounded: 'var(--font-nunito)', serif: 'var(--font-source-serif)', legible: 'var(--font-atkinson)',
};
const CJK_SANS = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
const CJK_FAMILIES: Record<CjkFontChoice, string> = {
  sans: CJK_SANS,
  serif: `"Songti SC", "STSong", "SimSun", var(--font-noto-serif-sc), ${CJK_SANS}`,
  kai: `"Kaiti SC", "STKaiti", "KaiTi", ${CJK_SANS}`,
};

export function FontControl({ fontChoice, onChange, cjkFontChoice, onCjkChange }: FontControlProps) {
  const { d } = useTranslation();
  const latinId = useId();
  const cjkId = useId();
  // Both choices apply to mixed-language text, regardless of interface locale.
  // A stored value from another build shows as the default - which is exactly
  // what AppShell applies for it.
  const current: FontChoice = isFontChoice(fontChoice) ? fontChoice : 'default';
  const currentCjk: CjkFontChoice = isCjkFontChoice(cjkFontChoice) ? cjkFontChoice : 'sans';

  return (
    <SettingsRow icon={CaseSensitive} title={d.font.title} hint={d.font.blurb} layout="stack">
      <div className="pb-settings-font-layout">
      <div className="pb-settings-font-controls">
        <div role="group" aria-label={d.font.latinTitle} className="pb-settings-font-group">
          <p className="pb-settings-row-title">{d.font.latinTitle}</p>
          <select className="pb-settings-font-mobile pb-settings-select" id={latinId} aria-label={d.font.latinTitle} value={current} onChange={(e) => { if (isFontChoice(e.target.value)) onChange(e.target.value); }} style={{ fontFamily: LABEL_FAMILY }}>
            {FONT_CHOICES.map((choice) => <option key={choice} value={choice}>{FONT_LABELS[choice]}</option>)}
          </select>
          <div className="pb-settings-presets is-wrap pb-settings-font-desktop">
            {FONT_CHOICES.map((choice) => (
              <button
                key={choice} type="button" onClick={() => onChange(choice)}
                className={`pb-settings-preset${current === choice ? ' is-active' : ''}`}
                aria-pressed={current === choice}
                style={{ fontFamily: `${LATIN_FAMILIES[choice]}, ${CJK_SANS}` }}
              >
                {FONT_LABELS[choice]}
              </button>
            ))}
          </div>
        </div>
        <div role="group" aria-label={d.font.cjkTitle} className="pb-settings-font-group">
          <p className="pb-settings-row-title">{d.font.cjkTitle}</p>
          <select className="pb-settings-font-mobile pb-settings-select" id={cjkId} aria-label={d.font.cjkTitle} value={currentCjk} onChange={(e) => { if (isCjkFontChoice(e.target.value)) onCjkChange(e.target.value); }} style={{ fontFamily: LABEL_FAMILY }}>
            {CJK_FONT_CHOICES.map((choice) => <option key={choice} value={choice}>{CJK_LABELS[choice]}</option>)}
          </select>
          <div className="pb-settings-presets is-wrap pb-settings-font-desktop">
            {CJK_FONT_CHOICES.map((choice) => (
              <button
                key={choice} type="button" onClick={() => onCjkChange(choice)}
                className={`pb-settings-preset${currentCjk === choice ? ' is-active' : ''}`}
                aria-pressed={currentCjk === choice}
                style={{ fontFamily: CJK_FAMILIES[choice] }}
              >
                {CJK_LABELS[choice]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <aside className="pb-settings-font-preview" aria-label={d.font.preview}>
        <span className="pb-settings-font-preview-label" style={{ fontFamily: LABEL_FAMILY }}>{d.font.preview}</span>
        <div className="pb-settings-font-specimen" style={{ fontFamily: `${LATIN_FAMILIES[current]}, ${CJK_FAMILIES[currentCjk]}` }}>
          <p>Hello, Pebble.</p>
          <p className="pb-settings-font-digits">0123456789</p>
          <p>你好，生活。</p>
        </div>
      </aside>
      </div>
    </SettingsRow>
  );
}
