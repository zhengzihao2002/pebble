const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildSync } = require('esbuild');

// Bundle only pure arithmetic; never import the database or server actions.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pebble-next-date-'));
const out = path.join(dir, 'helper.cjs');
buildSync({
  stdin: {
    contents: "export * from './src/lib/recurring/rescheduleNext'; export * from './src/lib/recurring/chargeNext';",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: out,
});
const { nextPaymentMark, planChargeNext } = require(out);
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));

const spec = { frequency: 'monthly', startDate: '2026-01-01', endMode: 'never', endCount: null, endDate: null };

test('an explicit edit brings Mar 1 back to Feb 1 without changing the monthly anchor', () => {
  const rule = { ...spec, status: 'active', materializedThrough: '2027-02-01' };
  assert.equal(planChargeNext(rule, '2026-11-06').occurrenceDate, '2027-03-01');
  const mark = nextPaymentMark(spec, '2027-02-01', '2026-11-06');
  assert.equal(mark, '2027-01-31');
  assert.equal(planChargeNext({ ...rule, materializedThrough: mark }, '2026-11-06').occurrenceDate, '2027-02-01');
  assert.equal(nextPaymentMark(spec, '2027-04-01', '2026-11-06'), '2027-03-31');
});

test('past, invalid and off-cadence dates are refused; end conditions stay enforced', () => {
  for (const date of ['2026-10-01', '2027-02-02', '2027-02-30', 'bad']) {
    assert.equal(nextPaymentMark(spec, date, '2026-11-06'), null);
  }
  assert.equal(nextPaymentMark({ ...spec, endMode: 'after', endCount: 14 }, '2027-03-01', '2026-11-06'), null);
  assert.equal(nextPaymentMark({ ...spec, endMode: 'on', endDate: '2027-02-28' }, '2027-03-01', '2026-11-06'), null);
  assert.equal(nextPaymentMark({ ...spec, frequency: 'once', startDate: '2027-02-01' }, '2027-02-01', '2026-11-06'), '2027-01-31');
});

test('repositioning respects clamped month ends, weekly cadence and future years', () => {
  const monthEnd = { ...spec, startDate: '2026-01-31' };
  assert.equal(nextPaymentMark(monthEnd, '2027-02-28', '2026-11-06'), '2027-02-27');
  assert.equal(nextPaymentMark(monthEnd, '2028-02-29', '2026-11-06'), '2028-02-28');
  assert.equal(nextPaymentMark(monthEnd, '2028-03-29', '2026-11-06'), null);
  assert.equal(nextPaymentMark({ ...spec, frequency: 'weekly' }, '2026-11-12', '2026-11-06'), '2026-11-11');
  assert.equal(nextPaymentMark({ ...spec, frequency: 'yearly' }, '2029-01-01', '2026-11-06'), '2028-12-31');
  assert.equal(nextPaymentMark(spec, '2026-11-01', '2026-11-01'), '2026-10-31');
});

test('advancing past January 1 keeps the monthly cadence and catch-up starts in February', () => {
  const rule = { ...spec, status: 'active', materializedThrough: '2026-12-01' };
  const today = '2026-11-23';
  const skip = planChargeNext(rule, today);
  assert.equal(skip.occurrenceDate, '2027-01-01');
  assert.equal(skip.nextAfter, '2027-02-01');
  const afterSkip = { ...rule, materializedThrough: skip.newMaterializedThrough };
  assert.equal(planChargeNext(afterSkip, '2027-01-01').occurrenceDate, '2027-02-01');

  const last = planChargeNext({ ...afterSkip, endMode: 'on', endDate: '2027-02-17' }, today);
  assert.equal(last.nextAfter, null);
  assert.equal(last.finishesRule, true);
  assert.equal(last.newMaterializedThrough, '2027-02-17');
});
