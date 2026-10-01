#!/usr/bin/env node
/**
 * Pebble colour themes - the ONE source for every palette.
 *
 *   npm run themes              validate, then rewrite the generated block in globals.css
 *   npm run themes -- --check   validate, and confirm globals.css and the hand-kept
 *                               mirrors match this table (writes nothing)
 *   npm run themes -- --print   validate, print the block to stdout (writes nothing)
 *
 * Any failed rule aborts before anything is written. Existing token values are
 * reproduced exactly; --ink-faint, --pine-strong, --backdrop and --shadow-float
 * are DERIVED here, so they meet their contrast floors in every palette.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_PATH = path.join(ROOT, 'src/app/globals.css');
const THEME_TILES_PATH = path.join(ROOT, 'src/components/settings/ThemeControl.tsx');
const APPEARANCE_PATH = path.join(ROOT, 'src/components/settings/AppearanceControl.tsx');
const START = '/* @generated-themes:start';
const END = '/* @generated-themes:end */';

const DARK_SHADOW = '0 1px 2px rgba(0,0,0,0.35), 0 10px 28px -14px rgba(0,0,0,0.6)';
const lightShadow = (rgb) => `0 1px 2px rgba(${rgb},0.04), 0 10px 28px -14px rgba(${rgb},0.18)`;

// Key order is the order tokens are written. shadowRgb reproduces today's
// light shadows exactly (Original's is 23,36,32 - one off its ink, kept as is).
const THEMES = {
  original: {
    light: { paper: '#F1F3EE', mist: '#FFFFFF', ink: '#17241F', inkSoft: '#5B6660', pine: '#1F5A45', pineSoft: '#E3EDE8', gold: '#AD7B2E', goldSoft: '#F4E8D4', wine: '#8C3D42', wineSoft: '#F3E2E2', line: '#E1E4DD', shadowRgb: '23,36,32', overlay: 'rgba(241, 243, 238, 0.6)' },
    dark: { paper: '#121C18', mist: '#1A2621', ink: '#ECEFEA', inkSoft: '#8FA097', pine: '#57A487', pineSoft: '#1E362C', gold: '#DFA657', goldSoft: '#382C1A', wine: '#D48A8F', wineSoft: '#3A2426', line: '#2A3830', overlay: 'rgba(18, 28, 24, 0.6)' },
  },
  ocean: {
    light: { paper: '#EEF3F6', mist: '#FFFFFF', ink: '#142230', inkSoft: '#56687A', pine: '#1E5F8C', pineSoft: '#E0ECF5', gold: '#B7792B', goldSoft: '#F5E7D2', wine: '#A33D48', wineSoft: '#F6E1E3', line: '#DCE4EA', shadowRgb: '20,34,48', overlay: 'rgba(238, 243, 246, 0.6)' },
    dark: { paper: '#0F1A22', mist: '#16242F', ink: '#E8EEF2', inkSoft: '#8DA0AF', pine: '#5FA8D8', pineSoft: '#16303F', gold: '#E0A85A', goldSoft: '#372A18', wine: '#E0898F', wineSoft: '#3B2226', line: '#253643', overlay: 'rgba(15, 26, 34, 0.6)' },
  },
  sakura: {
    light: { paper: '#F9F1F3', mist: '#FFFFFF', ink: '#2B1B21', inkSoft: '#735C65', pine: '#2F6B5E', pineSoft: '#E1EEEA', gold: '#B8577A', goldSoft: '#F6E0E8', wine: '#9C3B30', wineSoft: '#F5E1DD', line: '#EEDFE3', shadowRgb: '43,27,33', overlay: 'rgba(249, 241, 243, 0.6)' },
    dark: { paper: '#1C1418', mist: '#261B20', ink: '#F2E8EB', inkSoft: '#A8939B', pine: '#66B3A1', pineSoft: '#1F332E', gold: '#E68AAB', goldSoft: '#3A2229', wine: '#E08C7F', wineSoft: '#3B231F', line: '#3A2A30', overlay: 'rgba(28, 20, 24, 0.6)' },
  },
  slate: {
    light: { paper: '#F2F3F5', mist: '#FFFFFF', ink: '#16191F', inkSoft: '#5D6470', pine: '#3D56A6', pineSoft: '#E3E8F5', gold: '#A9853A', goldSoft: '#F3EAD6', wine: '#A63F3F', wineSoft: '#F5E2E2', line: '#E0E3E8', shadowRgb: '22,25,31', overlay: 'rgba(242, 243, 245, 0.6)' },
    dark: { paper: '#111317', mist: '#1A1D23', ink: '#ECEEF2', inkSoft: '#9097A3', pine: '#8EA4E8', pineSoft: '#1F2640', gold: '#D9B066', goldSoft: '#332B1B', wine: '#E48C8C', wineSoft: '#3A2123', line: '#2A2E36', overlay: 'rgba(17, 19, 23, 0.6)' },
  },
  sand: {
    light: { paper: '#F5F0E6', mist: '#FFFDF8', ink: '#2A2217', inkSoft: '#6F6454', pine: '#4F6B34', pineSoft: '#E6EDDC', gold: '#B7862C', goldSoft: '#F4E8CF', wine: '#9E3B34', wineSoft: '#F4E0DC', line: '#E6DDCB', shadowRgb: '42,34,23', overlay: 'rgba(245, 240, 230, 0.6)' },
    dark: { paper: '#1A1611', mist: '#241E17', ink: '#F1EADF', inkSoft: '#A89C8A', pine: '#93B06E', pineSoft: '#26301B', gold: '#E0B25C', goldSoft: '#3A2E17', wine: '#DE8A80', wineSoft: '#3B2320', line: '#3A3226', overlay: 'rgba(26, 22, 17, 0.6)' },
  },
};

