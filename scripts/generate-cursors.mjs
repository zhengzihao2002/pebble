import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Native cursor images stay small and crisp at their actual display size.
// Each pair uses the theme's light/dark pine colour, with a translucent fill.
const colours = {
  original: ['#1F5A45', '#57A487'], ocean: ['#1E5F8C', '#5FA8D8'],
  glacier: ['#2B7099', '#8DCEEF'], sakura: ['#7D4D88', '#D0A2D4'],
  slate: ['#3D56A6', '#8EA4E8'], sand: ['#4F6B34', '#93B06E'],
  lavender: ['#674FA3', '#B7A0E8'], lagoon: ['#176C70', '#70BFC1'],
  graphite: ['#4C505C', '#B9BECE'],
};
const shapes = {
  arrow: 'M3 2.5Q2.5 2 2.6 3L4.8 22Q4.9 23 5.8 22.6L19.3 16.8Q20.2 16.4 19.5 15.8Z',
  hand: 'M7.5 14V4.5C7.5 1.8 11.5 1.8 11.5 4.5V11C11.5 8.8 15 8.8 15 11V12C15 9.8 18.3 10.3 18.3 12.5V13C18.3 11.5 21.3 12 21.3 14.3V18C21.3 20.4 19.5 23 18 25H9C7.6 23.8 6 22.3 5 20.3L2.9 16.3C1.7 14 4.2 12.4 5.8 14L7.5 16Z',
};
const directory = new URL('../public/cursors/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const [theme, pair] of Object.entries(colours)) {
  for (const [index, mode] of ['light', 'dark'].entries()) {
    for (const [kind, shape] of Object.entries(shapes)) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="28" viewBox="0 0 24 28">\n  <path d="${shape}" fill="${pair[index]}" fill-opacity=".82" stroke="#fffffc" stroke-opacity=".88" stroke-width="1" stroke-linejoin="round"/>\n</svg>\n`;
      const name = `${kind}-${theme}-${mode}`;
      await writeFile(new URL(`${name}.svg`, directory), svg);
      await sharp(Buffer.from(svg)).png().toFile(new URL(`${name}.png`, directory).pathname);
    }
  }
}
