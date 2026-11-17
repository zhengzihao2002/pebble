import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
function fixture() {
  const values = new Map();
  const storage = {
    get length() { return values.size; },
    key: index => [...values.keys()][index],
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const events = [];
  const compiled = { exports: {} };
  const source = buildSync({ stdin: { contents: `export * from './src/lib/accounts/ghostEvents'; export * from './src/lib/quickPicks';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'cjs', platform: 'node' }).outputFiles[0].text;
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports,
    window: { localStorage: storage, dispatchEvent: event => events.push(event) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  });
  return { ...compiled.exports, values, events };
}

test('account scope changes invalidate local and in-memory calculation-derived quick picks', () => {
  const f = fixture();
  f.writeQuickPicks('owner', { computedAt: Date.now(), expense: ['Ghost purchases'] });
  f.values.set('unrelated', 'keep');
  assert(f.readQuickPicks('owner'));
  f.notifyAccountScopeChanged('ghost-bank', true);
  assert.equal(f.readQuickPicks('owner'), null);
  assert.equal(f.values.has('pebble-quickpicks:owner'), false);
  assert.equal(f.values.get('unrelated'), 'keep');
  assert.equal(f.events[0].type, f.ACCOUNT_SCOPE_CHANGED_EVENT);
  assert.equal(f.events[0].detail.accountId, 'ghost-bank');
  assert.equal(f.events[0].detail.isGhost, true);
  f.notifyAccountScopeChanged('ghost-bank', false);
  assert.equal(f.events[1].detail.isGhost, false);
});

test('a response started before ghost mode changed cannot restore stale picks', async () => {
  const f = fixture();
  let complete;
  const pending = f.refreshQuickPicks('owner', () => new Promise(resolve => { complete = resolve; }));
  f.notifyAccountScopeChanged('ghost-bank', true);
  complete({ expense: ['Ghost purchases'] });
  assert.equal(await pending, null);
  assert.equal(f.readQuickPicks('owner'), null);
  const next = await f.refreshQuickPicks('owner', async () => ({ expense: ['Regular purchases'] }));
  assert.equal(next.expense[0], 'Regular purchases');
  assert.equal(f.readQuickPicks('owner').expense[0], 'Regular purchases');
});
