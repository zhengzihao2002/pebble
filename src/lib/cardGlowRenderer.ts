export const CARD_GLOW_PAD = 88;
export const CARD_GLOW_FRAMEBUFFER_LIMIT = 1400;

export interface GlowRect { x: number; y: number; width: number; height: number }
export interface GlowSurface extends GlowRect {
  radii: [number, number, number, number];
  opacity: number;
  clip?: GlowRect;
}
export type GlowColour = readonly [number, number, number];

export function glowFramebufferSize(width: number, height: number) {
  const scale = Math.min(1, CARD_GLOW_FRAMEBUFFER_LIMIT / Math.max(1, width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Gaussian-integrated edge falloff, approximating the existing 20/44px halos.
// It is baked into tiny RGBA textures, never a browser CSS or canvas shadow.
function erfc(value: number) {
  const sign = value < 0 ? -1 : 1, x = Math.abs(value), t = 1 / (1 + .3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x);
  return 1 - sign * erf;
}

export function cardGlowAlpha(distance: number) {
  if (distance < 0 || distance >= CARD_GLOW_PAD) return 0;
  const near = .17 * .5 * erfc((distance - 1) / (10 * Math.SQRT2));
  const far = .11 * .5 * erfc((distance - 1) / (22 * Math.SQRT2));
  return near + far * (1 - near);
}

function image(width: number, height: number, colour: GlowColour, distance: (x: number, y: number) => number) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const pixels = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    pixels.data[offset] = colour[0]; pixels.data[offset + 1] = colour[1]; pixels.data[offset + 2] = colour[2];
    pixels.data[offset + 3] = Math.round(cardGlowAlpha(distance(x, y)) * 255);
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

/** One bounded paint plane. Analytic corner textures keep the same round glow
 * across engines without native outset-shadow or filter compositing. */
export function createCardGlowRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return null;
  const corners = new Map<string, HTMLCanvasElement>();
  let colourKey = '', horizontal: HTMLCanvasElement | null = null, vertical: HTMLCanvasElement | null = null;
  const corner = (radius: number, colour: GlowColour) => {
    const key = radius.toFixed(2);
    const cached = corners.get(key);
    if (cached) return cached;
    const extent = CARD_GLOW_PAD + radius, size = Math.ceil(extent);
    const tile = image(size, size, colour, (x, y) => {
      const px = (x + .5) * extent / size, py = (y + .5) * extent / size;
      return Math.hypot(px - extent, py - extent) - radius;
    });
    if (corners.size >= 24) corners.delete(corners.keys().next().value!);
    corners.set(key, tile);
    return tile;
  };
  const tile = (source: HTMLCanvasElement, x: number, y: number, width: number, height: number, flipX = false, flipY = false) => {
    if (width <= 0 || height <= 0) return;
    ctx.save();
    ctx.translate(x + (flipX ? width : 0), y + (flipY ? height : 0));
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(source, 0, 0, width, height);
    ctx.restore();
  };
  const clipped = (surface: GlowSurface, paint: () => void) => {
    ctx.save();
    if (surface.clip) {
      ctx.beginPath(); ctx.rect(surface.clip.x, surface.clip.y, surface.clip.width, surface.clip.height); ctx.clip();
    }
    paint(); ctx.restore();
  };
  return {
    draw(width: number, height: number, surfaces: readonly GlowSurface[], colour: GlowColour) {
      const size = glowFramebufferSize(width, height);
      if (canvas.width !== size.width) canvas.width = size.width;
      if (canvas.height !== size.height) canvas.height = size.height;
      ctx.setTransform(size.width / width, 0, 0, size.height / height, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      const key = colour.join(',');
      if (key !== colourKey) {
        colourKey = key; corners.clear();
        horizontal = image(CARD_GLOW_PAD, 1, colour, x => CARD_GLOW_PAD - x - .5);
        vertical = image(1, CARD_GLOW_PAD, colour, (_, y) => CARD_GLOW_PAD - y - .5);
      }
      if (!horizontal || !vertical) return;
      const edgeX = horizontal, edgeY = vertical, p = CARD_GLOW_PAD;
      for (const surface of surfaces) clipped(surface, () => {
        const { x, y, width: w, height: h, radii: [tl, tr, br, bl] } = surface;
        ctx.globalAlpha = surface.opacity;
        tile(corner(tl, colour), x - p, y - p, tl + p, tl + p);
        tile(corner(tr, colour), x + w - tr, y - p, tr + p, tr + p, true);
        tile(corner(br, colour), x + w - br, y + h - br, br + p, br + p, true, true);
        tile(corner(bl, colour), x - p, y + h - bl, bl + p, bl + p, false, true);
        tile(edgeY, x + tl, y - p, w - tl - tr, p);
        tile(edgeY, x + bl, y + h, w - bl - br, p, false, true);
        tile(edgeX, x - p, y + tl, p, h - tl - bl);
        tile(edgeX, x + w, y + tr, p, h - tr - br, true);
      });
      // Never fill a card's silhouette, including transparent or entering cards.
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000';
      for (const surface of surfaces) clipped(surface, () => {
        ctx.beginPath(); ctx.roundRect(surface.x, surface.y, surface.width, surface.height, surface.radii); ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
    },
    dispose() { corners.clear(); horizontal = null; vertical = null; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); },
  };
}
