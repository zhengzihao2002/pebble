import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';

const source = buildSync({entryPoints:['src/lib/settingsBackup.ts'],bundle:true,write:false,platform:'node',format:'esm'}).outputFiles[0].text;
const lib = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

function storage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
}

const prefs = (theme) => JSON.stringify({ state: { themeChoice: theme, textSize: 112, appearance: 'dark' }, version: 2 });

test('a code carries this user\'s settings and device choices, nothing else', () => {
  const s = storage({
    'pebble-ui:last-user': 'u1',
    'pebble-ui:u1': prefs('glacier'),
    'pebble-ui:u2': prefs('sakura'),                // someone else on this device
    'pebble-quiet-sync:v1:u1': '{"enabled":true}',
    'pebble-goals-view': 'grid',
    'pebble-analysis-cashflow-view': 'net',
    'pebble-layout-sizes:v2:u1': '{}',              // cache
    'pebble-bottom-nav:v1:u1': '[]',                // cache
    'pebble-offline-ping': '1',                     // machine state
    'pebble-quickpicks:u1': '[]',                   // cache
    'pebble-sw-warmed-at': '1',
    'unrelated': 'x',
  });
  const code = lib.createSettingsBackup(s, 'u1');
  assert.ok(code.startsWith(lib.BACKUP_PREFIX));
  const body = lib.readSettingsBackup(code).body;
  assert.deepEqual(Object.keys(body.items).sort(), [
    'pebble-analysis-cashflow-view', 'pebble-goals-view', 'pebble-quiet-sync:v1:{user}', 'pebble-ui:{user}',
  ]);
  assert.equal(JSON.parse(body.items['pebble-ui:{user}']).state.themeChoice, 'glacier');
});

test('restoring after a reinstall puts everything back for the signed-in user', () => {
  const before = storage({ 'pebble-ui:last-user': 'u1', 'pebble-ui:u1': prefs('glacier'), 'pebble-goals-view': 'grid', 'pebble-quiet-sync:v1:u1': '{"enabled":true}' });
  const code = lib.createSettingsBackup(before, 'u1');
  // Fresh install: only the defaults the app writes on first sign-in.
  const after = storage({ 'pebble-ui:last-user': 'u1', 'pebble-ui:u1': prefs('original') });
  const result = lib.restoreSettingsBackup(after, 'u1', `  "${code.slice(0, 40)}\n${code.slice(40)}"  `);
  assert.equal(result.ok, true);
  assert.equal(JSON.parse(after.getItem('pebble-ui:u1')).state.themeChoice, 'glacier');
  assert.equal(after.getItem('pebble-goals-view'), 'grid');
  assert.equal(after.getItem('pebble-quiet-sync:v1:u1'), '{"enabled":true}');
});

test('a code restores into a different account id', () => {
  const code = lib.createSettingsBackup(storage({ 'pebble-ui:u1': prefs('ocean') }), 'u1');
  const target = storage({ 'pebble-ui:last-user': 'u9' });
  assert.equal(lib.restoreSettingsBackup(target, 'u9', code).ok, true);
  assert.equal(JSON.parse(target.getItem('pebble-ui:u9')).state.themeChoice, 'ocean');
  assert.equal(target.getItem('pebble-ui:u1'), null);
});

test('non-ASCII values survive the round trip', () => {
  const code = lib.createSettingsBackup(storage({ 'pebble-ui:u1': JSON.stringify({ state: { note: '余额 ✓' } }) }), 'u1');
  assert.equal(JSON.parse(lib.readSettingsBackup(code).body.items['pebble-ui:{user}']).state.note, '余额 ✓');
});

test('nothing saved yet gives no code', () => {
  assert.equal(lib.createSettingsBackup(storage({ 'pebble-goals-view': 'grid' }), 'u1'), null);
});

