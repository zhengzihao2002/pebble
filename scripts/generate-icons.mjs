#!/usr/bin/env node
/**
 * Pebble's app icons, drawn from the ONE mark geometry in
 * src/components/brand/pebbleMark.ts.
 *
 *   npm run icons
 *
 * Writes:
 *   public/icons/apple-touch-icon.png   180  full bleed (iOS rounds it)
 *   public/icons/icon-512-maskable.png  512  full bleed, letter inside the safe circle
 *   public/icons/icon-192.png           192  macOS-style rounded tile with margin
 *   public/icons/icon-512.png           512  and shadow (manifest "any")
 *   public/icons/icon.svg                    vector favicon for modern browsers
 *   src/app/favicon.ico                      16 / 32 / 48, for everything else
 *
 * Rasterised with sharp, which ships with Next.js. Only needed when the mark
 * changes; the outputs are committed.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MARK_PATHS, MARK_SIZE, MARK_STROKE, BRAND_COLORS as C } from '../src/components/brand/pebbleMark.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = (p) => path.join(ROOT, p);

const defs = `<defs>
  <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${C.tileLight}"/><stop offset="0.5" stop-color="${C.tile}"/><stop offset="1" stop-color="${C.tileDeep}"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.28" cy="0.12" r="0.85">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.13"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.goldDeep}"/>
  </linearGradient>
  <filter id="drop" x="-20%" y="-20%" width="140%" height="150%">
    <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000000" flood-opacity="0.32"/>
  </filter>
</defs>`;

/** The letter, optionally scaled about the canvas centre. */
const glyph = (scale = 1) => {
  const t = scale === 1 ? '' : ` transform="translate(256 256) scale(${scale}) translate(-256 -256)"`;
  return `<g${t} fill="none" stroke-width="${MARK_STROKE}">
  <path d="${MARK_PATHS.ring}" stroke="${C.cream}"/>
  <path d="${MARK_PATHS.share}" stroke="url(#gold)"/>
  <path d="${MARK_PATHS.stem}" stroke="${C.cream}" stroke-linecap="round"/>
</g>`;
};

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_SIZE} ${MARK_SIZE}" width="${MARK_SIZE}" height="${MARK_SIZE}">
${defs}
${body}
</svg>
`;

// Full bleed: the platform applies its own mask (iOS squircle, Android
// circle). The letter sits well inside the maskable safe circle (radius 40%
// of the canvas).
const fullBleed = svg(`<rect width="512" height="512" fill="url(#tile)"/>
<rect width="512" height="512" fill="url(#glow)"/>
${glyph()}`);

// macOS app-icon grid: an 824/1024 tile, centred, with a soft drop shadow.
// The manifest "any" icons are shown unmasked on desktop, so the tile carries
// its own corners and margin to sit beside native apps in the Dock.
const inset = 50;
const tileSize = 512 - inset * 2;
const desktop = svg(`<g filter="url(#drop)">
  <rect x="${inset}" y="${inset - 4}" width="${tileSize}" height="${tileSize}" rx="${tileSize * 0.225}" fill="url(#tile)"/>
</g>
<rect x="${inset}" y="${inset - 4}" width="${tileSize}" height="${tileSize}" rx="${tileSize * 0.225}" fill="url(#glow)"/>
<g transform="translate(${inset} ${inset - 4}) scale(${tileSize / 512})">${glyph()}</g>`);

// Favicon: rounded tile edge to edge, letter enlarged so it still reads at 16px.
const favicon = svg(`<rect width="512" height="512" rx="112" fill="url(#tile)"/>
<rect width="512" height="512" rx="112" fill="url(#glow)"/>
${glyph(1.16)}`);

// Rendered at 4x and scaled down, for clean edges at every size. Full-bleed
// icons are flattened: iOS shows any transparency as black.
const png = (source, size, { opaque = false } = {}) => {
  let img = sharp(Buffer.from(source), { density: 72 * (size / 512) * 4 }).resize(size, size);
  if (opaque) img = img.flatten({ background: C.tile });
  return img.png({ compressionLevel: 9 }).toBuffer();
};

/** PNG-in-ICO: a 6-byte header, a 16-byte entry per image, then the PNGs. */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

writeFileSync(out('public/icons/apple-touch-icon.png'), await png(fullBleed, 180, { opaque: true }));
writeFileSync(out('public/icons/icon-512-maskable.png'), await png(fullBleed, 512, { opaque: true }));
writeFileSync(out('public/icons/icon-192.png'), await png(desktop, 192));
writeFileSync(out('public/icons/icon-512.png'), await png(desktop, 512));
writeFileSync(out('public/icons/icon.svg'), favicon);
const icoSizes = [16, 32, 48];
writeFileSync(out('src/app/favicon.ico'), ico(await Promise.all(icoSizes.map(async (size) => ({ size, data: await png(favicon, size) })))));

console.log('Icons written.');
