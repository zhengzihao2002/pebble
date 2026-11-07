import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const source = buildSync({
  stdin: { contents: `
    export { searchSettings } from './src/components/settings/settingsSearch';
    export { isSettingTarget } from './src/components/settings/settingsTargets';
    export { en } from './src/lib/i18n/en';
    export { zh } from './src/lib/i18n/zh';
  `, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
}).outputFiles[0].text;
const compiled = { exports: {} };
vm.runInNewContext(source, { module: compiled, exports: compiled.exports, require: createRequire(import.meta.url), console });
const { searchSettings, isSettingTarget, en, zh } = compiled.exports;

test('individual settings stay hidden until a nonempty query', () => {
  for (const dictionary of [en, zh]) {
    assert.equal(searchSettings(dictionary, '').length, 0);
    assert.equal(searchSettings(dictionary, '   ').length, 0);
  }
});

test('specific controls and their options can be found in both interface languages', () => {
  for (const dictionary of [en, zh]) {
    for (const [query, id] of [['loading spinner', 'loadingStyle'], ['缓存', 'loadingStyle'], ['manual order', 'accountOrder'], ['字体', 'font'], ['card glow', 'cardGlow'], ['living background', 'ambientBackground']]) {
      assert.ok(searchSettings(dictionary, query).some((entry) => entry.id === id), `${query} must find ${id}`);
    }
  }
});

test('results explain the section and setting, and support words across fields', () => {
  const privacy = searchSettings(en, 'behavior privacy').find((entry) => entry.id === 'privacy');
  assert.ok(privacy);
  assert.equal(privacy.label, en.privacyMode.title);
  assert.equal(privacy.section, en.settingsSections.behavior);
  assert.equal(privacy.hint, en.privacyMode.hint);
  assert.equal(privacy.target, 'pb-set-privacy');
  assert.equal(searchSettings(zh, '字体')[0].label, zh.font.title);
});

test('sound events and safety locks address their own rows', () => {
  const expense = searchSettings(zh, 'expense saved').find((entry) => entry.id === 'sound-expenseSaved');
  const income = searchSettings(en, '收入').find((entry) => entry.id === 'sound-incomeSaved');
  const lock = searchSettings(en, 'delete transactions').find((entry) => entry.id === 'lock-deleteTransactions');
  assert.equal(expense.target, 'pb-set-sound-expense-saved');
  assert.equal(income.target, 'pb-set-sound-income-saved');
  assert.equal(lock.target, 'pb-set-lock-delete-transactions');
  assert.equal(isSettingTarget(expense.target), true);
  assert.equal(isSettingTarget(lock.target), true);
  assert.equal(isSettingTarget('unrecognised-hash'), false);
});

test('profile and security searches retain their existing dedicated destinations', () => {
  assert.equal(searchSettings(en, 'password').find((entry) => entry.id === 'security').href, '/account/security');
  assert.equal(searchSettings(zh, 'email').find((entry) => entry.id === 'profile').href, '/account/settings');
});

test('unrelated queries do not expand all settings', () => {
  assert.equal(searchSettings(en, 'zzzz-no-setting-zzzz').length, 0);
  const matches = searchSettings(en, 'Text size');
  assert.equal(matches[0].id, 'textSize');
  assert.equal(matches.filter((entry) => entry.id === 'textSize').length, 1);
});
