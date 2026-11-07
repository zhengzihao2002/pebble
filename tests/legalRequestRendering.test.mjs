import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const pages = [
  { name: 'terms', titles: { en: 'Terms of Use', zh: '使用条款' } },
  { name: 'privacy', titles: { en: 'Privacy Notice', zh: '隐私声明' } },
];
const compiledPages = await Promise.all(pages.map(async (page) => {
  const result = await build({
    entryPoints: [`src/app/auth/${page.name}/page.tsx`], bundle: true, write: false,
    platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime'],
    plugins: [{
      name: 'isolated-legal-page',
      setup(b) {
        b.onResolve({ filter: /^(next\/server|@\/lib\/auth\/server|@\/lib\/i18n\/serverLocale)$/ }, ({ path }) => ({ path, namespace: 'legal-fixture' }));
        b.onResolve({ filter: /(loading\/PendingLink|AuthLanguageToggle|brand\/PebbleMark)$/ }, ({ path }) => ({ path, namespace: 'legal-fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'legal-fixture' }, ({ path }) => ({ contents: path === 'next/server'
          ? 'export const connection = () => globalThis.__legalFixture.connection();'
          : path === '@/lib/auth/server'
            ? 'export const auth = { getSession: () => globalThis.__legalFixture.session() };'
            : path === '@/lib/i18n/serverLocale'
              ? 'export const resolveUserLocale = () => globalThis.__legalFixture.locale();'
              : 'export default function Link() { return null } export function AuthLanguageToggle() { return null } export function PebbleMark() { return null }',
        }));
      },
    }],
  });
  return { ...page, source: result.outputFiles[0].text };
}));

function fixture(source, { locale = 'en', session = { data: null, error: null }, signal } = {}) {
  const calls = [];
  const compiled = { exports: {} };
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports, require,
    __legalFixture: {
      connection: async () => { calls.push('connection'); if (signal) throw signal; },
      locale: async () => { calls.push('locale'); return locale; },
      session: async () => { calls.push('session'); if (session instanceof Error) throw session; return session; },
    },
  });
  return { render: compiled.exports.default, calls };
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}

for (const page of compiledPages) {
  test(`${page.name} stops the prerender probe before cookie/session helpers`, async () => {
    const signal = Object.assign(new Error('request required'), { digest: 'DYNAMIC_SERVER_USAGE' });
    const f = fixture(page.source, { signal });
    await assert.rejects(f.render(), error => error === signal);
    assert.deepEqual(f.calls, ['connection']);
  });

  test(`${page.name} preserves localized content and session-aware back links`, async () => {
    for (const locale of ['en', 'zh']) for (const signedIn of [false, true]) {
      const f = fixture(page.source, { locale, session: { data: signedIn ? { user: { id: 'synthetic-user' } } : null, error: null } });
      const elements = nodes(await f.render());
      assert.deepEqual(f.calls, ['connection', 'locale', 'session']);
      assert.equal(elements.find(element => element.type === 'h1').props.children, page.titles[locale]);
      assert.ok(elements.some(element => element.props?.href === (signedIn ? '/settings' : '/auth/sign-in')));
      assert.ok(elements.some(element => element.props?.href === `/auth/${page.name === 'terms' ? 'privacy' : 'terms'}`));
    }
  });

  test(`${page.name} stays public when session lookup fails or has no valid user`, async () => {
    for (const session of [new Error('synthetic upstream failure'), { error: { message: 'signed out' }, data: { user: { id: 'synthetic-user' } } }, { error: null, data: { user: { id: '' } } }, { error: null, data: { user: { id: 123 } } }]) {
      const f = fixture(page.source, { session });
      assert.ok(nodes(await f.render()).some(element => element.props?.href === '/auth/sign-in'));
    }
  });
}