test('codes mangled by the clipboard, Notes or chat still restore', () => {
  const code = lib.createSettingsBackup(storage({ 'pebble-ui:u1': prefs('glacier'), 'pebble-goals-view': 'grid' }), 'u1');
  assert.match(code, /^PEBBLE-SETTINGS-1:[A-Za-z0-9_-]+$/, 'URL-safe alphabet, no padding');
  const body = code.slice(lib.BACKUP_PREFIX.length);
  const wrapped = body.replace(/(.{20})/g, '$1\n');
  for (const input of [
    code,
    `  ${code}  `,
    `“${code}”`,                                              // smart quotes from Notes
    `"${code}".`,
    `Here is my Pebble backup: ${code}\nThanks`,              // text around it
    lib.BACKUP_PREFIX + wrapped,                              // wrapped lines
    lib.BACKUP_PREFIX + body.split('').join('\u200B'),        // zero-width spaces
    lib.BACKUP_PREFIX.toLowerCase() + body,                   // prefix lower-cased
    lib.BACKUP_PREFIX + body.replace(/-/g, '+').replace(/_/g, '/'), // standard base64
  ]) {
    const s = storage({ 'pebble-ui:last-user': 'u1' });
    const result = lib.restoreSettingsBackup(s, 'u1', input);
    assert.equal(result.ok, true, JSON.stringify(input.slice(0, 60)));
    assert.equal(JSON.parse(s.getItem('pebble-ui:u1')).state.themeChoice, 'glacier');
    assert.equal(s.getItem('pebble-goals-view'), 'grid');
  }
});

test('a code made by the first version (standard base64) still restores', () => {
  const v1 = lib.BACKUP_PREFIX + Buffer.from(JSON.stringify({ v: 1, at: '2026-11-26T00:00:00Z', items: { 'pebble-ui:{user}': prefs('sakura') } })).toString('base64');
  const s = storage();
  assert.equal(lib.restoreSettingsBackup(s, 'u1', v1).ok, true);
  assert.equal(JSON.parse(s.getItem('pebble-ui:u1')).state.themeChoice, 'sakura');
});

test('unknown or cache entries in a code are skipped, not fatal', () => {
  const body = (items) => lib.BACKUP_PREFIX + Buffer.from(JSON.stringify({ v: 1, at: '2026-11-26T00:00:00Z', items })).toString('base64');
  const s = storage();
  const result = lib.restoreSettingsBackup(s, 'u1', body({ 'pebble-ui:{user}': prefs('ocean'), 'pebble-offline-queue': '[]', 'evil-key': '1', 'pebble-goals-view': 'list' }));
  assert.equal(result.ok, true);
  assert.equal(s.getItem('pebble-offline-queue'), null, 'the offline queue is never restored');
  assert.equal(s.getItem('evil-key'), null);
  assert.equal(s.getItem('pebble-goals-view'), 'list');
});

test('bad codes say why and write nothing', () => {
  const s = storage({ 'pebble-ui:u1': prefs('original') });
  const body = (items) => lib.BACKUP_PREFIX + Buffer.from(JSON.stringify({ v: 1, at: '2026-11-26T00:00:00Z', items })).toString('base64');
  const code = lib.createSettingsBackup(storage({ 'pebble-ui:u1': prefs('glacier') }), 'u1');
  const cases = [
    ['   ', 'empty'],
    ['hello', 'notCode'],
    [lib.BACKUP_PREFIX, 'damaged'],
    [code.slice(0, Math.floor(code.length / 2)), 'damaged'],                  // cut short
    [body({ 'pebble-goals-view': 'grid' }), 'damaged'],                       // no preferences entry
    [body({ 'pebble-ui:{user}': 'not json' }), 'damaged'],
  ];
  for (const [input, reason] of cases) {
    const result = lib.restoreSettingsBackup(s, 'u1', input);
    assert.equal(result.ok, false, input.slice(0, 40));
    assert.equal(result.reason, reason, input.slice(0, 40));
  }
  assert.equal(JSON.parse(s.getItem('pebble-ui:u1')).state.themeChoice, 'original');
});

test('restoring needs a signed-in user', () => {
  const code = lib.createSettingsBackup(storage({ 'pebble-ui:u1': prefs('ocean') }), 'u1');
  assert.equal(lib.restoreSettingsBackup(storage(), null, code).reason, 'noUser');
});
