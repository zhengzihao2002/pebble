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

// Each option previews itself: its button text renders in the family that
// option applies. Mirrors the rules in globals.css - keep the two in step.
const PREVIEW_FAMILY: Record<FontChoice, string> = {
  default: 'var(--font-work-sans), var(--cjk), sans-serif',
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, var(--cjk), sans-serif",
  rounded: 'var(--font-nunito), var(--cjk), sans-serif',
  serif: 'var(--font-source-serif), var(--cjk), serif',
  legible: 'var(--font-atkinson), var(--cjk), sans-serif',
};

// Explicit stacks, NOT var(--cjk): --cjk is the CURRENT choice, so using it
// would preview every option in whichever face is already selected.
const CJK_SANS = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC"';
const CJK_PREVIEW_FAMILY: Record<CjkFontChoice, string> = {
  sans: `${CJK_SANS}, sans-serif`,
  serif: `"Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", "Source Han Serif SC", var(--font-noto-serif-sc), ${CJK_SANS}, serif`,
  kai: `"Kaiti SC", "STKaiti", "KaiTi", ${CJK_SANS}, sans-serif`,
};

export function FontControl({ fontChoice, onChange, cjkFontChoice, onCjkChange }: FontControlProps) {
  const { d, locale } = useTranslation();
  // Only the picker for the CURRENT interface language is shown. Both choices
  // stay saved and both always apply, each to its own characters.
  const isChinese = locale === 'zh';
  // A stored value from another build shows as the default - which is exactly
  // what AppShell applies for it.
  const current: FontChoice = isFontChoice(fontChoice) ? fontChoice : 'default';
  const currentCjk: CjkFontChoice = isCjkFontChoice(cjkFontChoice) ? cjkFontChoice : 'sans';

  return (
    <SettingsRow icon={CaseSensitive} title={d.font.title} hint={d.font.blurb} layout="stack">
      <div role="group" aria-label={d.font.title} className="pb-settings-presets is-wrap">
        {/* The arrays hold VALUES; the dictionary is indexed by them. */}
        {isChinese
          ? CJK_FONT_CHOICES.map((choice) => (
              <button
                key={choice}
                onClick={() => onCjkChange(choice)}
                type="button"
                className={`pb-settings-preset${currentCjk === choice ? ' is-active' : ''}`}
                aria-pressed={currentCjk === choice}
                style={{ fontFamily: CJK_PREVIEW_FAMILY[choice] }}
              >
                {d.font.cjk[choice]}
              </button>
            ))
          : FONT_CHOICES.map((choice) => (
              <button
                key={choice}
                onClick={() => onChange(choice)}
                type="button"
                className={`pb-settings-preset${current === choice ? ' is-active' : ''}`}
                aria-pressed={current === choice}
                style={{ fontFamily: PREVIEW_FAMILY[choice] }}
              >
                {d.font[choice]}
              </button>
            ))}
      </div>
    </SettingsRow>
  );
}