const TOKENS = ['paper', 'mist', 'ink', 'inkSoft', 'pine', 'pineSoft', 'gold', 'goldSoft', 'wine', 'wineSoft', 'line'];
const cssName = (k) => '--' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

// ---- colour maths -----------------------------------------------------------
const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hexOf = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => { const [r, g, b] = rgbOf(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, t) => { const [p, q] = [rgbOf(a), rgbOf(b)]; return hexOf(p.map((v, i) => v + (q[i] - v) * t)); };
function oklchHue(hex) {
  const [r, g, b] = rgbOf(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
}
const hueGap = (a, b) => { const d = Math.abs(oklchHue(a) - oklchHue(b)) % 360; return d > 180 ? 360 - d : d; };

// ---- derived tokens ---------------------------------------------------------
function derive(p, mode) {
  // Faintest ink/paper mix that still reaches 3:1 on both surfaces
  // (WCAG 1.4.11 non-text contrast): placeholders, axis labels, chevrons.
  let inkFaint = p.ink;
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const c = mix(p.ink, p.paper, t);
    if (contrast(c, p.paper) >= 3.05 && contrast(c, p.mist) >= 3.05) inkFaint = c; else break;
  }
  const pineStrong = mix(p.pine, p.ink, 0.16);
  const inkRgb = rgbOf(p.ink).join(', ');
  return {
    inkFaint,
    pineStrong,
    backdrop: mode === 'light' ? `rgba(${inkRgb}, 0.28)` : 'rgba(0, 0, 0, 0.5)',
    shadow: mode === 'light' ? lightShadow(p.shadowRgb) : DARK_SHADOW,
    shadowFloat: mode === 'light'
      ? `0 2px 6px rgba(${p.shadowRgb},0.06), 0 28px 64px -24px rgba(${p.shadowRgb},0.38)`
      : '0 2px 6px rgba(0,0,0,0.4), 0 28px 64px -24px rgba(0,0,0,0.75)',
  };
}

// ---- rules ------------------------------------------------------------------
function validate() {
  const failures = [];
  for (const [theme, modes] of Object.entries(THEMES)) {
    for (const mode of ['light', 'dark']) {
      const p = modes[mode];
      const where = `${theme}/${mode}`;
      for (const k of TOKENS) if (!/^#[0-9A-F]{6}$/.test(p[k] ?? '')) failures.push(`${where}: ${k} must be #RRGGBB uppercase, got ${p[k]}`);
      if (failures.length) continue;
      const d = derive(p, mode);
      const pairs = [
        ['ink on paper', p.ink, p.paper, 4.5], ['ink on mist', p.ink, p.mist, 4.5],
        ['ink-soft on paper', p.inkSoft, p.paper, 4.5], ['ink-soft on mist', p.inkSoft, p.mist, 4.5],
        ['pine on mist', p.pine, p.mist, 4.5], ['wine on mist', p.wine, p.mist, 4.5],
        ['paper on pine', p.paper, p.pine, 4.5], ['paper on pine-strong', p.paper, d.pineStrong, 4.5],
        ['wine on wine-soft', p.wine, p.wineSoft, 4.5],
        // The Expense side of the Expense / Income switch.
        ['paper on wine', p.paper, p.wine, 4.5],
        ['gold on mist', p.gold, p.mist, 3],
        ['ink-faint on paper', d.inkFaint, p.paper, 3], ['ink-faint on mist', d.inkFaint, p.mist, 3],
      ];
      for (const [label, fg, bg, min] of pairs) {
        const r = contrast(fg, bg);
        if (r < min) failures.push(`${where}: ${label} is ${r.toFixed(2)}:1, needs ${min}:1`);
      }
      if (contrast(p.paper, d.pineStrong) < contrast(p.paper, p.pine)) failures.push(`${where}: pine-strong must contrast more with paper than pine does`);
      const wh = oklchHue(p.wine), ph = oklchHue(p.pine);
      if (!(wh <= 50 || wh >= 340)) failures.push(`${where}: wine hue ${wh.toFixed(0)} is not red-family`);
      if (ph <= 75 || ph >= 330) failures.push(`${where}: pine hue ${ph.toFixed(0)} reads red, orange or pink`);
      if (hueGap(p.gold, p.wine) < 15) failures.push(`${where}: gold is within 15 degrees of wine's hue`);
    }
  }
  return failures;
}

// ---- output -----------------------------------------------------------------
function declarations(p, mode) {
  const d = derive(p, mode);
  return [
    '  ' + TOKENS.map((k) => `${cssName(k)}: ${p[k]};`).join(' '),
    `  --ink-faint: ${d.inkFaint}; --pine-strong: ${d.pineStrong}; --backdrop: ${d.backdrop};`,
    `  --shadow: ${d.shadow};`,
    `  --shadow-float: ${d.shadowFloat};`,
    `  --overlay-tint: ${p.overlay};`,
  ].join('\n');
}

function block() {
  const o = THEMES.original, od = derive(o.light, 'light');
  const out = [
    `${START}`,
    '   Written by scripts/generate-themes.mjs from its THEMES table. Do not edit',
    '   by hand: change the table and run npm run themes. The script refuses to',
    '   write if a contrast or colour-meaning rule fails: money out (wine) stays',
    '   red-family, money in (pine) is never red, orange or pink, and the accent',
    '   (gold) never reads as wine. Absent data-pebble-theme means Original. The',
    '   html background lines repeat each paper colour for the pre-React frame. */',
    ...[['ink-faint', od.inkFaint], ['pine-strong', od.pineStrong], ['backdrop', od.backdrop]].map(
      ([n, v]) => `@property --${n} { syntax: '<color>'; inherits: true; initial-value: ${v}; }`),
    '.pebble-root {', declarations(o.light, 'light'), '}',
    '.pebble-root.dark,', '.pebble-dark .pebble-root {', declarations(o.dark, 'dark'), '}',
  ];
  for (const [name, t] of Object.entries(THEMES)) {
    if (name === 'original') continue;
    out.push(
      `html[data-pebble-theme="${name}"] { background-color: ${t.light.paper}; }`,
      `html.pebble-dark[data-pebble-theme="${name}"] { background-color: ${t.dark.paper}; }`,
      `html[data-pebble-theme="${name}"] .pebble-root {`, declarations(t.light, 'light'), '}',
      `html.pebble-dark[data-pebble-theme="${name}"] .pebble-root,`,
      `html[data-pebble-theme="${name}"] .pebble-root.dark {`, declarations(t.dark, 'dark'), '}',
    );
  }
  out.push(END);
  return out.join('\n');
}

// Values that must stay equal to the table but live outside the generated block.
function mirrorProblems(css) {
  const probs = [];
  const o = THEMES.original;
  if (!css.includes(`html { background-color: ${o.light.paper}; }`)) probs.push('globals.css: html background line does not match Original light paper');
  if (!css.includes(`html.pebble-dark { background-color: ${o.dark.paper}; }`)) probs.push('globals.css: html.pebble-dark background line does not match Original dark paper');
  for (const k of TOKENS) {
    const m = css.match(new RegExp(`@property ${cssName(k)} \\{[^}]*initial-value:\\s*([^;]+);`));
    if (!m) probs.push(`globals.css: no @property registration for ${cssName(k)}`);
    else if (m[1].trim() !== o.light[k]) probs.push(`globals.css: @property ${cssName(k)} initial-value ${m[1].trim()} != ${o.light[k]}`);
  }
  if (existsSync(THEME_TILES_PATH)) {
    const src = readFileSync(THEME_TILES_PATH, 'utf8');
    for (const [name, t] of Object.entries(THEMES)) {
      const m = src.match(new RegExp(`${name}: \\{ paper: '(#\\w{6})', mist: '(#\\w{6})', pine: '(#\\w{6})', gold: '(#\\w{6})', wine: '(#\\w{6})' \\}`));
      const want = [t.light.paper, t.light.mist, t.light.pine, t.light.gold, t.light.wine];
      if (!m) probs.push(`ThemeControl.tsx: preview tile for ${name} not found in the expected shape`);
      else if (m.slice(1).join() !== want.join()) probs.push(`ThemeControl.tsx: ${name} tile ${m.slice(1).join(' ')} != ${want.join(' ')}`);
    }
  } else probs.push('ThemeControl.tsx not found');
  if (existsSync(APPEARANCE_PATH)) {
    const src = readFileSync(APPEARANCE_PATH, 'utf8');
    for (const [label, p] of [['LIGHT', o.light], ['DARK', o.dark]]) {
      const m = src.match(new RegExp(`const ${label} = \\{ bg: '(#\\w{6})', card: '(#\\w{6})', bar: '(#\\w{6})' \\}`));
      if (!m) { if (label === 'LIGHT') probs.push('AppearanceControl.tsx: LIGHT tile not found in the expected shape'); continue; }
      const want = [p.paper, p.mist, p.pine];
      if (m.slice(1).join() !== want.join()) probs.push(`AppearanceControl.tsx: ${label} ${m.slice(1).join(' ')} != ${want.join(' ')}`);
    }
  }
  return probs;
}

// ---- main -------------------------------------------------------------------
const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--print') ? 'print' : 'write';
const failures = validate();
if (failures.length) {
  console.error('ABORT - theme rules failed, nothing written:\n  ' + failures.join('\n  '));
  process.exit(1);
}
const generated = block();
if (mode === 'print') { process.stdout.write(generated + '\n'); process.exit(0); }

const css = readFileSync(CSS_PATH, 'utf8');
const s = css.indexOf(START), e = css.indexOf(END);
const once = (str) => css.split(str).length === 2;
if (s < 0 || e < s || !once(START) || !once(END)) {
  console.error('ABORT - globals.css must contain exactly one generated-themes start and end marker, in order.');
  process.exit(1);
}
const current = css.slice(s, e + END.length);

if (mode === 'check') {
  const probs = mirrorProblems(css);
  if (current !== generated) probs.unshift('globals.css: generated block is out of date - run npm run themes');
  if (probs.length) { console.error('CHECK FAILED:\n  ' + probs.join('\n  ')); process.exit(1); }
  console.log('Themes OK: 10 palettes pass every rule; globals.css and all mirrors match the table.');
  process.exit(0);
}

if (current === generated) console.log('Themes already up to date.');
else { writeFileSync(CSS_PATH, css.slice(0, s) + generated + css.slice(e + END.length)); console.log('Themes written to globals.css.'); }
const probs = mirrorProblems(readFileSync(CSS_PATH, 'utf8'));
if (probs.length) { console.error('WARNING - hand-kept mirrors differ from the table:\n  ' + probs.join('\n  ')); process.exit(1); }
