import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
function load(path) {
  const source = buildSync({ entryPoints: [path], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic' }).outputFiles[0].text;
  const compiled = { exports: {} };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, require });
  return compiled.exports;
}
const { SearchToolbar } = load('src/components/transactions/SearchToolbar.tsx');
const { ScheduleRules } = load('src/components/scheduled/ScheduleRules.tsx');
const props = { query: '', onQuery() {}, typeFilter: 'all', onTypeFilter() {}, accountFilter: '__all__', onAccountFilter() {}, accountOptions: [{ value: '__all__', label: 'All accounts' }], hasGhostAccounts: true };

test('ghost account visibility is an explicit unchecked checkbox by default', () => {
  const hidden = renderToStaticMarkup(createElement(SearchToolbar, props));
  assert.match(hidden, /type="checkbox"/);
  assert.match(hidden, /Show ghost accounts/);
  assert(!hidden.includes('checked=""'));
  const revealed = renderToStaticMarkup(createElement(SearchToolbar, { ...props, showGhostAccounts: true }));
  assert.match(revealed, /checked=""/);
});

const rule = { id: 'ghost-weekly', kind: 'expense', description: 'Private weekly plan', category: 'Travel', tag: null, accountId: 'ghost-account', paymentMethod: 'Ghost bank', amount: -120, grossAmount: null, frequency: 'weekly', startDate: '2026-11-01', endMode: 'never', endCount: null, endDate: null, status: 'active', materializedThrough: null };
const scheduleProps = { rules: [rule], today: '2026-11-17', busyId: null, onToggle() {}, onEdit() {}, onCharge() {}, chargedNote: null };

test('ghost schedules retain management controls and own amounts without monthly projections', () => {
  const ordinary = renderToStaticMarkup(createElement(ScheduleRules, scheduleProps));
  const ghost = renderToStaticMarkup(createElement(ScheduleRules, { ...scheduleProps, ghost: true }));
  assert.match(ghost, /Ghost schedules/);
  assert.match(ghost, /Private weekly plan/);
  assert.match(ghost, /120\.00/);
  assert.match(ghost, /pb-sched-ghost-rules-title/);
  assert.match(ghost, /Pause/);
  assert.match(ghost, /Edit/);
  assert.match(ghost, /Charge/);
  assert.match(ordinary, /520\.00/);
  assert(!ghost.includes('520.00'), 'No aggregate or per-rule derived monthly spending is projected for ghost schedules');
});
