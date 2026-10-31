const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pebble-session-access-'));
buildSync({ entryPoints: [path.resolve('src/lib/auth/sessionErrors.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: path.join(temp, 'errors.cjs') });
const { requiresFreshSignIn, isInvalidPassword } = require(path.join(temp, 'errors.cjs'));
process.on('exit', () => fs.rmSync(temp, { recursive: true, force: true }));

test('recognizes the provider response and Neon SDK normalized freshness error', async () => {
  const { AuthApiError } = await import('@neondatabase/auth/next');
  assert.equal(requiresFreshSignIn({ code: 'SESSION_NOT_FRESH', status: 403 }), true);
  assert.equal(requiresFreshSignIn(new AuthApiError('Session is not fresh', 403, 'feature_not_supported')), true);
});

test('unrelated forbidden, expired, network, and service failures do not request a password', () => {
  for (const error of [null, undefined, new Error('Network unavailable'),
    { code: 'feature_not_supported', status: 403, message: 'Account disabled' },
    { status: 401, message: 'Session is not fresh' },
    { status: 503, message: 'Session is not fresh' },
    { code: 'UNAUTHORIZED', status: 401 }]) {
    assert.equal(requiresFreshSignIn(error), false);
  }
});

test('recognizes both password error formats without blaming service outages on the password', () => {
  assert.equal(isInvalidPassword({ code: 'INVALID_EMAIL_OR_PASSWORD' }), true);
  assert.equal(isInvalidPassword({ code: 'invalid_credentials' }), true);
  assert.equal(isInvalidPassword({ status: 503 }), false);
  assert.equal(isInvalidPassword(new Error('Network unavailable')), false);
});

test('an active 15-day sign-in needs confirmation; same-account sign-in restores access and retires only the replaced session', async () => {
  const { betterAuth } = await import('better-auth');
  const { memoryAdapter } = await import('better-auth/adapters/memory');
  const store = { user: [], session: [], account: [], verification: [] };
  const origin = 'http://localhost:4180';
  const auth = betterAuth({ baseURL: origin, secret: 'isolated-session-test-secret-at-least-32-characters',
    database: memoryAdapter(store), emailAndPassword: { enabled: true },
    session: { expiresIn: 30 * 86400 }, logger: { level: 'error' } });
  const request = (route, cookie, body) => auth.handler(new Request(`${origin}/api/auth/${route}`, {
    method: body ? 'POST' : 'GET', headers: { Origin: origin, ...(cookie ? { cookie } : {}), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  const cookies = response => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const credentials = { email: 'fixture@example.test', password: 'synthetic-password-only' };
  const signup = await request('sign-up/email', '', { ...credentials, name: 'Synthetic fixture' });
  assert.equal(signup.status, 200);
  const oldCookie = cookies(signup);
  const oldId = store.session[0].id;
  store.session[0].createdAt = new Date(Date.now() - 15 * 86400000);
  const normal = await request('get-session', oldCookie);
  assert.equal(normal.status, 200);
  const userId = (await normal.json()).user.id;
  const stale = await request('list-sessions', oldCookie);
  assert.equal(stale.status, 403);
  assert.equal(requiresFreshSignIn(await stale.json()), true);

  const wrong = await request('sign-in/email', oldCookie, { ...credentials, password: 'incorrect-password' });
  assert.equal(wrong.status, 401);
  assert.equal(store.session.length, 1);
  assert.equal((await request('get-session', oldCookie)).status, 200);

  const confirmed = await request('sign-in/email', oldCookie, credentials);
  assert.equal(confirmed.status, 200);
  assert.equal((await confirmed.json()).user.id, userId);
  const newCookie = cookies(confirmed);
  const list = await request('list-sessions', newCookie);
  assert.equal(list.status, 200);
  const rows = await list.json();
  const previous = rows.find(row => row.id === oldId);
  assert.ok(previous);
  const revoked = await request('revoke-session', newCookie, { token: previous.token });
  assert.equal(revoked.status, 200);
  assert.equal(store.session.length, 1);
  assert.notEqual(store.session[0].id, oldId);
  assert.equal((await (await request('get-session', newCookie)).json()).user.id, userId);
});
