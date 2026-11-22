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
        b.onResolve({ filter: /^(next\/server|next\/headers|@neondatabase\/auth\/server|@\/lib\/i18n\/serverLocale)$/ }, ({ path }) => ({ path, namespace: 'legal-fixture' }));
        b.onResolve({ filter: /(loading\/PendingLink|AuthLanguageToggle|brand\/PebbleMark)$/ }, ({ path }) => ({ path, namespace: 'legal-fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'legal-fixture' }, ({ path }) => ({ contents: path === 'next/server'
          ? 'export const connection = () => globalThis.__legalFixture.connection();'
          : path === 'next/headers'
            ? 'export const cookies = () => globalThis.__legalFixture.cookies();'
            : path === '@neondatabase/auth/server'
              ? 'export const NEON_AUTH_SESSION_COOKIE_NAME = "fixture-session-cookie";'
              : path === '@/lib/i18n/serverLocale'
                ? 'export const resolveUserLocale = () => globalThis.__legalFixture.locale();'
                : 'export default function Link() { return null } export function AuthLanguageToggle() { return null } export function PebbleMark() { return null }',
        }));
      },
    }],
  });
  return { ...page, source: result.outputFiles[0].text };
}));

function fixture(source, { locale = 'en', hasSessionCookie = false, signal } = {}) {
  const calls = [];
  const compiled = { exports: {} };
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports, require,
    __legalFixture: {
      connection: async () => { calls.push('connection'); if (signal) throw signal; },
      locale: async () => { calls.push('locale'); return locale; },
      cookies: async () => {
        calls.push('cookies');
        return { has: name => name === 'fixture-session-cookie' && hasSessionCookie };
      },
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
  test(`${page.name} stops the prerender probe before request cookies`, async () => {
    const signal = Object.assign(new Error('request required'), { digest: 'DYNAMIC_SERVER_USAGE' });
    const f = fixture(page.source, { signal });
    await assert.rejects(f.render(), error => error === signal);
    assert.deepEqual(f.calls, ['connection']);
  });

  test(`${page.name} preserves localized content and session-aware back links`, async () => {
    for (const locale of ['en', 'zh']) for (const signedIn of [false, true]) {
      const f = fixture(page.source, { locale, hasSessionCookie: signedIn });
      const elements = nodes(await f.render());
      assert.deepEqual(f.calls, ['connection', 'locale', 'cookies']);
      assert.equal(elements.find(element => element.type === 'h1').props.children, page.titles[locale]);
      assert.ok(elements.some(element => element.props?.href === (signedIn ? '/settings' : '/auth/sign-in')));
      assert.ok(elements.some(element => element.props?.href === `/auth/${page.name === 'terms' ? 'privacy' : 'terms'}`));
    }
  });

  test(`${page.name} stays public without a session cookie or a Neon lookup`, async () => {
    const f = fixture(page.source);
    const elements = nodes(await f.render());
    assert.ok(elements.some(element => element.props?.href === '/auth/sign-in'));
    assert.deepEqual(f.calls, ['connection', 'locale', 'cookies']);
  });
}
