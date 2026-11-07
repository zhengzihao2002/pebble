import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({
  entryPoints: ['src/lib/cardGlowRenderer.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const compiled = { exports: {} };
const context = vm.createContext({ module: compiled, exports: compiled.exports });
vm.runInContext(source, context);
const { CARD_GLOW_PAD, CARD_GLOW_FRAMEBUFFER_LIMIT, glowFramebufferSize, cardGlowAlpha } = compiled.exports;

const viewports = [[390, 844], [844, 390], [768, 1024], [1440, 900], [1920, 1080], [3440, 1440], [3840, 2160], [2160, 3840]];

test('glow framebuffer stays bounded while preserving CSS aspect within one pixel', () => {
  assert.equal(CARD_GLOW_FRAMEBUFFER_LIMIT, 1400);
  for (const [width, height] of [...viewports, [1, 1], [320, 480], [1, 10000], [10000, 1]]) {
    const size = glowFramebufferSize(width, height);
    assert.ok(Number.isInteger(size.width) && Number.isInteger(size.height));
    assert.ok(size.width > 0 && size.height > 0);
    assert.ok(Math.max(size.width, size.height) <= CARD_GLOW_FRAMEBUFFER_LIMIT);
    if (Math.max(width, height) <= CARD_GLOW_FRAMEBUFFER_LIMIT) {
      assert.equal(size.width, width, 'Small CSS viewports are never upsampled');
      assert.equal(size.height, height);
    } else {
      assert.equal(Math.max(size.width, size.height), CARD_GLOW_FRAMEBUFFER_LIMIT);
      assert.ok(Math.abs(size.width - size.height * width / height) <= Math.max(1, width / height));
      assert.ok(Math.abs(size.height - size.width * height / width) <= Math.max(1, height / width));
    }
  }
});

test('high-DPR devices cannot inflate the persistent glow allocation', () => {
  for (const [width, height] of viewports) {
    const baseline = glowFramebufferSize(width, height);
    for (const dpr of [1, 2, 3, 4]) {
      context.devicePixelRatio = dpr;
      context.window = { devicePixelRatio: dpr };
      const size = glowFramebufferSize(width, height);
      assert.equal(size.width, baseline.width);
      assert.equal(size.height, baseline.height);
      assert.ok(size.width * size.height * 4 <= CARD_GLOW_FRAMEBUFFER_LIMIT ** 2 * 4);
    }
  }
});

test('halo is transparent inside the card and beyond its finite paint margin', () => {
  assert.equal(CARD_GLOW_PAD, 88);
  for (const inside of [-100, -10, -1, -.001]) assert.equal(cardGlowAlpha(inside), 0);
  for (const outside of [CARD_GLOW_PAD, CARD_GLOW_PAD + 1, 1000, Infinity]) assert.equal(cardGlowAlpha(outside), 0);
  assert.ok(cardGlowAlpha(0) > .1, 'The actual rounded edge should retain visible light');
  assert.ok(cardGlowAlpha(CARD_GLOW_PAD - .001) < 1 / 255, 'The margin should end after the visible glow has faded');
});

test('outward falloff is finite, bounded, continuous and monotonically softer', () => {
  let previous = cardGlowAlpha(0);
  assert.ok(previous < .3, 'The two soft lights must not become an opaque tint');
  for (let distance = .125; distance < CARD_GLOW_PAD; distance += .125) {
    const alpha = cardGlowAlpha(distance);
    assert.ok(Number.isFinite(alpha) && alpha >= 0 && alpha <= 1);
    assert.ok(alpha <= previous + 1e-12, `Glow must not form a brighter ring at ${distance}px`);
    assert.ok(previous - alpha < .005, `Glow must not form a hard outward band at ${distance}px`);
    previous = alpha;
  }
  assert.ok(cardGlowAlpha(2) > cardGlowAlpha(20));
  assert.ok(cardGlowAlpha(20) > cardGlowAlpha(44));
  assert.ok(cardGlowAlpha(44) > cardGlowAlpha(70));
});
