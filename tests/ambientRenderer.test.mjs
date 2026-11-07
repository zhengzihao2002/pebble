import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({
  stdin: { contents: `
    export { ambientFramebufferSize, rotateAmbientColour, AMBIENT_DIAMETERS } from './src/lib/ambientRenderer';
    export { AMBIENT_MOTION, sampleAmbientMotion } from './src/lib/ambientMotion';
  `, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const compiled = { exports: {} };
const context = vm.createContext({ module: compiled, exports: compiled.exports });
vm.runInContext(source, context);
const { ambientFramebufferSize, rotateAmbientColour, AMBIENT_DIAMETERS, AMBIENT_MOTION, sampleAmbientMotion } = compiled.exports;

const viewports = [
  [390, 844], [844, 390], [768, 1024], [1024, 768], [1440, 900],
  [1920, 1080], [2560, 1440], [3440, 1440], [3840, 2160], [2160, 3840],
];

test('framebuffers stay within 700px at phone, desktop and monitor sizes', () => {
  for (const [width, height] of [...viewports, [1, 1], [320, 480], [1, 10000], [10000, 1]]) {
    const size = ambientFramebufferSize(width, height);
    assert.ok(Number.isInteger(size.width) && Number.isInteger(size.height));
    assert.ok(size.width >= 1 && size.height >= 1);
    assert.ok(Math.max(size.width, size.height) <= 700, `${width}×${height} exceeds the memory bound`);
    if (Math.max(width, height) <= 700) {
      assert.equal(size.width, width, 'Small canvases should not be upsampled');
      assert.equal(size.height, height);
    } else {
      assert.equal(Math.max(size.width, size.height), 700);
      // Quantization may move a short side by at most one framebuffer pixel.
      assert.ok(Math.abs(size.width - size.height * width / height) <= Math.max(1, width / height));
      assert.ok(Math.abs(size.height - size.width * height / width) <= Math.max(1, height / width));
    }
  }
});

test('device pixel ratio cannot multiply the persistent framebuffer allocation', () => {
  for (const [width, height] of viewports) {
    const baseline = ambientFramebufferSize(width, height);
    for (const dpr of [1, 2, 3, 4]) {
      // Exercise the real helper in environments representing high-DPR phones.
      context.devicePixelRatio = dpr;
      context.window = { devicePixelRatio: dpr };
      const size = ambientFramebufferSize(width, height);
      assert.equal(size.width, baseline.width);
      assert.equal(size.height, baseline.height);
      assert.ok(size.width * size.height * 4 <= 700 * 700 * 4);
    }
  }
});

test('hue rotation preserves identity and neutral colours while keeping sRGB bounded', () => {
  for (const colour of [[.2, .6, .8], [0, 0, 0], [1, 1, 1]]) {
    const unchanged = rotateAmbientColour(colour, 0);
    unchanged.forEach((channel, i) => assert.ok(Math.abs(channel - colour[i]) < 1e-12));
  }
  for (const degrees of [-42, -21, 0, 21, 42]) {
    rotateAmbientColour([.4, .4, .4], degrees).forEach(channel => assert.ok(Math.abs(channel - .4) < 1e-12));
    for (const colour of [[.34, .64, .53], [.55, .8, .94], [.82, .64, .83], [1, 0, 0], [0, 0, 1]]) {
      const shifted = rotateAmbientColour(colour, degrees);
      assert.equal(shifted.length, 3);
      shifted.forEach(channel => assert.ok(Number.isFinite(channel) && channel >= 0 && channel <= 1));
    }
  }
  const cool = rotateAmbientColour([.55, .8, .94], -42);
  const warm = rotateAmbientColour([.55, .8, .94], 42);
  assert.ok(cool.some((channel, i) => Math.abs(channel - warm[i]) > .1), 'The endpoints must visibly change chromatic colours');
});

test('shared routes and screen-scaled radii illuminate every viewport point over time', () => {
  const columns = 31, rows = 21;
  for (const [width, height] of viewports) {
    const radii = AMBIENT_DIAMETERS.map(diameter => Math.max(width, height) * diameter / 2);
    const nearest = Array(columns * rows).fill(Infinity);
    for (let seconds = 0; seconds <= 120; seconds += .5) {
      AMBIENT_MOTION.forEach((motion, index) => {
        const centre = sampleAmbientMotion(motion, seconds);
        for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
          const distance = Math.hypot(
            column * width / (columns - 1) - centre.x * width,
            row * height / (rows - 1) - centre.y * height,
          ) / radii[index];
          const sample = row * columns + column;
          nearest[sample] = Math.min(nearest[sample], distance);
        }
      });
    }
    const worstDistance = Math.max(...nearest);
    assert.ok(worstDistance < .7, `${width}×${height} leaves part of the background outside the visible light`);
    // Distance is Lipschitz: radius clearance greater than a grid-cell half
    // diagonal proves the unsampled pixels between grid points are lit too.
    const clearance = Math.min(...radii) * (1 - worstDistance);
    const halfDiagonal = Math.hypot(width / (columns - 1), height / (rows - 1)) / 2;
    assert.ok(clearance > halfDiagonal, `${width}×${height} has unproven gaps between samples`);
  }
});
