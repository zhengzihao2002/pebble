import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { buildSync } from 'esbuild';

// Exercise the actual AppShell locale effect without mounting unrelated
// authentication, dialogs and data providers. A route refresh can replay an
// existing /settings#settings-money destination after a language change.
const path = 'src/components/layout/AppShell.tsx';
const source = ts.createSourceFile(path, fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect'
    && node.arguments[0]?.getText(source).includes('LOCALE_COOKIE')) effect = node.arguments[0].getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert(effect, 'AppShell must synchronize the locale cookie');
const compiled = buildSync({
  stdin: { contents: `import {HTML_LANG, LOCALE_COOKIE} from './src/lib/i18n/locale'; export function syncLocale(locale) { (${effect})(); }`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs',
}).outputFiles[0].text;

function fixture(initialCookie) {
  const compiledModule = { exports: {} };
  let cookie = initialCookie, writes = 0;
  const document = { documentElement: { lang: 'zh-CN' } };
  Object.defineProperty(document, 'cookie', { get: () => cookie, set: value => { cookie = value; writes++; } });
  const location = { pathname: '/settings', hash: '#settings-money' };
  const refreshSoon = () => { throw new Error('A display-language switch must not refresh or navigate the Settings route'); };
  vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, document, location, refreshSoon });
  return { sync: compiledModule.exports.syncLocale, document, location, cookie: () => cookie, writes: () => writes };
}

test('Chinese to English updates language and cookie without replaying the Money route', () => {
  const f = fixture('pebble-lang=zh');
  f.sync('en');
  assert.equal(f.document.documentElement.lang, 'en');
  assert.equal(f.cookie(), 'pebble-lang=en; Path=/; Max-Age=31536000; SameSite=Lax');
  assert.equal(f.location.hash, '#settings-money');
  assert.equal(f.writes(), 1);
});

test('repeated language switches stay local and persist the latest choice for the next page', () => {
  const f = fixture('pebble-lang=zh');
  f.sync('en'); f.sync('zh'); f.sync('en');
  assert.equal(f.document.documentElement.lang, 'en');
  assert(f.cookie().startsWith('pebble-lang=en;'));
  assert.equal(f.writes(), 3);
});

test('an already matching cookie does not need a request or rewrite', () => {
  const f = fixture('other=value; pebble-lang=en');
  f.sync('en');
  assert.equal(f.document.documentElement.lang, 'en');
  assert.equal(f.writes(), 0);
});
