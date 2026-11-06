const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pebble-sheet-'));
const out = path.join(dir, 'gesture.cjs');
buildSync({ entryPoints: ['src/lib/mobileSheetGesture.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: out });
const { shouldDismissSheet, sheetReleaseVelocity } = require(out);
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));

test('slow drags close at a quarter height, capped for tall sheets', () => {
  assert.equal(shouldDismissSheet(99, 400, 0), false);
  assert.equal(shouldDismissSheet(100, 400, 0), true);
  assert.equal(shouldDismissSheet(127, 880, 0), false);
  assert.equal(shouldDismissSheet(128, 880, 0), true);
  assert.equal(shouldDismissSheet(24, 100, 0), false);
  assert.equal(shouldDismissSheet(48, 100, 0), true);
});

test('a deliberate short downward flick closes; tiny or slow movements return', () => {
  assert.equal(shouldDismissSheet(60, 880, .6), true);
  assert.equal(shouldDismissSheet(60, 880, .2), false);
  assert.equal(shouldDismissSheet(39, 880, 2), false);
  assert.equal(shouldDismissSheet(60, 880, -.6), false);
});

test('release velocity ignores stale motion and detects pauses and reversal', () => {
  const fast = [{ distance: 0, time: 0 }, { distance: 30, time: 40 }, { distance: 60, time: 80 }];
  assert.equal(sheetReleaseVelocity(fast, 100), .6);
  assert.equal(sheetReleaseVelocity(fast, 300), 0, 'holding before release is not a flick');
  assert.equal(sheetReleaseVelocity([{ distance: 90, time: 100 }, { distance: 60, time: 150 }], 160), -.5);
  assert.equal(sheetReleaseVelocity([], 100), 0);
  assert.equal(sheetReleaseVelocity([{ distance: 0, time: 100 }], 100), 0);
});
