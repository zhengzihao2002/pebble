'use client';

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

export function FontControl({ fontChoice, onChange, cjkFontChoice, onCjkChange }: FontControlProps) {
  const { d } = useTranslation();
  // Both choices apply to mixed-language text, regardless of interface locale.
  // A stored value from another build shows as the default - which is exactly
  // what AppShell applies for it.
  const current: FontChoice = isFontChoice(fontChoice) ? fontChoice : 'default';
  const currentCjk: CjkFontChoice = isCjkFontChoice(cjkFontChoice) ? cjkFontChoice : 'sans';

  return (
    <SettingsRow icon={CaseSensitive} title={d.font.title} hint={d.font.blurb} layout="stack">
      <div className="pb-settings-font-controls">
        <div role="group" aria-label={d.font.latinTitle} className="pb-settings-font-group">
          <p className="pb-settings-row-title">{d.font.latinTitle}</p>
          <div className="pb-settings-presets is-wrap">
            {FONT_CHOICES.map((choice) => (
              <button
                key={choice} type="button" onClick={() => onChange(choice)}
                className={`pb-settings-preset${current === choice ? ' is-active' : ''}`}
                aria-pressed={current === choice}
                style={{ fontFamily: LABEL_FAMILY }}
              >
                {FONT_LABELS[choice]}
              </button>
            ))}
          </div>
        </div>
        <div role="group" aria-label={d.font.cjkTitle} className="pb-settings-font-group">
          <p className="pb-settings-row-title">{d.font.cjkTitle}</p>
          <div className="pb-settings-presets is-wrap">
            {CJK_FONT_CHOICES.map((choice) => (
              <button
                key={choice} type="button" onClick={() => onCjkChange(choice)}
                className={`pb-settings-preset${currentCjk === choice ? ' is-active' : ''}`}
                aria-pressed={currentCjk === choice}
                style={{ fontFamily: LABEL_FAMILY }}
              >
                {CJK_LABELS[choice]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </SettingsRow>
  );
}
