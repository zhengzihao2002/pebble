const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pebble-sign-out-layout-'));
const output = path.join(temp, 'flow.cjs');
const mocks = {
  '@/lib/auth/client': `export const authClient={signOut:async()=>{if(globalThis.authThrows)throw Error('offline');return globalThis.authResult}};`,
  '@/lib/offline/queueStore': `export async function clearAllSnapshots(){globalThis.events.push('snapshots')}`,
  '@/lib/quickPicks': `export function clearAllQuickPicks(){globalThis.events.push('quick-picks')}`,
  '@/lib/offline/serviceWorker': `export async function clearOfflineCaches(){globalThis.events.push('offline');globalThis.duringCleanup?.()}`,
};
before(async () => { await build({ stdin: { contents: `export {signOutCompletely} from './src/lib/auth/signOut';\nexport {capturePageLayout,readPageLayout,layoutProfile,LAYOUT_CACHE_PREFIX} from '@/components/loading/layoutCache';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', outfile: output,
  plugins: [{ name: 'isolated-auth', setup(build) {
    build.onResolve({ filter: /.*/ }, args => {
      const target = args.path === './client' && args.importer.endsWith('/auth/signOut.ts') ? '@/lib/auth/client' : args.path;
      return target in mocks ? { path: target, namespace: 'fixture' } : null;
    });
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }));
  } }],
}); });
process.on('exit', () => fs.rmSync(temp, { recursive: true, force: true }));
function fresh() { delete require.cache[output]; return require(output); }
const values = new Map();
let user, height;
const html = { lang: 'en', getAttribute: () => null };
const main = { clientWidth: 600, getBoundingClientRect: () => ({ left: 0, top: 0 }), closest: () => ({ scrollTop: 0 }) };
const card = { getBoundingClientRect: () => ({ left: 20, top: 20, width: 560, height }), closest: () => null, matches: () => false };
const content = { hidden: false, closest: () => main, querySelector: () => null, children: [], querySelectorAll: selector => selector === '.pb-rise' ? [] : [card] };
global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
global.document = { documentElement: html, querySelector: selector => selector.startsWith('meta') ? { content: user + '|test' } : content };
global.getComputedStyle = element => element === html ? { fontSize: '16px' } : element === main ? { paddingLeft: '20px', paddingRight: '20px', paddingTop: '20px' } : { visibility: 'visible', borderTopLeftRadius: '22px', boxShadow: 'none' };
function setup() {
  values.clear(); user = 'user-a'; height = 640; global.authResult = {}; global.authThrows = false; global.events = []; global.duringCleanup = null;
  global.window = { innerWidth: 1024, innerHeight: 768, location: { pathname: '/accounts', replace: url => events.push(url) } };
}

test('successful sign-out retains each user\'s geometry and freezes late captures until a fresh sign-in', async () => {
  setup(); const flow = fresh();
  flow.capturePageLayout('/accounts'); const first = values.get(flow.LAYOUT_CACHE_PREFIX + user);
  user = 'user-b'; height = 920; flow.capturePageLayout('/accounts'); const second = values.get(flow.LAYOUT_CACHE_PREFIX + user);
  user = 'user-a'; height = 1200;
  // Observers may fire while asynchronous offline cleanup is still running.
  global.duringCleanup = () => flow.capturePageLayout('/accounts');
  assert.equal(await flow.signOutCompletely(), true);
  flow.capturePageLayout('/accounts');
  assert.equal(values.get(flow.LAYOUT_CACHE_PREFIX + user), first);
  assert.equal(values.get(flow.LAYOUT_CACHE_PREFIX + 'user-b'), second);
  assert.deepEqual(events, ['offline', 'snapshots', 'quick-picks', '/auth/sign-in']);
  const signedBackIn = fresh();
  assert.equal(signedBackIn.readPageLayout('/accounts', main).height, 640);
  user = 'user-b'; assert.equal(signedBackIn.readPageLayout('/accounts', main).height, 920);
  user = 'new-user'; assert.equal(signedBackIn.readPageLayout('/accounts', main), null);
  user = 'user-a'; height = 1000; signedBackIn.capturePageLayout('/accounts');
  assert.equal(signedBackIn.readPageLayout('/accounts', main).height, 1000, 'returning users can record updated dimensions');
});

test('failed sign-out leaves navigation, caches and capture active', async () => {
  for (const throws of [false, true]) {
    setup(); const flow = fresh(); flow.capturePageLayout('/accounts');
    global.authThrows = throws; global.authResult = { error: { message: 'Try again' } };
    assert.equal(await flow.signOutCompletely(), false);
    assert.deepEqual(events, []);
    height = 800; flow.capturePageLayout('/accounts');
    assert.equal(flow.readPageLayout('/accounts', main).height, 800);
  }
});
