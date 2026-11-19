import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { build } from 'esbuild';

const viewer = '11111111-1111-1111-1111-111111111111';
const pair = '22222222-2222-2222-2222-222222222222';
const stub = {
  cookie: undefined,
  calls: [],
};

const entry = `
  export * from './src/lib/partnerPaths';
  export { getOwnWorkspaceUser } from './src/lib/partnerView.server';
  export { withSessionUser } from './src/lib/actions/withSessionUser';
  export { canSeePartnerBalances } from './src/lib/partner';
  export { computeCurrentBalances } from './src/lib/stats';
  export { partnerDisplayName, partnerTransactions, partnerBalanceAdjustments } from './src/lib/partnerDisplay';
`;
const sources = {
  'server-only': '',
  'next/headers': 'export const cookies = async () => ({ get: () => ({ value: stub.cookie }) });',
  'next/navigation': 'export const redirect = path => { throw new Error(path); };',
  '@/lib/auth/getSessionUser': `
    export const getSessionUserId = async () => '${viewer}';
    export const getSessionUserIdOrRedirect = getSessionUserId;
    export class AuthRequiredError extends Error {}
    export class AuthUnavailableError extends Error {}
  `,
};
const compiled = (await build({
  stdin: { contents: entry, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'session-fixture', setup(b) {
    b.onResolve({ filter: /.*/ }, args => Object.hasOwn(sources, args.path) ? { path: args.path, namespace: 'fixture' } : null);
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: sources[args.path] }));
  } }],
})).outputFiles[0].text;
const cjs = { exports: {} };
new Function('module', 'exports', 'require', 'stub', compiled)(cjs, cjs.exports, createRequire(import.meta.url), stub);
const scope = cjs.exports;

test('partner navigation resolves the original page and keeps owner-only routes private', () => {
  for (const section of scope.PARTNER_SECTIONS) {
    const href = '/' + section;
    assert.equal(scope.workspacePath(scope.partnerSectionPath(href)), href);
  }
  assert.equal(scope.partnerSectionPath('/budgets/plan'), '/partner/budgets');
  assert.equal(scope.partnerSectionPath('/account/security'), '/partner/settings');
  assert.equal(scope.partnerSectionPath('https://other.example/reports'), 'https://other.example/reports');
});

test('a partner cookie suspends ordinary actions, and is scoped to the signed-in member', async () => {
  const execute = async id => id;
  const ownerAction = scope.withSessionUser(execute);
  const partnerAction = scope.withSessionUser(execute, { partnerView: true });
  stub.cookie = 'someone-else:' + pair;
  assert.equal(await scope.getOwnWorkspaceUser('/reports'), viewer);
  assert.equal(await ownerAction(), viewer);

  stub.cookie = viewer + ':' + pair;
  await assert.rejects(scope.getOwnWorkspaceUser('/reports'), /\/partner\/reports/);
  assert.equal((await ownerAction()).ok, false);
  assert.equal(await partnerAction(), viewer);

  stub.cookie = undefined;
  assert.equal(await scope.getOwnWorkspaceUser('/reports'), viewer);
  assert.equal(await ownerAction(), viewer);
});

test('saved partner names are preserved and restricted ledger fields are censored', () => {
  assert.equal(scope.partnerDisplayName('Guest', 'Partner'), 'Guest');
  assert.equal(scope.partnerDisplayName('   ', 'Partner'), 'Partner');
  assert.equal(scope.partnerDisplayName(null, 'Partner'), 'Partner');
  assert.equal(scope.partnerDisplayName('Morgan', 'Partner'), 'Morgan');
  const data = { transactions: [{ id: 'x', kind: 'expense', date: '2026-11-19', hidden: true,
    title: '', category: '', tag: '', accountId: null, accountName: null, amount: null, notes: 'Private description' }] };
  const [row] = scope.partnerTransactions(data, 'Hidden Transaction');
  assert.equal(row.description, 'Hidden Transaction');
  assert.equal(row.category, '');
  assert.equal(row.accountId, '');
  assert.equal(row.tag, '');
});

test('shared balances include individual adjustments only when all inputs are authorized', () => {
  const permissions = { accounts: true, expenses: true, income: true, amounts: true };
  const data = {
    permissions,
    adjustments: [
      { id: 'opening', type: 'adjustment', accountId: 'checking', date: '2026-11-03', amount: 430, description: '', transferGroupId: null },
      { id: 'correction', type: 'adjustment', accountId: 'checking', date: '2026-11-03', amount: -30, description: '', transferGroupId: null },
    ],
    transactions: [
      { id: 'masked', kind: 'expense', date: '2026-11-18', hidden: true, amount: -50, accountId: 'checking' },
    ],
  };
  assert.equal(scope.canSeePartnerBalances(permissions), true);
  const withdrawals = scope.partnerTransactions(data, 'Hidden Transaction');
  const adjustments = scope.partnerBalanceAdjustments(data);
  assert.deepEqual(adjustments.map(row => row.id), ['opening', 'correction']);
  assert.equal(adjustments[0].description, '');
  assert.equal(adjustments[0].transferGroupId, null);
  const current = scope.computeCurrentBalances(withdrawals, [{ id: 'checking' }], adjustments);
  assert.deepEqual(current, { total: 350, byAccount: { checking: 350 } });
  for (const key of Object.keys(permissions)) {
    const restricted = { ...permissions, [key]: false };
    assert.equal(scope.canSeePartnerBalances(restricted), false);
    assert.deepEqual(scope.partnerBalanceAdjustments({ ...data, permissions: restricted }), []);
  }
});
