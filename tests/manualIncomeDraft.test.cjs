const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pebble-income-'));
const output = path.join(temp, 'draft.cjs');
buildSync({ entryPoints: ['src/lib/budgets/manualIncomeDraft.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: output });
const { readManualIncomeDraft: read, writeManualIncomeDraft: write, clearManualIncomeDraft: clear } = require(output);
process.on('exit', () => fs.rmSync(temp, { recursive: true, force: true }));
const values = new Map();
global.window = { localStorage: {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key),
} };

test('imported and edited paycheck drafts survive a fresh module load for that user only', () => {
  write('a', '4321.09');
  delete require.cache[output];
  const fresh = require(output);
  assert.equal(fresh.readManualIncomeDraft('a'), '4321.09');
  assert.equal(fresh.readManualIncomeDraft('b'), '');
  write('b', '2400');
  assert.equal(read('a'), '4321.09');
  assert.equal(read('b'), '2400');
  write('a', '');
  assert.equal(read('a'), '', 'clearing the field must persist too');
  assert.equal(read('b'), '2400');
  clear('b');
  assert.equal(read('b'), '');
});

test('unknown users, corrupt data and invalid amounts never supply a draft', () => {
  write(null, '5000');
  assert.equal(read(null), '');
  for (const raw of ['bad json', 'null', '{"version":1,"amount":-10}', '{"version":1,"amount":"Infinity"}', '{"version":2,"amount":"123"}']) {
    values.set('pebble-budget-income:v1:bad', raw);
    assert.equal(read('bad'), '');
  }
  for (const amount of ['-10', 'Infinity', 'NaN', ' ']) write('invalid', amount);
  assert.equal(read('invalid'), '');
});

test('blocked or full storage still allows editing without borrowing another user\'s value', () => {
  const storage = window.localStorage;
  window.localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
  write('blocked-a', '3200');
  assert.equal(read('blocked-a'), '3200');
  assert.equal(read('blocked-b'), '');
  write('blocked-a', '3300');
  assert.equal(read('blocked-a'), '3300');
  clear('blocked-a');
  assert.equal(read('blocked-a'), '');
  window.localStorage = { ...storage, setItem() { throw Error('quota'); } };
  write('quota', '3400');
  assert.equal(read('quota'), '3400', 'failed writes must not reset the visible input');
  window.localStorage = storage;
});
